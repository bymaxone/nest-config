/**
 * Unit and integration tests for the refusal of `z.coerce.boolean()` at boot.
 *
 * Layer: unit and integration.
 * Goal: pin that a leaf built on `z.coerce.boolean()` is reported as one INVALID issue naming the
 * leaf, however the schema wraps it, because that rule turns every non-empty string, `'false'` and
 * `'0'` included, into `true`. The detection reads the schema's definition, so the first tests pin
 * what the installed zod does; a zod release that changes it fails here instead of silently
 * un-refusing the rule.
 * Mocks: none.
 */

import { z } from 'zod'

import { captureError } from './__tests__/validator-fixtures'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { prepareTestConfig } from './testing/create-test-config'

/** The message a refused leaf carries: names the trap and the replacement, never a value. */
const MESSAGE = "uses z.coerce.boolean(), where 'false' parses to true; use z.stringbool()"

/** Wrap one leaf in a namespace so a case reads as the leaf alone. */
const withLeaf = (leaf: z.ZodType): ReturnType<typeof defineEnv> =>
  defineEnv({ feature: z.object({ enabled: leaf }) })

/** Every message the validator reports for a source; none when the source boots. */
function reportedMessages(
  schema: Parameters<typeof validateEnv>[0],
  source: Record<string, string>
): string[] {
  try {
    validateEnv(schema, source)
    return []
  } catch (thrown) {
    if (thrown instanceof BymaxConfigValidationError)
      return thrown.issues.map((issue) => issue.message)
    throw thrown
  }
}

describe('the installed zod, which the detection reads', () => {
  it('marks z.coerce.boolean() with a boolean type and coerce true on its definition', () => {
    /** The detection keys on exactly these two fields; a change in either must fail the suite. */
    const def = z.coerce.boolean()._zod.def

    expect([def.type, def.coerce]).toEqual(['boolean', true])
  })

  it("still parses 'false' and '0' to true, which is the defect the refusal exists for", () => {
    /** If zod fixes the coercion, the refusal is obsolete and this test says so. */
    expect([z.coerce.boolean().parse('false'), z.coerce.boolean().parse('0')]).toEqual([true, true])
  })

  it('does not mark z.boolean() or z.stringbool() as coerced booleans', () => {
    /** The two correct spellings carry no `coerce: true` boolean node. */
    expect((z.boolean()._zod.def as { coerce?: unknown }).coerce).toBeUndefined()
    expect(z.stringbool().parse('false')).toBe(false)
  })
})

describe('validateEnv with z.coerce.boolean()', () => {
  it("refuses the leaf even when its variable is set to 'true'", () => {
    /** The source is valid for the rule; the refusal is about the rule, not the value. */
    const error = captureError(withLeaf(z.coerce.boolean()), { FEATURE_ENABLED: 'true' })

    expect(error.issues).toEqual([
      {
        path: 'feature.enabled',
        variable: 'FEATURE_ENABLED',
        code: ConfigErrorCode.INVALID,
        message: MESSAGE
      }
    ])
  })

  it('refuses the leaf when the variable is missing, and reports the missing variable too', () => {
    /** The mistake in the schema is reported beside the violation of the source. */
    const error = captureError(withLeaf(z.coerce.boolean()), {})

    expect(error.issues.map((issue) => [issue.path, issue.code])).toEqual([
      ['feature.enabled', ConfigErrorCode.INVALID],
      ['feature.enabled', ConfigErrorCode.MISSING]
    ])
  })

  it.each([
    ['a default', z.coerce.boolean().default(false)],
    ['optional', z.coerce.boolean().optional()],
    ['nullable', z.coerce.boolean().nullable()],
    ['nonoptional', z.coerce.boolean().optional().nonoptional()],
    ['readonly', z.coerce.boolean().readonly()],
    ['a catch', z.coerce.boolean().catch(false)],
    ['a prefault', z.coerce.boolean().prefault(true)],
    ['a refine', z.coerce.boolean().refine(() => true)],
    ['a transform', z.coerce.boolean().transform((flag) => flag)],
    ['the input of a pipe', z.coerce.boolean().pipe(z.boolean())],
    ['the output of a pipe', z.string().pipe(z.coerce.boolean())],
    ['a doubly wrapped leaf', z.coerce.boolean().default(false).optional().readonly()]
  ])('refuses it under %s', (_name, leaf) => {
    /** A wrapper must not hide the rule: the walk goes inward through every layer. */
    const error = captureError(withLeaf(leaf), { FEATURE_ENABLED: 'true' })

    expect(error.issues.map((issue) => [issue.path, issue.message])).toEqual([
      ['feature.enabled', MESSAGE]
    ])
  })

  it.each([
    ['z.boolean()', z.boolean(), undefined],
    ['z.stringbool()', z.stringbool(), 'false'],
    ['z.stringbool() with a default', z.stringbool().default(false), 'true'],
    ['z.coerce.number()', z.coerce.number(), '7'],
    ['z.coerce.string()', z.coerce.string(), 'true'],
    ['an enum', z.enum(['true', 'false']), 'true']
  ])('does not refuse %s', (_name, leaf, value) => {
    /** Only the boolean coercion is refused. `z.boolean()` takes no string, so it reads nothing. */
    const source = value === undefined ? {} : { FEATURE_ENABLED: value }

    expect(reportedMessages(withLeaf(leaf), source)).not.toContain(MESSAGE)
  })

  it('names every refused leaf once, beside the issues of the other leaves', () => {
    /** One report for the whole schema, in schema order, with the refusals before the violations. */
    const schema = defineEnv({
      feature: z.object({ enabled: z.coerce.boolean(), name: z.string() }),
      audit: z.object({ on: z.coerce.boolean().default(false) })
    })

    const error = captureError(schema, {})

    expect(error.issues.map((issue) => [issue.path, issue.code])).toEqual([
      ['feature.enabled', ConfigErrorCode.INVALID],
      ['audit.on', ConfigErrorCode.INVALID],
      ['feature.enabled', ConfigErrorCode.MISSING],
      ['feature.name', ConfigErrorCode.MISSING]
    ])
  })

  it('keeps the refusal when a rule on the same schema throws', () => {
    /** The refusal is decided before the parse, so a thrown rule cannot hide it. */
    const schema = defineEnv({
      feature: z.object({
        enabled: z.coerce.boolean(),
        flags: z.string().transform(() => {
          throw new Error('boom')
        })
      })
    })

    const error = captureError(schema, { FEATURE_ENABLED: 'true', FEATURE_FLAGS: 'x' })

    expect(error.issues.map((issue) => issue.path)).toEqual(['feature.enabled', ''])
  })

  it('reports the variable a meta({ env }) override names', () => {
    /** The issue carries the variable the leaf actually reads. */
    const error = captureError(withLeaf(z.coerce.boolean().meta({ env: 'FEATURE_FLAG' })), {
      FEATURE_FLAG: 'true'
    })

    expect(error.issues[0]).toMatchObject({ path: 'feature.enabled', variable: 'FEATURE_FLAG' })
  })

  it('throws the aggregated error type at the module boundary and in the test helper', () => {
    /** Both the boot path and the testing path refuse the same schema. */
    const schema = withLeaf(z.coerce.boolean())

    expect(() => validateEnv(schema, { FEATURE_ENABLED: 'true' })).toThrow(
      BymaxConfigValidationError
    )
    expect(() => prepareTestConfig(schema)).toThrow(BymaxConfigValidationError)
  })
})
