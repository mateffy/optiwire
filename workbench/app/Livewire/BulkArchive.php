<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Email;

class BulkArchive extends Component
{
    #[Computed, Optimistic\Expose]
    public function emails()
    {
        return Email::where('archived', false)->orderBy('id')->get();
    }

    #[Optimistic\Delete('emails')]
    public function archive(array $ids): void
    {
        Email::whereKey($ids)->update(['archived' => true]);
    }

    public function render()
    {
        return view('livewire.bulk-archive');
    }
}
