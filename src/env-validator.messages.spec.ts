/**
 * Unit tests for the fixed wording of the validator's own issue messages.
 *
 * Layer: unit.
 * Goal: pin, by exact value, the three message constants the validator owns and an operator
 * reads in the aggregated report: a variable that is absent, a variable the schema does not
 * declare, and a custom check that wrote no message of its own.
 * Mocks: none.
 */

import { z } from 'zod'

import { captureError, issuesByVariable } from './__tests__/validator-fixtures'
import { defineEnv } from './define-env'

describe('validateEnv issue wording', () => {
  it('reports an absent required variable as "missing required value"', () => {
    /**
     * The text an operator sees first when a deployment forgets a variable: it must say the
     * value is missing, not that it is invalid.
     */
    const schema = defineEnv({ database: z.object({ url: z.string() }) })

    const error = captureError(schema, {})

    expect(issuesByVariable(error).get('DATABASE_URL')?.message).toBe('missing required value')
  })

  it('reports an undeclared variable under a declared prefix as "unknown variable not declared in the schema"', () => {
    /**
     * Under strict mode a variable that starts with a declared namespace's prefix but matches
     * no declared leaf is reported by name, and the text says why it was rejected.
     */
    const schema = defineEnv({ database: z.object({ url: z.string() }) })

    const error = captureError(
      schema,
      { DATABASE_URL: 'x', DATABASE_URLL: 'typo' },
      { strict: true }
    )

    expect(issuesByVariable(error).get('DATABASE_URLL')?.message).toBe(
      'unknown variable not declared in the schema'
    )
  })

  it('reports a custom check that wrote no message as "invalid value"', () => {
    /**
     * Zod fills a message-less custom issue with its own default text before the validator
     * sees it. The report must replace that text with its own wording, never echo it.
     */
    const schema = defineEnv({
      limits: z.object({ cap: z.string() }).check((ctx) => {
        ctx.issues.push({ code: 'custom', input: ctx.value.cap, path: ['cap'] })
      })
    })

    const error = captureError(schema, { LIMITS_CAP: 'a' })

    expect(issuesByVariable(error).get('LIMITS_CAP')?.message).toBe('invalid value')
  })
})
