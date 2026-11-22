/**
 * Unit tests for the walks over a schema when they are called directly, and for the placeholder synthesizer
 * with names planted on the root prototype.
 *
 * Layer: unit.
 * Goal: prove that a chain of wrappers that is too deep is refused with the library's own error, that a
 * walk called without the validator refuses a leaf placed where a namespace belongs, that a diamond of
 * pipes is walked once per node, and that a name planted on the root prototype is not taken for a field of
 * a definition that the synthesizer reads.
 * Mocks: none. The names are planted for the case and removed afterwards.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'
import {
  findCoercedBooleanLeaves,
  findUnusableEnvOverrides,
  resolveSourceNames,
  snapshotSchema
} from './source-mapping'
import { synthesizePlaceholderSource } from './testing/placeholder-synthesizer'

/** Runs `run` with `key` planted on the root prototype as `value`, and removes it afterwards. */
function planted<T>(key: string, value: unknown, run: () => T): T {
  Object.defineProperty(Object.prototype, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: false
  })
  try {
    return run()
  } finally {
    Reflect.deleteProperty(Object.prototype, key)
  }
}

describe('resolveSourceNames on a chain of wrappers that is too deep', () => {
  it('refuses it with the error of the library, not a bare TypeError', () => {
    let leaf: z.ZodType = z.string()
    for (let wrapped = 0; wrapped < 70; wrapped += 1) leaf = leaf.optional()
    const schema = defineEnv({ app: z.object({ value: leaf }) })

    expect(() => resolveSourceNames(schema as never)).toThrow(BymaxConfigValidationError)
  })
})

describe('a walk called without the validator in front of it', () => {
  const leafAtTop = snapshotSchema(defineEnv({ app: z.string() } as never))

  it.each([
    ['the unusable overrides', () => findUnusableEnvOverrides(leafAtTop)],
    ['the coercing booleans', () => findCoercedBooleanLeaves(leafAtTop)]
  ])('refuses a leaf placed where a namespace belongs: %s', (_name, walk) => {
    expect(walk).toThrow(BymaxConfigValidationError)
    expect(walk).toThrow('is not a namespace')
  })
})

describe('a diamond of pipes', () => {
  it('is walked once per node, so a deep one does not take exponential time', () => {
    let leaf: z.ZodType = z.string()
    for (let level = 0; level < 40; level += 1) leaf = leaf.pipe(leaf as never)
    const view = snapshotSchema(defineEnv({ app: z.object({ value: leaf }) }) as never)

    expect(findCoercedBooleanLeaves(view)).toEqual([])
  })
})

describe('the placeholder synthesizer with names planted on the root prototype', () => {
  const schema = defineEnv({
    app: z.object({ name: z.string().min(3), mail: z.string(), count: z.coerce.number().int() })
  })

  it.each([
    ['format', 'email'],
    ['checks', []],
    ['minimum', 50],
    ['check', 'max_length'],
    ['type', 'boolean']
  ])('does not take a planted %s for a field of a definition', (key, value) => {
    const before = synthesizePlaceholderSource(schema as never)

    const after = planted(key, value, () => synthesizePlaceholderSource(schema as never))

    expect(after).toEqual(before)
  })
})
