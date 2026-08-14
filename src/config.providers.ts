/**
 * @fileoverview The BYMAX_CONFIG provider factory: the fail-fast heart of the
 * module. It resolves the source (defaulting to `process.env`, using a custom
 * source verbatim), runs the single-pass validator, and on success returns the
 * deep-frozen typed config. On failure it invokes the observability hook
 * exactly once before rethrowing the aggregated error; the hook is
 * observability only and can never suppress or replace the failure, so a
 * misconfigured process is stopped before any consumer provider is constructed.
 * @layer Provider
 */

import type { FactoryProvider } from '@nestjs/common'

import type { BymaxConfigModuleOptions } from './config.options'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { deepFreeze } from './deep-freeze'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError } from './errors'
import type { ConfigIssue } from './errors'
import type { EnvOutput, EnvSchema, EnvShape } from './types'

/**
 * Invoke the observability hook without letting it change the outcome.
 *
 * The hook receives the collected issue list for custom reporting. Any error
 * it raises is deliberately swallowed here so the original
 * {@link BymaxConfigValidationError} remains the propagated failure; this is an
 * intentional no-op on hook errors, not a dropped error path.
 *
 * @param hook - The optional consumer-supplied reporting hook.
 * @param issues - The aggregated validation issues.
 */
function reportIssues(
  hook: ((issues: ReadonlyArray<ConfigIssue>) => void) | undefined,
  issues: ReadonlyArray<ConfigIssue>
): void {
  if (hook === undefined) return
  try {
    hook(issues)
  } catch {
    // A failing observability hook must never alter the fail-fast result; the
    // original validation error is what reaches the caller.
  }
}

/**
 * Validate the source against the schema, freeze the result, or fail fast.
 *
 * Resolves the source to the supplied record or `process.env`, runs exactly one
 * validation pass, and returns the deep-frozen typed output. On a validation
 * failure the hook runs once with the issues and the aggregated error is
 * rethrown unchanged, aborting module resolution before any consumer provider
 * is instantiated.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param options - The resolved module options (schema, source, hook, strict).
 * @returns The validated, deep-frozen configuration output.
 * @throws {BymaxConfigValidationError} When the source fails the schema.
 * @example
 * ```typescript
 * const config = createValidatedConfig({ schema: envSchema });
 * config.server.port; // typed, validated, frozen
 * ```
 */
export function createValidatedConfig<TShape extends EnvShape>(
  options: Omit<BymaxConfigModuleOptions, 'schema'> & { readonly schema: EnvSchema<TShape> }
): Readonly<EnvOutput<TShape>> {
  const source = options.source ?? process.env
  try {
    return deepFreeze(validateEnv(options.schema, source, { strict: options.strict === true }))
  } catch (error) {
    if (error instanceof BymaxConfigValidationError) {
      reportIssues(options.onValidationError, error.issues)
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
  useFactory: createValidatedConfig,
  inject: [BYMAX_CONFIG_OPTIONS]
}
