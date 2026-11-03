<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Point the password-reset email at the single-page app instead of the
        // default server web route: …/?reset=TOKEN&email=EMAIL
        ResetPassword::createUrlUsing(function ($notifiable, string $token) {
            $base = rtrim(config('services.frontend.url'), '/');

            return $base.'/?reset='.$token.'&email='.urlencode($notifiable->getEmailForPasswordReset());
        });

        // Slow down password guessing and mail floods. Counted per email address rather
        // than per visitor address, because the hosting's front end hides visitor addresses.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(6)->by('login|'.strtolower((string) $request->input('email'))));
        // Logging in with the 24-digit number: per number, plus a ceiling over everyone because the
        // host's CDN hides visitor addresses.
        RateLimiter::for('login-number', fn (Request $request) => [
            Limit::perMinute(6)->by('ln|'.substr((string) $request->input('login_id'), 0, 64)),
            Limit::perMinute(120)->by('ln|all'),
        ]);
        RateLimiter::for('two-factor', fn (Request $request) => Limit::perMinute(10)->by('2fa|'.sha1((string) $request->input('challenge'))));
        RateLimiter::for('link-preview', fn (Request $request) => Limit::perMinute(40)->by('lp|'.$request->user()?->id));
        RateLimiter::for('mail', fn (Request $request) => Limit::perMinute(3)->by('mail|'.strtolower((string) $request->input('email'))));
    }
}
