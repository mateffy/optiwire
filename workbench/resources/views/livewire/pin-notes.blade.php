<div>
<x-demo-card n="6" title="Pin to top" teaches="An edit that changes the sort order. set: covers values that aren't parameters. The note moves into the pinned group immediately; the server's ORDER BY decides the exact spot once it answers.">
    <x-slot:code>
#[Computed, Optimistic\Ordered(['pinned' => 'desc', 'title' => 'asc'])]
#[Optimistic\Update('notes', set: ['pinned' => true])]
public function pin(string $id) { … }
    </x-slot:code>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="notes" data-test="blade-list">
            @foreach ($this->notes as $note)
                <li @optimisticRow($note) class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="pin" wire:optimistic.show="$item.pinned">📌</span>
                    <span class="grow">{{ $note->title }}</span>
                    <button class="btn small ghost" wire:click="pin('{{ $note->id }}')" wire:optimistic.show="! $item.pinned">Pin</button>
                    <button class="btn small ghost" wire:click="unpin('{{ $note->id }}')" wire:optimistic.show="$item.pinned">Unpin</button>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="note in $wire.notes" :key="note.id">
                <li wire:optimistic.key="note.id" class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="pin" x-show="note.pinned">📌</span>
                    <span class="grow" x-text="note.title"></span>
                    <button class="btn small ghost" x-show="! note.pinned" @click="$wire.pin(note.id)">Pin</button>
                    <button class="btn small ghost" x-show="note.pinned" @click="$wire.unpin(note.id)">Unpin</button>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
