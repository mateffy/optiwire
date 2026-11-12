<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Task;

class TodoChecklist extends Component
{
    #[Computed, Optimistic\Expose]
    public function tasks()
    {
        return Task::where('bucket', 'checklist')->orderBy('created_at')->orderBy('text')->get();
    }

    #[Optimistic\Update('tasks')]
    public function setDone(string $id, bool $done): void
    {
        Task::where('bucket', 'checklist')->findOrFail($id)->update(['done' => $done]);
    }

    public function render()
    {
        return view('livewire.todo-checklist');
    }
}
