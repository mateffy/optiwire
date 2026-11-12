<?php

namespace Capevace\OptimisticUI\Optimistic;

use Attribute;
use Livewire\Attribute as LivewireAttribute;

/**
 * Describes a list: how it's sorted (the same spec you use for ORDER BY), how
 * items are grouped and keyed. Put it on the property or #[Computed] method
 * that provides the list; the list is named after it unless `list:` is given.
 *
 *     #[Computed, Optimistic\Ordered(['done' => 'asc', 'due_at' => 'desc'])]
 *     #[Computed, Optimistic\Ordered(js: '[-item.votes]', fields: ['votes'])]
 */
#[Attribute(Attribute::TARGET_METHOD | Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
class Ordered extends LivewireAttribute
{
    public function __construct(
        public array $columns = [],
        public ?string $list = null,
        public ?string $groupBy = null,
        public ?string $js = null,
        public array $fields = [],
        public string $key = 'id',
        public bool $stable = false,
        public string $insert = 'end',
    ) {}

    public function listName(): string
    {
        return $this->list ?? $this->getName();
    }

    public function toSpec(): array
    {
        return array_filter([
            'key' => $this->key,
            'order' => collect($this->columns)
                ->map(fn ($direction, $column) => is_int($column) ? [$direction, 'asc'] : [$column, strtolower($direction)])
                ->values()
                ->all(),
            'groupBy' => $this->groupBy,
            'js' => $this->js,
            'fields' => $this->fields ?: null,
            'stable' => $this->stable ?: null,
            'insert' => $this->insert === 'end' ? null : $this->insert,
        ], fn ($value) => $value !== null);
    }

    /**
     * Fields a Blade row has to carry so the client can sort and group it.
     */
    public function rowFields(): array
    {
        return array_values(array_unique(array_filter([
            ...array_map(fn ($pair) => $pair[0], $this->toSpec()['order']),
            ...$this->fields,
            $this->groupBy,
        ])));
    }
}
