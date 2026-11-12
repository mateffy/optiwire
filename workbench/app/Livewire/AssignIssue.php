<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Issue;
use Workbench\App\Models\Person;

class AssignIssue extends Component
{
    #[Computed, Optimistic\Expose]
    public function issues()
    {
        return Issue::with('assignee')->orderBy('title')->get();
    }

    #[Computed, Optimistic\Expose]
    public function people()
    {
        return Person::orderBy('name')->get(['id', 'name', 'color']);
    }

    #[Optimistic\Update('issues', with: ['assignee' => '$wire.people.find(person => person.id === assignee_id) ?? null'])]
    public function assign(string $id, int $assignee_id): void
    {
        Issue::findOrFail($id)->update(['assignee_id' => Person::findOrFail($assignee_id)->id]);
    }

    public function render()
    {
        return view('livewire.assign-issue');
    }
}
