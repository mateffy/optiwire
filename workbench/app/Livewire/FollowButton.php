<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Component;
use Workbench\App\Models\Person;

class FollowButton extends Component
{
    public int $personId;

    public string $name = '';

    public bool $following = false;

    public int $followers = 0;

    public function mount(): void
    {
        $this->personId = Person::orderBy('id')->value('id');
        $this->sync();
    }

    #[Optimistic('$wire.following = !$wire.following; $wire.followers += $wire.following ? 1 : -1')]
    public function toggleFollow(): void
    {
        $person = Person::findOrFail($this->personId);
        $person->following = ! $person->following;
        $person->followers += $person->following ? 1 : -1;
        $person->save();

        $this->sync();
    }

    protected function sync(): void
    {
        $person = Person::findOrFail($this->personId);
        $this->name = $person->name;
        $this->following = $person->following;
        $this->followers = $person->followers;
    }

    public function render()
    {
        return view('livewire.follow-button');
    }
}
