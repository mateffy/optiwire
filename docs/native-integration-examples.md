# Native Optimistic UI for Livewire: examples

Every example below is implemented in the workbench demo (`composer run build && composer run serve`, then open http://127.0.0.1:8077). The demo renders each one twice, as shown here: a **Blade `@foreach`** version (rows rendered on the server) and an **Alpine `x-for`** version (rendered on the client from `$wire` data). Both are driven by the same component.

The full reference is in the [README](../README.md).

---

## 0. Decisions made while implementing

- **`@optimisticRow($item)`**, not `@optimistic-row`: Blade directive names can't contain hyphens (Blade only matches `@\w+`).
- **No Tailwind `data-[optimistic=…]` in examples.** States are applied with `wire:optimistic.class="…"`, `.class.failed`, `.class.removing`, and so on. Rows still get a `data-optimistic="pending|failed"` attribute, which is handy for global CSS.
- **x-for rows use `wire:optimistic.key="task.id"`**, not `:wire:key`: Livewire treats any attribute containing `wire:` as a directive, and an Alpine-bound `:wire:key` turns into a broken event binding.
- **`#[ClientId]` became `#[Optimistic\Key]`**, and you rarely need it. `Create` fills the `$id` parameter with a client generated UUIDv7 when the caller leaves it out, and the server refuses anything that isn't a UUID.
- **Server API:** `Optimistic::reject('…')` and `Optimistic::id()` are static, so no trait is needed.
- **`with:` is always JS** (evaluated once, when the action is called). **`set:` is always literal.**
- **Kanban (example 7)**, since it was unclear: each column is a container for the *same* list (`wire:optimistic.list="cards"`) and says which group it shows (`wire:optimistic.group="doing"`). `Ordered(…, groupBy: 'column')` tells the client that a card's `column` field decides its container. `moveCard($id, 'doing')` is an ordinary `Update` that changes that field. So the card is hidden in its old column and a copy appears in the new column at once. When the server confirms, Livewire's morph adopts the copy (same `wire:key`). If it fails, the copy is removed and the original reappears. The demo uses ← / → buttons instead of drag & drop so the mechanism is easy to see.

---

## 1. Like button (counter + boolean)

```php
public int $likes;
public bool $liked;

#[Optimistic('$wire.liked = !$wire.liked; $wire.likes += $wire.liked ? 1 : -1')]
public function toggleLike() { … }
```

```blade
{{-- Blade --}}
<button wire:click="toggleLike" wire:bind:class="liked ? 'is-on' : ''" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
    ♥ <span wire:text="likes">{{ $likes }}</span>
</button>

{{-- Alpine --}}
<button @click="$wire.toggleLike()" :class="$wire.liked && 'is-on'" wire:optimistic.class="opt-pending">
    ♥ <span x-text="$wire.likes"></span>
</button>
```

`{{ $likes }}` is static HTML. Use `wire:text` (or Alpine) so the patch shows up. Rapid clicks stack: every pending toggle is replayed on top of each server response.

## 2. Todo checkbox

```php
#[Optimistic\Update('tasks')]
public function setDone(string $id, bool $done) { … }
```

```blade
{{-- Blade --}}
<ul wire:optimistic.list="tasks">
    @foreach ($this->tasks as $task)
        <li @optimisticRow($task, ['done']) wire:optimistic.class="opt-pending" wire:optimistic.bind.class="$item.done ? 'is-done' : ''">
            <input type="checkbox" @checked($task->done) wire:optimistic.bind.checked="$item.done"
                   wire:click="setDone('{{ $task->id }}', $event.target.checked)">
            {{ $task->text }}
        </li>
    @endforeach
</ul>

{{-- Alpine --}}
<template x-for="task in $wire.tasks" :key="task.id">
    <li wire:optimistic.key="task.id" :class="task.done && 'is-done'" wire:optimistic.class="opt-pending">
        <input type="checkbox" :checked="task.done" @click="$wire.setDone(task.id, $el.checked)">
        <span x-text="task.text"></span>
    </li>
</template>
```

In `wire:click` use `$event.target.checked`: Livewire resolves `$el` to `$wire.$el`. The interesting part is the failure: `wire:optimistic.bind.checked` unticks the box again.

## 3. Add todo (create, sorted)

```php
#[Computed, Optimistic\Ordered(['done' => 'asc', 'created_at' => 'desc']), Optimistic\Expose]
public function tasks() { … }

#[Optimistic\Create('tasks', with: ['created_at' => 'new Date().toISOString()'], set: ['done' => false])]
public function addTask(string $id, string $text) { … }
```

```blade
<form x-data="{ text: '' }" @submit.prevent="$wire.addTask(text); text = ''"> <input x-model="text"> </form>
<p wire:optimistic.show.failed x-text="$optimistic.error()"></p>

{{-- Blade --}}
<ul wire:optimistic.list="tasks">
    @foreach ($this->tasks as $task)
        <li @optimisticRow($task)>{{ $task->text }}</li>
    @endforeach
    <template wire:optimistic.create>
        <li wire:optimistic.class="opt-pending"><span wire:optimistic.text="text"></span> <span class="tag">new</span></li>
    </template>
</ul>

{{-- Alpine --}}
<template x-for="task in $wire.tasks" :key="task.id">
    <li wire:optimistic.key="task.id" wire:optimistic.class="opt-pending" x-text="task.text"></li>
</template>
```

The new task is inserted where the `ORDER BY` puts it. You can tick it before the server confirmed the create: that follow-up action waits for the create.

## 4. Delete with undo

```php
#[Optimistic\Delete('tasks', undo: 5)]
public function deleteTask(string $id) { … }
```

```blade
<div wire:optimistic.show.undoable>
    Deleted <span x-text="$optimistic.undoable().length"></span>. <button wire:optimistic.undo>Undo</button>
</div>

{{-- Blade --}}  <li @optimisticRow($task)>{{ $task->text }} <button wire:click="deleteTask('{{ $task->id }}')">×</button></li>
{{-- Alpine --}} <li wire:optimistic.key="task.id"><span x-text="task.text"></span> <button @click="$wire.deleteTask(task.id)">×</button></li>
```

The request is held back for 5 seconds. Undo cancels it before it's sent. Leaving the page sends it right away.

## 5. Inline rename with debounce

```php
#[Optimistic\Update('tasks', squash: true)]
public function rename(string $id, string $text)
{
    if (trim($text) === '') Optimistic::reject('A task needs a name.');
    …
}
```

```blade
{{-- Blade --}}
<li @optimisticRow($task, ['text'])>
    <input value="{{ $task->text }}" wire:optimistic.bind.value="$item.text" @input.debounce.400ms="$wire.rename('{{ $task->id }}', $el.value)">
    <span wire:optimistic.show.pending>saving…</span>
    <span wire:optimistic.show.failed x-text="$optimistic.error('{{ $task->id }}')"></span>
</li>

{{-- Alpine --}}
<li wire:optimistic.key="task.id">
    <input :value="task.text" @input.debounce.400ms="$wire.rename(task.id, $el.value)">
    <span wire:optimistic.show.failed x-text="$optimistic.error(task.id)"></span>
</li>
```

`squash` drops older unsent renames of the same task. A slow response for "Hel" never overwrites "Hello", because pending entries are replayed on top of it.

## 6. Pin to top (an edit that changes the order)

```php
#[Computed, Optimistic\Ordered(['pinned' => 'desc', 'title' => 'asc'])]
#[Optimistic\Update('notes', set: ['pinned' => true])]  public function pin(string $id) { … }
#[Optimistic\Update('notes', set: ['pinned' => false])] public function unpin(string $id) { … }
```

```blade
{{-- Blade --}}
<li @optimisticRow($note)>
    <span wire:optimistic.show="$item.pinned">📌</span> {{ $note->title }}
    <button wire:click="pin('{{ $note->id }}')" wire:optimistic.show="! $item.pinned">Pin</button>
    <button wire:click="unpin('{{ $note->id }}')" wire:optimistic.show="$item.pinned">Unpin</button>
</li>

{{-- Alpine --}}
<li wire:optimistic.key="note.id">
    <span x-show="note.pinned">📌</span> <span x-text="note.title"></span>
    <button x-show="! note.pinned" @click="$wire.pin(note.id)">Pin</button>
</li>
```

Add `.stable` (`wire:optimistic.list.stable="notes"`, or `Ordered(stable: true)`) if edited rows should wait for the server before moving.

## 7. Kanban: move a card between columns

```php
#[Computed, Optimistic\Ordered(['position' => 'asc'], groupBy: 'column')]
public function cards() { … }

#[Optimistic\Update('cards', with: ['position' => 'Date.now()'])]
public function moveCard(string $id, string $column) { … }
```

```blade
{{-- Blade --}}
<div x-data="{ order: ['todo', 'doing', 'done'], step(column, by) { return this.order[this.order.indexOf(column) + by] ?? null } }">
    @foreach ($columns as $column => $label)
        <ul wire:optimistic.list="cards" wire:optimistic.group="{{ $column }}">
            @foreach ($this->cards->where('column', $column) as $card)
                <li @optimisticRow($card) wire:optimistic.class="opt-pending">
                    <button @click="$wire.moveCard($item.id, step($item.column, -1))">←</button>
                    {{ $card->title }}
                    <button @click="$wire.moveCard($item.id, step($item.column, 1))">→</button>
                </li>
            @endforeach
        </ul>
    @endforeach
</div>

{{-- Alpine --}}
<template x-for="column in order" :key="column">
    <ul>
        <template x-for="card in $wire.cards.filter(card => card.column === column)" :key="card.id">
            <li wire:optimistic.key="card.id"><span x-text="card.title"></span></li>
        </template>
    </ul>
</template>
```

The buttons use `$item`, so the copy in the new column already knows its new column (moving twice before the server answers works).

## 8. Chat: pending, failed, retry

```php
#[Optimistic\Defaults('messages')]
public function messageDefaults() { return ['author' => 'You', 'avatar' => '#6366f1']; }

#[Optimistic\Create('messages', with: ['sent_at' => 'new Date().toISOString()'], retry: true)]
public function send(string $id, string $body) { … }
```

```blade
{{-- Blade --}}
<template wire:optimistic.create>
    <li wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
        <b wire:optimistic.text="author"></b> <p wire:optimistic.text="body"></p>
        <span wire:optimistic.show.pending>Sending…</span>
        <span wire:optimistic.show.failed>Not sent. <button wire:optimistic.retry>Retry</button> <button wire:optimistic.dismiss>Discard</button></span>
    </li>
</template>

{{-- Alpine --}}
<template x-for="message in $wire.messages" :key="message.id">
    <li wire:optimistic.key="message.id" wire:optimistic.class.failed="opt-failed">
        <p x-text="message.body"></p>
        <span wire:optimistic.show.failed>Not sent. <button wire:optimistic.retry>Retry</button></span>
    </li>
</template>
```

With `retry: true` a failed message stays visible as failed. Retry resends the same action id: if the server already stored it (the response got lost), it doesn't store it again.

## 9. Cart quantity with a stock limit

```php
#[Optimistic('$wire.quantities[productId] = Math.max(0, ($wire.quantities[productId] ?? 0) + delta)')]
public function adjust(int $productId, int $delta)
{
    if ($next > $product->stock) Optimistic::reject("Only {$product->stock} left.");
    …
}
```

```blade
{{-- Blade --}}
<div wire:optimistic.class.failed="shake">
    <button wire:click="adjust({{ $id }}, -1)">−</button>
    <span wire:text="quantities[{{ $id }}]">{{ $quantities[$id] }}</span>
    <button wire:click="adjust({{ $id }}, 1)">+</button>
    <p wire:optimistic.show.failed x-text="$optimistic.error()"></p>
</div>

{{-- Alpine --}}
<div wire:optimistic.class.failed="shake">
    <button @click="$wire.adjust(product.id, 1)">+</button> <span x-text="$wire.quantities[product.id]"></span>
    <p wire:optimistic.show.failed x-text="$optimistic.error()"></p>
</div>
```

Outside of rows, an element is about the actions triggered closest to it, so each product shows only its own error.

## 10. Poll vote (switching your vote)

```php
#[Optimistic('if ($wire.myVote === option) return; if ($wire.myVote) $wire.votes[$wire.myVote]--; $wire.votes[option]++; $wire.myVote = option')]
public function vote(int $option) { … }
```

```blade
{{-- Blade --}}  <button wire:click="vote({{ $id }})"><b wire:text="votes[{{ $id }}]">{{ $votes[$id] }}</b></button>
{{-- Alpine --}} <button @click="$wire.vote(option.id)"><b x-text="$wire.votes[option.id]"></b></button>
```

## 11. Mark notifications read + a badge in another component

```php
// NotificationList
#[Optimistic\Update('notifications', all: true, with: ['read_at' => 'new Date().toISOString()'], dispatch: 'notifications-read')]
public function markAllRead() { …; $this->dispatch('notifications-read'); }

// NavBadge (a separate component)
#[Optimistic\On('notifications-read', 'if ($event.id === undefined) $wire.unread = 0; else $wire.unread = Math.max(0, $wire.unread - 1)')]
class NavBadge extends Component
{
    #[On('notifications-read')]
    public function refreshCount() { … }
}
```

```blade
{{-- Blade (list) --}} <li @optimisticRow($n, ['read_at']) wire:optimistic.bind.class="$item.read_at ? '' : 'unread'">{{ $n->title }}</li>
{{-- Alpine (list) --}} <li wire:optimistic.key="n.id" :class="! n.read_at && 'unread'" x-text="n.title"></li>
{{-- Badge --}}        <span wire:text="unread" wire:show="unread > 0">{{ $unread }}</span>
```

`$event` holds the original action's parameters. The badge keeps its patch until its own refresh arrives, and rolls back if `markAllRead` fails.

## 12. Bulk archive with selection

```php
#[Optimistic\Delete('emails')]
public function archive(array $ids) { … }
```

```blade
<div x-data="{ selected: [] }">
    <button @click="$wire.archive(selected); selected = []">Archive</button>
    {{-- Blade --}}  <li @optimisticRow($email)><input type="checkbox" value="{{ $email->id }}" x-model.number="selected"> {{ $email->subject }}</li>
    {{-- Alpine --}} <li wire:optimistic.key="email.id"><input type="checkbox" :value="email.id" x-model.number="selected"></li>
</div>
```

## 13. Dismiss a row (plain action, no preset)

```php
#[Optimistic]
public function dismiss(int $id) { … }
```

```blade
{{-- Blade --}}  <li wire:key="{{ $s->id }}">{{ $s->title }} <button wire:click="dismiss({{ $s->id }})" wire:optimistic.remove>Dismiss</button></li>
{{-- Alpine --}} <li wire:optimistic.key="s.id"><span x-text="s.title"></span> <button @click="$wire.dismiss(s.id)" wire:optimistic.remove>Dismiss</button></li>
```

## 14. Duplicate an item

```php
#[Optimistic\Create('pages', from: 'source', with: ['title' => '($wire.pages.find(p => p.id === source)?.title ?? "Page") + " (copy)"'])]
public function duplicate(string $id, string $source) { … }
```

```blade
{{-- Blade (no template: the source row is copied) --}}
<li @optimisticRow($page)><span wire:optimistic.text="title">{{ $page->title }}</span> <button wire:click="duplicate('{{ $page->id }}')">Duplicate</button></li>

{{-- Alpine --}}
<li wire:optimistic.key="page.id"><span x-text="page.title"></span> <button @click="$wire.duplicate(page.id)">Duplicate</button></li>
```

## 15. Follow user

```php
#[Optimistic('$wire.following = !$wire.following; $wire.followers += $wire.following ? 1 : -1')]
public function toggleFollow() { … }
```

```blade
{{-- Blade --}}  <button wire:click="toggleFollow"><span wire:show="following">Following</span><span wire:show="! following">Follow</span></button> <span wire:text="followers"></span>
{{-- Alpine --}} <button @click="$wire.toggleFollow()" x-text="$wire.following ? 'Following' : 'Follow'"></button>
```

## 16. Avatar upload with an instant preview

```php
use WithFileUploads;
public $avatar;

public function updatedAvatar() { $this->validate(['avatar' => 'image|max:1024']); … }
```

```blade
<img src="{{ $avatarUrl }}" wire:optimistic.preview="avatar" wire:optimistic.class="opt-pending" wire:optimistic.class.failed="opt-failed">
<input type="file" wire:model="avatar">
<p wire:optimistic.show.failed x-text="$optimistic.error()"></p>
```

No attribute needed: the directive opts the component in. The preview appears when the file is chosen. It's settled by Livewire's `_finishUpload` call: validation errors for `avatar` roll it back with their message, and a failed upload request does too.

## 17. Assign a user (a relation, not a scalar)

```php
#[Optimistic\Update('issues', with: ['assignee' => '$wire.people.find(person => person.id === assignee_id) ?? null'])]
public function assign(string $id, int $assignee_id) { … }
```

```blade
{{-- Blade --}}
<li @optimisticRow($issue, ['assignee'])>
    {{ $issue->title }} · <span wire:optimistic.text="assignee.name">{{ $issue->assignee?->name }}</span>
    <select @change="$wire.assign('{{ $issue->id }}', +$el.value)">…</select>
</li>

{{-- Alpine --}}
<li wire:optimistic.key="issue.id"><span x-text="issue.assignee?.name"></span> <select @change="$wire.assign(issue.id, +$el.value)">…</select></li>
```

## 18. Settings toggles

```php
#[Optimistic('$wire.settings[key] = value')]
public function setSetting(string $key, bool $value) { … }
```

```blade
{{-- Blade --}}  <input type="checkbox" wire:bind:checked="settings.email" wire:click="setSetting('email', $event.target.checked)">
{{-- Alpine --}} <input type="checkbox" :checked="$wire.settings[key]" @click="$wire.setSetting(key, $el.checked)">
```

## 19. Restore from trash (moving between two lists)

```php
#[Optimistic\Delete('trash'), Optimistic\Create('files', from: 'id')]
public function restore(string $id) { … }
```

```blade
{{-- Blade --}}
<ul wire:optimistic.list="files">
    …
    <template wire:optimistic.create><li><span wire:optimistic.text="name"></span> <em>restoring</em></li></template>
</ul>
<ul wire:optimistic.list="trash">
    @foreach ($this->trash as $file)
        <li @optimisticRow($file)>{{ $file->name }} <button wire:click="restore('{{ $file->id }}')">Restore</button></li>
    @endforeach
</ul>

{{-- Alpine --}}
<template x-for="file in $wire.trash" :key="file.id">
    <li wire:optimistic.key="file.id"><span x-text="file.name"></span> <button @click="$wire.restore(file.id)">Restore</button></li>
</template>
```

`from:` the key parameter means "move, keep the key". No client id is generated.

## 20. Timer start/stop

```php
#[Optimistic('$wire.startedAt = $now')] public function start() { … }
#[Optimistic('$wire.startedAt = null')] public function stop() { … }
```

```blade
<div x-data="{ now: Date.now() }" x-init="setInterval(() => now = Date.now(), 250)">
    <span x-text="$wire.startedAt ? Math.max(0, (now - Date.parse($wire.startedAt)) / 1000).toFixed(1) + 's' : '—'"></span>
    {{-- Blade --}}  <button wire:click="start" wire:show="! startedAt">Start</button>
    {{-- Alpine --}} <button @click="$wire.start()" x-show="! $wire.startedAt">Start</button>
</div>
```

`$now` (the time of the click) is a guess. The server's own timestamp corrects it through the snapshot diff.

---

## Already optimistic in Livewire (no package needed)

- `wire:model` / `wire:model.live`: local state updates first.
- `$wire.$set('tab', 'billing')`: `$wire.tab` changes locally first.
- `wire:sort` reorders the DOM before the request, but without rollback.

Half of "I need optimistic UI" is really "use `wire:text` instead of `{{ }}`".
