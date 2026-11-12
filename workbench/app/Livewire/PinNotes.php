<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Note;

class PinNotes extends Component
{
    const ORDER = ['pinned' => 'desc', 'title' => 'asc'];

    #[Computed, Optimistic\Ordered(self::ORDER), Optimistic\Expose]
    public function notes()
    {
        return Note::orderBy('pinned', 'desc')->orderBy('title')->get();
    }

    #[Optimistic\Update('notes', set: ['pinned' => true])]
    public function pin(string $id): void
    {
        Note::findOrFail($id)->update(['pinned' => true]);
    }

    #[Optimistic\Update('notes', set: ['pinned' => false])]
    public function unpin(string $id): void
    {
        Note::findOrFail($id)->update(['pinned' => false]);
    }

    public function render()
    {
        return view('livewire.pin-notes');
    }
}
