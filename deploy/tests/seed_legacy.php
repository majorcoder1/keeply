<?php
// Pre-update world: a user with readable notes, a readable photo and a readable recording.
use App\Models\User;
use Illuminate\Support\Facades\Storage;

$u = User::create(['name' => 'Legacy Larry', 'email' => 'legacy@example.test', 'password' => 'legacy-pass-123']);
foreach (['Record', 'Work', 'Personal'] as $n) {
    $u->folders()->create(['name' => $n, 'system' => true]);
}
$f = $u->folders()->create(['name' => 'Prayer requests SECRET-FOLDER', 'system' => false]);
$disk = Storage::disk('public');
$disk->put('images/'.$u->id.'/legacyphoto.jpg', file_get_contents(getenv('KP_S').'/test.jpg'));
$disk->put('recordings/'.$u->id.'/legacyrec.webm', file_get_contents(getenv('KP_S').'/test.webm'));
$n1 = $u->notes()->create(['title' => 'Sunday sermon SECRET-ALPHA', 'body' => "John 3:16 - SECRET-BODY-ONE\nGod so loved", 'tags' => ['preaching', 'SECRET-TAG'], 'pinned' => true, 'folder_id' => $f->id]);
$n2 = $u->notes()->create(['title' => 'Photo note SECRET-GAMMA', 'body' => '', 'images' => ['/storage/images/'.$u->id.'/legacyphoto.jpg']]);
$n3 = $u->notes()->create(['title' => 'Rich note', 'body' => '<b>SECRET-RICH</b> text', 'color' => 'yellow']);
$u->recordings()->create(['note_id' => $n1->id, 'title' => 'Legacy recording SECRET-BETA', 'path' => 'recordings/'.$u->id.'/legacyrec.webm', 'duration' => 3, 'mime' => 'audio/webm']);
echo 'seeded user '.$u->id.' notes '.$u->notes()->count()."\n";
