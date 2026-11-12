<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;

class DemoNotification extends Model
{
    

    protected $table = 'notifications_demo';

    protected $guarded = [];

    protected $casts = ["read_at" => "datetime"];
}
