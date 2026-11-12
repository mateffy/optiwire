import { describe, expect, test } from 'bun:test'
import { comparator, compareValues, hasOrder, insertionIndex, orderFields, sortKey } from '../../resources/js/order.js'

describe('compareValues', () => {
    test('nulls sort first', () => {
        expect(compareValues(null, 1)).toBe(-1)
        expect(compareValues(1, undefined)).toBe(1)
        expect(compareValues(null, undefined)).toBe(0)
    })

    test('booleans compare as integers', () => {
        expect(compareValues(false, true)).toBe(-1)
        expect(compareValues(true, 0)).toBe(1)
        expect(compareValues(true, true)).toBe(0)
    })

    test('numbers compare numerically', () => {
        expect(compareValues(2, 10)).toBe(-1)
        expect(compareValues(10, 2)).toBe(1)
        expect(compareValues(3, 3)).toBe(0)
    })

    test('everything else compares as binary strings (ISO dates sort correctly)', () => {
        expect(compareValues('2026-01-02T00:00:00Z', '2026-01-10T00:00:00Z')).toBe(-1)
        expect(compareValues('b', 'a')).toBe(1)
        expect(compareValues('a', 'a')).toBe(0)
        expect(compareValues('10', 9)).toBe(-1)
    })
})

describe('specs', () => {
    test('hasOrder', () => {
        expect(hasOrder(null)).toBe(false)
        expect(hasOrder({})).toBe(false)
        expect(hasOrder({ order: [] })).toBe(false)
        expect(hasOrder({ order: [['a', 'asc']] })).toBe(true)
        expect(hasOrder({ js: 'item.x' })).toBe(true)
    })

    test('orderFields', () => {
        expect(orderFields(null)).toEqual([])
        expect(orderFields({})).toEqual([])
        expect(orderFields({ order: [['a', 'asc'], ['b', 'desc']] })).toEqual(['a', 'b'])
        expect(orderFields({ js: 'item.x', fields: ['x'] })).toEqual(['x'])
        expect(orderFields({ js: 'item.x' })).toEqual([])
    })

    test('sortKey from columns and from js', () => {
        expect(sortKey({ order: [['a', 'asc'], ['b', 'desc']] }, { a: 1, b: 2 })).toEqual([1, 2])
        expect(sortKey({ order: [['a', 'asc']] }, null)).toEqual([undefined])
        expect(sortKey({ js: '[-item.votes, item.name]' }, { votes: 3, name: 'x' })).toEqual([-3, 'x'])
        expect(sortKey({ js: 'item.votes' }, { votes: 3 })).toEqual([3])
    })

    test('a broken sort expression degrades to an empty key', () => {
        let original = console.error
        console.error = () => {}
        expect(sortKey({ js: 'item.missing.deep' }, {})).toEqual([])
        console.error = original
    })
})

describe('comparator and insertionIndex', () => {
    let spec = { order: [['done', 'asc'], ['created_at', 'DESC']] }

    test('compares tuples column by column with directions', () => {
        let compare = comparator(spec)
        expect(compare([false, '2026-02'], [true, '2026-03'])).toBe(-1)
        expect(compare([false, '2026-02'], [false, '2026-03'])).toBe(1)
        expect(compare([false, '2026-02'], [false, '2026-02'])).toBe(0)
    })

    test('js specs sort every component ascending', () => {
        let compare = comparator({ js: 'x' })
        expect(compare([1, 'b'], [1, 'a'])).toBe(1)
        expect(compare([1], [1, 'a'])).toBe(-1)
    })

    test('finds the insertion index, after equal keys', () => {
        let keys = [[false, '2026-03'], [false, '2026-01'], [true, '2026-05']]

        expect(insertionIndex(spec, keys, [false, '2026-04'])).toBe(0)
        expect(insertionIndex(spec, keys, [false, '2026-02'])).toBe(1)
        expect(insertionIndex(spec, keys, [false, '2026-01'])).toBe(2)
        expect(insertionIndex(spec, keys, [true, '2026-01'])).toBe(3)
        expect(insertionIndex(spec, [], [true, 'x'])).toBe(0)
    })
})
