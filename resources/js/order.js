import { evaluateExpression, toArray } from './util.js'

// A list spec looks like:
// { key: 'id', order: [['done', 'asc'], ['due_at', 'desc']], groupBy: 'column', js: null }
//
// `js` (an expression over `item` returning a value or a tuple) replaces the
// column list when the sort key is derived. All of its components sort asc,
// negate numbers for descending.

export function hasOrder(spec) {
    return !! spec && (!! spec.js || (Array.isArray(spec.order) && spec.order.length > 0))
}

export function orderFields(spec) {
    if (! spec) return []

    if (spec.js) return toArray(spec.fields)

    return (spec.order || []).map(([field]) => field)
}

export function sortKey(spec, item) {
    if (spec.js) {
        try {
            return toArray(evaluateExpression(spec.js, { item }))
        } catch (error) {
            console.error('[optimistic] Sort expression failed:', spec.js, error)
            return []
        }
    }

    return spec.order.map(([field]) => item?.[field])
}

function directions(spec) {
    if (spec.js) return []

    return spec.order.map(([, direction]) => (String(direction).toLowerCase() === 'desc' ? -1 : 1))
}

function normalize(value) {
    if (typeof value === 'boolean') return value ? 1 : 0

    return value
}

// SQL-ish comparison: NULLs first, booleans as integers, numbers numerically,
// everything else as plain (binary) strings, which is also how ISO dates sort.
export function compareValues(a, b) {
    a = normalize(a)
    b = normalize(b)

    let aMissing = a === null || a === undefined
    let bMissing = b === null || b === undefined

    if (aMissing || bMissing) return aMissing === bMissing ? 0 : (aMissing ? -1 : 1)

    if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : (a < b ? -1 : 1)

    a = String(a)
    b = String(b)

    return a === b ? 0 : (a < b ? -1 : 1)
}

export function comparator(spec) {
    let dirs = directions(spec)

    return (a, b) => {
        let length = Math.max(a.length, b.length)

        for (let i = 0; i < length; i++) {
            let result = compareValues(a[i], b[i]) * (dirs[i] ?? 1)
            if (result !== 0) return result
        }

        return 0
    }
}

// Index at which `key` has to be inserted into the already ordered `keys` so
// the list stays ordered. Items with an equal key stay in front (stable).
export function insertionIndex(spec, keys, key) {
    let compare = comparator(spec)

    let index = keys.findIndex(existing => compare(existing, key) > 0)

    return index === -1 ? keys.length : index
}
