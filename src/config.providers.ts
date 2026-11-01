/**
 * @fileoverview The BYMAX_CONFIG provider factory: the fail-fast heart of the
 * module. It resolves the source (defaulting to `process.env`, using a custom
 * source verbatim), runs the single-pass validator, and on success returns the
 * deep-frozen typed config. On failure the factory runs the observability hook
 * and waits for it, then rethrows the aggregated error; the hook is
 * observability only and can never suppress or replace the failure, so a
 * misconfigured process is stopped before any consumer provider is constructed.
 * A failing hook is recorded as the `cause` of that same error.
 * @layer Provider
 */

import type { FactoryProvider } from '@nestjs/common'

import type { BymaxConfigModuleOptions } from './config.options'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { deepFreeze } from './deep-freeze'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError } from './errors'
import type { EnvOutput, EnvSchema, EnvShape } from './types'

/**
 * Run the observability hook, wait for it, and keep its failure from changing the outcome.
 *
 * The hook receives the collected issue list for custom reporting and may return a
 * promise. Whatever it throws or rejects with is attached to the validation error as its
 * non-enumerable `cause`, so the original {@link BymaxConfigValidationError} remains the
 * propagated failure, with the same class, code, issues and message, and the hook's
 * failure is still on record. Nothing here can reject.
 *
 * @param hook - The optional consumer-supplied reporting hook.
 * @param error - The validation error whose issues the hook receives.
 */
async function reportIssues(
  hook: BymaxConfigModuleOptions['onValidationError'],
  error: BymaxConfigValidationError
): Promise<void> {
  if (hook === undefined) return
  try {
    await hook(error.issues)
  } catch (hookError) {
    Object.defineProperty(error, 'cause', {
      value: hookError,
      enumerable: false,
      writable: false,
      configurable: false
    })
  }
}

/**
 * Validate the source against the schema, freeze the result, or throw.
 *
 * Resolves the source to the supplied record or `process.env`, runs exactly one
 * validation pass, and returns the deep-frozen typed output. A validation failure is
 * thrown as the aggregated error; the observability hook belongs to the provider factory,
 * which can wait for it, and this synchronous function never calls it.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param options - The resolved module options (schema, source, strict).
 * @returns The validated, deep-frozen configuration output.
 * @throws {BymaxConfigValidationError} When the source fails the schema.
 * @example
 * ```typescript
 * const config = createValidatedConfig({ schema: envSchema });
 * config.server.port; // typed, validated, frozen
 * ```
 */
export function createValidatedConfig<TShape extends EnvShape>(
  options: Omit<BymaxConfigModuleOptions, 'schema' | 'onValidationError'> & {
    readonly schema: EnvSchema<TShape>
  }
): Readonly<EnvOutput<TShape>> {
  if ('source' in options && options.source === undefined) {
    throw new TypeError(
      'BymaxConfigModule: source was provided but is undefined; omit the key to validate ' +
        'process.env, or pass the source that failed to load'
    )
  }
  const source = options.source ?? process.env
  return deepFreeze(validateEnv(options.schema, source, { strict: options.strict === true }))
}

/**
 * Validate for the module: the same result as {@link createValidatedConfig}, and on a
 * validation failure the hook runs and is awaited before the aggregated error is rethrown,
 * aborting module resolution before any consumer provider is instantiated.
 *
 * @param options - The resolved module options (schema, source, hook, strict).
 * @returns The validated, deep-frozen configuration output.
 * @throws {BymaxConfigValidationError} When the source fails the schema.
 */
async function provideValidatedConfig(
  options: BymaxConfigModuleOptions
): Promise<Readonly<EnvOutput<EnvShape>>> {
  try {
    return createValidatedConfig(options)
  } catch (error) {
    if (error instanceof BymaxConfigValidationError) {
      await reportIssues(options.onValidationError, error)
    }
    throw error
  }
}

/**
 * Factory provider that registers the validated, frozen config under
 * {@link BYMAX_CONFIG}, injecting the resolved options via
 * {@link BYMAX_CONFIG_OPTIONS}.
 */
export const bymaxConfigProvider: FactoryProvider = {
  provide: BYMAX_CONFIG,
  useFactory: provideValidatedConfig,
  inject: [BYMAX_CONFIG_OPTIONS]
}
