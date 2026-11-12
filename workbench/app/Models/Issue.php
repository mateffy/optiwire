<?php

namespace Workbench\App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Issue extends Model
{
    use HasUuids;

    protected $table = 'issues';

    protected $guarded = [];

    public $timestamps = false;

    public function assignee()
    {
        return $this->belongsTo(Person::class, "assignee_id");
    }
}
