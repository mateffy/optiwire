<div>
<x-demo-card n="1" title="Like button" teaches="A JS patch against $wire, recorded and rolled back automatically. Click fast: the patches stack and are replayed on top of every server response.">
    <x-slot:code>
#[Optimistic('$wire.liked = !$wire.liked; $wire.likes += $wire.liked ? 1 : -1')]
public function toggleLike() { … }
    </x-slot:code>

    <x-slot:blade>
        <button wire:click="toggleLike" class="btn like" wire:bind:class="liked ? 'is-on' : ''"
                wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed" data-test="like-blade">
            ♥ <span wire:text="likes" data-test="likes-blade">{{ $likes }}</span>
        </button>
    </x-slot:blade>

    <x-slot:alpine>
        <button @click="$wire.toggleLike()" class="btn like" :class="$wire.liked && 'is-on'"
                wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed" data-test="like-alpine">
            ♥ <span x-text="$wire.likes" data-test="likes-alpine"></span>
        </button>
    </x-slot:alpine>

    <x-truth :paths="['likes' => 'likes', 'liked' => 'liked']" />
</x-demo-card>
</div>
