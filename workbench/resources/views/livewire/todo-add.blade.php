<div>
<x-demo-card n="3" title="Add todo (create, sorted)" teaches="The client fills in $id with a UUIDv7, so $wire.addTask(text) takes one argument. New tasks are inserted where the server's ORDER BY (done asc, created_at desc) would put them. Ticking one moves it down.">
    <x-slot:code>
#[Computed, Optimistic\Ordered(['done' => 'asc', 'created_at' => 'desc']), Optimistic\Expose]
public function tasks() { … }

#[Optimistic\Create('tasks', with: ['created_at' => 'new Date().toISOString()'], set: ['done' => false])]
public function addTask(string $id, string $text) { … }
    </x-slot:code>

    <form x-data="{ text: '' }" @submit.prevent="$wire.addTask(text); text = ''" class="add" data-test="add-form">
        <input x-model="text" placeholder="New task… (longer than 60 chars gets rejected)" data-test="new-task">
        <button class="btn">Add</button>
    </form>
    <p class="error" wire:optimistic.show.failed x-text="$optimistic.error()" data-test="add-error"></p>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="tasks" data-test="blade-list">
            @foreach ($this->tasks as $task)
                <li @optirow($task) class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed"
                    wire:optimistic.bind.class="$item.done ? 'is-done' : ''">
                    <input type="checkbox" @checked($task->done) wire:optimistic.bind.checked="$item.done"
                           wire:click="setDone('{{ $task->id }}', $event.target.checked)">
                    <span>{{ $task->text }}</span>
                </li>
            @endforeach

            <template wire:optimistic.create>
                <li class="row" wire:optimistic.class="opt-pending">
                    <input type="checkbox" disabled>
                    <span wire:optimistic.text="text"></span>
                    <span class="tag">new</span>
                </li>
            </template>
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="task in $wire.tasks" :key="task.id">
                <li wire:optimistic.key="task.id" class="row" :class="task.done && 'is-done'" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <input type="checkbox" :checked="task.done" @click="$wire.setDone(task.id, $el.checked)">
                    <span x-text="task.text"></span>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
