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
import { resolveSourceNames } from './source-mapping'
import { prepareTestConfig } from './testing/create-test-config'
import { synthesizePlaceholderSource } from './testing/placeholder-synthesizer'

/** A schema with flat leaves in the namespace position, built the way a types bypass would. */
const flat = (shape: Record<string, z.ZodType>): Parameters<typeof validateEnv>[0] =>
  defineEnv(shape as never)

/** Run `action`, which must throw, and return the validation error it threw. */
function captureThrown(action: () => unknown): BymaxConfigValidationError {
  try {
    action()
  } catch (error) {
    if (error instanceof BymaxConfigValidationError) return error
    throw error
  }
  throw new Error('expected the call to throw')
}

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

describe('resolveSourceNames on a top-level key that is not a namespace', () => {
  it('refuses with the same typed error instead of a raw TypeError', () => {
    const run = (): unknown => resolveSourceNames(flat({ mode: z.string() }))

    expect(run).toThrow(BymaxConfigValidationError)
    expect(captureThrown(run).issues).toEqual([
      {
        path: 'mode',
        variable: 'MODE',
        code: ConfigErrorCode.INVALID,
        message: 'is not a namespace; declare it inside a z.object({ ... }) namespace'
      }
    ])
  })

  it('lists every flat key and leaves a well-formed schema alone', () => {
    const mixed = flat({ mode: z.string(), db: z.object({ url: z.string() }), retries: z.number() })

    expect(
      captureThrown(() => resolveSourceNames(mixed)).issues.map((issue) => issue.path)
    ).toEqual(['mode', 'retries'])
    expect(resolveSourceNames(defineEnv({ db: z.object({ url: z.string() }) }))).toEqual([
      { path: 'db.url', variable: 'DB_URL' }
    ])
  })
})

describe('synthesizePlaceholderSource on a top-level key that is not a namespace', () => {
  it('refuses with the typed error before it walks the missing shape', () => {
    const error = captureThrown(() => synthesizePlaceholderSource(flat({ mode: z.string() })))

    expect(error.issues.map((issue) => issue.path)).toEqual(['mode'])
  })
})

describe('a namespace named toJSON', () => {
  it('is refused with a typed issue, because the root serializes through that name', () => {
    const error = captureThrown(() =>
      resolveSourceNames(defineEnv({ toJSON: z.object({ a: z.string() }) }))
    )

    expect(error.issues).toEqual([
      {
        path: 'toJSON',
        variable: 'TO_JSON',
        code: ConfigErrorCode.INVALID,
        message:
          'is reserved: the configuration root serializes through this name; rename the namespace'
      }
    ])
  })
})
