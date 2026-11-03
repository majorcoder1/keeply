<?php

namespace App\Http\Controllers;

use App\Models\Recording;
use App\Support\Envelope;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RecordingController extends Controller
{
    public function index(Request $request)
    {
        return $request->user()->recordings()->orderByDesc('created_at')->get();
    }

    // Recordings arrive already encrypted on the device (see App\Support\Envelope): the
    // server stores the scrambled file and can't hear it. The title is encrypted too.
    public function store(Request $request)
    {
        $data = $request->validate([
            'audio' => ['required', 'file', 'max:51200'], // 50 MB
            'note_id' => ['nullable', 'integer', Rule::exists('notes', 'id')->where('user_id', $request->user()->id)],
            'title' => ['nullable', 'string', 'max:255', 'starts_with:enc1:'],
            'duration' => ['nullable', 'integer', 'min:0'],
            // What the audio is once unscrambled, so the player knows how to open it.
            'mime' => ['nullable', 'string', Rule::in(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'])],
        ]);

        $file = $request->file('audio');
        if (! Envelope::isEncrypted($file)) {
            throw ValidationException::withMessages([
                'audio' => ['Update Keeply to the latest version — recordings are now saved encrypted.'],
            ]);
        }

        // Stored per-user under storage/app/public/recordings/{userId}/...
        $path = $file->storeAs('recordings/'.$request->user()->id, Str::random(40).'.enc', 'public');

        $recording = $request->user()->recordings()->create([
            'note_id' => $data['note_id'] ?? null,
            'title' => $data['title'] ?? null,
            'path' => $path,
            'duration' => $data['duration'] ?? 0,
            'mime' => $data['mime'] ?? 'audio/webm',
        ]);

        return response()->json($recording, 201);
    }

    public function destroy(Request $request, Recording $recording)
    {
        abort_unless($recording->user_id === $request->user()->id, 403);

        Storage::disk('public')->delete($recording->path);
        $recording->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
