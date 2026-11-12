import { describe, expect, test } from 'bun:test'
import { applyOp, getPath, keyFieldOf, overlay, replay } from '../../resources/js/replay.js'

let entry = (ops, patch = {}) => ({ method: 'm', named: {}, params: [], key: null, now: 'NOW', ops, ...patch })
let silence = callback => {
    let original = console.error
    console.error = () => {}
    try { return callback() } finally { console.error = original }
}

describe('helpers', () => {
    test('getPath', () => {
        expect(getPath({ a: { b: [1, 2] } }, 'a.b.1')).toBe(2)
        expect(getPath({ a: null }, 'a.b')).toBe(undefined)
        expect(getPath({}, 'x')).toBe(undefined)
    })

    test('keyFieldOf', () => {
        expect(keyFieldOf({ tasks: { key: 'uuid' } }, 'tasks')).toBe('uuid')
        expect(keyFieldOf({}, 'tasks')).toBe('id')
        expect(keyFieldOf(undefined, 'tasks')).toBe('id')
    })
})

describe('replay', () => {
    test('never mutates the base and applies entries in order', () => {
        let base = { count: 1 }
        let result = replay(base, [entry([{ type: 'js', code: '$wire.count++' }]), entry([{ type: 'js', code: '$wire.count *= 10' }])])

        expect(base.count).toBe(1)
        expect(result.count).toBe(20)
    })

    test('js ops see parameters by name, $id, $now and $params', () => {
        let result = replay({ log: [] }, [entry([{ type: 'js', code: '$wire.log.push(text, $id, $now, $params.length)' }], { named: { text: 'hi' }, key: 'K', params: [1, 2] })])
        expect(result.log).toEqual(['hi', 'K', 'NOW', 2])
    })

    test('a failing op is skipped without breaking the others', () => {
        let result = silence(() => replay({ a: 1 }, [entry([{ type: 'js', code: 'throw new Error("x")' }, { type: 'js', code: '$wire.a = 2' }])]))
        expect(result.a).toBe(2)
    })

    test('list ops on something that is not an array are ignored (Blade mode)', () => {
        let result = replay({}, [entry([{ type: 'create', list: 'tasks', key: 'k', item: {} }, { type: 'delete', list: 'tasks', keys: ['k'] }])])
        expect(result).toEqual({})
    })

    test('unknown op types are ignored', () => {
        expect(applyOp({ tasks: [] }, { type: 'other', list: 'tasks' }, entry([]), {})).toBe(undefined)
    })
})

describe('create', () => {
    let lists = { tasks: { key: 'id', order: [['done', 'asc'], ['at', 'desc']] } }

    test('appends without an order, or prepends with insert: start', () => {
        let op = { type: 'create', list: 'tasks', key: 'n', item: { text: 'new' } }

        expect(replay({ tasks: [{ id: 'a' }] }, [entry([op])], {}).tasks.map(task => task.id)).toEqual(['a', 'n'])
        expect(replay({ tasks: [{ id: 'a' }] }, [entry([op])], { tasks: { insert: 'start' } }).tasks.map(task => task.id)).toEqual(['n', 'a'])
    })

    test('inserts where the order puts it', () => {
        let base = { tasks: [{ id: 'a', done: false, at: '3' }, { id: 'b', done: false, at: '1' }, { id: 'c', done: true, at: '9' }] }
        let result = replay(base, [entry([{ type: 'create', list: 'tasks', key: 'n', item: { done: false, at: '2' } }])], lists)

        expect(result.tasks.map(task => task.id)).toEqual(['a', 'n', 'b', 'c'])
    })

    test('merges into an item that already exists instead of duplicating it', () => {
        let result = replay({ tasks: [{ id: 'n', text: 'server' }] }, [entry([{ type: 'create', list: 'tasks', key: 'n', item: { extra: 1 } }])])
        expect(result.tasks).toEqual([{ id: 'n', text: 'server', extra: 1 }])
    })

    test('copies from another item, or moves it when from is the key', () => {
        let lists = { files: {}, trash: {} }
        let base = { files: [], trash: [{ id: 't1', name: 'a.txt' }] }

        let copied = replay(base, [entry([{ type: 'create', list: 'files', key: 'new', from: 't1', move: false, item: {} }])], lists)
        expect(copied.files).toEqual([{ id: 'new', name: 'a.txt' }])
        expect(copied.trash).toHaveLength(1)

        let moved = replay(base, [entry([{ type: 'create', list: 'files', key: 't1', from: 't1', move: true, item: {} }])], lists)
        expect(moved.files).toEqual([{ id: 't1', name: 'a.txt' }])
        expect(moved.trash).toHaveLength(0)
    })

    test('falls back to server data when an earlier op already removed the source', () => {
        let lists = { files: {}, trash: {} }
        let base = { files: [], trash: [{ id: 't1', name: 'a.txt' }, 'not an object'], other: 'x' }
        let result = replay(base, [entry([
            { type: 'delete', list: 'trash', keys: ['t1'] },
            { type: 'create', list: 'files', key: 't1', from: 't1', move: true, item: {} },
        ])], lists)

        expect(result.files).toEqual([{ id: 't1', name: 'a.txt' }])
        expect(result.trash).toEqual(['not an object'])
    })

    test('a missing source creates the item from its own fields', () => {
        let result = replay({ pages: [] }, [entry([{ type: 'create', list: 'pages', key: 'n', from: 'gone', item: { title: 'x' } }])], { pages: {}, unrelated: {} })
        expect(result.pages).toEqual([{ title: 'x', id: 'n' }])
    })
})

describe('update', () => {
    let base = () => ({ notes: [{ id: 1, pinned: false, title: 'b' }, { id: 2, pinned: false, title: 'c' }, { id: 3, pinned: false, title: 'a' }] })

    test('merges fields into the matching items', () => {
        let result = replay(base(), [entry([{ type: 'update', list: 'notes', keys: ['2'], fields: { title: 'z' } }])])
        expect(result.notes[1].title).toBe('z')
        expect(result.notes[0].title).toBe('b')
    })

    test('keys: null updates every item', () => {
        let result = replay(base(), [entry([{ type: 'update', list: 'notes', keys: null, fields: { read: true } }])])
        expect(result.notes.every(note => note.read)).toBe(true)
    })

    test('moves an item when an order field changes', () => {
        let lists = { notes: { order: [['pinned', 'desc'], ['title', 'asc']] } }
        let result = replay(base(), [entry([{ type: 'update', list: 'notes', keys: [2], fields: { pinned: true } }])], lists)
        expect(result.notes.map(note => note.id)).toEqual([2, 1, 3])
    })

    test('stable lists and unrelated fields keep their position', () => {
        let stable = { notes: { order: [['pinned', 'desc']], stable: true } }
        let ordered = { notes: { order: [['pinned', 'desc']] } }

        expect(replay(base(), [entry([{ type: 'update', list: 'notes', keys: [3], fields: { pinned: true } }])], stable).notes.map(note => note.id)).toEqual([1, 2, 3])
        expect(replay(base(), [entry([{ type: 'update', list: 'notes', keys: [3], fields: { title: 'zz' } }])], ordered).notes.map(note => note.id)).toEqual([1, 2, 3])
    })
})

describe('delete', () => {
    test('removes every matching item', () => {
        let result = replay({ emails: [{ id: 1 }, { id: 2 }, { id: 3 }, 'x'] }, [entry([{ type: 'delete', list: 'emails', keys: [1, '3'] }])])
        expect(result.emails).toEqual([{ id: 2 }, 'x'])
    })
})

describe('overlay', () => {
    let lists = { tasks: { key: 'id' } }

    test('merges updates for the item and reports whether anything touched it', () => {
        let entries = [
            entry([{ type: 'update', list: 'tasks', keys: ['1'], fields: { text: 'new' } }]),
            entry([{ type: 'update', list: 'tasks', keys: null, fields: { read: true } }]),
            entry([{ type: 'update', list: 'other', keys: ['1'], fields: { nope: true } }]),
            entry([{ type: 'update', list: 'tasks', keys: ['2'], fields: { nope: true } }]),
        ]

        expect(overlay({ id: 1, text: 'old' }, '1', 'tasks', entries, lists)).toEqual({ item: { id: 1, text: 'new', read: true }, touched: true })
        expect(overlay({ id: 1 }, '1', 'tasks', [], lists)).toEqual({ item: { id: 1 }, touched: false })
    })

    test('includes the fields of a pending create', () => {
        let entries = [entry([{ type: 'create', list: 'tasks', key: 'n', item: { text: 'x' } }, { type: 'delete', list: 'tasks', keys: ['n'] }])]
        expect(overlay({}, 'n', 'tasks', entries, lists).item).toEqual({ text: 'x', id: 'n' })
    })
})
