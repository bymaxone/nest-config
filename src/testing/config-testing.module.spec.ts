/**
 * Integration tests for configTestingModule against a real Nest testing graph.
 *
 * Layer: integration.
 * Goal: prove the wrapper compiles inside `Test.createTestingModule`, delegates
 * to the production registration path, and makes both the typed `ConfigService`
 * and the raw frozen `BYMAX_CONFIG` injectable with the synthesized and
 * overridden values. No process environment is read and no port is bound.
 * Mocks: none.
 */

import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { ConfigService } from '../config.service'
import { BYMAX_CONFIG } from '../config.tokens'
import { defineEnv } from '../define-env'
import { configTestingModule } from './config-testing.module'

const schema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000)
  }),
  database: z.object({ url: z.url() })
})

type AppConfig = typeof schema.infer

describe('configTestingModule', () => {
  it('compiles and resolves ConfigService with overridden values', async () => {
    // Scenario: importing the module into a testing graph exposes the typed
    // accessor, reflecting the override and the synthesized placeholder.
    const moduleRef = await Test.createTestingModule({
      imports: [configTestingModule(schema, { server: { port: 8080 } })]
    }).compile()

    const config = moduleRef.get<ConfigService<AppConfig>>(ConfigService)
    expect(config.get('server.port')).toBe(8080)
    expect(config.get('database.url')).toBe('https://placeholder.local')
  })

  it('exposes the frozen BYMAX_CONFIG object for direct injection', async () => {
    // Scenario: the raw frozen config is injectable and reflects schema defaults
    // when no override is supplied.
    const moduleRef = await Test.createTestingModule({
      imports: [configTestingModule(schema)]
    }).compile()

    const raw = moduleRef.get<AppConfig>(BYMAX_CONFIG)
    expect(raw.server.port).toBe(3000)
    expect(Object.isFrozen(raw)).toBe(true)
  })
})
