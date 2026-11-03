# Keeply tests (run on this computer, never on the live server)

What they check: `crypto_test.mjs` (the encryption library), `api_test2.py` (two-factor, key storage and
the server's refusal of readable data), `e2e_legacy.mjs` / `e2e_fresh.mjs` / `e2e_layout.mjs` (the whole
web app in a headless browser, including locking a pre-update account's notes and scanning the server for
any readable text).

Setup (once):
- A test copy of the server: `~/keeply-dev/api` (copy of `../api` with its `vendor/`, a `.env` using
  sqlite at `database/test.sqlite`, `MAIL_MAILER=log`), then `php artisan serve --port=8000`.
- The web app built in `~/projects/keeply-dev/web` (copy `../web`, `npm ci`), dev server on port 5173 (or
  `vite preview` on 5174 and set `KP_BASE=http://127.0.0.1:5174`).
- `npm i puppeteer-core` in `~/keeply-dev/tools`; Brave at /usr/bin/brave-browser is the browser.
- Test media: `convert -size 800x600 gradient:orange-blue work/test.jpg` and
  `ffmpeg -f lavfi -i sine=frequency=300:duration=3 -c:a libopus -b:a 32k work/test.webm`.

Link previews: the second test server (`cd ~/keeply-dev/api/public && LINK_PREVIEW_ALLOW_PRIVATE=true php -S 127.0.0.1:8002 ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php`) may reach the local test
website; `api_test_links.py` and `e2e_lists.mjs` (`KP_BASE` = a preview proxying /api to :8002) use it. The normal server on :8000 refuses private addresses.

Run: `bash reset_dev.sh` (rebuilds the pre-update world), then e.g. `node e2e_legacy.mjs`.
The scripts use absolute paths such as ~/keeply-dev/api; edit `e2e_lib.mjs` if yours differ.
