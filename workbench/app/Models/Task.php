<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Task extends Model
{
    use HasUuids;

    protected $table = 'tasks';

    protected $guarded = [];

    protected $casts = ["done" => "boolean", "pinned" => "boolean"];
}
