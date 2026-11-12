<?php

use Capevace\OptimisticUI\Row;
use Capevace\OptimisticUI\Tests\Fixtures\Rows;
use Capevace\OptimisticUI\Tests\Fixtures\RowsWithCustomKey;
use Capevace\OptimisticUI\Tests\Fixtures\RowsWithoutLists;
use Capevace\OptimisticUI\Tests\Fixtures\Task;
use Illuminate\Support\Carbon;
use Livewire\Livewire;

function rowData(string $html): array
{
    preg_match_all('/wire:key="([^"]*)" wire:optimistic\.row="([^"]*)"/', $html, $matches, PREG_SET_ORDER);

    return array_map(fn ($match) => [html_entity_decode($match[1]), json_decode(html_entity_decode($match[2]), true)], $matches);
}

it('renders the key and the fields the lists need for models', function () {
    Carbon::setTestNow('2026-11-12 10:00:00');

    $task = new Task(['title' => 'Write tests', 'done' => false, 'column' => 'todo', 'due_at' => now(), 'meta' => ['label' => 'urgent'], 'secret' => 'x']);
    $task->id = 42;

    $html = Livewire::test(Rows::class, ['items' => [$task]])->html();

    expect(rowData($html))->toBe([['42', [
        'id' => 42,
        'done' => false,
        'due_at' => '2026-11-12T10:00:00.000000Z',
        'column' => 'todo',
        'title' => 'Write tests',
        'meta.label' => 'urgent',
        'missing' => null,
    ]]]);
});

it('works with arrays, escapes values and needs no lists', function () {
    $html = Livewire::test(RowsWithoutLists::class)->html();

    expect($html)->toContain('wire:key="7"')
        ->and(rowData($html))->toBe([['7', ['id' => 7, 'title' => 'Seven <&> "quotes"']]]);
});

it('works with plain objects and custom keys', function () {
    $html = Livewire::test(RowsWithCustomKey::class)->html();

    expect(rowData($html))->toBe([['u-1', ['uuid' => 'u-1', 'title' => 'Object']]]);
});

it('serializes dates outside of models as ISO 8601', function () {
    $html = Row::attributes(['id' => 1, 'at' => Carbon::parse('2026-01-02 03:04:05', 'UTC')], ['at']);

    expect(rowData($html))->toBe([['1', ['id' => 1, 'at' => '2026-01-02T03:04:05+00:00']]]);
});
