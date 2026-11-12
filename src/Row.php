<?php

namespace Capevace\OptimisticUI;

use DateTimeInterface;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Database\Eloquent\Model;
use Livewire\Livewire;

/**
 * Renders the attributes of `@optimisticRow($item, ['extra', 'fields'])`:
 * the row's wire:key and the fields the client needs to sort, group and
 * evaluate `$item` expressions without having the list's data.
 */
class Row
{
    public static function attributes(mixed $item, array $extra = []): string
    {
        $component = Livewire::current() ?: null;
        $keyField = SupportOptimisticUI::keyFieldFor($component);
        $fields = array_values(array_unique([...SupportOptimisticUI::rowFieldsFor($component), ...$extra]));

        $key = $item instanceof Model ? $item->getKey() : data_get($item, $keyField);
        $serialized = $item instanceof Arrayable ? $item->toArray() : (array) $item;

        $data = [$keyField => $key];

        foreach ($fields as $field) {
            $value = data_get($serialized, $field, fn () => data_get($item, $field));

            $data[$field] = $value instanceof DateTimeInterface ? $value->format(DATE_ATOM) : SupportOptimisticUI::serialize($value);
        }

        return sprintf(
            'wire:key="%s" wire:optimistic.row="%s"',
            e((string) $key),
            e(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
        );
    }
}
