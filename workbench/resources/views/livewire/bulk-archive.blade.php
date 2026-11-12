<div x-data="{ selected: [] }">
<x-demo-card n="12" title="Bulk archive with selection" teaches="An array parameter named $ids means “many keys”. All selected rows disappear in one go and come back together if the request fails.">
    <x-slot:code>
#[Optimistic\Delete('emails')]
public function archive(array $ids) { … }
    </x-slot:code>

    <div class="row-between">
        <span class="muted"><b x-text="selected.length"></b> selected</span>
        <button class="btn small" :disabled="! selected.length" @click="$wire.archive(selected); selected = []" data-test="archive">Archive</button>
    </div>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="emails" data-test="blade-list">
            @foreach ($this->emails as $email)
                <li @optimisticRow($email) class="row">
                    <label><input type="checkbox" value="{{ $email->id }}" x-model.number="selected"> {{ $email->subject }}</label>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="email in $wire.emails" :key="email.id">
                <li wire:optimistic.key="email.id" class="row">
                    <label><input type="checkbox" :value="email.id" x-model.number="selected"> <span x-text="email.subject"></span></label>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
