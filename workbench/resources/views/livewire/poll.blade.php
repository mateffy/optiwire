<div>
<x-demo-card n="10" title="Poll vote (switching your vote)" teaches="A patch that depends on state, which no preset could express: three lines of JS against $wire, all undone on failure.">
    <x-slot:code>
#[Optimistic('if ($wire.myVote === option) return; if ($wire.myVote) $wire.votes[$wire.myVote]--; $wire.votes[option]++; $wire.myVote = option')]
public function vote(int $option) { … }
    </x-slot:code>

    <x-slot:blade>
        @foreach ($options as $option)
            <button class="vote" wire:click="vote({{ $option['id'] }})" wire:bind:class="myVote === {{ $option['id'] }} ? 'is-on' : ''"
                    wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                <span class="bar" x-bind:style="'width:' + Math.min(100, ($wire.votes[{{ $option['id'] }}] ?? 0) * 4) + '%'"></span>
                <span class="grow">{{ $option['label'] }}</span>
                <b wire:text="votes[{{ $option['id'] }}]">{{ $votes[$option['id']] ?? 0 }}</b>
            </button>
        @endforeach
    </x-slot:blade>

    <x-slot:alpine>
        <template x-for="option in $wire.options" :key="option.id">
            <button class="vote" @click="$wire.vote(option.id)" :class="$wire.myVote === option.id && 'is-on'"
                    wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                <span class="bar" :style="'width:' + Math.min(100, ($wire.votes[option.id] ?? 0) * 4) + '%'"></span>
                <span class="grow" x-text="option.label"></span>
                <b x-text="$wire.votes[option.id]"></b>
            </button>
        </template>
    </x-slot:alpine>
</x-demo-card>
</div>
