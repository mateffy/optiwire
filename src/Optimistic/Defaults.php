<?php

namespace Capevace\OptimisticUI\Optimistic;

use Attribute;
use Livewire\Attribute as LivewireAttribute;

/**
 * Marks a method returning default fields for items optimistically created in
 * `list` (things the server knows but the caller doesn't pass: the author,
 * the team, ...).
 */
#[Attribute(Attribute::TARGET_METHOD | Attribute::IS_REPEATABLE)]
class Defaults extends LivewireAttribute
{
    public function __construct(public string $list) {}
}
