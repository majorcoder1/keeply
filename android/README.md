# Keeply for Android

The phone app for **keeply.4thepeople.live**. It opens the live site full-screen, so
anything you change on the website shows up in the app with no new release.

What the app adds on top of the website:

- **Voice notes work.** Keeply's own `.htaccess` (api/public) overrides the main 4thepeople.live
  `Permissions-Policy: microphone=()` and Content-Security-Policy for the Keeply site, so the page itself
  is allowed to use the microphone. The app grants it to Keeply's origin only.
- **Records with the screen off.** While a voice note is recording, a notification keeps
  the recording going when the phone locks, with a **Stop** button right on it.
- **Photos.** The + menu's Image (and the photo button in a note) offers the camera
  alongside the gallery (`CaptureProvider.kt` gives the camera a file to save into).
- **Share into Keeply.** Share text from any app (Bible app, browser, messages) and
  choose Keeply: it opens a new note with that text in it.
- **Export saves to the phone.** A page can't write files, so "Export my notes" passes the .zip across the
  bridge in pieces (`saveBegin` / `saveState` / `saveChunk` / `saveEnd`) and the app writes it to a file the
  person picks in the system save dialog (`ACTION_CREATE_DOCUMENT`).
- **Share from a note.** The note's Share button uses the phone's share sheet (`KeeplyApp.share`).
- **Back button closes things.** It closes the open note (saving it), dialog, menu or
  sidebar, returns from a folder to All notes, and only leaves the app from the main list.
- **Private by default (Android 17 / API 37).** Built with `targetSdk 37`. Screenshots are blocked and the
  app is blank in the recent-apps screen (`FLAG_SECURE`, switchable in Settings), nothing is included in phone
  backups or device transfers, plain-HTTP is refused by a network-security config, and the page's bridge only
  answers while Keeply's own pages are showing.
- **Matches the page.** The status and navigation bars follow the page's light or dark
  colours, the text follows the phone's font size, and the icon is the Keeply bulb
  (including Android 13's themed icons).

## Build

Gradle is not on PATH. From this folder:

```bash
bash build.sh
```

That builds (AGP 9.4.1, Gradle 9.7.1, offline) the signed release APK and copies it to `../Keeply-<version>.apk`.

## Signing key — do not lose it

The release key is **outside the project** at `~/.keeply-keys/keeply-release.jks`
(alias `keeply`; the passwords are kept private), referenced by `keystore.properties`. Every update
must be signed with this same key or the phone will refuse to install it over the top.
Keep a copy somewhere safe. If `keystore.properties` is missing, the release build is
left unsigned.

## Releasing an update

Bump `versionCode` (and `versionName`) in `app/build.gradle.kts`, then `bash build.sh`.
Most changes never need this: they go on the website.

## Layout

| File | Job |
| --- | --- |
| `MainActivity.kt` | The WebView, bars, back button, microphone permission, share and links |
| `Scripts.kt` | The small scripts run in the page (bar colours, back, share, stop) |
| `RecordingService.kt` | The notification that keeps a recording alive with the screen off |
| `CaptureProvider.kt` | Somewhere for the camera app to save a photo taken for a note |
