<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Task;

class UndoDelete extends Component
{
    #[Computed, Optimistic\Expose]
    public function tasks()
    {
        return Task::where('bucket', 'undo')->orderBy('text')->get();
    }

    #[Optimistic\Delete('tasks', undo: 5)]
    public function deleteTask(string $id): void
    {
        Task::where('bucket', 'undo')->findOrFail($id)->delete();
    }

    public function render()
    {
        return view('livewire.undo-delete');
    }
}
