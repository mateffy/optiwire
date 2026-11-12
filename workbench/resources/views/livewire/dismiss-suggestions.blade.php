<div>
<x-demo-card n="13" title="Dismiss a row (plain action, no preset)" teaches="The simplest layer: no list, no model, no data. wire:optimistic.remove hides the closest keyed row until the server agrees, and brings it back if it doesn't.">
    <x-slot:code>
#[Optimistic]
public function dismiss(int $id) { … }

&lt;button wire:click="dismiss(1)" wire:optimistic.remove&gt;Dismiss&lt;/button&gt;
    </x-slot:code>

    <x-slot:blade>
        <ul class="list" data-test="blade-list">
            @foreach ($this->suggestions as $suggestion)
                <li wire:key="{{ $suggestion->id }}" class="row">
                    <span class="grow">{{ $suggestion->title }}</span>
                    <button class="btn small ghost" wire:click="dismiss({{ $suggestion->id }})" wire:optimistic.remove>Dismiss</button>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="suggestion in $wire.suggestions" :key="suggestion.id">
                <li wire:optimistic.key="suggestion.id" class="row">
                    <span class="grow" x-text="suggestion.title"></span>
                    <button class="btn small ghost" @click="$wire.dismiss(suggestion.id)" wire:optimistic.remove>Dismiss</button>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
