<div>
<x-demo-card n="14" title="Duplicate an item" teaches="from: gives Blade mode a way to create items without a template: the source row is cloned and re-keyed. The client id fills $id, your argument goes to $source.">
    <x-slot:code>
#[Optimistic\Create('pages', from: 'source', with: ['title' => '… + " (copy)"'])]
public function duplicate(string $id, string $source) { … }
    </x-slot:code>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="pages" data-test="blade-list">
            @foreach ($this->pages as $page)
                <li @optirow($page) class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="grow" wire:optimistic.text="title">{{ $page->title }}</span>
                    <button class="btn small ghost" wire:click="duplicate('{{ $page->id }}')">Duplicate</button>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="page in $wire.pages" :key="page.id">
                <li wire:optimistic.key="page.id" class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="grow" x-text="page.title"></span>
                    <button class="btn small ghost" @click="$wire.duplicate(page.id)">Duplicate</button>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
