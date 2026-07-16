/**
 * @fileoverview BymaxConfigModule: the dynamic module consumers import once via
 * `forRoot` / `forRootAsync`. It extends the generated ConfigurableModuleClass,
 * inheriting the `isGlobal` extra mapping, and augments each returned definition
 * with the validated, deep-frozen BYMAX_CONFIG provider and the typed
 * ConfigService accessor, so the config is produced (and validation runs) as
 * part of module resolution and both surfaces are exported for consumers.
 * @layer Module
 */

import { Module } from '@nestjs/common'
import type { DynamicModule } from '@nestjs/common'

import { ConfigurableModuleClass } from './config.module-definition'
import type {
  BymaxConfigForRootAsyncOptions,
  BymaxConfigForRootOptions
} from './config.module-definition'
import { bymaxConfigProvider } from './config.providers'
import { ConfigService } from './config.service'
import { BYMAX_CONFIG } from './config.tokens'

/**
 * Append items to a possibly-absent module-definition list.
 *
 * The builder returns `providers` populated and `exports` absent, so both the
 * present-list and absent-list cases occur; this normalizes each to a fresh
 * array with the items appended.
 *
 * @typeParam TItem - The element type of the list.
 * @param list - The existing list, or undefined when the builder omitted it.
 * @param items - The items to append.
 * @returns A new array containing the existing items followed by `items`.
 */
function appendTo<TItem>(list: readonly TItem[] | undefined, ...items: TItem[]): TItem[] {
  return list === undefined ? [...items] : [...list, ...items]
}

/**
 * NestJS dynamic module exposing typed, validated environment configuration.
 *
 * Import it once (typically in `AppModule`) with `forRoot` for a static schema
 * or `forRootAsync` when the source is resolved through other providers. It is
 * global by default; pass `isGlobal: false` to scope it to a submodule. Either
 * entry point registers and exports the frozen {@link BYMAX_CONFIG} provider.
 *
 * @example
 * ```typescript
 * @Module({ imports: [BymaxConfigModule.forRoot({ schema: envSchema })] })
 * export class AppModule {}
 * ```
 */
@Module({})
export class BymaxConfigModule extends ConfigurableModuleClass {
  /**
   * Register the module synchronously from a static schema.
   *
   * @param options - The module options plus the optional `isGlobal` extra.
   * @returns The dynamic module augmented with the frozen config provider.
   */
  public static override forRoot(options: BymaxConfigForRootOptions): DynamicModule {
    return BymaxConfigModule.withConfigProvider(super.forRoot(options))
  }

  /**
   * Register the module asynchronously, resolving options through a factory.
   *
   * @param options - The async options with `useFactory` and explicit `inject`.
   * @returns The dynamic module augmented with the frozen config provider.
   */
  public static override forRootAsync(options: BymaxConfigForRootAsyncOptions): DynamicModule {
    return BymaxConfigModule.withConfigProvider(super.forRootAsync(options))
  }

  /**
   * Append the config provider and typed accessor to a generated definition.
   *
   * Registers the frozen {@link BYMAX_CONFIG} provider and the {@link ConfigService}
   * accessor (which injects that token), then exports both so consumers can
   * inject either the raw frozen object or the typed service.
   *
   * @param definition - The dynamic module produced by the builder base class.
   * @returns A definition that provides and exports {@link BYMAX_CONFIG} and
   * {@link ConfigService}.
   */
  private static withConfigProvider(definition: DynamicModule): DynamicModule {
    return {
      ...definition,
      providers: appendTo(definition.providers, bymaxConfigProvider, ConfigService),
      exports: appendTo(definition.exports, BYMAX_CONFIG, ConfigService)
    }
  }
}
