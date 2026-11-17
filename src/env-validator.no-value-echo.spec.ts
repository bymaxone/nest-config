/**
 * Table test that no refusal or validation issue prints a source value.
 *
 * Layer: unit.
 * Goal: pin, across every kind of leaf constraint and every refusal path the package owns, that a
 * secret-shaped source value never reaches the message, the issue list, the serialization, the
 * stack or the inspected form of the thrown error. Environment values are secrets, so a refusal
 * names the variable and the constraint and nothing the operator typed.
 * Mocks: none.
 */

import { inspect } from 'node:util'

import { z } from 'zod'

import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { formatIssueReport } from './report-formatter'
import { prepareTestConfig } from './testing/create-test-config'

/** A value no constraint, format or wording of this package could produce by itself. */
const SENTINEL = 'SeNtInEl-7f3a9c-Zq81'

/** Every text the thrown error offers a caller, a logger or a serializer. */
function surfacesOf(error: BymaxConfigValidationError): string[] {
  return [
    error.message,
    String(error),
    error.stack ?? '',
    JSON.stringify(error),
    inspect(error, { depth: 8, showHidden: true }),
    formatIssueReport(error.issues),
    ...error.issues.flatMap((issue) => [issue.path, issue.variable, issue.message, issue.code])
  ]
}

/** Run `action`, which must throw the aggregated validation error, and return it. */
function thrownBy(action: () => unknown): BymaxConfigValidationError {
  try {
    action()
  } catch (error) {
    if (error instanceof BymaxConfigValidationError) return error
    throw error
  }
  throw new Error('expected the call to throw')
}

/** The constraint kinds a leaf can fail, each with a leaf the sentinel violates. */
const LEAVES: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['min length', z.string().min(64)],
  ['max length', z.string().max(3)],
  ['exact length', z.string().length(3)],
  ['regex', z.string().regex(/^\d+$/)],
  ['starts with', z.string().startsWith('prefix-')],
  ['ends with', z.string().endsWith('-suffix')],
  ['includes', z.string().includes('needle')],
  ['email', z.email()],
  ['url', z.url()],
  ['uuid', z.uuid()],
  ['ipv4', z.ipv4()],
  ['base64', z.base64()],
  ['jwt', z.jwt()],
  ['iso datetime', z.iso.datetime()],
  ['enum', z.enum(['development', 'test', 'production'])],
  ['literal', z.literal('on')],
  ['number', z.coerce.number()],
  ['integer', z.coerce.number().int()],
  ['number minimum', z.coerce.number().min(1)],
  ['date', z.coerce.date()],
  ['union', z.union([z.literal('a'), z.literal('b')])],
  ['custom check without a message', z.string().refine(() => false)],
  ['piped check', z.string().pipe(z.string().min(64))],
  ['wrapped optional', z.string().min(64).optional()],
  ['wrapped default', z.string().min(64).default('x'.repeat(64))]
]

describe('no refusal or validation issue prints a source value', () => {
  it.each(LEAVES)(
    'a leaf that fails its %s check names the variable and not the value',
    (_, leaf) => {
      /**
       * The sentinel stands for a secret an operator mistyped into the wrong variable. Whatever
       * constraint rejects it, the report may describe the constraint and must not repeat it.
       */
      const schema = defineEnv({ app: z.object({ secret: leaf }) })

      const error = thrownBy(() => validateEnv(schema, { APP_SECRET: SENTINEL }))

      expect(error.issues.map((issue) => [issue.variable, issue.code])).toEqual([
        ['APP_SECRET', ConfigErrorCode.INVALID]
      ])
      for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
    }
  )

  it('does not print the value of a variable that strict mode reports as unknown', () => {
    const schema = defineEnv({ app: z.object({ name: z.string() }) })

    const error = thrownBy(() =>
      validateEnv(schema, { APP_NAME: 'x', APP_NAMEE: SENTINEL }, { strict: true })
    )

    expect(error.issues.map((issue) => [issue.variable, issue.code])).toEqual([
      ['APP_NAMEE', ConfigErrorCode.UNKNOWN_KEY]
    ])
    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })

  it('does not print the values beside a required variable that is missing', () => {
    const schema = defineEnv({ app: z.object({ name: z.string(), token: z.string() }) })

    const error = thrownBy(() => validateEnv(schema, { APP_NAME: SENTINEL }))

    expect(error.issues.map((issue) => [issue.variable, issue.code])).toEqual([
      ['APP_TOKEN', ConfigErrorCode.MISSING]
    ])
    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })

  it('does not print any value of a source that fails in several namespaces at once', () => {
    const schema = defineEnv({
      db: z.object({ url: z.url() }),
      auth: z.object({ secret: z.string().min(64), mode: z.enum(['a', 'b']) })
    })

    const error = thrownBy(() =>
      validateEnv(schema, { DB_URL: SENTINEL, AUTH_SECRET: SENTINEL, AUTH_MODE: SENTINEL })
    )

    expect(error.issues).toHaveLength(3)
    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })

  it('does not print the value of an invalid override handed to the testing helper', () => {
    const schema = defineEnv({ app: z.object({ secret: z.string().min(64) }) })

    const error = thrownBy(() => prepareTestConfig(schema, { app: { secret: SENTINEL } }))

    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })

  it('does not print the values beside a top-level key that is not a namespace', () => {
    const schema = defineEnv({ mode: z.string(), app: z.object({ name: z.string() }) } as never)

    const error = thrownBy(() => validateEnv(schema, { MODE: SENTINEL, APP_NAME: SENTINEL }))

    expect(error.issues.map((issue) => issue.path)).toEqual(['mode'])
    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })
})
