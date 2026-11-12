<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Workbench\Database\Seeders\DatabaseSeeder;

Route::view('/', 'demo')->name('demo');

Route::post('/demo/reset', function () {
    (new DatabaseSeeder)->run();

    return redirect('/');
})->name('demo.reset');

Route::get('/demo/avatars/{file}', function (string $file) {
    abort_unless(preg_match('/^[\w.-]+$/', $file) && Storage::disk('local')->exists('avatars/'.$file), 404);

    return response()->file(Storage::disk('local')->path('avatars/'.$file));
})->name('demo.avatar');
