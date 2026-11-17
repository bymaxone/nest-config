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
import type { DynamicModule, Provider } from '@nestjs/common'

import { ConfigurableModuleClass } from './config.module-definition'
import type {
  BymaxConfigForRootAsyncOptions,
  BymaxConfigForRootOptions
} from './config.module-definition'
import type { BymaxConfigModuleOptions } from './config.options'
import { bymaxConfigProvider } from './config.providers'
import { ConfigService } from './config.service'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'

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
 * Drop the entries whose value is undefined or null.
 *
 * An own option key set to undefined or null means "use the default", so the key must be absent
 * for the builder's default to apply.
 *
 * @typeParam TValues - The shape of the values.
 * @param values - Options read from the host's object.
 * @returns The same entries without the undefined and null ones.
 */
function withoutNullish<TValues extends object>(values: TValues): Partial<TValues> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<TValues>
}

/**
 * Refuse a registration argument that is not an object.
 *
 * The message names the method and the type of what was passed, never the value: a primitive handed
 * over by mistake can be a secret.
 *
 * @param options - What the host passed as the whole argument.
 * @param method - The registration method, for the message.
 * @throws {TypeError} When `options` is not an object.
 */
function assertOptionsObject(options: unknown, method: string): void {
  if (typeof options === 'object' && options !== null) return
  throw new TypeError(
    `BymaxConfigModule.${method}: options must be an object, received ${options === null ? 'null' : typeof options}`
  )
}

/**
 * Refuse an option that is set but is not a boolean.
 *
 * `undefined` and `null` mean the default and pass. The message names the method, the option and
 * the type received, never the value.
 *
 * @param value - What the host passed for the option.
 * @param name - The option name, for the message.
 * @param method - The registration method, for the message.
 * @throws {TypeError} When `value` is set and is not a boolean.
 */
function assertBoolean(value: unknown, name: string, method: string): void {
  if (value === undefined || value === null || typeof value === 'boolean') return
  throw new TypeError(
    `BymaxConfigModule.${method}: ${name} must be a boolean, received ${typeof value}`
  )
}

/**
 * Read the options the module hands to the options token, by property access, so options held by an
 * object whose properties are accessors on its prototype (a class instance) are read instead of
 * lost to a copy of its own keys. Whatever else the object holds stays behind.
 *
 * `source` is the one option whose undefined or null is not a default: a `source` key that is
 * present is passed on as it is, so the provider refuses it instead of falling back to the process
 * environment, which would validate the wrong environment after a failed load.
 *
 * @param options - The options a host passed, or its factory returned.
 * @param method - The registration method, for the message of a refused argument.
 * @returns A plain object holding the options the module reads.
 */
function readModuleOptions(
  options: BymaxConfigModuleOptions,
  method: string
): BymaxConfigModuleOptions {
  assertOptionsObject(options, method)
  const { schema, source, onValidationError, strict } = options
  assertBoolean(strict, 'strict', method)
  const read: BymaxConfigModuleOptions = {
    schema,
    ...withoutNullish({ onValidationError, strict })
  }
  // The value decides first: options held by a Proxy with only a get trap answer `in` with nothing.
  // The key is asked about only when its value is undefined, to tell a key set to undefined (refused)
  // from an absent one (the process environment).
  if (source !== undefined || 'source' in options) Object.assign(read, { source })
  return read
}

/**
 * Read the synchronous registration options the module understands: the options of the token and
 * the `isGlobal` extra.
 *
 * @param options - The options a host passed to `forRoot`.
 * @returns A plain object the builder can copy.
 */
function readRegistration(options: BymaxConfigForRootOptions): BymaxConfigForRootOptions {
  const read = readModuleOptions(options, 'forRoot')
  const { isGlobal } = options
  assertBoolean(isGlobal, 'isGlobal', 'forRoot')
  return { ...read, ...withoutNullish({ isGlobal }) }
}

/**
 * Wrap the factory of the options provider so what it resolves passes through the same reader as the
 * options of `forRoot`, whichever of a factory, a class or an existing provider produced it.
 *
 * @param provider - A provider of a generated definition.
 * @returns The provider, with the options provider's factory wrapped.
 */
function readOptionsOf(provider: Provider): Provider {
  if (Reflect.get(provider, 'provide') !== BYMAX_CONFIG_OPTIONS) return provider
  const factory = Reflect.get(provider, 'useFactory')
  if (typeof factory !== 'function') return provider
  return {
    ...provider,
    useFactory: async (...args: unknown[]) =>
      readModuleOptions((await factory(...args)) as BymaxConfigModuleOptions, 'forRootAsync')
  } as Provider
}

/**
 * Read the asynchronous registration options the module understands, by property access.
 *
 * @param options - The options a host passed to `forRootAsync`.
 * @returns A plain object the builder can copy.
 */
function readAsyncRegistration(
  options: BymaxConfigForRootAsyncOptions
): BymaxConfigForRootAsyncOptions {
  assertOptionsObject(options, 'forRootAsync')
  const {
    useFactory,
    useClass,
    useExisting,
    inject,
    imports,
    provideInjectionTokensFrom,
    isGlobal
  } = options
  assertBoolean(isGlobal, 'isGlobal', 'forRootAsync')
  return withoutNullish({
    useFactory,
    useClass,
    useExisting,
    inject,
    imports,
    provideInjectionTokensFrom,
    isGlobal
  })
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
    return BymaxConfigModule.withConfigProvider(super.forRoot(readRegistration(options)))
  }

  /**
   * Register the module asynchronously, resolving options through a factory.
   *
   * @param options - The async options with `useFactory` and explicit `inject`.
   * @returns The dynamic module augmented with the frozen config provider.
   */
  public static override forRootAsync(options: BymaxConfigForRootAsyncOptions): DynamicModule {
    return BymaxConfigModule.withConfigProvider(super.forRootAsync(readAsyncRegistration(options)))
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
      providers: appendTo(
        definition.providers?.map(readOptionsOf),
        bymaxConfigProvider,
        ConfigService
      ),
      exports: appendTo(definition.exports, BYMAX_CONFIG, ConfigService)
    }
  }
}
