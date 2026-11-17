/**
 * Completeness tests for the registration options BymaxConfigModule reads.
 *
 * Layer: unit.
 * Goal: pin that every key of the registration option types survives the module's by-property-access
 * read, so a key added to the types later cannot be dropped silently. The full option objects are
 * written with `satisfies Required<...>`, which stops compiling when a key is added to a type, and
 * the rows must name exactly the keys of those objects, so the new key needs a row that observes it.
 * Mocks: none.
 */

import type { DynamicModule } from '@nestjs/common'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import type {
  BymaxConfigForRootAsyncOptions,
  BymaxConfigForRootOptions
} from './config.module-definition'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const source = { APP_NAME: 'ok' }
const hook = jest.fn()

/** The provider a module registers under the options token, whichever form the builder gave it. */
function optionsProvider(module: DynamicModule): Record<string, unknown> {
  const found = (module.providers ?? []).find(
    (provider) => Reflect.get(provider, 'provide') === BYMAX_CONFIG_OPTIONS
  )
  if (found === undefined) throw new Error('no provider under the options token')
  return { ...found }
}

/** The value the options provider carries for the synchronous options. */
function optionsValue(module: DynamicModule): Record<string, unknown> {
  return optionsProvider(module)['useValue'] as Record<string, unknown>
}

/** Whether a module registers a provider whose own property `key` is `value`. */
function registers(module: DynamicModule, key: string, value: unknown): boolean {
  return (module.providers ?? []).some(
    (provider) =>
      typeof provider === 'object' && provider !== null && Reflect.get(provider, key) === value
  )
}

describe('every synchronous registration option survives the read', () => {
  const full = {
    schema,
    source,
    onValidationError: hook,
    strict: true,
    isGlobal: false
  } satisfies Required<BymaxConfigForRootOptions>

  const rows: ReadonlyArray<
    readonly [keyof typeof full, (module: DynamicModule) => unknown, unknown]
  > = [
    ['schema', (module) => optionsValue(module)['schema'], schema],
    ['source', (module) => optionsValue(module)['source'], source],
    ['onValidationError', (module) => optionsValue(module)['onValidationError'], hook],
    ['strict', (module) => optionsValue(module)['strict'], true],
    ['isGlobal', (module) => module.global, false]
  ]

  it('has a row for exactly the keys of the full options object', () => {
    expect(rows.map(([key]) => key).sort()).toEqual(Object.keys(full).sort())
  })

  it.each(rows)('forRoot carries %s through to the module', (_key, observe, expected) => {
    const module = BymaxConfigModule.forRoot(full)

    expect(observe(module)).toBe(expected)
  })
})

describe('every asynchronous registration option survives the read', () => {
  class Dependency {}
  class Feature {}
  class OptionsFactory {
    public create(): BymaxConfigForRootOptions {
      return { schema, source }
    }
  }
  const useFactory = (): BymaxConfigForRootOptions => ({ schema, source })

  const full = {
    useFactory,
    useClass: OptionsFactory,
    useExisting: OptionsFactory,
    inject: [Dependency],
    imports: [Feature],
    provideInjectionTokensFrom: [{ provide: Dependency, useValue: 1 }],
    isGlobal: false
  } satisfies Required<BymaxConfigForRootAsyncOptions>

  /** Options holding one key under test, with a factory where the key does not provide one. */
  const only = (options: Partial<typeof full>): BymaxConfigForRootAsyncOptions => ({
    ...('useFactory' in options || 'useClass' in options || 'useExisting' in options
      ? {}
      : { useFactory }),
    ...options
  })

  const rows: ReadonlyArray<
    readonly [keyof typeof full, Partial<typeof full>, (module: DynamicModule) => boolean]
  > = [
    [
      'useFactory',
      { useFactory },
      (module) => optionsProvider(module)['useFactory'] === useFactory
    ],
    [
      'useClass',
      { useClass: OptionsFactory },
      (module) => registers(module, 'useClass', OptionsFactory)
    ],
    [
      'useExisting',
      { useExisting: OptionsFactory },
      (module) => (optionsProvider(module)['inject'] as unknown[]).includes(OptionsFactory)
    ],
    [
      'inject',
      { inject: [Dependency] },
      (module) => (optionsProvider(module)['inject'] as unknown[]).includes(Dependency)
    ],
    ['imports', { imports: [Feature] }, (module) => (module.imports ?? []).includes(Feature)],
    [
      'provideInjectionTokensFrom',
      { inject: [Dependency], provideInjectionTokensFrom: full.provideInjectionTokensFrom },
      (module) => registers(module, 'provide', Dependency)
    ],
    ['isGlobal', { isGlobal: false }, (module) => module.global === false]
  ]

  it('has a row for exactly the keys of the full options object', () => {
    expect(rows.map(([key]) => key).sort()).toEqual(Object.keys(full).sort())
  })

  it.each(rows)('forRootAsync carries %s through to the module', (_key, options, observe) => {
    const module = BymaxConfigModule.forRootAsync(only(options))

    expect(observe(module)).toBe(true)
  })
})
