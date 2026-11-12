<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Component;
use Workbench\App\Models\Kv;

class Timer extends Component
{
    public ?string $startedAt = null;

    public function mount(): void
    {
        $this->startedAt = Kv::get('timer');
    }

    #[Optimistic('$wire.startedAt = $now')]
    public function start(): void
    {
        $this->startedAt = now()->toIso8601ZuluString('millisecond');
        Kv::put('timer', $this->startedAt);
    }

    #[Optimistic('$wire.startedAt = null')]
    public function stop(): void
    {
        $this->startedAt = null;
        Kv::put('timer', null);
    }

    public function render()
    {
        return view('livewire.timer');
    }
}
