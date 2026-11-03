<?php

namespace App\Http\Controllers;

use App\Support\Envelope;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ImageController extends Controller
{
    // Store a photo for a note and return its URL. The app shrinks each photo to about
    // 1600px and encrypts it on the device before it is sent, so the server only ever
    // holds scrambled bytes (and refuses anything that isn't).
    public function store(Request $request)
    {
        $request->validate([
            'image' => ['required', 'file', 'max:15360'],
        ]);

        $file = $request->file('image');
        if (! Envelope::isEncrypted($file)) {
            throw ValidationException::withMessages([
                'image' => ['Update Keeply to the latest version — photos are now saved encrypted.'],
            ]);
        }

        // storage/app/public/images/{userId}/..., served at /storage/... (the .enc ending
        // is how the app tells an encrypted photo from an older readable one).
        $path = $file->storeAs('images/'.$request->user()->id, Str::random(40).'.enc', 'public');

        return response()->json(['url' => '/storage/'.$path], 201);
    }
}
