<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // Register a new account, seed default folders, return an API token.
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = User::create($data);
        $this->seedDefaultFolders($user);

        $token = $user->createToken('keeply')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token], 201);
    }

    // Log in and return an API token.
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        return $this->finishLogin($user);
    }

    // Log in with the 24-digit Keeply number instead of email and password. The device sends two
    // one-way values made from the number (never the number itself): a lookup id and a login proof.
    // Two-factor still applies afterwards, exactly as with a password.
    public function loginWithNumber(Request $request)
    {
        $data = $request->validate([
            'login_id' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
            'login_auth' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
        ]);

        $user = User::where('number_id', $data['login_id'])->first();
        $proof = self::numberProof($data['login_auth']);

        // The same work whether or not the number exists, so the answer reveals nothing.
        if (! $user || ! $user->number_auth || ! hash_equals($user->number_auth, $proof)) {
            throw ValidationException::withMessages([
                'number' => ["That number doesn't match. Check all 24 digits."],
            ]);
        }

        return $this->finishLogin($user);
    }

    // What is kept for a login proof: a keyed hash, so a copy of the database can't be used to log in.
    public static function numberProof(string $auth): string
    {
        return hash_hmac('sha256', $auth, (string) config('app.key'));
    }

    // Shared by both ways of logging in.
    private function finishLogin(User $user)
    {
        // Make sure returning users always have their default folders.
        if ($user->folders()->count() === 0) {
            $this->seedDefaultFolders($user);
        }

        // Two-factor on: the password alone gets nothing. Hand back a short-lived challenge
        // and issue the token only after the authenticator code checks out.
        if ($user->two_factor_confirmed_at) {
            return response()->json([
                'two_factor' => true,
                'challenge' => TwoFactorController::makeChallenge($user),
            ]);
        }

        $token = $user->createToken('keeply')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token]);
    }

    // Revoke the token used for this request.
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    // Change the signed-in user's password. No current password required —
    // the request is already authenticated by their Sanctum token.
    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = $request->user();

        // 'password' is auto-hashed by the model's 'hashed' cast.
        $user->update(['password' => $data['password']]);

        // Sign every other device out, so a stolen sign-in stops working with the old password.
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        return response()->json(['message' => 'Password updated']);
    }

    // Email a password-reset link. Always returns the same generic message so it
    // never reveals whether an email is registered.
    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);

        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => 'If that email is registered, a reset link is on its way.',
        ]);
    }

    // Complete a reset using the token from the emailed link.
    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $status = Password::reset($data, function (User $user, string $password) {
            // 'password' is auto-hashed by the model's 'hashed' cast.
            $user->forceFill(['password' => $password])->setRememberToken(Str::random(60));
            $user->save();
            $user->tokens()->delete(); // a reset signs out every device
            event(new PasswordReset($user));
        });

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Password reset. You can log in now.']);
        }

        throw ValidationException::withMessages([
            'email' => [__($status)],
        ]);
    }

    private function seedDefaultFolders(User $user): void
    {
        foreach (['Record', 'Work', 'Personal'] as $name) {
            $user->folders()->create(['name' => $name, 'system' => true]);
        }
    }
}
