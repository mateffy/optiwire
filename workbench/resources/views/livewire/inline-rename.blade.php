<div>
<x-demo-card n="5" title="Inline rename with debounce" teaches="squash: only the latest unsent rename per row survives, and a slow response for “Hel” can't overwrite “Hello”. Clearing the name or going over 40 characters gets rejected by the server and rolled back.">
    <x-slot:code>
#[Optimistic\Update('tasks', squash: true)]
public function rename(string $id, string $text) { … Optimistic::reject('A task needs a name.') … }
    </x-slot:code>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="tasks" data-test="blade-list">
            @foreach ($this->tasks as $task)
                <li @optimisticRow($task, ['text']) class="row column-row">
                    <input class="input" value="{{ $task->text }}" wire:optimistic.bind.value="$item.text"
                           @input.debounce.400ms="$wire.rename('{{ $task->id }}', $el.value)"
                           wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="status" wire:optimistic.show.pending>saving…</span>
                    <span class="status error" wire:optimistic.show.failed x-text="$optimistic.error('{{ $task->id }}')"></span>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="task in $wire.tasks" :key="task.id">
                <li wire:optimistic.key="task.id" class="row column-row">
                    <input class="input" :value="task.text" @input.debounce.400ms="$wire.rename(task.id, $el.value)"
                           wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="status" wire:optimistic.show.pending>saving…</span>
                    <span class="status error" wire:optimistic.show.failed x-text="$optimistic.error(task.id)"></span>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
