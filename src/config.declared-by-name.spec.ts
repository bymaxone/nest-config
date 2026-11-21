/**
 * Unit tests for the declared names the library reads by name from a host object.
 *
 * Layer: unit.
 * Goal: prove that a declared source variable is validated whatever its type and however the source holds
 * it, that the overrides of the test helpers are found by the names the schema declares when the object
 * lists none of them (a get-only Proxy, a prototype that is itself a bare object), and that the service
 * reads no leaf of a namespace that is a function, a string, an array or null.
 * Mocks: none. The host's objects are written for the case.
 */

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'
import { createTestConfig } from './testing/create-test-config'

const schema = defineEnv({
  app: z.object({
    name: z.string().default('default-name'),
    port: z.coerce.number().int().max(100).default(5)
  })
})

/** A get-only Proxy over an empty target: it lists no key, and answers the names it knows. */
function getOnly(data: Record<string, unknown>): Record<string, unknown> {
  return new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? data[key] : undefined) })
}

/** An object whose prototype is a bare object (no prototype of its own) that holds the data. */
function withBareAncestor(data: Record<string, unknown>): Record<string, unknown> {
  return Object.create(Object.assign(Object.create(null) as object, data)) as Record<
    string,
    unknown
  >
}

/** The values of the leaves of a namespace of a configuration, or none when it has no such namespace. */
function leavesOf(config: object, namespace: string): unknown[] {
  return Object.values((Reflect.get(config, namespace) ?? {}) as object)
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

describe('a declared source variable of any type is validated, however the source holds it', () => {
  const shapes: ReadonlyArray<
    readonly [string, (variable: string, value: unknown) => Record<string, unknown>]
  > = [
    [
      'a non-enumerable property',
      (variable, value) => Object.defineProperty({}, variable, { value, enumerable: false })
    ],
    [
      'an inherited property',
      (variable, value) => Object.create({ [variable]: value }) as Record<string, unknown>
    ],
    ['a get-only Proxy', (variable, value) => getOnly({ [variable]: value })]
  ]
  /** The variable, the value, and the path the refusal names. */
  const values: ReadonlyArray<readonly [string, string, unknown, string]> = [
    ['a number over the maximum', 'APP_PORT', 500, 'app.port'],
    ['the text of a number over the maximum', 'APP_PORT', '500', 'app.port'],
    ['a number for a text', 'APP_NAME', 123, 'app.name'],
    ['a boolean for a text', 'APP_NAME', true, 'app.name'],
    ['null for a text', 'APP_NAME', null, 'app.name'],
    ['an array for a text', 'APP_NAME', ['a'], 'app.name']
  ]

  describe.each(shapes)('held as %s', (_shape, make) => {
    it.each(values)('refuses %s instead of using the default', (_value, variable, value, path) => {
      const error = thrownBy(() =>
        createValidatedConfig({ schema, source: make(variable, value) as never })
      )

      expect((error as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
        path
      ])
    })

    it('still takes a value that satisfies the schema', () => {
      expect(
        createValidatedConfig({ schema, source: make('APP_PORT', '7') as never }).app?.port
      ).toBe(7)
    })
  })

  it('keeps a variable held as undefined absent, so its default applies', () => {
    const source = Object.defineProperty({}, 'APP_PORT', { value: undefined, enumerable: false })

    expect(createValidatedConfig({ schema, source: source as never }).app?.port).toBe(5)
  })
})

describe('the overrides are found by the names the schema declares', () => {
  it.each([
    ['a get-only Proxy at the root', () => getOnly({ app: { name: 'o', port: 9 } })],
    ['a get-only Proxy as the namespace', () => ({ app: getOnly({ name: 'o', port: 9 }) })],
    ['a bare ancestor at the root', () => withBareAncestor({ app: { name: 'o', port: 9 } })],
    ['a bare ancestor as the namespace', () => ({ app: withBareAncestor({ name: 'o', port: 9 }) })]
  ])('applies the overrides held by %s', (_name, make) => {
    const config = createTestConfig(schema, make() as never)

    expect(config.app?.name).toBe('o')
    expect(config.app?.port).toBe(9)
  })

  it('still refuses an override that violates a constraint, found by name', () => {
    const error = thrownBy(() => createTestConfig(schema, getOnly({ app: { port: 500 } }) as never))

    expect((error as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'app.port'
    ])
  })

  it('leaves a leaf alone when the object answers undefined for it', () => {
    const config = createTestConfig(schema, getOnly({ app: { name: 'o' } }) as never)

    expect(config.app?.name).toBe('o')
    expect(config.app?.port).toBeLessThanOrEqual(100)
  })

  it('leaves a declared namespace alone when the object answers undefined for it', () => {
    const two = defineEnv({
      app: z.object({ name: z.string().default('a') }),
      db: z.object({ port: z.coerce.number().default(5) })
    })

    const config = createTestConfig(two, getOnly({ app: { name: 'o' } }) as never)

    expect(config.app?.name).toBe('o')
    expect(config.db?.port).toBe(5)
  })

  it('applies a function found by name under a name that is not a member of Object.prototype', () => {
    const named = defineEnv({ app: z.object({ handler: z.string() }) })
    const handler = (): number => 1

    const config = createTestConfig(named, { app: getOnly({ handler }) } as never)

    expect(config.app?.handler).toBe(String(handler))
  })

  it('does not report a key of a get-only Proxy that the object does not list', () => {
    const config = createTestConfig(schema, { app: getOnly({ name: 'o', extra: 1 }) } as never)

    expect(config.app?.name).toBe('o')
  })

  describe.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'a name that matches a member of Object.prototype: %s',
    (name) => {
      it('is a namespace of the schema that the overrides need not mention', () => {
        const named = defineEnv(
          Object.fromEntries([[name, z.object({ name: z.string().default('n') })]]) as never
        )

        expect(() => createTestConfig(named, {} as never)).not.toThrow()
      })

      it('is a leaf whose value is not the source text of an inherited function', () => {
        const named = defineEnv({
          app: z.object(Object.fromEntries([[name, z.string().optional()]]))
        } as never)
        let leaves: unknown[] = []
        try {
          leaves = leavesOf(createTestConfig(named, { app: {} } as never), 'app')
        } catch {
          // A leaf with such a name may be reported as missing; what must not happen is a value.
        }

        expect(leaves.join()).not.toContain('native code')
      })
    }
  )

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'still applies an override of the leaf %s when the object lists it',
    (name) => {
      const named = defineEnv({
        app: z.object(Object.fromEntries([[name, z.string().optional()]]))
      } as never)
      const overrides = {
        app: Object.defineProperty({}, name, { value: 'given', enumerable: true })
      }

      expect(leavesOf(createTestConfig(named, overrides as never), 'app')).toEqual(['given'])
    }
  )

  it.each([
    ['a class instance', () => new (class Holder {})()],
    ['an array', () => []],
    ['a Map', () => new Map()]
  ])('still refuses %s as the overrides', (_name, make) => {
    const error = thrownBy(() => createTestConfig(schema, make() as never))

    expect((error as BymaxConfigValidationError).issues[0]?.message).toBe(
      'the overrides must be an object'
    )
  })
})

describe('ConfigService reads no leaf of a namespace that is not an object, or is an array', () => {
  it.each([
    ['a function', () => function named() {}],
    ['a string', () => 'abc'],
    ['an array', () => [1, 2]],
    ['null', () => null]
  ])('lists %s as a namespace and exposes no leaf of it', (_name, make) => {
    const service = new ConfigService({ app: make() } as never)

    expect(service.toJSON().namespaces).toEqual(['app'])
    expect(service.has('app.name' as never)).toBe(false)
    expect(service.has('app.length' as never)).toBe(false)
  })

  it('reads the own fields of a namespace that is an object, as the library builds it', () => {
    const service = new ConfigService({ app: { name: 'n' } } as never)

    expect(service.get('app.name' as never)).toBe('n')
  })

  it('reads the own field of a namespace that is a class instance', () => {
    class Holder {
      public readonly name = 'instance'
    }
    const service = new ConfigService({ app: new Holder() } as never)

    expect(service.has('app.name' as never)).toBe(true)
    expect(service.get('app.name' as never)).toBe('instance')
  })

  it('does not see a configuration that only a get trap answers, which lists nothing', () => {
    /** BYMAX_CONFIG must be a plain object with own fields: the snapshot is taken by listing them. */
    const service = new ConfigService(getOnly({ app: { name: 'n' } }) as never)

    expect(service.has('app.name' as never)).toBe(false)
    expect(service.toJSON().namespaces).toEqual([])
  })
})
