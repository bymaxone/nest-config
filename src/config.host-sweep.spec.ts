/**
 * Unit tests that sweep every operation the library performs on the host's objects.
 *
 * Layer: unit.
 * Goal: prove that wherever the library runs host code (a property read, a key listing, a call) a throw
 * there is refused with the library's error and never reaches the caller raw. The host's object is
 * wrapped so that its Nth operation throws; the sweep runs N from 1 up to the number of operations the
 * call performs, so no read is skipped by a hand-written case list.
 * Mocks: none. The wrappers are Proxies written for the sweep.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'
import { configTestingModule } from './testing/config-testing.module'
import { createTestConfig } from './testing/create-test-config'

const hostError = new Error('HOST RAW SECRET')

/** Counts the operations on a wrapped object and throws on the one numbered `failAt`. */
class Ticker {
  public count = 0

  public constructor(private readonly failAt: number) {}

  public tick(): void {
    this.count += 1
    if (this.count === this.failAt) throw hostError
  }
}

/** Wraps an object, and every object read from it, so each operation on them ticks. */
function hostile<T extends object>(target: T, ticker: Ticker): T {
  const wrap = (value: unknown): unknown =>
    (typeof value === 'object' && value !== null) || typeof value === 'function'
      ? hostile(value as object, ticker)
      : value
  return new Proxy(target, {
    get: (object, key) => {
      ticker.tick()
      return wrap(Reflect.get(object, key, object))
    },
    has: (object, key) => {
      ticker.tick()
      return Reflect.has(object, key)
    },
    ownKeys: (object) => {
      ticker.tick()
      return Reflect.ownKeys(object)
    },
    getOwnPropertyDescriptor: (object, key) => {
      ticker.tick()
      return Reflect.getOwnPropertyDescriptor(object, key)
    },
    apply: (object, thisArg, args) => {
      ticker.tick()
      return Reflect.apply(object as never, thisArg, args)
    }
  })
}

/**
 * Runs `call` with the host's object failing at operation 1, 2, 3 and so on, until the call performs
 * fewer operations than the failing one. Returns what each run threw, or `undefined` for a run that
 * finished without throwing.
 */
async function sweep(
  make: (ticker: Ticker) => () => unknown
): Promise<ReadonlyArray<{ readonly at: number; readonly threw: unknown }>> {
  const outcomes: Array<{ at: number; threw: unknown }> = []
  for (let at = 1; at <= 400; at += 1) {
    const ticker = new Ticker(at)
    let threw: unknown
    try {
      await make(ticker)()
    } catch (error) {
      threw = error
    }
    if (ticker.count < at) break
    outcomes.push({ at, threw })
  }
  return outcomes
}

/** Asserts that no run let the host's error out raw, and that the sweep reached some operations. */
function expectNothingRaw(
  outcomes: ReadonlyArray<{ readonly at: number; readonly threw: unknown }>
): void {
  expect(outcomes.length).toBeGreaterThan(3)
  const raw = outcomes.filter(
    ({ threw }) => threw !== undefined && !(threw instanceof BymaxConfigValidationError)
  )
  expect(raw.map(({ at }) => at)).toEqual([])
}

const schema = defineEnv({
  app: z.object({ name: z.string(), mode: z.enum(['a', 'b']).default('a') }),
  db: z.object({ port: z.coerce.number().int().min(1).meta({ env: 'DB_PORT_X' }) })
})
const source = { APP_NAME: 'x', DB_PORT_X: '5' }

describe('every operation on the host object is guarded', () => {
  it('createValidatedConfig reads the schema', async () => {
    expectNothingRaw(
      await sweep(
        (ticker) => () => createValidatedConfig({ schema: hostile(schema, ticker), source })
      )
    )
  })

  it('createValidatedConfig reads a failing source', async () => {
    expectNothingRaw(
      await sweep(
        (ticker) => () =>
          createValidatedConfig({
            schema,
            source: hostile({ APP_NAME: 'x', DB_PORT_X: '5', APP_OTHER: 'z' }, ticker),
            strict: true
          })
      )
    )
  })

  it('createValidatedConfig reads its options', async () => {
    expectNothingRaw(
      await sweep((ticker) => () => createValidatedConfig(hostile({ schema, source }, ticker)))
    )
  })

  it('forRoot reads its options', async () => {
    expectNothingRaw(
      await sweep(
        (ticker) => () =>
          BymaxConfigModule.forRoot(hostile({ schema, source, isGlobal: false }, ticker))
      )
    )
  })

  it('forRootAsync reads its options and what its factory returns', async () => {
    expectNothingRaw(
      await sweep((ticker) => async () => {
        const registration = BymaxConfigModule.forRootAsync(
          hostile({ useFactory: () => ({ schema, source }), isGlobal: false }, ticker) as never
        )
        const provider = (registration.providers ?? []).find(
          (candidate) => Reflect.get(candidate, 'useFactory') !== undefined
        )
        const factory = Reflect.get(provider as object, 'useFactory') as () => Promise<unknown>
        await factory()
      })
    )
  })

  it('createTestConfig reads the schema and the overrides', async () => {
    expectNothingRaw(
      await sweep(
        (ticker) => () =>
          createTestConfig(
            hostile(schema, ticker),
            hostile({ app: { name: 'y' } }, ticker) as never
          )
      )
    )
  })

  it('configTestingModule reads the schema', async () => {
    expectNothingRaw(await sweep((ticker) => () => configTestingModule(hostile(schema, ticker))))
  })
})
