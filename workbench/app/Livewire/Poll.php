<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Component;
use Workbench\App\Models\Kv;
use Workbench\App\Models\PollOption;

class Poll extends Component
{
    public array $options = [];

    public array $votes = [];

    public ?int $myVote = null;

    public function mount(): void
    {
        $this->options = PollOption::orderBy('id')->get(['id', 'label'])->toArray();
        $this->sync();
    }

    #[Optimistic('if ($wire.myVote === option) return; if ($wire.myVote) $wire.votes[$wire.myVote]--; $wire.votes[option]++; $wire.myVote = option')]
    public function vote(int $option): void
    {
        $previous = Kv::get('poll-vote');

        if ($previous === $option) {
            return;
        }

        if ($previous) {
            PollOption::whereKey($previous)->decrement('votes');
        }

        PollOption::findOrFail($option)->increment('votes');
        Kv::put('poll-vote', $option);

        $this->sync();
    }

    protected function sync(): void
    {
        $this->votes = PollOption::pluck('votes', 'id')->all();
        $this->myVote = Kv::get('poll-vote');
    }

    public function render()
    {
        return view('livewire.poll');
    }
}
