/**
 * Unit tests for the single-pass environment validator.
 *
 * Layer: unit.
 * Goal: prove the validator returns typed output with defaults and coercions on
 * success, aggregates every violation into one throw on failure, classifies
 * missing versus invalid correctly, honors meta({ env }) overrides for the
 * reported variable name, derives value-free constraint messages for each Zod
 * issue kind, and never leaks a sentinel secret into any error output.
 * Mocks: none.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { ConfigIssue } from './errors'
import { validateEnv } from './env-validator'

const appSchema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    nodeEnv: z.enum(['development', 'test', 'production']).default('development')
  }),
  database: z.object({
    url: z.url(),
    poolSize: z.coerce.number().int().min(1).default(10)
  }),
  auth: z.object({
    jwtSecret: z.string().min(32),
    legacyKey: z.string().min(1).meta({ env: 'LEGACY_AUTH_KEY' })
  })
})

const validSource = {
  DATABASE_URL: 'https://db.example.com',
  AUTH_JWT_SECRET: 'k'.repeat(40),
  LEGACY_AUTH_KEY: 'legacy'
} as const

/** Index the thrown issues by their resolved variable name. */
function issuesByVariable(error: BymaxConfigValidationError): Map<string, ConfigIssue> {
  return new Map(error.issues.map((issue) => [issue.variable, issue]))
}

/** Run the validator and return the error it must throw. */
function captureError(
  schema: Parameters<typeof validateEnv>[0],
  source: Record<string, string | undefined>
): BymaxConfigValidationError {
  try {
    validateEnv(schema, source)
  } catch (error) {
    if (error instanceof BymaxConfigValidationError) return error
    throw error
  }
  throw new Error('expected validateEnv to throw')
}

describe('validateEnv success path', () => {
  it('returns typed output with declared defaults applied', () => {
    /**
     * Defaults applied.
     *
     * Absent variables that declare a default must resolve to that default, so
     * the parsed output is complete even when the operator sets only the
     * required variables.
     */
    const config = validateEnv(appSchema, validSource)

    expect(config.server.port).toBe(3000)
    expect(config.server.nodeEnv).toBe('development')
    expect(config.database.poolSize).toBe(10)
  })

  it('coerces string source values into their declared leaf types', () => {
    /**
     * Coercion from strings.
     *
     * Source values arrive as strings; a coerced numeric leaf must parse to a
     * real number so consumers receive typed values, not strings.
     */
    const config = validateEnv(appSchema, { ...validSource, SERVER_PORT: '8080' })

    expect(config.server.port).toBe(8080)
    expect(typeof config.server.port).toBe('number')
  })
})

describe('validateEnv issue classification', () => {
  it('maps an absent required variable to the missing code', () => {
    /**
     * Missing classification.
     *
     * A required variable absent from the source is a BYMAX_CONFIG_MISSING
     * issue, distinct from a present-but-invalid value.
     */
    const error = captureError(appSchema, { AUTH_JWT_SECRET: 'k'.repeat(40), LEGACY_AUTH_KEY: 'x' })
    const issues = issuesByVariable(error)

    expect(issues.get('DATABASE_URL')?.code).toBe(ConfigErrorCode.MISSING)
    expect(issues.get('DATABASE_URL')?.message).toBe('missing required value')
  })

  it('maps a present-but-invalid variable to the invalid code', () => {
    /**
     * Invalid classification.
     *
     * A variable that is present but violates its constraint is a
     * BYMAX_CONFIG_INVALID issue with a value-free constraint message.
     */
    const error = captureError(appSchema, { ...validSource, AUTH_JWT_SECRET: 'too-short' })
    const issues = issuesByVariable(error)

    expect(issues.get('AUTH_JWT_SECRET')?.code).toBe(ConfigErrorCode.INVALID)
    expect(issues.get('AUTH_JWT_SECRET')?.message).toBe(
      'too short (expected: string, minimum 32 characters)'
    )
  })

  it('reports the resolved meta({ env }) name for an overridden variable', () => {
    /**
     * Override-aware reporting.
     *
     * The issue must name the operator-facing variable, which for an overridden
     * leaf is the meta({ env }) name (LEGACY_AUTH_KEY), not the derived one.
     */
    const error = captureError(appSchema, {
      DATABASE_URL: 'https://db',
      AUTH_JWT_SECRET: 'k'.repeat(40)
    })
    const issues = issuesByVariable(error)

    expect(issues.get('LEGACY_AUTH_KEY')?.code).toBe(ConfigErrorCode.MISSING)
    expect(issues.get('AUTH_AUTH_KEY')).toBeUndefined()
  })
})

describe('validateEnv aggregation', () => {
  it('collects every violation across namespaces into a single throw', () => {
    /**
     * Single aggregated error.
     *
     * Missing and invalid variables from different namespaces must all appear
     * in one thrown error so the operator fixes everything in one pass.
     */
    const error = captureError(appSchema, {
      AUTH_JWT_SECRET: 'short',
      SERVER_PORT: 'not-a-number'
    })
    const variables = error.issues.map((issue) => issue.variable)

    expect(variables).toEqual(
      expect.arrayContaining(['SERVER_PORT', 'DATABASE_URL', 'AUTH_JWT_SECRET', 'LEGACY_AUTH_KEY'])
    )
    expect(error.issues.length).toBeGreaterThanOrEqual(4)
  })

  it('reports one issue per required leaf for a fully empty source', () => {
    /**
     * Empty source boundary.
     *
     * With nothing supplied, only leaves without a default are missing; the
     * defaulted leaves must not produce issues.
     */
    const error = captureError(appSchema, {})
    const variables = error.issues.map((issue) => issue.variable).sort()

    expect(variables).toEqual(['AUTH_JWT_SECRET', 'DATABASE_URL', 'LEGACY_AUTH_KEY'])
    expect(error.issues.every((issue) => issue.code === ConfigErrorCode.MISSING)).toBe(true)
  })
})

describe('validateEnv constraint descriptions', () => {
  const constraintSchema = defineEnv({
    limits: z.object({
      flag: z.coerce.number(),
      homepage: z.url(),
      tier: z.enum(['gold', 'silver']),
      name: z.string().min(2),
      code: z.string().max(3),
      count: z.coerce.number().min(10),
      cap: z.coerce.number().max(5),
      ratio: z.coerce.number().multipleOf(2)
    })
  })

  it('derives a value-free message for every Zod issue kind', () => {
    /**
     * Constraint translation coverage.
     *
     * Each present-but-invalid leaf exercises a distinct Zod issue code; the
     * validator must translate each into a value-free description of the
     * expected constraint, including a generic fallback for uncommon codes.
     */
    const error = captureError(constraintSchema, {
      LIMITS_FLAG: 'abc',
      LIMITS_HOMEPAGE: 'not-a-url',
      LIMITS_TIER: 'bronze',
      LIMITS_NAME: 'a',
      LIMITS_CODE: 'abcd',
      LIMITS_COUNT: '3',
      LIMITS_CAP: '9',
      LIMITS_RATIO: '3'
    })
    const issues = issuesByVariable(error)

    expect(issues.get('LIMITS_FLAG')?.message).toBe('invalid value (expected: number)')
    expect(issues.get('LIMITS_HOMEPAGE')?.message).toBe('invalid format (expected: url)')
    expect(issues.get('LIMITS_TIER')?.message).toBe('invalid value (expected one of: gold, silver)')
    expect(issues.get('LIMITS_NAME')?.message).toBe(
      'too short (expected: string, minimum 2 characters)'
    )
    expect(issues.get('LIMITS_CODE')?.message).toBe(
      'too long (expected: string, maximum 3 characters)'
    )
    expect(issues.get('LIMITS_COUNT')?.message).toBe('out of range (expected: number >= 10)')
    expect(issues.get('LIMITS_CAP')?.message).toBe('out of range (expected: number <= 5)')
    expect(issues.get('LIMITS_RATIO')?.message).toBe('invalid value')
  })
})

describe('validateEnv value-free guarantee', () => {
  it('never leaks a sentinel secret into the error message, issues, or serialization', () => {
    /**
     * Value-leak guard (hard contract).
     *
     * When secret-bearing variables fail validation, the sentinel value must
     * appear nowhere: not in the aggregated message, not in any issue message,
     * and not in the serialized error.
     */
    const sentinel = 'SUPER_SECRET_VALUE_123'
    const error = captureError(appSchema, {
      DATABASE_URL: sentinel,
      AUTH_JWT_SECRET: sentinel,
      LEGACY_AUTH_KEY: 'legacy'
    })

    expect(error.message).not.toContain(sentinel)
    expect(JSON.stringify(error)).not.toContain(sentinel)
    for (const issue of error.issues) {
      expect(issue.message).not.toContain(sentinel)
    }
  })
})
