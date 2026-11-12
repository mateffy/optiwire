<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;

class Email extends Model
{
    

    protected $table = 'emails';

    protected $guarded = [];

    public $timestamps = false;

    protected $casts = ["archived" => "boolean", "dismissed" => "boolean"];
}
