<?php
// usage: php run_in_app.php <laravel-root> <script.php>  - boots Laravel, then runs the script.
$root = $argv[1];
require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
require $argv[2];
