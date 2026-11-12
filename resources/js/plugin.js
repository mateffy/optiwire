import { createStore, isApplied, isUndoable } from './store.js'
import { createDom, KEYED } from './dom.js'
import { getPath, replay } from './replay.js'
import { clone, diff, evaluateExpression, isObject, patch, sameKey, toArray, uuid } from './util.js'

export const defaults = {
    // Mark an action failed (and roll it back) if no response arrived in time.
    // A late successful response still wins, server data is always the truth.
    timeout: 30000,
    // Warn before leaving the page while optimistic changes are in flight.
    warnOnUnload: true,
    // How long a cross component patch waits for its listener to sync.
    linkTimeout: 5000,
    // Remove failed (rolled back) entries after this many ms. 0 = keep until
    // superseded by a new action on the same item or dismissed.
    failedTtl: 0,
    // Don't show Livewire's error modal for requests that only carry
    // optimistic actions: their failure is shown inline instead.
    handleErrors: true,
    // Reconciles allowed per task before they are spread over timers.
    maxBurst: 100,
}

export function install(Livewire, Alpine, options = {}) {
    let config = { ...defaults, ...(globalThis.optimisticConfig || {}), ...options }
    let store = createStore()
    let version = Alpine.reactive({ value: 0 })
    let states = new WeakMap()
    let scheduled = new Set()

    let configOf = component => component?.snapshot?.memo?.optimistic || null
    let dom = createDom({ Alpine, store, configOf })
    let keyOf = dom.keyOf

    // ---- Component state ----------------------------------------------------

    // Components take part when the server sent optimistic config, or (force)
    // when their markup uses a wire:optimistic directive.
    function setup(component, force = false) {
        if (states.has(component)) return states.get(component)

        let cfg = configOf(component) || (force ? {} : null)
        if (! cfg) return null

        let data = clone(cfg.data || {})
        let state = {
            server: clone(component.canonical),
            visible: clone(component.canonical),
            exposedServer: data,
            exposedVisible: clone(data),
            exposed: Alpine.reactive(clone(data)),
        }

        states.set(component, state)
        wrapWire(component, state)
        watchUploads(component)

        return state
    }

    // Exposed computed properties aren't part of Livewire's snapshot data, so
    // they live in our own reactive object and $wire is taught to read them.
    function wrapWire(component, state) {
        let original = component.$wire
        let isExposed = property => typeof property === 'string'
            && Object.prototype.hasOwnProperty.call(state.exposed, property)
            && ! Object.prototype.hasOwnProperty.call(component.reactive, property)

        let proxy = new Proxy({}, {
            get(target, property) {
                if (isExposed(property)) return state.exposed[property]

                return original[property]
            },
            set(target, property, value) {
                if (isExposed(property)) state.exposed[property] = value
                else original[property] = value

                return true
            },
        })

        component.$wire = proxy
        component.el.$wire = proxy
    }

    function teardown(component) {
        for (let entry of store.forComponent(component)) {
            clearTimeout(entry.timer)
            clearTimeout(entry.undoTimer)
            clearTimeout(entry.awaitTimer)
            clearTimeout(entry.ttlTimer)
            store.remove(entry)
        }

        states.delete(component)
        notify()
    }

    function recompute(component, synced = false) {
        let state = states.get(component)
        if (! state) return

        let lists = configOf(component)?.lists || {}
        let entries = store.applied(component)

        let base = { ...clone(state.exposedServer), ...clone(state.server) }
        let visible = replay(base, entries, lists)

        let nextReal = {}
        for (let key of Object.keys(state.server)) nextReal[key] = visible[key]

        let nextExposed = {}
        for (let key of Object.keys(state.exposedServer)) {
            if (! Object.prototype.hasOwnProperty.call(state.server, key)) nextExposed[key] = visible[key]
        }

        // Write-through: the same change goes into Livewire's `canonical`
        // (what it diffs against to find updates) and `reactive` (what the
        // page shows). Optimistic values are therefore never sent to the
        // server as property updates, and identical server values later
        // don't cause a re-render.
        let changes = diff(synced ? state.server : state.visible, nextReal)

        if (changes.length) {
            patch(component.canonical, changes)
            patch(component.reactive, changes)
        }

        state.visible = nextReal

        let exposedChanges = diff(state.exposedVisible, nextExposed)
        if (exposedChanges.length) patch(state.exposed, exposedChanges)
        state.exposedVisible = nextExposed
    }

    function refresh(component) {
        recompute(component)
        dom.reconcile(component)
        afterAlpine(component)
        notify()
    }

    // x-for reuses elements (and swaps their scopes) when data changes, which
    // only happens once Alpine flushes. Reconcile again after that.
    function afterAlpine(component) {
        Alpine.nextTick(() => {
            if (states.has(component)) dom.reconcile(component)
        })
    }

    // Reconciling can add elements, whose directives schedule a reconcile
    // again. That converges after a round or two; should it ever not, fall
    // back from microtasks to timers so the page can never hang.
    let burst = 0
    let burstReset = null

    function schedule(component) {
        if (scheduled.has(component)) return
        scheduled.add(component)

        burst++
        if (! burstReset) burstReset = setTimeout(() => {
            burst = 0
            burstReset = null
        })

        let run = () => {
            scheduled.delete(component)
            if (states.has(component)) dom.reconcile(component)
        }

        if (burst > config.maxBurst) setTimeout(run, 16)
        else queueMicrotask(run)
    }

    function emit(type, entry, extra = {}) {
        globalThis.dispatchEvent?.(new CustomEvent('optimistic:event', { detail: { type, entry: describe(entry), ...extra } }))
    }

    function notify() {
        version.value++
        store.notify()

        globalThis.dispatchEvent?.(new CustomEvent('optimistic:change', { detail: { entries: store.entries } }))
    }

    // ---- Entries ------------------------------------------------------------

    // Actions called as $wire.method() from Alpine have no origin element.
    // The element the user is interacting with right now is the trigger: we
    // remember it for the duration of the event (window.event isn't
    // available everywhere).
    let interaction = null

    for (let type of ['click', 'submit', 'change', 'input', 'keydown']) {
        globalThis.document?.addEventListener(type, event => {
            interaction = event.target
            setTimeout(() => {
                if (interaction === event.target) interaction = null
            })
        }, true)
    }

    function originOf(component, action) {
        let el = action.origin?.el || interaction

        return el && el.nodeType === 1 && component.el.contains(el) ? el : null
    }

    function evaluateWith(expressions, scope) {
        let values = {}

        for (let [field, expression] of Object.entries(expressions || {})) {
            try {
                values[field] = evaluateExpression(expression, scope)
            } catch (error) {
                console.error(`[optimistic] Could not evaluate "${expression}" for "${field}":`, error)
                values[field] = null
            }
        }

        return values
    }

    function without(object, keys) {
        let result = { ...object }
        keys.forEach(key => delete result[key])
        return result
    }

    function resolveOps(component, entry, cfg) {
        let lists = configOf(component)?.lists || {}
        let scope = { ...entry.named, $id: entry.key, $now: entry.now, $wire: component.$wire }

        return cfg.ops.map(op => {
            if (op.type === 'js') return { type: 'js', code: op.code }

            let keyParam = op.key
            let keyValue = keyParam ? entry.named[keyParam] : null
            let withValues = evaluateWith(op.with, scope)

            if (op.type === 'create') {
                let fromParam = op.from || null
                let fields = without(entry.named, [keyParam, fromParam].filter(Boolean))

                return {
                    type: 'create',
                    list: op.list,
                    key: keyValue,
                    from: fromParam ? entry.named[fromParam] : null,
                    move: !! fromParam && fromParam === keyParam,
                    item: { ...clone(lists[op.list]?.defaults || {}), ...fields, ...clone(op.set || {}), ...withValues },
                }
            }

            let keys = op.all ? null : toArray(keyValue)

            if (op.type === 'update') {
                return {
                    type: 'update',
                    list: op.list,
                    keys,
                    fields: { ...without(entry.named, keyParam ? [keyParam] : []), ...clone(op.set || {}), ...withValues },
                }
            }

            return { type: 'delete', list: op.list, keys: keys || [] }
        })
    }

    function targetsOf(ops) {
        let targets = []

        for (let op of ops) {
            if (op.type === 'create') targets.push({ list: op.list, key: op.key })
            if (op.type === 'update' && op.keys === null) targets.push({ list: op.list, all: true })
            if ((op.type === 'update' && op.keys !== null) || op.type === 'delete') op.keys.forEach(key => targets.push({ list: op.list, key }))
        }

        return targets
    }

    function overlaps(a, b) {
        if (! a.targets.length && ! b.targets.length) return a.method === b.method

        return a.targets.some(x => b.targets.some(y => (x.list === null || y.list === null || x.list === y.list) && (x.all || y.all || sameKey(x.key, y.key))))
    }

    function createEntry(component, action, cfg) {
        let params = action.params

        // Fill in the client generated key ("client id") of created items.
        let injected = null
        if (Number.isInteger(cfg.inject) && params.length < cfg.params.length) {
            params.splice(cfg.inject, 0, uuid())
            injected = cfg.inject
        }

        let named = {}
        cfg.params.forEach((name, index) => {
            if (index < params.length) named[name] = params[index]
        })

        let entry = {
            id: uuid(),
            component,
            method: action.name,
            params: clone(params),
            named,
            key: cfg.key ? (named[cfg.key] ?? null) : null,
            injected,
            now: new Date().toISOString(),
            options: {
                undo: cfg.undo || 0,
                retry: !! cfg.retry,
                squash: !! cfg.squash,
                dispatch: cfg.dispatch || null,
                timeout: cfg.timeout ?? config.timeout,
            },
            trigger: originOf(component, action),
            hideEls: [],
            dependents: [],
            createdAt: Date.now(),
        }

        entry.ops = resolveOps(component, entry, cfg)
        entry.targets = targetsOf(entry.ops)

        let remover = entry.trigger?.closest?.('[wire\\:optimistic\\.remove]')
        if (remover && component.el.contains(remover)) {
            let row = remover.closest(KEYED)
            if (row && row !== component.el) {
                entry.hideEls.push(row)
                entry.targets.push({ list: null, key: keyOf(row) })
            }
        }

        action.mergeMetadata({ optimistic: { id: entry.id, injected } })

        return entry
    }

    function supersedeFailures(entry) {
        for (let older of store.forComponent(entry.component)) {
            if (older === entry || older.status !== 'failed') continue
            if (overlaps(older, entry) || (older.trigger && older.trigger === entry.trigger)) removeEntry(older)
        }
    }

    function squashOlder(entry) {
        if (! entry.options.squash) return

        for (let older of store.forComponent(entry.component)) {
            if (older === entry || older.status !== 'pending' || older.sent || older.method !== entry.method) continue
            if (overlaps(older, entry)) cancelEntry(older)
        }
    }

    function link(entry) {
        let event = entry.options.dispatch
        if (! event) return

        for (let other of Livewire.all()) {
            let codes = toArray(configOf(other)?.listeners?.[event])
            if (! codes.length) continue

            setup(other)

            let linked = store.add({
                id: uuid(),
                component: other,
                method: `@${event}`,
                params: [],
                named: { $event: clone(entry.named) },
                key: null,
                now: entry.now,
                options: {},
                ops: codes.map(code => ({ type: 'js', code })),
                targets: [],
                hideEls: [],
                dependents: [],
                trigger: null,
                linkedTo: entry.id,
                event,
                createdAt: Date.now(),
            })

            linked.sent = true
            refresh(other)
        }
    }

    // ---- Holding actions back (undo windows, waiting for a create) -------

    function hold(entry, action, gate) {
        entry.gates.add(gate)

        if (entry.held) return

        if (! action.isDeferred()) action.defer()

        // Livewire may try to fire a deferred action once the in-flight message
        // finishes. We decide when it goes out, so swallow that.
        action._fire = () => {}
        entry.held = action
    }

    function release(entry, gate) {
        entry.gates.delete(gate)

        if (entry.gates.size > 0 || ! entry.held || entry.removed) return

        let held = entry.held
        entry.held = null

        // Fire a fresh action through Livewire's normal pipeline, so it's
        // queued behind in-flight requests like any other action would be.
        let promise = Livewire.fireAction(entry.component, entry.method, entry.params, {
            ...held.metadata,
            optimistic: { ...held.metadata.optimistic, id: entry.id, resume: true },
        })

        promise.then(value => held.resolvePromise(value), error => held.rejectPromise(error))
        notify()
    }

    function holdForDependencies(entry, action) {
        for (let target of entry.targets) {
            if (target.all || target.key === null || target.key === undefined) continue

            let create = store.entries.find(candidate =>
                candidate !== entry
                && candidate.status === 'pending'
                && candidate.ops.some(op => op.type === 'create' && sameKey(op.key, target.key))
                && (! candidate.sent || candidate.held))

            if (create && ! create.dependents.includes(entry)) {
                create.dependents.push(entry)
                hold(entry, action, `after:${create.id}`)
            }
        }
    }

    // ---- Settling entries ---------------------------------------------------

    function removeEntry(entry) {
        if (entry.removed) return

        clearTimeout(entry.timer)
        clearTimeout(entry.undoTimer)
        clearTimeout(entry.awaitTimer)
        clearTimeout(entry.ttlTimer)

        if (entry.preview?.url) URL.revokeObjectURL?.(entry.preview.url)

        store.remove(entry)
        emit(entry.settled ? 'confirmed' : (entry.status === 'failed' ? 'dismissed' : 'rolled-back'), entry)

        for (let linked of store.linkedTo(entry)) {
            removeEntry(linked)
            refresh(linked.component)
        }
    }

    function cancelEntry(entry) {
        if (entry.removed) return

        let action = entry.held || entry.action
        entry.cancelling = true

        removeEntry(entry)
        entry.dependents.forEach(cancelEntry)

        if (action && ! action.isCancelled()) {
            // Livewire fires deferred actions once the message in flight
            // finishes, cancelled or not. Make sure this one never goes out.
            action._fire = () => {}
            action.cancel()
        }

        refresh(entry.component)
    }

    function fail(entry, error) {
        if (entry.removed || entry.status === 'failed') return

        clearTimeout(entry.timer)
        entry.status = 'failed'
        entry.error = error
        entry.failedAt = Date.now()

        for (let linked of store.linkedTo(entry)) {
            removeEntry(linked)
            refresh(linked.component)
        }

        entry.dependents.forEach(cancelEntry)
        entry.dependents = []

        if (config.failedTtl > 0) {
            entry.ttlTimer = setTimeout(() => {
                if (entry.status !== 'failed') return
                removeEntry(entry)
                refresh(entry.component)
            }, config.failedTtl)
        }

        emit('failed', entry, { error })
    }

    function alias(entry, from, to) {
        let swap = value => (sameKey(value, from) ? to : value)

        for (let dependent of entry.dependents) {
            dependent.params = dependent.params.map(param => (Array.isArray(param) ? param.map(swap) : swap(param)))
            for (let name of Object.keys(dependent.named)) {
                let value = dependent.named[name]
                dependent.named[name] = Array.isArray(value) ? value.map(swap) : swap(value)
            }
            for (let op of dependent.ops) {
                if (op.keys) op.keys = op.keys.map(swap)
                if (op.key !== undefined) op.key = swap(op.key)
            }
            dependent.targets.forEach(target => {
                target.key = swap(target.key)
            })
        }
    }

    function settle(entry, { result, effects } = {}) {
        if (entry.removed) return

        let created = entry.ops.find(op => op.type === 'create')
        if (created && (typeof result === 'string' || typeof result === 'number') && ! sameKey(result, created.key)) {
            alias(entry, created.key, result)
        }

        for (let linked of store.linkedTo(entry)) {
            let dispatched = toArray(effects?.dispatches).some(dispatch => dispatch?.name === linked.event)

            if (! dispatched) {
                removeEntry(linked)
                refresh(linked.component)
                continue
            }

            // The listener will refresh itself. Keep its patch until it has.
            linked.status = 'awaiting'
            linked.linkedTo = null
            linked.awaitingSince = Date.now()
            linked.awaitTimer = setTimeout(() => {
                removeEntry(linked)
                refresh(linked.component)
            }, config.linkTimeout)
        }

        let dependents = entry.dependents
        entry.dependents = []

        entry.settled = true
        dom.release(entry.component, entry)
        removeEntry(entry)

        dependents.forEach(dependent => release(dependent, `after:${entry.id}`))
    }

    // ---- Livewire integration ----------------------------------------------

    // Successful responses are settled during the message's sync (see
    // `sync()`), which runs before Livewire resolves the action itself.
    function track(entry, action, { onSend, onError, onFailure, onCancel }) {
        store.attach(action, entry)
        action.promise.catch(() => {})

        let current = () => entry.action === action && ! entry.removed

        onSend(() => {
            if (! current()) return

            entry.sent = true
            entry.sentAt = Date.now()
            emit('sent', entry)

            if (entry.options.timeout > 0) {
                clearTimeout(entry.timer)
                entry.timer = setTimeout(() => {
                    fail(entry, 'Timed out')
                    refresh(entry.component)
                }, entry.options.timeout)
            }

            notify()
        })

        onError(({ response } = {}) => {
            if (! current()) return

            fail(entry, `Request failed${response?.status ? ` (${response.status})` : ''}`)
            refresh(entry.component)
        })

        onFailure(() => {
            if (! current()) return

            fail(entry, 'Network error')
            refresh(entry.component)
        })

        onCancel(() => {
            if (entry.action !== action || entry.cancelling) return

            cancelEntry(entry)
        })
    }

    Livewire.interceptAction(hooks => {
        let { action } = hooks
        let component = action.component
        let meta = action.metadata?.optimistic

        if (meta?.resume) {
            let entry = store.find(meta.id)
            if (entry && ! entry.removed) track(entry, action, hooks)
            return
        }

        let cfg = configOf(component)?.actions?.[action.name]
        if (! cfg) return
        if (! setup(component)) return

        let entry = store.add(createEntry(component, action, cfg))

        track(entry, action, hooks)
        supersedeFailures(entry)
        squashOlder(entry)
        holdForDependencies(entry, action)

        if (entry.options.undo > 0) {
            hold(entry, action, 'undo')
            entry.undoUntil = Date.now() + entry.options.undo * 1000
            entry.undoTimer = setTimeout(() => release(entry, 'undo'), entry.options.undo * 1000)
        }

        emit('added', entry)
        link(entry)
        refresh(component)
    })

    Livewire.interceptRequest(({ request, onError }) => {
        onError(({ response, preventDefault }) => {
            if (! config.handleErrors || response?.status === 419) return

            let actions = [...request.messages].flatMap(message => [...message.actions])
            if (actions.length && actions.every(action => store.forAction(action))) preventDefault()
        })
    })

    Livewire.interceptMessage(({ message, onSend, onSuccess, onError, onFailure, onCancel }) => {
        let component = message.component
        let actions = () => [...message.actions].flatMap(action => [action, ...action.squashedActions])

        onSend(() => {
            message.__optimisticSentAt = Date.now()
        })

        onSuccess(({ payload, onSync, onMorphed }) => {
            onSync(() => sync(component, message, payload, actions()))
            onMorphed(() => {
                if (! states.has(component)) return
                dom.reconcile(component)
                afterAlpine(component)
                notify()
            })
        })

        let failAll = message => (details = {}) => {
            let error = typeof message === 'function' ? message(details) : message

            for (let action of actions()) {
                let entry = store.forAction(action)
                if (entry && entry.action === action) fail(entry, error)

                // A failed _finishUpload means the file never made it.
                let upload = uploadEntry(component, action)
                if (upload) fail(upload, error)
            }

            if (states.has(component)) refresh(component)
        }

        onError(failAll(({ response }) => `Request failed${response?.status ? ` (${response.status})` : ''}`))
        onFailure(failAll('Network error'))

        let cancelAll = () => {
            for (let action of actions()) {
                let entry = store.forAction(action)
                if (entry && entry.action === action) cancelEntry(entry)
            }
        }

        onCancel(cancelAll)

        // Cancelled by another interceptor while Livewire was still building
        // the request: nobody is told, and the actions would hang forever.
        queueMicrotask(() => {
            if (message.isCancelled()) cancelAll()
        })
    })

    function sync(component, message, payload, actions) {
        let state = setup(component)
        if (! state) return

        state.server = clone(component.canonical)
        state.exposedServer = clone(configOf(component)?.data || {})

        let effects = payload?.effects || {}
        let rejected = effects.optimistic?.rejected || {}
        let returns = toArray(effects.returns)
        let messageActions = [...message.actions]

        for (let action of actions) {
            let entry = store.forAction(action)
            if (! entry || entry.removed || entry.action !== action) continue

            if (Object.prototype.hasOwnProperty.call(rejected, entry.id)) {
                entry.status = 'pending'
                fail(entry, rejected[entry.id] || 'Rejected')
                continue
            }

            let index = messageActions.indexOf(action)
            settle(entry, { result: index === -1 ? undefined : returns[index], effects })
        }

        let sentAt = message.__optimisticSentAt ?? 0

        for (let entry of store.forComponent(component)) {
            if (entry.status === 'awaiting' && sentAt >= entry.awaitingSince) removeEntry(entry)
        }

        // Livewire finishes an upload with a _finishUpload (or _uploadErrored)
        // call. Once that synced, the server has validated and stored the file.
        for (let action of messageActions) {
            let entry = uploadEntry(component, action)
            if (! entry) continue

            let errors = toArray(component.snapshot?.memo?.errors?.[action.params[0]])

            if (errors.length) fail(entry, errors[0])
            else if (action.name === '_uploadErrored') fail(entry, 'Upload failed')
            else removeEntry(entry)
        }

        recompute(component, true)
    }

    // ---- File previews --------------------------------------------------------

    // The pending preview a Livewire upload call (_finishUpload or
    // _uploadErrored, first parameter: the property) is about.
    function uploadEntry(component, action) {
        if (! ['_finishUpload', '_uploadErrored'].includes(action.name)) return null

        return store.forComponent(component).filter(entry => entry.preview?.property === action.params[0] && entry.status === 'pending').pop() || null
    }

    function watchUploads(component) {
        let previews = component.__optimisticPreviews || (component.__optimisticPreviews = new Set())

        let modelOf = input => {
            let attribute = Array.from(input.attributes).find(candidate => candidate.name.startsWith('wire:model'))
            return attribute ? attribute.value : null
        }

        let latest = property => store.forComponent(component).filter(entry => entry.preview?.property === property).pop()

        component.el.addEventListener('change', event => {
            let input = event.target
            if (! input || input.type !== 'file' || ! input.files?.length) return

            let property = modelOf(input)
            if (! property || ! [...previews].some(preview => preview.property === property)) return

            let previous = latest(property)
            if (previous) removeEntry(previous)

            store.add({
                id: uuid(),
                component,
                method: `$upload:${property}`,
                params: [],
                named: {},
                key: null,
                now: new Date().toISOString(),
                options: {},
                ops: [],
                targets: [],
                hideEls: [],
                dependents: [],
                trigger: input,
                preview: { property, url: URL.createObjectURL(input.files[0]) },
                createdAt: Date.now(),
            })

            refresh(component)
        }, true) // Capture: Livewire's own listener on the input clears its files.

        let onUpload = (name, callback) => component.el.addEventListener(name, event => {
            let entry = latest(event.detail?.property)
            if (! entry || entry.removed) return

            callback(entry)
            refresh(component)
        })

        onUpload('livewire-upload-error', entry => fail(entry, 'Upload failed'))
        onUpload('livewire-upload-cancel', entry => removeEntry(entry))

        component.__optimisticPreviewFor = property => {
            let entry = latest(property)
            return entry && isApplied(entry) ? entry.preview.url : null
        }
    }

    function registerPreview(component, el, property) {
        let previews = component.__optimisticPreviews || (component.__optimisticPreviews = new Set())
        let state = { original: el.getAttribute('src'), written: null }

        let preview = {
            property,
            reconcile() {
                let url = component.__optimisticPreviewFor?.(property) ?? null
                let current = el.getAttribute('src')

                if (state.written === null || current !== state.written) state.original = current

                if (url) {
                    if (current !== url) el.setAttribute('src', url)
                    state.written = url
                } else if (state.written !== null) {
                    if (state.original === null) el.removeAttribute('src')
                    else el.setAttribute('src', state.original)
                    state.written = null
                }
            },
        }

        previews.add(preview)

        return () => previews.delete(preview)
    }

    // ---- Directives & magics ----------------------------------------------------

    function keyFromArgument(value) {
        if (isObject(value)) return value.id ?? value.key ?? null

        return value
    }

    // `wide`: outside of rows, look at the whole component (undo windows).
    function entriesFor(component, el, key, wide = false) {
        if (key === undefined) {
            let context = dom.contextFor(component, el)
            return wide && ! context.row ? context.all : context.entries
        }

        key = keyFromArgument(key)

        return store.forComponent(component).filter(entry => entry.targets.some(target => target.all || sameKey(target.key, key)))
    }

    // Callers only pass failed (retry, dismiss) or undoable (undo) entries.
    function retry(entry) {
        entry.status = 'pending'
        entry.error = null
        entry.sent = false
        clearTimeout(entry.ttlTimer)
        emit('retried', entry)

        Livewire.fireAction(entry.component, entry.method, entry.params, {
            optimistic: { id: entry.id, injected: entry.injected, resume: true, retry: true },
        })

        refresh(entry.component)
    }

    function undo(entry) {
        cancelEntry(entry)
    }

    function dismiss(entry) {
        removeEntry(entry)
        refresh(entry.component)
    }

    function describe(entry) {
        return {
            id: entry.id,
            component: entry.component?.name,
            componentId: entry.component?.id,
            method: entry.method,
            params: entry.params,
            status: entry.status,
            error: entry.error,
            sent: !! entry.sent,
            gates: [...entry.gates],
            undoUntil: entry.undoUntil || null,
            linked: !! entry.event,
            createdAt: entry.createdAt,
        }
    }

    function api(component, el) {
        version.value

        let pick = key => entriesFor(component, el, key)
        let latest = (key, predicate) => pick(key).filter(predicate).pop() || null

        return {
            get entries() {
                return store.forComponent(component).map(describe)
            },
            get all() {
                return store.entries.map(describe)
            },
            pending: key => pick(key).some(entry => entry.status === 'pending' || entry.status === 'awaiting'),
            failed: key => pick(key).some(entry => entry.status === 'failed'),
            error: key => latest(key, entry => entry.status === 'failed')?.error ?? null,
            state(key) {
                let entries = pick(key)
                if (entries.some(entry => entry.status === 'failed')) return 'failed'
                if (entries.length) return 'pending'
                return null
            },
            undoable: key => entriesFor(component, el, key, true).filter(isUndoable).map(describe),
            undo: key => entriesFor(component, el, key, true).filter(isUndoable).forEach(undo),
            retry: key => pick(key).filter(entry => entry.status === 'failed').forEach(retry),
            dismiss: key => pick(key).filter(entry => entry.status === 'failed').forEach(dismiss),
            server(path) {
                let state = states.get(component)
                return state ? getPath({ ...state.exposedServer, ...state.server }, path) : undefined
            },
            item: key => {
                let row = [...component.el.querySelectorAll(KEYED)].find(candidate => dom.isRow(candidate) && sameKey(keyOf(candidate), keyFromArgument(key)))
                return row ? dom.rowItem(component, row).item : null
            },
        }
    }

    // $item: the server fields of the closest Blade row plus pending changes.
    // Always an object, so `$item.field` never throws (Alpine also evaluates
    // elements that a morph is about to insert, before they're attached).
    Alpine.magic('item', el => {
        version.value

        let component = el.closest('[wire\\:id]')?.__livewire
        let row = component && dom.rowOf(component, el)

        return row && dom.isRow(row) ? dom.rowItem(component, row).item : {}
    })

    Alpine.magic('optimistic', el => {
        let root = el.closest('[wire\\:id]')
        let component = root?.__livewire

        if (! component) return null

        return api(component, el)
    })

    Livewire.directive('optimistic', ({ el, directive, component, cleanup }) => {
        let type = directive.modifiers[0]

        setup(component, true)

        if (['retry', 'undo', 'dismiss'].includes(type)) {
            let handler = event => {
                event.preventDefault()
                let context = dom.contextFor(component, el)
                let entries = context.entries

                if (type === 'retry') entries.filter(entry => entry.status === 'failed').forEach(retry)
                if (type === 'undo') (context.row ? entries : context.all).filter(isUndoable).forEach(undo)
                if (type === 'dismiss') entries.filter(entry => entry.status === 'failed').forEach(dismiss)
            }

            el.addEventListener('click', handler)
            cleanup(() => el.removeEventListener('click', handler))
        }

        if (type === 'preview') cleanup(registerPreview(component, el, directive.expression))

        schedule(component)
    })

    Livewire.hook('component.init', ({ component, cleanup }) => {
        if (! setup(component)) return

        cleanup(() => teardown(component))
        schedule(component)
    })

    Livewire.hook('morph', ({ component }) => {
        if (states.has(component)) dom.detach(component)
    })

    // A component's HTML was replaced by the server's: what's on screen now is
    // server truth, re-apply whatever is still pending on top of it.
    Livewire.hook('morphed', ({ component }) => {
        if (! states.has(component)) return

        dom.adoptServerContent(component)
        dom.reconcile(component)
    })

    // ---- Leaving the page -------------------------------------------------------

    function flushUndoWindows() {
        for (let entry of store.entries) {
            if (entry.gates.has('undo')) {
                clearTimeout(entry.undoTimer)
                release(entry, 'undo')
            }
        }
    }

    globalThis.addEventListener?.('beforeunload', event => {
        let pending = store.entries.filter(entry => entry.status === 'pending')
        if (! pending.length) return

        flushUndoWindows()

        if (config.warnOnUnload) {
            event.preventDefault()
            event.returnValue = ''
        }
    })

    globalThis.document?.addEventListener('livewire:navigate', flushUndoWindows)

    // Installed after Livewire already booted (script injected lazily).
    for (let component of Livewire.all?.() || []) {
        if (setup(component)) schedule(component)
    }

    return { store, config, version, uuid, api, describe, refresh, flushUndoWindows }
}
