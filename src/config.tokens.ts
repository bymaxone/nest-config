/**
 * @fileoverview Symbol dependency-injection tokens for the configuration
 * module. Both tokens are module-local Symbols, never strings and never
 * registered in the global symbol registry, so their identity is unique across
 * realms and cannot collide with another provider's token. Every injection site
 * references these constants through an explicit `@Inject(...)`.
 * @layer Constants
 */

/**
 * Injection token for the resolved {@link BymaxConfigModuleOptions}.
 *
 * The `forRoot` value provider and the `forRootAsync` factory both register the
 * options object under this token; the config provider factory injects it to
 * read the schema, source, hook, and strict flag.
 *
 * @example
 * ```typescript
 * constructor(@Inject(BYMAX_CONFIG_OPTIONS) options: BymaxConfigModuleOptions) {}
 * ```
 */
export const BYMAX_CONFIG_OPTIONS = Symbol('BYMAX_CONFIG_OPTIONS')

/**
 * Injection token for the deep-frozen, validated configuration object.
 *
 * The provider factory registers the parsed, frozen config under this token and
 * the module exports it, so consumers (and the typed accessor) can inject the
 * validated config directly for factory-style wiring.
 *
 * @example
 * ```typescript
 * constructor(@Inject(BYMAX_CONFIG) config: Readonly<AppConfig>) {}
 * ```
 */
export const BYMAX_CONFIG = Symbol('BYMAX_CONFIG')
