import { describe, expect, test } from 'bun:test'
import { attr, isHidden, Rejected, server, settle, texts } from './server.js'
import { action, cleanup, click, entries, mount, quiet } from './helpers.js'

cleanup()

let pick = (item, fields) => Object.fromEntries(['id', ...fields].map(field => [field, item[field]]))
let rowAttrs = (item, fields = []) => `wire:key="${item.id}" wire:optimistic.row="${attr(pick(item, fields))}"`

function defineBoard({ template = true, listModifiers = '', ordered = true, retry = false, undo = 0, extraActions = {} } = {}) {
    let db = {
        tasks: [
            { id: 'a', text: 'Alpha', done: false, rank: 1 },
            { id: 'b', text: 'Beta', done: false, rank: 3 },
            { id: 'c', text: 'Gamma', done: true, rank: 5 },
        ],
    }
    let sort = () => db.tasks.sort((x, y) => (x.done - y.done) || (x.rank - y.rank))

    server.define('board', {
        db,
        data: () => ({ note: '' }),
        optimistic: {
            actions: {
                add: action(['id', 'text', 'rank'], [{ type: 'create', list: 'tasks', key: 'id', from: null, set: { done: false }, with: [] }], { inject: 0, key: 'id', retry, undo }),
                duplicate: action(['id', 'source'], [{ type: 'create', list: 'tasks', key: 'id', from: 'source', set: [], with: { text: '"Copy"' } }], { inject: 0, key: 'id' }),
                setDone: action(['id', 'done'], [{ type: 'update', list: 'tasks', key: 'id', all: false, set: [], with: [] }]),
                rename: action(['id', 'text'], [{ type: 'update', list: 'tasks', key: 'id', all: false, set: [], with: [] }]),
                remove: action(['id'], [{ type: 'delete', list: 'tasks', key: 'id' }], { undo }),
                touch: action([], []),
                ...extraActions,
            },
            lists: ordered ? { tasks: { key: 'id', order: [['done', 'asc'], ['rank', 'asc']] } } : { tasks: { key: 'id' } },
        },
        render: data => `
            <ul id="list" wire:optimistic.list${listModifiers}="tasks">
                ${db.tasks.map(task => `
                    <li class="row" ${rowAttrs(task, ['done', 'rank', 'text'])}
                        wire:optimistic.class="pending" wire:optimistic.class.failed="failed"
                        wire:optimistic.class.removing="removing" wire:optimistic.class.updating="updating"
                        wire:optimistic.bind.class="$item.done ? 'done' : ''">
                        <input type="checkbox" ${task.done ? 'checked' : ''} wire:optimistic.bind.checked="$item.done">
                        <span class="text" wire:optimistic.text="text">${task.text}</span>
                        <em class="pin" wire:optimistic.show="$item.done">✓</em>
                        <span class="alpine" x-text="$item.text"></span>
                    </li>`).join('')}
                ${template ? `<template wire:optimistic.create>
                    <li class="row new" wire:optimistic.class="pending" wire:optimistic.class.failed="failed" wire:optimistic.class.created="created">
                        <span class="text" wire:optimistic.text="text"></span>
                        <span class="alpine" x-text="$item.text"></span>
                        <span class="sending" wire:optimistic.show.pending>sending</span>
                        <button class="retry" wire:optimistic.retry>retry</button>
                        <button class="dismiss" wire:optimistic.dismiss>dismiss</button>
                    </li>
                </template>` : ''}
            </ul>
            <p id="outside" x-text="String($item)"></p>`,
        methods: {
            add: (data, [id, text, rank]) => {
                if (text === 'reject') throw new Rejected('Nope')
                db.tasks.push({ id, text, done: false, rank })
                sort()
            },
            duplicate: (data, [id, source]) => { db.tasks.push({ ...db.tasks.find(task => task.id === source), id, text: 'Copy' }); sort() },
            setDone: (data, [id, done]) => { db.tasks.find(task => task.id === id).done = done; sort() },
            rename: (data, [id, text]) => { db.tasks.find(task => task.id === id).text = text },
            remove: (data, [id]) => { db.tasks.splice(db.tasks.findIndex(task => task.id === id), 1) },
            touch: () => {},
        },
    })

    return db
}

let rows = view => texts(view.el, '#list > li .text')

describe('creating rows from a template', () => {
    test('inserts a clone in order, then adopts the server row in place', async () => {
        defineBoard()
        let view = await mount('board')

        server.manual = true
        view.$wire.add('Middle', 2)
        await settle()

        expect(rows(view)).toEqual(['Alpha', 'Middle', 'Beta', 'Gamma'])

        let clone = view.$$('#list > li')[1]
        let id = entries()[0].named.id
        expect(clone.getAttribute('wire:key')).toBe(id)
        expect(clone.classList.contains('new')).toBe(true)
        expect(clone.classList.contains('pending')).toBe(true)
        expect(clone.classList.contains('created')).toBe(true)
        expect(clone.getAttribute('data-optimistic')).toBe('pending')
        expect(clone.querySelector('.alpine').textContent).toBe('Middle')
        expect(isHidden(clone.querySelector('.sending'))).toBe(false)

        await server.respond()

        let adopted = view.$$('#list > li')[1]
        expect(adopted === clone).toBe(true)
        expect(rows(view)).toEqual(['Alpha', 'Middle', 'Beta', 'Gamma'])
        expect(adopted.classList.contains('new')).toBe(false)
        expect(adopted.classList.contains('pending')).toBe(false)
        expect(adopted.hasAttribute('data-optimistic')).toBe(false)
        expect(view.$$('#list > li')).toHaveLength(3 + 1)
        expect(entries()).toHaveLength(0)
    })

    test('without an order the clone goes where the template is', async () => {
        defineBoard({ ordered: false })
        let view = await mount('board')

        server.manual = true
        view.$wire.add('Last', 0)
        await settle()

        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma', 'Last'])
    })

    test('a failed create is removed, a rejected one too', async () => {
        defineBoard()
        let view = await mount('board')

        server.mode = 'offline'
        server.once = true
        view.$wire.add('Gone', 2)
        await settle()
        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])

        view.$wire.add('reject', 2)
        await settle()
        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
        expect(entries().map(entry => entry.error)).toEqual(['Network error', 'Nope'])
    })

    test('with retry the clone stays as failed, retry and dismiss buttons work', async () => {
        let db = defineBoard({ retry: true })
        let view = await mount('board')

        server.mode = 'offline'
        server.once = true
        view.$wire.add('Retry me', 2)
        await settle()

        let clone = view.$$('#list > li')[1]
        expect(clone.classList.contains('failed')).toBe(true)
        expect(clone.getAttribute('data-optimistic')).toBe('failed')
        expect(isHidden(clone.querySelector('.sending'))).toBe(true)

        click(clone.querySelector('.retry'))
        await settle()
        expect(db.tasks.map(task => task.text)).toContain('Retry me')
        expect(entries()).toHaveLength(0)

        server.mode = 'offline'
        server.once = true
        view.$wire.add('Dismiss me', 9)
        await settle()
        click(view.$$('#list > li').find(li => li.textContent.includes('Dismiss me')).querySelector('.dismiss'))
        await settle()

        expect(rows(view)).not.toContain('Dismiss me')
        expect(entries()).toHaveLength(0)
    })

    test('a pending clone survives morphs from other requests', async () => {
        defineBoard({ undo: 0.3 })
        let view = await mount('board')

        view.$wire.add('Held', 2)
        await settle()
        let clone = view.$$('#list > li')[1]

        view.$wire.setDone('a', true)
        await settle()

        expect(view.$$('#list > li').includes(clone)).toBe(true)
        expect(rows(view)).toEqual(['Held', 'Beta', 'Alpha', 'Gamma'])

        await new Promise(resolve => setTimeout(resolve, 350))
        await settle()

        expect(rows(view)).toEqual(['Held', 'Beta', 'Alpha', 'Gamma'])
        expect(entries()).toHaveLength(0)
    })

    test('without a template, from: clones the source row', async () => {
        defineBoard({ template: false })
        let view = await mount('board')

        server.manual = true
        view.$wire.duplicate('b')
        await settle()

        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Copy', 'Gamma'])

        await server.respond()
        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Copy', 'Gamma'])
        expect(view.$$('#list > li')).toHaveLength(4)
    })

    test('without a template or a source nothing is rendered (data only)', async () => {
        defineBoard({ template: false })
        let view = await mount('board')

        server.manual = true
        view.$wire.add('Invisible', 2)
        await settle()

        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
        expect(entries()).toHaveLength(1)
    })
})

describe('updating rows', () => {
    test('text, bindings, show and order follow the pending change and roll back', async () => {
        defineBoard()
        let view = await mount('board')
        let alpha = view.$('#list > li')

        server.mode = 'error'
        server.manual = true
        view.$wire.setDone('a', true)
        await settle()

        expect(rows(view)).toEqual(['Beta', 'Alpha', 'Gamma'])
        expect(alpha.querySelector('input').checked).toBe(true)
        expect(alpha.classList.contains('done')).toBe(true)
        expect(alpha.classList.contains('updating')).toBe(true)
        expect(isHidden(alpha.querySelector('.pin'))).toBe(false)

        await server.respond()

        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
        expect(alpha.querySelector('input').checked).toBe(false)
        expect(alpha.classList.contains('done')).toBe(false)
        expect(alpha.classList.contains('failed')).toBe(true)
        expect(isHidden(alpha.querySelector('.pin'))).toBe(true)
    })

    test('a confirmed text change keeps the server text', async () => {
        defineBoard()
        let view = await mount('board')

        server.manual = true
        view.$wire.rename('b', 'Bravo')
        await settle()
        expect(rows(view)).toEqual(['Alpha', 'Bravo', 'Gamma'])
        expect(view.$$('#list > li .alpine')[1].textContent).toBe('Bravo')

        await server.respond()
        expect(rows(view)).toEqual(['Alpha', 'Bravo', 'Gamma'])

        view.$wire.touch()
        await settle()
        await server.respond()
        expect(rows(view)).toEqual(['Alpha', 'Bravo', 'Gamma'])
    })

    test('a failed text change restores the server text', async () => {
        defineBoard()
        let view = await mount('board')

        server.mode = 'offline'
        view.$wire.rename('b', 'Bravo')
        await settle()

        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
    })

    test('.stable lists keep edited rows in place', async () => {
        defineBoard({ listModifiers: '.stable' })
        let view = await mount('board')

        server.manual = true
        view.$wire.setDone('a', true)
        await settle()

        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
    })

    test('a bound value is only written when it changes, so typing is never clobbered', async () => {
        server.define('editor', {
            data: () => ({}),
            optimistic: { actions: { touch: action([], []) }, lists: { tasks: { key: 'id' } } },
            render: () => `<ul wire:optimistic.list="tasks"><li ${rowAttrs({ id: 'x', text: 'Server' }, ['text'])}><input id="in" value="Server" wire:optimistic.bind.value="$item.text"></li></ul>`,
            methods: { touch: () => {} },
        })
        let view = await mount('editor')
        let input = view.$('#in')

        input.value = 'Typing…'
        server.manual = true
        view.$wire.touch()
        await settle()

        expect(input.value).toBe('Typing…')
    })
})

describe('more bindings and moves', () => {
    function defineCards() {
        let db = { cards: [{ id: 'a', title: 'A', rank: 1, hot: false }, { id: 'b', title: 'B', rank: 2, hot: false }, { id: 'c', title: 'C', rank: 3, hot: true }] }

        server.define('cards', {
            data: () => ({}),
            optimistic: {
                actions: { update: action(['id', 'rank', 'hot'], [{ type: 'update', list: 'cards', key: 'id', all: false, set: [], with: [] }]) },
                lists: { cards: { key: 'id', order: [['rank', 'asc']] } },
            },
            render: () => `<ul id="list" wire:optimistic.list="cards">${db.cards.map(card => `
                <li ${rowAttrs(card, ['rank', 'hot', 'title'])}
                    wire:optimistic.bind.class="{ hot: $item.hot, cold: ! $item.hot }"
                    wire:optimistic.bind.title="$item.title + ' #' + $item.rank"
                    wire:optimistic.bind.data-hot="$item.hot"
                    wire:optimistic.bind.aria-label="$item.hot ? 'hot' : null"><span class="text">${card.title}</span></li>`).join('')}</ul>`,
            methods: { update: () => {} },
        })
    }

    test('object class bindings, attribute bindings and moving a row to the end', async () => {
        defineCards()
        let view = await mount('cards')
        let a = view.$('#list > li')

        expect(a.classList.contains('cold')).toBe(true)
        expect(a.getAttribute('title')).toBe('A #1')
        expect(a.hasAttribute('data-hot')).toBe(false)
        expect(a.hasAttribute('aria-label')).toBe(false)

        server.manual = true
        view.$wire.update('a', 9, true)
        await settle()

        expect(rows(view)).toEqual(['B', 'C', 'A'])
        expect(a.classList.contains('hot')).toBe(true)
        expect(a.classList.contains('cold')).toBe(false)
        expect(a.getAttribute('title')).toBe('A #9')
        expect(a.getAttribute('data-hot')).toBe('')
        expect(a.getAttribute('aria-label')).toBe('hot')
    })

    test('rows land exactly where the order puts them, whatever the moves', async () => {
        defineCards()
        let view = await mount('cards')

        server.manual = true
        view.$wire.update('b', 0, false)
        await settle()
        expect(rows(view)).toEqual(['B', 'A', 'C'])

        view.$wire.update('a', 5, false)
        await settle()
        expect(rows(view)).toEqual(['B', 'C', 'A'])

        view.$wire.update('c', -1, true)
        await settle()
        expect(rows(view)).toEqual(['C', 'B', 'A'])
    })

    test('an action cancelled by another interceptor is rolled back', async () => {
        defineCards()
        let view = await mount('cards')

        let stop = Livewire.interceptAction(({ action }) => {
            if (action.name === 'update') action.cancel()
        })

        view.$wire.update('a', 9, true).catch(() => {})
        await settle()
        stop()

        expect(rows(view)).toEqual(['A', 'B', 'C'])
        expect(entries()).toHaveLength(0)
        expect(server.requests).toHaveLength(0)
    })
})

describe('deleting rows', () => {
    test('hides the row with !important until confirmed, keeping its own display', async () => {
        defineBoard()
        let view = await mount('board')
        let beta = view.$$('#list > li')[1]
        beta.style.display = 'flex'

        server.manual = true
        server.mode = 'error'
        view.$wire.remove('b')
        await settle()

        expect(beta.style.getPropertyValue('display')).toBe('none')
        expect(beta.style.getPropertyPriority('display')).toBe('important')
        expect(beta.classList.contains('removing')).toBe(true)

        await server.respond()

        expect(beta.style.display).toBe('flex')
        expect(rows(view)).toEqual(['Alpha', 'Beta', 'Gamma'])
    })

    test('confirmed deletes are removed by the morph', async () => {
        defineBoard()
        let view = await mount('board')

        view.$wire.remove('b')
        await settle()

        expect(view.$$('#list > li')).toHaveLength(2)
        expect(rows(view)).toEqual(['Alpha', 'Gamma'])
    })

    test('a row without inline style gets its style attribute removed again', async () => {
        defineBoard()
        let view = await mount('board')
        let beta = view.$$('#list > li')[1]

        server.mode = 'offline'
        view.$wire.remove('b')
        await settle()

        expect(beta.hasAttribute('style')).toBe(false)
    })
})

describe('$item outside of rows', () => {
    test('is an empty object', async () => {
        defineBoard()
        let view = await mount('board')
        expect(view.$('#outside').textContent).toBe('[object Object]')
    })
})

describe('row data', () => {
    test('invalid row JSON is reported and treated as empty', async () => {
        server.define('broken', {
            data: () => ({}),
            optimistic: { actions: { touch: action([], []) }, lists: { tasks: {} } },
            render: () => `<ul wire:optimistic.list="tasks"><li wire:key="x" wire:optimistic.row="{nope"><span x-text="JSON.stringify($item)"></span></li></ul>`,
            methods: { touch: () => {} },
        })

        let { value: view, logged } = await quiet(() => mount('broken'))

        expect(view.$('span').textContent).toBe('{}')
        expect(logged.some(args => String(args[0]).includes('Invalid wire:optimistic.row'))).toBe(true)
    })

    test('rows outside of a list container fall back to their own fields', async () => {
        server.define('loose', {
            data: () => ({}),
            optimistic: { actions: { touch: action([], []) } },
            render: () => `<div ${rowAttrs({ id: 'x', title: 'T' }, ['title'])}><span x-text="$item.title"></span></div>`,
            methods: { touch: () => {} },
        })

        let view = await mount('loose')
        expect(view.$('span').textContent).toBe('T')
    })
})
