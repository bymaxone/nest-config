/**
 * Unit tests for a source created in another realm whose root prototype carries variable names.
 *
 * Layer: unit.
 * Goal: prove that a variable that only the root prototype of another realm supplies is not a value of the
 * source, strict or not, while a value the source holds as its own, or on a prototype that has one of its
 * own, is read.
 * Mocks: none. The other realm is a `vm` context created for the case.
 */

import { runInNewContext } from 'node:vm'

import { z } from 'zod'

import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string() }) })

/** A source from another realm, with `APP_NAME` planted on the root prototype of that realm. */
function plantedSource(): Record<string, string> {
  return runInNewContext(
    `Object.defineProperty(Object.prototype, 'APP_NAME', { value: 'planted', configurable: true, writable: true });
     ({})`
  ) as Record<string, string>
}

describe('a source created in another realm', () => {
  it.each([
    ['strict', true],
    ['not strict', false]
  ])('does not take a variable the root prototype of that realm supplies, %s', (_name, strict) => {
    let error: unknown
    try {
      validateEnv(schema, plantedSource(), { strict })
    } catch (thrown) {
      error = thrown
    }

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues.map((issue) => issue.variable)).toEqual([
      'APP_NAME'
    ])
  })

  it('reads a variable that source holds as its own', () => {
    const source = runInNewContext('({ APP_NAME: "own" })') as Record<string, string>

    expect(validateEnv(schema, source, {}).app.name).toBe('own')
  })

  it('reads a variable held by a parent of that realm which has a prototype of its own', () => {
    const parent = runInNewContext('({ APP_NAME: "parent" })') as object
    const source = Object.create(parent) as Record<string, string>

    expect(validateEnv(schema, source, {}).app.name).toBe('parent')
  })
})
