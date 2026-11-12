import { describe, expect, test } from 'bun:test'
import { attr, isHidden, server, settle, texts } from './server.js'
import { action, cleanup, click, entries, mount } from './helpers.js'

cleanup()

let rowAttrs = (item, fields = []) => `wire:key="${item.id}" wire:optimistic.row="${attr(Object.fromEntries(['id', ...fields].map(field => [field, item[field]])))}"`
let wait = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('groups (kanban columns)', () => {
    function defineKanban({ undo = 0 } = {}) {
        let db = { cards: [{ id: 'a', title: 'A', column: 'todo', position: 1 }, { id: 'b', title: 'B', column: 'todo', position: 2 }, { id: 'c', title: 'C', column: 'doing', position: 3 }] }

        server.define('kanban', {
            db,
            data: () => ({}),
            optimistic: {
                actions: {
                    move: action(['id', 'column'], [{ type: 'update', list: 'cards', key: 'id', all: false, set: [], with: { position: '1000' } }], { undo }),
                    touch: action([], []),
                },
                lists: { cards: { key: 'id', order: [['position', 'asc']], groupBy: 'column' } },
            },
            render: () => ['todo', 'doing'].map(column => `
                <ul class="column" data-column="${column}" wire:optimistic.list="cards" wire:optimistic.group="${column}">
                    ${db.cards.filter(card => card.column === column).sort((x, y) => x.position - y.position).map(card => `<li ${rowAttrs(card, ['column', 'position'])} wire:optimistic.class="pending"><span class="title">${card.title}</span></li>`).join('')}
                </ul>`).join('') + '<ul wire:optimistic.list="cards" wire:optimistic.group="done"></ul>',
            methods: {
                move: (data, [id, column]) => {
                    let card = db.cards.find(candidate => candidate.id === id)
                    card.column = column
                    card.position = Math.max(...db.cards.map(candidate => candidate.position)) + 1
                },
                touch: () => {},
            },
        })

        return db
    }

    let columns = view => Object.fromEntries(view.$$('.column').map(column => [column.dataset.column, texts(column, 'li .title')]))

    test('a moved card is hidden in its column and mirrored in the new one', async () => {
        defineKanban()
        let view = await mount('kanban')
        let original = view.$('[data-column=todo] li')

        server.manual = true
        view.$wire.move('a', 'doing')
        await settle()

        expect(columns(view)).toEqual({ todo: ['B'], doing: ['C', 'A'] })
        expect(isHidden(original)).toBe(true)
        let mirror = view.$$('[data-column=doing] li')[1]
        expect(mirror.classList.contains('pending')).toBe(true)

        await server.respond()

        expect(columns(view)).toEqual({ todo: ['B'], doing: ['C', 'A'] })
        expect(view.$$('[data-column=doing] li')[1] === mirror).toBe(true)
        expect(view.$$('li')).toHaveLength(3)
    })

    test('a failed move puts the card back', async () => {
        defineKanban()
        let view = await mount('kanban')

        server.mode = 'error'
        view.$wire.move('a', 'doing')
        await settle()

        expect(columns(view)).toEqual({ todo: ['A', 'B'], doing: ['C'] })
        expect(view.$$('li')).toHaveLength(3)
    })

    test('the mirror survives morphs while the move is pending', async () => {
        defineKanban({ undo: 0.2 })
        let view = await mount('kanban')

        view.$wire.move('a', 'doing')
        await settle()
        let mirror = view.$$('[data-column=doing] li')[1]

        view.$wire.touch()
        await settle()

        expect(columns(view)).toEqual({ todo: ['B'], doing: ['C', 'A'] })
        expect(view.$$('[data-column=doing] li')[1] === mirror).toBe(true)

        await wait(250)
        await settle()
        expect(columns(view)).toEqual({ todo: ['B'], doing: ['C', 'A'] })
        expect(entries()).toHaveLength(0)
    })

    test('moving into a group without a container keeps the card hidden until the server answers', async () => {
        defineKanban()
        let view = await mount('kanban')

        server.manual = true
        view.$wire.move('a', 'archive')
        await settle()

        expect(columns(view)).toEqual({ todo: ['B'], doing: ['C'] })
    })

    test('moving a card twice moves the mirror along', async () => {
        defineKanban({ undo: 0.3 })
        let view = await mount('kanban')

        view.$wire.move('a', 'doing')
        await settle()
        view.$wire.move('a', 'done')
        await settle()

        expect(columns(view)).toEqual({ todo: ['B'], doing: ['C'] })
        expect(texts(view.el, '[wire\\:optimistic\\.group=done] li .title')).toEqual(['A'])
    })
})

describe('wire:optimistic.remove', () => {
    function defineSuggestions() {
        let db = { items: [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }] }
        server.define('suggestions', {
            db,
            data: () => ({}),
            optimistic: { actions: { dismiss: action(['id'], []) } },
            render: () => `<ul>${db.items.map(item => `<li wire:key="${item.id}"><span>${item.title}</span><button class="blade" wire:click="dismiss(${item.id})" wire:optimistic.remove>x</button><button class="alpine" x-on:click="$wire.dismiss(${item.id}).catch(() => {})" wire:optimistic.remove><b>x</b></button><button class="plain" wire:click="dismiss(${item.id})">keep</button></li>`).join('')}</ul>`,
            methods: { dismiss: (data, [id]) => { db.items = db.items.filter(item => item.id !== id) } },
        })
    }

    test('hides the closest keyed row until the server agrees', async () => {
        defineSuggestions()
        let view = await mount('suggestions')

        server.manual = true
        click(view.$('li .blade'))
        await settle()

        expect(texts(view.el, 'li span')).toEqual(['Two'])
        expect(view.$('li').getAttribute('data-optimistic')).toBe('pending')

        await server.respond()
        expect(texts(view.el, 'li span')).toEqual(['Two'])
        expect(view.$$('li')).toHaveLength(1)
    })

    test('finds the trigger of $wire calls from Alpine through the event, and brings the row back on failure', async () => {
        defineSuggestions()
        let view = await mount('suggestions')

        server.mode = 'offline'
        click(view.$('li .alpine b'))
        await settle()

        expect(texts(view.el, 'li span')).toEqual(['One', 'Two'])
        expect(view.$('li').getAttribute('data-optimistic')).toBe('failed')
    })

    test('does nothing for triggers without the directive', async () => {
        defineSuggestions()
        let view = await mount('suggestions')

        server.manual = true
        click(view.$('li .plain'))
        await settle()

        expect(texts(view.el, 'li span')).toEqual(['One', 'Two'])
        expect(entries()[0].hideEls).toEqual([])
    })
})

describe('cross component patches', () => {
    function defineInbox({ dispatches = true, listens = true } = {}) {
        let db = { unread: 3 }

        server.define('inbox', {
            data: () => ({}),
            optimistic: { actions: { markAllRead: action([], [], { dispatch: 'read' }) } },
            render: () => '<button id="mark" wire:click="markAllRead">read</button>',
            methods: {
                markAllRead: (data, params, { dispatch }) => {
                    db.unread = 0
                    if (dispatches) dispatch('read')
                },
            },
        })

        server.define('badge', {
            data: () => ({ unread: db.unread }),
            optimistic: { listeners: { read: ['$wire.unread = 0'] } },
            render: data => `<span id="unread" wire:text="unread">${data.unread}</span>`,
            listeners: { read: data => { data.unread = db.unread } },
        })

        server.define('unrelated', { data: () => ({}), render: () => '<i></i>' })

        return { db, listens }
    }

    async function mountBoth({ listens = true } = {}) {
        let badge = await mount('badge', { listeners: listens ? ['read'] : [] })
        await mount('unrelated')
        let inbox = await mount('inbox')
        return { badge, inbox }
    }

    test('the listener is patched at once and keeps the patch until its own refresh', async () => {
        defineInbox()
        let { badge, inbox } = await mountBoth()

        server.manual = true
        click(inbox.$('#mark'))
        await settle()

        expect(badge.$wire.unread).toBe(0)
        expect(entries().find(entry => entry.event === 'read').status).toBe('pending')

        await server.respond()
        expect(entries().find(entry => entry.event === 'read').status).toBe('awaiting')
        expect(badge.$wire.unread).toBe(0)

        await settle()
        await server.respond()

        expect(entries()).toHaveLength(0)
        expect(badge.$wire.unread).toBe(0)
        expect(server.log.map(call => call.method)).toEqual(['markAllRead', '__dispatch'])
    })

    test('without a server dispatch the listener falls back to its server value', async () => {
        defineInbox({ dispatches: false })
        let { badge, inbox } = await mountBoth()

        click(inbox.$('#mark'))
        await settle()

        expect(entries()).toHaveLength(0)
        expect(badge.$wire.unread).toBe(3)
    })

    test('a failing origin rolls the listener back too', async () => {
        defineInbox()
        let { badge, inbox } = await mountBoth()

        server.mode = 'offline'
        click(inbox.$('#mark'))
        await settle()

        expect(badge.$wire.unread).toBe(3)
        expect(entries().map(entry => entry.method)).toEqual(['markAllRead'])
    })

    for (let [when, how] of [['before it is sent', 'init'], ['while in flight', 'send']]) {
        test(`a cancelled origin removes the listener patch (${when})`, async () => {
            defineInbox()
            let { badge, inbox } = await mountBoth()

            let stop = Livewire.interceptMessage(({ message, cancel, onSend }) => {
                if (message.component !== inbox.component) return
                if (how === 'init') cancel()
                else onSend(() => cancel())
            })

            click(inbox.$('#mark'))
            await settle()
            stop()

            expect(badge.$wire.unread).toBe(3)
            expect(entries()).toHaveLength(0)
        })
    }

    test('a listener that never refreshes drops its patch after linkTimeout', async () => {
        defineInbox()
        let { badge, inbox } = await mountBoth({ listens: false })

        click(inbox.$('#mark'))
        await settle()

        expect(badge.$wire.unread).toBe(0)
        expect(entries()[0].status).toBe('awaiting')

        await wait(250)
        expect(entries()).toHaveLength(0)
        expect(badge.$wire.unread).toBe(3)
    })
})

describe('file previews', () => {
    function defineAvatar() {
        let state = { errors: [] }

        server.define('avatar', {
            data: () => ({ avatar: null }),
            optimistic: { actions: { touch: action([], []) } },
            errors: () => (state.errors.length ? { avatar: state.errors } : []),
            render: () => `<img id="img" src="/old.png" wire:optimistic.preview="avatar" wire:optimistic.class="pending" wire:optimistic.class.failed="failed"><img id="other" wire:optimistic.preview="other"><input id="file" type="file" data-model="avatar"><input id="text" type="text" wire:model="name"><input id="unwatched" type="file" wire:model="nothing">`,
            methods: { touch: () => {}, _startUpload: () => {}, _finishUpload: () => {}, _uploadErrored: () => {} },
        })

        return state
    }

    // Livewire's own upload handling is bypassed: the input carries the
    // wire:model attribute only while we fire the events ourselves.
    function choose(view, name = 'me.png', input = view.$('#file')) {
        input.setAttribute('wire:model', input.dataset.model || input.getAttribute('wire:model'))
        Object.defineProperty(input, 'files', { value: [new File(['x'], name)], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    let upload = (view, name, property = 'avatar') => view.$('#file').dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { property } }))

    test('shows the chosen file at once and keeps it until the upload is confirmed', async () => {
        defineAvatar()
        let view = await mount('avatar')

        choose(view)
        await settle()

        expect(view.$('#img').getAttribute('src')).toBe('blob:preview/me.png')
        expect(view.$('#img').classList.contains('pending')).toBe(true)
        expect(view.$('#other').hasAttribute('src')).toBe(false)

        // Unrelated requests don't settle it, Livewire's _finishUpload does.
        await view.$wire.touch()
        await settle()
        expect(entries()).toHaveLength(1)

        await view.$wire.call('_finishUpload', 'avatar', ['tmp.png'], false, false)
        await settle()

        expect(entries()).toHaveLength(0)
        expect(view.$('#img').getAttribute('src')).toBe('/old.png')
    })

    test('_uploadErrored fails the preview, finishing another property does not', async () => {
        defineAvatar()
        let view = await mount('avatar')

        choose(view)
        await settle()

        await view.$wire.call('_finishUpload', 'other', ['tmp.png'], false, false)
        await settle()
        expect(entries()[0].status).toBe('pending')

        await view.$wire.call('_uploadErrored', 'avatar', null, false).catch(() => {})
        await settle()

        expect(entries()[0].error).toBe('Upload failed')
        expect(view.$('#img').getAttribute('src')).toBe('/old.png')
    })

    test('a newer file replaces the older preview', async () => {
        defineAvatar()
        let view = await mount('avatar')

        choose(view, 'one.png')
        await settle()
        choose(view, 'two.png')
        await settle()

        expect(entries()).toHaveLength(1)
        expect(view.$('#img').getAttribute('src')).toBe('blob:preview/two.png')
    })

    test('upload errors and cancels restore the old image', async () => {
        defineAvatar()
        let view = await mount('avatar')

        choose(view)
        await settle()
        upload(view, 'livewire-upload-error')
        await settle()

        expect(view.$('#img').getAttribute('src')).toBe('/old.png')
        expect(entries()[0].error).toBe('Upload failed')
        expect(view.$('#img').classList.contains('failed')).toBe(true)

        choose(view)
        await settle()
        upload(view, 'livewire-upload-cancel')
        await settle()

        expect(entries()).toHaveLength(0)
        expect(view.$('#img').getAttribute('src')).toBe('/old.png')
    })

    test('a failing _finishUpload request fails the preview', async () => {
        defineAvatar()
        let view = await mount('avatar')

        choose(view)
        await settle()

        server.mode = 'error'
        await view.$wire.call('_finishUpload', 'avatar', ['tmp.png'], false, false).catch(() => {})
        await settle()

        expect(entries()[0].error).toBe('Request failed (500)')
        expect(view.$('#img').getAttribute('src')).toBe('/old.png')
    })

    test('validation errors after the upload fail the preview with the message', async () => {
        let state = defineAvatar()
        let view = await mount('avatar')

        choose(view)
        await settle()
        state.errors = ['Too big.']
        await view.$wire.call('_finishUpload', 'avatar', ['tmp.png'], false, false)
        await settle()

        expect(entries()[0].error).toBe('Too big.')
        expect(view.$('#img').getAttribute('src')).toBe('/old.png')
    })

    test('ignores other inputs, empty selections and unknown upload events', async () => {
        defineAvatar()
        let view = await mount('avatar')

        view.$('#text').dispatchEvent(new Event('change', { bubbles: true }))
        let file = view.$('#file')
        Object.defineProperty(file, 'files', { value: [], configurable: true })
        file.dispatchEvent(new Event('change', { bubbles: true }))
        choose(view, 'x.png', view.$('#unwatched'))
        let bare = document.createElement('input')
        bare.type = 'file'
        Object.defineProperty(bare, 'files', { value: [new File(['x'], 'y.png')] })
        view.el.appendChild(bare)
        bare.dispatchEvent(new Event('change', { bubbles: true }))
        upload(view, 'livewire-upload-error', 'unknown')
        await settle()

        expect(entries()).toHaveLength(0)
    })

    test('an image without an initial src gets it removed again', async () => {
        defineAvatar()
        server.definitions.avatar.render = () => '<img id="img" wire:optimistic.preview="avatar"><input id="file" type="file" data-model="avatar">'
        let view = await mount('avatar')

        choose(view)
        await settle()
        expect(view.$('#img').getAttribute('src')).toBe('blob:preview/me.png')

        upload(view, 'livewire-upload-cancel')
        await settle()
        expect(view.$('#img').hasAttribute('src')).toBe(false)
    })
})

describe('undo windows', () => {
    function defineTrash() {
        let db = { items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }
        server.define('trash', {
            db,
            data: () => ({}),
            optimistic: {
                actions: {
                    remove: action(['id'], [{ type: 'delete', list: 'items', key: 'id' }], { undo: 0.15 }),
                    touch: action([], []),
                },
                lists: { items: { key: 'id' } },
            },
            render: () => `<ul wire:optimistic.list="items">${db.items.map(item => `<li ${rowAttrs(item)}><span>${item.name}</span></li>`).join('')}</ul><div id="toast" wire:optimistic.show.undoable><button id="undo" wire:optimistic.undo>undo</button></div>`,
            methods: {
                remove: (data, [id]) => { db.items = db.items.filter(item => item.id !== id) },
                touch: () => {},
            },
        })
        return db
    }

    test('undo cancels the action before it is ever sent', async () => {
        let db = defineTrash()
        let view = await mount('trash')

        view.$wire.remove('a')
        await settle()
        expect(texts(view.el, 'li span')).toEqual(['B'])
        expect(isHidden(view.$('#toast'))).toBe(false)

        click(view.$('#undo'))
        await settle()

        expect(texts(view.el, 'li span')).toEqual(['A', 'B'])
        expect(isHidden(view.$('#toast'))).toBe(true)
        await wait(200)
        expect(server.log).toHaveLength(0)
        expect(db.items).toHaveLength(2)
    })

    test('the action goes out once the window closes, even behind a request in flight', async () => {
        let db = defineTrash()
        let view = await mount('trash')

        server.manual = true
        view.$wire.touch()
        await settle()
        view.$wire.remove('a')
        await settle()

        await wait(200)
        expect(server.pending).toHaveLength(1)
        await server.respond()
        await settle()
        await server.respond()

        expect(server.log.map(call => call.method)).toEqual(['touch', 'remove'])
        expect(db.items.map(item => item.id)).toEqual(['b'])
        expect(entries()).toHaveLength(0)
    })

    test('leaving the page sends pending undo windows right away and warns', async () => {
        defineTrash()
        let view = await mount('trash')

        view.$wire.remove('a')
        await settle()

        let event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        await settle()

        expect(event.defaultPrevented).toBe(true)
        expect(server.log.map(call => call.method)).toEqual(['remove'])
    })

    test('no warning without pending actions, or when disabled', async () => {
        defineTrash()
        let view = await mount('trash')

        let quiet = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(quiet)
        expect(quiet.defaultPrevented).toBe(false)

        optimistic.config.warnOnUnload = false
        view.$wire.remove('a')
        await settle()

        let disabled = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(disabled)
        await settle()

        expect(disabled.defaultPrevented).toBe(false)
        expect(server.log.map(call => call.method)).toEqual(['remove'])
    })

    test('wire:navigate flushes undo windows too', async () => {
        defineTrash()
        let view = await mount('trash')

        view.$wire.remove('b')
        await settle()
        document.dispatchEvent(new Event('livewire:navigate'))
        await settle()

        expect(server.log.map(call => call.method)).toEqual(['remove'])
    })
})

describe('the $optimistic magic', () => {
    function defineTasks() {
        server.define('tasks', {
            data: () => ({ count: 1, nested: { value: 'x' } }),
            optimistic: {
                actions: {
                    rename: action(['id', 'text'], [{ type: 'update', list: 'tasks', key: 'id', all: false, set: [], with: [] }]),
                    remove: action(['id'], [{ type: 'delete', list: 'tasks', key: 'id' }], { undo: 0.3 }),
                },
                lists: { tasks: { key: 'id' } },
                data: { tasks: [{ id: 't1', text: 'One' }, { id: 't2', text: 'Two' }] },
            },
            render: () => `<ul wire:optimistic.list="tasks"><li ${rowAttrs({ id: 't1', text: 'One' }, ['text'])}><span>One</span></li><li ${rowAttrs({ id: 't2', text: 'Two' }, ['text'])}><span>Two</span></li></ul><p id="probe"></p>`,
            methods: { rename: () => {}, remove: () => {} },
        })
    }

    test('reports state per key, per element and per component', async () => {
        defineTasks()
        let view = await mount('tasks')
        let probe = view.$('#probe')
        let api = () => Alpine.evaluate(probe, '$optimistic')

        expect(api().state()).toBe(null)
        expect(api().server('nested.value')).toBe('x')
        expect(api().server('tasks.0.text')).toBe('One')
        expect(api().item('t1')).toEqual({ id: 't1', text: 'One' })
        expect(api().item({ id: 'missing' })).toBe(null)

        server.manual = true
        view.$wire.rename('t1', 'Uno')
        await settle()

        expect(api().pending()).toBe(true)
        expect(api().pending({ id: 't1' })).toBe(true)
        expect(api().pending('t2')).toBe(false)
        expect(api().state('t1')).toBe('pending')
        expect(api().item({ key: 't1' })).toEqual({ id: 't1', text: 'Uno' })
        expect(api().entries.map(entry => [entry.method, entry.status, entry.sent])).toEqual([['rename', 'pending', true]])
        expect(api().all).toHaveLength(1)
        expect(api().failed()).toBe(false)
        expect(api().error()).toBe(null)

        server.mode = 'offline'
        server.pending.forEach(pending => (pending.request.mode = 'offline'))
        await server.respond()

        expect(api().failed('t1')).toBe(true)
        expect(api().state('t1')).toBe('failed')
        expect(api().error('t1')).toBe('Network error')

        api().dismiss('t1')
        await settle()
        expect(api().entries).toHaveLength(0)
    })

    test('undo by key and the undoable list', async () => {
        defineTasks()
        let view = await mount('tasks')
        let api = () => Alpine.evaluate(view.$('#probe'), '$optimistic')

        view.$wire.remove('t1')
        view.$wire.remove('t2')
        await settle()

        expect(api().undoable().map(entry => entry.params)).toEqual([['t1'], ['t2']])
        expect(api().undoable()[0].undoUntil).toBeGreaterThan(Date.now())

        api().undo('t2')
        await settle()
        expect(api().undoable().map(entry => entry.params)).toEqual([['t1']])

        api().undo()
        await settle()
        expect(entries()).toHaveLength(0)
    })

    test('is null outside of components', async () => {
        let outside = document.createElement('div')
        document.body.appendChild(outside)

        expect(Alpine.evaluate(outside, '$optimistic')).toBe(null)
        expect(Alpine.evaluate(outside, '$item')).toEqual({})
    })

    test('server() of a component without optimistic config is undefined', async () => {
        defineTasks()
        let view = await mount('tasks')
        let api = Alpine.evaluate(view.$('#probe'), '$optimistic')

        optimistic.store.clear()
        view.el.remove()
        await settle()

        expect(api.server('count')).toBe(undefined)
    })
})

describe('component lifecycle', () => {
    test('removing a component drops its entries and timers', async () => {
        server.define('gone', {
            data: () => ({}),
            optimistic: { actions: { later: action([], [], { undo: 1 }) } },
            render: () => '<b></b>',
            methods: { later: () => {} },
        })
        let view = await mount('gone')

        view.$wire.later()
        await settle()
        expect(entries()).toHaveLength(1)

        view.el.remove()
        await settle()

        expect(entries()).toHaveLength(0)
    })

    test('components without optimistic config are left alone', async () => {
        server.define('plain', { data: () => ({ n: 1 }), render: () => '<button wire:click="inc">+</button>', methods: { inc: data => { data.n++ } } })
        let view = await mount('plain')

        click(view.$('button'))
        await settle()

        expect(view.$wire.n).toBe(2)
        expect(entries()).toHaveLength(0)
    })

    test('a component that gains optimistic config later is picked up', async () => {
        let enabled = false
        server.define('late', {
            data: () => ({ n: 1 }),
            optimistic: () => (enabled ? { actions: { inc: action([], [{ type: 'js', code: '$wire.n++' }]) } } : null),
            render: () => '<i></i>',
            methods: { inc: data => { data.n++ } },
        })
        let view = await mount('late')

        enabled = true
        await view.$wire.$refresh()
        await settle()

        server.manual = true
        view.$wire.inc()
        await settle()

        expect(view.$wire.n).toBe(2)
        expect(entries()).toHaveLength(1)
    })
})
