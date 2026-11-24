/**
 * Unit tests for the two lookups of a value's `then` that host results are judged by.
 *
 * Layer: unit.
 * Goal: prove that `callableThen` yields only a function held by a data property of an object or a
 * function, found by descriptor along the prototype chain, and that `ownsThenAccessor` reports an own
 * getter or setter named `then` for an object or a function and for nothing else.
 * Mocks: none. Each value is built for one case.
 */

import { callableThen, ownsThenAccessor } from './captured'

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
