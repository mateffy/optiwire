import { clone, compile, isIdentifier, isObject, sameKey } from './util.js'
import { hasOrder, insertionIndex, orderFields, sortKey } from './order.js'

// The optimistic state of a component is always derived, never mutated in
// place: visible = replay(pending entries, server data). Rolling an entry back
// is therefore just "replay without it", and a fresh server snapshot simply
// becomes the new base the remaining entries are replayed on top of.

export function getPath(object, path) {
    return String(path).split('.').reduce((value, segment) => (value === null || value === undefined ? undefined : value[segment]), object)
}

export function keyFieldOf(lists, list) {
    return lists?.[list]?.key || 'id'
}

export function replay(base, entries, lists = {}) {
    let draft = clone(base)

    for (let entry of entries) {
        for (let op of entry.ops) {
            try {
                applyOp(draft, op, entry, lists, base)
            } catch (error) {
                console.error(`[optimistic] Optimistic update for "${entry.method}" failed and was skipped:`, error)
            }
        }
    }

    return draft
}

export function applyOp(draft, op, entry, lists, base = draft) {
    if (op.type === 'js') return applyJs(draft, op, entry)

    let items = getPath(draft, op.list)

    if (! Array.isArray(items)) return

    let spec = lists[op.list] || {}
    let keyField = keyFieldOf(lists, op.list)

    if (op.type === 'create') return applyCreate(draft, items, op, spec, keyField, lists, base)
    if (op.type === 'update') return applyUpdate(items, op, spec, keyField)
    if (op.type === 'delete') return applyDelete(items, op, keyField)
}

function applyJs(draft, op, entry) {
    let scope = { ...entry.named, $id: entry.key, $now: entry.now, $params: entry.params }
    let names = Object.keys(scope).filter(isIdentifier)

    compile(['$wire', ...names], op.code)(draft, ...names.map(name => scope[name]))
}

function findAnywhere(draft, lists, key, preferred) {
    let names = [preferred, ...Object.keys(lists).filter(name => name !== preferred)]

    for (let name of names) {
        let items = getPath(draft, name)
        if (! Array.isArray(items)) continue

        let keyField = keyFieldOf(lists, name)
        let index = items.findIndex(item => isObject(item) && sameKey(item[keyField], key))

        if (index !== -1) return { items, index, item: items[index] }
    }

    return null
}

function position(items, item, spec) {
    if (hasOrder(spec)) {
        return insertionIndex(spec, items.map(existing => sortKey(spec, existing)), sortKey(spec, item))
    }

    return spec.insert === 'start' ? 0 : items.length
}

function applyCreate(draft, items, op, spec, keyField, lists, base) {
    let item = clone(op.item)

    if (op.from !== null && op.from !== undefined) {
        let source = findAnywhere(draft, lists, op.from, op.list)

        if (source) {
            item = { ...clone(source.item), ...item }

            if (op.move) source.items.splice(source.index, 1)
        } else {
            // Already removed by an earlier op of the same action (e.g. a
            // Delete from the other list): copy it from the server data.
            let original = findAnywhere(base, lists, op.from, op.list)
            if (original) item = { ...clone(original.item), ...item }
        }
    }

    item[keyField] = op.key

    let existing = items.find(candidate => isObject(candidate) && sameKey(candidate[keyField], op.key))

    if (existing) {
        Object.assign(existing, item)
        return
    }

    items.splice(position(items, item, spec), 0, item)
}

function applyUpdate(items, op, spec, keyField) {
    let targets = items.filter(item => isObject(item) && (op.keys === null || op.keys.some(key => sameKey(item[keyField], key))))
    let touchesOrder = orderFields(spec).some(field => Object.prototype.hasOwnProperty.call(op.fields, field))
    let reorder = hasOrder(spec) && touchesOrder && ! spec.stable

    for (let item of targets) {
        Object.assign(item, clone(op.fields))

        if (reorder) {
            items.splice(items.indexOf(item), 1)
            items.splice(position(items, item, spec), 0, item)
        }
    }
}

function applyDelete(items, op, keyField) {
    for (let index = items.length - 1; index >= 0; index--) {
        let item = items[index]

        if (isObject(item) && op.keys.some(key => sameKey(item[keyField], key))) items.splice(index, 1)
    }
}

// Merges the fields every applied entry writes to one item (Blade mode, where
// the client has no list data and only knows a row's server fields).
export function overlay(item, key, list, entries, lists) {
    let result = clone(item)
    let keyField = keyFieldOf(lists, list)
    let touched = false

    for (let entry of entries) {
        for (let op of entry.ops) {
            if (op.list !== list) continue

            if (op.type === 'update' && (op.keys === null || op.keys.some(candidate => sameKey(candidate, key)))) {
                Object.assign(result, clone(op.fields))
                touched = true
            }

            if (op.type === 'create' && sameKey(op.key, key)) {
                Object.assign(result, clone(op.item), { [keyField]: op.key })
                touched = true
            }
        }
    }

    return { item: result, touched }
}
