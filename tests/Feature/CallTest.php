<?php

use Mateffy\Optiwire\Optimistic;
use Mateffy\Optiwire\SupportOptiwire;
use Mateffy\Optiwire\Tests\Fixtures\Kitchen;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Livewire\Livewire;

function optimisticCall($testable, string $method, array $params = [], ?array $meta = null)
{
    $call = ['method' => $method, 'params' => $params, 'path' => ''];

    if ($meta !== null) {
        $call['metadata'] = ['optimistic' => $meta];
    }

    return $testable->update(calls: [$call]);
}

function rejected($testable): array
{
    return $testable->effects['optimistic']['rejected'] ?? [];
}

it('runs actions without metadata like any other Livewire call', function () {
    $component = optimisticCall(Livewire::test(Kitchen::class), 'add', ['k', 'text']);

    expect($component->get('log'))->toBe(['add:k:text:none:inactive']);
});

it('ignores malformed metadata', function () {
    $component = Livewire::test(Kitchen::class);

    optimisticCall($component, 'silent', [], ['id' => 'not-a-uuid']);
    optimisticCall($component, 'silent', [], ['nope' => true]);
    $component->update(calls: [['method' => 'silent', 'params' => [], 'path' => '', 'metadata' => ['optimistic' => 'string']]]);

    expect($component->get('log'))->toBe(['silent', 'silent', 'silent']);
});

it('exposes the client key and marks the call as optimistic', function () {
    $key = (string) Str::uuid7();

    $component = optimisticCall(Livewire::test(Kitchen::class), 'add', [$key, 'Milk'], ['id' => (string) Str::uuid7(), 'injected' => 0]);

    expect($component->get('log'))->toBe(["add:{$key}:Milk:{$key}:active"])
        ->and(SupportOptiwire::$current)->toBeNull()
        ->and(Optimistic::active())->toBeFalse();
});

it('refuses client keys that are not UUIDs', function (mixed $key) {
    $id = (string) Str::uuid7();

    $component = optimisticCall(Livewire::test(Kitchen::class), 'add', [$key, 'Milk'], ['id' => $id, 'injected' => 0]);

    expect($component->get('log'))->toBe([])
        ->and(rejected($component))->toBe([$id => 'Invalid client generated key.']);
})->with(['not-a-uuid', 123, null]);

it('runs an action only once per action id (retries of lost responses)', function () {
    $component = Livewire::test(Kitchen::class);
    $meta = ['id' => (string) Str::uuid7()];

    optimisticCall($component, 'bump', [], $meta);
    optimisticCall($component, 'bump', [], $meta);

    expect($component->get('log'))->toBe(['bump'])
        ->and($component->effects['returns'])->toBe([1]);

    optimisticCall($component, 'bump', [], ['id' => (string) Str::uuid7()]);
    expect($component->get('log'))->toBe(['bump', 'bump']);
});

it('only remembers serializable return values', function () {
    $component = Livewire::test(Kitchen::class);
    $meta = ['id' => (string) Str::uuid7()];

    optimisticCall($component, 'silent', [], $meta);
    optimisticCall($component, 'silent', [], $meta);

    expect($component->get('log'))->toBe(['silent']);
});

it('scopes remembered actions to the session', function () {
    $meta = ['id' => (string) Str::uuid7()];

    config()->set('session.driver', 'array');
    $this->startSession();
    $first = optimisticCall(Livewire::test(Kitchen::class), 'bump', [], $meta);

    session()->setId(Str::random(40));
    $second = optimisticCall(Livewire::test(Kitchen::class), 'bump', [], $meta);

    expect($first->get('log'))->toBe(['bump'])
        ->and($second->get('log'))->toBe(['bump']);
});

it('can be configured to not remember actions', function () {
    config()->set('optiwire.idempotency.enabled', false);

    $component = Livewire::test(Kitchen::class);
    $meta = ['id' => (string) Str::uuid7()];

    optimisticCall($component, 'bump', [], $meta);
    optimisticCall($component, 'bump', [], $meta);

    expect($component->get('log'))->toBe(['bump', 'bump']);
});

it('uses the configured cache store and ttl', function () {
    config()->set('optiwire.idempotency.store', 'array');
    config()->set('optiwire.idempotency.ttl', 5);

    $component = Livewire::test(Kitchen::class);
    optimisticCall($component, 'bump', [], ['id' => (string) Str::uuid7()]);

    $this->travel(6)->seconds();
    expect(Cache::store('array')->getStore()->all ?? null)->toBeNull();
});

it('reports Optimistic::reject() to the client and keeps going', function () {
    $component = Livewire::test(Kitchen::class);
    $id = (string) Str::uuid7();

    optimisticCall($component, 'guarded', [50], ['id' => $id]);

    expect(rejected($component))->toBe([$id => 'Too much'])
        ->and($component->get('count'))->toBe(0);

    optimisticCall($component, 'guarded', [5], ['id' => (string) Str::uuid7()]);
    expect($component->get('count'))->toBe(5)
        ->and(rejected($component))->toBe([]);
});

it('does not remember rejected actions, so a retry runs again', function () {
    $component = Livewire::test(Kitchen::class);
    $meta = ['id' => (string) Str::uuid7()];

    optimisticCall($component, 'guarded', [50], $meta);
    optimisticCall($component, 'guarded', [50], $meta);

    expect(rejected($component))->toBe([$meta['id'] => 'Too much']);
});

it('reports empty rejection messages as such', function () {
    $component = Livewire::test(Kitchen::class);
    $id = (string) Str::uuid7();

    optimisticCall($component, 'rejectWithoutMessage', [], ['id' => $id]);

    expect(rejected($component))->toBe([$id => '']);
});

it('reports validation errors as rejections, and Livewire still gets the errors', function () {
    $component = Livewire::test(Kitchen::class);
    $id = (string) Str::uuid7();

    optimisticCall($component, 'validated', [''], ['id' => $id]);

    expect(rejected($component))->toBe([$id => 'The text field is required.']);
    $component->assertHasErrors('text');
});

it('lets other exceptions through untouched', function () {
    $component = Livewire::test(Kitchen::class);

    expect(fn () => optimisticCall($component, 'crash', [], ['id' => (string) Str::uuid7()]))
        ->toThrow(RuntimeException::class, 'Boom');

    expect(SupportOptiwire::$current)->toBeNull();
});

it('lets rejections outside of optimistic calls through', function () {
    expect(fn () => Livewire::test(Kitchen::class)->call('plainReject'))
        ->toThrow(\Mateffy\Optiwire\OptimisticRejection::class, 'Outside');
});

it('forgets the current action between requests', function () {
    SupportOptiwire::$current = ['id' => 'stale', 'key' => 'stale'];

    app('livewire')->flushState();

    expect(SupportOptiwire::$current)->toBeNull();
});
