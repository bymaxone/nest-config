/**
 * Unit tests for the BYMAX_CONFIG provider factory.
 *
 * Layer: unit.
 * Goal: prove the factory validates once, freezes the output, defaults the
 * source to process.env while using a custom source verbatim, forwards the
 * strict flag, and enforces the fail-fast contract: the observability hook runs
 * exactly once before the throw and can never suppress or replace the error,
 * even when the hook itself throws.
 * Mocks: process.env is replaced with a controlled object and restored; the
 * real environment values are never mutated.
 */

import { z } from 'zod'

import type { BymaxConfigModuleOptions } from './config.options'
import { bymaxConfigProvider, createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { EnvSchema } from './types'

const schema = defineEnv({
  server: z.object({ port: z.coerce.number().int().min(1) })
})

/** Preserve the real environment reference so each test restores it verbatim. */
const realEnv = process.env

/**
 * Replace process.env with a controlled record for one test.
 *
 * Reassigns the reference rather than mutating the real environment, so the
 * original values are untouched and restored in afterEach.
 *
 * @param values - The stubbed environment record.
 */
function stubProcessEnv(values: Record<string, string | undefined>): void {
  process.env = values as NodeJS.ProcessEnv
}

afterEach(() => {
  process.env = realEnv
})

describe('createValidatedConfig', () => {
  it('returns a deep-frozen validated config on success', () => {
    /**
     * Success path immutability.
     *
     * A valid source must yield the coerced, typed config deep-frozen so no
     * consumer can mutate configuration after bootstrap; a write to a leaf
     * throws under strict mode.
     */
    const config = createValidatedConfig({ schema, source: { SERVER_PORT: '3000' } })

    expect(config.server.port).toBe(3000)
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.server)).toBe(true)
    expect(() => {
      ;(config.server as { port: number }).port = 1
    }).toThrow(TypeError)
  })

  it('uses a custom source verbatim in preference to process.env', () => {
    /**
     * Custom source precedence.
     *
     * When a source is supplied it is authoritative; process.env must not shadow
     * or override it, so a conflicting environment value is ignored.
     */
    stubProcessEnv({ SERVER_PORT: '9999' })

    const config = createValidatedConfig({ schema, source: { SERVER_PORT: '3000' } })

    expect(config.server.port).toBe(3000)
  })

  it('does not merge process.env into a custom source', () => {
    /**
     * No env fallback merge.
     *
     * A custom source is used exactly as given: a key present only in
     * process.env must not backfill a missing leaf, so validation fails rather
     * than silently borrowing the environment value.
     */
    stubProcessEnv({ SERVER_PORT: '3000' })

    expect(() => createValidatedConfig({ schema, source: {} })).toThrow(BymaxConfigValidationError)
  })

  it('defaults the source to process.env when none is supplied', () => {
    /**
     * Default source.
     *
     * Omitting source falls back to process.env, the standard bootstrap case;
     * the stubbed environment drives the parsed result.
     */
    stubProcessEnv({ SERVER_PORT: '7000' })

    const config = createValidatedConfig({ schema })

    expect(config.server.port).toBe(7000)
  })

  it('forwards the strict flag into the validator', () => {
    /**
     * Strict flag propagation.
     *
     * With strict enabled, a prefixed variable that matches no declared leaf is
     * an unknown-key violation; without it the same source is accepted. This
     * proves the option reaches the validator instead of being dropped.
     */
    const source = { SERVER_PORT: '3000', SERVER_DEBUG: 'on' }

    let thrown: unknown
    try {
      createValidatedConfig({ schema, source, strict: true })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    expect(
      (thrown as BymaxConfigValidationError).issues.some(
        (issue) => issue.code === ConfigErrorCode.UNKNOWN_KEY
      )
    ).toBe(true)
    expect(createValidatedConfig({ schema, source }).server.port).toBe(3000)
  })
})

/** The factory the module registers for BYMAX_CONFIG, typed for a direct call. */
const provide = bymaxConfigProvider.useFactory as (
  options: BymaxConfigModuleOptions
) => Promise<unknown>

/** The error a failing provider rejects with, or the test fails. */
async function rejection(options: BymaxConfigModuleOptions): Promise<BymaxConfigValidationError> {
  try {
    await provide(options)
  } catch (error) {
    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    return error as BymaxConfigValidationError
  }
  throw new Error('the provider was expected to reject')
}

describe('the BYMAX_CONFIG provider factory and the validation hook', () => {
  it('resolves with the frozen config and never calls the hook on success', async () => {
    /** The hook is for failures only. */
    const hook = jest.fn()

    const config = (await provide({
      schema,
      source: { SERVER_PORT: '8080' },
      onValidationError: hook
    })) as { server: { port: number } }

    expect(config.server.port).toBe(8080)
    expect(Object.isFrozen(config)).toBe(true)
    expect(hook).not.toHaveBeenCalled()
  })

  it('invokes the hook once with the issues, then rejects with the validation error', async () => {
    /**
     * Fail-fast with observability.
     *
     * On failure the hook receives the exact structured issue list once, and the
     * BymaxConfigValidationError still reaches the caller: the hook observes, it does not
     * decide the outcome.
     */
    const hook = jest.fn()

    const error = await rejection({ schema, source: {}, onValidationError: hook })

    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledWith(error.issues)
    expect(error.cause).toBeUndefined()
  })

  it('waits for an asynchronous hook to finish before the boot fails', async () => {
    /**
     * The hook's work belongs to the boot path. An asynchronous hook that ships the
     * issues to a log sink is awaited, so the process does not go on to fail, and exit,
     * while the report is still in flight.
     */
    const order: string[] = []
    const hook = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('hook finished')
    })

    const pending = rejection({ schema, source: {}, onValidationError: hook })
    void pending.then(() => order.push('boot failed'))
    await pending

    expect(order).toEqual(['hook finished', 'boot failed'])
  })

  it('keeps the validation error and records a rejecting hook as its cause', async () => {
    /**
     * A hook that rejects leaves no unhandled rejection behind. The boot fails with the
     * original validation error, unchanged in class, code, issues and message, and the
     * hook's error is attached as its `cause`, a non-enumerable property so that `code`
     * and `issues` stay the only own enumerable ones.
     */
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    const hookError = new Error('hook exploded')
    const control = await rejection({ schema, source: {} })

    try {
      const error = await rejection({
        schema,
        source: {},
        onValidationError: async () => {
          throw hookError
        }
      })
      await new Promise((resolve) => setImmediate(resolve))

      expect(error.cause).toBe(hookError)
      expect(Object.getOwnPropertyDescriptor(error, 'cause')).toEqual({
        value: hookError,
        writable: false,
        enumerable: false,
        configurable: false
      })
      expect(error.message).toBe(control.message)
      expect(error.issues).toEqual(control.issues)
      expect(error.code).toBe(ConfigErrorCode.VALIDATION)
      expect(Object.keys(error).sort()).toEqual(['code', 'issues'])
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('records a synchronously throwing hook as the cause as well', async () => {
    /** Same contract for a hook that throws before returning, with any thrown value. */
    const error = await rejection({
      schema,
      source: {},
      onValidationError: () => {
        throw 'plain string'
      }
    })

    expect(error.cause).toBe('plain string')
  })

  it('propagates a non-validation error without invoking the hook', async () => {
    /**
     * Non-validation failure bypasses observability.
     *
     * The hook exists to report validation issues; an unexpected error that is not a
     * BymaxConfigValidationError (here a schema transform that throws) carries no issue
     * list, so it must propagate untouched and leave the hook uncalled.
     */
    const throwingSchema = defineEnv({
      server: z.object({
        port: z.string().transform(() => {
          throw new Error('transform failed')
        })
      })
    })
    const hook = jest.fn()

    const outcome = provide({
      schema: throwingSchema as EnvSchema,
      source: { SERVER_PORT: 'x' },
      onValidationError: hook
    })

    await expect(outcome).rejects.toThrow('transform failed')
    await expect(outcome).rejects.not.toBeInstanceOf(BymaxConfigValidationError)
    expect(hook).not.toHaveBeenCalled()
  })
})
