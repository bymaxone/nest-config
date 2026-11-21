/**
 * Unit tests for the values the library reads by name rather than by listing keys.
 *
 * Layer: unit.
 * Goal: prove that a declared source variable, an override and a configuration leaf are found whether
 * the property is enumerable or not, own or inherited where the library reads it by name, and that a
 * plain object from another realm is accepted as overrides, because a listing of keys drops what a read
 * by name finds and a default would then replace the host's value without a word.
 * Mocks: none. The host's objects are written for the case; the other realm is a `node:vm` context.
 */

import { runInNewContext } from 'node:vm'

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'
import { createTestConfig } from './testing/create-test-config'

const schema = defineEnv({
  app: z.object({ name: z.string().default('default-name'), mode: z.enum(['a', 'b']).default('a') })
})

/** Defines a non-enumerable data property. */
function hidden<T extends object>(target: T, key: string, value: unknown): T {
  return Object.defineProperty(target, key, { value, enumerable: false })
}

/** Runs `run` and returns what it threw, or fails when it did not throw. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}

describe('a declared source variable is read by name', () => {
  it.each([
    ['a non-enumerable property', () => hidden({}, 'APP_NAME', 'hidden')],
    [
      'an inherited property',
      () => Object.create({ APP_NAME: 'hidden' }) as Record<string, string>
    ],
    [
      'a non-enumerable getter',
      () =>
        Object.defineProperty({}, 'APP_NAME', { get: () => 'hidden', enumerable: false }) as Record<
          string,
          string
        >
    ]
  ])('finds the variable held as %s, in place of its default', (_name, make) => {
    expect(createValidatedConfig({ schema, source: make() }).app?.name).toBe('hidden')
  })

  it('finds a variable that only the get trap of a Proxy answers, which lists no key', () => {
    /** The listing is empty, so only a read by name can supply the declared variable. */
    const source = new Proxy(
      {},
      { get: (_target, key) => (key === 'APP_NAME' ? 'from-the-trap' : undefined) }
    )

    expect(createValidatedConfig({ schema, source }).app?.name).toBe('from-the-trap')
  })

  it('reads an enumerable getter once', () => {
    let reads = 0
    const source = Object.defineProperty({}, 'APP_NAME', {
      enumerable: true,
      get: () => {
        reads += 1
        return `read-${reads}`
      }
    })

    expect(createValidatedConfig({ schema, source }).app?.name).toBe('read-1')
    expect(reads).toBe(1)
  })

  it('reads a declared variable that is not in the listing once as well', () => {
    let reads = 0
    const source = Object.defineProperty({}, 'APP_NAME', {
      enumerable: false,
      get: () => {
        reads += 1
        return `read-${reads}`
      }
    })

    expect(createValidatedConfig({ schema, source }).app?.name).toBe('read-1')
    expect(reads).toBe(1)
  })

  it('still reports a listed key that no leaf declares, under strict', () => {
    const source = { APP_NAME: 'x', APP_STRAY: 'y' }

    const error = thrownBy(() => createValidatedConfig({ schema, source, strict: true }))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues.map((issue) => issue.variable)).toEqual([
      'APP_STRAY'
    ])
  })

  it('keeps a variable mapped to undefined as absent', () => {
    expect(createValidatedConfig({ schema, source: { APP_NAME: undefined } }).app?.name).toBe(
      'default-name'
    )
  })
})

describe('overrides are read by name', () => {
  it('applies an override held in a non-enumerable namespace', () => {
    expect(createTestConfig(schema, hidden({}, 'app', { name: 'o' }) as never).app?.name).toBe('o')
  })

  it('applies an override held in a non-enumerable leaf', () => {
    expect(createTestConfig(schema, { app: hidden({}, 'name', 'l') } as never).app?.name).toBe('l')
  })

  it('ignores a symbol key', () => {
    const overrides = { [Symbol('s')]: 1, app: { name: 'w' } }

    expect(createTestConfig(schema, overrides as never).app?.name).toBe('w')
  })

  it('accepts a plain object made in another realm', () => {
    const foreign = runInNewContext("({ app: { name: 'foreign' } })") as never

    expect(createTestConfig(schema, foreign).app?.name).toBe('foreign')
  })

  it('accepts an object with no prototype', () => {
    const bare = Object.assign(Object.create(null) as object, { app: { name: 'bare' } })

    expect(createTestConfig(schema, bare as never).app?.name).toBe('bare')
  })

  it.each([
    ['an instance of a class', () => new (class Holder {})()],
    ['an array', () => []],
    ['a Map', () => new Map()]
  ])('still refuses %s as the overrides', (_name, make) => {
    const error = thrownBy(() => createTestConfig(schema, make() as never))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues[0]?.message).toBe(
      'the overrides must be an object'
    )
  })
})

describe('the ConfigService snapshot is read by name', () => {
  it('finds a leaf of a non-enumerable namespace', () => {
    const service = new ConfigService(hidden({}, 'app', { name: 'n' }) as never)

    expect(service.get('app.name' as never)).toBe('n')
  })

  it('finds a non-enumerable leaf', () => {
    const service = new ConfigService({ app: hidden({}, 'name', 'l') } as never)

    expect(service.get('app.name' as never)).toBe('l')
    expect(service.has('app.name' as never)).toBe(true)
  })

  it('ignores a symbol key and keeps the string ones', () => {
    const service = new ConfigService({ [Symbol('s')]: { x: 1 }, app: { name: 'k' } } as never)

    expect(service.get('app.name' as never)).toBe('k')
    expect(service.toJSON().namespaces).toEqual(['app'])
  })
})
