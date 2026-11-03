# Deploying 4thepeople Notes to cPanel

Target: a subdomain on your existing hosting, e.g. **notes.4thepeople.live** (recommended)
or a subfolder. These steps assume the single-domain setup where Laravel serves both the
API and the built PWA.

> **PHP version:** Laravel 13 requires **PHP 8.3+**. In cPanel → *MultiPHP Manager*, set the
> domain to PHP 8.3 (or 8.4). If your host only offers 8.2 or lower, tell me and I'll pin the
> project to a compatible Laravel version.

---

## 1. Build the frontend

On your machine:

```bash
cd web
npm run build
```

This produces `web/dist/`. Copy **everything inside** `web/dist/` into `api/public/`
(alongside Laravel's `index.php`). The PWA's `index.html`, service worker, and icons now
live in Laravel's public folder.

## 2. Add a catch-all so the PWA loads on every route

Already handled in `api/routes/web.php` — a fallback route returns the PWA's `index.html`
for any non-API path, so deep links and refreshes work.

## 3. Upload

Zip the `api/` folder (without `node_modules`; `vendor/` can be re-installed on the server
via SSH, or uploaded as-is). Upload and extract into your home directory, e.g.
`/home/USER/notes.4thepeople.live`.

**Point the subdomain's document root at `api/public`** (cPanel → *Domains* → set
*Document Root* to `.../notes.4thepeople.live/public`).

## 4. Configure environment

Copy `.env.example` to `.env` and set:

```
APP_NAME="4thepeople Notes"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://notes.4thepeople.live

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=your_cpanel_db
DB_USERNAME=your_cpanel_db_user
DB_PASSWORD=your_db_password

SESSION_DRIVER=database
FILESYSTEM_DISK=public
```

Create the MySQL DB + user in cPanel → *MySQL Databases*, then:

```bash
php artisan key:generate
php artisan migrate --force
php artisan storage:link
```

`storage:link` makes uploaded recordings under `storage/app/public` reachable at
`/storage/...`. On some cPanel setups symlinks are restricted — if audio won't play, tell me
and I'll switch recordings to be streamed through a Laravel route instead.

## 5. Permissions

```bash
chmod -R 775 storage bootstrap/cache
```

## 6. HTTPS is required

PWA install + microphone access only work over **HTTPS**. Enable AutoSSL / Let's Encrypt for
the subdomain in cPanel (it's free). Once live, visiting on a phone will offer
**"Add to Home Screen"** and install as **Keeply**.

---

## Updating a live site

On this host (shared, no SSH needed) updates ship as one self-deleting PHP file made by
`deploy/make_updater.py`. Upload it to `Keeply/api/public` and open its URL with the key; it backs up what
it replaces, adds new database columns (`php artisan migrate` equivalent), writes the files, removes retired
ones and deletes itself.

## Notes on encryption

Everything a person writes is encrypted on their device (see README). The server needs no API keys for
transcription or summaries any more; if an old `.env` still has `TRANSCRIBE_*` / `SUMMARIZE_*` lines they
can be deleted. Keep `APP_KEY` safe: it also protects the stored authenticator secrets.
