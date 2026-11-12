<?php

// Network conditions the examples have to survive: hung and slow requests,
// timeouts with late answers, responses arriving out of order across
// components, random failures and going offline and back online. After the
// dust settles, every component must show exactly what the server says.

use Workbench\App\Models;

it('times out a request that never answers and rolls it back', function () {
    $page = demo(['mode' => 'hang', 'once' => false]);
    js($page, 'Optimistic.config.timeout = 700');

    $page->click('[data-test=like-blade]');
    expect(js($page, "return T.texts('[data-test=likes-blade]')"))->toBe(['42']);

    js($page, "await T.until(() => T.entries()[0]?.error === 'Timed out')");
    expect(js($page, "return [T.texts('[data-test=likes-blade]'), T.texts('[data-test=likes-alpine]')]"))->toBe([['41'], ['41']]);

    js($page, 'demoNetwork.releaseHung(); T.net()');
    js($page, 'await T.idle()');

    expect(js($page, 'return [T.consistent(1), document.getElementById("livewire-error")]'))->toBe([true, null]);
});

it('lets a late successful answer win after a timeout', function () {
    $page = demo(['latency' => 2500]);
    js($page, 'Optimistic.config.timeout = 500');

    $page->click('[data-test=follow-blade]');
    js($page, "await T.until(() => T.entries()[0]?.error === 'Timed out')");

    expect(js($page, "return T.texts('[data-example=\"15\"] [data-pane=blade] .profile button')"))->toBe(['Follow']);

    js($page, 'await T.idle()');

    expect(js($page, "return [T.texts('[data-example=\"15\"] [data-pane=blade] .profile button'), T.entries().length, T.consistent(15)]"))->toBe([['Following'], 0, true]);
});

it('stays consistent when responses of different components arrive out of order', function () {
    $page = demo(['latency' => 100, 'jitter' => 1200]);

    $page->click('[data-test=like-blade]')
        ->click('[data-test=follow-blade]')
        ->click('[data-example="10"] [data-pane=blade] .vote:nth-of-type(1)')
        ->click('[data-example="18"] [data-pane=blade] .toggle:nth-of-type(3) input')
        ->click('[data-example="2"] [data-test=blade-list] li:first-child input')
        ->click('[data-example="6"] [data-test=blade-list] li:last-child button:not([style*="none"])')
        ->click('[data-test=like-alpine]')
        ->click('[data-test=mark-all]');

    js($page, 'await T.idle(20000)');

    expect(js($page, 'return [1, 2, 6, 10, 11, 15, 18].flatMap(n => T.differences(n).map(key => n + ":" + key))'))->toBe([]);
    expect(js($page, 'return T.entries()'))->toBe([]);
    expect(Models\Kv::get('post'))->toBe(['likes' => 41, 'liked' => false]);
});

it('recovers from random failures everywhere', function () {
    $page = demo(['latency' => 80, 'jitter' => 300, 'failRate' => 50, 'once' => false]);

    foreach (range(1, 3) as $round) {
        $page->click('[data-test=like-blade]')
            ->click('[data-example="2"] [data-test=blade-list] li:nth-child(2) input')
            ->click('[data-test=follow-blade]')
            ->click('[data-example="10"] [data-pane=blade] .vote:nth-of-type(2)')
            ->click('[data-example="9"] [data-pane=blade] .product:nth-child(3) button:last-of-type');
    }

    js($page, 'await T.idle(20000)');

    expect(js($page, 'return [1, 2, 9, 10, 15].flatMap(n => T.differences(n).map(key => n + ":" + key))'))->toBe([]);
    expect(js($page, "return T.entries().filter(entry => entry.status !== 'failed')"))->toBe([]);
    expect(js($page, 'return document.getElementById("livewire-error")'))->toBeNull();
});

it('rolls everything back while offline and works again once back online', function () {
    $page = demo(['mode' => 'offline', 'once' => false, 'latency' => 100]);

    $page->click('[data-test=like-blade]')
        ->click('[data-example="13"] [data-test=blade-list] li:first-child button')
        ->click('[data-test=blade-column-todo] li:first-child button:last-child');

    js($page, 'await T.idle()');

    expect(js($page, "return [T.texts('[data-test=likes-blade]'), T.texts('[data-example=\"13\"] [data-test=blade-list] > li').length, T.texts('[data-test=blade-column-todo] > li').length, T.entries().map(entry => entry.status)]"))
        ->toBe([['41'], 3, 2, ['failed', 'failed', 'failed']]);

    js($page, 'T.net({ latency: 100 })');

    $page->click('[data-test=like-blade]')
        ->click('[data-example="13"] [data-test=blade-list] li:first-child button')
        ->click('[data-test=blade-column-todo] li:first-child button:last-child');

    js($page, 'await T.idle()');

    expect(js($page, "return [T.texts('[data-test=likes-blade]'), T.texts('[data-example=\"13\"] [data-test=blade-list] > li').length, T.texts('[data-test=blade-column-todo] > li').length, T.entries().length]"))
        ->toBe([['42'], 2, 1, 0]);
});

it('never shows Livewire\'s error modal for failed optimistic requests', function () {
    $page = demo(['mode' => 'error', 'once' => false]);

    $page->click('[data-test=like-blade]')->click('[data-test=follow-blade]');
    js($page, 'await T.idle()');

    expect(js($page, 'return [document.getElementById("livewire-error"), T.entries().map(entry => entry.error)]'))
        ->toBe([null, ['Request failed (500)', 'Request failed (500)']]);
});

it('keeps what the server confirmed across a reload', function () {
    $page = demo(['latency' => 200]);

    $page->fill('[data-test=new-task]', 'Persisted')->keys('[data-test=new-task]', 'Enter');
    $page->click('[data-test=blade-column-todo] li:first-child button:last-child');
    js($page, 'await T.idle()');

    $page = demo();

    expect(js($page, "return [T.texts('[data-example=\"3\"] [data-test=blade-list] > li')[0], T.texts('[data-test=blade-column-doing] > li .grow')]"))
        ->toBe(['Persisted', ['Build the plugin', 'Design the API']]);
});

it('renders the whole page without JavaScript errors under normal conditions', function () {
    $page = demo(['latency' => 50]);

    $page->click('[data-test=like-blade]')
        ->click('[data-example="14"] [data-test=blade-list] li:first-child button')
        ->click('[data-test=blade-trash] li:first-child button')
        ->click('[data-test=mark-all]');

    js($page, 'await T.idle()');

    $page->assertNoJavaScriptErrors();
});
