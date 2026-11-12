<div>
<x-demo-card n="2" title="Todo checkbox" teaches="The browser ticks the box anyway. The interesting part is failure: wire:optimistic.bind.checked unticks it again on rollback.">
    <x-slot:code>
#[Optimistic\Update('tasks')]
public function setDone(string $id, bool $done) { … }
    </x-slot:code>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="tasks" data-test="blade-list">
            @foreach ($this->tasks as $task)
                <li @optimisticRow($task, ['done']) class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed"
                    wire:optimistic.bind.class="$item.done ? 'is-done' : ''">
                    <label>
                        <input type="checkbox" @checked($task->done) wire:optimistic.bind.checked="$item.done"
                               wire:click="setDone('{{ $task->id }}', $event.target.checked)">
                        <span>{{ $task->text }}</span>
                    </label>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="task in $wire.tasks" :key="task.id">
                <li wire:optimistic.key="task.id" class="row" :class="task.done && 'is-done'" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <label>
                        <input type="checkbox" :checked="task.done" @click="$wire.setDone(task.id, $el.checked)">
                        <span x-text="task.text"></span>
                    </label>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
