<?php

namespace Capevace\OptimisticUI\Optimistic;

use Attribute;

/**
 * Merges the method's parameters (minus the key), `set:` literal values and
 * `with:` JS expressions into the item(s) whose key is passed as `$id` (or
 * `$ids` for many). `all: true` targets every item of the list.
 */
#[Attribute(Attribute::TARGET_METHOD | Attribute::IS_REPEATABLE)]
class Update extends Action
{
    public function __construct(
        public string $list,
        public array $set = [],
        public array $with = [],
        public bool $all = false,
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
            'type' => 'update',
            'list' => $this->list,
            'key' => $this->all ? null : $this->keyParameter($parameters, $this->key, ['id', 'ids']),
            'all' => $this->all,
            'set' => $this->set,
            'with' => $this->with,
        ];
    }
}
