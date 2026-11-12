<?php

namespace Mateffy\Optiwire\Optimistic;

use Attribute;
use Livewire\Attribute as LivewireAttribute;

/**
 * Sends a #[Computed] property to the client so it can be rendered with
 * x-for as `$wire.<name>` and patched optimistically. Public properties
 * don't need this, they're already on the client.
 */
#[Attribute(Attribute::TARGET_METHOD)]
class Expose extends LivewireAttribute
{
    public function __construct(public ?string $as = null) {}
}
