/**
 * End-to-end boot specs for the aggregated-failure path.
 *
 * Layer: e2e.
 * Goal: verify that an incomplete source, resolved through the BUILT
 * `@bymax-one/nest-config` artifact, rejects bootstrap with the aggregated,
 * value-free report instead of failing on the first violation.
 * Mocks: none. Exercises `@nestjs/testing` end to end, no network port bound.
 */

import { Test } from '@nestjs/testing'
import {
  BymaxConfigModule,
  BymaxConfigValidationError,
  ConfigErrorCode
} from '@bymax-one/nest-config'

import { envSchema } from './fixtures/env.schema'
import { incompleteSource } from './fixtures/incomplete-source'

describe('config boot (failure path, built artifact)', () => {
  /**
   * Aggregated failure: bootstrap rejects with BymaxConfigValidationError
   * instead of the process starting in a half-configured state.
   */
  it('rejects bootstrap with BymaxConfigValidationError', async () => {
    // Act & Assert
    await expect(
      Test.createTestingModule({
        imports: [BymaxConfigModule.forRoot({ schema: envSchema, source: incompleteSource })]
      }).compile()
    ).rejects.toThrow(BymaxConfigValidationError)
  })

  /**
   * Issue count and value-free guarantee: the aggregated error pins at least
   * three collected issues (two missing, two invalid) and never echoes a raw
   * source value in its message, protecting secrets from leaking into logs.
   */
  it('pins the issue count and omits raw source values from the report', async () => {
    // Arrange
    let caught: unknown

    // Act
    try {
      await Test.createTestingModule({
        imports: [BymaxConfigModule.forRoot({ schema: envSchema, source: incompleteSource })]
      }).compile()
    } catch (error) {
      caught = error
    }

    // Assert
    expect(caught).toBeInstanceOf(BymaxConfigValidationError)
    const validationError = caught as BymaxConfigValidationError
    expect(validationError.code).toBe(ConfigErrorCode.VALIDATION)
    expect(validationError.issues).toHaveLength(4)
    expect(validationError.message).not.toContain('not-a-number')
    expect(validationError.message).not.toContain('not-a-level')
  })
})
