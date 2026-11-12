<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;

class Person extends Model
{
    

    protected $table = 'people';

    protected $guarded = [];

    public $timestamps = false;

    protected $casts = ["following" => "boolean"];
}
