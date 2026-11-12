<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\DemoNotification;

class NotificationList extends Component
{
    #[Computed, Optimistic\Expose]
    public function notifications()
    {
        return DemoNotification::orderBy('id')->get();
    }

    #[Optimistic\Update('notifications', all: true, with: ['read_at' => 'new Date().toISOString()'], dispatch: 'notifications-read')]
    public function markAllRead(): void
    {
        DemoNotification::whereNull('read_at')->update(['read_at' => now()]);

        $this->dispatch('notifications-read');
    }

    #[Optimistic\Update('notifications', with: ['read_at' => 'new Date().toISOString()'], dispatch: 'notifications-read')]
    public function markRead(int $id): void
    {
        DemoNotification::findOrFail($id)->update(['read_at' => now()]);

        $this->dispatch('notifications-read');
    }

    public function render()
    {
        return view('livewire.notification-list');
    }
}
