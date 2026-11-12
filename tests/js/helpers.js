import { afterEach } from 'bun:test'
import { server, settle } from './server.js'

export const action = (params, ops, extra = {}) => ({ params, inject: null, key: null, ops, ...extra })
export const js = code => ({ type: 'js', code })

export function quiet(callback) {
    let original = { error: console.error, warn: console.warn }
    let logged = []
    console.error = (...args) => logged.push(args)
    console.warn = (...args) => logged.push(args)

    let restore = () => Object.assign(console, original)

    try {
        let result = callback()
        if (result?.then) return result.then(value => (restore(), { value, logged }), error => { restore(); throw error })
        restore()
        return { value: result, logged }
    } catch (error) {
        restore()
        throw error
    }
}

let defaults = { ...optimistic.config }

export function cleanup() {
    afterEach(async () => {
        server.reset()
        document.body.innerHTML = ''
        document.getElementById('livewire-error')?.remove()
        for (let entry of [...optimistic.store.entries]) {
            clearTimeout(entry.timer)
            clearTimeout(entry.undoTimer)
            clearTimeout(entry.awaitTimer)
            clearTimeout(entry.ttlTimer)
        }
        optimistic.store.clear()
        Object.assign(optimistic.config, defaults)
        await settle()
    })
}

export async function mount(name, options) {
    let el = server.mount(name, options)
    await settle()
    return { el, component: el.__livewire, $wire: el.__livewire.$wire, $: selector => el.querySelector(selector), $$: selector => [...el.querySelectorAll(selector)] }
}

export function click(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

export function entries() {
    return optimistic.store.entries
}
