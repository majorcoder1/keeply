<?php
// Adds old readable data whose files are gone from the server, to a given (already set up) account.
use App\Models\User;
use Illuminate\Support\Facades\Storage;

$u = User::where('email', getenv('KP_EMAIL'))->firstOrFail();
$disk = Storage::disk('public');
$disk->put('images/'.$u->id.'/okphoto.jpg', file_get_contents(getenv('KP_S').'/test.jpg'));
$disk->put('recordings/'.$u->id.'/okrec.webm', file_get_contents(getenv('KP_S').'/test.webm'));
$u->notes()->create(['title' => 'DEAD-PHOTO-NOTE SECRET-ONE', 'body' => 'words that must survive SECRET-TWO', 'images' => ['/storage/images/'.$u->id.'/okphoto.jpg', '/storage/images/'.$u->id.'/gone-photo.jpg']]);
$u->notes()->create(['title' => 'PLAIN-OLD-NOTE SECRET-THREE', 'body' => 'nothing missing here']);
$u->recordings()->create(['title' => 'Fine recording SECRET-FOUR', 'path' => 'recordings/'.$u->id.'/okrec.webm', 'duration' => 3, 'mime' => 'audio/webm']);
$u->recordings()->create(['title' => 'Dead recording SECRET-FIVE', 'path' => 'recordings/'.$u->id.'/gone-rec.webm', 'duration' => 9, 'mime' => 'audio/webm']);
echo "seeded missing-file data for ".$u->email."\n";
