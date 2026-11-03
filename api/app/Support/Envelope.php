<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;

// Every file the app uploads (photos, voice recordings) is encrypted on the phone or
// computer first and starts with this marker, then a random 12-byte value, then the
// scrambled bytes. The server can't read any of it, but it can refuse a file that
// doesn't carry the marker — so a bug or an out-of-date app can never leave a readable
// file on the server by accident.
final class Envelope
{
    public const MAGIC = 'KPLY1';

    public static function isEncrypted(UploadedFile $file): bool
    {
        $handle = @fopen($file->getRealPath(), 'rb');
        if ($handle === false) {
            return false;
        }
        $head = fread($handle, strlen(self::MAGIC));
        fclose($handle);

        return $head === self::MAGIC && $file->getSize() > strlen(self::MAGIC) + 12 + 16;
    }
}
