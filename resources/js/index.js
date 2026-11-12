import { install } from './plugin.js'

export { install }

// Loaded as a classic <script> (the package injects it automatically): wait
// for Livewire, or hook in right away if it already booted.
export function boot(target = globalThis) {
    if (target.Optimistic) return target.Optimistic

    let start = () => {
        if (target.Optimistic) return
        target.Optimistic = install(target.Livewire, target.Alpine)
    }

    if (target.Livewire && target.Alpine) start()
    else target.document?.addEventListener('livewire:init', start, { once: true })

    return target.Optimistic || null
}

boot()
