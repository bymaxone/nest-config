/**
 * Shared fixtures for the validator specs.
 *
 * Layer: unit test support.
 * Lives under `__tests__/` because both Jest configurations exclude that
 * directory from coverage collection while `testMatch` ignores it: the
 * defensive branches below (an error of another type, a parse that unexpectedly
 * succeeds) exist to make a failing test legible and are not meant to run, so
 * collecting them would put the 100% gate at odds with their purpose.
 * Mocks: none.
 */

import { z } from 'zod'

import { defineEnv } from '../define-env'
import { validateEnv } from '../env-validator'
import { BymaxConfigValidationError } from '../errors'
import type { ConfigIssue } from '../errors'

export const appSchema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    nodeEnv: z.enum(['development', 'test', 'production']).default('development')
  }),
  database: z.object({
    url: z.url(),
    poolSize: z.coerce.number().int().min(1).default(10)
  }),
  auth: z.object({
    jwtSecret: z.string().min(32),
    legacyKey: z.string().min(1).meta({ env: 'LEGACY_AUTH_KEY' })
  })
})

export const validSource = {
  DATABASE_URL: 'https://db.example.com',
  AUTH_JWT_SECRET: 'k'.repeat(40),
  LEGACY_AUTH_KEY: 'legacy'
} as const

/**
 * Index the thrown issues by their resolved variable name.
 *
 * @param error - The aggregated validation error a spec captured.
 * @returns The issues keyed by the variable each one names.
 */
export function issuesByVariable(error: BymaxConfigValidationError): Map<string, ConfigIssue> {
  return new Map(error.issues.map((issue) => [issue.variable, issue]))
}

/**
 * Run the validator and return the error it must throw.
 *
 * @param schema - The schema under test.
 * @param source - The flat source record to validate.
 * @param options - Optional validator behavior flags.
 * @returns The aggregated validation error.
 * @throws {Error} When the validator unexpectedly succeeds.
 */
export function captureError(
  schema: Parameters<typeof validateEnv>[0],
  source: Record<string, string | undefined>,
  options?: Parameters<typeof validateEnv>[2]
): BymaxConfigValidationError {
  try {
    validateEnv(schema, source, options)
  } catch (error) {
    if (error instanceof BymaxConfigValidationError) return error
    throw error
  }
  throw new Error('expected validateEnv to throw')
}
