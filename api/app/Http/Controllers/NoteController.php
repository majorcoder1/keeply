<?php

namespace App\Http\Controllers;

use App\Models\Note;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class NoteController extends Controller
{
    public function index(Request $request)
    {
        $query = $request->user()->notes()
            ->orderByDesc('pinned')
            ->orderByDesc('updated_at');

        if ($request->filled('folder_id')) {
            $query->where('folder_id', $request->integer('folder_id'));
        }

        return $query->get();
    }

    public function store(Request $request)
    {
        self::ensureImagesColumn();
        $data = $this->validated($request);

        $note = $request->user()->notes()->create($data);

        return response()->json($note, 201);
    }

    public function update(Request $request, Note $note)
    {
        $this->authorizeOwner($request, $note);
        self::ensureImagesColumn();

        $data = $this->validated($request);
        $before = $note->images ?? [];

        $note->update($data);

        if (array_key_exists('images', $data)) {
            $this->deleteImages(array_diff($before, $data['images'] ?? []));
        }

        return $note;
    }

    public function destroy(Request $request, Note $note)
    {
        $this->authorizeOwner($request, $note);
        $this->deleteImages($note->images ?? []);
        $note->delete();

        return response()->json(['message' => 'Deleted']);
    }

    // A note's words are encrypted on the person's device and arrive as one "enc1:..." block
    // in `body` (which also holds the title and labels). The server refuses readable text, so
    // an out-of-date app or a bug can never store a note it could read.
    private function validated(Request $request): array
    {
        $own = '#^/storage/images/'.$request->user()->id.'/[A-Za-z0-9_-]+\.enc$#';
        $update = 'Update Keeply to the latest version — notes are now saved encrypted.';

        return $request->validate([
            'folder_id' => ['nullable', 'integer', Rule::exists('folders', 'id')->where('user_id', $request->user()->id)],
            'title' => ['nullable', 'string', 'max:255', function ($attr, $value, $fail) use ($update) {
                if (trim((string) $value) !== '') {
                    $fail($update);
                }
            }],
            'body' => ['nullable', 'string', function ($attr, $value, $fail) use ($update) {
                if ($value !== '' && ! str_starts_with((string) $value, 'enc1:')) {
                    $fail($update);
                }
            }],
            'color' => ['nullable', 'string', 'max:32'],
            'pinned' => ['nullable', 'boolean'],
            'tags' => ['nullable', 'array', 'max:0'],
            // Photos are uploaded first (POST /images); a note only lists the user's own encrypted ones.
            'images' => ['nullable', 'array', 'max:20'],
            'images.*' => ['string', 'max:255', 'regex:'.$own],
        ]);
    }

    // Remove photo files a note no longer uses.
    private function deleteImages(array $urls): void
    {
        $paths = array_map(fn ($url) => substr($url, strlen('/storage/')), array_values($urls));
        if ($paths) {
            Storage::disk('public')->delete($paths);
        }
    }

    // Shared hosting may give no way to run `php artisan migrate`, so add the photos column
    // the first time it is needed. Cached so the schema is checked once, not every request.
    private static function ensureImagesColumn(): void
    {
        if (Cache::get('schema.notes.images')) {
            return;
        }
        if (! Schema::hasColumn('notes', 'images')) {
            Schema::table('notes', function (Blueprint $table) {
                $table->json('images')->nullable();
            });
        }
        Cache::forever('schema.notes.images', true);
    }

    private function authorizeOwner(Request $request, Note $note): void
    {
        abort_unless($note->user_id === $request->user()->id, 403);
    }
}
