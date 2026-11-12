<?php

namespace Mateffy\Optiwire\Tests\Fixtures;

use Mateffy\Optiwire\Optimistic;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Livewire\Attributes\Computed;
use Livewire\Component;

class Plain extends Component
{
    public int $count = 0;

    public function increment(): void
    {
        $this->count++;
    }

    public function render()
    {
        return '<div>{{ $count }}</div>';
    }
}

#[Optimistic\On('saved', '$wire.count = 0')]
class Kitchen extends Component
{
    public int $count = 0;

    public array $log = [];

    public bool $explode = false;

    #[Optimistic('$wire.count++', dispatch: 'bumped', squash: true, retry: true, undo: 2.5, timeout: 1000)]
    public function bump(): int
    {
        $this->count++;
        $this->log[] = 'bump';

        return $this->count;
    }

    #[Optimistic]
    public function silent(): void
    {
        $this->log[] = 'silent';
    }

    #[Optimistic\Create('tasks', with: ['at' => '$now'], set: ['done' => false])]
    public function add(string $id, string $text): string
    {
        $this->log[] = "add:{$id}:{$text}:".(Optimistic::id() ?? 'none').':'.(Optimistic::active() ? 'active' : 'inactive');

        return $id;
    }

    #[Optimistic\Create('tasks', from: 'source')]
    public function duplicate(string $id, string $source): void
    {
        $this->log[] = "duplicate:{$id}:{$source}";
    }

    #[Optimistic\Delete('trash'), Optimistic\Create('files', from: 'id')]
    public function restore(string $id): void
    {
        $this->log[] = "restore:{$id}";
    }

    #[Optimistic\Create('tasks')]
    public function addWithoutKey(string $text): void {}

    #[Optimistic\Create('tasks')]
    public function addWithMarkedKey(#[Optimistic\Key] string $uuid, string $text): void {}

    #[Optimistic\Update('tasks', set: ['pinned' => true])]
    public function pin(string $id): void {}

    #[Optimistic\Update('tasks', all: true, with: ['read_at' => '$now'])]
    public function readAll(): void {}

    #[Optimistic\Update('tasks', key: 'task')]
    public function rename(string $task, string $text): void {}

    #[Optimistic\Delete('emails')]
    public function archive(array $ids): void {}

    #[Optimistic\Delete('emails')]
    public function deleteWithoutKey(string $name): void {}

    #[Optimistic('$wire.count += amount')]
    public function guarded(int $amount): void
    {
        if ($amount > 10) {
            Optimistic::reject('Too much');
        }

        $this->count += $amount;
    }

    #[Optimistic]
    public function validated(string $text): void
    {
        Validator::make(['text' => $text], ['text' => 'required'])->validate();
    }

    #[Optimistic]
    public function crash(): void
    {
        throw new \RuntimeException('Boom');
    }

    #[Optimistic]
    public function rejectWithoutMessage(): void
    {
        Optimistic::reject('');
    }

    public function plainReject(): void
    {
        Optimistic::reject('Outside');
    }

    #[Computed, Optimistic\Ordered(['done' => 'asc', 'created_at' => 'DESC', 'title'], groupBy: 'column', stable: true, insert: 'start', key: 'uuid'), Optimistic\Expose]
    public function tasks(): Collection
    {
        return collect([['uuid' => 'a', 'title' => 'A']]);
    }

    #[Computed, Optimistic\Ordered(list: 'leaderboard', js: '[-item.score]', fields: ['score'])]
    public function scores(): array
    {
        return [];
    }

    #[Computed, Optimistic\Expose(as: 'people')]
    public function team(): \JsonSerializable
    {
        return new class implements \JsonSerializable
        {
            public function jsonSerialize(): array
            {
                return [['id' => 1, 'name' => 'Ada']];
            }
        };
    }

    #[Computed, Optimistic\Expose]
    public function scalar(): int
    {
        return 5;
    }

    #[Optimistic\Defaults('tasks')]
    public function taskDefaults(): array
    {
        return ['author' => 'You'];
    }

    #[Optimistic\Defaults('notes')]
    public function noteDefaults(): array
    {
        return [];
    }

    #[Optimistic\On('reset', '$wire.count = -1')]
    public function onReset(): void {}

    public function render()
    {
        return '<div>{{ $count }}</div>';
    }
}

class BadKey extends Component
{
    #[Optimistic\Update('tasks', key: 'missing')]
    public function update(string $id): void {}

    public function render()
    {
        return '<div></div>';
    }
}

class Rows extends Component
{
    public array $items = [];

    #[Computed, Optimistic\Ordered(['done' => 'asc', 'due_at' => 'desc'], groupBy: 'column')]
    public function tasks()
    {
        return collect();
    }

    public function render()
    {
        return view('rows');
    }
}

class RowsWithoutLists extends Component
{
    public function render()
    {
        return view('rows-plain');
    }
}

class RowsWithCustomKey extends Component
{
    #[Computed, Optimistic\Ordered(['title' => 'asc'], key: 'uuid')]
    public function tasks()
    {
        return collect();
    }

    public function render()
    {
        return view('rows-custom-key');
    }
}
