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
     * `z.string().meta({ env: '' })` used to read DATABASE_URL, so a present and valid derived
     * variable made the boot succeed on a mapping the author never wrote.
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
