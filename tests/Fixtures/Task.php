<?php

namespace Capevace\OptimisticUI\Tests\Fixtures;

use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    protected $guarded = [];

    protected $casts = ['done' => 'boolean', 'due_at' => 'datetime', 'meta' => 'array'];
}
