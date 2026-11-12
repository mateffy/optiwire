<?php

namespace Capevace\OptimisticUI\Optimistic;

use Attribute;
use Livewire\Attribute as LivewireAttribute;

/**
 * Lets a component react to another component's optimistic action that was
 * declared with `dispatch: 'event'`. The JS patch runs against this
 * component's $wire and is rolled back when the original action fails.
 */
#[Attribute(Attribute::TARGET_CLASS | Attribute::TARGET_METHOD | Attribute::IS_REPEATABLE)]
class On extends LivewireAttribute
{
    public function __construct(public string $event, public string $js) {}
}
