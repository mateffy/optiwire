<div>
<x-demo-card n="16" title="Avatar upload with an instant preview" teaches="The preview appears the moment you pick a file, before the upload finishes. If the upload fails or validation rejects it (try an image over 1 MB or a non-image), the old avatar comes back. Livewire's temporaryUrl() only works after the upload.">
    <x-slot:code>
&lt;img src="&#123;&#123; $avatarUrl &#125;&#125;" wire:optimistic.preview="avatar"&gt;
&lt;input type="file" wire:model="avatar"&gt;
    </x-slot:code>

    <x-slot:blade>
        <div class="avatar-upload">
            <img class="avatar-lg" src="{{ $avatarUrl }}" wire:optimistic.preview="avatar" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed" data-test="avatar">
            <input type="file" wire:model="avatar" data-test="avatar-input">
            <p class="error" wire:optimistic.show.failed x-text="$optimistic.error()"></p>
        </div>
    </x-slot:blade>
</x-demo-card>
</div>
