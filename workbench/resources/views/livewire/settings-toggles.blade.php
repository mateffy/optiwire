<div>
<x-demo-card n="18" title="Settings toggles" teaches="If the change goes through a method (authorization, side effects), a one-line JS patch keyed by the parameter does the job. Plain properties with wire:model.live are already instant.">
    <x-slot:code>
#[Optimistic('$wire.settings[key] = value')]
public function setSetting(string $key, bool $value) { … }
    </x-slot:code>

    <x-slot:blade>
        @foreach ($definitions as $key => $label)
            <label class="toggle">
                <input type="checkbox" @checked($settings[$key]) wire:bind:checked="settings.{{ $key }}" wire:click="setSetting('{{ $key }}', $event.target.checked)"
                       wire:optimistic.class="opt-pending">
                {{ $label }}
            </label>
        @endforeach
    </x-slot:blade>

    <x-slot:alpine>
        <template x-for="[key, label] in Object.entries(@js($definitions))" :key="key">
            <label class="toggle">
                <input type="checkbox" :checked="$wire.settings[key]" @click="$wire.setSetting(key, $el.checked)" wire:optimistic.class="opt-pending">
                <span x-text="label"></span>
            </label>
        </template>
    </x-slot:alpine>

    <x-truth :paths="['settings' => 'settings']" />
</x-demo-card>
</div>
