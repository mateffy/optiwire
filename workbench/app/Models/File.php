<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;

class File extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'files';

    protected $guarded = [];
}
