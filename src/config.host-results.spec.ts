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

  it('passes a library error thrown by the factory unchanged', async () => {
    const own = new BymaxConfigValidationError([
      { path: '', variable: '', code: ConfigErrorCode.INVALID, message: 'own' }
    ])
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => {
        throw own
      }
    })

    expect(await optionsRejection(registration)).toBe(own)
  })

  it('still reads the options of an ordinary factory result', async () => {
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: async () => ({ schema, source: { APP_NAME: 'x' }, extra: 'dropped' })
    })
    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'useFactory') !== undefined
    )
    const factory = Reflect.get(provider as object, 'useFactory') as () => Promise<object>

    const options = await factory()

    expect(Object.keys(options).sort()).toEqual(['schema', 'source'])
  })
})
