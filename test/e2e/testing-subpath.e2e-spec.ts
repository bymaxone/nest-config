/**
 * End-to-end specs for the `./testing` subpath against the built artifact.
 *
 * Layer: e2e.
 * Goal: verify that a module registered from `@bymax-one/nest-config/testing`
 * provides the tokens `@bymax-one/nest-config` exports — the flow
 * `configTestingModule` documents — and that the error `createTestConfig`
 * rejects with is the one the root exports.
 *
 * This is the only place the two entry points meet at runtime, and it has to run
 * against `dist` to mean anything: each entry point is a separate bundle, so a
 * module reached from both by a relative path is copied into each, and a copied
 * class is a different injection token and a different `instanceof` target. The
 * source-based unit suite resolves through `tsconfig` paths and sees one copy,
 * so it cannot observe the split at all.
 *
 * Mocks: none. Exercises `@nestjs/testing` end to end, no network port bound.
 */

import { Test } from '@nestjs/testing'
import { BYMAX_CONFIG, BymaxConfigValidationError, ConfigService } from '@bymax-one/nest-config'
import { configTestingModule, createTestConfig } from '@bymax-one/nest-config/testing'

import { envSchema } from './fixtures/env.schema'
import type { FixtureConfig } from './fixtures/env.schema'

describe('testing subpath (built artifact)', () => {
  /**
   * The tokens the testing module provides are the ones the root exports.
   * A second copy of the shared runtime fails here with
   * `UnknownElementException` and nowhere else.
   */
  it('provides the root ConfigService and BYMAX_CONFIG identities', async () => {
    // Arrange
    const moduleRef = await Test.createTestingModule({
      imports: [configTestingModule(envSchema)]
    }).compile()

    // Act
    const service = moduleRef.get(ConfigService)
    const config = moduleRef.get<FixtureConfig>(BYMAX_CONFIG)

    // Assert
    expect(service).toBeInstanceOf(ConfigService)
    expect(config).toBeDefined()

    await moduleRef.close()
  })

  /**
   * Overrides reach the resolved configuration through the production
   * registration path, so the value read back is the one that was asked for.
   */
  it('applies overrides through the production registration path', async () => {
    // Arrange
    const moduleRef = await Test.createTestingModule({
      imports: [configTestingModule(envSchema, { server: { port: 4321 } })]
    }).compile()

    // Act
    const service = moduleRef.get(ConfigService)

    // Assert
    expect(service.get('server.port' as never)).toBe(4321)

    await moduleRef.close()
  })

  /**
   * `createTestConfig` must reject with the error class the root exports, or a
   * consumer narrowing on `instanceof` silently misses it and reports an
   * unexpected failure instead of a configuration one.
   */
  it('rejects an invalid override with the root BymaxConfigValidationError', () => {
    // Arrange
    const invalid = { server: { port: 'not-a-number' } } as never

    // Act + Assert
    expect(() => createTestConfig(envSchema, invalid)).toThrow(BymaxConfigValidationError)
  })
})
