// Small, dependency-free helpers shared by every module.

export function uuid() {
    // UUIDv7: 48 bit unix-ms timestamp + randomness. Sortable, so client
    // generated keys keep "creation order" when used as primary keys.
    let bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)

    let ts = Date.now()
    for (let i = 5; i >= 0; i--) {
        bytes[i] = ts % 256
        ts = Math.floor(ts / 256)
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x70
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    let hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function isObject(value) {
    return value !== null && typeof value === 'object' && ! Array.isArray(value)
}

export function isObjecty(value) {
    return value !== null && typeof value === 'object'
}

// Deep clone of plain JSON-ish data. Works on Alpine reactive proxies, which
// structuredClone() refuses to handle.
export function clone(value) {
    if (Array.isArray(value)) return value.map(clone)

    if (isObject(value)) {
        let result = {}
        for (let key of Object.keys(value)) result[key] = clone(value[key])
        return result
    }

    return value
}

export function equal(a, b) {
    if (a === b) return true
    if (! isObjecty(a) || ! isObjecty(b)) return false
    if (Array.isArray(a) !== Array.isArray(b)) return false

    let aKeys = Object.keys(a)
    let bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false

    return aKeys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]))
}

// Compare keys loosely: wire:key attributes are always strings, while data
// keys are often integers.
export function sameKey(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false

    return String(a) === String(b)
}

// Computes the minimal list of writes that turns `from` into `to`. Arrays of
// equal length are diffed per index, everything else is replaced wholesale.
// Each change is { path: [...segments], value } or { path, remove: true }.
export function diff(from, to, path = [], changes = []) {
    if (equal(from, to)) return changes

    let bothObjects = isObject(from) && isObject(to)
    let sameLengthArrays = Array.isArray(from) && Array.isArray(to) && from.length === to.length

    if (bothObjects) {
        for (let key of Object.keys(to)) {
            if (! Object.prototype.hasOwnProperty.call(from, key)) {
                changes.push({ path: [...path, key], value: clone(to[key]) })
            } else {
                diff(from[key], to[key], [...path, key], changes)
            }
        }

        for (let key of Object.keys(from)) {
            if (! Object.prototype.hasOwnProperty.call(to, key)) {
                changes.push({ path: [...path, key], remove: true })
            }
        }

        return changes
    }

    if (sameLengthArrays) {
        to.forEach((item, index) => diff(from[index], item, [...path, index], changes))

        return changes
    }

    changes.push({ path, value: clone(to) })

    return changes
}

// Applies changes produced by diff() onto `target` in place. Missing parents
// are created on the way; a change with an empty path cannot be applied to a
// root (roots are always objects here) and is ignored.
export function patch(target, changes) {
    for (let change of changes) {
        if (change.path.length === 0) continue

        let parent = target
        let segments = change.path.slice(0, -1)

        for (let segment of segments) {
            if (! isObjecty(parent[segment])) parent[segment] = {}
            parent = parent[segment]
        }

        let last = change.path[change.path.length - 1]

        if (change.remove) {
            if (Array.isArray(parent)) parent.splice(last, 1)
            else delete parent[last]
        } else {
            parent[last] = clone(change.value)
        }
    }

    return target
}

// Compiles a snippet of user JavaScript once and caches it.
let compiled = new Map()

export function compile(args, body) {
    let cacheKey = args.join(',') + '\u0000' + body

    if (! compiled.has(cacheKey)) {
        compiled.set(cacheKey, new Function(...args, body))
    }

    return compiled.get(cacheKey)
}

// Evaluates an expression (not a statement list) with named variables.
export function evaluateExpression(expression, scope) {
    let names = Object.keys(scope).filter(isIdentifier)

    return compile(names, `return (${expression})`)(...names.map(name => scope[name]))
}

export function isIdentifier(name) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
}

export function toArray(value) {
    if (value === null || value === undefined) return []

    return Array.isArray(value) ? value : [value]
}
