<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Page;

class DuplicatePages extends Component
{
    #[Computed, Optimistic\Ordered(['title' => 'asc']), Optimistic\Expose]
    public function pages()
    {
        return Page::orderBy('title')->get();
    }

    #[Optimistic\Create('pages', from: 'source', with: ['title' => '($wire.pages.find(p => p.id === source)?.title ?? "Page") + " (copy)"'])]
    public function duplicate(string $id, string $source): void
    {
        $original = Page::findOrFail($source);

        Page::create(['id' => $id, 'title' => $original->title.' (copy)']);
    }

    public function render()
    {
        return view('livewire.duplicate-pages');
    }
}
