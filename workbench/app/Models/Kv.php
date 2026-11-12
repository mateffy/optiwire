<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;

/** Tiny key/value store for demo state that isn't a list. */
class Kv extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $table = 'kv';

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = ['value' => 'json'];

    public static function get(string $key, mixed $default = null): mixed
    {
        return static::find($key)?->value ?? $default;
    }

    public static function put(string $key, mixed $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
