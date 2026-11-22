/**
 * Unit tests for names that match a member of Object.prototype, in the schema and in the source.
 *
 * Layer: unit.
 * Goal: prove that a leaf or namespace named like such a member takes its default and its value like
 * any other, that `__proto__`, which cannot be held as a property, is refused instead of dropped, and
 * that a source variable of that name holding a value of the host's own is validated, however held.
 * Mocks: none. The host's objects are written for the case.
 */

import { runInNewContext } from 'node:vm'

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'
import { createTestConfig } from './testing/create-test-config'

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

describe('createTestConfig on a schema that names a namespace or leaf __proto__', () => {
  it.each([
    [
      'a leaf',
      () =>
        defineEnv({
          app: z.object(Object.fromEntries([['__proto__', z.string().optional()]]))
        } as never),
      { app: {} },
      'app.__proto__'
    ],
    [
      'a namespace',
      () =>
        defineEnv(
          Object.fromEntries([['__proto__', z.object({ a: z.string().default('k') })]]) as never
        ),
      {},
      '__proto__.a'
    ]
  ])(
    'reports only the refusal of %s, not the members its prototype answers',
    (_name, make, overrides, path) => {
      const error = thrownBy(() => createTestConfig(make(), overrides as never))

      expect(error.issues.map((issue) => issue.path)).toEqual([path])
      expect(error.issues[0]?.message).toContain('cannot be named __proto__')
    }
  )
})

describe('a source variable named like a member of Object.prototype', () => {
  const named = defineEnv({
    app: z.object({ name: z.string().default('default-name').meta({ env: 'toString' }) })
  })
  const shapes: ReadonlyArray<readonly [string, (value: unknown) => Record<string, unknown>]> = [
    ['a non-enumerable property', (value) => Object.defineProperty({}, 'toString', { value })],
    [
      'a get-only Proxy',
      (value) =>
        new Proxy(Object.create(null) as object, {
          get: (_t, key) => (key === 'toString' ? value : undefined)
        })
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

  it('does not take a value that only a parent with no prototype holds, as it would the root prototype of a realm', () => {
    const parent = Object.assign(Object.create(null) as object, { toString: 'inherited' })
    const source = Object.create(parent) as Record<string, unknown>

    expect(createValidatedConfig({ schema: named, source: source as never }).app?.name).toBe(
      'default-name'
    )
  })

  it('uses the default when the source is plain and holds nothing under that name', () => {
    expect(createValidatedConfig({ schema: named, source: {} }).app?.name).toBe('default-name')
  })
})

describe('a source variable named __proto__', () => {
  const named = defineEnv({
    app: z.object({ name: z.string().default('default-name').meta({ env: '__proto__' }) })
  })

  it.each([
    ['an object built on another', () => Object.create({ marker: 1 }) as Record<string, unknown>],
    ['an object with no prototype', () => Object.create(null) as Record<string, unknown>],
    ['a plain object of another realm', () => runInNewContext('({})') as Record<string, unknown>],
    ['a plain object', () => ({})]
  ])('is not the prototype of %s, so its default applies', (_name, make) => {
    expect(createValidatedConfig({ schema: named, source: make() }).app?.name).toBe('default-name')
  })

  it('is not taken from a parent that holds it as a property of its own, so the default applies', () => {
    const parent = JSON.parse('{"__proto__":"inherited"}') as object
    const source = Object.create(parent) as Record<string, string>

    expect(createValidatedConfig({ schema: named, source }).app?.name).toBe('default-name')
  })

  it('is taken from a source that holds it as a property of its own', () => {
    const source = JSON.parse('{"__proto__":"own"}') as Record<string, string>

    expect(createValidatedConfig({ schema: named, source }).app?.name).toBe('own')
  })
})
