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
     * A namespace override that is not an object yields one namespace-level issue, naming the
     * namespace, and never character-level issues for the pieces of a string.
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
    /** Every primitive in place of an object is one namespace-level issue, whatever its type. */
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
