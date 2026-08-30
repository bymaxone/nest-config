/**
 * Unit tests for strict unknown-key detection.
 *
 * Layer: unit.
 * Goal: prove that strict mode reports a variable matching a declared namespace
 * prefix but no declared leaf, ignores everything outside a declared prefix,
 * attributes an unknown key to its most specific namespace, and that a namespace
 * declaring `meta({ open: true })` waives the check for the rest of its prefix
 * without loosening the validation of its own leaves.
 * Mocks: none.
 */

import { z } from 'zod'

import { defineEnv } from '../define-env'
import { ConfigErrorCode } from '../errors'
import { validateEnv } from '../env-validator'
import { appSchema, captureError, issuesByVariable, validSource } from './validator-fixtures'

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

  it('returns unknown-key issues sorted by variable for a stable report', () => {
    /**
     * Deterministic ordering.
     *
     * Unknown-key issues are sorted by variable name so the aggregated report
     * does not depend on the source key-enumeration order, which can vary
     * across platforms and runs.
     */
    const error = captureError(
      appSchema,
      { ...validSource, DATABASE_ZEBRA: 'z', DATABASE_ALPHA: 'a', DATABASE_MIDDLE: 'm' },
      { strict: true }
    )
    const unknownVariables = error.issues
      .filter((issue) => issue.code === ConfigErrorCode.UNKNOWN_KEY)
      .map((issue) => issue.variable)

    expect(unknownVariables).toEqual(['DATABASE_ALPHA', 'DATABASE_MIDDLE', 'DATABASE_ZEBRA'])
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

  it('prefers the longest prefix regardless of namespace declaration order', () => {
    /**
     * Order independence.
     *
     * With the broader namespace declared first (appConfig before app), an
     * unknown key under the more specific prefix must still resolve to the most
     * specific namespace, proving the match does not depend on iteration order.
     */
    const reorderedSchema = defineEnv({
      appConfig: z.object({ retries: z.coerce.number().int().default(3) }),
      app: z.object({ name: z.string().min(1) })
    })
    const error = captureError(
      reorderedSchema,
      { APP_NAME: 'svc', APP_CONFIG_TYPO: 'oops' },
      { strict: true }
    )
    const issues = issuesByVariable(error)

    expect(issues.get('APP_CONFIG_TYPO')?.path).toBe('appConfig')
  })
})

describe('validateEnv strict mode with an open namespace', () => {
  const openSchema = defineEnv({
    // Shares the OTEL_ prefix with an OpenTelemetry SDK that reads its own
    // variables natively, so the namespace waives detection for the rest.
    otel: z.object({ enabled: z.coerce.boolean().default(false) }).meta({ open: true }),
    database: z.object({ url: z.url() })
  })

  it('ignores undeclared variables under the open namespace prefix', () => {
    /**
     * Prefix waiver.
     *
     * The variables another program reads under a shared prefix must not fail
     * the boot, which is the whole point of declaring the namespace open.
     */
    const config = validateEnv(
      openSchema,
      {
        DATABASE_URL: 'https://db.example.com',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_TRACES_SAMPLER: 'parentbased_always_on'
      },
      { strict: true }
    )

    expect(config.database.url).toBe('https://db.example.com')
  })

  it('keeps a declared leaf of an open namespace bound to its variable', () => {
    /**
     * Declared leaves survive the waiver.
     *
     * Opening a namespace must waive only unknown-key detection. Its declared
     * leaves keep reading their variables, so the value is the one the source
     * carries rather than the schema default. This is the property a source
     * filter cannot provide: filtering the OTEL_ prefix out of the source also
     * unbinds OTEL_ENABLED, and the default then manufactures a plausible
     * value while the variable silently stops being read.
     */
    const config = validateEnv(
      openSchema,
      {
        DATABASE_URL: 'https://db.example.com',
        OTEL_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318'
      },
      { strict: true }
    )

    expect(config.otel.enabled).toBe(true)
  })

  it('still reports an invalid value on a declared leaf of an open namespace', () => {
    /**
     * Validation is untouched.
     *
     * The waiver covers undeclared names only; a declared leaf whose value
     * fails its schema must still fail the boot, so opening a namespace never
     * weakens the validation it does perform.
     */
    const strictSchema = defineEnv({
      otel: z.object({ port: z.coerce.number().int().max(65535) }).meta({ open: true })
    })
    const error = captureError(strictSchema, { OTEL_PORT: '70000' }, { strict: true })
    const issues = issuesByVariable(error)

    expect(issues.get('OTEL_PORT')?.code).toBe(ConfigErrorCode.INVALID)
  })

  it('keeps detection in force for a closed namespace declared alongside', () => {
    /**
     * Waiver scope.
     *
     * The flag is per namespace, not per schema: a stray variable under a
     * sibling namespace that did not declare itself open must still be
     * reported, or one open namespace would disable strict mode everywhere.
     */
    const error = captureError(
      openSchema,
      {
        DATABASE_URL: 'https://db.example.com',
        DATABASE_TYPO: 'oops',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318'
      },
      { strict: true }
    )
    const issues = issuesByVariable(error)

    expect(issues.get('DATABASE_TYPO')?.code).toBe(ConfigErrorCode.UNKNOWN_KEY)
    expect(issues.has('OTEL_EXPORTER_OTLP_ENDPOINT')).toBe(false)
  })

  it('reports a stray variable under a closed namespace nested inside an open prefix', () => {
    /**
     * Longest-prefix match wins over the waiver.
     *
     * When a closed namespace declares a longer prefix inside an open one
     * (`otelExporter` under `otel`), the more specific namespace claims the
     * variable and still reports it, so opening a broad prefix does not
     * silently open every narrower namespace beneath it.
     */
    const nestedSchema = defineEnv({
      otel: z.object({ enabled: z.coerce.boolean().default(false) }).meta({ open: true }),
      otelExporter: z.object({ timeoutMs: z.coerce.number().int().default(10_000) })
    })
    const error = captureError(nestedSchema, { OTEL_EXPORTER_TYPO: 'oops' }, { strict: true })
    const issues = issuesByVariable(error)

    expect(issues.get('OTEL_EXPORTER_TYPO')?.path).toBe('otelExporter')
  })

  it('accepts a typo under an open namespace, the documented cost of the waiver', () => {
    /**
     * The hole the waiver opens, pinned deliberately.
     *
     * A foreign variable is indistinguishable from a misspelled local one, so
     * OTEL_ENABLD passes and `otel.enabled` falls back to its default. This
     * test exists so the trade-off is a stated contract rather than a surprise,
     * and so a future change that closes it fails visibly here.
     */
    const config = validateEnv(
      openSchema,
      { DATABASE_URL: 'https://db.example.com', OTEL_ENABLD: 'true' },
      { strict: true }
    )

    expect(config.otel.enabled).toBe(false)
  })
})
