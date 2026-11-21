/**
 * Unit tests for the schema and the factory results the host supplies.
 *
 * Layer: unit.
 * Goal: prove that code of the host which runs while the schema is read (a Proxy, a getter, a
 * metadata call) or while an options factory's result is awaited (a Proxy trap, a revoked Proxy, a
 * `then` getter) is refused with the library's own error, one withheld issue, and the host's error
 * as the non-enumerable `cause`, and never surfaces raw.
 * Mocks: none. The host's code is a Proxy or a getter written for the case.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { bymaxConfigProvider, createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { configTestingModule } from './testing/config-testing.module'
import { ConfigService } from './config.service'
import { createTestConfig } from './testing/create-test-config'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const hostError = new Error('HOST RAW SECRET')

/** A Proxy over `target` that throws the host error on any property read. */
function throwingProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get: () => {
      throw hostError
    }
  })
}

/** A Proxy over `target` that has been revoked, so any use throws the engine's TypeError. */
function revokedProxy<T extends object>(target: T): T {
  const { proxy, revoke } = Proxy.revocable(target, {})
  revoke()
  return proxy
}

/** The refusal expected, with the cause checked by the caller. */
function expectRefusal(error: unknown, step: string): BymaxConfigValidationError {
  expect(error).toBeInstanceOf(BymaxConfigValidationError)
  const refusal = error as BymaxConfigValidationError
  expect(refusal.code).toBe(ConfigErrorCode.VALIDATION)
  expect(refusal.issues).toHaveLength(1)
  expect(refusal.issues[0]?.message).toMatch(
    new RegExp(`^${step} threw \\w+; its message is withheld because it can carry the value$`)
  )
  expect(refusal.message).not.toContain('HOST RAW SECRET')
  expect(Object.keys(refusal).sort()).toEqual(['code', 'issues'])
  return refusal
}

/** What `run` threw, or fails when it did not throw. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}

/** What the options provider's factory of a registration rejects with for the given arguments. */
async function optionsRejection(
  registration: ReturnType<typeof BymaxConfigModule.forRootAsync>,
  ...args: unknown[]
): Promise<unknown> {
  const provider = (registration.providers ?? []).find(
    (candidate) => Reflect.get(candidate, 'useFactory') !== undefined
  )
  const factory = Reflect.get(provider as object, 'useFactory') as (
    ...args: unknown[]
  ) => Promise<unknown>
  return factory(...args).then(
    () => {
      throw new Error('the options provider was expected to reject')
    },
    (error: unknown) => error
  )
}

describe('a schema whose reading runs host code that throws', () => {
  const broken = (shape: () => unknown) =>
    Object.defineProperty(defineEnv({ app: z.object({ name: z.string() }) }), 'shape', {
      get: shape
    })

  it.each([
    ['a Proxy whose get trap throws', () => throwingProxy(schema)],
    [
      'a schema whose shape getter throws',
      () =>
        broken(() => {
          throw hostError
        })
    ]
  ])('createValidatedConfig refuses %s', (_name, make) => {
    const refusal = expectRefusal(
      thrownBy(() => createValidatedConfig({ schema: make() as never, source: {} })),
      'reading the schema'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it('createValidatedConfig refuses a revoked Proxy as a schema', () => {
    const refusal = expectRefusal(
      thrownBy(() => createValidatedConfig({ schema: revokedProxy(schema), source: {} })),
      'reading the schema'
    )

    expect(refusal.cause).toBeInstanceOf(TypeError)
  })

  it('refuses a namespace whose shape getter throws', () => {
    const namespace = z.object({ name: z.string() })
    Object.defineProperty(namespace, 'shape', {
      get: () => {
        throw hostError
      }
    })

    const refusal = expectRefusal(
      thrownBy(() => createValidatedConfig({ schema: defineEnv({ app: namespace }), source: {} })),
      'reading the schema'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it('refuses a leaf whose metadata cannot be read', () => {
    const leaf = z.string()
    Object.defineProperty(leaf, 'meta', {
      value: () => {
        throw hostError
      }
    })

    const refusal = expectRefusal(
      thrownBy(() =>
        createValidatedConfig({ schema: defineEnv({ app: z.object({ name: leaf }) }), source: {} })
      ),
      'reading the schema'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it('refuses it at boot through forRoot as well, with the hook called once', async () => {
    const factory = bymaxConfigProvider.useFactory as (options: unknown) => Promise<unknown>
    const hook = jest.fn()

    const error = await factory({
      schema: throwingProxy(schema),
      source: {},
      onValidationError: hook
    }).catch((rejected: unknown) => rejected)

    expect(expectRefusal(error, 'reading the schema').cause).toBe(hostError)
    expect(hook).toHaveBeenCalledTimes(1)
  })

  it('leaves the library own refusals of a schema unchanged', () => {
    const flat = { shape: { app: z.string() } }
    const error = thrownBy(() => createValidatedConfig({ schema: flat as never, source: {} }))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues[0]?.message).toContain('is not a namespace')
    expect((error as Error).cause).toBeUndefined()
  })
})

describe('an options factory whose result runs host code that throws', () => {
  const result = () => ({ schema, source: { APP_NAME: 'x' } })
  const results: ReadonlyArray<readonly [string, () => object, 'host' | 'engine']> = [
    ['a Proxy whose get trap throws', () => throwingProxy(result()), 'host'],
    ['a revoked Proxy', () => revokedProxy(result()), 'engine'],
    [
      'an object whose then getter throws',
      () =>
        Object.defineProperty(result(), 'then', {
          get: () => {
            throw hostError
          }
        }),
      'host'
    ]
  ]
  const returns: ReadonlyArray<readonly [string, (value: object) => () => unknown]> = [
    ['a synchronous factory', (value) => () => value],
    ['an asynchronous factory', (value) => async () => value],
    ['a factory returning a promise', (value) => () => Promise.resolve(value)]
  ]

  describe.each(results)('%s', (_label, make, cause) => {
    it.each(returns)('is refused from %s', async (_name, wrap) => {
      const registration = BymaxConfigModule.forRootAsync({ useFactory: wrap(make()) as never })

      const refusal = expectRefusal(
        await optionsRejection(registration),
        'reading what the options factory returned'
      )

      if (cause === 'host') expect(refusal.cause).toBe(hostError)
      else expect(refusal.cause).toBeInstanceOf(TypeError)
    })

    it('is refused from the create method of a useClass provider', async () => {
      class Factory {
        public create(): object {
          return make()
        }
      }
      const registration = BymaxConfigModule.forRootAsync({ useClass: Factory as never })

      const refusal = expectRefusal(
        await optionsRejection(registration, new Factory()),
        'reading what the options factory returned'
      )

      if (cause === 'host') expect(refusal.cause).toBe(hostError)
      else expect(refusal.cause).toBeInstanceOf(TypeError)
    })
  })

  it('refuses a factory that rejects, with its error as the cause', async () => {
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: async () => {
        throw hostError
      }
    })

    const refusal = expectRefusal(
      await optionsRejection(registration),
      'reading what the options factory returned'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it.each([
    [
      'throws',
      (value: object) => () => {
        throw value
      }
    ],
    [
      'rejects with',
      (value: object) => async () => {
        throw value
      }
    ]
  ])('refuses a factory that %s a value whose prototype lookup throws', async (_name, wrap) => {
    const thrown = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('HOST RAW SECRET')
        }
      }
    )
    const registration = BymaxConfigModule.forRootAsync({ useFactory: wrap(thrown) as never })

    const error = await optionsRejection(registration)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues[0]?.message).toMatch(
      /threw a value that is not an Error; the value is withheld/
    )
    expect((error as BymaxConfigValidationError).message).not.toContain('HOST RAW SECRET')
    expect((error as BymaxConfigValidationError).cause).toBe(thrown)
  })

  it('refuses a validation error the host built itself, with that error as the cause', async () => {
    /** The class is public: an error of it that the host throws is the host's, not the library's. */
    const own = new BymaxConfigValidationError([
      { path: '', variable: '', code: ConfigErrorCode.INVALID, message: 'own' }
    ])
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => {
        throw own
      }
    })

    const refusal = expectRefusal(
      await optionsRejection(registration),
      'reading what the options factory returned'
    )

    expect(refusal).not.toBe(own)
    expect(refusal.cause).toBe(own)
    expect(refusal.issues[0]?.message).not.toContain('own')
  })

  it('passes unchanged an error the library itself raised inside the factory', async () => {
    /** A factory that validates something with the library's own function throws the library's error. */
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => createValidatedConfig({ schema, source: {} }) as never
    })

    const error = await optionsRejection(registration)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues[0]?.code).toBe(ConfigErrorCode.MISSING)
    expect((error as Error).cause).toBeUndefined()
  })

  it('still reads the options of an ordinary factory result', async () => {
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: async () => ({ schema, source: { APP_NAME: 'x' } })
    })
    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'useFactory') !== undefined
    )
    const factory = Reflect.get(provider as object, 'useFactory') as () => Promise<object>

    const options = await factory()

    expect(Object.keys(options).sort()).toEqual(['schema', 'source'])
  })
})

describe('an answer of the schema that runs host code which throws', () => {
  const base = defineEnv({ app: z.object({ mode: z.enum(['a', 'b']).default('a') }) })
  const answering = (answer: () => unknown) =>
    new Proxy(base, {
      get: (target, key) => (key === 'safeParse' ? answer : Reflect.get(target, key, target))
    }) as never
  const boom = () => {
    throw hostError
  }

  it.each([
    [
      'a success getter',
      () => ({
        get success(): never {
          return boom()
        }
      })
    ],
    [
      'an error getter',
      () => ({
        success: false,
        get error(): never {
          return boom()
        }
      })
    ],
    [
      'an issues getter',
      () => ({
        success: false,
        error: {
          get issues(): never {
            return boom()
          }
        }
      })
    ]
  ])('createValidatedConfig refuses a result with %s that throws', (_name, answer) => {
    const refusal = expectRefusal(
      thrownBy(() => createValidatedConfig({ schema: answering(answer), source: {} })),
      'reading the schema'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it('refuses a schema value whose text conversion throws while the constraint is described', () => {
    const literal = defineEnv({
      app: z.object({ mode: z.literal({ toString: boom } as never) })
    })

    const refusal = expectRefusal(
      thrownBy(() => createValidatedConfig({ schema: literal, source: { APP_MODE: 'x' } })),
      'reading the schema'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it('refuses an authored message that is not text', () => {
    const refined = defineEnv({
      app: z.object({ v: z.string().refine(() => false, { message: { replace: boom } as never }) })
    })

    const refusal = expectRefusal(
      thrownBy(() => createValidatedConfig({ schema: refined, source: { APP_V: 'x' } })),
      'reading the schema'
    )

    expect(refusal.cause).toBeInstanceOf(Error)
  })

  it('reports it to the hook once even when what was thrown has a prototype lookup that throws', async () => {
    const thrown = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('HOST RAW SECRET')
        }
      }
    )
    const factory = bymaxConfigProvider.useFactory as (options: unknown) => Promise<unknown>
    const hook = jest.fn()

    const error = await factory({
      schema: answering(() => {
        throw thrown
      }),
      source: {},
      onValidationError: hook
    }).catch((rejected: unknown) => rejected)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).message).not.toContain('HOST RAW SECRET')
    expect(hook).toHaveBeenCalledTimes(1)
  })
})

describe('the test helpers when the schema or the overrides run host code that throws', () => {
  const broken = () =>
    Object.defineProperty(defineEnv({ app: z.object({ name: z.string() }) }), 'shape', {
      get: () => {
        throw hostError
      }
    })

  it.each([
    ['a Proxy schema whose get trap throws', () => throwingProxy(schema)],
    ['a schema whose shape getter throws', broken]
  ])('createTestConfig and configTestingModule refuse %s', (_name, make) => {
    for (const run of [
      () => createTestConfig(make() as never),
      () => configTestingModule(make() as never)
    ]) {
      const refusal = expectRefusal(thrownBy(run), 'reading the schema or the overrides')

      expect(refusal.cause).toBe(hostError)
    }
  })

  it('refuses a revoked Proxy as the schema', () => {
    const refusal = expectRefusal(
      thrownBy(() => createTestConfig(revokedProxy(schema))),
      'reading the schema or the overrides'
    )

    expect(refusal.cause).toBeInstanceOf(TypeError)
  })

  it('refuses overrides held by a Proxy whose key listing throws', () => {
    const overrides = new Proxy(
      {},
      {
        ownKeys: () => {
          throw hostError
        }
      }
    )

    const refusal = expectRefusal(
      thrownBy(() => createTestConfig(schema, overrides as never)),
      'reading the schema or the overrides'
    )

    expect(refusal.cause).toBe(hostError)
  })

  it('leaves the refusals of the helper itself unchanged', () => {
    const error = thrownBy(() => createTestConfig(schema, { ghost: { x: '1' } } as never))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues[0]?.code).toBe(ConfigErrorCode.UNKNOWN_KEY)
    expect((error as Error).cause).toBeUndefined()
  })
})

describe('ConfigService over a configuration whose reading runs host code that throws', () => {
  const config = { app: { name: 'x' } }

  it.each([
    ['a Proxy whose get trap throws', () => throwingProxy(config)],
    [
      'a Proxy whose key listing throws',
      () =>
        new Proxy(config, {
          ownKeys: () => {
            throw hostError
          }
        })
    ],
    ['a namespace held by a Proxy that throws', () => ({ app: throwingProxy({ name: 'x' }) })],
    ['a revoked Proxy', () => revokedProxy(config)]
  ])('refuses %s when it is built', (_name, make) => {
    const refusal = expectRefusal(
      thrownBy(() => new ConfigService(make() as never)),
      'reading the configuration'
    )

    expect(refusal.cause).toBeDefined()
  })

  it('serializes the namespaces it read when it was built, whatever the configuration does later', () => {
    /** The service reads the configuration once, so a later change of the host's object cannot reach the caller. */
    let armed = false
    const late = new Proxy(config, {
      ownKeys: (target) => {
        if (armed) throw hostError
        return Reflect.ownKeys(target)
      }
    })
    const service = new ConfigService(late as never)
    armed = true

    expect(service.toJSON().namespaces).toEqual(['app'])
  })

  it('still answers from an ordinary configuration', () => {
    const service = new ConfigService(config as never)

    expect(service.get('app.name' as never)).toBe('x')
    expect(service.has('app.name' as never)).toBe(true)
    expect(service.getAll()).toBe(config)
    expect(service.toJSON()).toEqual({ service: 'ConfigService', namespaces: ['app'] })
  })
})

describe('an unknown override key of the test helpers', () => {
  it('is reported escaped and bounded, and its value is not echoed', () => {
    const key = 'K'.repeat(300) + '\u001b[31m'
    const value = 'SECRET-VALUE-9999'

    const error = thrownBy(() => createTestConfig(schema, { app: { [key]: value } } as never))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    const refusal = error as BymaxConfigValidationError
    expect(refusal.issues[0]?.path.length).toBeLessThanOrEqual(201)
    expect(refusal.issues[0]?.path.endsWith('…')).toBe(true)
    expect(refusal.message).not.toContain(value)
    expect(refusal.message).not.toContain('\u001b')
  })

  it('has its control characters written as escapes', () => {
    const error = thrownBy(() =>
      createTestConfig(schema, { app: { 'bad\u001bkey': 'v' } } as never)
    )

    expect((error as BymaxConfigValidationError).issues[0]?.path).toBe('app.bad\\u001bkey')
  })
})

describe('a getter that throws a validation error the host built', () => {
  const own = new BymaxConfigValidationError([
    { path: 'host', variable: 'HOST', code: ConfigErrorCode.INVALID, message: 'host issue' }
  ])

  it.each([
    [
      'an option of forRoot',
      () =>
        BymaxConfigModule.forRoot({
          get schema(): never {
            throw own
          },
          source: {}
        } as never)
    ],
    [
      'the source of createValidatedConfig',
      () =>
        createValidatedConfig({
          schema,
          get source(): never {
            throw own
          }
        } as never)
    ],
    [
      'a configuration given to ConfigService',
      () =>
        new ConfigService({
          get app(): never {
            throw own
          }
        } as never)
    ]
  ])('ends as the withheld refusal with the cause, from %s', (_name, run) => {
    const error = thrownBy(run)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect(error).not.toBe(own)
    expect((error as BymaxConfigValidationError).issues[0]?.message).toMatch(
      /threw BymaxConfigValidationError; its message is withheld/
    )
    expect((error as BymaxConfigValidationError).message).not.toContain('host issue')
    expect((error as Error).cause).toBe(own)
  })
})

describe('ConfigService over a validated configuration', () => {
  it('holds every leaf the validation produced, none of them hidden from a key listing', () => {
    /** The service lists keys, so a leaf the validation made non-enumerable would vanish; none is. */
    const full = defineEnv({
      app: z.object({ name: z.string(), mode: z.enum(['a', 'b']).default('a') }),
      db: z.object({ port: z.coerce.number().int().default(5432), tags: z.string().default('x') })
    })
    const config = createValidatedConfig({ schema: full, source: { APP_NAME: 'n' } })
    const service = new ConfigService(config as never)

    for (const [namespace, leaves] of Object.entries(config)) {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(leaves))) {
        expect(descriptor.enumerable).toBe(true)
      }
      for (const [leaf, value] of Object.entries(leaves as Record<string, unknown>)) {
        expect(service.get(`${namespace}.${leaf}` as never)).toBe(value)
      }
    }
    expect(Object.keys(config)).toEqual(['app', 'db'])
  })
})
