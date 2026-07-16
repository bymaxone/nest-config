/**
 * End-to-end boot specs for the success path.
 *
 * Layer: e2e.
 * Goal: verify a realistic fixture application boots `BymaxConfigModule`
 * resolved through the BUILT `@bymax-one/nest-config` artifact (see
 * `jest.e2e.config.ts` for the resolution mechanism) and that a feature
 * provider reads typed values through `ConfigService` with no casts.
 * Mocks: none. Exercises `@nestjs/testing` end to end, no network port bound.
 */

import { Test } from '@nestjs/testing'
import { BymaxConfigModule, ConfigService } from '@bymax-one/nest-config'

import { envSchema } from './fixtures/env.schema'
import type { FixtureConfig } from './fixtures/env.schema'
import { FeatureProvider } from './fixtures/feature.provider'
import { validSource } from './fixtures/valid-source'

describe('config boot (success path, built artifact)', () => {
  /**
   * Success boot: a complete source lets the module resolve, and the feature
   * provider reads typed values through the injected ConfigService.
   */
  it('boots and exposes typed values to a feature provider', async () => {
    // Arrange
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema: envSchema, source: validSource })],
      providers: [FeatureProvider]
    }).compile()

    // Act
    const feature = moduleRef.get(FeatureProvider)

    // Assert
    expect(feature.describeConnection()).toBe('postgres://localhost:5432/fixture::3000')

    await moduleRef.close()
  })

  /**
   * Schema defaults: server.env and log.level resolve to their declared
   * defaults when the source omits them, proving defaults survive the built
   * validation pipeline end to end.
   */
  it('resolves schema defaults for omitted optional variables', async () => {
    // Arrange
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema: envSchema, source: validSource })]
    }).compile()

    // Act
    const config = moduleRef.get<ConfigService<FixtureConfig>>(ConfigService)

    // Assert
    expect(config.get('server.env')).toBe('development')
    expect(config.get('log.level')).toBe('info')
    expect(config.has('redis.url')).toBe(true)

    await moduleRef.close()
  })
})
