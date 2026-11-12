<div>
<x-demo-card n="17" title="Assign a user (a relation, not a scalar)" teaches="The parameter is an id but the UI shows the related person. with: derives the person from data already on the client ($wire.people).">
    <x-slot:code>
#[Optimistic\Update('issues', with: ['assignee' => '$wire.people.find(person => person.id === assignee_id) ?? null'])]
public function assign(string $id, int $assignee_id) { … }
    </x-slot:code>

    <x-slot:blade>
        <ul class="list" wire:optimistic.list="issues" data-test="blade-list">
            @foreach ($this->issues as $issue)
                <li @optirow($issue, ['assignee']) class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="dot" style="background: {{ $issue->assignee?->color ?? '#cbd5e1' }}" wire:optimistic.bind.style="'background: ' + ($item.assignee?.color ?? '#cbd5e1')"></span>
                    <span class="grow">{{ $issue->title }} · <span wire:optimistic.text="assignee.name">{{ $issue->assignee?->name }}</span></span>
                    <select @change="$wire.assign('{{ $issue->id }}', +$el.value)">
                        @foreach ($this->people as $person)
                            <option value="{{ $person->id }}" @selected($person->id === $issue->assignee_id)>{{ $person->name }}</option>
                        @endforeach
                    </select>
                </li>
            @endforeach
        </ul>
    </x-slot:blade>

    <x-slot:alpine>
        <ul class="list" data-test="alpine-list">
            <template x-for="issue in $wire.issues" :key="issue.id">
                <li wire:optimistic.key="issue.id" class="row" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
                    <span class="dot" :style="'background: ' + (issue.assignee?.color ?? '#cbd5e1')"></span>
                    <span class="grow"><span x-text="issue.title"></span> · <span x-text="issue.assignee?.name"></span></span>
                    <select @change="$wire.assign(issue.id, +$el.value)">
                        <template x-for="person in $wire.people" :key="person.id">
                            <option :value="person.id" :selected="person.id === issue.assignee_id" x-text="person.name"></option>
                        </template>
                    </select>
                </li>
            </template>
        </ul>
    </x-slot:alpine>
</x-demo-card>
</div>
