<?php

namespace Capevace\OptimisticUI;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Livewire\Drawer\Utils;
use Livewire\Livewire;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class OptimisticServiceProvider extends PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package
            ->name('livewire-optimistic-ui')
            ->hasConfigFile();
    }

    public function packageRegistered(): void
    {
        // Livewire wires up component hooks while it boots, so ours has to be
        // registered before any provider boots.
        $this->app->booting(fn () => Livewire::componentHook(SupportOptimisticUI::class));
    }

    public function packageBooted(): void
    {
        Blade::directive('optimisticRow', fn ($expression) => "<?php echo \\Capevace\\OptimisticUI\\Row::attributes({$expression}); ?>");

        Route::get(config('livewire-optimistic-ui.route', 'livewire-optimistic-ui/optimistic.js'), fn () => Utils::pretendResponseIsFile(SupportOptimisticUI::scriptPath()))
            ->name('livewire-optimistic-ui.script');
    }
}
