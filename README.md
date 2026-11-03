# 4thepeople Notes / Keeply

A self-hosted, Google Keep–style notes app with voice recording, where everything you write is encrypted on your own device.

- **Website / full name:** 4thepeople Notes
- **Installed app name (phone/desktop home screen):** Keeply
- **Platforms:** installable PWA — works on Windows, Mac, iOS, Android, and any browser. (App Store / Google Play wrappers are a planned Phase 2 via Capacitor.)

## Download the Android app

The ready-to-install app is on the **[Releases](../../releases)** page: `Keeply-1.2.2.apk` (Android 8 or newer,
built for Android 17). It opens Keeply full-screen and needs the Keeply server (keeply.4thepeople.live) to sign in and sync.

- This file is the developer's own build, signed with the developer's own key. The copy on F-Droid is signed by
  F-Droid, so one can't be installed over the other: remove one app before installing the other (your notes are on
  the server and come back when you sign in).
- Check the download with the SHA-256 listed on the release page.

## Structure

```
Keeply/
├─ api/   → Laravel 13 backend (auth, two-factor, notes, folders, recordings). Deploys to the host.
└─ web/   → React + Vite PWA frontend. Builds into api/public for single-domain hosting.
```

## Features

- Email/password **sign-up + login**, then **two-factor** (authenticator-app codes + recovery codes) at every login
- **End-to-end encryption.** Notes, labels, folder names, photos, voice recordings and their titles are
  encrypted in the browser/app with AES-256-GCM before they are uploaded. The key is a **24-digit code made
  on the device** and never sent to the server (PBKDF2-SHA256, 600,000 rounds, non-extractable WebCrypto key).
  The server stores only a random salt and a key-check value, and refuses any readable note, photo or recording.
  Each device asks for the 24 digits once. The same 24 digits can also **log you in** (instead of email and
  password; the authenticator code is still asked for). A lost number cannot be recovered (the only way out is
  erase and start over).
- **Guest mode** — notes stay on the one device (no sync, no encryption needed)
- **Folders** — Record, Work, Personal seeded; users can add their own
- **Notes** — title, rich text, **checklists** (new items top/bottom, completed items group), colors, pin, labels, photos, search (search runs on the device, on decrypted text)
- **Settings > Notes and lists** (per device): add new items to the bottom, move checked items to the bottom, **rich link previews**
  (OFF by default: the server fetches the page, so it sees the address — never the note; SSRF-hardened `POST /api/link-preview`),
  and **sharing** (a Share button: the phone's share sheet / browser share / copy; the text is sent by the person's choice)
- **Voice notes** — recorded in the browser/app and saved as locked audio. There is deliberately **no
  transcription or summaries**: they would mean sending the audio elsewhere to be read.
- **Export my notes** (Settings > Your data): unlocks everything on the device and saves one .zip (a text file per
  note, photos, recordings, notes.json). The zip is NOT locked; the UI and README inside say so. In the Android
  app the zip is handed to the app in pieces and saved where the person picks (system save dialog).
- A security pop-up after sign-in and a **Security & privacy** page explain all of this to users.

## Local development

Two terminals:

```bash
# 1) Backend (http://localhost:8000)
cd api
php artisan serve

# 2) Frontend (http://localhost:5173, proxies /api to :8000)
cd web
npm run dev
```

Open http://localhost:5173.

## Production build (single domain on cPanel)

```bash
cd web
npm run build          # outputs to web/dist
```

Then copy `web/dist/*` into `api/public/` (see DEPLOY.md for the full cPanel walkthrough).
The Laravel app serves both the API (`/api/*`) and the built PWA (everything else).
