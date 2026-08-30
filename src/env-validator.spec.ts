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

import {
  appSchema,
  captureError,
  issuesByVariable,
  validSource
} from './__tests__/validator-fixtures'
import { defineEnv } from './define-env'
import { ConfigErrorCode } from './errors'
import { validateEnv } from './env-validator'

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

  it('places each leaf under its own namespace when leaf names collide', () => {
    /**
     * Namespace isolation.
     *
     * Two namespaces can declare a leaf of the same name (`tag`). Each source
     * value must land under its own namespace, so the per-namespace grouping
     * that frames the parse candidate cannot be dropped or widened to place a
     * value under the wrong namespace: `alpha.tag` and `beta.tag` keep their
     * distinct values rather than one overwriting the other.
     */
    const schema = defineEnv({
      alpha: z.object({ tag: z.string().min(1) }),
      beta: z.object({ tag: z.string().min(1) })
    })

    const config = validateEnv(schema, { ALPHA_TAG: 'alpha-value', BETA_TAG: 'beta-value' })

    expect(config.alpha.tag).toBe('alpha-value')
    expect(config.beta.tag).toBe('beta-value')
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
    // Zod lists a leaf's checks in declaration order, so the minimum-length
    // failure is reported before the pattern failure. The collapse keeps the
    // first issue for the leaf, so the surfaced message is the minimum-length
    // one, not whichever check happened to be reported last.
    expect(forVariable[0]?.message).toBe('too short (expected: string, minimum 10 characters)')
  })

  it('reports a nested failure inside a complex leaf under its variable', () => {
    /**
     * Deep-path collapse.
     *
     * A leaf can be a complex type (here a comma-separated string parsed into a
     * list of URLs). A failure on a nested element surfaces at a deeper Zod
     * path (endpoints.1), which must still be reported under the leaf's
     * variable rather than silently dropped.
     */
    const complexSchema = defineEnv({
      service: z.object({
        endpoints: z
          .string()
          .transform((value) => value.split(','))
          .pipe(z.array(z.url()))
      })
    })
    const error = captureError(complexSchema, {
      SERVICE_ENDPOINTS: 'https://ok.example,not-a-url'
    })
    const issues = issuesByVariable(error)

    expect(issues.get('SERVICE_ENDPOINTS')?.code).toBe(ConfigErrorCode.INVALID)
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

describe('validateEnv authored custom messages', () => {
  const storageSchema = defineEnv({
    storage: z
      .object({
        enabled: z.string().default('false'),
        endpoint: z.string().default('')
      })
      .check((ctx) => {
        if (ctx.value.enabled !== 'true' || ctx.value.endpoint.length > 0) return
        ctx.issues.push({
          code: 'custom',
          input: ctx.value.endpoint,
          path: ['endpoint'],
          message: 'STORAGE_ENDPOINT is required when STORAGE_ENABLED is true.'
        })
      })
  })

  it('renders the authored message of a present-but-invalid leaf', () => {
    /**
     * Authored message, rendered.
     *
     * A conditional rule states itself only through the message its author
     * wrote; the generated "invalid value" describes nothing. The assertion is
     * on the rendered report, because the issue object carried the variable
     * name correctly even while the report printed the generic text.
     */
    const error = captureError(storageSchema, {
      STORAGE_ENABLED: 'true',
      STORAGE_ENDPOINT: ''
    })

    expect(error.message).toMatchInlineSnapshot(`
"environment validation failed (1 issue)

  STORAGE_ENDPOINT      STORAGE_ENDPOINT is required when STORAGE_ENABLED is true.

Fix the variables above and restart the process."
`)
    expect(issuesByVariable(error).get('STORAGE_ENDPOINT')?.code).toBe(ConfigErrorCode.INVALID)
  })

  it('renders the authored message for an absent variable and still codes it missing', () => {
    /**
     * Authored message over the missing wording.
     *
     * The same rule fires when the variable is absent rather than empty. The
     * author's explanation outranks "missing required value" in the report,
     * while the machine-readable code still classifies it as missing.
     */
    const error = captureError(storageSchema, { STORAGE_ENABLED: 'true' })
    const issue = issuesByVariable(error).get('STORAGE_ENDPOINT')

    expect(issue?.message).toBe('STORAGE_ENDPOINT is required when STORAGE_ENABLED is true.')
    expect(issue?.code).toBe(ConfigErrorCode.MISSING)
    expect(error.message).toContain('STORAGE_ENDPOINT is required when STORAGE_ENABLED is true.')
  })

  it('renders the authored message raised through superRefine', () => {
    /**
     * The other authoring path.
     *
     * `.superRefine` produces the same `custom` issue code as `.check`, so both
     * must reach the report through one mapping site.
     */
    const refinedSchema = defineEnv({
      auth: z.object({ previousSecrets: z.string().default('') }).superRefine((value, ctx) => {
        if (value.previousSecrets.length >= 32) return
        ctx.addIssue({
          code: 'custom',
          path: ['previousSecrets'],
          message: 'Each retired signing secret must be at least 32 characters'
        })
      })
    })
    const error = captureError(refinedSchema, { AUTH_PREVIOUS_SECRETS: 'short' })

    expect(error.message).toContain('Each retired signing secret must be at least 32 characters')
  })

  it('collapses a message written across several lines onto one report line', () => {
    /**
     * Layout protection.
     *
     * The report is one line per variable and the aligned column is part of the
     * package contract, so a message wrapped across source lines is collapsed
     * to single spaces instead of breaking the block.
     */
    const wrappedSchema = defineEnv({
      log: z.object({ pretty: z.string().default('false') }).check((ctx) => {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value.pretty,
          path: ['pretty'],
          message: '  LOG_PRETTY must be false\n   when NODE_ENV is production.  '
        })
      })
    })
    const error = captureError(wrappedSchema, { LOG_PRETTY: 'true' })

    expect(error.message).toMatchInlineSnapshot(`
"environment validation failed (1 issue)

  LOG_PRETTY            LOG_PRETTY must be false when NODE_ENV is production.

Fix the variables above and restart the process."
`)
  })

  it('keeps the generic wording for a custom issue that carries no message', () => {
    /**
     * Fallback boundary.
     *
     * Zod fills a message-less custom issue with its own default text, and a
     * whitespace-only message says nothing either. Both keep the report's own
     * wording rather than printing Zod's or an empty column.
     */
    const silentSchema = defineEnv({
      limits: z
        .object({ first: z.string().default(''), second: z.string().default('') })
        .check((ctx) => {
          ctx.issues.push({ code: 'custom', input: ctx.value.first, path: ['first'] })
          ctx.issues.push({
            code: 'custom',
            input: ctx.value.second,
            path: ['second'],
            message: '   '
          })
        })
    })
    const error = captureError(silentSchema, { LIMITS_FIRST: 'a', LIMITS_SECOND: 'b' })
    const issues = issuesByVariable(error)

    expect(issues.get('LIMITS_FIRST')?.message).toBe('invalid value')
    expect(issues.get('LIMITS_SECOND')?.message).toBe('invalid value')
  })

  it('treats Zod default text authored by hand as the reserved no-message signal', () => {
    /**
     * Reserved message (documented exception).
     *
     * Zod fills a message-less custom issue with `Invalid input` before the
     * validator sees it, so "no message" can only be recognized by that text.
     * A schema that writes the same string by hand is therefore indistinguishable
     * from one that wrote nothing and reports the generic wording. Pinned here
     * so the exception is a decision on record rather than a surprise.
     */
    const reservedSchema = defineEnv({
      limits: z.object({ reserved: z.string().default('') }).check((ctx) => {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value.reserved,
          path: ['reserved'],
          message: 'Invalid input'
        })
      })
    })
    const error = captureError(reservedSchema, { LIMITS_RESERVED: 'a' })

    expect(issuesByVariable(error).get('LIMITS_RESERVED')?.message).toBe('invalid value')
  })

  it('reports a localized Zod default as written when a locale is configured', () => {
    /**
     * Locale exception (documented behavior).
     *
     * The no-message fallback matches Zod's English default text, so a
     * configured non-English locale supplies a default that does not match and
     * is reported verbatim. That is a translated message rather than a wrong
     * one, and it is the documented boundary of the fallback — asserted here so
     * the documentation and the behavior cannot drift apart.
     *
     * The expected text is read from Zod under the same locale rather than
     * written here: the translation is upstream copy, free to be reworded in a
     * minor release, and hardcoding it asserts Zod's wording instead of this
     * package's behavior.
     */
    const localizedSchema = defineEnv({
      limits: z.object({ localized: z.string().default('') }).check((ctx) => {
        ctx.issues.push({ code: 'custom', input: ctx.value.localized, path: ['localized'] })
      })
    })

    z.config(z.locales.pt())
    try {
      const probe = z
        .string()
        .check((ctx) => {
          ctx.issues.push({ code: 'custom', input: ctx.value, path: [] })
        })
        .safeParse('a')
      const localizedDefault = probe.error?.issues[0]?.message

      const error = captureError(localizedSchema, { LIMITS_LOCALIZED: 'a' })
      const message = issuesByVariable(error).get('LIMITS_LOCALIZED')?.message

      // The locale is actually in effect: under it, Zod's default is not the
      // English text the fallback recognizes.
      expect(localizedDefault).toBeDefined()
      expect(localizedDefault).not.toBe('Invalid input')
      // The localized default reaches the report as written, rather than being
      // replaced by the generated description.
      expect(message).toBe(localizedDefault)
      expect(message).not.toBe('invalid value')
    } finally {
      z.config(z.locales.en())
    }
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
