<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // The address of the person's profile picture. It is a locked (encrypted) image like any
    // other photo; only the app, with the person's key, can open it.
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'avatar')) {
            Schema::table('users', fn (Blueprint $table) => $table->string('avatar')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'avatar')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn('avatar'));
        }
    }
};
