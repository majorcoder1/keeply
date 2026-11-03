<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Logging in with the 24-digit Keeply number. The device turns the number into two
    // one-way values (a lookup id and a login proof); only those are kept here. Neither can
    // be turned back into the number or used to open any note.
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'number_id')) {
            Schema::table('users', fn (Blueprint $table) => $table->string('number_id', 64)->nullable()->unique());
        }
        if (! Schema::hasColumn('users', 'number_auth')) {
            Schema::table('users', fn (Blueprint $table) => $table->string('number_auth', 64)->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'number_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropUnique(['number_id']);
                $table->dropColumn('number_id');
            });
        }
        if (Schema::hasColumn('users', 'number_auth')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn('number_auth'));
        }
    }
};
