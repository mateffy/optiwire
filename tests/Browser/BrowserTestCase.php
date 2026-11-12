<?php

namespace Capevace\OptimisticUI\Tests\Browser;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Orchestra\Testbench\Concerns\WithWorkbench;
use Orchestra\Testbench\TestCase as Orchestra;
use Workbench\Database\Seeders\DatabaseSeeder;

class BrowserTestCase extends Orchestra
{
    use RefreshDatabase;
    use WithWorkbench;

    protected bool $seed = true;

    protected string $seeder = DatabaseSeeder::class;

    protected function setUp(): void
    {
        parent::setUp();

        app('livewire')->flushState();
    }

    protected function defineEnvironment($app)
    {
        $app['config']->set('database.default', 'testing');
        $app['config']->set('session.driver', 'file');
        $app['config']->set('cache.default', 'array');
    }

    protected function defineDatabaseMigrations()
    {
        $this->loadMigrationsFrom(dirname(__DIR__, 2).'/workbench/database/migrations');
    }
}
