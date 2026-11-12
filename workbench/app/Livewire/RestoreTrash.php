<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\File;

class RestoreTrash extends Component
{
    #[Computed, Optimistic\Ordered(['name' => 'asc']), Optimistic\Expose]
    public function files()
    {
        return File::orderBy('name')->get(['id', 'name']);
    }

    #[Computed, Optimistic\Ordered(['name' => 'asc']), Optimistic\Expose]
    public function trash()
    {
        return File::onlyTrashed()->orderBy('name')->get(['id', 'name']);
    }

    #[Optimistic\Delete('trash'), Optimistic\Create('files', from: 'id')]
    public function restore(string $id): void
    {
        File::onlyTrashed()->findOrFail($id)->restore();
    }

    #[Optimistic\Delete('files'), Optimistic\Create('trash', from: 'id')]
    public function trashFile(string $id): void
    {
        File::findOrFail($id)->delete();
    }

    public function render()
    {
        return view('livewire.restore-trash');
    }
}
