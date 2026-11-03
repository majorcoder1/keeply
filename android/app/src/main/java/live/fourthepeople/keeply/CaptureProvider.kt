package live.fourthepeople.keeply

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * Gives the camera app somewhere to save a photo taken for a note: a file in Keeply's
 * cache, shared through a content:// address. (A tiny stand-in for androidx FileProvider,
 * so the app keeps its no-dependencies build.)
 */
class CaptureProvider : ContentProvider() {

    override fun onCreate() = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(fileFor(context!!, uri), ParcelFileDescriptor.parseMode(mode))

    override fun getType(uri: Uri) = "image/jpeg"

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val file = fileFor(context!!, uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(cols, 1).apply {
            addRow(cols.map { if (it == OpenableColumns.SIZE) file.length() else file.name })
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0

    companion object {
        private const val AUTHORITY = "live.fourthepeople.keeply.capture"
        private val SAFE_NAME = Regex("[A-Za-z0-9_.-]+")

        private fun dir(context: Context) = File(context.cacheDir, "captures").apply { mkdirs() }

        private fun fileFor(context: Context, uri: Uri): File {
            val name = uri.lastPathSegment ?: throw IllegalArgumentException("no file")
            require(SAFE_NAME.matches(name)) { "bad name" }
            return File(dir(context), name)
        }

        /** A fresh, empty file for the next photo; older ones (over a day) are cleared out. */
        fun newPhoto(context: Context): Uri {
            val dayAgo = System.currentTimeMillis() - 24 * 60 * 60 * 1000
            dir(context).listFiles()?.filter { it.lastModified() < dayAgo }?.forEach { it.delete() }
            val name = "photo_${System.currentTimeMillis()}.jpg"
            File(dir(context), name).createNewFile()
            return Uri.parse("content://$AUTHORITY/$name")
        }

        fun hasPhoto(context: Context, uri: Uri): Boolean =
            runCatching { fileFor(context, uri).length() > 0 }.getOrDefault(false)
    }
}
