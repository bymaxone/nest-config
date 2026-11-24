/**
 * Unit tests for options whose `then` is an accessor that answers something that is not a function.
 *
 * Layer: unit.
 * Goal: prove that an accessor `then` is refused for the function it answers and for nothing else, so
 * an answer that leaves nothing to follow is not read as a thenable.
 * Mocks: none. The options factory is written for each case and Nest's own injector awaits are imitated by
 * awaiting the factory result.
 */

import { z } from 'zod'

import { tagged } from './captured'
import { BymaxConfigModule } from './config.module'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string() }) })

/** Lets the runner's own await of the row's promise settle before the case builds its options. */
async function settled(): Promise<void> {
  await Promise.resolve()
}

/** A factory that returns whatever the case needs, typed as the module takes it. */
function returning(
  useFactory: () => unknown
): Parameters<typeof BymaxConfigModule.forRootAsync>[0] {
  return { useFactory: useFactory as () => never }
}

/** Awaits what `call` returns the way Nest's injector awaits a factory result, and reports the outcome. */
async function outcomeOf(call: () => unknown): Promise<unknown> {
  try {
    return { resolved: await call() }
  } catch (error) {
    return { rejected: error }
  }
}

/** The factory of the provider that has `token`, from a registration the module produced. */
function factoryOf(providers: readonly unknown[], token: unknown): (...args: unknown[]) => unknown {
  const found = providers.find((provider) => Reflect.get(provider as object, 'provide') === token)
  return Reflect.get(found as object, 'useFactory') as (...args: unknown[]) => unknown
}

describe('options whose then accessor answers with something that is not a function', () => {
  it('is not refused for the answer of an own then accessor that is not a function', async () => {
    /**
     * Scenario: the factory returns options with an own accessor named then that answers undefined, so
     * there is no function to follow.
     * Expectation: the result is refused only for the unknown option `then` itself, never with the
     * data-property cause that a function answer gets.
     */
    await settled()
    const factory = factoryOf(
      BymaxConfigModule.forRootAsync(
        returning(() => ({
          schema,
          source: {},
          get then() {
            return undefined
          }
        }))
      ).providers ?? [],
      BYMAX_CONFIG_OPTIONS
    )

    const outcome = (await tagged(outcomeOf(factory))) as { rejected?: BymaxConfigValidationError }

    expect(outcome.rejected).toBeInstanceOf(BymaxConfigValidationError)
    expect(outcome.rejected?.cause).toBeUndefined()
  })

  it('keeps the options of a class whose prototype getter named then answers with a number', async () => {
    /**
     * Scenario: the factory returns an instance of a class whose prototype declares `get then()` answering
     * a number, so there is no function to follow.
     * Expectation: the options reach the provider as the factory built them, with no refusal.
     */
    await settled()
    const real = { APP_NAME: 'real' }
    class Options {
      schema = schema
      source = real
      get then() {
        return 1
      }
    }
    const factory = factoryOf(
      BymaxConfigModule.forRootAsync(returning(() => new Options())).providers ?? [],
      BYMAX_CONFIG_OPTIONS
    )

    const outcome = (await tagged(outcomeOf(factory))) as {
      resolved?: { source?: unknown }
      rejected?: unknown
    }

    expect(outcome.rejected).toBeUndefined()
    expect(outcome.resolved?.source).toEqual(real)
  })
})
