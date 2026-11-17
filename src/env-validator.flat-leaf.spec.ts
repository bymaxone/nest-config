/**
 * Unit and integration tests for the refusal of a top-level leaf that is not a namespace.
 *
 * Layer: unit and integration.
 * Goal: pin that a schema holding a leaf outside a `z.object` namespace, reachable only by
 * bypassing the types, is refused at validation with a BymaxConfigValidationError that names the
 * key, instead of a raw TypeError from walking the schema's shape.
 * Mocks: none.
 */

import { z } from 'zod'

import { captureError } from './__tests__/validator-fixtures'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { prepareTestConfig } from './testing/create-test-config'

/** A schema with flat leaves in the namespace position, built the way a types bypass would. */
const flat = (shape: Record<string, z.ZodType>): Parameters<typeof validateEnv>[0] =>
  defineEnv(shape as never)

describe('a top-level leaf outside a namespace', () => {
  it('is refused with a BymaxConfigValidationError that names the key', () => {
    const error = captureError(flat({ mode: z.string() }), { MODE: 'a' })

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues).toEqual([
      {
        path: 'mode',
        variable: 'MODE',
        code: ConfigErrorCode.INVALID,
        message: 'is not a namespace; declare it inside a z.object({ ... }) namespace'
      }
    ])
  })

  it('names every flat key, in declaration order, beside none of the valid namespaces', () => {
    const error = captureError(
      flat({ mode: z.string(), db: z.object({ url: z.string() }), retries: z.number() }),
      {}
    )

    expect((error as BymaxConfigValidationError).issues.map((issue) => issue.path)).toEqual([
      'mode',
      'retries'
    ])
  })

  it('does not echo the source value of the flat key', () => {
    const error = captureError(flat({ token: z.string() }), { TOKEN: 'SENTINEL-flat-secret' })

    expect(String(error)).not.toContain('SENTINEL-flat-secret')
  })

  it('refuses at boot through the testing module as well', () => {
    expect(() => prepareTestConfig(flat({ mode: z.string() }))).toThrow(BymaxConfigValidationError)
  })

  it('leaves a well-formed schema alone', () => {
    const schema = defineEnv({ db: z.object({ url: z.string() }) })

    expect(validateEnv(schema, { DB_URL: 'x' })).toEqual({ db: { url: 'x' } })
  })
})
