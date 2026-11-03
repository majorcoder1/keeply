<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\AvatarController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\FolderController;
use App\Http\Controllers\ImageController;
use App\Http\Controllers\KeyController;
use App\Http\Controllers\LinkPreviewController;
use App\Http\Controllers\NoteController;
use App\Http\Controllers\RecordingController;
use App\Http\Controllers\TwoFactorController;
use App\Http\Middleware\EnsureTwoFactor;
use Illuminate\Support\Facades\Route;

// ---- Public auth ----
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/login/number', [AuthController::class, 'loginWithNumber'])->middleware('throttle:login-number');
Route::post('/two-factor/challenge', [TwoFactorController::class, 'challenge'])->middleware('throttle:two-factor');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:mail');
Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:mail');

// ---- Authenticated (Bearer token via Sanctum) ----
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Turning on two-factor is the one thing a signed-in person can do before it is on.
    Route::post('/two-factor/setup', [TwoFactorController::class, 'setup']);
    Route::post('/two-factor/confirm', [TwoFactorController::class, 'confirm']);

    // Everything below needs two-factor to be on.
    Route::middleware(EnsureTwoFactor::class)->group(function () {
        Route::post('/two-factor/recovery-codes', [TwoFactorController::class, 'recoveryCodes']);
        Route::post('/password', [AuthController::class, 'changePassword']);
        Route::post('/feedback', [FeedbackController::class, 'send']);

        // The server's side of end-to-end encryption: a salt and a check value, nothing more.
        Route::post('/key', [KeyController::class, 'store']);
        Route::put('/key/number', [KeyController::class, 'number']);
        Route::post('/key/reset', [KeyController::class, 'reset']);

        Route::apiResource('folders', FolderController::class)->except(['show']);
        Route::apiResource('notes', NoteController::class)->except(['show']);

        Route::get('/recordings', [RecordingController::class, 'index']);
        Route::post('/recordings', [RecordingController::class, 'store']);
        Route::delete('/recordings/{recording}', [RecordingController::class, 'destroy']);

        Route::post('/images', [ImageController::class, 'store']);

        // Link previews (only used when the person turns the setting on). POST, so the address
        // stays out of the host's access logs.
        Route::post('/link-preview', [LinkPreviewController::class, 'show'])->middleware('throttle:link-preview');

        // The profile picture (a locked image uploaded through /images; this just remembers which).
        Route::put('/avatar', [AvatarController::class, 'update']);
        Route::delete('/avatar', [AvatarController::class, 'destroy']);
    });
});
