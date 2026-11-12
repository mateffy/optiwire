import { describe, expect, test } from 'bun:test'
import { Rejected, server, settle, texts } from './server.js'
import { action, cleanup, click, entries, mount, quiet } from './helpers.js'

cleanup()

let create = (list, extra = {}) => ({ type: 'create', list, key: 'id', from: null, set: [], with: [], ...extra })
let update = (list, extra = {}) => ({ type: 'update', list, key: 'id', all: false, set: [], with: [], ...extra })
let remove = (list, key = 'id') => ({ type: 'delete', list, key })

function defineTodos({ actions = {}, list = {}, methods = {} } = {}) {
    let db = {
        tasks: [
            { id: 'a', text: 'Alpha', done: false, at: '2026-01-03' },
            { id: 'b', text: 'Beta', done: false, at: '2026-01-01' },
            { id: 'c', text: 'Gamma', done: true, at: '2026-01-05' },
        ],
        nextId: 100,
    }

    server.define('todos', {
        db,
        data: () => ({}),
        optimistic: () => ({
            actions: {
                add: action(['id', 'text'], [create('tasks', { set: { done: false }, with: { at: '$now' } })], { inject: 0, key: 'id' }),
                setDone: action(['id', 'done'], [update('tasks')]),
                rename: action(['id', 'text'], [update('tasks')], { squash: true }),
                remove: action(['id'], [remove('tasks')]),
                archive: action(['ids'], [remove('tasks', 'ids')]),
                readAll: action([], [update('tasks', { key: null, all: true, set: { read: true } })]),
                duplicate: action(['id', 'source'], [create('tasks', { from: 'source', with: { text: '$wire.tasks.find(t => t.id === source).text + " (copy)"' } })], { inject: 0, key: 'id' }),
                ...actions,
            },
            lists: { tasks: { key: 'id', order: [['done', 'asc'], ['at', 'desc']], defaults: { color: 'red' }, ...list } },
            data: { tasks: db.tasks },
        }),
        render: () => `
            <ul id="list">
                <template x-for="task in $wire.tasks" :key="task.id">
                    <li class="row" wire:optimistic.key="task.id" wire:optimistic.class="pending" wire:optimistic.class.failed="failed" x-text="task.text"></li>
                </template>
            </ul>`,
        methods: {
            add: (data, [id, text]) => {
                if (text === 'reject') throw new Rejected('No')
                db.tasks.push({ id, text, done: false, at: new Date().toISOString() })
                db.tasks.sort((x, y) => (x.done - y.done) || (x.at < y.at ? 1 : -1))
            },
            setDone: (data, [id, done]) => {
                db.tasks.find(task => task.id === id).done = done
                db.tasks.sort((x, y) => (x.done - y.done) || (x.at < y.at ? 1 : -1))
            },
            rename: (data, [id, text]) => { db.tasks.find(task => task.id === id).text = text },
            remove: (data, [id]) => { db.tasks.splice(db.tasks.findIndex(task => task.id === id), 1) },
            archive: (data, [ids]) => { db.tasks = db.tasks.filter(task => ! ids.includes(task.id)) },
            readAll: () => db.tasks.forEach(task => (task.read = true)),
            duplicate: (data, [id, source]) => { db.tasks.push({ ...db.tasks.find(task => task.id === source), id, text: 'copy' }) },
            ...methods,
        },
    })

    return db
}

let list = view => texts(view.el, '#list li')

describe('create', () => {
    test('injects a client UUID, inserts in order and adopts the server item', async () => {
        defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.add('Delta')
        await settle()

        let id = entries()[0].named.id
        expect(id).toMatch(/^[0-9a-f-]{36}$/)
        expect(entries()[0].params).toEqual([id, 'Delta'])
        expect(list(view)).toEqual(['Delta', 'Alpha', 'Beta', 'Gamma'])
        expect(view.$wire.tasks[0]).toMatchObject({ id, text: 'Delta', done: false, color: 'red' })

        let row = view.$('#list li')
        expect(row.classList.contains('pending')).toBe(true)
        expect(row.getAttribute('data-optimistic')).toBe('pending')

        await server.respond()

        expect(server.log[0].params).toEqual([id, 'Delta'])
        expect(server.log[0].meta.injected).toBe(0)
        expect(list(view)).toEqual(['Delta', 'Alpha', 'Beta', 'Gamma'])
        expect(view.$('#list li') === row).toBe(true)
        expect(row.classList.contains('pending')).toBe(false)
        expect(entries()).toHaveLength(0)
    })

    test('passing every argument skips the injection', async () => {
        defineTodos()
        let view = await mount('todos')

        view.$wire.add('given-id', 'Mine')
        await settle()

        expect(server.log[0].params).toEqual(['given-id', 'Mine'])
        expect(server.log[0].meta.injected).toBe(null)
    })

    test('a failed create disappears, a rejected one too', async () => {
        defineTodos()
        let view = await mount('todos')

        server.mode = 'offline'
        server.once = true
        view.$wire.add('Lost')
        await settle()
        expect(list(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
        expect(entries()[0].status).toBe('failed')

        view.$wire.add('reject')
        await settle()
        expect(list(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
        expect(entries().map(entry => entry.error)).toEqual(['Network error', 'No'])
    })

    test('with retry: true a failed create stays (as failed) until retried or dismissed', async () => {
        let db = defineTodos({ actions: { add: action(['id', 'text'], [create('tasks', { with: { at: '$now' } })], { inject: 0, key: 'id', retry: true }) } })
        let view = await mount('todos')

        server.mode = 'offline'
        server.once = true
        view.$wire.add('Keep me')
        await settle()

        expect(list(view)).toContain('Keep me')
        let row = view.$$('#list li').find(li => li.textContent === 'Keep me')
        expect(row.classList.contains('failed')).toBe(true)
        expect(row.getAttribute('data-optimistic')).toBe('failed')

        Alpine.evaluate(row, '$optimistic.retry()')
        await settle()

        expect(entries()).toHaveLength(0)
        expect(db.tasks.filter(task => task.text === 'Keep me')).toHaveLength(1)

        server.mode = 'offline'
        server.once = true
        view.$wire.add('Dismiss me')
        await settle()
        let failed = view.$$('#list li').find(li => li.textContent === 'Dismiss me')

        Alpine.evaluate(failed, '$optimistic.dismiss()')
        await settle()
        expect(list(view)).not.toContain('Dismiss me')
        expect(entries()).toHaveLength(0)
    })

    test('copies an existing item with from:', async () => {
        defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.duplicate('b')
        await settle()

        let copy = view.$wire.tasks.find(task => task.text === 'Beta (copy)')
        expect(copy).toMatchObject({ done: false, at: '2026-01-01' })
        expect(copy.id).toBe(entries()[0].named.id)
        expect(server.pending[0].request.body.components[0].calls[0].params).toEqual([copy.id, 'b'])
    })

    test('defaults to appending, insert: start prepends', async () => {
        defineTodos({ list: { order: [], insert: 'start' } })
        let view = await mount('todos')

        server.manual = true
        view.$wire.add('First')
        await settle()

        expect(list(view)[0]).toBe('First')
    })

    test('a with: expression that throws evaluates to null', async () => {
        defineTodos({ actions: { add: action(['id', 'text'], [create('tasks', { with: { broken: 'nope.nope' } })], { inject: 0, key: 'id' }) } })
        let view = await mount('todos')

        server.manual = true
        let { logged } = await quiet(async () => {
            view.$wire.add('X')
            await settle()
        })

        expect(view.$wire.tasks.find(task => task.text === 'X').broken).toBe(null)
        expect(logged.length).toBeGreaterThan(0)
    })
})

describe('update and delete', () => {
    test('an update that changes the order moves the item, then confirms', async () => {
        defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.setDone('a', true)
        await settle()

        expect(list(view)).toEqual(['Beta', 'Gamma', 'Alpha'])

        await server.respond()
        expect(list(view)).toEqual(['Beta', 'Gamma', 'Alpha'])
    })

    test('a failed update moves the item back', async () => {
        defineTodos()
        let view = await mount('todos')

        server.mode = 'error'
        view.$wire.setDone('a', true)
        await settle()

        expect(list(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
        expect(view.$$('#list li')[0].classList.contains('failed')).toBe(true)
    })

    test('deletes one, many and updates all', async () => {
        defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.remove('b')
        await settle()
        expect(list(view)).toEqual(['Alpha', 'Gamma'])
        await server.respond()

        view.$wire.archive(['a', 'c'])
        await settle()
        expect(list(view)).toEqual([])
        await server.respond()

        expect(view.$wire.tasks).toEqual([])
    })

    test('update all', async () => {
        defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.readAll()
        await settle()

        expect(view.$wire.tasks.every(task => task.read)).toBe(true)
        expect(entries()[0].targets).toEqual([{ list: 'tasks', all: true }])
        view.$$('#list li').forEach(li => expect(li.getAttribute('data-optimistic')).toBe('pending'))
    })

    test('squash: only the newest unsent update per item goes out', async () => {
        let db = defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.rename('a', 'A')
        await settle()
        view.$wire.rename('a', 'Al')
        view.$wire.rename('b', 'B!')
        await settle()
        view.$wire.rename('a', 'Alp')
        await settle()

        expect(view.$wire.tasks.find(task => task.id === 'a').text).toBe('Alp')
        expect(entries().map(entry => entry.named.text)).toEqual(['A', 'B!', 'Alp'])

        await server.respond()
        expect(view.$wire.tasks.find(task => task.id === 'a').text).toBe('Alp')
        await server.respond()

        expect(server.log.map(call => call.params[1])).toEqual(['A', 'B!', 'Alp'])
        expect(db.tasks.find(task => task.id === 'a').text).toBe('Alp')
        expect(entries()).toHaveLength(0)
    })

    test('responses for older renames never overwrite newer ones', async () => {
        defineTodos()
        let view = await mount('todos')

        server.manual = true
        view.$wire.rename('a', 'H')
        await settle()
        view.$wire.rename('a', 'Hello')
        await settle()

        await server.respond()
        expect(view.$wire.tasks.find(task => task.id === 'a').text).toBe('Hello')
        await server.respond()
        expect(view.$wire.tasks.find(task => task.id === 'a').text).toBe('Hello')
    })
})

describe('follow-up actions on pending items', () => {
    test('wait for the create they target, then run in order', async () => {
        let db = defineTodos({ actions: { add: action(['id', 'text'], [create('tasks', { with: { at: '$now' } })], { inject: 0, key: 'id', undo: 0.2 }) } })
        let view = await mount('todos')

        view.$wire.add('Later')
        await settle()
        let id = entries()[0].named.id

        view.$wire.setDone(id, true)
        await settle()

        expect(entries()[1].gates.has(`after:${entries()[0].id}`)).toBe(true)
        expect(view.$wire.tasks.find(task => task.id === id).done).toBe(true)
        expect(server.log).toHaveLength(0)

        await new Promise(resolve => setTimeout(resolve, 250))
        await settle()

        expect(server.log.map(call => call.method)).toEqual(['add', 'setDone'])
        expect(db.tasks.find(task => task.id === id).done).toBe(true)
        expect(entries()).toHaveLength(0)
    })

    test('are cancelled when the create fails', async () => {
        defineTodos({ actions: { add: action(['id', 'text'], [create('tasks', { with: { at: '$now' } })], { inject: 0, key: 'id', undo: 0.2 }) } })
        let view = await mount('todos')

        view.$wire.add('Doomed')
        await settle()
        let id = entries()[0].named.id
        view.$wire.remove(id)
        await settle()

        server.mode = 'offline'
        await new Promise(resolve => setTimeout(resolve, 250))
        await settle()

        expect(server.log).toHaveLength(0)
        expect(entries().map(entry => entry.method)).toEqual(['add'])
        expect(entries()[0].status).toBe('failed')
    })

    test('get the real key when the server assigns its own (auto increment)', async () => {
        let db = defineTodos({
            actions: { add: action(['id', 'text'], [create('tasks', { with: { at: '$now' } })], { inject: 0, key: 'id', undo: 0.2 }) },
            methods: {
                add: (data, [id, text]) => {
                    let real = String(db.nextId++)
                    db.tasks.unshift({ id: real, text, done: false, at: new Date().toISOString() })
                    return real
                },
            },
        })
        let view = await mount('todos')

        view.$wire.add('Numbered')
        await settle()
        let id = entries()[0].named.id
        view.$wire.rename(id, 'Renamed')
        await settle()

        await new Promise(resolve => setTimeout(resolve, 250))
        await settle()

        expect(server.log.map(call => [call.method, call.params[0]])).toEqual([['add', id], ['rename', '100']])
        expect(db.tasks.find(task => task.id === '100').text).toBe('Renamed')
        expect(entries()).toHaveLength(0)
    })
})

describe('exposed data', () => {
    test('is refreshed from every response and can be written locally', async () => {
        let db = defineTodos()
        let view = await mount('todos')

        db.tasks.push({ id: 'z', text: 'From elsewhere', done: true, at: '2020-01-01' })
        await view.$wire.$refresh()
        await settle()

        expect(list(view)).toContain('From elsewhere')

        view.$wire.tasks = [{ id: 'local', text: 'Local only' }]
        await settle()
        expect(list(view)).toEqual(['Local only'])

        view.$wire.someProperty = 'goes to Livewire'
        expect(view.component.reactive.someProperty).toBe(undefined)
    })
})
