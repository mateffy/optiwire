<div>
<x-demo-card n="15" title="Follow user (state + count + label)" teaches="One patch drives three things on screen: the label, the button style and the follower count.">
    <x-slot:code>
#[Optimistic('$wire.following = !$wire.following; $wire.followers += $wire.following ? 1 : -1')]
public function toggleFollow() { … }
    </x-slot:code>

    <x-slot:blade>
        <div class="profile">
            <b>{{ $name }}</b>
            <span><span wire:text="followers">{{ $followers }}</span> followers</span>
            <button class="btn" wire:click="toggleFollow" wire:bind:class="following ? 'is-on' : ''" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed" data-test="follow-blade">
                <span wire:show="following">Following</span><span wire:show="! following">Follow</span>
            </button>
        </div>
    </x-slot:blade>

    <x-slot:alpine>
        <div class="profile">
            <b x-text="$wire.name"></b>
            <span><span x-text="$wire.followers"></span> followers</span>
            <button class="btn" @click="$wire.toggleFollow()" :class="$wire.following && 'is-on'" x-text="$wire.following ? 'Following' : 'Follow'"
                    wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed"></button>
        </div>
    </x-slot:alpine>

    <x-truth :paths="['following' => 'following', 'followers' => 'followers']" />
</x-demo-card>
</div>
