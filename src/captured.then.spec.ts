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
    /**
     * Scenario: `callableThen` is given a primitive or nothing.
     * Expectation: It answers undefined, since only an object or a function can hold a then.
     */
    expect(callableThen(value)).toBeUndefined()
  })

  it('answers the function a data then of the object holds', () => {
    /**
     * Scenario: An object holds a data then that is a function.
     * Expectation: That function is the answer.
     */
    expect(callableThen({ then: handler })).toBe(handler)
  })

  it('answers the function a data then inherited from a prototype holds', () => {
    /**
     * Scenario: The data then sits on the prototype of the object, not on the object.
     * Expectation: The function is found along the chain and answered.
     */
    expect(callableThen(Object.create({ then: handler }))).toBe(handler)
  })

  it('answers the function a data then of a function holds', () => {
    /**
     * Scenario: A function carries a data then of its own.
     * Expectation: That function is the answer.
     */
    const holder = Object.assign(() => undefined, { then: handler })

    expect(callableThen(holder)).toBe(handler)
  })

  it('answers undefined for a function that has no then', () => {
    /**
     * Scenario: A function has no then anywhere on its chain.
     * Expectation: The answer is undefined.
     */
    expect(callableThen(() => undefined)).toBeUndefined()
  })

  it.each([
    ['a number', 1],
    ['a string', 'then'],
    ['null', null],
    ['an object', {}]
  ])('answers undefined for a data then that holds %s', (_title, held) => {
    /**
     * Scenario: An object holds a data then that is not callable.
     * Expectation: The answer is undefined, since there is nothing to call.
     */
    expect(callableThen({ then: held })).toBeUndefined()
  })

  it('answers undefined for an accessor then that answers a function, without running it', () => {
    /**
     * Scenario: An object holds an accessor then that would answer a function.
     * Expectation: The answer is undefined and the getter is never run.
     */
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
    /**
     * Scenario: An own non-callable data then sits above a callable one on the prototype.
     * Expectation: The answer is undefined: the nearest then decides and the inherited one is not reached.
     */
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
    /**
     * Scenario: `ownsThenAccessor` is given a primitive or nothing.
     * Expectation: It answers false, since only an object or a function can own a property.
     */
    expect(ownsThenAccessor(value)).toBe(false)
  })

  it('answers true for an object with an own getter named then', () => {
    /**
     * Scenario: An object has an own getter named then.
     * Expectation: `ownsThenAccessor` answers true.
     */
    expect(
      ownsThenAccessor({
        get then() {
          return handler
        }
      })
    ).toBe(true)
  })

  it('answers true for an object with an own setter named then and no getter', () => {
    /**
     * Scenario: An object has an own setter named then and no getter.
     * Expectation: `ownsThenAccessor` answers true, since a setter is an accessor too.
     */
    expect(ownsThenAccessor({ set then(_value: unknown) {} })).toBe(true)
  })

  it('answers true for a function with an own getter named then', () => {
    /**
     * Scenario: A function has an own getter named then.
     * Expectation: `ownsThenAccessor` answers true for a function as for an object.
     */
    const holder = () => undefined
    Reflect.defineProperty(holder, 'then', { get: () => handler })

    expect(ownsThenAccessor(holder)).toBe(true)
  })

  it.each([
    ['a function', handler],
    ['a number', 1],
    ['undefined', undefined]
  ])('answers false for an own data then that holds %s', (_title, held) => {
    /**
     * Scenario: An object has an own data then, of whatever kind.
     * Expectation: `ownsThenAccessor` answers false, since a data property is not an accessor.
     */
    expect(ownsThenAccessor({ then: held })).toBe(false)
  })

  it('answers false for an object with no own then, even when its prototype has an accessor', () => {
    /**
     * Scenario: The accessor named then is on the prototype only.
     * Expectation: `ownsThenAccessor` answers false, since it reports own properties only.
     */
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
    /**
     * Scenario: `inheritsThenAccessor` is given a primitive or nothing.
     * Expectation: It answers false, since only an object or a function has a chain to walk.
     */
    expect(inheritsThenAccessor(value)).toBe(false)
  })

  it('answers true for an object whose class prototype has a getter named then', () => {
    /**
     * Scenario: A class declares `get then()` and an instance is built from it.
     * Expectation: `inheritsThenAccessor` answers true.
     */
    class Holder {
      get then() {
        return handler
      }
    }

    expect(inheritsThenAccessor(new Holder())).toBe(true)
  })

  it('answers true for a setter named then with no getter, two prototypes up', () => {
    /**
     * Scenario: A setter named then with no getter sits two prototypes above the value.
     * Expectation: `inheritsThenAccessor` answers true, walking the whole chain.
     */
    const grand = { set then(_value: unknown) {} }

    expect(inheritsThenAccessor(Object.create(Object.create(grand) as object) as object)).toBe(true)
  })

  it('answers true for a function whose prototype has a getter named then', () => {
    /**
     * Scenario: A function has had its prototype replaced by an object with a getter named then.
     * Expectation: `inheritsThenAccessor` answers true for a function as for an object.
     */
    const holder = () => undefined
    Object.setPrototypeOf(holder, {
      get then() {
        return handler
      }
    })

    expect(inheritsThenAccessor(holder)).toBe(true)
  })

  it('answers false for an own then of any kind, since that is for ownsThenAccessor', () => {
    /**
     * Scenario: The value has its own getter named then over a prototype that has one too.
     * Expectation: `inheritsThenAccessor` answers false: the own property ends the walk and belongs to the other lookup.
     */
    const inherited = Object.create({
      get then() {
        return handler
      }
    }) as object
    Reflect.defineProperty(inherited, 'then', { get: () => handler })

    expect(inheritsThenAccessor(inherited)).toBe(false)
  })

  it('answers false when a nearer data then hides the accessor further up', () => {
    /**
     * Scenario: A data then sits between the value and an accessor named then.
     * Expectation: `inheritsThenAccessor` answers false, since the nearest then decides.
     */
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
    /**
     * Scenario: An accessor named then is planted on `Object.prototype` and removed afterwards.
     * Expectation: Both a plain object and a null-prototype object answer false: the lookup stops short of `Object.prototype`.
     */
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
    /**
     * Scenario: Values that have no then anywhere.
     * Expectation: `inheritsThenAccessor` answers false for each.
     */
    expect(inheritsThenAccessor({})).toBe(false)
    expect(inheritsThenAccessor(Object.create(null) as object)).toBe(false)
    expect(inheritsThenAccessor(() => undefined)).toBe(false)
  })
})
