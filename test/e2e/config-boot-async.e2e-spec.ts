/**
 * End-to-end boot specs for the `forRootAsync` composition path.
 *
 * Layer: e2e.
 * Goal: verify `BymaxConfigModule.forRootAsync`, resolved through the BUILT
 * `@bymax-one/nest-config` artifact, composes a `process.env`-shaped source
 * with values resolved through an injected secrets provider, exactly as the
 * technical specification's secrets-manager composition example describes.
 * Mocks: `FixtureSecretsProvider` stands in for a real secrets-manager client.
 */

import { Test } from '@nestjs/testing'
import { BymaxConfigModule, ConfigService } from '@bymax-one/nest-config'

import { envSchema } from './fixtures/env.schema'
import type { FixtureConfig } from './fixtures/env.schema'
import { FixtureSecretsModule } from './fixtures/secrets.module'
import { FixtureSecretsProvider } from './fixtures/secrets.provider'

describe('config boot (forRootAsync path, built artifact)', () => {
  /**
   * Async composition: forRootAsync merges a process.env-shaped base source
   * with a snapshot resolved through an injected secrets provider, and the
   * validated result is available through the typed ConfigService.
   */
  it('composes a process.env-shaped source with an injected secrets provider', async () => {
    // Arrange
    const processEnvShapedSource: Record<string, string | undefined> = { LOG_LEVEL: 'warn' }

    // Act
    const moduleRef = await Test.createTestingModule({
      imports: [
        BymaxConfigModule.forRootAsync({
          imports: [FixtureSecretsModule],
          useFactory: (secrets: FixtureSecretsProvider) => ({
            schema: envSchema,
            source: { ...processEnvShapedSource, ...secrets.asEnvRecord() }
          }),
          inject: [FixtureSecretsProvider]
        })
      ]
    }).compile()
    const config = moduleRef.get<ConfigService<FixtureConfig>>(ConfigService)

    // Assert
    expect(config.get('log.level')).toBe('warn')
    expect(config.get('database.url')).toBe('postgres://localhost:5432/fixture-async')
    expect(config.get('redis.url')).toBe('redis://localhost:6379/1')

    await moduleRef.close()
  })
})
