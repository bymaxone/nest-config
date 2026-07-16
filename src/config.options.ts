/**
 * @fileoverview Public options contract for the BymaxConfigModule dynamic
 * module: the schema to validate against, an optional raw source (defaulting to
 * `process.env` inside the provider factory), an optional value-free
 * observability hook invoked before the fail-fast throw, and an optional strict
 * unknown-key flag. This file declares only types and carries no runtime code.
 * @layer Types
 */

import type { ConfigIssue } from './errors'
import type { EnvSchema } from './types'

/**
 * Registration options for {@link BymaxConfigModule}.
 *
 * Passed to `forRoot` directly or produced by a `forRootAsync` factory. Only the
 * schema is required; the remaining fields tune the source, observability, and
 * strictness of the single bootstrap-time validation.
 *
 * @typeParam TSchema - The schema produced by `defineEnv`, carrying the inferred
 * configuration type.
 * @example
 * ```typescript
 * BymaxConfigModule.forRoot({ schema: envSchema, strict: true });
 * ```
 */
export interface BymaxConfigModuleOptions<TSchema extends EnvSchema = EnvSchema> {
  /** Schema produced by `defineEnv`. Required. */
  readonly schema: TSchema

  /**
   * Raw source record. Defaults to `process.env` in the provider factory.
   * Injectable for tests and tooling; a supplied source is used verbatim, with
   * no `process.env` fallback or merge.
   */
  readonly source?: Record<string, string | undefined>

  /**
   * Observability hook invoked once with the structured, value-free issue list
   * immediately before the validation error is thrown. It is observability
   * only and cannot suppress the failure: the error still propagates even when
   * the hook itself throws.
   */
  readonly onValidationError?: (issues: ReadonlyArray<ConfigIssue>) => void

  /**
   * When true, source variables that match a declared namespace prefix but no
   * declared leaf produce `BYMAX_CONFIG_UNKNOWN_KEY` issues. Defaults to false.
   */
  readonly strict?: boolean
}
