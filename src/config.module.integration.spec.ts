/**
 * Integration tests for BymaxConfigModule against real Nest testing graphs.
 *
 * Layer: integration.
 * Goal: prove the bootstrap semantics through actual TestingModule compilation:
 * a valid source yields a frozen, injectable config; an invalid source aborts
 * compilation with BymaxConfigValidationError before any consumer provider is
 * built; forRootAsync resolves the source through a factory with explicit
 * inject; and globality (default on, off with isGlobal:false) governs whether a
 * nested module resolves the config without importing the module.
 * Mocks: none. Sources are in-test records; the real process environment is
 * never read or mutated. No HTTP server is created and no port is bound.
 */

import { Inject, Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { BYMAX_CONFIG } from './config.tokens'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({
  server: z.object({ port: z.coerce.number().int().min(1).max(65535).default(3000) }),
  database: z.object({ url: z.url() })
})

type AppConfig = typeof schema.infer

const VALID_SOURCE: Record<string, string | undefined> = {
  DATABASE_URL: 'postgres://localhost:5432/app',
  SERVER_PORT: '4000'
}

/** Token providing the source record to a forRootAsync factory in tests. */
const SOURCE_TOKEN = Symbol('SOURCE_TOKEN')

/** A feature provider that injects the frozen config through its explicit token. */
@Injectable()
class ConfigConsumer {
  public constructor(@Inject(BYMAX_CONFIG) public readonly config: AppConfig) {}
}

/** A feature module that consumes the config without importing the config module. */
@Module({ providers: [ConfigConsumer], exports: [ConfigConsumer] })
class FeatureModule {}

/** A module that exports the async source token for forRootAsync resolution. */
@Module({
  providers: [{ provide: SOURCE_TOKEN, useValue: VALID_SOURCE }],
  exports: [SOURCE_TOKEN]
})
class SourceModule {}

describe('BymaxConfigModule integration', () => {
  it('boots a graph and injects the frozen config into a feature provider', async () => {
    /**
     * forRoot success graph.
     *
     * A valid source must compile, register the frozen config, and hand the same
     * singleton to a provider that injects BYMAX_CONFIG explicitly, with values
     * coerced per the schema.
     */
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source: VALID_SOURCE })],
      providers: [ConfigConsumer]
    }).compile()

    const consumer = moduleRef.get(ConfigConsumer)

    expect(consumer.config.server.port).toBe(4000)
    expect(consumer.config.database.url).toBe('postgres://localhost:5432/app')
    expect(Object.isFrozen(consumer.config)).toBe(true)
    expect(moduleRef.get(BYMAX_CONFIG)).toBe(consumer.config)
  })

  it('fails compilation on an invalid source before building any consumer', async () => {
    /**
     * Fail-fast bootstrap.
     *
     * An invalid source must make compile() reject with
     * BymaxConfigValidationError, and the consumer that depends on the config
     * must never be constructed, proving validation runs before any downstream
     * provider (and long before a port would be bound).
     */
    let consumersBuilt = 0
    const spyProvider = {
      provide: Symbol('SPY_CONSUMER'),
      useFactory: (config: AppConfig): AppConfig => {
        consumersBuilt += 1
        return config
      },
      inject: [BYMAX_CONFIG]
    }

    await expect(
      Test.createTestingModule({
        imports: [BymaxConfigModule.forRoot({ schema, source: {} })],
        providers: [spyProvider]
      }).compile()
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)

    expect(consumersBuilt).toBe(0)
  })

  it('resolves the source through a forRootAsync factory with explicit inject', async () => {
    /**
     * forRootAsync factory wiring.
     *
     * The source is produced by a useFactory that injects a token from an
     * imported module; the resulting config must validate and inject exactly as
     * the synchronous path does.
     */
    const moduleRef = await Test.createTestingModule({
      imports: [
        BymaxConfigModule.forRootAsync({
          imports: [SourceModule],
          useFactory: (source: Record<string, string | undefined>) => ({ schema, source }),
          inject: [SOURCE_TOKEN]
        }),
        FeatureModule
      ]
    }).compile()

    const consumer = moduleRef.get(ConfigConsumer, { strict: false })

    expect(consumer.config.server.port).toBe(4000)
    expect(consumer.config.database.url).toBe('postgres://localhost:5432/app')
  })

  it('injects the config into a nested module without an import when global', async () => {
    /**
     * Global-by-default reach.
     *
     * With the default globality, a feature module that never imports the config
     * module still resolves BYMAX_CONFIG, confirming setExtras mapped isGlobal to
     * DynamicModule.global.
     */
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source: VALID_SOURCE }), FeatureModule]
    }).compile()

    const consumer = moduleRef.get(ConfigConsumer, { strict: false })

    expect(consumer.config.database.url).toBe('postgres://localhost:5432/app')
  })

  it('does not reach a non-importing module when isGlobal is false', async () => {
    /**
     * Non-global scoping.
     *
     * With isGlobal:false the config is exported only to importers, so a feature
     * module that does not import it cannot resolve BYMAX_CONFIG and compilation
     * fails, proving globality is off rather than always-on.
     */
    await expect(
      Test.createTestingModule({
        imports: [
          BymaxConfigModule.forRoot({ schema, source: VALID_SOURCE, isGlobal: false }),
          FeatureModule
        ]
      }).compile()
    ).rejects.toThrow()
  })
})
