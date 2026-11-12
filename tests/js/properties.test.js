import { describe, expect, test } from 'bun:test'
import { Rejected, server, settle } from './server.js'
import { action, cleanup, click, entries, js, mount, quiet } from './helpers.js'

cleanup()

function defineLikes(extra = {}) {
    server.define('likes', {
        data: () => ({ likes: 41, liked: false, draft: '' }),
        optimistic: {
            actions: {
                toggle: action([], [js('$wire.liked = !$wire.liked; $wire.likes += $wire.liked ? 1 : -1')]),
                broken: action([], [js('throw new Error("broken patch")')]),
                adjust: action(['delta'], [js('$wire.likes += delta')]),
                plain: action([], []),
                ...extra,
            },
        },
        render: data => `
            <span id="likes" wire:text="likes">${data.likes}</span>
            <span id="liked" wire:text="liked ? 'yes' : 'no'">${data.liked ? 'yes' : 'no'}</span>
            <button id="toggle" wire:click="toggle" wire:optimistic.class="pending" wire:optimistic.class.failed="failed">like</button>
            <button id="adjust" wire:click="adjust(5)">+5</button>
            <input id="draft" wire:model="draft">
            <p id="error" wire:optimistic.show.failed></p>`,
        methods: {
            toggle: data => {
                data.liked = ! data.liked
                data.likes += data.liked ? 1 : -1
            },
            broken: () => {},
            plain: () => {},
            adjust: (data, [delta]) => {
                if (data.likes + delta > 50) throw new Rejected('Too many')
                data.likes += delta
            },
        },
    })
}

describe('property patches', () => {
    test('apply immediately, mark the trigger and confirm without flicker', async () => {
        defineLikes()
        let { el, $, $wire } = await mount('likes')
        let seen = []
        new MutationObserver(() => seen.push($('#likes').textContent)).observe(el, { subtree: true, childList: true, characterData: true })

        server.manual = true
        click($('#toggle'))
        await settle()

        expect($wire.likes).toBe(42)
        expect($('#likes').textContent).toBe('42')
        expect($('#toggle').classList.contains('pending')).toBe(true)
        expect($('#toggle').getAttribute('data-optimistic')).toBe('pending')
        expect(entries()[0].sent).toBe(true)

        await server.respond()

        expect($('#likes').textContent).toBe('42')
        expect($('#toggle').classList.contains('pending')).toBe(false)
        expect($('#toggle').hasAttribute('data-optimistic')).toBe(false)
        expect(entries()).toHaveLength(0)
        expect(seen.every(value => value === '42')).toBe(true)
    })

    test('optimistic values are never sent to the server as property updates', async () => {
        defineLikes()
        let { $ } = await mount('likes')

        server.manual = true
        click($('#toggle'))
        await settle()
        click($('#adjust'))
        await settle()
        await server.respond()
        await server.respond()

        for (let request of server.requests) {
            expect(request.body.components[0].updates).toEqual({})
        }
        expect(server.instances[Object.keys(server.instances)[0]].data.likes).toBe(47)
    })

    test('stacked patches are replayed on top of each server response', async () => {
        defineLikes()
        let { $, $wire } = await mount('likes')

        server.manual = true
        click($('#toggle'))
        await settle()
        click($('#toggle'))
        click($('#toggle'))
        await settle()

        expect($wire.liked).toBe(true)
        expect($wire.likes).toBe(42)
        expect(server.pending).toHaveLength(1)

        await server.respond()
        expect($wire.liked).toBe(true)
        expect($wire.likes).toBe(42)
        expect(entries()).toHaveLength(2)

        await server.respond()
        expect($wire.liked).toBe(true)
        expect($wire.likes).toBe(42)
        expect(entries()).toHaveLength(0)
    })

    test('pending patches rebase onto server changes made by others', async () => {
        defineLikes()
        server.definitions.likes.refresh = data => { data.likes += 100 }
        let { $, $wire } = await mount('likes')

        server.manual = true
        click($('#adjust'))
        await settle()
        click($('#adjust'))
        await settle()
        expect($wire.likes).toBe(51)

        await server.respond()

        // Server: 41 + 5 (first call) + 100 (someone else); second +5 still pending.
        expect($wire.likes).toBe(151)
        expect($('#likes').textContent).toBe('151')
    })

    test('local unsynced edits survive optimistic patches and are still sent', async () => {
        defineLikes()
        let { $, $wire, component } = await mount('likes')

        let input = $('#draft')
        input.value = 'typed'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await settle()
        expect(component.ephemeral.draft).toBe('typed')

        server.manual = true
        click($('#toggle'))
        await settle()

        expect(component.ephemeral.draft).toBe('typed')
        expect(server.requests[0].body.components[0].updates).toEqual({ draft: 'typed' })

        await server.respond()
        expect($wire.draft).toBe('typed')
        expect($wire.likes).toBe(42)
    })

    test('a patch that throws is skipped, the action still runs', async () => {
        defineLikes()
        let { $wire } = await mount('likes')

        let { logged } = await quiet(async () => {
            $wire.broken()
            await settle()
        })

        expect(logged.some(args => String(args[0]).includes('broken'))).toBe(true)
        expect(server.log.map(call => call.method)).toEqual(['broken'])
        expect(entries()).toHaveLength(0)
    })

    test('actions without ops are tracked but change nothing', async () => {
        defineLikes()
        let { $wire } = await mount('likes')

        server.manual = true
        $wire.plain()
        await settle()
        expect(entries()[0].ops).toEqual([])

        await server.respond()
        expect(entries()).toHaveLength(0)
    })
})

describe('failures', () => {
    let modes = [
        ['offline', 'Network error'],
        ['error', 'Request failed (500)'],
        ['lost', 'Network error'],
    ]

    for (let [mode, message] of modes) {
        test(`${mode}: rolls back, marks failed and keeps Livewire's error modal away`, async () => {
            defineLikes()
            let { $, $wire } = await mount('likes')

            server.mode = mode
            click($('#toggle'))
            await settle()

            expect($wire.likes).toBe(41)
            expect($wire.liked).toBe(false)
            expect($('#likes').textContent).toBe('41')
            expect(entries()[0].status).toBe('failed')
            expect(entries()[0].error).toBe(message)
            expect($('#toggle').classList.contains('failed')).toBe(true)
            expect($('#toggle').getAttribute('data-optimistic')).toBe('failed')
            expect($('#error').style.display).toBe('')
            expect(document.getElementById('livewire-error')).toBe(null)
        })
    }

    test('without handleErrors Livewire shows its error modal as usual', async () => {
        optimistic.config.handleErrors = false
        defineLikes()
        let { $ } = await mount('likes')

        server.mode = 'error'
        click($('#toggle'))
        await settle()

        expect(entries()[0].status).toBe('failed')
        expect(document.getElementById('livewire-error')).not.toBe(null)
    })

    test('an expired session (419) is left to Livewire', async () => {
        defineLikes()
        let { $ } = await mount('likes')
        let asked = 0
        globalThis.confirm = () => (asked++, false)

        server.mode = 'expired'
        click($('#toggle'))
        await settle()

        expect(entries()[0].status).toBe('failed')
        expect(entries()[0].error).toBe('Request failed (419)')
        expect(asked).toBe(1)
    })

    test('the server can reject: rollback with its message', async () => {
        defineLikes()
        let { $, $wire } = await mount('likes')

        click($('#adjust'))
        await settle()
        expect($wire.likes).toBe(46)

        click($('#adjust'))
        await settle()

        expect($wire.likes).toBe(46)
        expect(entries()).toHaveLength(1)
        expect(entries()[0].error).toBe('Too many')
        expect(entries()[0].status).toBe('failed')
    })

    test('a new action on the same trigger replaces the old failure', async () => {
        defineLikes()
        let { $ } = await mount('likes')

        server.mode = 'offline'
        server.once = true
        click($('#toggle'))
        await settle()
        expect(entries()[0].status).toBe('failed')

        click($('#toggle'))
        await settle()

        expect(entries()).toHaveLength(0)
        expect($('#likes').textContent).toBe('42')
    })

    test('failed entries are dropped after failedTtl', async () => {
        optimistic.config.failedTtl = 20
        defineLikes()
        let { $ } = await mount('likes')

        server.mode = 'offline'
        click($('#toggle'))
        await settle()
        expect(entries()).toHaveLength(1)

        await new Promise(resolve => setTimeout(resolve, 40))
        expect(entries()).toHaveLength(0)
    })

    test('a request without an answer times out, a late success still wins', async () => {
        defineLikes({ toggle: action([], [js('$wire.liked = !$wire.liked; $wire.likes += $wire.liked ? 1 : -1')], { timeout: 30 }) })
        let { $, $wire } = await mount('likes')

        server.manual = true
        click($('#toggle'))
        await settle()
        expect($wire.likes).toBe(42)

        await new Promise(resolve => setTimeout(resolve, 50))
        expect(entries()[0].error).toBe('Timed out')
        expect($wire.likes).toBe(41)

        await server.respond()
        expect(entries()).toHaveLength(0)
        expect($wire.likes).toBe(42)
    })

    test('a late rejection after a timeout still reports the rejection', async () => {
        defineLikes({ adjust: action(['delta'], [js('$wire.likes += delta')], { timeout: 20 }) })
        server.definitions.likes.data = () => ({ likes: 48, liked: false, draft: '' })
        let { $ } = await mount('likes')

        server.manual = true
        click($('#adjust'))
        await settle()
        await new Promise(resolve => setTimeout(resolve, 40))
        expect(entries()[0].error).toBe('Timed out')

        await server.respond()
        expect(entries()[0].error).toBe('Too many')
    })

    test('retrying a lost request does not run the action twice', async () => {
        defineLikes()
        let { $, $wire, el } = await mount('likes')

        server.mode = 'lost'
        server.once = true
        click($('#adjust'))
        await settle()
        expect(entries()[0].status).toBe('failed')
        expect($wire.likes).toBe(41)

        Alpine.evaluate(el, '$optimistic.retry()')
        await settle()

        expect(entries()).toHaveLength(0)
        expect(server.log.filter(call => call.method === 'adjust')).toHaveLength(2)
        expect(server.log[0].meta.id).toBe(server.log[1].meta.id)
        expect($wire.likes).toBe(41)
    })
})
