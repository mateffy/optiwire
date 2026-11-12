<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Card extends Model
{
    use HasUuids;

    protected $table = 'cards';

    protected $guarded = [];
}
