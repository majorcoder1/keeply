#!/usr/bin/env bash
# Rebuild the "before the update" world: old schema + a user with readable notes, photo and recording,
# then apply the new migration (what the updater does on the real server).
set -e
S="$(cd "$(dirname "$0")" && pwd)"
cd ~/keeply-dev/api
php $S/run_in_app.php ~/keeply-dev/api $S/wipe_files.php
php artisan migrate:fresh --force >/dev/null
php artisan migrate:rollback --step=1 --force >/dev/null
KP_S=$S/work php $S/run_in_app.php ~/keeply-dev/api $S/seed_legacy.php
php artisan migrate --force >/dev/null
echo "dev world reset"
