<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

// A person's profile picture. The image itself is uploaded first through POST /images (so it is
// locked on their device like every other photo); this only remembers which one it is.
class AvatarController extends Controller
{
    public function update(Request $request)
    {
        $user = $request->user();
        $own = '#^/storage/images/'.$user->id.'/[A-Za-z0-9_-]+\.enc$#';

        $data = $request->validate([
            'url' => ['required', 'string', 'max:255', 'regex:'.$own],
        ]);

        if (! Storage::disk('public')->exists(substr($data['url'], strlen('/storage/')))) {
            throw ValidationException::withMessages(['url' => ['That picture was not found. Please upload it again.']]);
        }

        $old = $user->avatar;
        $user->forceFill(['avatar' => $data['url']])->save();
        $this->deleteFile($old, $data['url']);

        return response()->json($user->fresh());
    }

    public function destroy(Request $request)
    {
        $user = $request->user();
        $old = $user->avatar;
        $user->forceFill(['avatar' => null])->save();
        $this->deleteFile($old, null);

        return response()->json($user->fresh());
    }

    private function deleteFile(?string $old, ?string $keep): void
    {
        if ($old && $old !== $keep && str_starts_with($old, '/storage/images/')) {
            Storage::disk('public')->delete(substr($old, strlen('/storage/')));
        }
    }
}
