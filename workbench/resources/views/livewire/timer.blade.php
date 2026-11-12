<div>
<x-demo-card n="20" title="Timer start/stop (a value that keeps changing)" teaches="The client's timestamp ($now) is a guess. The server's own timestamp corrects it through the snapshot diff; because patches are written through, an agreeing server value causes no re-render at all.">
    <x-slot:code>
#[Optimistic('$wire.startedAt = $now')]
public function start() { … }
    </x-slot:code>

    <x-slot:blade>
        <div class="timer" x-data="{ now: Date.now() }" x-init="setInterval(() => now = Date.now(), 250)">
            <span class="clock" x-text="$wire.startedAt ? Math.max(0, (now - Date.parse($wire.startedAt)) / 1000).toFixed(1) + 's' : '—'"></span>
            <button class="btn" wire:click="start" wire:show="! startedAt" wire:optimistic.class="opt-pending">Start</button>
            <button class="btn" wire:click="stop" wire:show="startedAt" wire:optimistic.class="opt-pending">Stop</button>
        </div>
    </x-slot:blade>

    <x-slot:alpine>
        <div class="timer" x-data="{ now: Date.now() }" x-init="setInterval(() => now = Date.now(), 250)">
            <span class="clock" x-text="$wire.startedAt ? Math.max(0, (now - Date.parse($wire.startedAt)) / 1000).toFixed(1) + 's' : '—'"></span>
            <button class="btn" x-show="! $wire.startedAt" @click="$wire.start()" wire:optimistic.class="opt-pending">Start</button>
            <button class="btn" x-show="$wire.startedAt" @click="$wire.stop()" wire:optimistic.class="opt-pending">Stop</button>
        </div>
    </x-slot:alpine>

    <x-truth :paths="['startedAt' => 'startedAt']" />
</x-demo-card>
</div>
