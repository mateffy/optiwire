// A tiny, scriptable stand-in for Livewire's PHP side. Components are defined
// with plain data, a render function and methods. Tests control the network:
// latency, failure modes and (in manual mode) the exact order responses
// arrive in.

let nextId = 0

export class Rejected extends Error {}

function dataSet(object, path, value) {
    let segments = String(path).split('.')
    let last = segments.pop()
    let target = segments.reduce((carry, segment) => (carry[segment] ??= {}), object)
    target[last] = value
}

function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export const server = {
    definitions: {},
    instances: {},
    processed: new Set(),
    requests: [],
    pending: [],
    latency: 0,
    manual: false,
    mode: 'normal',
    once: false,
    log: [],

    reset() {
        this.definitions = {}
        this.instances = {}
        this.processed = new Set()
        this.requests = []
        this.pending = []
        this.latency = 0
        this.manual = false
        this.mode = 'normal'
        this.once = false
        this.log = []
    },

    define(name, definition) {
        this.definitions[name] = definition
    },

    html(name, id, data) {
        let definition = this.definitions[name]
        // happy-dom's DOM differs from browsers when Alpine's morph walks
        // whitespace text nodes next to elements we inserted. Browsers are
        // covered by the Pest browser tests; here we render compact HTML.
        let html = definition.render ? definition.render(data, id) : ''
        return `<div wire:id="${id}">${html.replace(/>\s+</g, '><').trim()}</div>`
    },

    snapshot(name, id, data) {
        let definition = this.definitions[name]
        let optimistic = typeof definition.optimistic === 'function' ? definition.optimistic(data) : definition.optimistic

        let memo = { id, name, path: '/', method: 'GET', children: [], scripts: [], assets: [], errors: definition.errors?.(data) || [], locale: 'en' }
        if (optimistic) memo.optimistic = optimistic

        return { data: JSON.parse(JSON.stringify(data)), memo, checksum: 'fake' }
    },

    mount(name, { data, into = document.body, listeners = [] } = {}) {
        let definition = this.definitions[name]
        let id = `c${++nextId}`
        let state = structuredClone(data ?? definition.data())

        this.instances[id] = { name, data: state }

        let host = document.createElement('div')
        host.innerHTML = this.html(name, id, state)
        let el = host.firstElementChild

        el.setAttribute('wire:snapshot', JSON.stringify(this.snapshot(name, id, state)))
        el.setAttribute('wire:effects', JSON.stringify({ listeners }))
        into.appendChild(el)

        return el
    },

    async fetch(url, options) {
        let body = JSON.parse(options.body)
        let request = { body, mode: this.mode, at: Date.now() }
        this.requests.push(request)

        if (this.once && this.mode !== 'normal') this.mode = 'normal'

        if (this.manual) {
            await new Promise(resolve => this.pending.push({ request, resolve }))
        } else if (this.latency) {
            await new Promise(resolve => setTimeout(resolve, this.latency))
        }

        if (request.mode === 'offline') throw new TypeError('Failed to fetch')
        if (request.mode === 'error') return new Response('<h1>Boom</h1>', { status: 500 })
        if (request.mode === 'expired') return new Response('', { status: 419 })

        let response
        try {
            response = this.handle(body)
        } catch (error) {
            return new Response(String(error?.message || error), { status: 500 })
        }

        if (request.mode === 'lost') throw new TypeError('Failed to fetch')

        return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },

    // Manual mode: let the request at `index` (oldest first) through.
    async respond(index = 0) {
        let [pending] = this.pending.splice(index, 1)
        if (! pending) throw new Error('No pending request')
        pending.resolve()
        await settle()
    },

    handle(body) {
        let components = body.components.map(({ snapshot, updates, calls }) => {
            let snap = JSON.parse(snapshot)
            let id = snap.memo.id
            let instance = this.instances[id]
            let definition = this.definitions[instance.name]
            let data = snap.data

            for (let [path, value] of Object.entries(updates || {})) dataSet(data, path, value)

            let returns = []
            let rejected = {}
            let dispatches = []
            let skipRender = false

            for (let call of calls) {
                let meta = call.metadata?.optimistic
                this.log.push({ component: instance.name, method: call.method, params: call.params, meta })

                if (meta?.id && this.processed.has(meta.id)) {
                    returns.push(null)
                    continue
                }

                let context = {
                    metadata: call.metadata,
                    dispatch: (name, params = {}) => dispatches.push({ name, params }),
                    skipRender: () => (skipRender = true),
                    db: definition.db,
                }

                try {
                    if (call.method === '$refresh' || call.method === '$commit') {
                        returns.push(null)
                        continue
                    }

                    if (call.method === '__dispatch') {
                        let [event, params] = call.params
                        definition.listeners?.[event]?.(data, params, context)
                        returns.push(null)
                        continue
                    }

                    let method = definition.methods?.[call.method]
                    if (! method) throw new Error(`Method ${call.method} not found`)

                    returns.push(method(data, call.params, context) ?? null)
                    if (meta?.id) this.processed.add(meta.id)
                } catch (error) {
                    if (! (error instanceof Rejected)) throw error

                    rejected[meta?.id] = error.message
                    returns.push(null)
                }
            }

            if (definition.refresh) definition.refresh(data)

            instance.data = data

            let effects = { returns }
            if (! skipRender) effects.html = this.html(instance.name, id, data)
            if (Object.keys(rejected).length) effects.optimistic = { rejected }
            if (dispatches.length) effects.dispatches = dispatches

            return { snapshot: JSON.stringify(this.snapshot(instance.name, id, data)), effects }
        })

        return { components, assets: [] }
    },
}

export async function tick(times = 3) {
    for (let i = 0; i < times; i++) {
        await new Promise(resolve => setTimeout(resolve, 0))
    }
}

// Waits until no request is in flight (manual requests excluded) and the
// resulting DOM work is done.
export async function settle(ms = 0) {
    await tick(2)
    let deadline = Date.now() + 2000

    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, Math.max(ms, 5)))
        let active = optimistic.store.entries.some(entry => entry.status === 'pending' && entry.sent) && ! server.manual
        if (! active) break
    }

    await tick(3)
}

export function attr(value) {
    return escapeAttribute(JSON.stringify(value))
}

export function texts(root, selector) {
    return [...root.querySelectorAll(selector)]
        .filter(el => ! isHidden(el))
        .map(el => el.textContent.replace(/\s+/g, ' ').trim())
}

export function isHidden(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        if (node.style?.display === 'none') return true
    }
    return false
}
