/**
 * Unit tests for the options factory that `forRootAsync` wraps, when a built-in is replaced before it runs.
 *
 * Layer: unit.
 * Goal: prove that the wrapped factory checks the built-ins before it hands control to the host's factory,
 * so a replaced built-in refuses the call without the host's code having run.
 * Mocks: none. A built-in is replaced for one case and put back afterwards; the factory of the host is a
 * counter.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { isLibraryError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** The `useFactory` the module registers for the options token. */
function wrappedFactory(
  useFactory: () => { schema: typeof schema }
): (...args: unknown[]) => Promise<unknown> {
  const registered = BymaxConfigModule.forRootAsync({ useFactory, inject: [] })
  const provider = (registered.providers ?? []).find(
    (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
  )
  return Reflect.get(provider as object, 'useFactory') as (...args: unknown[]) => Promise<unknown>
}

describe('the wrapped options factory of forRootAsync', () => {
  it('refuses a replaced built-in before the factory of the host runs', async () => {
    /**
     * Scenario: a built-in the library calls is replaced after the module is built, and the wrapped
     * factory is then run.
     * Expectation: it rejects with the library's own error, and the factory of the host was never called.
     */
    let calls = 0
    const factory = wrappedFactory(() => {
      calls += 1
      return { schema }
    })
    const held = Object.getOwnPropertyDescriptor(globalThis, 'RangeError') as PropertyDescriptor
    Object.defineProperty(globalThis, 'RangeError', {
      ...held,
      value: new Proxy(RangeError, {})
    })
    let rejection: unknown
    try {
      await factory()
    } catch (thrown) {
      rejection = thrown
    } finally {
      Object.defineProperty(globalThis, 'RangeError', held)
    }

    expect(isLibraryError(rejection)).toBe(true)
    expect(calls).toBe(0)
  })

  it('runs the factory of the host when every built-in is intact', async () => {
    /**
     * Scenario: the same wrapped factory is run with nothing replaced.
     * Expectation: the factory of the host runs once and its options come back.
     */
    let calls = 0
    const factory = wrappedFactory(() => {
      calls += 1
      return { schema }
    })

    const options = (await factory()) as { schema: unknown }

    expect(calls).toBe(1)
    expect(options.schema).toBe(schema)
  })
})
