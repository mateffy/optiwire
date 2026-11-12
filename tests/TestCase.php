<?php

namespace Capevace\OptimisticUI\Tests;

use Capevace\OptimisticUI\OptimisticServiceProvider;
use Livewire\LivewireServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

class TestCase extends Orchestra
{
    protected function setUp(): void
    {
        parent::setUp();

        // Livewire keeps rendered assets in static state that it flushes per
        // request in real apps; tests share one process.
        app('livewire')->flushState();
    }

    protected function getPackageProviders($app)
    {
        return [
            LivewireServiceProvider::class,
            OptimisticServiceProvider::class,
        ];
    }

    protected function defineEnvironment($app)
    {
        $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('a', 32)));
        $app['config']->set('database.default', 'testing');
        $app['config']->set('cache.default', 'array');
        $app['config']->set('view.paths', [__DIR__.'/Fixtures/views']);
    }
}
