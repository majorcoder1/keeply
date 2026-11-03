<?php
// Keeply one-time updater.
//
// Upload this file into  Keeply / api / public  and open
//   https://keeply.4thepeople.live/<this file's name>?key=__KEY__
// It backs up every file it replaces, adds the new database columns, writes the new files,
// removes the retired ones, clears Laravel's caches and deletes itself. It says what it is
// doing as it goes, and saves a copy of that (passwords and addresses blanked out) in
// keeply-update-report.txt next to it, so a problem can be diagnosed without guessing.
//
//   ...?key=__KEY__&check=1   only looks around and reports; changes nothing.

declare(strict_types=1);

@ini_set('display_errors', '1');
error_reporting(E_ALL);
@set_time_limit(300);
@ini_set('memory_limit', '512M');
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

if (! hash_equals('__KEY__', (string) ($_GET['key'] ?? ''))) {
    http_response_code(404);
    exit("Not found.\n");
}

$api = dirname(__DIR__);
$checkOnly = ($_GET['check'] ?? '') === '1';
$lines = [];
$secrets = [];

// Anything that looks like a password, user, host, database name or key in .env is blanked
// out of what is shown and saved.
if (is_file("$api/.env")) {
    foreach (file("$api/.env", FILE_IGNORE_NEW_LINES) as $row) {
        if (preg_match('/^\s*(DB_HOST|DB_USERNAME|DB_PASSWORD|DB_DATABASE|DB_URL|APP_KEY|[A-Z_]*(PASSWORD|SECRET|TOKEN))\s*=\s*(.*)$/', $row, $m)) {
            $v = trim($m[3], " \t\"'");
            if (strlen($v) >= 3) {
                $secrets[] = $v;
            }
        }
    }
}
usort($secrets, fn ($a, $b) => strlen($b) <=> strlen($a));

function say(string $text): void
{
    global $lines;
    $lines[] = $text;
    echo $text."\n";
    @ob_flush();
    @flush();
}

function save_report(): void
{
    global $lines, $secrets;
    $text = str_replace($secrets, '***', implode("\n", $lines)."\n");
    @file_put_contents(__DIR__.'/keeply-update-report.txt', "Keeply update report, ".date('Y-m-d H:i:s T')."\n\n".$text);
}

function stop(string $why): never
{
    global $secrets;
    say('');
    say('STOPPED: '.str_replace($secrets, '***', $why));
    save_report();
    exit;
}

register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        say('');
        say('FATAL ERROR: '.$e['message'].' ('.basename($e['file']).':'.$e['line'].')');
        save_report();
    }
});

say('Keeply updater. PHP '.PHP_VERSION.' ('.PHP_SAPI.'), '.($checkOnly ? 'CHECK ONLY, nothing will be changed' : 'installing'));

// ---- looking around ----------------------------------------------------------------------------
$here = basename(__DIR__);
$problems = [];
foreach (['artisan' => 'file', 'app' => 'dir', 'vendor' => 'dir', '.env' => 'file', 'database/migrations' => 'dir', 'bootstrap/cache' => 'dir', 'storage/app' => 'dir'] as $rel => $kind) {
    $ok = $kind === 'dir' ? is_dir("$api/$rel") : is_file("$api/$rel");
    if (! $ok) {
        $problems[] = "missing $kind: $rel";
    }
}
if ($here !== 'public') {
    $problems[] = "this file is in a folder called \"$here\"; it has to be in the folder called \"public\" inside Keeply / api";
}
foreach (['api' => $api, 'api/public' => __DIR__, 'api/app' => "$api/app", 'api/database/migrations' => "$api/database/migrations", 'api/storage/app' => "$api/storage/app"] as $name => $dir) {
    if (is_dir($dir) && ! is_writable($dir)) {
        $problems[] = "$name is not writable";
    }
}
say('Folder: '.($here === 'public' ? 'api/public (right)' : $here.' (WRONG)'));
say('Checks: '.($problems ? 'PROBLEMS: '.implode('; ', $problems) : 'all good'));
if ($problems) {
    stop('This is not the Keeply api/public folder, or something needed is missing. Nothing was changed.');
}

$files = json_decode(<<<'JSON'
__FILES__
JSON, true);
$retire = json_decode(<<<'JSON'
__RETIRE__
JSON, true);
if (! is_array($files) || ! $files) {
    stop('The update data inside this file is damaged (upload it again). Nothing was changed.');
}
say('Update data: '.count($files).' files, '.round(strlen(json_encode($files)) / 1048576, 1).' MB');

// ---- the database --------------------------------------------------------------------------------
$env = [];
foreach (file("$api/.env", FILE_IGNORE_NEW_LINES) as $row) {
    if (preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/', $row, $m)) {
        $env[$m[1]] = trim($m[2], " \t\"'");
    }
}
$driver = $env['DB_CONNECTION'] ?? 'mysql';
say('Database type: '.$driver);

$columns = [
    'key_salt' => ['VARCHAR(64) NULL', 'varchar(64) null'],
    'key_check' => ['TEXT NULL', 'text null'],
    'key_version' => ['SMALLINT UNSIGNED NULL', 'integer null'],
    'two_factor_secret' => ['TEXT NULL', 'text null'],
    'two_factor_confirmed_at' => ['TIMESTAMP NULL DEFAULT NULL', 'datetime null'],
    'two_factor_recovery_codes' => ['TEXT NULL', 'text null'],
    'two_factor_last_step' => ['BIGINT UNSIGNED NULL', 'integer null'],
    'avatar' => ['VARCHAR(255) NULL', 'varchar(255) null'],
    'number_id' => ['VARCHAR(64) NULL', 'varchar(64) null'],
    'number_auth' => ['VARCHAR(64) NULL', 'varchar(64) null'],
];

// Plain database access (no Laravel), used to look at the users table and as the backup way in.
function open_pdo(array $env, string $api, string $driver): PDO
{
    if ($driver === 'sqlite') {
        $path = $env['DB_DATABASE'] ?? '';
        $path = ($path !== '' && $path[0] !== '/') ? "$api/$path" : ($path ?: "$api/database/database.sqlite");

        return new PDO('sqlite:'.$path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    }
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $env['DB_HOST'] ?? '127.0.0.1', $env['DB_PORT'] ?? '3306', $env['DB_DATABASE'] ?? '');

    return new PDO($dsn, $env['DB_USERNAME'] ?? '', $env['DB_PASSWORD'] ?? '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
}

function existing_columns(PDO $pdo, string $driver): array
{
    if ($driver === 'sqlite') {
        return array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    }

    return array_column($pdo->query('SHOW COLUMNS FROM `users`')->fetchAll(PDO::FETCH_ASSOC), 'Field');
}

try {
    $pdo = open_pdo($env, $api, $driver);
    $have = existing_columns($pdo, $driver);
    $missing = array_values(array_diff(array_keys($columns), $have));
    say('Users table: found ('.count($have).' columns). New columns still to add: '.($missing ? implode(', ', $missing) : 'none (already done)'));
} catch (Throwable $e) {
    $pdo = null;
    $missing = array_keys($columns);
    say('Could not look at the database directly: '.str_replace($secrets, '***', $e->getMessage()));
}

if ($checkOnly) {
    say('');
    say('Check finished. Nothing was changed. Open the link again without &check=1 to install.');
    save_report();
    exit;
}

$stamp = date('Ymd-His');
$backup = "$api/storage/app/update-backup-$stamp";
$backedUp = 0;

function backup_file(string $path, string $api, string $backup, int &$count): void
{
    if (! is_file($path)) {
        return;
    }
    $copy = $backup.'/'.ltrim(substr($path, strlen($api)), '/');
    @mkdir(dirname($copy), 0775, true);
    if (@copy($path, $copy)) {
        $count++;
    }
}

function put_file(string $dest, string $data, string $label): ?string
{
    if (! is_dir(dirname($dest)) && ! @mkdir(dirname($dest), 0775, true)) {
        return "couldn't create the folder for $label";
    }
    if (@file_put_contents($dest, $data) === false) {
        return "couldn't write $label";
    }

    return sha1_file($dest) === sha1($data) ? null : "$label did not save correctly";
}

// A copy of an SQLite database file first (with MySQL the changes only add empty columns).
if ($driver === 'sqlite' && $pdo) {
    $path = $env['DB_DATABASE'] ?? '';
    $path = ($path !== '' && $path[0] !== '/') ? "$api/$path" : $path;
    if ($path && is_file($path)) {
        @mkdir($backup, 0775, true);
        @copy($path, "$backup/database.sqlite");
        say('Database file copied to the backup folder.');
    }
}

// Write the migration files first.
$migrationRels = [];
foreach ($files as $rel => $b64) {
    if (! str_starts_with($rel, 'database/migrations/')) {
        continue;
    }
    if ($err = put_file("$api/$rel", base64_decode($b64, true), $rel)) {
        stop("Couldn't prepare the database step: $err.");
    }
    $migrationRels[] = $rel;
    unset($files[$rel]);
}
foreach (['config.php', 'routes-v7.php', 'routes.php', 'events.php'] as $cache) {
    @unlink("$api/bootstrap/cache/$cache");
}

// Way 1: run just our own migration files through Laravel. They check for each column first,
// so running them again is harmless, and they don't depend on the host's record of old migrations.
// Way 2 (if Laravel can't start from here): add the same columns with plain SQL.
$dbDone = false;
if ($missing) {
    try {
        chdir($api);
        if (! is_file("$api/vendor/autoload.php")) {
            throw new RuntimeException('vendor/autoload.php is missing');
        }
        require_once "$api/vendor/autoload.php";
        $app = require "$api/bootstrap/app.php";
        $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        foreach ($migrationRels as $rel) {
            $migration = require "$api/$rel";
            $migration->up();
        }
        $dbDone = true;
        say('Database: new columns added (through Laravel).');
    } catch (Throwable $e) {
        say('Laravel could not do the database step ('.str_replace($secrets, '***', $e->getMessage()).'). Trying plain SQL instead.');
    }
    if (! $dbDone && $pdo) {
        try {
            $have = existing_columns($pdo, $driver);
            foreach ($columns as $name => $def) {
                if (! in_array($name, $have, true)) {
                    $pdo->exec('ALTER TABLE users ADD COLUMN '.($driver === 'sqlite' ? $name.' '.$def[1] : '`'.$name.'` '.$def[0]));
                }
            }
            try {
                $pdo->exec('CREATE UNIQUE INDEX users_number_id_unique ON users (number_id)');
            } catch (Throwable $e) {
                // already there
            }
            $dbDone = true;
            say('Database: new columns added (plain SQL).');
        } catch (Throwable $e) {
            stop('The database step failed, so no code was changed and the site still works as before. Reason: '.str_replace($secrets, '***', $e->getMessage()));
        }
    }
    if (! $dbDone) {
        stop('The database could not be reached from this page, so no code was changed. The site still works as before.');
    }
    // Check the result, so we never install code that needs columns that are not there.
    if ($pdo) {
        $stillMissing = array_diff(array_keys($columns), existing_columns($pdo, $driver));
        if ($stillMissing) {
            stop('These columns are still missing after the database step: '.implode(', ', $stillMissing).'. No code was changed.');
        }
        say('Database: all new columns confirmed.');
    }
} else {
    say('Database: nothing to add.');
}

// ---- the files ---------------------------------------------------------------------------------------
$written = 0;
foreach ($files as $rel => $b64) {
    $data = base64_decode($b64, true);
    if ($data === false) {
        stop("The data for $rel is damaged. $written files were written; old copies are in $backup");
    }
    backup_file("$api/$rel", $api, $backup, $backedUp);
    if ($err = put_file("$api/$rel", $data, $rel)) {
        stop("$err. $written files were written; old copies are in $backup");
    }
    $written++;
}
say('Files written: '.($written + count($migrationRels)));

$retired = 0;
foreach ($retire as $rel) {
    $path = "$api/$rel";
    if (is_file($path)) {
        backup_file($path, $api, $backup, $backedUp);
        if (@unlink($path)) {
            $retired++;
        }
    }
}
say("Retired files removed: $retired");
say("Old copies backed up: $backedUp (in storage/app/update-backup-$stamp)");

foreach (['config.php', 'routes-v7.php', 'routes.php', 'events.php'] as $cache) {
    @unlink("$api/bootstrap/cache/$cache");
}
if (function_exists('opcache_reset')) {
    @opcache_reset();
}

say('');
say('DONE. Keeply update installed.');
$gone = @unlink(__FILE__);
say($gone ? 'This updater has deleted itself.' : 'Please delete '.basename(__FILE__).' from the public folder.');
say('Next: open https://keeply.4thepeople.live and tap Refresh on the update banner.');
say('If you ever added an AI key to .env (lines starting TRANSCRIBE_ or SUMMARIZE_), you can delete those lines now.');
save_report();
