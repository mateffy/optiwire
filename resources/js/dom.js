import { isApplied, isUndoable } from './store.js'
import { getPath, overlay } from './replay.js'
import { hasOrder, insertionIndex, orderFields, sortKey } from './order.js'
import { sameKey } from './util.js'

// Blade mode: the client has no list data, only server rendered rows. Every
// optimistic effect on them is applied by `reconcile()`, an idempotent pass
// that makes the DOM match "server HTML + pending entries". It runs after
// every state change and after every morph (which resets our changes).

const PREFIX = 'wire:optimistic'
const STRUCTURAL = ['list', 'group', 'row', 'create', 'key']
const INTERACTIVE = 'button, input, select, textarea, a[href], [wire\\:click], [x-on\\:click]'

export function directivesOf(el) {
    let directives = []

    for (let attribute of Array.from(el.attributes || [])) {
        if (attribute.name !== PREFIX && ! attribute.name.startsWith(PREFIX + '.')) continue

        let modifiers = attribute.name.split('.').slice(1)
        directives.push({ name: attribute.name, modifiers, type: modifiers[0] || null, value: attribute.value })
    }

    return directives
}

export function directive(el, type) {
    return directivesOf(el).find(candidate => candidate.type === type) || null
}

export function isRow(el) {
    return !! el && el.nodeType === 1 && (el.hasAttribute(`${PREFIX}.row`) || !! el.__optimisticClone)
}

// x-for rows can't use an Alpine bound :wire:key (Livewire would treat the
// attribute as an event directive), so they declare wire:optimistic.key="expr".
export const KEYED = '[wire\\:key], [wire\\:optimistic\\.key]'

export function isKeyed(el) {
    return el.hasAttribute('wire:key') || el.hasAttribute(`${PREFIX}.key`)
}

// `evaluate(el, expression)` resolves wire:optimistic.key expressions.
export function keyOf(el, evaluate = null) {
    return readKey(el, evaluate)
}

function readKey(el, evaluate) {
    if (el.hasAttribute('wire:key')) return el.getAttribute('wire:key')

    let expression = el.getAttribute(`${PREFIX}.key`)
    if (expression === null || ! evaluate) return null

    let value = evaluate(el, expression)

    return value === null || value === undefined ? null : String(value)
}

function belongsTo(component, el) {
    return el.closest('[wire\\:id]') === component.el
}

export function parseRow(el) {
    let raw = el.getAttribute(`${PREFIX}.row`)

    if (el.__optimisticParsed && el.__optimisticParsed.raw === raw) return el.__optimisticParsed.value

    let value = {}
    try {
        value = raw ? JSON.parse(raw) : {}
    } catch (error) {
        console.error('[optimistic] Invalid wire:optimistic.row JSON:', raw)
    }

    el.__optimisticParsed = { raw, value }

    return value
}

// ---- Low level, morph-resilient element mutations --------------------------

// Every write is skipped when nothing changes: an attribute write, even an
// identical one, is a mutation that makes Alpine and Livewire re-initialize
// directives, which would schedule yet another reconcile.
export function setAttribute(el, name, value) {
    if (value === null || value === undefined) {
        if (el.hasAttribute(name)) el.removeAttribute(name)
        return
    }

    if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export function setHidden(el, reason, hidden) {
    let reasons = el.__optimisticHide || (el.__optimisticHide = new Set())

    if (hidden) reasons.add(reason)
    else reasons.delete(reason)

    if (reasons.size > 0) {
        if (el.style.getPropertyValue('display') !== 'none') {
            if (el.__optimisticDisplay === undefined) el.__optimisticDisplay = el.style.getPropertyValue('display')
            el.style.setProperty('display', 'none', 'important')
        }
    } else if (el.__optimisticDisplay !== undefined) {
        if (el.__optimisticDisplay) el.style.setProperty('display', el.__optimisticDisplay)
        else el.style.removeProperty('display')

        if (el.getAttribute('style') === '') el.removeAttribute('style')
        delete el.__optimisticDisplay
    }
}

export function setClasses(el, source, classes, active) {
    let sources = el.__optimisticClassSources || (el.__optimisticClassSources = new Map())
    let owned = el.__optimisticOwnedClasses || (el.__optimisticOwnedClasses = new Set())

    if (active && classes.length) sources.set(source, classes)
    else sources.delete(source)

    let desired = new Set([...sources.values()].flat())

    for (let name of desired) {
        if (! el.classList.contains(name)) {
            el.classList.add(name)
            owned.add(name)
        }
    }

    for (let name of [...owned]) {
        if (! desired.has(name)) {
            el.classList.remove(name)
            owned.delete(name)
        }
    }
}

export function splitClasses(value) {
    if (Array.isArray(value)) return value.flatMap(splitClasses)

    if (value && typeof value === 'object') {
        return Object.entries(value).filter(([, on]) => on).flatMap(([names]) => splitClasses(names))
    }

    return String(value ?? '').split(/\s+/).filter(Boolean)
}

function setText(el, value, active) {
    let state = el.__optimisticText || (el.__optimisticText = { original: el.textContent, written: null })

    // Something else (usually a morph) changed the content: that is the new server value.
    if (state.written === null || el.textContent !== state.written) state.original = el.textContent

    if (active) {
        let text = value === null || value === undefined ? '' : String(value)
        if (el.textContent !== text) el.textContent = text
        state.written = text
    } else if (state.written !== null) {
        if (el.textContent !== state.original) el.textContent = state.original
        state.written = null
    }
}

const PROPERTIES = ['value', 'checked', 'selected', 'disabled', 'indeterminate']

function setBinding(el, attribute, value) {
    let bound = el.__optimisticBound || (el.__optimisticBound = new Map())

    if (attribute === 'class') {
        setClasses(el, 'bind', splitClasses(value), true)
        return
    }

    // Only write when the computed value changes. Re-applying an unchanged
    // value would clobber what the user is currently typing.
    let serialized = JSON.stringify(value === undefined ? null : value)
    if (bound.has(attribute) && bound.get(attribute) === serialized) return
    bound.set(attribute, serialized)

    if (PROPERTIES.includes(attribute)) {
        let next = attribute === 'value' ? (value === null || value === undefined ? '' : String(value)) : !! value
        if (el[attribute] !== next) el[attribute] = next

        if (attribute !== 'value') setAttribute(el, attribute, next ? '' : null)

        return
    }

    setAttribute(el, attribute, value === false || value === null || value === undefined ? null : (value === true ? '' : String(value)))
}

// Removes the existing attribute node before setting the new value. Some
// DOM implementations add a second attribute instead of replacing one whose
// (parsed) name contains a colon, like wire:key.
export function replaceAttribute(el, name, value) {
    for (let attribute of Array.from(el.attributes)) {
        if (attribute.name === name) el.removeAttributeNode(attribute)
    }

    el.setAttribute(name, value)
}

// A copy must never contain (copies of) other Livewire components: they
// would be initialized as duplicates of the real ones.
export function detachComponents(el) {
    el.querySelectorAll('[wire\\:id]').forEach(child => {
        child.removeAttribute('wire:id')
        child.removeAttribute('wire:snapshot')
        child.removeAttribute('wire:effects')
    })

    return el
}

// A copy of a rendered row built from its markup: no Alpine/Livewire state
// (or anything else attached to the original element) comes along.
export function copyOf(el) {
    let template = el.ownerDocument.createElement('template')
    template.innerHTML = el.outerHTML

    return template.content.firstElementChild
}

// ---- The reconciler ---------------------------------------------------------

export function createDom({ Alpine, store, configOf }) {
    // Shadows the module level keyOf: inside the reconciler, x-for keys are
    // evaluated with this instance's Alpine.
    let evaluateKey = (el, expression) => Alpine.evaluate(el, expression)
    let keyOf = el => readKey(el, evaluateKey)

    function listsOf(component) {
        return configOf(component)?.lists || {}
    }

    function containerOf(component, row) {
        let parent = row.parentElement
        if (! parent || ! belongsTo(component, parent)) return null

        return directive(parent, 'list') ? parent : null
    }

    function listNameOf(component, row) {
        let container = containerOf(component, row)

        return container ? directive(container, 'list').value : null
    }

    function targets(entry, key, list) {
        return entry.targets.some(target => (list === null || target.list === list) && (target.all || sameKey(target.key, key)))
    }

    function rowEntries(component, key, list) {
        return store.forComponent(component).filter(entry => targets(entry, key, list))
    }

    function rowItem(component, row) {
        let list = listNameOf(component, row) ?? row.__optimisticList ?? null
        let base = parseRow(row)

        if (list === null) return { item: base, touched: false, fields: new Set() }

        let applied = store.applied(component)
        let result = overlay(base, keyOf(row), list, applied, listsOf(component))

        let fields = new Set()
        for (let entry of applied) {
            for (let op of entry.ops) {
                if (op.list !== list) continue
                if (op.type === 'update' && (op.keys === null || op.keys.some(key => sameKey(key, keyOf(row))))) Object.keys(op.fields).forEach(field => fields.add(field))
            }
        }

        return { ...result, fields }
    }

    function makeElement(component, container, entry, op, item) {
        let template = Array.from(container.children).find(child => {
            if (child.tagName !== 'TEMPLATE') return false
            let create = directive(child, 'create')
            return create && (! create.value || create.value === entry.method)
        })

        let el = takeDetached(component, entry.id, op.key)

        if (el) {
            setAttribute(el, `${PREFIX}.row`, JSON.stringify(item))
            container.insertBefore(el, template || null)
            return el
        }

        if (template) {
            let content = template.content.firstElementChild
            el = content ? content.cloneNode(true) : null
        } else if (op.from !== null && op.from !== undefined) {
            let source = ownRows(component).find(row => sameKey(keyOf(row), op.from) && ! row.__optimisticClone)
            el = source ? copyOf(source) : null
        }

        if (! el) return null

        detachComponents(el)
        el.removeAttribute('style')
        replaceAttribute(el, 'wire:key', op.key)
        replaceAttribute(el, `${PREFIX}.row`, JSON.stringify(item))
        el.__optimisticClone = entry.id
        el.__optimisticList = op.list
        el.__optimisticFromTemplate = !! template

        if (template) container.insertBefore(el, template)
        else container.appendChild(el)

        return el
    }

    // Alpine's morph silently drops keyed elements it doesn't know about when
    // they sit between server rows. So right before a morph our clones leave
    // the DOM, and the reconcile after it puts the very same elements (with
    // their state) back.
    function detach(component) {
        let pool = component.__optimisticDetached = []

        for (let row of ownRows(component)) {
            if (! row.__optimisticClone) continue

            pool.push(row)
            row.parentNode.removeChild(row)
        }
    }

    function takeDetached(component, entryId, key) {
        let pool = component.__optimisticDetached || []
        let index = pool.findIndex(el => el.__optimisticClone === entryId && sameKey(keyOf(el), key))

        return index === -1 ? null : pool.splice(index, 1)[0]
    }

    function ownElements(component) {
        return Array.from(component.el.querySelectorAll('*')).filter(el => belongsTo(component, el))
    }

    function ownRows(component) {
        return ownElements(component).filter(isRow)
    }

    function containers(component) {
        return ownElements(component).filter(el => directive(el, 'list'))
    }

    function groupOf(container) {
        let group = directive(container, 'group')

        return group ? group.value : null
    }

    function rowsIn(container) {
        return Array.from(container.children).filter(isRow)
    }

    function reconcileContainer(component, container, allContainers) {
        let list = directive(container, 'list').value
        let stable = directive(container, 'list').modifiers.includes('stable')
        let spec = listsOf(component)[list] || {}
        let groupBy = spec.groupBy || null
        let group = groupOf(container)
        let applied = store.applied(component)
        let dirty = new Set()

        let fitsHere = item => ! groupBy || group === null || String(item?.[groupBy]) === String(group)

        // 1. Optimistically created items (and the destination copy of moves).
        for (let entry of applied) {
            for (let op of entry.ops) {
                if (op.type !== 'create' || op.list !== list) continue

                let { item } = overlay(op.item, op.key, list, applied, listsOf(component))
                if (op.from !== null && op.from !== undefined) {
                    let source = ownRows(component).find(row => sameKey(keyOf(row), op.from) && ! row.__optimisticClone)
                    if (source) item = { ...parseRow(source), ...item }
                }
                item[spec.key || 'id'] = op.key

                if (! fitsHere(item)) continue

                let existing = rowsIn(container).find(row => sameKey(keyOf(row), op.key))

                if (existing && ! existing.__optimisticClone) continue

                if (existing) {
                    setAttribute(existing, `${PREFIX}.row`, JSON.stringify(item))
                    dirty.add(existing)
                    continue
                }

                let el = makeElement(component, container, entry, op, item)
                if (el) dirty.add(el)
            }
        }

        // 2. Real rows whose group changed move: hidden here, mirrored there.
        if (groupBy && group !== null) {
            for (let row of rowsIn(container)) {
                if (row.__optimisticClone) continue

                // Only a pending change can move a row. Where the server put a
                // row is where it belongs (that also covers an adopted mirror
                // that still carries its source's data until the morph).
                let owner = applied.filter(entry => entry.ops.some(op => op.type === 'update' && op.list === list && Object.prototype.hasOwnProperty.call(op.fields, groupBy) && (op.keys === null || op.keys.some(key => sameKey(key, keyOf(row)))))).pop()
                let { item } = rowItem(component, row)
                let target = String(item[groupBy])
                let movedOut = !! owner && target !== String(group)

                setHidden(row, 'moved', movedOut)
                if (! movedOut) continue

                let destination = allContainers.find(other => other !== container && directive(other, 'list').value === list && String(groupOf(other)) === target)
                if (! destination) continue

                let mirror = rowsIn(destination).find(candidate => sameKey(keyOf(candidate), keyOf(row)))
                if (mirror && ! mirror.__optimisticClone) continue

                if (! mirror) {
                    mirror = takeDetached(component, owner.id, keyOf(row))

                    if (mirror) {
                        let template = Array.from(destination.children).find(child => child.tagName === 'TEMPLATE')
                        destination.insertBefore(mirror, template || null)
                    }
                }

                if (! mirror) {
                    mirror = detachComponents(copyOf(row))
                    mirror.__optimisticClone = owner.id
                    mirror.__optimisticMirrorOf = row
                    mirror.__optimisticList = list
                    mirror.removeAttribute('style')
                    let template = Array.from(destination.children).find(child => child.tagName === 'TEMPLATE')
                    destination.insertBefore(mirror, template || null)
                }

                mirror.__optimisticClone = owner.id
                mirror.__optimisticMirrorOf = row
                setAttribute(mirror, `${PREFIX}.row`, JSON.stringify(item))
            }
        }

        // 3. Clones that are no longer backed by an applied entry disappear.
        for (let row of rowsIn(container)) {
            if (! row.__optimisticClone) continue

            let entry = store.find(row.__optimisticClone)
            let { item } = rowItem(component, row)
            let stale = ! entry || ! isApplied(entry) || ! fitsHere(item)

            if (row.__optimisticMirrorOf) {
                let source = row.__optimisticMirrorOf
                stale = stale || ! source.isConnected || String(rowItem(component, source).item[groupBy]) !== String(group)
            }

            let duplicate = rowsIn(container).some(other => other !== row && ! other.__optimisticClone && sameKey(keyOf(other), keyOf(row)))

            if (stale || duplicate) {
                row.remove()
                continue
            }

            dirty.add(row)
        }

        // 4. Keep the list ordered. Only "dirty" rows are placed by sort key;
        //    everything else keeps the server's order (also after a rollback
        //    put a row we had moved back to "clean").
        if (! hasOrder(spec)) return

        for (let row of rowsIn(container)) {
            if (row.__optimisticClone) continue
            if (stable || spec.stable) continue

            let { fields } = rowItem(component, row)
            if (orderFields(spec).some(field => fields.has(field))) dirty.add(row)
        }

        let rows = rowsIn(container)
        let serverOrder = row => row.__optimisticServerIndex ?? Number.MAX_SAFE_INTEGER
        let desired = rows.filter(row => ! dirty.has(row)).sort((a, b) => serverOrder(a) - serverOrder(b))
        let keyFor = row => sortKey(spec, rowItem(component, row).item)

        for (let row of rows.filter(row => dirty.has(row))) {
            let index = insertionIndex(spec, desired.map(keyFor), keyFor(row))
            desired.splice(index, 0, row)
        }

        // Place rows back to front, each right before its successor. Rows that
        // are already in place aren't touched (moving a node loses focus).
        if (! rows.length) return

        let anchor = rows[rows.length - 1].nextElementSibling

        for (let index = desired.length - 1; index >= 0; index--) {
            let row = desired[index]
            if (row.nextElementSibling !== anchor) container.insertBefore(row, anchor)
            anchor = row
        }
    }

    function stateFor(entries) {
        return {
            pending: entries.some(entry => entry.status === 'pending' || entry.status === 'awaiting'),
            failed: entries.some(entry => entry.status === 'failed'),
            undoable: entries.some(isUndoable),
            any: entries.length > 0,
        }
    }

    // Rows are any keyed element inside the component: Blade rows (with
    // server fields), optimistic clones, or x-for rows rendered from data.
    function rowOf(component, el) {
        let row = el.closest(KEYED)

        if (! row || row === component.el || ! belongsTo(component, row)) return null

        return row
    }

    function contextFor(component, el) {
        let row = rowOf(component, el)

        if (row) {
            let list = listNameOf(component, row) ?? row.__optimisticList ?? null
            let key = keyOf(row)
            let entries = rowEntries(component, key, list)
            let applied = entries.filter(isApplied)
            let { item, touched, fields } = isRow(row) ? rowItem(component, row) : { item: null, touched: false, fields: new Set() }
            let matches = op => (list === null || op.list === list) && (op.keys === null || op.keys.some(candidate => sameKey(candidate, key)))

            return {
                row,
                item,
                fields,
                touched,
                entries,
                state: {
                    ...stateFor(entries),
                    removing: applied.some(entry => entry.ops.some(op => op.type === 'delete' && matches(op)) || entry.hideEls.includes(row)),
                    created: !! row.__optimisticClone || applied.some(entry => entry.ops.some(op => op.type === 'create' && sameKey(op.key, key))),
                    updating: applied.some(entry => entry.ops.some(op => op.type === 'update' && matches(op))),
                },
            }
        }

        // Outside rows, an element is about the actions triggered closest to
        // it: walk up until an ancestor contains a trigger. A region that has
        // controls of its own (but none of them triggered anything) is a
        // boundary: an error next to the "Mugs" buttons isn't about "Coffee".
        let all = store.forComponent(component)
        let entries = all

        for (let node = el; node && node !== component.el; node = node.parentElement) {
            let triggered = all.filter(entry => entry.trigger && node.contains(entry.trigger))

            if (triggered.length) {
                entries = triggered
                break
            }

            if (node.matches(INTERACTIVE) || node.querySelector(INTERACTIVE)) {
                entries = []
                break
            }
        }

        // Undo windows are about the whole component (a toast, an undo button).
        let undoable = all.some(isUndoable)

        return { row: null, item: null, fields: new Set(), touched: false, entries, all, state: { ...stateFor(entries), undoable, removing: false, created: false, updating: false } }
    }

    function evaluate(el, expression, item) {
        return Alpine.evaluate(el, expression, { scope: { $item: item } })
    }

    function applyDirectives(component, el) {
        let directives = directivesOf(el).filter(candidate => ! STRUCTURAL.includes(candidate.type))
        let keyed = el !== component.el && isKeyed(el)
        if (! directives.length && ! keyed) return

        let context = contextFor(component, el)

        if (keyed && context.row === el) {
            let { state } = context
            let marker = state.failed ? 'failed' : (state.pending ? 'pending' : null)

            setAttribute(el, 'data-optimistic', marker)

            let deleted = store.applied(component).some(entry =>
                entry.ops.some(op => op.type === 'delete' && op.keys.some(key => sameKey(key, keyOf(el))) && (op.list === listNameOf(component, el) || listNameOf(component, el) === null))
                || entry.hideEls.includes(el))

            if (isRow(el)) setHidden(el, 'removed', deleted)
        }

        for (let { type, modifiers, value } of directives) {
            if (type === 'class') {
                let state = modifiers[1] || 'pending'
                setClasses(el, 'state:' + state, splitClasses(value), !! context.state[state])
            }

            if (type === 'show') {
                let visible = modifiers[1] ? !! context.state[modifiers[1]] : !! evaluate(el, value, context.item)
                setHidden(el, 'show', ! visible)
            }

            if (type === 'text' && context.row) {
                let active = !! context.row.__optimisticClone || context.fields.has(value.split('.')[0])
                setText(el, getPath(context.item || {}, value), active)
            }

            if (type === 'bind' && modifiers[1]) {
                setBinding(el, modifiers[1], evaluate(el, value, context.item))
            }
        }
    }

    function markTriggers(component) {
        let marked = component.__optimisticTriggers || (component.__optimisticTriggers = new Set())
        let entries = store.forComponent(component).filter(entry => entry.trigger)
        let now = new Map()

        for (let entry of entries) {
            let state = entry.status === 'failed' ? 'failed' : 'pending'
            if (now.get(entry.trigger) !== 'failed') now.set(entry.trigger, state)
        }

        for (let el of marked) {
            if (! now.has(el)) {
                setAttribute(el, 'data-optimistic', null)
                marked.delete(el)
            }
        }

        for (let [el, state] of now) {
            if (isRow(el)) continue
            setAttribute(el, 'data-optimistic', state)
            marked.add(el)
        }
    }

    // The order rows have when the server rendered them, so rows we moved
    // can go back to where they belong.
    function recordServerOrder(component, force = false) {
        for (let container of containers(component)) {
            rowsIn(container).forEach((row, index) => {
                if (row.__optimisticClone) return
                if (force || row.__optimisticServerIndex === undefined) row.__optimisticServerIndex = index
            })
        }
    }

    function reconcile(component) {
        if (! component.el || ! component.el.isConnected) return

        recordServerOrder(component)

        let all = containers(component)
        all.forEach(container => reconcileContainer(component, container, all))
        component.__optimisticDetached = []

        // Entries that hide arbitrary rows (wire:optimistic.remove triggers).
        for (let entry of store.forComponent(component)) {
            for (let el of entry.hideEls) setHidden(el, 'removed', isApplied(entry))
        }

        ownElements(component).forEach(el => applyDirectives(component, el))
        markTriggers(component)

        component.__optimisticPreviews?.forEach(preview => preview.reconcile())
    }

    // Before a confirmed response is morphed in, its clones stop being ours,
    // so the morph adopts them (same wire:key) instead of us deleting them.
    function release(component, entry) {
        ownRows(component).forEach(row => {
            if (row.__optimisticClone !== entry.id) return

            delete row.__optimisticClone
            delete row.__optimisticMirrorOf
        })
    }

    // After a morph, whatever text an element shows is the server's: either
    // the morph changed it, or the server rendered exactly what we showed.
    // Active overrides get re-applied on top by the next reconcile.
    function adoptServerContent(component) {
        recordServerOrder(component, true)

        for (let el of ownElements(component)) {
            if (el.__optimisticText) el.__optimisticText = { original: el.textContent, written: null }
        }
    }

    return { reconcile, release, detach, adoptServerContent, rowItem, rowOf, contextFor, isRow, keyOf }
}
