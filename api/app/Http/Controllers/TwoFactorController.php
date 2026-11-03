<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Totp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

// Two-factor sign-in with an authenticator app (6-digit codes), plus one-time recovery
// codes for when the phone is lost.
class TwoFactorController extends Controller
{
    private const CHALLENGE_SECONDS = 300;
    private const MAX_ATTEMPTS = 5;
    private const LOCK_SECONDS = 300;
    private const RECOVERY_CODES = 8;

    // Step 1 of turning it on: make a secret and hand it over to be scanned.
    public function setup(Request $request)
    {
        $user = $request->user();
        if ($user->two_factor_confirmed_at) {
            return response()->json(['message' => 'Two-factor sign-in is already on.'], 409);
        }

        $secret = Totp::newSecret();
        $user->forceFill(['two_factor_secret' => Crypt::encryptString($secret)])->save();

        return response()->json([
            'secret' => $secret,
            'otpauth' => Totp::uri($secret, $user->email),
        ]);
    }

    // Step 2: prove the app shows the right codes, then turn it on and show the recovery codes once.
    public function confirm(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:16']]);
        $user = $request->user();

        if ($user->two_factor_confirmed_at) {
            return response()->json(['message' => 'Two-factor sign-in is already on.'], 409);
        }
        if (! $user->two_factor_secret) {
            return response()->json(['message' => 'Start the setup first.'], 422);
        }

        $this->guardAttempts($user);
        $step = Totp::verify(Crypt::decryptString($user->two_factor_secret), $data['code']);
        if ($step === null) {
            $this->failAttempt($user);
        }
        RateLimiter::clear($this->limiterKey($user));

        $codes = $this->newRecoveryCodes();
        $user->forceFill([
            'two_factor_confirmed_at' => now(),
            'two_factor_last_step' => $step,
            'two_factor_recovery_codes' => json_encode(array_map([$this, 'hashCode'], $codes)),
        ])->save();

        return response()->json(['recovery_codes' => $codes, 'user' => $user->fresh()]);
    }

    // The second half of signing in: the code (or a recovery code) for the challenge that
    // /login handed out after the password was right. Only now is a token issued.
    public function challenge(Request $request)
    {
        $data = $request->validate([
            'challenge' => ['required', 'string', 'max:2000'],
            'code' => ['nullable', 'string', 'max:16'],
            'recovery_code' => ['nullable', 'string', 'max:32'],
        ]);

        $payload = self::openChallenge($data['challenge']);
        $user = $payload ? User::find($payload['u']) : null;
        if (! $user || ! $user->two_factor_confirmed_at || Cache::has('2fa-used:'.$payload['n'])) {
            throw ValidationException::withMessages([
                'code' => ['That sign-in expired. Go back and log in again.'],
            ]);
        }

        $this->guardAttempts($user);

        $ok = false;
        if (! empty($data['code'])) {
            $step = Totp::verify(
                Crypt::decryptString($user->two_factor_secret),
                $data['code'],
                (int) $user->two_factor_last_step
            );
            if ($step !== null) {
                $user->forceFill(['two_factor_last_step' => $step])->save();
                $ok = true;
            }
        } elseif (! empty($data['recovery_code'])) {
            $ok = $this->useRecoveryCode($user, $data['recovery_code']);
        } else {
            throw ValidationException::withMessages(['code' => ['Enter the 6-digit code from your authenticator app.']]);
        }

        if (! $ok) {
            $this->failAttempt($user);
        }

        RateLimiter::clear($this->limiterKey($user));
        Cache::put('2fa-used:'.$payload['n'], true, self::CHALLENGE_SECONDS);

        return response()->json([
            'user' => $user->fresh(),
            'token' => $user->createToken('keeply')->plainTextToken,
        ]);
    }

    // New recovery codes (the old ones stop working). Needs a current code from the app.
    public function recoveryCodes(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:16']]);
        $user = $request->user();

        $this->guardAttempts($user);
        $step = Totp::verify(
            Crypt::decryptString($user->two_factor_secret),
            $data['code'],
            (int) $user->two_factor_last_step
        );
        if ($step === null) {
            $this->failAttempt($user);
        }
        RateLimiter::clear($this->limiterKey($user));

        $codes = $this->newRecoveryCodes();
        $user->forceFill([
            'two_factor_last_step' => $step,
            'two_factor_recovery_codes' => json_encode(array_map([$this, 'hashCode'], $codes)),
        ])->save();

        return response()->json(['recovery_codes' => $codes]);
    }

    // A short-lived, tamper-proof note saying "this person's password was right".
    public static function makeChallenge(User $user): string
    {
        return Crypt::encryptString(json_encode([
            'u' => $user->id,
            'e' => time() + self::CHALLENGE_SECONDS,
            'n' => bin2hex(random_bytes(12)),
        ]));
    }

    private static function openChallenge(string $challenge): ?array
    {
        try {
            $payload = json_decode(Crypt::decryptString($challenge), true);
        } catch (\Throwable $e) {
            return null;
        }

        return is_array($payload) && isset($payload['u'], $payload['e'], $payload['n']) && $payload['e'] >= time()
            ? $payload
            : null;
    }

    private function newRecoveryCodes(): array
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
        $codes = [];
        for ($i = 0; $i < self::RECOVERY_CODES; $i++) {
            $part = '';
            for ($j = 0; $j < 10; $j++) {
                $part .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $codes[] = substr($part, 0, 5).'-'.substr($part, 5);
        }

        return $codes;
    }

    // Recovery codes are random and long, so a keyed hash is plenty; the key is the app key.
    public function hashCode(string $code): string
    {
        return hash_hmac('sha256', strtolower(str_replace([' ', '-'], '', $code)), (string) config('app.key'));
    }

    private function useRecoveryCode(User $user, string $given): bool
    {
        $hashes = json_decode((string) $user->two_factor_recovery_codes, true) ?: [];
        $wanted = $this->hashCode($given);

        foreach ($hashes as $i => $hash) {
            if (hash_equals($hash, $wanted)) {
                unset($hashes[$i]);
                $user->forceFill(['two_factor_recovery_codes' => json_encode(array_values($hashes))])->save();

                return true;
            }
        }

        return false;
    }

    private function limiterKey(User $user): string
    {
        return '2fa-attempts:'.$user->id;
    }

    private function guardAttempts(User $user): void
    {
        if (RateLimiter::tooManyAttempts($this->limiterKey($user), self::MAX_ATTEMPTS)) {
            $minutes = (int) ceil(RateLimiter::availableIn($this->limiterKey($user)) / 60);
            throw ValidationException::withMessages([
                'code' => ["Too many wrong codes. Wait about {$minutes} minute(s) and try again."],
            ]);
        }
    }

    private function failAttempt(User $user): never
    {
        RateLimiter::hit($this->limiterKey($user), self::LOCK_SECONDS);

        throw ValidationException::withMessages([
            'code' => ["That code didn't work. Use the newest code from your authenticator app, and check your phone's clock is set automatically."],
        ]);
    }
}
