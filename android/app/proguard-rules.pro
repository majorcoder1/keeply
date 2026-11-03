# The page calls these by name through window.KeeplyApp.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
