/**
 * Unit tests for the arguments and the probe values the baseline uses when it records a built-in.
 *
 * Layer: unit.
 * Goal: prove that a getter is read with no argument, and that the iterator prototypes of an array and of a
 * string are taken from an empty array and an empty string, by loading `./builtins` while the built-in that
 * answers them is replaced by one that reports what it was given.
 * Mocks: none. The built-in is replaced for one case, the module is evaluated in an isolated registry, and
 * the built-in is put back afterwards.
 */

/** The part of the module these rows read. */
interface Loaded {
  readonly BASELINE: ReadonlyArray<{ name: string; owner: object; key: PropertyKey }>
}

/** An iterator whose prototype is its own, so the baseline entry that records it can be found by owner. */
function distinctIterator(): object {
  return Object.create({
    next(): { done: boolean } {
      return { done: true }
    }
  })
}

/** Evaluates `./builtins` while `owner[key]` is `value`, leaving the built-in as it found it. */
function loadUnder(owner: object, key: PropertyKey, value: () => unknown): Loaded {
  const original = Object.getOwnPropertyDescriptor(owner, key) as PropertyDescriptor
  const replaced = 'get' in original ? { ...original, get: value } : { ...original, value }
  Object.defineProperty(owner, key, replaced)
  let loaded: Loaded | undefined
  try {
    jest.isolateModules(() => {
      loaded = require('./builtins') as Loaded
    })
  } finally {
    Object.defineProperty(owner, key, original)
  }
  return loaded as Loaded
}

describe('baseline probes', () => {
  it('reads a getter with no argument', () => {
    /**
     * Scenario: the species getter of `Array` is replaced by one that counts the arguments it receives.
     * Expectation: the baseline recorded the getter, and every call it made passed no argument.
     */
    const counts: number[] = []
    const loaded = loadUnder(Array, Symbol.species, function (...received: unknown[]): unknown {
      counts.push(received.length)
      return Array
    })

    expect(loaded.BASELINE.some((entry) => entry.name === 'Array.Symbol(Symbol.species)')).toBe(
      true
    )
    expect(counts.length).toBeGreaterThan(0)
    expect(counts.every((count) => count === 0)).toBe(true)
  })

  it('takes the iterator prototype of an array from an empty array', () => {
    /**
     * Scenario: the array iterator factory answers one iterator for an empty array and another for any
     * other array.
     * Expectation: the baseline holds the prototype of the iterator answered for the empty one.
     */
    const forEmpty = distinctIterator()
    const forOther = distinctIterator()
    const loaded = loadUnder(Array.prototype, Symbol.iterator, function (this: unknown[]): object {
      return this.length === 0 ? forEmpty : forOther
    })

    expect(loaded.BASELINE.some((entry) => entry.owner === Object.getPrototypeOf(forEmpty))).toBe(
      true
    )
  })

  it('takes the iterator prototype of a string from an empty string', () => {
    /**
     * Scenario: the string iterator factory answers one iterator for an empty string and another for any
     * other string.
     * Expectation: the baseline holds the prototype of the iterator answered for the empty one.
     */
    const forEmpty = distinctIterator()
    const forOther = distinctIterator()
    const loaded = loadUnder(String.prototype, Symbol.iterator, function (this: string): object {
      return String(this).length === 0 ? forEmpty : forOther
    })

    expect(loaded.BASELINE.some((entry) => entry.owner === Object.getPrototypeOf(forEmpty))).toBe(
      true
    )
  })
})
