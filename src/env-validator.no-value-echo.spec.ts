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

/** Run a failing validation of `schema` over `source` and return the thrown error. */
function refused(schema: z.ZodType, source: Record<string, string>): BymaxConfigValidationError {
  return thrownBy(() => validateEnv(schema as never, source))
}

/** A leaf whose own rule raises a non-custom issue built from the value it received. */
function raising(issue: (value: string) => object): z.ZodType {
  return z.string().superRefine((value, ctx) => {
    ctx.addIssue(issue(value) as never)
  })
}

/** One structural field a hand-raised issue can fill with the value, per row. */
const ECHOES: ReadonlyArray<readonly [string, (value: string) => object]> = [
  ['values', (value) => ({ code: 'invalid_value', values: ['other', value] })],
  ['expected', (value) => ({ code: 'invalid_type', expected: `got ${value}` })],
  ['format', (value) => ({ code: 'invalid_format', format: value })],
  ['string minimum', (value) => ({ code: 'too_small', origin: 'string', minimum: value })],
  ['number minimum', (value) => ({ code: 'too_small', origin: 'number', minimum: value })],
  ['minimum origin', (value) => ({ code: 'too_small', origin: value, minimum: 1 })],
  ['maximum', (value) => ({ code: 'too_big', origin: 'string', maximum: value })],
  ['maximum origin', (value) => ({ code: 'too_big', origin: value, maximum: 1 })]
]

describe('a constraint that would repeat a source value is withheld', () => {
  it.each(ECHOES)(
    'a hand-raised issue that holds the value in its %s is reported without it',
    (_field, issue) => {
      /**
       * The structural fields of an issue are printed as constraints. A rule can raise an issue
       * itself and fill one of them with what it received, so the field is compared with the value.
       */
      const error = refused(defineEnv({ app: z.object({ secret: raising(issue) }) }), {
        APP_SECRET: SENTINEL
      })

      expect(error.issues.map((entry) => entry.message)).toEqual(['invalid value'])
      for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
    }
  )

  it('withholds a field that is the value of another leaf', () => {
    const schema = defineEnv({
      app: z.object({ name: z.string(), secret: z.string() }).superRefine((app, ctx) => {
        ctx.addIssue({ code: 'invalid_value', values: [app.secret], path: ['name'] })
      })
    })

    const error = refused(schema, { APP_NAME: 'x', APP_SECRET: SENTINEL })

    expect(error.issues.map((entry) => entry.message)).toEqual(['invalid value'])
    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })

  it('withholds a field of a namespace rule that is the value of a leaf', () => {
    const schema = defineEnv({
      app: z.object({ secret: z.string() }).superRefine((app, ctx) => {
        ctx.addIssue({ code: 'invalid_format', format: app.secret })
      })
    })

    const error = refused(schema, { APP_SECRET: SENTINEL })

    expect(error.issues.map((entry) => [entry.variable, entry.message])).toEqual([
      ['APP_*', 'invalid value']
    ])
    for (const text of surfacesOf(error)) expect(text).not.toContain(SENTINEL)
  })

  it('keeps the constraint of a leaf whose value is empty', () => {
    /** Every text contains the empty string, so an empty value must not withhold anything. */
    const error = refused(defineEnv({ app: z.object({ secret: z.string().min(1) }) }), {
      APP_SECRET: ''
    })

    expect(error.issues.map((entry) => entry.message)).toEqual([
      'too short (expected: string, minimum 1 characters)'
    ])
  })

  it.each([
    ['is part of', '1'],
    ['reads the same as', '100']
  ])('keeps a numeric bound that another leaf value %s', (_relation, flag) => {
    /** A neighbour's value is a string and a native bound is a number, so it is no echo of it. */
    const schema = defineEnv({
      app: z.object({ flag: z.string(), port: z.coerce.number().max(100) })
    })

    const error = refused(schema, { APP_FLAG: flag, APP_PORT: '200' })

    expect(error.issues.map((entry) => entry.message)).toEqual([
      'out of range (expected: number <= 100)'
    ])
  })

  it.each([
    ['stringbool beside SHLVL', z.stringbool(), { SHLVL: '1' }],
    ['enum beside NODE_ENV', z.enum(['development', 'production']), { NODE_ENV: 'production' }]
  ])('keeps the options of a %s, which the schema does not declare', (_case, leaf, neighbour) => {
    /** The source is the whole environment, and only a declared variable reaches a rule. */
    const error = refused(defineEnv({ app: z.object({ flag: leaf }) }), {
      APP_FLAG: 'maybe',
      ...neighbour
    })

    expect(error.issues[0]?.message).toMatch(/^invalid value \(expected one of: /)
  })

  it.each([
    ['an object with no prototype', Object.create(null) as unknown],
    ['a symbol', Symbol('s') as unknown]
  ])('reports every line when a declared variable holds %s', (_kind, value) => {
    const schema = defineEnv({ app: z.object({ name: z.string(), other: z.string() }) })

    const error = refused(schema, { APP_NAME: value as string })

    expect(error.issues.map((entry) => entry.variable)).toEqual(['APP_NAME', 'APP_OTHER'])
  })

  it('does not take a field the issue lacks for a declared variable the source lacks', () => {
    const schema = defineEnv({
      app: z.object({
        name: raising(() => ({ code: 'too_small', minimum: 5, message: 'x' })),
        other: z.string().optional()
      })
    })

    const error = refused(schema, { APP_NAME: 'q' })

    expect(error.issues.map((entry) => entry.message)).toEqual([
      'out of range (expected: undefined >= 5)'
    ])
  })

  it('renders a field once, so a second rendering cannot differ from the compared one', () => {
    /** The raised issue carries a message, so zod does not render the field before the library does. */
    let renderings = 0
    const shifting = { toString: () => ((renderings += 1) === 1 ? 'a-format' : SENTINEL) }

    const error = refused(
      defineEnv({
        app: z.object({
          secret: raising(() => ({ code: 'invalid_format', format: shifting, message: 'x' }))
        })
      }),
      { APP_SECRET: SENTINEL }
    )

    expect(error.issues.map((entry) => entry.message)).toEqual([
      'invalid format (expected: a-format)'
    ])
  })
})

describe('the comparison with the source values', () => {
  it('is not decided by a String.prototype.includes the schema replaced during the parse', () => {
    const original = String.prototype.includes
    const leaf = z.string().superRefine((value, ctx) => {
      ctx.addIssue({ code: 'invalid_format', format: `got ${value}` })
      String.prototype.includes = () => false
    })
    let error: BymaxConfigValidationError
    try {
      error = refused(defineEnv({ app: z.object({ secret: leaf }) }), { APP_SECRET: SENTINEL })
    } finally {
      String.prototype.includes = original
    }

    expect(error.issues.map((entry) => entry.message)).toEqual(['invalid value'])
  })
})
