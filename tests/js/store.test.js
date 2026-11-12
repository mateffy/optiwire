import { describe, expect, test } from 'bun:test'
import { createStore, isApplied, isUndoable } from '../../resources/js/store.js'

let make = (patch = {}) => ({ id: Math.random().toString(), component: 'a', options: {}, ...patch })

describe('store', () => {
    test('adds entries with defaults and an increasing sequence', () => {
        let store = createStore()
        let first = store.add(make())
        let second = store.add(make({ status: 'failed', error: 'x', gates: new Set(['undo']) }))

        expect(first.status).toBe('pending')
        expect(first.error).toBe(null)
        expect(first.gates.size).toBe(0)
        expect(second.seq).toBeGreaterThan(first.seq)
        expect(second.status).toBe('failed')
        expect(second.gates.has('undo')).toBe(true)
        expect(store.entries).toHaveLength(2)
    })

    test('finds entries by id, action, component and parent', () => {
        let store = createStore()
        let action = {}
        let parent = store.add(make({ component: 'a' }))
        let child = store.add(make({ component: 'b', linkedTo: parent.id }))
        let failed = store.add(make({ component: 'a', status: 'failed' }))

        store.attach(action, parent)

        expect(parent.action).toBe(action)
        expect(store.forAction(action)).toBe(parent)
        expect(store.forAction({})).toBe(null)
        expect(store.find(child.id)).toBe(child)
        expect(store.find('missing')).toBe(null)
        expect(store.forComponent('a')).toEqual([parent, failed])
        expect(store.applied('a')).toEqual([parent])
        expect(store.linkedTo(parent)).toEqual([child])
    })

    test('removes entries (idempotently) and clears', () => {
        let store = createStore()
        let entry = store.add(make())

        store.remove(entry)
        store.remove(entry)

        expect(entry.removed).toBe(true)
        expect(store.entries).toHaveLength(0)

        store.add(make())
        store.clear()
        expect(store.entries).toHaveLength(0)
    })

    test('notifies subscribers until they unsubscribe', () => {
        let store = createStore()
        let calls = []
        let unsubscribe = store.subscribe(reason => calls.push(reason))

        store.notify('a')
        unsubscribe()
        store.notify('b')

        expect(calls).toEqual(['a'])
    })
})

describe('entry predicates', () => {
    test('isApplied', () => {
        expect(isApplied({ status: 'pending', options: {} })).toBe(true)
        expect(isApplied({ status: 'awaiting', options: {} })).toBe(true)
        expect(isApplied({ status: 'failed', options: {} })).toBe(false)
        expect(isApplied({ status: 'failed', options: { retry: true } })).toBe(true)
    })

    test('isUndoable', () => {
        expect(isUndoable({ status: 'pending', gates: new Set(['undo']) })).toBe(true)
        expect(isUndoable({ status: 'pending', gates: new Set() })).toBe(false)
        expect(isUndoable({ status: 'failed', gates: new Set(['undo']) })).toBe(false)
    })
})
