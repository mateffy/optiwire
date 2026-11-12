<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Task;

class InlineRename extends Component
{
    #[Computed, Optimistic\Expose]
    public function tasks()
    {
        return Task::where('bucket', 'rename')->orderBy('created_at')->get();
    }

    #[Optimistic\Update('tasks', squash: true)]
    public function rename(string $id, string $text): void
    {
        if (trim($text) === '') {
            Optimistic::reject('A task needs a name.');
        }

        if (mb_strlen($text) > 40) {
            Optimistic::reject('Keep it under 40 characters.');
        }

        Task::where('bucket', 'rename')->findOrFail($id)->update(['text' => $text]);
    }

    public function render()
    {
        return view('livewire.inline-rename');
    }
}
