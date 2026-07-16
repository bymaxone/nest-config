/**
 * Unit tests for the deterministic placeholder synthesizer.
 *
 * Layer: utility.
 * Goal: prove the synthesizer walks a two-level `defineEnv` schema and emits a
 * flat source record whose values satisfy every declared constraint (string
 * min-lengths, url/email formats, integer ranges, enum membership, booleans),
 * omits defaulted and optional leaves so the schema decides their fate, unwraps
 * nullable leaves to a concrete value, and is fully deterministic (two runs are
 * deep-equal). The representative schema is validated through the real
 * production validator to prove the output is accepted on the first try.
 * Mocks: none. No randomness, no process environment, no clock.
 */

import { z } from 'zod'

import { defineEnv } from '../define-env'
import { validateEnv } from '../env-validator'
import { synthesizePlaceholderSource } from './placeholder-synthesizer'

/**
 * Read a variable that must be present, narrowing the indexed access away from
 * `undefined` so assertions can call string and number methods directly.
 */
function required(source: Record<string, string>, key: string): string {
  const value = source[key]
  if (value === undefined) throw new Error(`expected ${key} to be present`)
  return value
}

/** A representative schema exercising every documented constraint kind. */
const representativeSchema = defineEnv({
  server: z.object({
    // Defaulted leaf: omitted from the source so the schema default applies.
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    // Non-defaulted integer range: synthesized to an in-range midpoint.
    workers: z.coerce.number().int().min(1).max(64),
    // Enum: synthesized to the first declared member.
    env: z.enum(['development', 'test', 'production'])
  }),
  database: z.object({
    // URL format: synthesized to a valid placeholder URL.
    url: z.url()
  }),
  auth: z.object({
    // Minimum-length string: synthesized to repeated filler of at least 32 chars.
    secret: z.string().min(32)
  }),
  mailer: z.object({
    // Email format: synthesized to a valid placeholder address.
    from: z.email()
  }),
  features: z.object({
    // Boolean: synthesized to a fixed coercible placeholder.
    verbose: z.coerce.boolean()
  })
})

describe('synthesizePlaceholderSource', () => {
  it('produces a source the production validator accepts on the first try', () => {
    // Scenario: the whole synthesized source flows through the real validator
    // unchanged and yields a typed configuration without throwing.
    const source = synthesizePlaceholderSource(representativeSchema)
    expect(() => validateEnv(representativeSchema, source)).not.toThrow()
  })

  it('omits defaulted leaves so the schema default is applied', () => {
    // Scenario: a leaf declaring `.default(...)` must not appear in the source,
    // so the validator supplies the declared default value.
    const source = synthesizePlaceholderSource(representativeSchema)
    expect(source).not.toHaveProperty('SERVER_PORT')
    const config = validateEnv(representativeSchema, source)
    expect(config.server.port).toBe(3000)
  })

  it('repeats filler to satisfy a string minimum length', () => {
    // Scenario: a min(32) string becomes at least 32 identical filler chars,
    // clearly a placeholder rather than a plausible secret.
    const source = synthesizePlaceholderSource(representativeSchema)
    const secret = required(source, 'AUTH_SECRET')
    expect(secret.length).toBeGreaterThanOrEqual(32)
    expect(secret).toMatch(/^a+$/)
  })

  it('emits a valid placeholder URL for url-format leaves', () => {
    // Scenario: a url() leaf becomes a syntactically valid placeholder URL.
    const source = synthesizePlaceholderSource(representativeSchema)
    expect(source.DATABASE_URL).toBe('https://placeholder.local')
    expect(z.url().safeParse(source.DATABASE_URL).success).toBe(true)
  })

  it('emits a valid placeholder email for email-format leaves', () => {
    // Scenario: an email() leaf becomes a syntactically valid placeholder address.
    const source = synthesizePlaceholderSource(representativeSchema)
    expect(z.email().safeParse(source.MAILER_FROM).success).toBe(true)
  })

  it('selects the first declared member for enum leaves', () => {
    // Scenario: an enum leaf becomes its first declared option deterministically.
    const source = synthesizePlaceholderSource(representativeSchema)
    expect(source.SERVER_ENV).toBe('development')
  })

  it('produces an in-range integer for bounded integer leaves', () => {
    // Scenario: an int().min(1).max(64) leaf becomes an integer within the range.
    const source = synthesizePlaceholderSource(representativeSchema)
    const workers = Number(required(source, 'SERVER_WORKERS'))
    expect(Number.isInteger(workers)).toBe(true)
    expect(workers).toBeGreaterThanOrEqual(1)
    expect(workers).toBeLessThanOrEqual(64)
  })

  it('synthesizes in-range numbers for single-sided, exclusive, and fractional ranges', () => {
    // Scenario: greater-than/less-than bounds, exclusive edges, and fractional
    // ranges each yield a value inside the declared interval, not only the
    // two-sided integer case.
    const schema = defineEnv({
      nums: z.object({
        floatRange: z.coerce.number().min(0.1).max(0.2),
        gtInt: z.coerce.number().int().gt(5),
        gtFloat: z.coerce.number().gt(1.5),
        minOnly: z.coerce.number().min(5),
        ltInt: z.coerce.number().int().lt(10),
        ltFloat: z.coerce.number().lt(2.5),
        maxOnly: z.coerce.number().max(10),
        plain: z.coerce.number(),
        gtIntMax: z.coerce.number().int().gt(0).max(1),
        minIntLt: z.coerce.number().int().min(2).lt(10),
        gtIntLt: z.coerce.number().int().gt(0).lt(4),
        fracInt: z.coerce.number().int().min(1.1).max(2.2)
      })
    })
    const source = synthesizePlaceholderSource(schema)
    const num = (key: string): number => Number(required(source, key))

    expect(num('NUMS_FLOAT_RANGE')).toBeGreaterThanOrEqual(0.1)
    expect(num('NUMS_FLOAT_RANGE')).toBeLessThanOrEqual(0.2)
    expect(Number.isInteger(num('NUMS_FLOAT_RANGE'))).toBe(false)
    expect(num('NUMS_GT_INT')).toBeGreaterThan(5)
    expect(Number.isInteger(num('NUMS_GT_INT'))).toBe(true)
    expect(num('NUMS_GT_FLOAT')).toBeGreaterThan(1.5)
    expect(num('NUMS_MIN_ONLY')).toBe(5)
    expect(num('NUMS_LT_INT')).toBeLessThan(10)
    expect(num('NUMS_LT_FLOAT')).toBeLessThan(2.5)
    expect(num('NUMS_MAX_ONLY')).toBe(10)
    expect(num('NUMS_PLAIN')).toBe(1)
    // Two-sided integer ranges with mixed exclusivity must land inside the range.
    expect(num('NUMS_GT_INT_MAX')).toBe(1)
    expect(num('NUMS_MIN_INT_LT')).toBeGreaterThanOrEqual(2)
    expect(num('NUMS_MIN_INT_LT')).toBeLessThan(10)
    expect(Number.isInteger(num('NUMS_MIN_INT_LT'))).toBe(true)
    expect(num('NUMS_GT_INT_LT')).toBeGreaterThan(0)
    expect(num('NUMS_GT_INT_LT')).toBeLessThan(4)
    expect(Number.isInteger(num('NUMS_GT_INT_LT'))).toBe(true)
    // Fractional bounds on an integer leaf: only 2 satisfies min 1.1 and max 2.2.
    expect(num('NUMS_FRAC_INT')).toBe(2)
  })

  it('honors min, max, and exact lengths for url and email formats', () => {
    // Scenario: formatted-string placeholders stay valid AND within every
    // declared length bound - canonical when it fits, resized when a max or
    // exact length demands it, and grown when a min exceeds the canonical.
    const schema = defineEnv({
      urls: z.object({
        plain: z.url(),
        capped: z.url().max(20),
        exact: z.url().length(30),
        long: z.url().min(40),
        tiny: z.url().max(10)
      }),
      emails: z.object({
        plain: z.email(),
        capped: z.email().max(15),
        exact: z.email().length(28),
        long: z.email().min(40)
      })
    })
    const source = synthesizePlaceholderSource(schema)
    const check = (
      key: string,
      format: z.ZodType,
      bounds: { min?: number; max?: number; exact?: number }
    ): void => {
      const value = required(source, key)
      expect(format.safeParse(value).success).toBe(true)
      if (bounds.min !== undefined) expect(value.length).toBeGreaterThanOrEqual(bounds.min)
      if (bounds.max !== undefined) expect(value.length).toBeLessThanOrEqual(bounds.max)
      if (bounds.exact !== undefined) expect(value.length).toBe(bounds.exact)
    }

    check('URLS_PLAIN', z.url(), {})
    check('URLS_CAPPED', z.url(), { max: 20 })
    check('URLS_EXACT', z.url(), { exact: 30 })
    check('URLS_LONG', z.url(), { min: 40 })
    check('URLS_TINY', z.url(), { max: 10 })
    check('EMAILS_PLAIN', z.email(), {})
    check('EMAILS_CAPPED', z.email(), { max: 15 })
    check('EMAILS_EXACT', z.email(), { exact: 28 })
    check('EMAILS_LONG', z.email(), { min: 40 })
  })

  it('emits a coercible placeholder for boolean leaves', () => {
    // Scenario: a boolean leaf becomes a value the coercion accepts.
    const source = synthesizePlaceholderSource(representativeSchema)
    expect(z.coerce.boolean().safeParse(source.FEATURES_VERBOSE).success).toBe(true)
  })

  it('is deterministic: two runs produce a deep-equal source', () => {
    // Scenario: without any randomness or clock, repeated calls are identical.
    const first = synthesizePlaceholderSource(representativeSchema)
    const second = synthesizePlaceholderSource(representativeSchema)
    expect(first).toStrictEqual(second)
  })

  it('omits optional leaves so an absent value stays valid', () => {
    // Scenario: an optional leaf without a default is omitted, letting the
    // schema resolve it to undefined.
    const schema = defineEnv({ cache: z.object({ url: z.url().optional() }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source).not.toHaveProperty('CACHE_URL')
    expect(() => validateEnv(schema, source)).not.toThrow()
  })

  it('unwraps nullable leaves to a concrete synthesized value', () => {
    // Scenario: a nullable leaf still needs a present value, so the inner type
    // is synthesized rather than omitted.
    const schema = defineEnv({ cache: z.object({ name: z.string().min(3).nullable() }) })
    const source = synthesizePlaceholderSource(schema)
    expect(required(source, 'CACHE_NAME').length).toBeGreaterThanOrEqual(3)
    expect(() => validateEnv(schema, source)).not.toThrow()
  })

  it('extends the placeholder URL to satisfy a minimum length', () => {
    // Scenario: a url().min(n) longer than the base placeholder is padded on the
    // path while staying a valid URL.
    const schema = defineEnv({ api: z.object({ endpoint: z.url().min(40) }) })
    const source = synthesizePlaceholderSource(schema)
    const endpoint = required(source, 'API_ENDPOINT')
    expect(endpoint.length).toBeGreaterThanOrEqual(40)
    expect(z.url().safeParse(endpoint).success).toBe(true)
  })

  it('extends the placeholder email local part to satisfy a minimum length', () => {
    // Scenario: an email().min(n) grows the local part while staying valid.
    const schema = defineEnv({ mailer: z.object({ from: z.email().min(40) }) })
    const source = synthesizePlaceholderSource(schema)
    const from = required(source, 'MAILER_FROM')
    expect(from.length).toBeGreaterThanOrEqual(40)
    expect(z.email().safeParse(from).success).toBe(true)
  })

  it('honors an exact string length', () => {
    // Scenario: a length(8) string becomes exactly eight filler characters.
    const schema = defineEnv({ token: z.object({ value: z.string().length(8) }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.TOKEN_VALUE).toBe('aaaaaaaa')
  })

  it('stays within a plain string maximum length', () => {
    // Scenario: a max(3) string with no minimum stays within the maximum.
    const schema = defineEnv({ code: z.object({ value: z.string().max(3) }) })
    const source = synthesizePlaceholderSource(schema)
    expect(required(source, 'CODE_VALUE').length).toBeLessThanOrEqual(3)
    expect(() => validateEnv(schema, source)).not.toThrow()
  })

  it('clamps the filler down to a zero maximum length', () => {
    // Scenario: a max(0) string admits only the empty value, so the default
    // filler is clamped away rather than violating the bound.
    const schema = defineEnv({ code: z.object({ value: z.string().max(0) }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.CODE_VALUE).toBe('')
    expect(() => validateEnv(schema, source)).not.toThrow()
  })

  it('uses the inclusive minimum for a min-only integer', () => {
    // Scenario: with only a lower bound, the value is that inclusive minimum.
    const schema = defineEnv({ pool: z.object({ size: z.coerce.number().int().min(7) }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.POOL_SIZE).toBe('7')
  })

  it('uses the inclusive maximum for a max-only integer', () => {
    // Scenario: with only an upper bound, the value is that inclusive maximum.
    const schema = defineEnv({ pool: z.object({ size: z.coerce.number().int().max(9) }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.POOL_SIZE).toBe('9')
  })

  it('steps inside exclusive numeric bounds', () => {
    // Scenario: exclusive gt/lt bounds are stepped by one so the midpoint stays
    // strictly inside the open interval.
    const schema = defineEnv({ ratio: z.object({ value: z.number().gt(5).lt(10) }) })
    const source = synthesizePlaceholderSource(schema)
    const value = Number(required(source, 'RATIO_VALUE'))
    expect(value).toBeGreaterThan(5)
    expect(value).toBeLessThan(10)
  })

  it('falls back to a fixed default for an unconstrained number', () => {
    // Scenario: a number leaf with no bounds still receives a deterministic
    // in-type placeholder.
    const schema = defineEnv({ metric: z.object({ value: z.coerce.number() }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.METRIC_VALUE).toBe('1')
  })

  it('emits a non-empty filler for a plain string with no constraints', () => {
    // Scenario: an unconstrained string leaf still receives a clearly-placeholder
    // filler value.
    const schema = defineEnv({ label: z.object({ text: z.string() }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.LABEL_TEXT).toBe('a')
  })

  it('falls back to a generic filler for leaf types beyond the documented set', () => {
    // Scenario: an unsupported leaf type (bigint) still yields a deterministic
    // filler rather than crashing the walk.
    const schema = defineEnv({ ledger: z.object({ total: z.bigint() }) })
    const source = synthesizePlaceholderSource(schema)
    expect(source.LEDGER_TOTAL).toBe('a')
  })
})
