/**
 * Unit tests for BymaxConfigModule registration shape.
 *
 * Layer: unit.
 * Goal: prove forRoot produces a global DynamicModule by default, honors
 * isGlobal:false to opt out of globality, and that forRootAsync registers an
 * async options provider under BYMAX_CONFIG_OPTIONS with the caller's inject
 * list. These assert the module definition, not yet the validation behavior.
 * Mocks: none.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { ConfigService } from './config.service'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'

const schema = defineEnv({
  server: z.object({ port: z.coerce.number().int().default(3000) })
})

/**
 * Find the provider registered under a token in a DynamicModule.
 *
 * @param providers - The DynamicModule providers array.
 * @param token - The injection token to look up.
 * @returns The matching provider, or undefined when absent.
 */
function findProvider(
  providers: unknown[] | undefined,
  token: symbol
): Record<string, unknown> | undefined {
  return (providers ?? [])
    .filter(
      (provider): provider is Record<string, unknown> =>
        typeof provider === 'object' && provider !== null
    )
    .find((provider) => provider['provide'] === token)
}

describe('BymaxConfigModule registration', () => {
  it('produces a global dynamic module by default', () => {
    /**
     * Global-by-default registration.
     *
     * The common case imports the module once in AppModule and expects the
     * config available everywhere, so forRoot must map the default isGlobal
     * extra to DynamicModule.global === true.
     */
    const dynamic = BymaxConfigModule.forRoot({ schema })

    expect(dynamic.module).toBe(BymaxConfigModule)
    expect(dynamic.global).toBe(true)
    expect(findProvider(dynamic.providers, BYMAX_CONFIG_OPTIONS)).toBeDefined()
  })

  it('provides and exports the frozen config and the typed accessor', () => {
    /**
     * Consumption surface exposure.
     *
     * Both the raw frozen BYMAX_CONFIG provider and the ConfigService class must
     * be registered as providers and re-exported, so a downstream module can
     * inject either the frozen object or the typed accessor. This pins the
     * public DI contract the accessor phase adds to the module.
     */
    const dynamic = BymaxConfigModule.forRoot({ schema })

    expect(dynamic.providers).toContain(ConfigService)
    expect(dynamic.exports).toContain(ConfigService)
    expect(dynamic.exports).toContain(BYMAX_CONFIG)
    expect(findProvider(dynamic.providers, BYMAX_CONFIG)).toBeDefined()
  })

  it('disables globality when isGlobal is false', () => {
    /**
     * Opt-out of globality.
     *
     * An application may intentionally scope configuration to a submodule; the
     * isGlobal:false extra must flow through setExtras to global === false with
     * no global decorator involved.
     */
    const dynamic = BymaxConfigModule.forRoot({ schema, isGlobal: false })

    expect(dynamic.global).toBe(false)
  })

  it('registers an async options provider with the caller inject list', () => {
    /**
     * forRootAsync factory wiring.
     *
     * Async registration resolves the options through a useFactory with an
     * explicit inject list; the generated provider must bind to
     * BYMAX_CONFIG_OPTIONS and carry the factory so other providers can supply
     * the source.
     */
    const dynamic = BymaxConfigModule.forRootAsync({
      useFactory: () => ({ schema }),
      inject: []
    })

    const optionsProvider = findProvider(dynamic.providers, BYMAX_CONFIG_OPTIONS)

    expect(dynamic.global).toBe(true)
    expect(optionsProvider).toBeDefined()
    expect(typeof optionsProvider?.['useFactory']).toBe('function')
  })
})
