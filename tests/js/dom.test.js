import { describe, expect, test } from 'bun:test'
import { copyOf, detachComponents, directive, directivesOf, isKeyed, keyOf, replaceAttribute, setAttribute, setClasses, setHidden, splitClasses } from '../../resources/js/dom.js'

let element = html => {
    let host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild
}

describe('directive parsing', () => {
    test('finds wire:optimistic directives with their modifiers', () => {
        let el = element('<li wire:optimistic wire:optimistic.class.failed="x y" wire:optimisticfoo="no" wire:click="z"></li>')

        expect(directivesOf(el)).toEqual([
            { name: 'wire:optimistic', modifiers: [], type: null, value: '' },
            { name: 'wire:optimistic.class.failed', modifiers: ['class', 'failed'], type: 'class', value: 'x y' },
        ])
        expect(directive(el, 'class').value).toBe('x y')
        expect(directive(el, 'show')).toBe(null)
        expect(directivesOf({})).toEqual([])
    })

    test('keys come from wire:key or an evaluated wire:optimistic.key', () => {
        expect(keyOf(element('<li wire:key="a"></li>'))).toBe('a')
        expect(keyOf(element('<li></li>'))).toBe(null)
        expect(isKeyed(element('<li wire:optimistic.key="x"></li>'))).toBe(true)
        expect(isKeyed(element('<li></li>'))).toBe(false)
    })
})

describe('element helpers', () => {
    test('setAttribute only writes changes and removes for null', () => {
        let el = element('<b title="a"></b>')
        let writes = 0
        new MutationObserver(records => (writes += records.length)).observe(el, { attributes: true })

        setAttribute(el, 'title', 'a')
        setAttribute(el, 'title', 'b')
        setAttribute(el, 'missing', null)
        setAttribute(el, 'title', null)

        expect(el.hasAttribute('title')).toBe(false)
    })

    test('replaceAttribute swaps colon attributes for good', () => {
        let el = copyOf(element('<li wire:key="a" data-x="1"><span>hi</span></li>'))

        replaceAttribute(el, 'wire:key', 'b')

        expect(el.getAttribute('wire:key')).toBe('b')
        expect(el.getAttribute('data-x')).toBe('1')
        expect(el.innerHTML).toBe('<span>hi</span>')
    })

    test('copies drop nested Livewire components', () => {
        let el = detachComponents(copyOf(element('<li><div wire:id="x" wire:snapshot="{}" wire:effects="{}">child</div></li>')))
        let child = el.querySelector('div')

        expect(child.hasAttribute('wire:id')).toBe(false)
        expect(child.hasAttribute('wire:snapshot')).toBe(false)
        expect(child.hasAttribute('wire:effects')).toBe(false)
        expect(child.textContent).toBe('child')
    })

    test('splitClasses understands strings, arrays and objects', () => {
        expect(splitClasses(' a  b ')).toEqual(['a', 'b'])
        expect(splitClasses(['a b', ['c']])).toEqual(['a', 'b', 'c'])
        expect(splitClasses({ 'a b': true, c: false, d: 1 })).toEqual(['a', 'b', 'd'])
        expect(splitClasses(null)).toEqual([])
        expect(splitClasses(undefined)).toEqual([])
    })

    test('setClasses only removes classes it added itself', () => {
        let el = element('<b class="server"></b>')

        setClasses(el, 'pending', ['server', 'mine'], true)
        expect(el.className).toBe('server mine')

        setClasses(el, 'failed', ['mine', 'other'], true)
        setClasses(el, 'pending', ['server', 'mine'], false)
        expect(el.className).toBe('server mine other')

        setClasses(el, 'failed', [], true)
        expect(el.className).toBe('server')
    })

    test('setHidden stacks reasons and restores the previous inline display', () => {
        let el = element('<b style="display: flex; color: red"></b>')

        setHidden(el, 'a', true)
        setHidden(el, 'b', true)
        expect(el.style.getPropertyValue('display')).toBe('none')

        setHidden(el, 'a', false)
        expect(el.style.getPropertyValue('display')).toBe('none')

        setHidden(el, 'b', false)
        expect(el.style.getPropertyValue('display')).toBe('flex')

        setHidden(el, 'b', false)
        expect(el.style.color).toBe('red')
    })

    test('setHidden re-hides after something reset the style (a morph)', () => {
        let el = element('<b></b>')

        setHidden(el, 'a', true)
        el.removeAttribute('style')
        setHidden(el, 'a', true)

        expect(el.style.getPropertyValue('display')).toBe('none')

        setHidden(el, 'a', false)
        expect(el.hasAttribute('style')).toBe(false)
    })
})
