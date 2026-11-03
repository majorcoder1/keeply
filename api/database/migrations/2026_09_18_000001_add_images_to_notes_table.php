<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // NoteController also adds this column on first use (see ensureImagesColumn), so the
    // site works even if `php artisan migrate` is never run on the host. Hence the guard.
    public function up(): void
    {
        if (Schema::hasColumn('notes', 'images')) {
            return;
        }

        Schema::table('notes', function (Blueprint $table) {
            $table->json('images')->nullable()->after('tags');
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->dropColumn('images');
        });
    }
};
