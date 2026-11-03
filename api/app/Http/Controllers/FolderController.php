<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use Illuminate\Http\Request;

class FolderController extends Controller
{
    public function index(Request $request)
    {
        return $request->user()->folders()->orderBy('created_at')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'starts_with:enc1:'],
        ]);

        $folder = $request->user()->folders()->create([
            'name' => $data['name'],
            'system' => false,
        ]);

        return response()->json($folder, 201);
    }

    public function update(Request $request, Folder $folder)
    {
        $this->authorizeOwner($request, $folder);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'starts_with:enc1:'],
        ]);

        // The three starter folders keep plain names; a person's own folder names are encrypted.
        abort_if($folder->system, 422, 'Default folders cannot be renamed.');

        $folder->update(['name' => $data['name']]);

        return $folder;
    }

    public function destroy(Request $request, Folder $folder)
    {
        $this->authorizeOwner($request, $folder);

        if ($folder->system) {
            return response()->json(['message' => 'Default folders cannot be deleted.'], 422);
        }

        // Notes keep existing; their folder_id is set null by the FK constraint.
        $folder->delete();

        return response()->json(['message' => 'Deleted']);
    }

    private function authorizeOwner(Request $request, Folder $folder): void
    {
        abort_unless($folder->user_id === $request->user()->id, 403);
    }
}
