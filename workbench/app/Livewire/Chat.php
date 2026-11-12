<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Attributes\Computed;
use Livewire\Component;
use Workbench\App\Models\Message;

class Chat extends Component
{
    #[Computed, Optimistic\Ordered(['sent_at' => 'asc']), Optimistic\Expose]
    public function messages()
    {
        return Message::orderBy('sent_at')->get();
    }

    #[Optimistic\Defaults('messages')]
    public function messageDefaults(): array
    {
        return ['author' => 'You', 'avatar' => '#6366f1'];
    }

    #[Optimistic\Create('messages', with: ['sent_at' => 'new Date().toISOString()'], retry: true)]
    public function send(string $id, string $body): void
    {
        if (trim($body) === '') {
            Optimistic::reject('Empty message.');
        }

        Message::create([
            'id' => $id,
            'body' => $body,
            'author' => 'You',
            'avatar' => '#6366f1',
            'sent_at' => now(),
        ]);
    }

    public function render()
    {
        return view('livewire.chat');
    }
}
