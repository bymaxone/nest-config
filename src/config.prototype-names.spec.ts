/**
 * Unit tests for names that match a member of Object.prototype, in the schema and in the source.
 *
 * Layer: unit.
 * Goal: prove that a leaf or namespace named like such a member takes its default and its value like
 * any other, that `__proto__`, which cannot be held as a property, is refused instead of dropped, and
 * that a source variable of that name holding a value of the host's own is validated, however held.
 * Mocks: none. The host's objects are written for the case.
 */

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const MEMBERS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty']

/** Runs `run` and returns what it threw, or fails when it did not throw. */
function thrownBy(run: () => unknown): BymaxConfigValidationError {
  try {
    run()
  } catch (error) {
    return error as BymaxConfigValidationError
  }
  throw new Error('expected the call to throw')
}

describe('a leaf or namespace named like a member of Object.prototype', () => {
  it.each(MEMBERS)('applies the default of a leaf named %s', (name) => {
    const schema = defineEnv({
      app: z.object(Object.fromEntries([[name, z.string().default('kept')]]))
    } as never)

    const config = createValidatedConfig({ schema, source: {} }) as never as {
      app: Record<string, unknown>
    }

    expect(Object.getOwnPropertyNames(config.app)).toEqual([name])
    expect(Object.getOwnPropertyDescriptor(config.app, name)?.value).toBe('kept')
  })

  it.each(MEMBERS)('takes the value given for a leaf named %s', (name) => {
    const schema = defineEnv({
      app: z.object(Object.fromEntries([[name, z.string().default('kept')]]))
    } as never)
    const variable = `APP_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`

    const config = createValidatedConfig({ schema, source: { [variable]: 'given' } }) as never as {
      app: Record<string, unknown>
    }

    expect(Object.getOwnPropertyDescriptor(config.app, name)?.value).toBe('given')
  })

  it.each(MEMBERS)('still reports a required leaf named %s that is absent', (name) => {
    const schema = defineEnv({
      app: z.object(Object.fromEntries([[name, z.string()]]))
    } as never)

    const error = thrownBy(() => createValidatedConfig({ schema, source: {} }))

    expect(error.issues.map((issue) => issue.path)).toEqual([`app.${name}`])
  })

  it.each(MEMBERS)('holds a namespace named %s with its default', (name) => {
    const schema = defineEnv(
      Object.fromEntries([[name, z.object({ a: z.string().default('kept') })]]) as never
    )

    const config = createValidatedConfig({ schema, source: {} }) as never as Record<string, unknown>

    expect(Object.getOwnPropertyNames(config)).toContain(name)
    expect(
      (Object.getOwnPropertyDescriptor(config, name)?.value as Record<string, unknown>).a
    ).toBe('kept')
  })
})

describe('a leaf or namespace named __proto__', () => {
  it.each([
    [
      'a leaf',
      () =>
        defineEnv({
          app: z.object(Object.fromEntries([['__proto__', z.string().default('k')]]))
        } as never),
      'app.__proto__'
    ],
    [
      'a namespace',
      () =>
        defineEnv(
          Object.fromEntries([['__proto__', z.object({ a: z.string().default('k') })]]) as never
        ),
      '__proto__.a'
    ]
  ])('is refused as %s instead of being dropped', (_name, make, path) => {
    const error = thrownBy(() => createValidatedConfig({ schema: make(), source: {} }))

    expect(error.issues.map((issue) => issue.path)).toEqual([path])
    expect(error.issues[0]?.message).toContain('__proto__')
  })
})

describe('a source variable named like a member of Object.prototype', () => {
  const named = defineEnv({
    app: z.object({ name: z.string().default('default-name').meta({ env: 'toString' }) })
  })
  const shapes: ReadonlyArray<readonly [string, (value: unknown) => Record<string, unknown>]> = [
    ['a non-enumerable property', (value) => Object.defineProperty({}, 'toString', { value })],
    [
      'an inherited property of a parent with no prototype',
      (value) => Object.create(Object.assign(Object.create(null) as object, { toString: value }))
    ],
    [
      'a get-only Proxy',
      (value) => new Proxy({}, { get: (_t, key) => (key === 'toString' ? value : undefined) })
    ]
  ]

  describe.each(shapes)('held as %s', (_shape, make) => {
    it.each([
      ['a number', 123],
      ['a boolean', true],
      ['null', null],
      ['an array', ['a']]
    ])('refuses %s instead of using the default', (_value, value) => {
      const error = thrownBy(() =>
        createValidatedConfig({ schema: named, source: make(value) as never })
      )

      expect(error.issues.map((issue) => issue.path)).toEqual(['app.name'])
    })

    it('still takes a text', () => {
      expect(createValidatedConfig({ schema: named, source: make('own') as never }).app?.name).toBe(
        'own'
      )
    })
  })

  it('uses the default when the source is plain and holds nothing under that name', () => {
    expect(createValidatedConfig({ schema: named, source: {} }).app?.name).toBe('default-name')
  })
})
