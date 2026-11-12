<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\On;
use Livewire\Component;
use Workbench\App\Models\DemoNotification;

#[Optimistic\On('notifications-read', 'if ($event.id === undefined) $wire.unread = 0; else $wire.unread = Math.max(0, $wire.unread - 1)')]
class NavBadge extends Component
{
    public int $unread = 0;

    public function mount(): void
    {
        $this->refreshCount();
    }

    #[On('notifications-read')]
    public function refreshCount(): void
    {
        $this->unread = DemoNotification::whereNull('read_at')->count();
    }

    public function render()
    {
        return view('livewire.nav-badge');
    }
}
