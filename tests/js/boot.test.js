import { afterEach, describe, expect, test } from 'bun:test'
import { server, settle } from './server.js'

// index.js boots against `globalThis` when imported. Point it at the instance
// the test setup already installed, so it doesn't install a second one.
globalThis.Optimistic = optimistic

let { boot } = await import('../../resources/js/index.js')

afterEach(() => {
    document.body.innerHTML = ''
    optimistic.store.clear()
    server.reset()
})

function fakeEnvironment() {
    let calls = []
    let noop = name => (...args) => calls.push(name)
    let Livewire = {
        interceptAction: noop('interceptAction'),
        interceptMessage: noop('interceptMessage'),
        interceptRequest: noop('interceptRequest'),
        hook: noop('hook'),
        directive: noop('directive'),
        all: () => [],
    }
    let Alpine = { reactive: value => value, magic: noop('magic'), nextTick: callback => callback(), evaluate: () => null }
    let document = new EventTarget()

    return { calls, target: { document, Livewire: null, Alpine: null, LivewireLater: Livewire, AlpineLater: Alpine } }
}

describe('boot', () => {
    test('returns the existing instance', () => {
        expect(boot()).toBe(optimistic)
    })

    test('installs right away when Livewire is already there', () => {
        let { calls, target } = fakeEnvironment()
        target.Livewire = target.LivewireLater
        target.Alpine = target.AlpineLater

        let instance = boot(target)

        expect(instance).toBe(target.Optimistic)
        expect(instance.store.entries).toEqual([])
        expect(calls).toContain('interceptAction')
        expect(calls).toContain('magic')
    })

    test('otherwise waits for livewire:init, once', () => {
        let { calls, target } = fakeEnvironment()

        expect(boot(target)).toBe(null)
        expect(calls).toEqual([])

        target.Livewire = target.LivewireLater
        target.Alpine = target.AlpineLater
        target.document.dispatchEvent(new Event('livewire:init'))
        let first = target.Optimistic

        target.document.dispatchEvent(new Event('livewire:init'))

        expect(first).toBeDefined()
        expect(target.Optimistic).toBe(first)
        expect(calls.filter(call => call === 'interceptAction')).toHaveLength(1)
    })

    test('a duplicate livewire:init after a manual boot is ignored', () => {
        let { target } = fakeEnvironment()

        boot(target)
        target.Livewire = target.LivewireLater
        target.Alpine = target.AlpineLater
        target.Optimistic = 'already'
        target.document.dispatchEvent(new Event('livewire:init'))

        expect(target.Optimistic).toBe('already')
    })

    test('a page without a document is fine', () => {
        expect(boot({})).toBe(null)
    })
})

describe('components that existed before the plugin was installed', () => {
    test('are picked up', async () => {
        server.define('early', {
            data: () => ({ n: 1 }),
            optimistic: { actions: { inc: { params: [], inject: null, key: null, ops: [{ type: 'js', code: '$wire.n++' }] } } },
            render: () => '<b></b>',
        })

        let el = server.mount('early')
        await settle()

        let { target } = fakeEnvironment()
        target.Livewire = { ...target.LivewireLater, all: () => [el.__livewire] }
        target.Alpine = { ...target.AlpineLater, reactive: value => Alpine.reactive(value) }

        let instance = boot(target)
        await settle()

        expect(instance).toBeDefined()
        expect(el.__livewire.$wire.n).toBe(1)
    })
})
