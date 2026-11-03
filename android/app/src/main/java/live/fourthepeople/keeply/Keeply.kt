package live.fourthepeople.keeply

import android.net.Uri

/** The site this app wraps. Everything the web app ships shows up here with no new release. */
object Keeply {
    const val HOST = "keeply.4thepeople.live"
    const val HOME = "https://$HOST/"

    fun isOurs(uri: Uri?): Boolean =
        uri != null && uri.scheme == "https" && HOST.equals(uri.host, ignoreCase = true)
}
