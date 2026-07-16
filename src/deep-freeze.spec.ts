/**
 * Unit tests for the `deepFreeze` immutability utility.
 *
 * Layer: unit.
 * Goal: prove recursive freezing of nested objects and arrays, strict-mode
 * mutation rejection, primitive and null pass-through, idempotence on
 * already-frozen input, and cycle safety with no infinite recursion.
 * Mocks: none. Spec files run in strict mode, so writes to frozen objects throw.
 */

import { deepFreeze } from './deep-freeze'

describe('deepFreeze', () => {
  it('freezes nested objects recursively', () => {
    /**
     * Deep object immutability.
     *
     * The validated config is a tree; every nested object must be frozen so no
     * consumer can mutate configuration after bootstrap.
     */
    const frozen = deepFreeze({ server: { port: 3000, nested: { flag: true } } })

    expect(Object.isFrozen(frozen)).toBe(true)
    expect(Object.isFrozen(frozen.server)).toBe(true)
    expect(Object.isFrozen(frozen.server.nested)).toBe(true)
  })

  it('freezes arrays and their element objects', () => {
    /**
     * Array immutability.
     *
     * Arrays and the objects they contain must also be frozen, closing the
     * mutation path through list-valued configuration.
     */
    const frozen = deepFreeze({ hosts: [{ name: 'a' }, { name: 'b' }] })

    expect(Object.isFrozen(frozen.hosts)).toBe(true)
    expect(Object.isFrozen(frozen.hosts[0])).toBe(true)
    expect(Object.isFrozen(frozen.hosts[1])).toBe(true)
  })

  it('throws when a frozen property is reassigned under strict mode', () => {
    /**
     * Mutation rejection.
     *
     * Immutability by construction means a write to a frozen leaf throws, not
     * silently no-ops. Encodes the strict-mode guarantee the package relies on.
     */
    const frozen = deepFreeze({ value: 1 })

    expect(() => {
      ;(frozen as { value: number }).value = 2
    }).toThrow(TypeError)
  })

  it('returns primitives unchanged', () => {
    /**
     * Primitive pass-through.
     *
     * Non-object inputs have no properties to freeze and must be returned as-is
     * so the utility is safe to call on any leaf value during recursion.
     */
    expect(deepFreeze(42)).toBe(42)
    expect(deepFreeze('secret')).toBe('secret')
    expect(deepFreeze(true)).toBe(true)
  })

  it('returns null and nested null unchanged', () => {
    /**
     * Null pass-through.
     *
     * `typeof null` is `object`, so null needs an explicit guard; both a
     * top-level null and a null property must pass through without error.
     */
    expect(deepFreeze(null)).toBeNull()

    const frozen = deepFreeze({ optional: null })
    expect(frozen.optional).toBeNull()
    expect(Object.isFrozen(frozen)).toBe(true)
  })

  it('is idempotent on an already-frozen structure', () => {
    /**
     * Idempotence.
     *
     * Re-freezing a frozen tree returns the same reference and does nothing new,
     * so the utility can be applied defensively more than once.
     */
    const original = Object.freeze({ a: Object.freeze({ b: 1 }) })

    const result = deepFreeze(original)

    expect(result).toBe(original)
    expect(Object.isFrozen(result.a)).toBe(true)
  })

  it('terminates on a self-referencing structure', () => {
    /**
     * Cycle safety.
     *
     * Freezing a node before recursing means a cycle short-circuits on the
     * already-frozen check, so a self-reference cannot cause infinite recursion.
     */
    interface Cyclic {
      self?: Cyclic
    }
    const node: Cyclic = {}
    node.self = node

    const frozen = deepFreeze(node)

    expect(Object.isFrozen(frozen)).toBe(true)
    expect(frozen.self).toBe(frozen)
  })
})
