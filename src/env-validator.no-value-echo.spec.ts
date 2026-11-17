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

/**
 * The constraint kinds a leaf can fail: the title, a leaf, the value that violates it and, where
 * the value must get past an earlier check to reach the constraint, the message that proves which
 * constraint rejected it. The numeric rows need a number, because a non-numeric value fails the
 * base number check before `.int()` or `.min()` is reached.
 */
interface LeafRow {
  readonly title: string
  readonly leaf: z.ZodType
  readonly value: string
  readonly message?: string
}

/** One row of the table; the value defaults to the sentinel. */
function row(title: string, leaf: z.ZodType, value = SENTINEL, message?: string): LeafRow {
  return message === undefined ? { title, leaf, value } : { title, leaf, value, message }
}

const LEAVES: readonly LeafRow[] = [
  row('min length', z.string().min(64)),
  row('max length', z.string().max(3)),
  row('exact length', z.string().length(3)),
  row('regex', z.string().regex(/^\d+$/)),
  row('starts with', z.string().startsWith('prefix-')),
  row('ends with', z.string().endsWith('-suffix')),
  row('includes', z.string().includes('needle')),
  row('email', z.email()),
  row('url', z.url()),
  row('uuid', z.uuid()),
  row('ipv4', z.ipv4()),
  row('base64', z.base64()),
  row('jwt', z.jwt()),
  row('iso datetime', z.iso.datetime()),
  row('enum', z.enum(['development', 'test', 'production'])),
  row('literal', z.literal('on')),
  row('number', z.coerce.number()),
  row('integer', z.coerce.number().int(), '73.31941', 'invalid value (expected: int)'),
  row('number minimum', z.coerce.number().min(1), '-90417', 'out of range (expected: number >= 1)'),
  row('date', z.coerce.date()),
  row('union', z.union([z.literal('a'), z.literal('b')])),
  row(
    'custom check without a message',
    z.string().refine(() => false)
  ),
  row('piped check', z.string().pipe(z.string().min(64))),
  row('wrapped optional', z.string().min(64).optional()),
  row('wrapped default', z.string().min(64).default('x'.repeat(64)))
]

describe('no refusal or validation issue prints a source value', () => {
  it.each(LEAVES)(
    'a leaf that fails its $title check names the variable and not the value',
    ({ leaf, value, message }) => {
      /**
       * The sentinel stands for a secret an operator mistyped into the wrong variable. Whatever
       * constraint rejects it, the report may describe the constraint and must not repeat it.
       */
      const schema = defineEnv({ app: z.object({ secret: leaf }) })

      const error = thrownBy(() => validateEnv(schema, { APP_SECRET: value }))

      expect(error.issues.map((issue) => [issue.variable, issue.code])).toEqual([
        ['APP_SECRET', ConfigErrorCode.INVALID]
      ])
      if (message !== undefined) expect(error.issues[0]?.message).toBe(message)
      for (const text of surfacesOf(error)) expect(text).not.toContain(value)
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
