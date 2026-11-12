<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;

class Suggestion extends Model
{
    

    protected $table = 'suggestions';

    protected $guarded = [];

    public $timestamps = false;

    protected $casts = ["archived" => "boolean", "dismissed" => "boolean"];
}
