<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Illuminate\Support\Facades\Validator;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Task;

class TodoAdd extends Component
{
    const ORDER = ['done' => 'asc', 'created_at' => 'desc'];

    #[Computed, Optimistic\Ordered(self::ORDER), Optimistic\Expose]
    public function tasks()
    {
        $query = Task::where('bucket', 'add');

        foreach (self::ORDER as $column => $direction) {
            $query->orderBy($column, $direction);
        }

        return $query->get();
    }

    #[Optimistic\Create('tasks', with: ['created_at' => 'new Date().toISOString()'], set: ['done' => false])]
    public function addTask(string $id, string $text): void
    {
        Validator::make(['text' => $text], ['text' => 'required|max:60'], [], ['text' => 'task'])->validate();

        Task::create(['id' => $id, 'text' => $text, 'bucket' => 'add']);
    }

    #[Optimistic\Update('tasks')]
    public function setDone(string $id, bool $done): void
    {
        Task::where('bucket', 'add')->findOrFail($id)->update(['done' => $done]);
    }

    public function render()
    {
        return view('livewire.todo-add');
    }
}
