<?php

namespace Capevace\OptimisticUI\Optimistic;

use Attribute;

/**
 * Removes the item(s) whose key is passed as `$id` (or `$ids`) from `list`.
 * With `undo: n` the request is held back for n seconds and can be undone.
 */
#[Attribute(Attribute::TARGET_METHOD | Attribute::IS_REPEATABLE)]
class Delete extends Action
{
    public function __construct(
        public string $list,
        public ?string $key = null,
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
        return [
            'type' => 'delete',
            'list' => $this->list,
            'key' => $this->keyParameter($parameters, $this->key, ['id', 'ids']),
        ];
    }
}
