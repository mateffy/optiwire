<div>
<x-demo-card n="7" title="Kanban: move a card between columns" teaches="Each column is a container for the same list (cards), told which group it shows. groupBy: 'column' tells the client that a card's column field decides its container. Moving a card changes that field, so the card is hidden in its old column and a copy appears in the new one at once. When the server confirms, Livewire's morph adopts the copy. If it fails, the copy disappears and the original comes back.">
    <x-slot:code>
#[Computed, Optimistic\Ordered(['position' => 'asc'], groupBy: 'column')]
public function cards() { … }

#[Optimistic\Update('cards', with: ['position' => 'Date.now()'])]
public function moveCard(string $id, string $column) { … }
    </x-slot:code>

    <x-slot:blade>
        <div class="board" x-data="{ order: @js(array_keys($columns)), step(column, by) { return this.order[this.order.indexOf(column) + by] ?? null } }">
            @foreach ($columns as $column => $label)
                <div class="column">
                    <h3>{{ $label }}</h3>
                    <ul class="list" wire:optimistic.list="cards" wire:optimistic.group="{{ $column }}" data-test="blade-column-{{ $column }}">
                        @foreach ($this->cards->where('column', $column) as $card)
                            <li @optirow($card) class="row card-item" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                                <button class="btn small ghost" :disabled="! step($item.column, -1)" @click="$wire.moveCard($item.id, step($item.column, -1))">←</button>
                                <span class="grow">{{ $card->title }}</span>
                                <button class="btn small ghost" :disabled="! step($item.column, 1)" @click="$wire.moveCard($item.id, step($item.column, 1))">→</button>
                            </li>
                        @endforeach
                    </ul>
                </div>
            @endforeach
        </div>
    </x-slot:blade>

    <x-slot:alpine>
        <div class="board" x-data="{ order: @js(array_keys($columns)), labels: @js($columns), step(column, by) { return this.order[this.order.indexOf(column) + by] ?? null } }">
            <template x-for="column in order" :key="column">
                <div class="column">
                    <h3 x-text="labels[column]"></h3>
                    <ul class="list" :data-test="'alpine-column-' + column">
                        <template x-for="card in $wire.cards.filter(card => card.column === column)" :key="card.id">
                            <li wire:optimistic.key="card.id" class="row card-item" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                                <button class="btn small ghost" :disabled="! step(card.column, -1)" @click="$wire.moveCard(card.id, step(card.column, -1))">←</button>
                                <span class="grow" x-text="card.title"></span>
                                <button class="btn small ghost" :disabled="! step(card.column, 1)" @click="$wire.moveCard(card.id, step(card.column, 1))">→</button>
                            </li>
                        </template>
                    </ul>
                </div>
            </template>
        </div>
    </x-slot:alpine>
</x-demo-card>
</div>
