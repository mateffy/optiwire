<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;

class PollOption extends Model
{
    

    protected $table = 'poll_options';

    protected $guarded = [];

    public $timestamps = false;
}
