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

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'

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

  it('invokes the hook once with the issues, then throws the validation error', () => {
    /**
     * Fail-fast with observability.
     *
     * On failure the hook receives the exact structured issue list once, and the
     * BymaxConfigValidationError still propagates: the hook observes, it does not
     * decide the outcome.
     */
    const hook = jest.fn()

    let thrown: unknown
    try {
      createValidatedConfig({ schema, source: {}, onValidationError: hook })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledWith((thrown as BymaxConfigValidationError).issues)
  })

  it('propagates the original error even when the hook throws', () => {
    /**
     * Hook cannot suppress or replace the failure.
     *
     * A throwing observability hook must not swallow, mask, or substitute the
     * validation error; the original BymaxConfigValidationError still reaches the
     * caller so a misconfigured process never boots.
     */
    const hook = jest.fn(() => {
      throw new Error('hook exploded')
    })

    let thrown: unknown
    try {
      createValidatedConfig({ schema, source: {}, onValidationError: hook })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    expect(hook).toHaveBeenCalledTimes(1)
  })

  it('propagates a non-validation error without invoking the hook', () => {
    /**
     * Non-validation failure bypasses observability.
     *
     * The hook exists to report validation issues; an unexpected error that is
     * not a BymaxConfigValidationError (here a schema transform that throws)
     * carries no issue list, so it must propagate untouched and leave the hook
     * uncalled.
     */
    const throwingSchema = defineEnv({
      server: z.object({
        port: z.string().transform(() => {
          throw new Error('transform failed')
        })
      })
    })
    const hook = jest.fn()

    let thrown: unknown
    try {
      createValidatedConfig({
        schema: throwingSchema,
        source: { SERVER_PORT: 'x' },
        onValidationError: hook
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(BymaxConfigValidationError)
    expect(hook).not.toHaveBeenCalled()
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
