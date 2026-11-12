<div class="nav-badge" data-test="nav-badge">
    <span>🔔 Inbox</span>
    <span class="badge-count" wire:text="unread" wire:show="unread > 0" data-test="unread">{{ $unread }}</span>
    <x-truth :paths="['unread' => 'unread']" />
</div>
