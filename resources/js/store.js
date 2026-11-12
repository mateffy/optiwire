// Tracks every optimistic action ("entry") across all components.
//
// Entry lifecycle:
//
//   pending ──(server confirms)──────────────▶ removed (server data takes over)
//      │ ├──(server rejects / request fails)─▶ failed  (rolled back, unless `retry`)
//      │ └──(cancelled / undone)─────────────▶ removed
//      └─ awaiting: only linked (cross component) entries; parent confirmed,
//         waiting for the listening component to sync its own state.
//
// An entry can additionally be held back from the network by "gates" (undo
// window, waiting for the create of the item it targets). Gated entries are
// pending and applied, they just haven't been sent yet.

let sequence = 0

export function isApplied(entry) {
    if (entry.status === 'pending' || entry.status === 'awaiting') return true

    return entry.status === 'failed' && !! entry.options.retry
}

export function isUndoable(entry) {
    return entry.status === 'pending' && entry.gates.has('undo')
}

export function createStore() {
    let entries = []
    let byAction = new WeakMap()
    let listeners = new Set()

    let store = {
        get entries() {
            return entries
        },

        add(entry) {
            entry.seq = ++sequence
            entry.gates = entry.gates || new Set()
            entry.status = entry.status || 'pending'
            entry.error = entry.error ?? null
            entries.push(entry)

            return entry
        },

        attach(action, entry) {
            byAction.set(action, entry)
            entry.action = action
        },

        forAction(action) {
            return byAction.get(action) || null
        },

        find(id) {
            return entries.find(entry => entry.id === id) || null
        },

        remove(entry) {
            let index = entries.indexOf(entry)
            if (index !== -1) entries.splice(index, 1)
            entry.removed = true
        },

        forComponent(component) {
            return entries.filter(entry => entry.component === component)
        },

        applied(component) {
            return entries.filter(entry => entry.component === component && isApplied(entry))
        },

        linkedTo(entry) {
            return entries.filter(candidate => candidate.linkedTo === entry.id)
        },

        clear() {
            entries = []
        },

        subscribe(listener) {
            listeners.add(listener)

            return () => listeners.delete(listener)
        },

        notify(reason) {
            listeners.forEach(listener => listener(reason, entries))
        },
    }

    return store
}
