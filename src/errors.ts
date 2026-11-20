/**
 * @fileoverview Error model for the configuration validation pipeline: the
 * frozen issue-code catalog, the ConfigIssue shape, and the
 * BymaxConfigValidationError aggregate. The error carries every violation as a
 * structured, immutable issue list and renders a multi-line report that never
 * echoes a raw source value of its own — see {@link ConfigIssue} for the one
 * exception, a message written by the schema author.
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

/** The longest text an issue carries in a field; the rest is cut and marked with an ellipsis. */
const MAX_FIELD_LENGTH = 200

/**
 * Characters that change how text reads on a terminal or in a log line without being visible, by
 * Unicode category: the controls (`Cc`: C0, DEL, C1, so ESC, CR, LF and NEL), the format characters
 * (`Cf`: the soft hyphen, the Arabic letter mark, the zero-width and directional marks, the
 * bidirectional embeddings and isolates, the invisible operators, the byte order mark), and the line
 * and paragraph separators (`Zl`, `Zp`).
 */
const UNSAFE_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

/**
 * Make text taken from the host safe to print: each character that changes how a line reads is
 * written as a `\uXXXX` escape, and the text is cut at {@link MAX_FIELD_LENGTH} characters of output
 * with an ellipsis, so an issue field cannot flood or rewrite a log line. A whole escape is never cut.
 *
 * @param text - A variable name, path or message that can come from the host.
 * @returns The text, escaped and bounded.
 */
function printable(text: string): string {
  let out = ''
  for (const character of text) {
    const piece = UNSAFE_CHARACTER.test(character)
      ? `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
      : character
    if (out.length + piece.length > MAX_FIELD_LENGTH) return `${out}…`
    out += piece
  }
  return out
}

/** The stable top-level code carried by {@link BymaxConfigValidationError}. */
export type ConfigValidationCode = typeof ConfigErrorCode.VALIDATION

/** Machine-readable code classifying a single {@link ConfigIssue}. */
export type ConfigIssueCode =
  | typeof ConfigErrorCode.MISSING
  | typeof ConfigErrorCode.INVALID
  | typeof ConfigErrorCode.UNKNOWN_KEY

/**
 * A single configuration violation, described for the operator who must fix it.
 *
 * Every description this package generates is value-free by contract: `message`
 * states the expected constraint, never the received input, so an issue can be
 * logged or serialized without leaking a secret.
 *
 * The one exception is the message a schema author attaches to a `custom` issue
 * (`.check`, `.refine`, `.superRefine`), which is reported as written because it
 * is the only statement of a rule that has no structural constraint to describe.
 * A message that interpolates the received value therefore carries that value
 * into the report; keeping an authored message value-free is the author's call.
 *
 * Every text field is escaped and bounded when the error is built: a character that
 * changes how a line reads is written as a `\uXXXX` escape, and a field over 200
 * characters ends with an ellipsis.
 */
export interface ConfigIssue {
  /** Nested config path, e.g. `database.url`; the namespace alone (e.g. `database`) for an unknown-key issue. */
  readonly path: string
  /** Resolved environment variable name, e.g. `DATABASE_URL`. */
  readonly variable: string
  /** Stable machine-readable classification. */
  readonly code: ConfigIssueCode
  /** Human-readable constraint description; value-free unless a schema author's own `custom` message says otherwise. */
  readonly message: string
}

/**
 * Aggregated configuration validation error.
 *
 * Thrown once at bootstrap when the source fails the schema. It carries every
 * violation in an immutable, structured {@link ConfigIssue} list and a
 * human-readable message that lists the offending variables and their expected
 * constraints, never their received values — except where a schema author's own
 * `custom` message says otherwise, as described on {@link ConfigIssue}.
 *
 * `code` and `issues` are its only own enumerable properties, so a structured
 * logger that copies own enumerables keeps both; passing `error.stack` instead of
 * the error keeps neither.
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
   * Build the aggregated error from the collected issues.
   *
   * @param issues - Every collected violation; copied and frozen so neither the
   * caller nor consumer code can mutate the reported list.
   */
  constructor(issues: ReadonlyArray<ConfigIssue>) {
    // Copy each issue into a fresh, frozen object carrying only the four
    // contract fields, so the shape holds structurally: even an issue that
    // arrives with an extra property cannot leak it through the report or
    // through JSON serialization of the error.
    const normalized = issues.map((issue) =>
      Object.freeze({
        path: printable(issue.path),
        variable: printable(issue.variable),
        code: issue.code,
        message: printable(issue.message)
      })
    )
    super(formatIssueReport(normalized))
    // Keep `name` non-enumerable so JSON.stringify(error) surfaces only the
    // code and the collected issues, while it stays available for
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
