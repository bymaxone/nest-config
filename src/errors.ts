/**
 * @fileoverview Value-free error model for the configuration validation
 * pipeline: the frozen issue-code catalog, the ConfigIssue shape, and the
 * BymaxConfigValidationError aggregate. The error carries every violation as a
 * structured, immutable issue list and renders a multi-line report that never
 * echoes a raw source value.
 * @layer Error
 */

import { formatIssueReport } from './report-formatter'

/**
 * Frozen catalog of stable, machine-readable configuration error codes.
 *
 * `VALIDATION` is the top-level code carried by the thrown error; the remaining
 * three classify individual issues. Exported once and referenced everywhere so
 * no code string is ever inlined at a use site.
 *
 * @example
 * ```typescript
 * if (issue.code === ConfigErrorCode.MISSING) {
 *   // handle an absent required variable
 * }
 * ```
 */
export const ConfigErrorCode = Object.freeze({
  /** Top-level error code: one or more schema violations were collected. */
  VALIDATION: 'BYMAX_CONFIG_VALIDATION',
  /** Issue code: a required variable is absent from the source. */
  MISSING: 'BYMAX_CONFIG_MISSING',
  /** Issue code: a variable is present but violates its constraint. */
  INVALID: 'BYMAX_CONFIG_INVALID',
  /** Issue code: strict mode found a source variable matching no declared leaf. */
  UNKNOWN_KEY: 'BYMAX_CONFIG_UNKNOWN_KEY'
} as const)

/** The stable top-level code carried by {@link BymaxConfigValidationError}. */
export type ConfigValidationCode = typeof ConfigErrorCode.VALIDATION

/** Machine-readable code classifying a single {@link ConfigIssue}. */
export type ConfigIssueCode =
  | typeof ConfigErrorCode.MISSING
  | typeof ConfigErrorCode.INVALID
  | typeof ConfigErrorCode.UNKNOWN_KEY

/**
 * A single configuration violation, described entirely without any raw value.
 *
 * Every field is value-free by contract: `message` states the expected
 * constraint, never the received input, so an issue can be logged or serialized
 * without leaking a secret.
 */
export interface ConfigIssue {
  /** Nested config path, e.g. `database.url`; the namespace alone (e.g. `database`) for an unknown-key issue. */
  readonly path: string
  /** Resolved environment variable name, e.g. `DATABASE_URL`. */
  readonly variable: string
  /** Stable machine-readable classification. */
  readonly code: ConfigIssueCode
  /** Human-readable constraint description, value-free. */
  readonly message: string
}

/**
 * Aggregated, value-free configuration validation error.
 *
 * Thrown once at bootstrap when the source fails the schema. It carries every
 * violation in an immutable, structured {@link ConfigIssue} list and a
 * human-readable message that lists the offending variables and their expected
 * constraints, never their received values.
 *
 * @example
 * ```typescript
 * try {
 *   validateEnv(schema, source);
 * } catch (error) {
 *   if (error instanceof BymaxConfigValidationError) {
 *     for (const issue of error.issues) report(issue.variable, issue.code);
 *   }
 * }
 * ```
 */
export class BymaxConfigValidationError extends Error {
  /** The stable top-level error code. */
  public readonly code: ConfigValidationCode = ConfigErrorCode.VALIDATION

  /** The immutable, aggregated list of collected violations. */
  public readonly issues: ReadonlyArray<ConfigIssue>

  /**
   * Build the aggregated error from a list of value-free issues.
   *
   * @param issues - Every collected violation; copied and frozen so neither the
   * caller nor consumer code can mutate the reported list.
   */
  constructor(issues: ReadonlyArray<ConfigIssue>) {
    // Copy each issue into a fresh, frozen object carrying only the contract
    // fields, so the value-free guarantee holds structurally: even an issue
    // that arrives with an extra property cannot leak it through the report or
    // through JSON serialization of the error.
    const normalized = issues.map((issue) =>
      Object.freeze({
        path: issue.path,
        variable: issue.variable,
        code: issue.code,
        message: issue.message
      })
    )
    super(formatIssueReport(normalized))
    // Keep `name` non-enumerable so JSON.stringify(error) surfaces only the
    // code and the value-free issues, while it stays available for
    // String(error) and stack traces.
    Object.defineProperty(this, 'name', {
      value: 'BymaxConfigValidationError',
      enumerable: false,
      writable: false,
      configurable: false
    })
    this.issues = Object.freeze(normalized)
    // Restore the prototype chain so `instanceof` holds across transpilation
    // targets and ESM/CJS realm boundaries.
    Object.setPrototypeOf(this, BymaxConfigValidationError.prototype)
    // Lock the contract properties so the error is fully immutable at runtime,
    // matching the readonly type, the frozen issues, and the stable name.
    Object.defineProperty(this, 'code', { writable: false, configurable: false })
    Object.defineProperty(this, 'issues', { writable: false, configurable: false })
  }
}
