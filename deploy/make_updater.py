"""Builds keeply-update.php: one file that installs a Keeply release on the shared host.

  python3 make_updater.py <web-dist-folder> <apk> <out.php> [key]

It packs the server code from ../api, the built website, and the Android app, and picks a
fresh random key for the URL (written next to the output as <out>.key)."""
import base64, json, os, secrets, sys

dist, apk, out = sys.argv[1:4]
fixed_key = sys.argv[4] if len(sys.argv) > 4 else None  # reuse a link that was already shared
here = os.path.dirname(os.path.abspath(__file__))
api = os.path.join(os.path.dirname(here), 'api')

SERVER_FILES = [
    'app/Http/Controllers/AuthController.php',
    'app/Http/Controllers/AvatarController.php',
    'app/Http/Controllers/FolderController.php',
    'app/Http/Controllers/ImageController.php',
    'app/Http/Controllers/KeyController.php',
    'app/Http/Controllers/LinkPreviewController.php',
    'app/Http/Controllers/NoteController.php',
    'app/Http/Controllers/RecordingController.php',
    'app/Http/Controllers/TwoFactorController.php',
    'app/Http/Middleware/EnsureTwoFactor.php',
    'app/Models/User.php',
    'app/Providers/AppServiceProvider.php',
    'app/Support/Envelope.php',
    'app/Support/Totp.php',
    'config/services.php',
    'routes/api.php',
    'database/migrations/2026_10_29_000001_add_encryption_and_two_factor_to_users_table.php',
    'database/migrations/2026_11_03_000001_add_avatar_to_users_table.php',
    'database/migrations/2026_11_04_000001_add_number_login_to_users_table.php',
]
RETIRE = [
    'app/Http/Controllers/TranscriptionController.php',  # voice-to-text: removed
    'app/Http/Controllers/SummaryController.php',        # summaries: removed
]

def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()

files = {rel: b64(os.path.join(api, rel)) for rel in SERVER_FILES}
for root, _, names in os.walk(dist):
    for n in names:
        full = os.path.join(root, n)
        files['public/' + os.path.relpath(full, dist).replace(os.sep, '/')] = b64(full)
files['public/downloads/Keeply.apk'] = b64(apk)

key = fixed_key or secrets.token_hex(12)
php = open(os.path.join(here, 'updater_template.php')).read()
php = php.replace('__KEY__', key).replace('__FILES__', json.dumps(files)).replace('__RETIRE__', json.dumps(RETIRE))
open(out, 'w').write(php)
open(out + '.key', 'w').write(key)
print(f'{len(files)} files, key {key}')
