<?php

it('renders the demo without errors', function () {
    $page = demo();

    $page->assertSee('Livewire Optimistic UI')
        ->assertNoJavaScriptErrors();

    expect(js($page, 'return Livewire.all().length'))->toBe(21)
        ->and(js($page, 'return !! window.Optimistic'))->toBeTrue();
});
