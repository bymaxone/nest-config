/**
 * Unit tests for createTestConfig.
 *
 * Layer: utility.
 * Goal: prove the builder synthesizes a valid source, applies nested partial
 * overrides onto only the targeted leaves, runs the exact production pipeline
 * (validate then deep-freeze), and returns the typed frozen configuration. A
 * constraint-violating override must throw the production validation error, and
 * the returned object must reject mutation.
 * Mocks: none. No process environment is read; the source is fully synthesized.
 */

import { z } from 'zod'

import { defineEnv } from '../define-env'
import { BymaxConfigValidationError } from '../errors'
import { createTestConfig } from './create-test-config'

/** A representative multi-namespace schema with a default and constraints. */
const schema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    env: z.enum(['development', 'test', 'production'])
  }),
  database: z.object({
    url: z.url()
  }),
  auth: z.object({
    secret: z.string().min(32)
  })
})

describe('createTestConfig', () => {
  it('returns a frozen config that passes the production validator', () => {
    // Scenario: with no overrides the synthesized source validates, the default
    // is applied, and the result is frozen.
    const config = createTestConfig(schema)
    expect(config.server.port).toBe(3000)
    expect(config.server.env).toBe('development')
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('applies a nested override to only the targeted leaf', () => {
    // Scenario: overriding one leaf replaces exactly that leaf and leaves the
    // rest of the synthesized/defaulted configuration untouched.
    const config = createTestConfig(schema, {
      database: { url: 'postgres://localhost:5432/test' }
    })
    expect(config.database.url).toBe('postgres://localhost:5432/test')
    expect(config.server.port).toBe(3000)
    expect(config.auth.secret.length).toBeGreaterThanOrEqual(32)
  })

  it('overrides a defaulted leaf when a value is supplied', () => {
    // Scenario: a leaf that declares a default can still be pinned to a specific
    // value for the test.
    const config = createTestConfig(schema, { server: { port: 8080 } })
    expect(config.server.port).toBe(8080)
  })

  it('throws BymaxConfigValidationError when an override violates a constraint', () => {
    // Scenario: constraint enforcement is not weakened, so an invalid override
    // fails through the exact production error path.
    expect(() => createTestConfig(schema, { auth: { secret: 'too-short' } })).toThrow(
      BymaxConfigValidationError
    )
  })

  it('produces a deep-frozen result whose nested mutation throws', () => {
    // Scenario: the returned config is immutable at every level, matching the
    // production deep-freeze guarantee.
    const config = createTestConfig(schema)
    expect(() => {
      ;(config.database as { url: string }).url = 'mutated'
    }).toThrow(TypeError)
  })
})

describe('createTestConfig when no placeholder can satisfy a leaf', () => {
  const unsynthesizable = defineEnv({
    server: z.object({ port: z.coerce.number().int().min(1).max(65535).default(3000) }),
    region: z.object({ code: z.string().regex(/^[A-Z]{3}$/) }),
    billing: z.object({ key: z.string().refine((value) => value.startsWith('sk_')) })
  })

  /** What createTestConfig throws for the schema, or the test fails. */
  function failure(
    overrides?: Parameters<typeof createTestConfig<typeof unsynthesizable.shape>>[1]
  ) {
    try {
      createTestConfig(unsynthesizable, overrides)
    } catch (error) {
      expect(error).toBeInstanceOf(BymaxConfigValidationError)
      return error as BymaxConfigValidationError
    }
    throw new Error('createTestConfig was expected to throw')
  }

  it('names each leaf that needs an override, in the validation error', () => {
    /**
     * A regex or a refine rule is a constraint no sample can be known to satisfy. The
     * failure says that no placeholder fits and names the leaf to override, as a
     * BymaxConfigValidationError with the variable in its column, so it does not read as
     * a plain constraint violation of the schema or of the caller's values.
     */
    const error = failure()

    expect(error.issues.map((issue) => issue.path)).toEqual(['region.code', 'billing.key'])
    expect(error.issues[0]?.message).toBe(
      'no placeholder satisfies this leaf (invalid format (expected: regex)); pass an override for region.code'
    )
    expect(error.issues[1]?.message).toBe(
      'no placeholder satisfies this leaf (invalid value); pass an override for billing.key'
    )
    expect(error.message).toContain('REGION_CODE')
    expect(error.message).toContain('pass an override for billing.key')
  })

  it('stops asking once the leaf is overridden', () => {
    /** Overriding both leaves with satisfying values makes the config valid. */
    const config = createTestConfig(unsynthesizable, {
      region: { code: 'BRA' },
      billing: { key: 'sk_test' }
    })

    expect(config.region.code).toBe('BRA')
    expect(config.billing.key).toBe('sk_test')
  })

  it('asks only for the leaves still unsatisfied', () => {
    /** One override given, one still missing: only the missing one is named. */
    const error = failure({ region: { code: 'BRA' } })

    expect(error.issues.map((issue) => issue.path)).toEqual(['billing.key'])
  })

  it('leaves an override that violates its own constraint as the plain violation', () => {
    /**
     * The caller supplied this value, so "no placeholder satisfies it" would be false:
     * the constraint's own description is the honest message.
     */
    const error = failure({ region: { code: 'brazil' }, billing: { key: 'sk_test' } })

    expect(error.issues).toHaveLength(1)
    expect(error.issues[0]?.message).toBe('invalid format (expected: regex)')
  })
})

describe('createTestConfig when a rule on a namespace or on the schema fails', () => {
  const ruled = defineEnv({
    storage: z
      .object({ enabled: z.string().default('false'), endpoint: z.string().default('') })
      .check((ctx) => {
        if (ctx.value.enabled === 'true' && ctx.value.endpoint === '') {
          ctx.issues.push({ code: 'custom', input: ctx.value, message: 'endpoint is required' })
        }
      })
  })
  const wholeRuled = defineEnv({ a: z.object({ x: z.string().default('x') }) }).check((ctx) => {
    ctx.issues.push({ code: 'custom', input: ctx.value, message: 'the schema is wrong' })
  })

  /** What createTestConfig throws, or the test fails. */
  function failure(run: () => unknown): BymaxConfigValidationError {
    try {
      run()
    } catch (error) {
      expect(error).toBeInstanceOf(BymaxConfigValidationError)
      return error as BymaxConfigValidationError
    }
    throw new Error('createTestConfig was expected to throw')
  }

  it("keeps the rule's own message when the caller's override breaks a namespace rule", () => {
    /**
     * The rule failed because of a value the caller supplied, not because no placeholder
     * fits, so the guidance about placeholders would blame the wrong thing. Only an issue
     * that names a leaf the caller left alone is rewritten; a namespace issue names none.
     */
    const error = failure(() => createTestConfig(ruled, { storage: { enabled: 'true' } }))

    expect(error.issues).toEqual([
      expect.objectContaining({ path: 'storage', message: 'endpoint is required' })
    ])
  })

  it('does not point at an override for a rule on the whole schema', () => {
    /** A schema-level issue names no leaf, so there is nothing to override; its message stands. */
    const error = failure(() => createTestConfig(wholeRuled))

    expect(error.issues).toEqual([
      expect.objectContaining({ path: '', message: 'the schema is wrong' })
    ])
  })
})

describe('createTestConfig when the schema itself throws', () => {
  it('rethrows an error that is not a validation error, untouched', () => {
    /**
     * Only a BymaxConfigValidationError carries issues to explain. A transform that throws
     * its own error is not one, so it reaches the caller as it was thrown instead of being
     * wrapped in guidance about overrides.
     */
    const exploding = defineEnv({
      s: z.object({
        v: z.string().transform(() => {
          throw new RangeError('transform failed')
        })
      })
    })

    expect(() => createTestConfig(exploding)).toThrow(RangeError)
    expect(() => createTestConfig(exploding)).not.toThrow(BymaxConfigValidationError)
  })
})

describe('createTestConfig when two leaves read one variable', () => {
  const colliding = defineEnv({
    a: z.object({ bC: z.string() }),
    aB: z.object({ c: z.string() })
  })

  it('reports the collision itself, not a request for an override', () => {
    /**
     * Overriding one of two leaves that share a variable cannot fix the schema, so the
     * collision is raised as it is, without the guidance about placeholders.
     */
    let thrown: unknown
    try {
      createTestConfig(colliding)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.message)).toEqual([
      'shares this variable with aB.c; rename one with meta({ env })',
      'shares this variable with a.bC; rename one with meta({ env })'
    ])
  })
})
