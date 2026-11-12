<div>
<x-demo-card n="11" title="Mark notifications read + a badge in another component" teaches="Cross-component patches: the list dispatches an optimistic event, the badge (a separate Livewire component) patches itself. If the list's request fails, the badge's patch rolls back too. The badge keeps its patch until its own refresh arrives, so it never flickers back.">
    <x-slot:code>
#[Optimistic\Update('notifications', all: true, with: ['read_at' => 'new Date().toISOString()'], dispatch: 'notifications-read')]
public function markAllRead() { … }

#[Optimistic\On('notifications-read', '$wire.unread = 0')]   // on NavBadge
    </x-slot:code>

    <div class="row-between">
        <livewire:demo.nav-badge />
        <button class="btn small" wire:click="markAllRead" data-test="mark-all">Mark all read</button>
    </div>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="notifications" data-test="blade-list">
            @foreach ($this->notifications as $notification)
                <li @optirow($notification, ['read_at']) class="row" wire:optimistic.bind.class="$item.read_at ? '' : 'unread'"
                    wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="grow">{{ $notification->title }}</span>
                    <button class="btn small ghost" wire:click="markRead({{ $notification->id }})" wire:optimistic.show="! $item.read_at">Read</button>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="notification in $wire.notifications" :key="notification.id">
                <li wire:optimistic.key="notification.id" class="row" :class="! notification.read_at && 'unread'"
                    wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="grow" x-text="notification.title"></span>
                    <button class="btn small ghost" x-show="! notification.read_at" @click="$wire.markRead(notification.id)">Read</button>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
