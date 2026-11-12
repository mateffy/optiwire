<div>
<x-demo-card n="19" title="Restore from trash (moving between two lists)" teaches="Presets compose: Delete from one list + Create in the other, with from: 'id' meaning “move, keep the key”. No client id is generated.">
    <x-slot:code>
#[Optimistic\Delete('trash'), Optimistic\Create('files', from: 'id')]
public function restore(string $id) { … }
    </x-slot:code>

    <x-slot:blade>
        <div class="two-lists">
            <div>
                <h3>Files</h3>
                <ul class="list" wire:optimistic.list="files" data-test="blade-files">
                    @foreach ($this->files as $file)
                        <li @optimisticRow($file) class="row">
                            <span class="grow">{{ $file->name }}</span>
                            <button class="btn small ghost" wire:click="trashFile('{{ $file->id }}')">Trash</button>
                        </li>
                    @endforeach
                    <template wire:optimistic.create>
                        <li class="row" wire:optimistic.class="opt-pending"><span class="grow" wire:optimistic.text="name"></span><span class="tag">restoring</span></li>
                    </template>
                </ul>
            </div>
            <div>
                <h3>Trash</h3>
                <ul class="list" wire:optimistic.list="trash" data-test="blade-trash">
                    @foreach ($this->trash as $file)
                        <li @optimisticRow($file) class="row">
                            <span class="grow">{{ $file->name }}</span>
                            <button class="btn small ghost" wire:click="restore('{{ $file->id }}')">Restore</button>
                        </li>
                    @endforeach
                    <template wire:optimistic.create>
                        <li class="row" wire:optimistic.class="opt-pending"><span class="grow" wire:optimistic.text="name"></span><span class="tag">trashing</span></li>
                    </template>
                </ul>
            </div>
        </div>
    </x-slot:blade>

    <x-slot:alpine>
        <div class="two-lists">
            <div>
                <h3>Files</h3>
                <ul class="list" data-test="alpine-files">
                    <template x-for="file in $wire.files" :key="file.id">
                        <li wire:optimistic.key="file.id" class="row" wire:optimistic.class="opt-pending">
                            <span class="grow" x-text="file.name"></span>
                            <button class="btn small ghost" @click="$wire.trashFile(file.id)">Trash</button>
                        </li>
                    </template>
                </ul>
            </div>
            <div>
                <h3>Trash</h3>
                <ul class="list" data-test="alpine-trash">
                    <template x-for="file in $wire.trash" :key="file.id">
                        <li wire:optimistic.key="file.id" class="row" wire:optimistic.class="opt-pending">
                            <span class="grow" x-text="file.name"></span>
                            <button class="btn small ghost" @click="$wire.restore(file.id)">Restore</button>
                        </li>
                    </template>
                </ul>
            </div>
        </div>
    </x-slot:alpine>
</x-demo-card>
</div>
