<?php

use Capevace\OptimisticUI\SupportOptimisticUI;
use Capevace\OptimisticUI\Tests\Fixtures\BadKey;
use Capevace\OptimisticUI\Tests\Fixtures\Kitchen;
use Capevace\OptimisticUI\Tests\Fixtures\Plain;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Livewire\Livewire;

function memo($component): ?array
{
    return Livewire::test($component)->snapshot['memo']['optimistic'] ?? null;
}

it('adds nothing to components without optimistic features', function () {
    expect(memo(Plain::class))->toBeNull();
});

it('describes JS patches and merges action options', function () {
    expect(memo(Kitchen::class)['actions']['bump'])->toBe([
        'params' => [],
        'inject' => null,
        'key' => null,
        'ops' => [['type' => 'js', 'code' => '$wire.count++']],
        'dispatch' => 'bumped',
        'squash' => true,
        'retry' => true,
        'undo' => 2.5,
        'timeout' => 1000,
    ]);

    expect(memo(Kitchen::class)['actions']['silent'])->toBe([
        'params' => [],
        'inject' => null,
        'key' => null,
        'ops' => [],
    ]);
});

it('describes creates, filling in the client key', function () {
    $actions = memo(Kitchen::class)['actions'];

    expect($actions['add'])->toBe([
        'params' => ['id', 'text'],
        'inject' => 0,
        'key' => 'id',
        'ops' => [['type' => 'create', 'list' => 'tasks', 'key' => 'id', 'from' => null, 'set' => ['done' => false], 'with' => ['at' => '$now']]],
    ]);

    expect($actions['duplicate'])->toMatchArray(['inject' => 0, 'key' => 'id'])
        ->and($actions['duplicate']['ops'][0]['from'])->toBe('source');

    expect($actions['addWithMarkedKey'])->toMatchArray(['inject' => 0, 'key' => 'uuid']);
    expect($actions['addWithoutKey'])->toMatchArray(['inject' => null, 'key' => null]);
});

it('does not generate keys for moves, which keep their own', function () {
    $restore = memo(Kitchen::class)['actions']['restore'];

    expect($restore['inject'])->toBeNull()
        ->and($restore['key'])->toBe('id')
        ->and($restore['ops'])->toBe([
            ['type' => 'delete', 'list' => 'trash', 'key' => 'id'],
            ['type' => 'create', 'list' => 'files', 'key' => 'id', 'from' => 'id', 'set' => [], 'with' => []],
        ]);
});

it('describes updates and deletes with their key parameter', function () {
    $actions = memo(Kitchen::class)['actions'];

    expect($actions['pin']['ops'][0])->toBe(['type' => 'update', 'list' => 'tasks', 'key' => 'id', 'all' => false, 'set' => ['pinned' => true], 'with' => []]);
    expect($actions['readAll']['ops'][0])->toMatchArray(['key' => null, 'all' => true, 'with' => ['read_at' => '$now']]);
    expect($actions['rename']['ops'][0]['key'])->toBe('task');
    expect($actions['archive']['ops'][0])->toBe(['type' => 'delete', 'list' => 'emails', 'key' => 'ids']);
    expect($actions['deleteWithoutKey']['ops'][0]['key'])->toBeNull();
});

it('rejects an explicit key that is not a parameter', function () {
    Livewire::test(BadKey::class);
})->throws(Exception::class, 'Optimistic key parameter [missing] does not exist.');

it('describes lists, their defaults and exposed data', function () {
    $memo = memo(Kitchen::class);

    expect($memo['lists']['tasks'])->toBe([
        'key' => 'uuid',
        'order' => [['done', 'asc'], ['created_at', 'desc'], ['title', 'asc']],
        'groupBy' => 'column',
        'stable' => true,
        'insert' => 'start',
        'defaults' => ['author' => 'You'],
    ]);

    expect($memo['lists']['leaderboard'])->toBe(['key' => 'id', 'order' => [], 'js' => '[-item.score]', 'fields' => ['score']]);
    expect($memo['lists']['notes'])->toBe(['key' => 'id']);

    expect($memo['data'])->toBe([
        'tasks' => [['uuid' => 'a', 'title' => 'A']],
        'people' => [['id' => 1, 'name' => 'Ada']],
        'scalar' => 5,
    ]);

    expect($memo['listeners'])->toBe(['saved' => ['$wire.count = 0'], 'reset' => ['$wire.count = -1']]);
});

it('survives Livewire\'s checksum round trip (no empty objects)', function () {
    Livewire::test(Kitchen::class)
        ->call('silent')
        ->call('silent')
        ->assertSet('log', ['silent', 'silent']);
});

it('injects the client script on full pages that use optimistic features', function () {
    Livewire::component('kitchen', Kitchen::class);
    Livewire::component('plain', Plain::class);
    Route::get('/with', fn () => Blade::render('<html><head></head><body><livewire:kitchen /></body></html>'))->middleware('web');
    Route::get('/without', fn () => Blade::render('<html><head></head><body><livewire:plain /></body></html>'))->middleware('web');

    $this->get('/with')
        ->assertOk()
        ->assertSee('livewire-optimistic-ui/optimistic.js?v=', false)
        ->assertSee('window.optimisticConfig = Object.assign({"timeout":30000', false);

    app('livewire')->flushState();

    $this->get('/without')
        ->assertOk()
        ->assertDontSee('livewire-optimistic-ui/optimistic.js', false);
});

it('can leave asset injection to the app', function () {
    config()->set('livewire-optimistic-ui.inject_assets', false);
    Livewire::component('kitchen', Kitchen::class);
    Route::get('/with', fn () => Blade::render('<html><head></head><body><livewire:kitchen /></body></html>'))->middleware('web');

    $this->get('/with')->assertOk()->assertDontSee('livewire-optimistic-ui/optimistic.js', false);
});

it('serves the client script', function () {
    $this->get('/livewire-optimistic-ui/optimistic.js')
        ->assertOk()
        ->assertHeader('Content-Type', 'application/javascript; charset=utf-8');
});
