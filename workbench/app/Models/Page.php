<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Page extends Model
{
    use HasUuids;

    protected $table = 'pages';

    protected $guarded = [];
}
