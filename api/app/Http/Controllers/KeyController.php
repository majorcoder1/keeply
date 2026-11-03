<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

// Where the server's part in end-to-end encryption begins and ends: it stores a random
// salt and a small "key check" that the person's own device made. Neither can be used to
// work out the key (a 24-digit code the device made and the server never sees), and
// neither opens any note. They only let a new device tell whether the code typed is right.
class KeyController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'salt' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{16,64}$/'],
            'check' => ['required', 'string', 'max:2000', 'starts_with:enc1:'],
            'login_id' => ['nullable', 'required_with:login_auth', 'string', 'regex:/^[a-f0-9]{64}$/'],
            'login_auth' => ['nullable', 'required_with:login_id', 'string', 'regex:/^[a-f0-9]{64}$/'],
        ]);

        $number = [];
        if (! empty($data['login_id'])) {
            if (User::where('number_id', $data['login_id'])->exists()) {
                return response()->json(['message' => 'Something went wrong. Please try again.'], 409);
            }
            $number = ['number_id' => $data['login_id'], 'number_auth' => AuthController::numberProof($data['login_auth'])];
        }

        // Only the first key can ever be saved; the "where null" makes it safe even if two
        // devices try at once.
        $saved = DB::table('users')
            ->where('id', $request->user()->id)
            ->whereNull('key_salt')
            ->update(['key_salt' => $data['salt'], 'key_check' => $data['check'], 'key_version' => 1] + $number);

        if (! $saved) {
            return response()->json(['message' => 'This account already has an encryption key.'], 409);
        }

        return response()->json($request->user()->fresh());
    }

    // An account whose key was made before number login existed gets it the next time the number is
    // typed on a device (the device already has the digits then). Only if there isn't one yet, so a
    // stolen sign-in can't swap the number for another.
    public function number(Request $request)
    {
        $data = $request->validate([
            'login_id' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
            'login_auth' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
        ]);
        $user = $request->user();

        if (empty($user->key_salt)) {
            return response()->json(['message' => 'Make your Keeply number first.'], 422);
        }
        if (User::where('number_id', $data['login_id'])->where('id', '!=', $user->id)->exists()) {
            return response()->json(['message' => 'Something went wrong. Please try again.'], 409);
        }

        $saved = DB::table('users')
            ->where('id', $user->id)
            ->whereNull('number_id')
            ->update(['number_id' => $data['login_id'], 'number_auth' => AuthController::numberProof($data['login_auth'])]);

        if (! $saved) {
            return response()->json(['message' => 'Number login is already on.'], 409);
        }

        return response()->json($user->fresh());
    }

    // "I lost my key": erase every note, photo and recording and start again with a new key.
    // Nothing else can be done — nobody, including us, can unlock them.
    public function reset(Request $request)
    {
        $data = $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();

        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ["That password isn't right."]]);
        }

        DB::transaction(function () use ($user) {
            $user->recordings()->delete();
            $user->notes()->delete();
            $user->folders()->where('system', false)->delete();
            $user->forceFill(['key_salt' => null, 'key_check' => null, 'key_version' => null, 'avatar' => null, 'number_id' => null, 'number_auth' => null])->save();
        });

        Storage::disk('public')->deleteDirectory('recordings/'.$user->id);
        Storage::disk('public')->deleteDirectory('images/'.$user->id);

        return response()->json($user->fresh());
    }
}
