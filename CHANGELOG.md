# Changelog

All notable changes to `mateffy/optiwire` will be documented in this file.

## Unreleased

First release as `mateffy/optiwire`, the successor of `capevace/livewire-optimistic-ui`. A rewrite that integrates directly with Livewire 4 instead of sitting on top of it.

- `#[Optimistic]`, `Optimistic\Create`, `Update`, `Delete` on actions; `Ordered`, `Expose`, `Defaults`, `On` for lists, data and cross-component patches. No wrapper component, no trait.
- Client script injected automatically; hooks into Livewire's action/message interceptors and morph lifecycle.
- Derived optimistic state (server state + pending entries replayed), written through to Livewire's state.
- Blade rows (`@optirow`, `wire:optimistic.*` directives) and Alpine `x-for` rendering.
- Undo windows, retries with server-side deduplication, squashing, timeouts, rejections, follow-up actions on pending creates, file previews.
- Removed: `<x-optimistic::injector>`, `<x-optimistic::added>`, `WithOptimisticUI`, the `crud:` parameter and the `x-optimistic` Alpine directive.
