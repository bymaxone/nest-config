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
  source: Record<string, string | undefined>,
  options?: Parameters<typeof validateEnv>[2]
): BymaxConfigValidationError {
  try {
    validateEnv(schema, source, options)
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

  it('emits a single issue for a leaf that fails several constraints at once', () => {
    /**
     * Deterministic collapse.
     *
     * A leaf can fail more than one Zod check at once (here both a minimum
     * length and a required pattern). The report shows one line per variable,
     * so the validator keeps a single issue for that leaf rather than one line
     * per failed check.
     */
    const boundedSchema = defineEnv({
      token: z.object({
        value: z
          .string()
          .min(10)
          .regex(/^secret_/)
      })
    })
    const error = captureError(boundedSchema, { TOKEN_VALUE: 'ab' })
    const forVariable = error.issues.filter((issue) => issue.variable === 'TOKEN_VALUE')

    expect(forVariable).toHaveLength(1)
    expect(forVariable[0]?.code).toBe(ConfigErrorCode.INVALID)
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

describe('validateEnv strict mode', () => {
  it('flags a prefixed variable that matches no declared leaf', () => {
    /**
     * Unknown-key detection.
     *
     * A variable under a declared namespace prefix but with no matching leaf
     * (DATABASE_TYPO) is an operator mistake; strict mode surfaces it as a
     * BYMAX_CONFIG_UNKNOWN_KEY issue naming the namespace.
     */
    const error = captureError(
      appSchema,
      { ...validSource, DATABASE_TYPO: 'oops' },
      { strict: true }
    )
    const issues = issuesByVariable(error)

    expect(issues.get('DATABASE_TYPO')?.code).toBe(ConfigErrorCode.UNKNOWN_KEY)
    expect(issues.get('DATABASE_TYPO')?.path).toBe('database')
  })

  it('ignores variables that match no declared namespace prefix', () => {
    /**
     * Prefix gate.
     *
     * Unrelated process variables such as PATH and HOME never match a declared
     * prefix, so strict mode leaves them untouched and validation succeeds.
     */
    const config = validateEnv(
      appSchema,
      { ...validSource, PATH: '/usr/bin', HOME: '/home/app' },
      { strict: true }
    )

    expect(config.database.url).toBe('https://db.example.com')
  })

  it('stays silent about unknown variables when strict is omitted', () => {
    /**
     * Default leniency.
     *
     * Without strict mode, a prefixed-but-undeclared variable is tolerated and
     * the configuration validates successfully.
     */
    const config = validateEnv(appSchema, { ...validSource, DATABASE_TYPO: 'oops' })

    expect(config.database.url).toBe('https://db.example.com')
  })

  it('aggregates unknown-key issues together with missing and invalid ones', () => {
    /**
     * Combined aggregation.
     *
     * A single strict run must report missing, invalid, and unknown-key issues
     * together so the operator resolves every problem at once.
     */
    const error = captureError(
      appSchema,
      { AUTH_JWT_SECRET: 'short', LEGACY_AUTH_KEY: 'k', DATABASE_TYPO: 'oops' },
      { strict: true }
    )
    const issues = issuesByVariable(error)

    expect(issues.get('DATABASE_URL')?.code).toBe(ConfigErrorCode.MISSING)
    expect(issues.get('AUTH_JWT_SECRET')?.code).toBe(ConfigErrorCode.INVALID)
    expect(issues.get('DATABASE_TYPO')?.code).toBe(ConfigErrorCode.UNKNOWN_KEY)
  })

  it('ignores a prefixed key whose value is undefined under strict mode', () => {
    /**
     * Absent-value tolerance.
     *
     * A key mapped to undefined represents an absent variable, not a stray one,
     * so strict mode must not report it as an unknown key.
     */
    const config = validateEnv(
      appSchema,
      { ...validSource, DATABASE_TYPO: undefined },
      { strict: true }
    )

    expect(config.database.url).toBe('https://db.example.com')
  })

  it('attributes an unknown key to its most specific namespace when prefixes overlap', () => {
    /**
     * Longest-prefix match.
     *
     * Overlapping namespace prefixes (APP_ from `app`, APP_CONFIG_ from
     * `appConfig`) must attribute APP_CONFIG_TYPO to `appConfig`, the most
     * specific namespace, not to whichever namespace was declared first.
     */
    const overlapSchema = defineEnv({
      app: z.object({ name: z.string().min(1) }),
      appConfig: z.object({ retries: z.coerce.number().int().default(3) })
    })
    const error = captureError(
      overlapSchema,
      { APP_NAME: 'svc', APP_CONFIG_TYPO: 'oops' },
      { strict: true }
    )
    const issues = issuesByVariable(error)

    expect(issues.get('APP_CONFIG_TYPO')?.code).toBe(ConfigErrorCode.UNKNOWN_KEY)
    expect(issues.get('APP_CONFIG_TYPO')?.path).toBe('appConfig')
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
