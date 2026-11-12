# Livewire Optimistic UI

> [!WARNING]
> **This README documents the unreleased 2.0 rewrite on `main`, not the version on Packagist.**
> 2.0 is a full rewrite that integrates directly into Livewire 4. The 1.x API (`WithOptimisticUI`, `<x-optimistic::injector>`, `$optimistic.addTask(…)`) has been removed. 1.x had only a handful of installs, so there is no migration guide. If you are on 1.x, pin `^1.0` until 2.0 is tagged.

Mark a Livewire action `#[Optimistic]` and the page updates as soon as the user clicks, before the server answers. When the server confirms, its data takes over. When the request fails, times out or the server says no, the change is rolled back.

```php
use Capevace\OptimisticUI\Optimistic;

#[Optimistic('$wire.liked = !$wire.liked; $wire.likes += $wire.liked ? 1 : -1')]
public function toggleLike() { … }
```

```blade
<button wire:click="toggleLike">♥ <span wire:text="likes">{{ $likes }}</span></button>
```

You don't need a wrapper component, a trait or any extra JavaScript. The package hooks into Livewire 4 directly: the action and message interceptors, the component memo and the morph lifecycle. Its client script is injected automatically on pages that use it.

- [Installation](#installation)
- [How it works](#how-it-works)
- [Actions](#actions)
- [Lists](#lists)
- [Directives and magics](#directives-and-magics)
- [Examples](#examples)
- [Failure modes](#failure-modes)
- [JavaScript API and events](#javascript-api-and-events)
- [Configuration](#configuration)
- [Demo](#demo)
- [Testing](#testing)

## Installation

```bash
composer require capevace/livewire-optimistic-ui:dev-main
```

Requires PHP 8.3+, Laravel 12 or 13 and Livewire 4.4+. The service provider is auto-discovered and the client script is injected on any page that renders an optimistic component. Set `inject_assets` to `false` to include `/livewire-optimistic-ui/optimistic.js` yourself.

## How it works

The client keeps optimistic state *derived*: what you see is always the last server state with every pending action replayed on top of it.

1. Clicking an optimistic action creates an **entry**: an id, the action's parameters and the patch it describes. The patch is applied immediately.
2. The request goes out as normal. Its metadata carries the entry id.
3. Each response becomes the new base. Confirmed entries drop out and the remaining pending entries are replayed on top. That is why a slow, out-of-order response can never overwrite a newer pending change.
4. A failed entry just stops being replayed, which is how rollback works. With `retry: true` the failed item stays visible, marked as failed, until it is retried or dismissed.

Under the hood:

- **Property patches** are written to Livewire's own state, both canonical and reactive. They are never sent to the server as property updates, and a server value that agrees with the patch doesn't cause a re-render.
- **Server-rendered rows** (Blade `@foreach`) are kept in line by a reconciler that runs after every change and every morph:
  - pending rows are inserted from a `<template>` or copied from a source row;
  - deleted rows are hidden;
  - rows move to wherever the list's sort order puts them.

  When the server confirms, Livewire's morph adopts the very same element.
- **Every optimistic action has an id.** The server remembers finished actions, so retrying a request whose response got lost never runs the action twice.

## Actions

Put one of these attributes on a component method. Several can be combined on one method.

| PHP | What happens on the client |
|---|---|
| `#[Optimistic]` | Pending/failed state only (`wire:optimistic.class`, `data-optimistic`, `wire:optimistic.remove`). |
| `#[Optimistic('js')]` | Runs the JS against `$wire`. Parameters are available by name, plus `$id` (the entry id) and `$now` (ISO time of the click). |
| `#[Optimistic\Create('list', with: [...], set: [...], from: 'param')]` | Adds an item built from the parameters, the `set:` literals and the `with:` JS expressions. Its key is a client-generated UUIDv7, filled in automatically when the caller leaves it out. |
| `#[Optimistic\Update('list', set: [...], with: [...], all: false)]` | Merges the parameters (minus the key) into item `$id`, into every item in `$ids`, or into every item with `all: true`. |
| `#[Optimistic\Delete('list')]` | Removes item `$id` (or every item in `$ids`). |

`set:` values are literals. `with:` values are JS expressions, evaluated once when the action is called, with the parameters, `$wire`, `$id` and `$now` in scope.

**Options for every attribute:**

| Option | Effect |
|---|---|
| `undo: 5` | Hold the request back for 5 seconds. `wire:optimistic.undo` cancels it before it's sent. |
| `retry: true` | Failed items stay visible as failed until retried or dismissed. |
| `squash: true` | Only the newest unsent action per item is sent (typing, sliders). |
| `dispatch: 'event'` | Also patch other components listening with `#[Optimistic\On('event')]`. |
| `timeout: 10000` | Roll back if there's no answer after this many ms (default 30 s). |

**Keys.** The key parameter is `$id`, or `$ids`, by convention. Use `key: 'name'` or mark the parameter with `#[Optimistic\Key]` for other names. A `Create` whose key isn't passed gets one injected:

```php
#[Optimistic\Create('tasks')]
public function addTask(string $id, string $text) { … }   // called as $wire.addTask(text)
```

If the server assigns its own keys (auto increment), return the new key from the create method. Follow-up actions on the pending item will use it.

**On the server:**

```php
Optimistic::reject('Only 3 left.');   // roll back; the message shows up via $optimistic.error()
Optimistic::id();                     // the client-generated key of the item being created
Optimistic::active();                 // whether the current call is optimistic
```

Validation exceptions in an optimistic action are reported as rejections too, and Livewire still fills the error bag. Client keys that aren't UUIDs are refused before your method runs.

## Lists

Describe a list on the public property or `#[Computed]` method that provides it:

```php
#[Computed, Optimistic\Ordered(['done' => 'asc', 'created_at' => 'desc']), Optimistic\Expose]
public function tasks() { return Task::orderBy('done')->orderBy('created_at', 'desc')->get(); }
```

- **`Ordered(columns, groupBy:, js:, fields:, key: 'id', stable: false, insert: 'end', list:)`** is the sort spec. It's the same spec as your `ORDER BY`, so new and edited items land where the server would put them.
  - `groupBy:` splits a list over several containers (kanban columns).
  - `js:` is an expression over `item` for derived sort keys. It may return an array for tie-breakers, for example `Ordered(js: '[-item.votes, item.title.toLowerCase()]', fields: ['votes', 'title'])`.
  - `stable: true` keeps edited rows in place until the server confirms. `insert:` sets where unsorted new rows go (`end` or `start`).
- **`Expose`** sends a computed property to the client so that `x-for` can render it from `$wire.tasks`. Public properties don't need it.
- **`#[Optimistic\Defaults('list')]`** on a method returns server-known defaults for new items (the author, an avatar…).

The same component can be rendered either way, and both stay in sync.

<table>
<tr><th>Blade (<code>@foreach</code>)</th><th>Alpine (<code>x-for</code>)</th></tr>
<tr><td>

```blade
<ul wire:optimistic.list="tasks">
  @foreach ($this->tasks as $task)
    <li @optimisticRow($task)
        wire:optimistic.class="opacity-60"
        wire:optimistic.class.failed="text-red-600">
      {{ $task->text }}
    </li>
  @endforeach

  <template wire:optimistic.create>
    <li wire:optimistic.class="opacity-60">
      <span wire:optimistic.text="text"></span>
    </li>
  </template>
</ul>
```

</td><td>

```blade
<ul>
  <template x-for="task in $wire.tasks"
            :key="task.id">
    <li wire:optimistic.key="task.id"
        wire:optimistic.class="opacity-60"
        wire:optimistic.class.failed="text-red-600"
        x-text="task.text"></li>
  </template>
</ul>
```

</td></tr>
</table>

- **Blade:** `@optimisticRow($task, ['extra', 'fields'])` prints the row's `wire:key` plus the fields the client needs: the sort and group columns and any fields you list. New rows come from the `<template wire:optimistic.create>`. Without one, the source row is copied (`from:`).
- **Alpine:** the data itself is patched, so nothing else is needed. Rows declare their key with `wire:optimistic.key`, because Livewire treats an Alpine-bound `:wire:key` as an event directive.

## Directives and magics

| Directive | Meaning |
|---|---|
| `wire:optimistic.class="…"` | Classes while pending. Use `.class.failed`, `.class.created`, `.class.removing`, `.class.updating` and `.class.undoable` for the other states. |
| `wire:optimistic.show.pending` / `.failed` / `.undoable` | Show only in that state. `wire:optimistic.show="$item.pinned"` shows while the expression is true. |
| `wire:optimistic.text="field"` | The row's pending value of `field` (dot paths work), otherwise the server's content. |
| `wire:optimistic.bind.attr="expr"` | Binds an attribute or property (`value`, `checked`, `class`, `style`, …) to an expression over `$item`. It's only written when the value changes, so typing is never clobbered. |
| `wire:optimistic.remove` | On a trigger: hide the closest keyed row until the server agrees. |
| `wire:optimistic.retry` / `.undo` / `.dismiss` | Buttons that act on the failed or undoable entries of their row (or of the whole component). |
| `wire:optimistic.preview="property"` | On an `<img>`: shows the file chosen for `wire:model="property"` before it's even uploaded. |
| `wire:optimistic.list="name"` (`.stable`), `wire:optimistic.group="value"`, `wire:optimistic.key="expr"` | List structure, see [Lists](#lists). |

Rows and triggers also get a `data-optimistic="pending|failed"` attribute, which is useful for global CSS.

**Scoping.** Inside a row, state directives refer to that row's entries. Outside rows, they refer to the actions triggered closest to them: an error message next to one product's buttons is about that product only. Undo is component-wide.

**`$item`** (inside rows) is the row's server fields with pending changes applied.

**`$optimistic`** has the following, and each one optionally takes a key:

- `pending()`, `failed()` and `error()`
- `state()`
- `retry()`, `undo()` and `dismiss()`
- `undoable()`
- `item(key)` and `server(path)` (the unpatched server value)
- `entries`

## Examples

The demo implements 20 examples, each in both rendering modes. All 20 are in [docs/native-integration-examples.md](docs/native-integration-examples.md); this section shows a selection.

### Add a task, sorted, with a validation error

```php
#[Computed, Optimistic\Ordered(['done' => 'asc', 'created_at' => 'desc']), Optimistic\Expose]
public function tasks() { … }

#[Optimistic\Create('tasks', with: ['created_at' => 'new Date().toISOString()'], set: ['done' => false])]
public function addTask(string $id, string $text)
{
    Validator::make(['text' => $text], ['text' => 'required|max:80'])->validate();
    Task::create(['id' => $id, 'text' => $text]);
}
```

```blade
<form x-data="{ text: '' }" @submit.prevent="$wire.addTask(text); text = ''">
    <input x-model="text">
</form>
<p wire:optimistic.show.failed x-text="$optimistic.error()"></p>

{{-- Blade --}}
<ul wire:optimistic.list="tasks">
    @foreach ($this->tasks as $task)
        <li @optimisticRow($task)>{{ $task->text }}</li>
    @endforeach
    <template wire:optimistic.create>
        <li wire:optimistic.class="opacity-60"><span wire:optimistic.text="text"></span> <span>new</span></li>
    </template>
</ul>

{{-- Alpine --}}
<template x-for="task in $wire.tasks" :key="task.id">
    <li wire:optimistic.key="task.id" wire:optimistic.class="opacity-60" x-text="task.text"></li>
</template>
```

The new task is inserted where the `ORDER BY` would put it. You can tick or rename it before the server has confirmed the create: those follow-up actions wait for the create, and are cancelled if it fails.

### Delete with undo

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

The request is held back for 5 seconds and Undo cancels it before it's sent. Leaving or navigating away sends it immediately.

### Inline rename with debounce and a server rejection

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
    <input value="{{ $task->text }}" wire:optimistic.bind.value="$item.text"
           @input.debounce.400ms="$wire.rename('{{ $task->id }}', $el.value)">
    <span wire:optimistic.show.pending>saving…</span>
    <span wire:optimistic.show.failed x-text="$optimistic.error('{{ $task->id }}')"></span>
</li>

{{-- Alpine --}}
<li wire:optimistic.key="task.id">
    <input :value="task.text" @input.debounce.400ms="$wire.rename(task.id, $el.value)">
    <span wire:optimistic.show.failed x-text="$optimistic.error(task.id)"></span>
</li>
```

`squash` drops older unsent renames of the same task. A slow response for "Hel" never overwrites "Hello", because pending entries are replayed on top of every response.

### Kanban: move a card between columns

```php
#[Computed, Optimistic\Ordered(['position' => 'asc'], groupBy: 'column')]
public function cards() { … }

#[Optimistic\Update('cards', with: ['position' => 'Date.now()'])]
public function moveCard(string $id, string $column) { … }
```

```blade
{{-- Blade: every column is a container for the same list --}}
@foreach (['todo' => 'To do', 'doing' => 'Doing', 'done' => 'Done'] as $column => $label)
    <ul wire:optimistic.list="cards" wire:optimistic.group="{{ $column }}">
        @foreach ($this->cards->where('column', $column) as $card)
            <li @optimisticRow($card) wire:optimistic.class="opacity-60">
                <button @click="$wire.moveCard($item.id, step($item.column, -1))">←</button>
                {{ $card->title }}
                <button @click="$wire.moveCard($item.id, step($item.column, 1))">→</button>
            </li>
        @endforeach
    </ul>
@endforeach

{{-- Alpine --}}
<template x-for="column in ['todo', 'doing', 'done']" :key="column">
    <ul>
        <template x-for="card in $wire.cards.filter(card => card.column === column)" :key="card.id">
            <li wire:optimistic.key="card.id" x-text="card.title"></li>
        </template>
    </ul>
</template>
```

`groupBy: 'column'` tells the client that a card's `column` field decides which container it belongs in, and `moveCard` is an ordinary `Update` that changes that field. The card is hidden in its old column and a copy appears in the new one straight away. When the server confirms, Livewire's morph adopts the copy, which has the same `wire:key`. On failure the copy is removed and the original reappears. The buttons read `$item`, so moving a card twice before the server answers works.

### Chat: pending, failed, retry

```php
#[Optimistic\Defaults('messages')]
public function messageDefaults() { return ['author' => 'You']; }

#[Optimistic\Create('messages', with: ['sent_at' => 'new Date().toISOString()'], retry: true)]
public function send(string $id, string $body) { … }
```

```blade
{{-- Blade --}}
<template wire:optimistic.create>
    <li wire:optimistic.class="opacity-60" wire:optimistic.class.failed="text-red-600">
        <b wire:optimistic.text="author"></b> <p wire:optimistic.text="body"></p>
        <span wire:optimistic.show.pending>Sending…</span>
        <span wire:optimistic.show.failed>
            Not sent. <button wire:optimistic.retry>Retry</button> <button wire:optimistic.dismiss>Discard</button>
        </span>
    </li>
</template>

{{-- Alpine --}}
<template x-for="message in $wire.messages" :key="message.id">
    <li wire:optimistic.key="message.id" wire:optimistic.class.failed="text-red-600">
        <p x-text="message.body"></p>
        <span wire:optimistic.show.failed>Not sent. <button wire:optimistic.retry>Retry</button></span>
    </li>
</template>
```

Retry resends the same action id. If the server already stored the message because only the response got lost, it isn't stored twice.

### Cart quantity with a stock limit (non-CRUD)

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
<div wire:optimistic.class.failed="animate-shake">
    <button wire:click="adjust({{ $id }}, -1)">−</button>
    <span wire:text="quantities[{{ $id }}]">{{ $quantities[$id] }}</span>
    <button wire:click="adjust({{ $id }}, 1)">+</button>
    <p wire:optimistic.show.failed x-text="$optimistic.error()"></p>
</div>

{{-- Alpine --}}
<div wire:optimistic.class.failed="animate-shake">
    <button @click="$wire.adjust(product.id, 1)">+</button> <span x-text="$wire.quantities[product.id]"></span>
    <p wire:optimistic.show.failed x-text="$optimistic.error()"></p>
</div>
```

Each product only shows its own error, because state directives outside rows look at the actions triggered nearest to them.

### Mark all read, plus a badge in another component

```php
// NotificationList
#[Optimistic\Update('notifications', all: true, with: ['read_at' => '$now'], dispatch: 'notifications-read')]
public function markAllRead() { …; $this->dispatch('notifications-read'); }

// NavBadge, a separate component
#[Optimistic\On('notifications-read', '$wire.unread = 0')]
class NavBadge extends Component
{
    #[On('notifications-read')]
    public function refreshCount() { … }
}
```

```blade
{{-- Blade (list) --}}  <li @optimisticRow($n, ['read_at']) wire:optimistic.bind.class="$item.read_at ? '' : 'font-bold'">{{ $n->title }}</li>
{{-- Alpine (list) --}} <li wire:optimistic.key="n.id" :class="! n.read_at && 'font-bold'" x-text="n.title"></li>
{{-- Badge --}}         <span wire:text="unread" wire:show="unread > 0">{{ $unread }}</span>
```

The badge patches itself immediately and keeps the patch until its own refresh, triggered by the real event, has arrived. It never flickers back. If `markAllRead` fails, the badge rolls back too. `$event` holds the original action's parameters.

### Restore from trash (moving between two lists)

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

Passing the key parameter as `from:` means "move the item and keep its key", so no client id is generated.

### Dismiss a row (plain action)

```php
#[Optimistic]
public function dismiss(int $id) { … }
```

```blade
{{-- Blade --}}  <li wire:key="{{ $s->id }}">{{ $s->title }} <button wire:click="dismiss({{ $s->id }})" wire:optimistic.remove>Dismiss</button></li>
{{-- Alpine --}} <li wire:optimistic.key="s.id"><span x-text="s.title"></span> <button @click="$wire.dismiss(s.id)" wire:optimistic.remove>Dismiss</button></li>
```

### Avatar upload with an instant preview

```php
use WithFileUploads;
public $avatar;

public function updatedAvatar() { $this->validate(['avatar' => 'image|max:1024']); … }
```

```blade
<img src="{{ $avatarUrl }}" wire:optimistic.preview="avatar" wire:optimistic.class="opacity-60" wire:optimistic.class.failed="ring-2 ring-red-500">
<input type="file" wire:model="avatar">
<p wire:optimistic.show.failed x-text="$optimistic.error()"></p>
```

No attribute is needed here, because the directive opts the component in. The preview appears as soon as the file is chosen. A validation error for `avatar`, or a failed upload request, rolls it back with its message.

### Also in the demo

- Todo checkbox (`Update` and `wire:optimistic.bind.checked`)
- Pin to top (an edit that changes the order)
- Poll vote (switching your vote)
- Bulk archive (`$ids`)
- Duplicate (`Create(from: 'source')`)
- Follow button
- Assign a user (a relation, via `with:`)
- Settings toggles
- Timer start/stop (`$now`)

See [docs/native-integration-examples.md](docs/native-integration-examples.md).

## Failure modes

| What happens | Result |
|---|---|
| Network error, 5xx, request dropped | Rolled back, error shown inline. Livewire's error modal isn't shown for requests that only carry optimistic actions. |
| Server rejection (`Optimistic::reject`, `ValidationException`) | Rolled back, with the message available via `$optimistic.error()`. |
| No answer within `timeout` | Rolled back. If the answer arrives later and succeeded, it still wins, because server data is always the truth. |
| Responses arrive out of order | Newer pending changes are replayed on top of every response, so nothing jumps back. |
| Response lost, then retried | Same action id; the server returns the remembered result instead of running the action again. |
| Follow-up action on an item that is still being created | Waits for the create. It's cancelled if the create fails. |
| A 419 (session expired) | Left to Livewire, so the usual "page expired" flow still works. |
| Leaving the page | Pending undo windows are sent immediately, and the browser warns while actions are in flight. |

## JavaScript API and events

`window.Optimistic` is set once the client has booted:

```js
Optimistic.config.timeout = 10000      // and warnOnUnload, linkTimeout, failedTtl, handleErrors
Optimistic.store.entries               // every live entry
Optimistic.flushUndoWindows()          // send everything that is held back now
```

Two window events let you build your own indicators or logging:

```js
window.addEventListener('optimistic:event', e => console.log(e.detail.type, e.detail.entry))
// type: added | sent | failed | retried | confirmed | rolled-back | dismissed

window.addEventListener('optimistic:change', e => e.detail.entries)
```

## Configuration

```bash
php artisan vendor:publish --tag=livewire-optimistic-ui-config
```

```php
'inject_assets' => true,
'route' => 'livewire-optimistic-ui/optimistic.js',
'idempotency' => ['enabled' => true, 'ttl' => 600, 'store' => null],   // cache store for finished action ids
'client' => ['timeout' => 30000, 'warnOnUnload' => true, 'linkTimeout' => 5000, 'failedTtl' => 0],
```

`linkTimeout` is how long a cross-component patch waits for the listener's own refresh. `failedTtl` automatically dismisses failed entries after this many ms; `0` keeps them.

## Demo

The workbench contains a demo page with all 20 examples, each rendered with Blade and with Alpine side by side. It has:

- a visualization of the server truth and the pending entries for every component;
- a simulated network: latency, jitter, offline, lost responses, 500s, hung requests and random failures;
- a live event log.

```bash
composer install && bun install
composer run build-js && composer run serve   # http://127.0.0.1:8077
```

## Testing

```bash
composer test            # PHP (Pest)
composer test-coverage   # PHP with coverage (Xdebug or PCOV), 100% required
composer test-js         # JS (bun, real Livewire in happy-dom), 100% line coverage required
composer test-browser    # every demo example in a real browser, including network failure modes
```

## License

MIT. See [LICENSE.md](LICENSE.md).
