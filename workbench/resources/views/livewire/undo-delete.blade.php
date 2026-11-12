<div>
<x-demo-card n="4" title="Delete with undo" teaches="The row disappears at once, but the request only goes out after 5 seconds. Undo cancels it, so the server never sees it. Leaving the page sends pending deletes right away.">
    <x-slot:code>
#[Optimistic\Delete('tasks', undo: 5)]
public function deleteTask(string $id) { … }
    </x-slot:code>

    <div class="toast" wire:optimistic.show.undoable x-data="{ now: Date.now() }" x-init="setInterval(() => now = Date.now(), 200)" data-test="undo-toast">
        <span>Deleted <b x-text="$optimistic.undoable().length"></b>.
            Sending in <span x-text="Math.max(0, Math.ceil((($optimistic.undoable()[0]?.undoUntil ?? now) - now) / 1000))"></span>s</span>
        <button class="btn small" wire:optimistic.undo data-test="undo">Undo</button>
    </div>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="tasks" data-test="blade-list">
            @foreach ($this->tasks as $task)
                <li @optirow($task) class="row">
                    <span>{{ $task->text }}</span>
                    <button class="btn small ghost" wire:click="deleteTask('{{ $task->id }}')">×</button>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="task in $wire.tasks" :key="task.id">
                <li wire:optimistic.key="task.id" class="row">
                    <span x-text="task.text"></span>
                    <button class="btn small ghost" @click="$wire.deleteTask(task.id)">×</button>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
