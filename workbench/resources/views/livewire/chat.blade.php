<div>
<x-demo-card n="8" title="Chat: pending, failed, retry" teaches="Defaults lets a pending message show your own name and avatar. With retry: true a failed message stays visible as failed instead of vanishing. Retry resends it with the same action id, so the server never stores it twice (try the 'Lost response' network mode).">
    <x-slot:code>
#[Optimistic\Defaults('messages')]
public function messageDefaults() { return ['author' => 'You', 'avatar' => '#6366f1']; }

#[Optimistic\Create('messages', with: ['sent_at' => 'new Date().toISOString()'], retry: true)]
public function send(string $id, string $body) { … }
    </x-slot:code>

    <form x-data="{ body: '' }" @submit.prevent="if (body.trim()) { $wire.send(body); body = '' }" class="add" data-test="chat-form">
        <input x-model="body" placeholder="Say something…" data-test="chat-input">
        <button class="btn">Send</button>
    </form>

    <x-slot:blade>
        <ul class="chat" wire:optimistic.list="messages" data-test="blade-list">
            @foreach ($this->messages as $message)
                <li @optirow($message) class="msg">
                    <span class="avatar" style="background: {{ $message->avatar }}"></span>
                    <div><b>{{ $message->author }}</b><p>{{ $message->body }}</p></div>
                </li>
            @endforeach

            <template wire:optimistic.create>
                <li class="msg" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="avatar" wire:optimistic.bind.style="'background: ' + $item.avatar"></span>
                    <div>
                        <b wire:optimistic.text="author"></b>
                        <p wire:optimistic.text="body"></p>
                        <span class="status" wire:optimistic.show.pending>Sending…</span>
                        <span class="status error" wire:optimistic.show.failed>
                            Not sent. <button class="link" wire:optimistic.retry data-test="retry">Retry</button>
                            <button class="link" wire:optimistic.dismiss>Discard</button>
                        </span>
                    </div>
                </li>
            </template>
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="chat" data-test="alpine-list">
            <template x-for="message in $wire.messages" :key="message.id">
                <li wire:optimistic.key="message.id" class="msg" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="avatar" :style="'background: ' + message.avatar"></span>
                    <div>
                        <b x-text="message.author"></b>
                        <p x-text="message.body"></p>
                        <span class="status" wire:optimistic.show.pending>Sending…</span>
                        <span class="status error" wire:optimistic.show.failed>
                            Not sent. <button class="link" wire:optimistic.retry>Retry</button>
                            <button class="link" wire:optimistic.dismiss>Discard</button>
                        </span>
                    </div>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
