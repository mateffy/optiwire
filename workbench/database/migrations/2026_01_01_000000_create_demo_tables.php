<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('bucket')->index();
            $table->string('text');
            $table->boolean('done')->default(false);
            $table->boolean('pinned')->default(false);
            $table->timestamps();
        });

        Schema::create('notes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->boolean('pinned')->default(false);
            $table->timestamps();
        });

        Schema::create('cards', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->string('column');
            $table->integer('position')->default(0);
            $table->timestamps();
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->text('body');
            $table->string('author');
            $table->string('avatar');
            $table->timestamp('sent_at');
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->integer('stock');
        });

        Schema::create('poll_options', function (Blueprint $table) {
            $table->id();
            $table->string('label');
            $table->integer('votes')->default(0);
        });

        Schema::create('notifications_demo', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('emails', function (Blueprint $table) {
            $table->id();
            $table->string('subject');
            $table->boolean('archived')->default(false);
        });

        Schema::create('suggestions', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->boolean('dismissed')->default(false);
        });

        Schema::create('pages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->timestamps();
        });

        Schema::create('people', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('color');
            $table->integer('followers')->default(0);
            $table->boolean('following')->default(false);
        });

        Schema::create('issues', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->foreignId('assignee_id')->nullable();
        });

        Schema::create('files', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->softDeletes();
            $table->timestamps();
        });

        Schema::create('kv', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value')->nullable();
        });
    }
};
