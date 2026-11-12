import { describe, expect, spyOn, test } from 'bun:test'
import { clone, compile, diff, equal, evaluateExpression, isIdentifier, isObject, isObjecty, patch, sameKey, toArray, uuid } from '../../resources/js/util.js'

describe('uuid', () => {
    test('generates RFC 4122 version 7 UUIDs', () => {
        let id = uuid()
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    test('is unique and sortable by creation time', async () => {
        let first = uuid()
        await new Promise(resolve => setTimeout(resolve, 3))
        let second = uuid()

        expect(first).not.toBe(second)
        expect(first < second).toBe(true)
        expect(new Set(Array.from({ length: 500 }, uuid)).size).toBe(500)
    })

    test('encodes the current timestamp in the first 48 bits', () => {
        let before = Date.now()
        let id = uuid()
        let timestamp = parseInt(id.replace(/-/g, '').slice(0, 12), 16)

        expect(timestamp).toBeGreaterThanOrEqual(before)
        expect(timestamp).toBeLessThanOrEqual(Date.now())
    })
})

describe('type helpers', () => {
    test('isObject and isObjecty', () => {
        expect(isObject({})).toBe(true)
        expect(isObject([])).toBe(false)
        expect(isObject(null)).toBe(false)
        expect(isObjecty([])).toBe(true)
        expect(isObjecty('x')).toBe(false)
        expect(isObjecty(null)).toBe(false)
    })

    test('toArray', () => {
        expect(toArray(null)).toEqual([])
        expect(toArray(undefined)).toEqual([])
        expect(toArray(1)).toEqual([1])
        expect(toArray([1, 2])).toEqual([1, 2])
    })

    test('sameKey compares as strings and never matches nullish', () => {
        expect(sameKey(1, '1')).toBe(true)
        expect(sameKey('a', 'b')).toBe(false)
        expect(sameKey(null, null)).toBe(false)
        expect(sameKey(undefined, 'x')).toBe(false)
        expect(sameKey('x', null)).toBe(false)
    })

    test('isIdentifier', () => {
        expect(isIdentifier('$wire')).toBe(true)
        expect(isIdentifier('assignee_id')).toBe(true)
        expect(isIdentifier('1abc')).toBe(false)
        expect(isIdentifier('a-b')).toBe(false)
    })
})

describe('clone and equal', () => {
    test('deep clones plain data, including reactive proxies', () => {
        let source = { a: [1, { b: 2 }], c: { d: null } }
        let proxy = new Proxy(source, {})
        let copy = clone(proxy)

        expect(copy).toEqual(source)
        expect(copy.a).not.toBe(source.a)
        expect(copy.a[1]).not.toBe(source.a[1])
        expect(clone(5)).toBe(5)
    })

    test('deep equality', () => {
        expect(equal({ a: [1, 2] }, { a: [1, 2] })).toBe(true)
        expect(equal({ a: 1 }, { a: 1, b: 2 })).toBe(false)
        expect(equal({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false)
        expect(equal([1], { 0: 1 })).toBe(false)
        expect(equal(1, '1')).toBe(false)
        expect(equal(null, {})).toBe(false)
        expect(equal(NaN, NaN)).toBe(false)
    })
})

describe('diff and patch', () => {
    test('equal values produce no changes', () => {
        expect(diff({ a: 1 }, { a: 1 })).toEqual([])
    })

    test('nested objects produce leaf level changes', () => {
        expect(diff({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } })).toEqual([{ path: ['a', 'c'], value: 3 }])
    })

    test('added and removed keys', () => {
        expect(diff({ a: 1, gone: 2 }, { a: 1, added: 3 })).toEqual([
            { path: ['added'], value: 3 },
            { path: ['gone'], remove: true },
        ])
    })

    test('equal length arrays diff per index, others are replaced', () => {
        expect(diff({ list: [1, 2] }, { list: [1, 3] })).toEqual([{ path: ['list', 1], value: 3 }])
        expect(diff({ list: [1, 2] }, { list: [1, 2, 3] })).toEqual([{ path: ['list'], value: [1, 2, 3] }])
        expect(diff({ x: { a: 1 } }, { x: [1] })).toEqual([{ path: ['x'], value: [1] }])
    })

    test('patch applies changes, creates parents and removes keys and array items', () => {
        let target = { a: { b: 1 }, list: [1, 2, 3], gone: true, scalar: 1 }

        patch(target, [
            { path: ['a', 'b'], value: 2 },
            { path: ['new', 'deep'], value: { x: 1 } },
            { path: ['list', 1], remove: true },
            { path: ['gone'], remove: true },
            { path: ['scalar', 'nested'], value: 1 },
            { path: [], value: 'ignored' },
        ])

        expect(target).toEqual({ a: { b: 2 }, list: [1, 3], new: { deep: { x: 1 } }, scalar: { nested: 1 } })
    })

    test('patch clones values so later mutations do not leak', () => {
        let value = { x: 1 }
        let target = {}
        patch(target, [{ path: ['a'], value }])
        value.x = 2
        expect(target.a.x).toBe(1)
    })

    test('a diff applied with patch reproduces the target', () => {
        let from = { a: [1, { b: 2 }], c: { d: 1, e: [1, 2] }, f: 'x' }
        let to = { a: [1, { b: 3 }], c: { d: 1, e: [1] }, g: true }
        let copy = clone(from)

        patch(copy, diff(from, to))

        expect(copy).toEqual(to)
    })
})

describe('compile and evaluateExpression', () => {
    test('caches compiled functions', () => {
        expect(compile(['a'], 'return a + 1')).toBe(compile(['a'], 'return a + 1'))
        expect(compile(['a'], 'return a + 1')(1)).toBe(2)
    })

    test('evaluates expressions with named variables, skipping invalid names', () => {
        expect(evaluateExpression('a + b', { a: 1, b: 2, 'not-valid': 3 })).toBe(3)
        expect(evaluateExpression('[item.x, -item.y]', { item: { x: 1, y: 2 } })).toEqual([1, -2])
    })
})
