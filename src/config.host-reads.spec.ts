/**
 * Unit tests for the values the host supplies and the module reads.
 *
 * Layer: unit.
 * Goal: prove that code of the host which throws while a value is read (an accessor, a Proxy trap)
 * is refused with the library's own error, code and issue, with the host's error kept as the
 * non-enumerable `cause` and never surfacing raw, and that the source is read exactly once.
 * Mocks: none. The host's code is a getter or a Proxy written for the case.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const hostError = new Error('HOST RAW SECRET')

/** Runs `run` and returns what it threw, failing when it did not throw. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}

/** Asserts the refusal: the library error, one issue naming the step, the host's error as the cause. */
function expectRefusal(error: unknown, step: string): void {
  expect(error).toBeInstanceOf(BymaxConfigValidationError)
  const refusal = error as BymaxConfigValidationError
  expect(refusal.code).toBe(ConfigErrorCode.VALIDATION)
  expect(refusal.issues).toHaveLength(1)
  expect(refusal.issues[0]?.message).toBe(
    `${step} threw Error; its message is withheld because it can carry the value`
  )
  expect(refusal.cause).toBe(hostError)
  expect(refusal.message).not.toContain('HOST RAW SECRET')
  expect(Object.keys(refusal).sort()).toEqual(['code', 'issues'])
}

/** An object that throws the host error when the named property is read. */
function throwingOn(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.defineProperty({ schema, source: { APP_NAME: 'x' }, ...extra }, name, {
    enumerable: true,
    get: () => {
      throw hostError
    }
  })
}

describe('a host value that throws while the module reads it', () => {
  it.each(['schema', 'source', 'strict', 'onValidationError'])(
    'forRoot refuses a %s accessor that throws, with the host error as the cause',
    (name) => {
      /** The refusal comes from the call itself, before a module is built. */
      const error = thrownBy(() => BymaxConfigModule.forRoot(throwingOn(name) as never))

      expectRefusal(error, 'reading the options of forRoot')
    }
  )

  it('forRoot refuses an isGlobal accessor that throws', () => {
    const error = thrownBy(() => BymaxConfigModule.forRoot(throwingOn('isGlobal') as never))

    expectRefusal(error, 'reading isGlobal')
  })

  it('forRoot refuses options held by a Proxy whose get trap throws', () => {
    const held = new Proxy(
      {},
      {
        get: () => {
          throw hostError
        }
      }
    )

    expectRefusal(
      thrownBy(() => BymaxConfigModule.forRoot(held as never)),
      'reading the options of forRoot'
    )
  })

  it.each(['useFactory', 'useClass', 'useExisting', 'inject', 'imports', 'isGlobal'])(
    'forRootAsync refuses a %s accessor that throws',
    (name) => {
      const error = thrownBy(() => BymaxConfigModule.forRootAsync(throwingOn(name) as never))

      expectRefusal(error, 'reading the options of forRootAsync')
    }
  )

  it('forRootAsync refuses what its factory resolves when a property of it throws', async () => {
    /** The factory's result goes through the same guarded read as the options of forRoot. */
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => throwingOn('source') as never
    })
    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'useFactory') !== undefined
    )
    const factory = Reflect.get(provider as object, 'useFactory') as () => Promise<unknown>

    expectRefusal(
      await factory().catch((error: unknown) => error),
      'reading the options of forRootAsync'
    )
  })

  it.each(['schema', 'source', 'strict'])(
    'createValidatedConfig refuses a %s accessor that throws',
    (name) => {
      const error = thrownBy(() => createValidatedConfig(throwingOn(name) as never))

      expectRefusal(error, 'reading the options')
    }
  )

  it('createValidatedConfig refuses a source Proxy whose key listing throws', () => {
    const source = new Proxy(
      {},
      {
        ownKeys: () => {
          throw hostError
        }
      }
    )

    expectRefusal(
      thrownBy(() => createValidatedConfig({ schema, source })),
      'reading the source'
    )
  })

  it('createValidatedConfig refuses a source whose value accessor throws', () => {
    const source = Object.defineProperty({}, 'APP_NAME', {
      enumerable: true,
      get: () => {
        throw hostError
      }
    })

    expectRefusal(
      thrownBy(() => createValidatedConfig({ schema, source })),
      'reading the source'
    )
  })

  it('names no class when what was thrown is not an Error', () => {
    const error = thrownBy(() =>
      createValidatedConfig({
        schema,
        get source(): never {
          throw 'a plain string'
        }
      })
    ) as BymaxConfigValidationError

    expect(error.issues[0]?.message).toBe(
      'reading the options threw a value that is not an Error; the value is withheld because it can carry the value'
    )
    expect(error.cause).toBe('a plain string')
  })

  it('leaves a refusal of the validation itself unchanged', () => {
    /** A missing variable is the library's own error: not wrapped, with no cause. */
    const error = thrownBy(() => createValidatedConfig({ schema, source: {} }))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues[0]?.code).toBe(ConfigErrorCode.MISSING)
    expect((error as Error).cause).toBeUndefined()
  })
})

describe('createValidatedConfig reads the source once', () => {
  it('validates the value of the first read when a later read answers differently', () => {
    /** An accessor that answers a record once and nothing after: the first answer is the one validated. */
    let reads = 0
    const options = {
      schema,
      get source() {
        reads += 1
        return reads === 1 ? { APP_NAME: 'first' } : undefined
      }
    }
    const before = process.env['APP_NAME']
    process.env['APP_NAME'] = 'from-process-env'
    try {
      const root = createValidatedConfig(options as never)

      expect(root.app?.name).toBe('first')
      expect(reads).toBe(1)
    } finally {
      if (before === undefined) delete process.env['APP_NAME']
      else process.env['APP_NAME'] = before
    }
  })

  it('still refuses a source key that is present and undefined', () => {
    expect(() => createValidatedConfig({ schema, source: undefined } as never)).toThrow(TypeError)
  })

  it('reads each value of the source once', () => {
    /** The variable's getter is run once, so the value validated is the value read. */
    let reads = 0
    const source = Object.defineProperty({}, 'APP_NAME', {
      enumerable: true,
      get: () => {
        reads += 1
        return `read-${reads}`
      }
    })

    const root = createValidatedConfig({ schema, source })

    expect(root.app?.name).toBe('read-1')
    expect(reads).toBe(1)
  })
})
