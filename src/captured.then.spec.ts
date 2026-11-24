/**
 * Unit tests for the two lookups of a value's `then` that host results are judged by.
 *
 * Layer: unit.
 * Goal: prove that `callableThen` yields only a function held by a data property of an object or a
 * function, found by descriptor along the prototype chain, and that `ownsThenAccessor` reports an own
 * getter or setter named `then` for an object or a function and for nothing else.
 * Mocks: none. Each value is built for one case.
 */

import { callableThen, inheritsThenAccessor, ownsThenAccessor } from './captured'

/** A function a data `then` can hold. */
const handler = (): void => undefined

describe('callableThen', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'then'],
    ['a number', 1],
    ['a boolean', true],
    ['a symbol', Symbol('then')]
  ])('answers undefined for %s', (_title, value) => {
    expect(callableThen(value)).toBeUndefined()
  })

  it('answers the function a data then of the object holds', () => {
    expect(callableThen({ then: handler })).toBe(handler)
  })

  it('answers the function a data then inherited from a prototype holds', () => {
    expect(callableThen(Object.create({ then: handler }))).toBe(handler)
  })

  it('answers the function a data then of a function holds', () => {
    const holder = Object.assign(() => undefined, { then: handler })

    expect(callableThen(holder)).toBe(handler)
  })

  it('answers undefined for a function that has no then', () => {
    expect(callableThen(() => undefined)).toBeUndefined()
  })

  it.each([
    ['a number', 1],
    ['a string', 'then'],
    ['null', null],
    ['an object', {}]
  ])('answers undefined for a data then that holds %s', (_title, held) => {
    expect(callableThen({ then: held })).toBeUndefined()
  })

  it('answers undefined for an accessor then that answers a function, without running it', () => {
    let read = 0
    const holder = {
      get then() {
        read += 1
        return handler
      }
    }

    expect(callableThen(holder)).toBeUndefined()
    expect(read).toBe(0)
  })

  it('stops at the nearest then: a non-callable data then hides the one inherited from further up', () => {
    const holder = Object.create({ then: handler }, { then: { value: 1 } }) as object

    expect(callableThen(holder)).toBeUndefined()
  })
})

describe('ownsThenAccessor', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'then'],
    ['a number', 1]
  ])('answers false for %s', (_title, value) => {
    expect(ownsThenAccessor(value)).toBe(false)
  })

  it('answers true for an object with an own getter named then', () => {
    expect(
      ownsThenAccessor({
        get then() {
          return handler
        }
      })
    ).toBe(true)
  })

  it('answers true for an object with an own setter named then and no getter', () => {
    expect(ownsThenAccessor({ set then(_value: unknown) {} })).toBe(true)
  })

  it('answers true for a function with an own getter named then', () => {
    const holder = () => undefined
    Reflect.defineProperty(holder, 'then', { get: () => handler })

    expect(ownsThenAccessor(holder)).toBe(true)
  })

  it.each([
    ['a function', handler],
    ['a number', 1],
    ['undefined', undefined]
  ])('answers false for an own data then that holds %s', (_title, held) => {
    expect(ownsThenAccessor({ then: held })).toBe(false)
  })

  it('answers false for an object with no own then, even when its prototype has an accessor', () => {
    const inherited = Object.create({
      get then() {
        return handler
      }
    }) as object

    expect(ownsThenAccessor(inherited)).toBe(false)
  })
})

describe('inheritsThenAccessor', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'then'],
    ['a number', 1]
  ])('answers false for %s', (_title, value) => {
    expect(inheritsThenAccessor(value)).toBe(false)
  })

  it('answers true for an object whose class prototype has a getter named then', () => {
    class Holder {
      get then() {
        return handler
      }
    }

    expect(inheritsThenAccessor(new Holder())).toBe(true)
  })

  it('answers true for a setter named then with no getter, two prototypes up', () => {
    const grand = { set then(_value: unknown) {} }

    expect(inheritsThenAccessor(Object.create(Object.create(grand) as object) as object)).toBe(true)
  })

  it('answers true for a function whose prototype has a getter named then', () => {
    const holder = () => undefined
    Object.setPrototypeOf(holder, {
      get then() {
        return handler
      }
    })

    expect(inheritsThenAccessor(holder)).toBe(true)
  })

  it('answers false for an own then of any kind, since that is for ownsThenAccessor', () => {
    const inherited = Object.create({
      get then() {
        return handler
      }
    }) as object
    Reflect.defineProperty(inherited, 'then', { get: () => handler })

    expect(inheritsThenAccessor(inherited)).toBe(false)
  })

  it('answers false when a nearer data then hides the accessor further up', () => {
    const near = Object.create(
      {
        get then() {
          return handler
        }
      },
      { then: { value: handler } }
    ) as object

    expect(inheritsThenAccessor(Object.create(near) as object)).toBe(false)
  })

  it('answers false for an accessor on Object.prototype, which answers for every object', () => {
    let answers: boolean[]
    Reflect.defineProperty(Object.prototype, 'then', { get: () => handler, configurable: true })
    try {
      answers = [inheritsThenAccessor({}), inheritsThenAccessor(Object.create(null) as object)]
    } finally {
      Reflect.deleteProperty(Object.prototype, 'then')
    }

    expect(answers).toEqual([false, false])
  })

  it('answers false for plain objects, null-prototype objects and functions with no then', () => {
    expect(inheritsThenAccessor({})).toBe(false)
    expect(inheritsThenAccessor(Object.create(null) as object)).toBe(false)
    expect(inheritsThenAccessor(() => undefined)).toBe(false)
  })
})
