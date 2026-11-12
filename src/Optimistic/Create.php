<?php

namespace Mateffy\Optiwire\Optimistic;

use Attribute;

/**
 * Adds an item to `list`, built from the method's parameters, `set:` literal
 * values and `with:` JS expressions evaluated when the action is called.
 *
 * The key parameter (`id` by default) is filled with a client generated
 * UUIDv7 when the caller leaves it out. `from:` names a parameter holding the
 * key of an existing item to copy (or move, when it is the key parameter).
 */
#[Attribute(Attribute::TARGET_METHOD | Attribute::IS_REPEATABLE)]
class Create extends Action
{
    public function __construct(
        public string $list,
        public array $with = [],
        public array $set = [],
        public ?string $from = null,
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
            'type' => 'create',
            'list' => $this->list,
            'key' => $this->keyParameter($parameters, $this->key, ['id']),
            'from' => $this->from,
            'set' => $this->set,
            'with' => $this->with,
        ];
    }
}
