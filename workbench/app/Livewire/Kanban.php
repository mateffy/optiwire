<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Card;

class Kanban extends Component
{
    const COLUMNS = ['todo' => 'To do', 'doing' => 'Doing', 'done' => 'Done'];

    #[Computed, Optimistic\Ordered(['position' => 'asc'], groupBy: 'column'), Optimistic\Expose]
    public function cards()
    {
        return Card::orderBy('position')->get();
    }

    // The client doesn't know the server's next position, but "now" sorts
    // after every existing position, which is where the server puts it too.
    #[Optimistic\Update('cards', with: ['position' => 'Date.now()'])]
    public function moveCard(string $id, string $column): void
    {
        abort_unless(array_key_exists($column, self::COLUMNS), 422);

        Card::findOrFail($id)->update([
            'column' => $column,
            'position' => Card::max('position') + 1,
        ]);
    }

    public function render()
    {
        return view('livewire.kanban', ['columns' => self::COLUMNS]);
    }
}
