<?php
use Illuminate\Support\Facades\Storage;
Storage::disk('public')->deleteDirectory('images');
Storage::disk('public')->deleteDirectory('recordings');
echo "files wiped\n";
