/**
 * Unit tests for a `meta({ env })` that cannot name a variable.
 *
 * Layer: unit.
 * Goal: prove an `env` override that is present but is not a non-empty string is reported in the
 * aggregated validation report, instead of the leaf quietly reading the variable derived from its
 * path, while a leaf with no `meta({ env })` at all is untouched.
 * Mocks: none.
 */

import { z } from 'zod'

import { captureError } from './__tests__/validator-fixtures'
import { defineEnv } from './define-env'
import { ConfigErrorCode } from './errors'
import { validateEnv } from './env-validator'

describe('validateEnv with an unusable meta({ env })', () => {
  it.each([
    ['an empty string', '', 'an empty string'],
    ['undefined', undefined, 'undefined'],
    ['a number', 42, 'a number'],
    ['a boolean', true, 'a boolean'],
    ['null', null, 'null'],
    ['an object', {}, 'an object']
  ])('reports %s as an issue instead of reading the derived variable', (_name, value, found) => {
    /**
     * An `env` that cannot name a variable must be reported even when the variable derived
     * from the path is present and valid: the leaf may not read a mapping its author did not write.
     */
    const schema = defineEnv({ database: z.object({ url: z.string().meta({ env: value }) }) })

    const error = captureError(schema, { DATABASE_URL: 'present-and-valid' })

    expect(error.issues).toEqual([
      {
        path: 'database.url',
        variable: 'DATABASE_URL',
        code: ConfigErrorCode.INVALID,
        message: `meta({ env }) must be a non-empty string, found ${found}; the leaf would read DATABASE_URL`
      }
    ])
  })

  it('aggregates it with the issues of the other leaves', () => {
    /** One report lists the unusable override beside a missing variable. */
    const schema = defineEnv({
      database: z.object({ url: z.string().meta({ env: '' }) }),
      cache: z.object({ ttl: z.string() })
    })

    const error = captureError(schema, {})

    expect(error.issues.map((issue) => [issue.path, issue.code])).toEqual([
      ['database.url', ConfigErrorCode.INVALID],
      ['database.url', ConfigErrorCode.MISSING],
      ['cache.ttl', ConfigErrorCode.MISSING]
    ])
  })

  it('reports an unusable override on an inner layer too', () => {
    /** The walk looks through wrappers, so a bad value under `.default()` is found as well. */
    const schema = defineEnv({
      database: z.object({ url: z.string().meta({ env: '' }).default('x') })
    })

    expect(captureError(schema, {}).issues.map((issue) => issue.path)).toEqual(['database.url'])
  })

  it('lists a leaf once when several layers are unusable', () => {
    /** The first unusable layer is the one reported; a second must not repeat the leaf. */
    const schema = defineEnv({
      database: z.object({ url: z.string().meta({ env: 42 }).default('x').meta({ env: '' }) })
    })

    expect(captureError(schema, {}).issues.map((issue) => issue.path)).toEqual(['database.url'])
  })

  it('reports an unusable inner layer even when an outer layer names a variable', () => {
    /**
     * The outermost usable `env` decides the variable, but an inner one that cannot name a
     * variable is still a mistake in the schema and is reported.
     */
    const schema = defineEnv({
      database: z.object({ url: z.string().meta({ env: '' }).default('x').meta({ env: 'OUTER' }) })
    })

    const error = captureError(schema, {})

    expect(error.issues.map((issue) => [issue.path, issue.variable])).toEqual([
      ['database.url', 'OUTER']
    ])
  })

  it('accepts a one-character name', () => {
    /** The rule is non-empty, not longer than one character. */
    const schema = defineEnv({ database: z.object({ url: z.string().meta({ env: 'X' }) }) })

    expect(validateEnv(schema, { X: 'a' }).database.url).toBe('a')
  })

  it('leaves a leaf with no meta env, or a usable one, alone', () => {
    /** Only a PRESENT unusable value is an issue; absence and a good name are not. */
    const schema = defineEnv({
      database: z.object({
        url: z.string().meta({ env: 'DB_CONNECTION_STRING' }),
        pool: z.string().meta({ description: 'size' })
      })
    })

    expect(
      validateEnv(schema, { DB_CONNECTION_STRING: 'a', DATABASE_POOL: 'b' }).database.url
    ).toBe('a')
  })
})
