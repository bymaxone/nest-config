/**
 * Unit tests for the overrides a test helper cannot place.
 *
 * Layer: unit.
 * Goal: prove an override whose path matches no leaf of the schema is reported, with every such
 * path listed, instead of being dropped while the helper answers with a config that lacks it.
 * Mocks: none.
 */

import { z } from 'zod'

import { BymaxConfigValidationError, ConfigErrorCode } from '../errors'
import { defineEnv } from '../define-env'
import { configTestingModule } from './config-testing.module'
import { createTestConfig } from './create-test-config'

const schema = defineEnv({ database: z.object({ url: z.string() }) })

/** Overrides the type system would reject, as a caller holding them in a variable can pass them. */
const unplaced = { database: { urll: 'typo' }, ghost: { x: '1' } } as never

/** The error the call must throw, or the value it returned instead. */
function outcome(run: () => unknown): unknown {
  try {
    return run()
  } catch (error) {
    return error
  }
}

describe('createTestConfig with an override that matches no leaf', () => {
  it('throws, listing every override path that matches no leaf', () => {
    /**
     * A misspelled leaf and an undeclared namespace must each be named: the call may not return
     * a config as if both overrides had been applied.
     */
    const thrown = outcome(() => createTestConfig(schema, unplaced))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    const { issues } = thrown as BymaxConfigValidationError
    expect(issues.map((issue) => issue.path)).toEqual(['database.urll', 'ghost.x'])
    expect(issues.map((issue) => issue.variable)).toEqual(['', ''])
    expect(issues.every((issue) => issue.code === ConfigErrorCode.UNKNOWN_KEY)).toBe(true)
    expect(issues[0]?.message).toBe(
      'no leaf of the schema is at this path; the override was not applied'
    )
  })

  it('names each unmatched path in the message a test run shows', () => {
    /**
     * The developer who mistypes an override reads `error.message`, not `error.issues`; each
     * path must be there, and the footer must speak of the test rather than a process restart.
     */
    const { message } = outcome(() => createTestConfig(schema, unplaced)) as Error

    expect(message).toContain('database.urll')
    expect(message).toContain('ghost.x')
    expect(message).toContain('Fix the overrides above in the test.')
    expect(message).not.toContain('restart the process')
  })

  it('still applies the overrides that do match a leaf', () => {
    /** A matching override alone is untouched by the check. */
    expect(createTestConfig(schema, { database: { url: 'x' } }).database.url).toBe('x')
  })

  it('reports an override for an undefined value that matches no leaf', () => {
    /** The path is wrong whatever the value is, so `undefined` does not excuse it. */
    const thrown = outcome(() => createTestConfig(schema, { ghost: { x: undefined } } as never))

    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'ghost.x'
    ])
  })
})

describe('configTestingModule with an override that matches no leaf', () => {
  it('throws while the module is built, listing the unmatched paths', () => {
    /** The testing module shares the preparation, so it fails the same way, before any provider. */
    const thrown = outcome(() => configTestingModule(schema, unplaced))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'database.urll',
      'ghost.x'
    ])
  })
})

describe('createTestConfig with a meta({ env }) that cannot name a variable', () => {
  const unusable = defineEnv({ database: z.object({ url: z.string().meta({ env: '' }) }) })

  it('reports the unusable override itself, not a request for a placeholder override', () => {
    /**
     * The helper validates a synthesized source, and an issue on a leaf the caller did not
     * override is rewritten as "no placeholder satisfies this leaf". This one is a mistake in
     * the schema, so it is raised before that rewrite can mislabel it.
     */
    const thrown = outcome(() => createTestConfig(unusable))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.message)).toEqual([
      'meta({ env }) must be a non-empty string, found an empty string; the leaf would read DATABASE_URL'
    ])
  })

  it('fails the testing module the same way', () => {
    /** The testing module prepares through the same function. */
    expect(outcome(() => configTestingModule(unusable))).toBeInstanceOf(BymaxConfigValidationError)
  })
})

describe('createTestConfig with an override namespace that is not an object', () => {
  it('reports one issue naming the namespace, not one per character', () => {
    /**
     * A namespace override that is a string yields one namespace-level issue, naming the
     * namespace, and never character-level issues for the pieces of the string.
     */
    const thrown = outcome(() => createTestConfig(schema, { database: 'x' } as never))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    const { issues } = thrown as BymaxConfigValidationError
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('database')
    expect(issues[0]?.code).toBe(ConfigErrorCode.INVALID)
    expect(issues[0]?.message).toBe('the override for `database` must be an object')
  })

  it.each([
    ['a number', 5],
    ['a boolean', true],
    ['undefined', undefined]
  ])('reports %s the same way', (_name, value) => {
    /** A number, a boolean or undefined in place of an object is one namespace-level issue. */
    const thrown = outcome(() => createTestConfig(schema, { database: value } as never))

    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'database'
    ])
  })

  it('lists it beside an unmatched path in one report', () => {
    /** Both mistakes are in one call, so one throw names both. */
    const thrown = outcome(() =>
      createTestConfig(schema, { database: 'x', ghost: { y: '1' } } as never)
    )

    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'database',
      'ghost.y'
    ])
  })
})

describe('createTestConfig with an override namespace that is not a plain object', () => {
  class Extra {
    public readonly url = 'x'
  }

  it.each([
    ['null', null],
    ['an array', ['x']],
    ['an empty array', []],
    ['a Map', new Map([['url', 'x']])],
    ['a Date', new Date(0)],
    ['a class instance', new Extra()]
  ])('reports %s as one issue naming the namespace', (_name, value) => {
    /**
     * A namespace override must be a plain object. Anything else, however it is shaped, is one
     * namespace-level issue by name: never a raw TypeError, never one issue per index, and never
     * an override that applies nothing and says nothing.
     */
    const thrown = outcome(() => createTestConfig(schema, { database: value } as never))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    const { issues } = thrown as BymaxConfigValidationError
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('database')
    expect(issues[0]?.code).toBe(ConfigErrorCode.INVALID)
    expect(issues[0]?.message).toBe('the override for `database` must be an object')
  })

  it('reports a null or an array namespace beside an unmatched path, in order', () => {
    /** The shape problems and the unmatched paths are one report. */
    const thrown = outcome(() =>
      createTestConfig(schema, { database: null, extra: ['x'], ghost: { y: '1' } } as never)
    )

    expect((thrown as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'database',
      'extra',
      'ghost.y'
    ])
  })

  it('fails the testing module the same way for a null namespace', () => {
    /** The testing module prepares through the same function. */
    const thrown = outcome(() => configTestingModule(schema, { database: null } as never))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
  })

  it('accepts a namespace made with a null prototype', () => {
    /** A record with no prototype is still a plain object of values. */
    const namespace = Object.assign(Object.create(null) as object, { url: 'x' })

    expect(createTestConfig(schema, { database: namespace } as never).database.url).toBe('x')
  })
})

describe('createTestConfig with overrides that are not a plain object', () => {
  it.each([
    ['a string', 'ab'],
    ['an array', []],
    ['a Map', new Map()],
    ['a number', 5]
  ])('reports %s as one issue', (_name, value) => {
    /**
     * The overrides argument itself must be a plain object. Anything else is one issue for the
     * whole argument, never one namespace per character of a string.
     */
    const thrown = outcome(() => createTestConfig(schema, value as never))

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    const { issues } = thrown as BymaxConfigValidationError
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('(overrides)')
    expect(issues[0]?.code).toBe(ConfigErrorCode.INVALID)
    expect(issues[0]?.message).toBe('the overrides must be an object')
  })

  it.each([
    ['undefined', undefined],
    ['null', null]
  ])('treats %s as no overrides', (_name, value) => {
    /** Passing nothing is the same as passing no overrides. */
    expect(createTestConfig(schema, value as never).database.url).toBe('a')
  })

  it('fails the testing module the same way for a string', () => {
    /** The testing module prepares through the same function. */
    expect(outcome(() => configTestingModule(schema, 'ab' as never))).toBeInstanceOf(
      BymaxConfigValidationError
    )
  })
})

describe('createTestConfig with a variable name that the report escapes or cuts', () => {
  it.each([
    ['longer than 200 characters', 'V'.repeat(205)],
    ['holding a directional mark', 'DB_' + '\u202e' + '_PORT']
  ])('keeps an override for a variable name %s out of the placeholder guidance', (_name, env) => {
    /** The override was supplied, so its invalid value is reported as it is, not as a missing override. */
    const named = defineEnv({ database: z.object({ port: z.coerce.number().int().meta({ env }) }) })

    const thrown = outcome(() =>
      createTestConfig(named, { database: { port: 'not-a-number' } } as never)
    )

    expect(thrown).toBeInstanceOf(BymaxConfigValidationError)
    const [issue] = (thrown as BymaxConfigValidationError).issues
    expect(issue?.path).toBe('database.port')
    expect(issue?.message).not.toContain('no placeholder satisfies')
  })

  it('still guides a leaf whose own placeholder cannot satisfy it', () => {
    const named = defineEnv({
      database: z.object({
        port: z.coerce
          .number()
          .int()
          .min(10)
          .max(5)
          .meta({ env: 'V'.repeat(205) })
      })
    })

    const thrown = outcome(() => createTestConfig(named))

    expect((thrown as BymaxConfigValidationError).issues[0]?.message).toContain(
      'no placeholder satisfies'
    )
  })

  it('tells two leaves apart whose variable names read alike once one is escaped', () => {
    /** One name holds a directional mark and the other the text of its escape; only the first is overridden. */
    const named = defineEnv({
      database: z.object({
        first: z.coerce.number().int().meta({ env: '\u202e' }),
        second: z.coerce.number().int().min(10).max(5).meta({ env: '\\u202e' })
      })
    })

    const thrown = outcome(() =>
      createTestConfig(named, { database: { first: 'not-a-number' } } as never)
    )

    const messages = Object.fromEntries(
      (thrown as BymaxConfigValidationError).issues.map((issue) => [issue.path, issue.message])
    )
    expect(messages['database.first']).not.toContain('no placeholder satisfies')
    expect(messages['database.second']).toContain('no placeholder satisfies')
  })

  it('tells two leaves apart whose variable names share the first 200 characters', () => {
    /** Both names are cut to the same text; the paths differ, so the override of one leaves the other guided. */
    const shared = 'V'.repeat(210)
    const named = defineEnv({
      database: z.object({
        first: z.coerce
          .number()
          .int()
          .meta({ env: `${shared}A` }),
        second: z.coerce
          .number()
          .int()
          .min(10)
          .max(5)
          .meta({ env: `${shared}B` })
      })
    })

    const thrown = outcome(() =>
      createTestConfig(named, { database: { first: 'not-a-number' } } as never)
    )

    const messages = Object.fromEntries(
      (thrown as BymaxConfigValidationError).issues.map((issue) => [issue.path, issue.message])
    )
    expect(messages['database.first']).not.toContain('no placeholder satisfies')
    expect(messages['database.second']).toContain('no placeholder satisfies')
  })

  it.each(['N'.repeat(205) + '_PORT', 'N'.repeat(205) + '_*'])(
    'does not take an issue on a namespace for a leaf when the namespace name is cut (%#)',
    (env) => {
      /** Cut at the bound, the path of the namespace issue and of the leaf issue read the same; neither is guided. */
      const named = defineEnv({
        ['N'.repeat(205)]: z
          .object({ port: z.coerce.number().int().min(10).max(5).meta({ env }) })
          .superRefine((_value, ctx) => ctx.addIssue({ code: 'custom', message: 'namespace rule' }))
      })

      const thrown = outcome(() => createTestConfig(named))

      const messages = (thrown as BymaxConfigValidationError).issues.map((issue) => issue.message)
      expect(messages).toHaveLength(2)
      for (const message of messages) expect(message).not.toContain('no placeholder satisfies')
    }
  )

  it('keeps the description of an issue that two leaves report alike when either was overridden', () => {
    /** Two leaf names share their first 200 characters, as do their variables: the issues read the same. */
    const leaf = 'L'.repeat(205)
    const variable = 'V'.repeat(205)
    const named = defineEnv({
      database: z.object({
        [`${leaf}a`]: z.coerce
          .number()
          .int()
          .meta({ env: `${variable}a` }),
        [`${leaf}b`]: z.coerce
          .number()
          .int()
          .min(10)
          .max(5)
          .meta({ env: `${variable}b` })
      })
    })

    const thrown = outcome(() =>
      createTestConfig(named, { database: { [`${leaf}a`]: 'not-a-number' } } as never)
    )

    const issues = (thrown as BymaxConfigValidationError).issues
    expect(issues).toHaveLength(2)
    for (const issue of issues) expect(issue.message).not.toContain('no placeholder satisfies')
  })

  it('guides both of two leaves that report alike when neither was overridden', () => {
    const leaf = 'L'.repeat(205)
    const variable = 'V'.repeat(205)
    const named = defineEnv({
      database: z.object({
        [`${leaf}a`]: z.coerce
          .number()
          .int()
          .min(10)
          .max(5)
          .meta({ env: `${variable}a` }),
        [`${leaf}b`]: z.coerce
          .number()
          .int()
          .min(10)
          .max(5)
          .meta({ env: `${variable}b` })
      })
    })

    const thrown = outcome(() => createTestConfig(named))

    const issues = (thrown as BymaxConfigValidationError).issues
    expect(issues).toHaveLength(2)
    for (const issue of issues) expect(issue.message).toContain('no placeholder satisfies')
  })
})
