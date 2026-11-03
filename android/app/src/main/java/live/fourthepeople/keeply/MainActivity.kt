package live.fourthepeople.keeply

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.WindowManager
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import java.io.OutputStream
import kotlin.math.roundToInt

class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var content: FrameLayout
    private lateinit var navStrip: View
    private lateinit var web: WebView
    private lateinit var offline: View

    private var baseColor = 0
    private var webGone = false
    private var mainFrameFailed = false
    private var pageReady = false
    private var recording = false
    private var micRequest: PermissionRequest? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraPhoto: Uri? = null
    private val waiting = ArrayList<String>() // scripts to run once the page is up
    private val prefs by lazy { getSharedPreferences("keeply", MODE_PRIVATE) }

    // "Export my notes": the page hands a file across in pieces; it is written wherever the
    // person chooses in the system's save dialog.
    @Volatile private var ourPage = false
    @Volatile private var saveStatus = "idle" // idle | waiting | ready | cancelled | error
    private var saveStream: OutputStream? = null
    private var saveUri: Uri? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        baseColor = getColor(R.color.keeply_bg)
        applySecure(prefs.getBoolean(PREF_SECURE, true))
        buildViews()
        setContentView(root)
        goEdgeToEdge()
        setBarColors(baseColor, baseColor)
        setUpWebView()
        registerBack()

        val restored = savedInstanceState != null && web.restoreState(savedInstanceState) != null
        if (!restored) web.loadUrl(siteLink(intent) ?: Keeply.HOME)
        // A recreated activity still holds the old intent; don't share the same text twice.
        if (savedInstanceState == null) queueCommand(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val link = siteLink(intent)
        if (link != null) web.loadUrl(link) else queueCommand(intent)
    }

    // ---- Layout -----------------------------------------------------------------------------

    private fun buildViews() {
        web = WebView(this)
        offline = buildOfflineView()
        content = FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(offline, FrameLayout.LayoutParams(MATCH, MATCH))
        }
        navStrip = View(this)
        root = FrameLayout(this).apply {
            addView(content, FrameLayout.LayoutParams(MATCH, MATCH))
            addView(navStrip, FrameLayout.LayoutParams(MATCH, 0, Gravity.BOTTOM))
        }
    }

    private fun buildOfflineView(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(baseColor)
        isClickable = true
        visibility = View.GONE
        setPadding(dp(32), dp(32), dp(32), dp(32))
        addView(ImageView(context).apply { setImageResource(R.mipmap.ic_launcher) }, LinearLayout.LayoutParams(dp(96), dp(96)))
        addView(TextView(context).apply {
            setText(R.string.offline_title)
            textSize = 22f
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, dp(8))
        })
        addView(TextView(context).apply {
            setText(R.string.offline_body)
            textSize = 16f
            gravity = Gravity.CENTER
        })
        addView(Button(context).apply {
            setText(R.string.offline_retry)
            setOnClickListener { web.reload() }
        }, LinearLayout.LayoutParams(WRAP, WRAP).apply { topMargin = dp(24) })
    }

    /** Draw behind the status and navigation bars and colour them to match the page. */
    private fun goEdgeToEdge() {
        if (Build.VERSION.SDK_INT < 30) return // older phones: plain coloured bars, see setBarColors
        window.setDecorFitsSystemWindows(false)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.TRANSPARENT
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.TRANSPARENT
        window.isNavigationBarContrastEnforced = false
        root.setOnApplyWindowInsetsListener { _, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            content.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            navStrip.layoutParams = (navStrip.layoutParams as FrameLayout.LayoutParams).apply { height = bars.bottom }
            WindowInsets.CONSUMED
        }
    }

    private fun setBarColors(top: Int, bottom: Int) {
        root.setBackgroundColor(top)
        navStrip.setBackgroundColor(bottom)
        val lightTop = Color.luminance(top) > 0.5f
        val lightBottom = Color.luminance(bottom) > 0.5f
        if (Build.VERSION.SDK_INT >= 30) {
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(
                (if (lightTop) WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS else 0) or
                    (if (lightBottom) WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS else 0),
                light,
            )
        } else {
            @Suppress("DEPRECATION")
            run {
                window.statusBarColor = top
                window.navigationBarColor = bottom
                var flags = window.decorView.systemUiVisibility and
                    (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR).inv()
                if (lightTop) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                if (lightBottom) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                window.decorView.systemUiVisibility = flags
            }
        }
    }

    // ---- WebView ----------------------------------------------------------------------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        web.setBackgroundColor(baseColor)
        // Keep the page's process alive while the screen is off, so a long recording survives.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false) // target=_blank links open in place
            textZoom = (resources.configuration.fontScale * 100).roundToInt() // follow the phone's font size
            userAgentString = "$userAgentString KeeplyAndroid/${packageManager.getPackageInfo(packageName, 0).versionName}"
            safeBrowsingEnabled = true
            javaScriptCanOpenWindowsAutomatically = false
            setGeolocationEnabled(false)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(Bridge(), "KeeplyApp")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (Keeply.isOurs(request.url)) return false
            openOutside(request.url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            ourPage = Keeply.isOurs(Uri.parse(url ?: ""))
            abandonSave() // a new page means a save that was in progress is over
            pageReady = false
            mainFrameFailed = false
            onRecording(false) // a new page means any recording on the old one has ended
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) mainFrameFailed = true
        }

        override fun onPageFinished(view: WebView, url: String?) {
            offline.visibility = if (mainFrameFailed) View.VISIBLE else View.GONE
            if (mainFrameFailed) return
            view.evaluateJavascript(Scripts.SETUP, null)
            pageReady = true
            waiting.forEach { view.evaluateJavascript(it, null) }
            waiting.clear()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's process was killed or crashed. Start over rather than take the app down.
            webGone = true
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            recreate()
            return true
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                val mic = PermissionRequest.RESOURCE_AUDIO_CAPTURE
                when {
                    !Keeply.isOurs(request.origin) || mic !in request.resources -> request.deny()
                    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED ->
                        request.grant(arrayOf(mic))
                    else -> {
                        micRequest?.deny()
                        micRequest = request
                        val wanted = mutableListOf(Manifest.permission.RECORD_AUDIO)
                        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
                        requestPermissions(wanted.toTypedArray(), REQUEST_MIC)
                    }
                }
            }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (micRequest === request) micRequest = null
        }

        // A photo for a note: offer the camera alongside the gallery / files.
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            cameraPhoto = null

            val pick = params.createIntent()
            if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            val extras = ArrayList<Intent>()
            val wantsImages = params.acceptTypes.isEmpty() || params.acceptTypes.any { it.isBlank() || it.startsWith("image/") }
            if (wantsImages) cameraIntent()?.let { extras += it }

            val chooser = Intent.createChooser(pick, getString(R.string.add_photo))
                .putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toTypedArray())
            return try {
                startActivityForResult(chooser, REQUEST_FILE)
                true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }

    /** "Take photo": the camera saves into a file of ours, which every camera app may write. */
    private fun cameraIntent(): Intent? {
        val capture = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        @Suppress("DEPRECATION")
        val cameras = packageManager.queryIntentActivities(capture, 0)
        if (cameras.isEmpty()) return null
        val photo = CaptureProvider.newPhoto(this)
        val access = Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION
        cameras.forEach { grantUriPermission(it.activityInfo.packageName, photo, access) }
        cameraPhoto = photo
        return capture.putExtra(MediaStore.EXTRA_OUTPUT, photo).addFlags(access)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_SAVE) return finishChooser(resultCode, data)
        if (requestCode != REQUEST_FILE) return super.onActivityResult(requestCode, resultCode, data)
        val callback = fileCallback ?: return
        fileCallback = null
        val clip = data?.clipData
        val picked: Array<Uri>? = when {
            resultCode != RESULT_OK -> null
            clip != null && clip.itemCount > 0 -> Array(clip.itemCount) { clip.getItemAt(it).uri }
            data?.data != null -> arrayOf(data.data!!)
            else -> cameraPhoto?.takeIf { CaptureProvider.hasPhoto(this, it) }?.let { arrayOf(it) }
        }
        callback.onReceiveValue(picked)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode != REQUEST_MIC) return
        val request = micRequest ?: return
        micRequest = null
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            request.deny()
            if (!shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) {
                toast(getString(R.string.mic_off))
            }
        }
    }

    /**
     * window.KeeplyApp — called from the page, on a background thread. Every call is
     * ignored unless the page showing right now is Keeply's own.
     */
    private inner class Bridge {
        @JavascriptInterface
        fun barColors(top: String, bottom: String) = ours { setBarColors(color(top), color(bottom)) }

        @JavascriptInterface
        fun recording(active: Boolean) = ours { onRecording(active) }

        @JavascriptInterface
        fun toast(message: String) = ours { this@MainActivity.toast(message.take(200)) }

        // Export: saveBegin opens the save dialog; the page then polls saveState until "ready",
        // sends the file with saveChunk (base64 pieces), and finishes with saveEnd.
        @JavascriptInterface
        fun saveBegin(name: String, mime: String) = ours { beginSave(name, mime) }

        @JavascriptInterface
        fun saveState(): String = if (ourPage) saveStatus else "error"

        @JavascriptInterface
        fun saveChunk(base64: String): Boolean {
            val stream = saveStream
            if (!ourPage || saveStatus != "ready" || stream == null || base64.length > 2_000_000) return false
            return try {
                stream.write(Base64.decode(base64, Base64.DEFAULT))
                true
            } catch (e: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun saveEnd(): Boolean {
            val stream = saveStream
            if (!ourPage || stream == null) return false
            return try {
                stream.flush()
                stream.close()
                saveStream = null
                saveUri = null
                saveStatus = "idle"
                true
            } catch (e: Exception) {
                runOnUiThread { abandonSave() }
                false
            }
        }

        @JavascriptInterface
        fun saveCancel() = runOnUiThread { abandonSave() }

        // "Share" on a note: the phone's share sheet, with the note's words.
        @JavascriptInterface
        fun share(title: String, text: String) = ours {
            val send = Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_SUBJECT, title.take(300))
                .putExtra(Intent.EXTRA_TEXT, text.take(100_000))
            try {
                startActivity(Intent.createChooser(send, null))
            } catch (e: ActivityNotFoundException) {
                toast(getString(R.string.no_app))
            }
        }

        // "Block screenshots and hide Keeply in the recent-apps screen" (on by default).
        @JavascriptInterface
        fun isSecure(): Boolean = prefs.getBoolean(PREF_SECURE, true)

        @JavascriptInterface
        fun setSecure(on: Boolean) = ours {
            prefs.edit().putBoolean(PREF_SECURE, on).apply()
            applySecure(on)
        }
    }

    // ---- Saving a file for the page (Export my notes) ------------------------------------------

    private fun beginSave(name: String, mime: String) {
        abandonSave()
        val safeName = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(100).ifBlank { "Keeply-export.zip" }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(if (mime.matches(Regex("[a-z]+/[a-z0-9.+-]+"))) mime else "application/octet-stream")
            .putExtra(Intent.EXTRA_TITLE, safeName)
        saveStatus = "waiting"
        try {
            startActivityForResult(intent, REQUEST_SAVE)
        } catch (e: ActivityNotFoundException) {
            saveStatus = "error"
        }
    }

    private fun finishChooser(resultCode: Int, data: Intent?) {
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) {
            saveStatus = "cancelled"
            return
        }
        try {
            saveStream = contentResolver.openOutputStream(uri, "w")
            saveUri = uri
            saveStatus = if (saveStream != null) "ready" else "error"
        } catch (e: Exception) {
            saveStatus = "error"
        }
    }

    /** Close any open save; a half-written file is deleted. */
    private fun abandonSave() {
        val stream = saveStream
        val uri = saveUri
        saveStream = null
        saveUri = null
        if (stream != null) {
            runCatching { stream.close() }
            if (uri != null) runCatching { DocumentsContract.deleteDocument(contentResolver, uri) }
        }
        saveStatus = "idle"
    }

    private fun ours(block: () -> Unit) = runOnUiThread {
        if (!webGone && Keeply.isOurs(Uri.parse(web.url ?: ""))) block()
    }

    /** FLAG_SECURE: no screenshots or screen recording, a blank tile in recent apps, and
     *  (Android 17) the screen's text is kept out of the system's content capture. */
    private fun applySecure(on: Boolean) {
        if (on) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    // ---- Recording --------------------------------------------------------------------------

    private fun onRecording(active: Boolean) {
        if (active == recording) return
        recording = active
        val service = Intent(this, RecordingService::class.java)
        if (active) {
            try {
                startForegroundService(service)
            } catch (e: Exception) {
                // Not allowed from the background; the recording still runs while Keeply is open.
            }
        } else {
            stopService(service)
        }
    }

    // ---- Intents, back button, links --------------------------------------------------------

    private fun siteLink(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        return intent.data?.takeIf { Keeply.isOurs(it) }?.toString()
    }

    private fun queueCommand(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
                val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim().orEmpty()
                if (text.isNotEmpty() || subject.isNotEmpty()) runWhenReady(Scripts.share(subject, text))
            }
            RecordingService.ACTION_STOP -> runWhenReady(Scripts.STOP)
        }
    }

    private fun runWhenReady(script: String) {
        if (pageReady) web.evaluateJavascript(script, null) else waiting += script
    }

    private fun registerBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }
    }

    @Deprecated("Android 13+ uses the OnBackInvokedCallback registered in registerBack()")
    override fun onBackPressed() = goBack()

    /** Close the open note, dialog or menu first; leave the app only from the main list. */
    private fun goBack() {
        if (webGone) return finish()
        if (!pageReady || offline.visibility == View.VISIBLE) return leaveOrGoBack()
        web.evaluateJavascript(Scripts.BACK) { closed ->
            if (closed.isNullOrEmpty() || closed == "null" || closed == "\"\"") leaveOrGoBack()
        }
    }

    private fun leaveOrGoBack() {
        if (web.canGoBack()) web.goBack() else finish()
    }

    private fun openOutside(uri: Uri) {
        if (uri.scheme !in setOf("http", "https", "mailto", "tel", "sms")) return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            toast(getString(R.string.no_app))
        }
    }

    // ---- Lifecycle --------------------------------------------------------------------------

    override fun onResume() {
        super.onResume()
        if (!webGone) web.onResume()
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        if (!webGone && !recording) web.onPause() // never pause the page mid-recording
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!webGone) web.saveState(outState)
    }

    override fun onDestroy() {
        if (isFinishing) stopService(Intent(this, RecordingService::class.java))
        abandonSave()
        if (!webGone) web.destroy()
        super.onDestroy()
    }

    // ---- Helpers ----------------------------------------------------------------------------

    private fun color(css: String): Int = try {
        Color.parseColor(css)
    } catch (e: IllegalArgumentException) {
        baseColor
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

    private companion object {
        const val REQUEST_MIC = 1
        const val REQUEST_FILE = 2
        const val REQUEST_SAVE = 3
        const val PREF_SECURE = "secure"
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    }
}
