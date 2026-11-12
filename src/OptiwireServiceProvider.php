<?php

namespace Mateffy\Optiwire;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Livewire\Drawer\Utils;
use Livewire\Livewire;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class OptiwireServiceProvider extends PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package
            ->name('optiwire')
            ->hasConfigFile();
    }

    public function packageRegistered(): void
    {
        // Livewire wires up component hooks while it boots, so ours has to be
        // registered before any provider boots.
        $this->app->booting(fn () => Livewire::componentHook(SupportOptiwire::class));
    }

    public function packageBooted(): void
    {
        Blade::directive('optirow', fn ($expression) => "<?php echo \\Mateffy\\Optiwire\\Row::attributes({$expression}); ?>");

        Route::get(config('optiwire.route', 'optiwire/optiwire.js'), fn () => Utils::pretendResponseIsFile(SupportOptiwire::scriptPath()))
            ->name('optiwire.script');
    }
}
