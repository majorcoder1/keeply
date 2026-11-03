<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class Recording extends Model
{
    protected $fillable = ['note_id', 'title', 'path', 'duration', 'mime'];

    protected $appends = ['url'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }

    // Public URL the frontend <audio> tag can play.
    public function getUrlAttribute(): string
    {
        return Storage::disk('public')->url($this->path);
    }
}
