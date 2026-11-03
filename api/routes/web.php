<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// Voice recordings and note photos live in storage/app/public. The usual public/storage
// link (`php artisan storage:link`) isn't there on the shared host, so serve them here.
// If the link is ever made, Apache serves the files directly and this never runs.
Route::get('/storage/{path}', function (string $path) {
    abort_unless(preg_match('#^(recordings|images)/\d+/[A-Za-z0-9._-]+$#', $path) === 1, 404);
    $disk = Storage::disk('public');
    abort_unless($disk->exists($path), 404);

    // A file response supports byte ranges, so long recordings can be skipped through.
    return response()->file($disk->path($path), [
        'Cache-Control' => 'private, max-age=31536000, immutable',
    ]);
})->where('path', '.*');

// In production the built PWA lives in public/ (see DEPLOY.md). Serve its index.html
// for any non-API path so client-side routes and refreshes work. In local dev the
// frontend is served by Vite instead, so this only fires if you hit Laravel directly.
Route::get('/', fn () => spa_or_welcome());

Route::fallback(fn () => spa_or_welcome());

function spa_or_welcome()
{
    $index = public_path('index.html');

    return file_exists($index)
        ? response()->file($index)
        : view('welcome');
}
