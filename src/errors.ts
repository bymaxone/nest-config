/**
 * @fileoverview Error model for the configuration validation pipeline: the
 * frozen issue-code catalog, the ConfigIssue shape, and the
 * BymaxConfigValidationError aggregate. The error carries every violation as a
 * structured, immutable issue list and renders a multi-line report that never
 * echoes a raw source value of its own — see {@link ConfigIssue} for the one
 * exception, a message written by the schema author.
 * @layer Error
 */

import { padStart, weakSetAdd, weakSetHas } from './captured'
import { bare } from './option-read'
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
 * The built-ins the copy and the escaping of an issue read with (`codePointAt`, `fromCodePoint`, the regex
 * `exec`, `Reflect.get` and `Reflect.set`), taken at load so that a later replacement is not followed.
 */
const codePointAt = String.prototype.codePointAt
const fromCodePoint = String.fromCodePoint
const execUnsafe = RegExp.prototype.exec
const reflectGet = Reflect.get
const reflectSet = Reflect.set
const nativeApplyAtLoad = Reflect.apply

/**
 * Characters that change how text reads on a terminal or in a log line without being visible, by
 * Unicode category: the controls (`Cc`: C0, DEL, C1, so ESC, CR, LF and NEL), a lone surrogate (`Cs`), the format characters
 * (`Cf`: the soft hyphen, the Arabic letter mark, the zero-width and directional marks, the
 * bidirectional embeddings and isolates, the invisible operators, the byte order mark), and the line
 * and paragraph separators (`Zl`, `Zp`).
 */
const UNSAFE_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u

/**
 * Make text taken from the host safe to print: each character that changes how a line reads is
 * written as a `\uXXXX` escape (`\u{XXXXX}` past U+FFFF), and the text is cut at {@link MAX_FIELD_LENGTH} characters of output
 * with an ellipsis, so an issue field cannot flood or rewrite a log line. A whole escape is never cut.
 *
 * @param text - A variable name, path or message that can come from the host.
 * @returns The text, escaped and bounded.
 */
function printable(text: string): string {
  let out = ''
  // By index, with `codePointAt` and `fromCodePoint` taken when the module loaded, so a host that replaced
  // the String iterator or either method afterwards does not change which characters are read.
  for (let at = 0; at < text.length;) {
    const code = nativeApplyAtLoad(codePointAt, text, [at]) as number
    const character = fromCodePoint(code)
    at += character.length
    const hex = code.toString(16)
    // A code point past U+FFFF is braced, so its escape cannot be read as a shorter one plus a digit.
    const piece =
      nativeApplyAtLoad(execUnsafe, UNSAFE_CHARACTER, [character]) !== null
        ? hex.length > 4
          ? `\\u{${hex}}`
          : `\\u${padStart(hex, 4, '0')}`
        : character
    if (out.length + piece.length > MAX_FIELD_LENGTH) return `${out}…`
    out += piece
  }
  return out
}

/** The most issues one error carries; a longer list is refused rather than copied. */
const MAX_ISSUES = 10_000

/**
 * Whether a property name is an array index, which is what makes an own key an entry the list holds: a
 * canonical whole number below 2**32 - 1. Converting to an unsigned 32-bit integer and back leaves exactly
 * those names unchanged, but for 2**32 - 1 itself, which is the length limit and not an index.
 *
 * @param key - An own property name of the list.
 * @returns True when the name is an array index.
 */
function isIndexKey(key: string): boolean {
  const index = Number(key) >>> 0
  return index !== 4_294_967_295 && String(index) === key
}

/**
 * Run a read of the host's list. What it throws is the host's own code failing, and its message can carry
 * the value, so it is refused with a message of the library's and kept as the cause.
 *
 * @typeParam TResult - What the read returns.
 * @param read - The read of the list, of an entry or of a field.
 * @returns What the read returned.
 * @throws {TypeError} When the read threw, with the thrown value as the cause.
 */
function hostRead<TResult>(read: () => TResult): TResult {
  try {
    return read()
  } catch (cause) {
    throw new TypeError(
      'BymaxConfigValidationError: reading the issues threw; its message is withheld because it can carry the value',
      { cause }
    )
  }
}

/**
 * Copy one issue: each field is read once, must be a string, and is written escaped and bounded.
 *
 * @param issue - The entry the host listed.
 * @param index - Its position in the list, for the refusal.
 * @returns The frozen copy with the four contract fields.
 * @throws {TypeError} When a field is not a string.
 */
function copyIssue(issue: object, index: number): ConfigIssue {
  const read = (field: keyof ConfigIssue): string => {
    const value = hostRead(() => reflectGet(issue, field) as unknown)
    if (typeof value !== 'string') {
      throw new TypeError(
        `BymaxConfigValidationError: issue ${index} field ${field} must be a string`
      )
    }
    return printable(value)
  }
  // Each field by name: no iterator of the realm, which a host can replace, takes part in the copy.
  return Object.freeze({
    path: read('path'),
    variable: read('variable'),
    code: read('code') as ConfigIssue['code'],
    message: read('message')
  })
}

/**
 * Copy a list of issues by index, the way no iterator the list answers can shorten it: the length is read
 * once and must be a whole number up to {@link MAX_ISSUES}, each index is read once, and each field of an
 * issue is read once. Only an array is a list. One that claims no entries yet holds an own index key is the
 * empty copy of a non-empty list, and is refused, as is an entry that is not an object. A read of the host's that throws
 * is refused with its cause.
 *
 * @param issues - The issues the host handed to the constructor.
 * @returns The issues, each a frozen object with the four contract fields, escaped and bounded.
 * @throws {TypeError} When the value is not an array, the length is not a whole number, an entry is not an
 * object, a field is not a string, the list claims no entries while it holds an index key, or a read threw.
 * @throws {RangeError} When the list is longer than {@link MAX_ISSUES}.
 */
function copyIssues(issues: ReadonlyArray<ConfigIssue>): ReadonlyArray<ConfigIssue> {
  if (!hostRead(() => Array.isArray(issues))) {
    throw new TypeError('BymaxConfigValidationError: issues must be an array')
  }
  const length = hostRead(() => issues.length as unknown)
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
    throw new TypeError(
      'BymaxConfigValidationError: issues must be a list with a whole-number length'
    )
  }
  if (length > MAX_ISSUES) {
    throw new RangeError(
      `BymaxConfigValidationError: at most ${MAX_ISSUES} issues, received ${length}`
    )
  }
  if (length === 0 && hostRead(() => Object.keys(issues)).some(isIndexKey)) {
    throw new TypeError('BymaxConfigValidationError: issues claims no entries but lists some')
  }
  const copy: ConfigIssue[] = []
  for (let index = 0; index < length; index += 1) {
    const issue = hostRead(() => reflectGet(issues, index) as unknown)
    if (typeof issue !== 'object' || issue === null) {
      throw new TypeError(`BymaxConfigValidationError: issue ${index} must be an object`)
    }
    reflectSet(copy, index, copyIssue(issue, index))
  }
  return copy
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
 * changes how a line reads is written as a `\uXXXX` escape (`\u{XXXXX}` past U+FFFF), and a field too long
 * to print ends with an ellipsis.
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
  declare public readonly code: ConfigValidationCode

  /** The immutable, aggregated list of collected violations. */
  declare public readonly issues: ReadonlyArray<ConfigIssue>

  /**
   * Build the aggregated error from the collected issues.
   *
   * @param issues - Every collected violation, as an array of issues whose four fields are strings;
   * copied and frozen so neither the caller nor consumer code can mutate the reported list.
   * @throws {TypeError} When `issues` is not an array, an entry is not an object, a field is not a
   * string, the array claims no entries while it holds an index key, or reading it threw (the host's
   * error is the `cause` and its message is withheld).
   * @throws {RangeError} When `issues` holds more than 10 000 entries; none is read.
   */
  constructor(issues: ReadonlyArray<ConfigIssue>) {
    // Copy each issue into a fresh, frozen object carrying only the four
    // contract fields, so the shape holds structurally: even an issue that
    // arrives with an extra property cannot leak it through the report or
    // through JSON serialization of the error.
    const normalized = copyIssues(issues)
    super(formatIssueReport(normalized))
    // Keep `name` non-enumerable so JSON.stringify(error) surfaces only the
    // code and the collected issues, while it stays available for
    // String(error) and stack traces.
    // Descriptors are built with no prototype, so a `get`, `set` or `value` planted on the root prototype
    // is not read from them.
    Object.defineProperty(
      this,
      'name',
      bare({
        value: 'BymaxConfigValidationError',
        enumerable: false,
        writable: false,
        configurable: false
      })
    )
    // `code` and `issues` are own fields written by definition, never by assignment: an assignment
    // consults the prototype chain, where a read-only or accessor field planted on the root prototype
    // would make it throw or hand the value to a setter that discards it.
    Object.defineProperty(
      this,
      'code',
      bare({
        value: ConfigErrorCode.VALIDATION,
        enumerable: true,
        writable: false,
        configurable: false
      })
    )
    Object.defineProperty(
      this,
      'issues',
      bare({
        value: Object.freeze(normalized),
        enumerable: true,
        writable: false,
        configurable: false
      })
    )
    // Restore the prototype chain so `instanceof` holds across transpilation
    // targets and ESM/CJS realm boundaries.
    Object.setPrototypeOf(this, BymaxConfigValidationError.prototype)
  }
}

/** The errors the library itself raised, so a host-built error of the same class is told apart. */
const raised = new WeakSet<object>()

/**
 * Build a validation error the library raises, and remember it. The class is public, so a host can
 * build and throw one of its own from code the library runs; only the errors made here pass through a
 * guard unchanged.
 *
 * @param issues - Every collected violation.
 * @returns The error, marked as the library's own.
 */
export function libraryError(issues: ReadonlyArray<ConfigIssue>): BymaxConfigValidationError {
  const error = new BymaxConfigValidationError(issues)
  weakSetAdd(raised, error)
  return error
}

/**
 * The built-ins that build the refusal for a replaced built-in, as they were when the module loaded, so
 * that the refusal does not depend on what it reports.
 */
const nativeConstruct = Reflect.construct
const nativeApply = Reflect.apply
const nativeDefineProperty = Object.defineProperty
const nativeFreeze = Object.freeze
const nativeCreate = Object.create
const nativeError = Error
const setAdd = WeakSet.prototype.add

/** The text of the report that precedes the count, and the text that follows it, as the formatter lays them out. */
const REFUSAL_BEFORE = 'environment validation failed (1 issue)\n\n  (runtime)             '
const REFUSAL_AFTER = '\n\nFix the variables above and restart the process.'

/**
 * A property descriptor with no prototype, written without calling any built-in.
 *
 * @param value - The value of the property.
 * @param enumerable - Whether it is enumerable.
 * @returns The descriptor.
 */
function fixed(value: unknown, enumerable: boolean): PropertyDescriptor {
  const descriptor = nativeCreate(null) as PropertyDescriptor
  descriptor.value = value
  descriptor.enumerable = enumerable
  descriptor.writable = false
  descriptor.configurable = false
  return descriptor
}

/**
 * The error raised when a built-in the library calls has been replaced since it loaded: the same shape as
 * `libraryError` gives, built with the references taken at load and from nothing the host can replace, so
 * that it is a structured `BymaxConfigValidationError` whichever built-in was replaced.
 *
 * @param count - How many built-ins were replaced.
 * @returns The error, marked as the library's own.
 */
export function runtimeRefusal(count: number): BymaxConfigValidationError {
  const text = `${count} of the built-ins the library calls were replaced after it loaded`
  const error = nativeConstruct(
    nativeError,
    [REFUSAL_BEFORE + text + REFUSAL_AFTER],
    BymaxConfigValidationError
  ) as BymaxConfigValidationError
  const issue: ConfigIssue = {
    path: '',
    variable: '(runtime)',
    code: ConfigErrorCode.INVALID,
    message: text
  }
  nativeDefineProperty(error, 'name', fixed('BymaxConfigValidationError', false))
  nativeDefineProperty(error, 'code', fixed(ConfigErrorCode.VALIDATION, true))
  nativeDefineProperty(error, 'issues', fixed(nativeFreeze([nativeFreeze(issue)]), true))
  nativeApply(setAdd, raised, [error])
  return error
}

/**
 * Whether a thrown value is an error the library raised itself. A set lookup runs none of the value's
 * own code, which a prototype check would, and answers false for anything that is not an object.
 *
 * @param thrown - Whatever the host's code threw.
 * @returns True only for an error built by {@link libraryError}.
 */
export function isLibraryError(thrown: unknown): thrown is BymaxConfigValidationError {
  return weakSetHas(raised, thrown)
}
