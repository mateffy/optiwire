<?php

use Mateffy\Optiwire\Tests\Browser\BrowserTestCase;
use Mateffy\Optiwire\Tests\TestCase;

require_once __DIR__.'/Fixtures/Components.php';

uses(TestCase::class)->in('Feature', 'ArchTest.php');
uses(BrowserTestCase::class)->in('Browser');

/**
 * Opens the demo page with test helpers loaded and the given network settings.
 */
function demo(array $network = [])
{
    $page = visit('/');
    $page->resize(1600, 1000);
    $page->script(file_get_contents(__DIR__.'/Browser/helpers.js'));
    $page->script('T.net('.json_encode((object) $network).')');

    return $page;
}

function js($page, string $expression): mixed
{
    // A short pause first: Livewire handles the click that came before in a
    // microtask, Alpine renders in the next one.
    return $page->script("(async () => { await T.sleep(20); {$expression} })()");
}
