<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Suggestion;

class DismissSuggestions extends Component
{
    #[Computed, Optimistic\Expose]
    public function suggestions()
    {
        return Suggestion::where('dismissed', false)->orderBy('id')->get();
    }

    #[Optimistic]
    public function dismiss(int $id): void
    {
        Suggestion::findOrFail($id)->update(['dismissed' => true]);
    }

    public function render()
    {
        return view('livewire.dismiss-suggestions');
    }
}
