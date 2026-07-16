/**
 * Unit tests for createTestConfig.
 *
 * Layer: utility.
 * Goal: prove the builder synthesizes a valid source, applies nested partial
 * overrides onto only the targeted leaves, runs the exact production pipeline
 * (validate then deep-freeze), and returns the typed frozen configuration. A
 * constraint-violating override must throw the production validation error, and
 * the returned object must reject mutation.
 * Mocks: none. No process environment is read; the source is fully synthesized.
 */

import { z } from 'zod'

import { defineEnv } from '../define-env'
import { BymaxConfigValidationError } from '../errors'
import { createTestConfig } from './create-test-config'

/** A representative multi-namespace schema with a default and constraints. */
const schema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    env: z.enum(['development', 'test', 'production'])
  }),
  database: z.object({
    url: z.url()
  }),
  auth: z.object({
    secret: z.string().min(32)
  })
})

describe('createTestConfig', () => {
  it('returns a frozen config that passes the production validator', () => {
    // Scenario: with no overrides the synthesized source validates, the default
    // is applied, and the result is frozen.
    const config = createTestConfig(schema)
    expect(config.server.port).toBe(3000)
    expect(config.server.env).toBe('development')
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('applies a nested override to only the targeted leaf', () => {
    // Scenario: overriding one leaf replaces exactly that leaf and leaves the
    // rest of the synthesized/defaulted configuration untouched.
    const config = createTestConfig(schema, {
      database: { url: 'postgres://localhost:5432/test' }
    })
    expect(config.database.url).toBe('postgres://localhost:5432/test')
    expect(config.server.port).toBe(3000)
    expect(config.auth.secret.length).toBeGreaterThanOrEqual(32)
  })

  it('overrides a defaulted leaf when a value is supplied', () => {
    // Scenario: a leaf that declares a default can still be pinned to a specific
    // value for the test.
    const config = createTestConfig(schema, { server: { port: 8080 } })
    expect(config.server.port).toBe(8080)
  })

  it('throws BymaxConfigValidationError when an override violates a constraint', () => {
    // Scenario: constraint enforcement is not weakened, so an invalid override
    // fails through the exact production error path.
    expect(() => createTestConfig(schema, { auth: { secret: 'too-short' } })).toThrow(
      BymaxConfigValidationError
    )
  })

  it('produces a deep-frozen result whose nested mutation throws', () => {
    // Scenario: the returned config is immutable at every level, matching the
    // production deep-freeze guarantee.
    const config = createTestConfig(schema)
    expect(() => {
      ;(config.database as { url: string }).url = 'mutated'
    }).toThrow(TypeError)
  })
})
