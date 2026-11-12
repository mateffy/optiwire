<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Note extends Model
{
    use HasUuids;

    protected $table = 'notes';

    protected $guarded = [];

    protected $casts = ["pinned" => "boolean"];
}
