<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // End-to-end encryption: the server keeps only a random salt and a small "key check"
    // blob per user (neither can unlock anything). Two-factor sign-in: an authenticator
    // secret (stored encrypted with the app key), recovery-code hashes and the last
    // accepted time step, so a code can't be used twice.
    // Each column is added only if missing, so running this twice is harmless.
    public function up(): void
    {
        $columns = [
            'key_salt' => fn (Blueprint $t) => $t->string('key_salt', 64)->nullable(),
            'key_check' => fn (Blueprint $t) => $t->text('key_check')->nullable(),
            'key_version' => fn (Blueprint $t) => $t->unsignedSmallInteger('key_version')->nullable(),
            'two_factor_secret' => fn (Blueprint $t) => $t->text('two_factor_secret')->nullable(),
            'two_factor_confirmed_at' => fn (Blueprint $t) => $t->timestamp('two_factor_confirmed_at')->nullable(),
            'two_factor_recovery_codes' => fn (Blueprint $t) => $t->text('two_factor_recovery_codes')->nullable(),
            'two_factor_last_step' => fn (Blueprint $t) => $t->unsignedBigInteger('two_factor_last_step')->nullable(),
        ];

        foreach ($columns as $name => $add) {
            if (! Schema::hasColumn('users', $name)) {
                Schema::table('users', fn (Blueprint $table) => $add($table));
            }
        }
    }

    public function down(): void
    {
        $names = array_values(array_filter([
            'key_salt', 'key_check', 'key_version', 'two_factor_secret',
            'two_factor_confirmed_at', 'two_factor_recovery_codes', 'two_factor_last_step',
        ], fn ($c) => Schema::hasColumn('users', $c)));

        if ($names) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn($names));
        }
    }
};
