/**
 * Unit tests for how the schema walks read the definition objects zod builds, with names planted on the root
 * prototype.
 *
 * Layer: unit.
 * Goal: prove that `innerType`, `in`, `coerce` and `shape`, planted on `Object.prototype`, are not taken for
 * what a zod definition or schema holds, so no node is followed, no variable is renamed, no message is
 * changed and no leaf is taken for a namespace, and that a chain of wrappers that never ends is refused.
 * Mocks: none. The names are planted for the case and removed afterwards; the fake nodes count their reads.
 */

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

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

/** A node a planted name could stand for, which counts how often it is looked at and fails after a few. */
function fakeNode(env?: string): { node: object; reads: () => number } {
  let reads = 0
  const node = {
    meta: () => (env === undefined ? undefined : { env }),
    get _zod(): { def: object } {
      reads += 1
      if (reads > 50) throw new Error('followed without end')
      return { def: {} }
    }
  }
  return { node, reads: () => reads }
}

/** The issues of what a validation of the schema refuses, or an empty list when it passes. */
function issuesOf(source: Record<string, string>, using: unknown = schema): string[] {
  try {
    createValidatedConfig({ schema: using as typeof schema, source })
    return []
  } catch (error) {
    return (error as BymaxConfigValidationError).issues.map((issue) => issue.message)
  }
}

describe('a node planted as the content of a wrapper', () => {
  it.each(['innerType', 'in'])('is not followed when it is planted as %s', (key) => {
    const { node, reads } = fakeNode()

    const config = planted(key, node, () =>
      createValidatedConfig({ schema, source: { APP_NAME: 'real' } })
    )

    expect(config.app.name).toBe('real')
    expect(reads()).toBe(0)
  })

  it.each(['innerType', 'in'])('does not rename a variable when it is planted as %s', (key) => {
    const { node } = fakeNode('PLANTED_VARIABLE')

    const config = planted(key, node, () =>
      createValidatedConfig({ schema, source: { APP_NAME: 'real', PLANTED_VARIABLE: 'planted' } })
    )

    expect(config.app.name).toBe('real')
  })
})

describe('a name planted on the root prototype and read from a definition or a schema', () => {
  const flag = defineEnv({ app: z.object({ on: z.boolean().default(false) }) })

  it('does not claim a boolean leaf is z.coerce.boolean() because of a planted coerce', () => {
    const after = planted('coerce', true, () => issuesOf({ APP_ON: 'false' }, flag))

    expect(after.join(' ')).not.toContain('z.coerce.boolean()')
  })

  it('does not take a leaf for a namespace through a planted shape', () => {
    const leafAtTop = { app: z.string() } as never

    const messages = planted('shape', {}, () => issuesOf({}, defineEnv(leafAtTop)))

    expect(messages.join(' ')).toContain('is not a namespace')
  })
})

describe('a chain of wrappers that never ends', () => {
  it('is refused instead of followed without end', () => {
    const leaf = z.string().default('x')
    Object.defineProperty(leaf._zod.def, 'innerType', { get: () => leaf, configurable: true })
    const cyclic = defineEnv({ app: z.object({ name: leaf }) })

    const messages = issuesOf({}, cyclic)

    expect(messages.join(' ')).toContain('TypeError')
  })
})
