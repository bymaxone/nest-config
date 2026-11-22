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

import { inspect } from 'node:util'

import { Logger } from '@nestjs/common'
import type { FactoryProvider } from '@nestjs/common'

import type { BymaxConfigModuleOptions } from './config.options'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { deepFreeze } from './deep-freeze'
import { guarded, toWithheldIssue, validateEnv, withCause } from './env-validator'
import { isLibraryError, libraryError } from './errors'
import type { BymaxConfigValidationError, ConfigIssue } from './errors'
import { bare, hasOption, readOption } from './option-read'
import type { EnvOutput, EnvSchema, EnvShape } from './types'

/** The stable event of the object message written when the validation fails. */
const VALIDATION_FAILED_EVENT = 'CONFIG_VALIDATION_FAILED'

/** The logger the validation failure is written to, under the module's own context. */
const logger = new Logger('BymaxConfig')

/**
 * The options the provider receives from the module: the module's reader has already dropped a hook
 * that was undefined or null, so what is left is a function or absent.
 */
type ProvidedOptions = Omit<BymaxConfigModuleOptions, 'onValidationError'> & {
  readonly onValidationError?: (issues: ReadonlyArray<ConfigIssue>) => unknown
}

/** What `util.inspect` prints for the configuration root, in place of its values. */
const REDACTED_ROOT = '[BymaxConfig: values redacted]'

/**
 * Make the configuration root print and serialize without its values.
 *
 * `console.log`, `util.format` and Nest's text `ConsoleLogger` render an object through
 * `util.inspect`, and the root holds every secret the application declared, so it carries a
 * `util.inspect.custom` marker. A JSON logger, or `JSON.stringify`, serializes through `toJSON`
 * when an object has one, so the root carries one that returns the declared namespace names and no
 * value, as `ConfigService` does. Both are defined with the defaults of `Object.defineProperty`:
 * not enumerable, not writable, not configurable. `Object.keys`, spread and equality therefore
 * exclude them, and so does a copy made by spread or `Object.assign`, whose serialization shows
 * the values again. A logger that spreads the enumerable keys of the root itself, as pino does
 * when it is handed as the merge object, prints the values too. It covers the root only: a
 * namespace printed or serialized directly shows its values. It is defined before the freeze, and
 * `assertNamespaces` keeps a namespace from taking the name `toJSON`.
 *
 * @param root - The validated output, not yet frozen.
 * @returns The same reference.
 */
function redactRoot<T extends object>(root: T): T {
  Object.defineProperty(root, inspect.custom, { value: () => REDACTED_ROOT })
  Object.defineProperty(root, 'toJSON', {
    value: () => ({ service: 'BymaxConfig', namespaces: Object.keys(root) })
  })
  return root
}

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
  hook: ProvidedOptions['onValidationError'],
  error: BymaxConfigValidationError
): Promise<void> {
  if (hook === undefined) return
  try {
    await hook(error.issues)
  } catch (hookError) {
    // A refused host read already carries what the host threw as its cause, even `undefined`, and keeps it.
    if (!('cause' in error)) withCause(error, hookError)
  }
}

/**
 * Refuse an option that is set but is not a boolean.
 *
 * `undefined` and `null` mean the default and pass. The message names where the option was read, the
 * option and the type received, never the value.
 *
 * @param value - What the host passed for the option.
 * @param name - The option name, for the message.
 * @param where - The entry point that read it, for the message.
 * @throws {TypeError} When `value` is set and is not a boolean.
 */
export function assertBoolean(value: unknown, name: string, where: string): void {
  if (value === undefined || value === null || typeof value === 'boolean') return
  throw new TypeError(`${where}: ${name} must be a boolean, received ${typeof value}`)
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
 * @throws {BymaxConfigValidationError} When the source fails the schema, or when freezing the
 * validated result throws.
 * @throws {TypeError} When `source` is present with the value `undefined` or `null`, which would
 * otherwise validate `process.env` in place of the source that failed to load, or when `strict` is set
 * and is not a boolean. `strict` is read once, so an accessor cannot pass this check and then answer
 * differently to the validation.
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
  const read = guarded('reading the options', () => {
    const schema = readOption(options, 'schema') as typeof options.schema
    const source = readOption(options, 'source') as typeof options.source
    const strict = readOption(options, 'strict') as typeof options.strict
    return {
      schema,
      source,
      strict,
      refused: (source === undefined || source === null) && hasOption(options, 'source')
    }
  })
  assertBoolean(read.strict, 'strict', 'createValidatedConfig')
  if (read.refused) {
    throw new TypeError(
      'BymaxConfigModule: source was provided but is undefined or null; omit the key to ' +
        'validate process.env, or pass the source that failed to load'
    )
  }
  const validated = validateEnv(read.schema, read.source ?? process.env, {
    strict: read.strict === true
  })
  try {
    return deepFreeze(redactRoot(validated))
  } catch (thrown) {
    throw libraryError([toWithheldIssue('freezing the validated configuration', thrown)])
  }
}

/**
 * Validate for the module: the same result as {@link createValidatedConfig}, and on a
 * validation failure the hook runs and is awaited before the aggregated error is rethrown,
 * aborting module resolution before any consumer provider is instantiated.
 *
 * On a validation failure it writes one object message, the stable event and the number of issues
 * and never a value, before the hook runs.
 *
 * @param options - The resolved module options (schema, source, hook, strict).
 * @returns The validated, deep-frozen configuration output.
 * @throws {BymaxConfigValidationError} When the source fails the schema.
 */
async function provideValidatedConfig(
  options: ProvidedOptions
): Promise<Readonly<EnvOutput<EnvShape>>> {
  try {
    return createValidatedConfig(options)
  } catch (error) {
    if (isLibraryError(error)) {
      // The Nest `Logger` forwards to a host-installed logger and drops what it returns, so only a
      // synchronous throw can reach this point; it must not replace the validation error or skip the hook.
      try {
        logger.error({
          event: VALIDATION_FAILED_EVENT,
          message: 'environment validation failed',
          issues: error.issues.length
        })
      } catch {
        // A faulty logger must never replace the failure it reports.
      }
      await reportIssues(
        readOption(options, 'onValidationError') as ProvidedOptions['onValidationError'],
        error
      )
    }
    throw error
  }
}

/**
 * Factory provider that registers the validated, frozen config under
 * {@link BYMAX_CONFIG}, injecting the resolved options via
 * {@link BYMAX_CONFIG_OPTIONS}.
 */
export const bymaxConfigProvider: FactoryProvider = bare({
  provide: BYMAX_CONFIG,
  useFactory: provideValidatedConfig,
  inject: [BYMAX_CONFIG_OPTIONS]
})
