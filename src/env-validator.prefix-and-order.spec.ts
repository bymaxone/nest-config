/**
 * Unit tests for how strict mode attributes an unknown variable to a namespace and orders the report.
 *
 * Layer: unit.
 * Goal: prove that an unknown variable is judged by the longest declared prefix that starts it, that the
 * namespace declared first decides when two namespaces share one prefix, and that the unknown variables are
 * reported in ascending order whatever order the source lists them in.
 * Mocks: none. Each schema and source is built for one case.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'

/** The variables a strict validation of `source` reports as unknown, in report order. */
function unknownOf(schema: unknown, source: Record<string, string>): string[] {
  try {
    validateEnv(schema as never, source, { strict: true })
  } catch (error) {
    return (error as { issues: Array<{ variable: string }> }).issues.map((issue) => issue.variable)
  }
  return []
}

const open = (): z.ZodType => z.object({ name: z.string() }).meta({ open: true })
const closed = (): z.ZodType => z.object({ host: z.string() })

describe('strict mode attribution of an unknown variable', () => {
  it('judges APP_CACHE_TYPO by the longer prefix, whichever namespace is declared first', () => {
    /**
     * Scenario: an open namespace `app` and a closed one `appCache`, in both declaration orders.
     * Expectation: the variable is reported, because the longest prefix that starts it belongs to the
     * closed namespace; the open one does not waive it.
     */
    const source = { APP_NAME: 'x', APP_CACHE_HOST: 'h', APP_CACHE_TYPO: '1' }
    const appFirst = defineEnv({ app: open(), appCache: closed() } as never)
    const cacheFirst = defineEnv({ appCache: closed(), app: open() } as never)

    expect([unknownOf(appFirst, source), unknownOf(cacheFirst, source)]).toEqual([
      ['APP_CACHE_TYPO'],
      ['APP_CACHE_TYPO']
    ])
  })

  it('lets the namespace declared first decide when two namespaces share one prefix', () => {
    /**
     * Scenario: `appCache` and `app_cache` both claim APP_CACHE_; the first is open, the second closed.
     * Expectation: APP_CACHE_X is waived, and reversing the declaration order reports it.
     */
    const withOpen = (): z.ZodType => z.object({ a: z.string() }).meta({ open: true })
    const withClosed = (): z.ZodType => z.object({ b: z.string() })
    const source = { APP_CACHE_A: '1', APP_CACHE_B: '1', APP_CACHE_X: '1' }
    const openFirst = defineEnv({ appCache: withOpen(), app_cache: withClosed() } as never)
    const closedFirst = defineEnv({ app_cache: withClosed(), appCache: withOpen() } as never)

    expect([unknownOf(openFirst, source), unknownOf(closedFirst, source)]).toEqual([
      [],
      ['APP_CACHE_X']
    ])
  })
})

describe('the order of the unknown variables in the report', () => {
  it('lists them ascending although the source lists them in another order', () => {
    /**
     * Scenario: four undeclared variables of one namespace, supplied out of order.
     * Expectation: the report names them in ascending order.
     */
    const schema = defineEnv({ app: z.object({ name: z.string() }) })

    expect(
      unknownOf(schema, { APP_NAME: 'x', APP_Z: '1', APP_A: '1', APP_M: '1', APP_C: '1' })
    ).toEqual(['APP_A', 'APP_C', 'APP_M', 'APP_Z'])
  })
})
