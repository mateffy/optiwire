<?php

namespace Mateffy\Optiwire;

use Attribute;
use Mateffy\Optiwire\Optimistic\Action;

/**
 * Marks a Livewire action as optimistic.
 *
 *     #[Optimistic]                                  // DOM directives only
 *     #[Optimistic('$wire.likes++')]                 // JS patch against $wire
 *     #[Optimistic('...', undo: 5, retry: true)]
 */
#[Attribute(Attribute::TARGET_METHOD | Attribute::IS_REPEATABLE)]
class Optimistic extends Action
{
    public function __construct(
        public ?string $js = null,
        ?string $dispatch = null,
        bool $squash = false,
        bool $retry = false,
        int|float $undo = 0,
        ?int $timeout = null,
    ) {
        parent::__construct($dispatch, $squash, $retry, $undo, $timeout);
    }

    public function toOp(array $parameters): ?array
    {
        return $this->js === null ? null : ['type' => 'js', 'code' => $this->js];
    }

    /**
     * Refuse the current optimistic action. The client rolls it back and
     * exposes the message through $optimistic.error().
     */
    public static function reject(string $message = 'Rejected'): never
    {
        throw new OptimisticRejection($message);
    }

    /**
     * The client generated key of the item the current action creates.
     */
    public static function id(): ?string
    {
        return SupportOptiwire::$current['key'] ?? null;
    }

    /**
     * Whether the current call was made optimistically.
     */
    public static function active(): bool
    {
        return SupportOptiwire::$current !== null;
    }
}
