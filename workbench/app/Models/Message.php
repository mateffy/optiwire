<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Message extends Model
{
    use HasUuids;

    protected $table = 'messages';

    protected $guarded = [];

    public $timestamps = false;

    protected $casts = ["sent_at" => "datetime"];
}
