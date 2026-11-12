<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Component;
use Workbench\App\Models\Kv;

class SettingsToggles extends Component
{
    const DEFINITIONS = [
        'email' => 'Email me about mentions',
        'digest' => 'Send a weekly digest',
        'beta' => 'Enable beta features',
    ];

    public array $settings = [];

    public function mount(): void
    {
        $this->settings = $this->stored();
    }

    #[Optimistic('$wire.settings[key] = value')]
    public function setSetting(string $key, bool $value): void
    {
        abort_unless(array_key_exists($key, self::DEFINITIONS), 422);

        $settings = $this->stored();
        $settings[$key] = $value;
        Kv::put('settings', $settings);
        $this->settings = $settings;
    }

    protected function stored(): array
    {
        return array_merge(array_fill_keys(array_keys(self::DEFINITIONS), false), Kv::get('settings', []));
    }

    public function render()
    {
        return view('livewire.settings-toggles', ['definitions' => self::DEFINITIONS]);
    }
}
