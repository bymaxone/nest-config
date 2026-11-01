/**
 * Unit tests for a `source` option that is present but undefined.
 *
 * Layer: unit and integration.
 * Goal: prove a host that passes a source which failed to load is told so at boot, instead of
 * the module validating `process.env` and answering success for configuration it never read.
 * Mocks: process.env is replaced with a controlled record and restored.
 */

import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { BYMAX_CONFIG } from './config.tokens'
import { defineEnv } from './define-env'

const schema = defineEnv({ server: z.object({ port: z.coerce.number().int().min(1) }) })

const realEnv = process.env

/** A loader that failed: typed as returning a source, the way a host's own helper often is. */
function loadSource(): Record<string, string> | undefined {
  return undefined
}

/** A loader that answers `null` when it finds no record, as a lookup that misses does. */
function loadNullableSource(): Record<string, string> | null {
  return null
}

/** What the failed loader hands the module, narrowed the way a host narrows it. */
const failedSource = loadSource() as Record<string, string>

afterEach(() => {
  process.env = realEnv
})

describe('a source key that is present with the value undefined', () => {
  it('throws instead of validating process.env', () => {
    /**
     * `source` is optional, so `source: loadSource()` type-checks when the loader may return
     * nothing. A source that was named and is missing must fail the boot: validating a valid
     * process.env instead would report success for configuration the host never read.
     */
    process.env = { SERVER_PORT: '3000' } as NodeJS.ProcessEnv

    expect(() => createValidatedConfig({ schema, source: failedSource })).toThrow(TypeError)
    expect(() => createValidatedConfig({ schema, source: failedSource })).toThrow(
      'source was provided but is undefined'
    )
  })

  it('throws for a null source too, as a JavaScript caller can pass', () => {
    /**
     * A loader that returns `null` (a lookup that finds nothing, a stored `null`) is the same
     * mistake as `undefined`, and the type system does not stand between it and a plain-JS host.
     */
    process.env = { SERVER_PORT: '3000' } as NodeJS.ProcessEnv
    const nullSource = loadNullableSource() as Record<string, string>

    expect(() => createValidatedConfig({ schema, source: nullSource })).toThrow(TypeError)
  })

  it('still uses process.env when the key is absent', () => {
    /** Omitting the key is the documented way to read the process environment. */
    process.env = { SERVER_PORT: '3000' } as NodeJS.ProcessEnv

    expect(createValidatedConfig({ schema }).server.port).toBe(3000)
  })

  it('fails the module at boot, before any consumer provider is built', async () => {
    /** The same refusal reaches a host through forRoot, not only the helper. */
    process.env = { SERVER_PORT: '3000' } as NodeJS.ProcessEnv

    await expect(
      Test.createTestingModule({
        imports: [BymaxConfigModule.forRoot({ schema, source: failedSource })]
      }).compile()
    ).rejects.toThrow('source was provided but is undefined')
  })

  it('fails forRootAsync the same way when the factory returns the key undefined', async () => {
    /** The factory is another way to hand the options over, and it must not be a way around. */
    process.env = { SERVER_PORT: '3000' } as NodeJS.ProcessEnv

    await expect(
      Test.createTestingModule({
        imports: [
          BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema, source: failedSource }) })
        ]
      }).compile()
    ).rejects.toThrow('source was provided but is undefined')
  })

  it('keeps BYMAX_CONFIG resolvable for a real source', async () => {
    /** A supplied source is untouched by the check. */
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source: { SERVER_PORT: '81' } })]
    }).compile()

    expect(moduleRef.get<{ server: { port: number } }>(BYMAX_CONFIG).server.port).toBe(81)
  })
})
