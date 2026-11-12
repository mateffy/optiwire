<?php

namespace Workbench\App\Livewire;

use Mateffy\Optiwire\Optimistic;
use Livewire\Component;
use Workbench\App\Models\Kv;

class LikeButton extends Component
{
    public int $likes = 0;

    public bool $liked = false;

    public function mount(): void
    {
        $this->sync();
    }

    #[Optimistic('$wire.liked = !$wire.liked; $wire.likes += $wire.liked ? 1 : -1')]
    public function toggleLike(): void
    {
        $state = Kv::get('post', ['likes' => 41, 'liked' => false]);
        $state['liked'] = ! $state['liked'];
        $state['likes'] += $state['liked'] ? 1 : -1;
        Kv::put('post', $state);

        $this->sync();
    }

    protected function sync(): void
    {
        $state = Kv::get('post', ['likes' => 41, 'liked' => false]);
        $this->likes = $state['likes'];
        $this->liked = $state['liked'];
    }

    public function render()
    {
        return view('livewire.like-button');
    }
}
