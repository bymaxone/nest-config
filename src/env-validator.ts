/**
 * @fileoverview Single-pass environment validator. Maps a flat source record
 * onto the nested schema through the resolved source-name bindings, runs exactly
 * one Zod parse, and either returns the typed parsed output or throws a
 * BymaxConfigValidationError aggregating every violation. Zod issues are
 * translated into ConfigIssue descriptions of the expected constraint, never
 * of the received value (see constraint-message for a field a rule filled).
 * The message a schema author attaches to a `custom` issue (`.check`, `.refine`,
 * `.superRefine`) is reported as written: it is schema text, not input,
 * and it is the only place a conditional or cross-field rule can explain itself.
 * @layer Service
 */

import { types } from 'node:util'

import type { z } from 'zod'

import { assertBuiltinsIntact } from './builtins'
import {
  append,
  concatenated,
  mapGet,
  mapHas,
  mapKeys,
  mapOf,
  mapSet,
  setHas,
  setOf,
  setOfBy,
  some,
  sortStrings,
  startsWith
} from './captured'
import { constraintMessage, type SomeDeclared } from './constraint-message'
import { ConfigErrorCode, isLibraryError, libraryError } from './errors'
import type { BymaxConfigValidationError, ConfigIssue } from './errors'
import { awaitHost } from './host-promise'
import { bare, readOption } from './option-read'
import {
  bindingsOf,
  findCoercedBooleanLeaves,
  findUnusableEnvOverrides,
  resolveNamespacePrefixes,
  snapshotSchema
} from './source-mapping'
import type { NamespacePrefix, SchemaView, SourceBinding } from './source-mapping'
import type { EnvOutput, EnvSchema, EnvShape } from './types'

/** The flat, value-free source record consumed by the validator. */
type EnvSource = Readonly<Record<string, string | undefined>>

/** Options controlling validation behavior. */
export interface EnvValidationOptions {
  /**
   * When true, source variables that match a declared namespace prefix but no
   * declared leaf produce BYMAX_CONFIG_UNKNOWN_KEY issues. Defaults to false.
   * A namespace that declared `meta({ open: true })` is exempt for the rest of
   * its prefix; its own declared leaves are still bound and validated.
   */
  readonly strict?: boolean
}

/** A single issue as produced by a failed Zod parse. */
type ZodValidationIssue = z.ZodError['issues'][number]

const UNKNOWN_KEY_MESSAGE = 'unknown variable not declared in the schema'

/** One declared leaf whose source variable carried a defined value. */
interface PresentLeaf {
  readonly namespace: string
  readonly leaf: string
  readonly value: string
}

const MISSING_MESSAGE = 'missing required value'

/**
 * Zod's own text for a `custom` issue raised without a message. Zod fills the
 * field in before the issue reaches this module, so an authored message cannot
 * be recognized by presence alone; this default stands for "none was written"
 * and hands the line back to the report's own wording.
 *
 * Two consequences follow from matching on the text, and both are deliberate.
 * It is a reserved message: a schema that authors this exact string is read as
 * having written nothing and reports `invalid value`. And under a configured
 * non-English Zod locale (or a global custom error map) the default no longer
 * matches, so that localized default is reported as written — a translated
 * message rather than a wrong one.
 */
const ZOD_DEFAULT_CUSTOM_MESSAGE = 'Invalid input'

/**
 * Collect the declared leaves whose source variable is present (defined).
 *
 * Absent variables are skipped so the schema's own defaults and presence checks
 * decide their fate, keeping missing-versus-invalid classification accurate.
 *
 * @param bindings - The leaf-to-variable bindings for the schema.
 * @param source - The source values keyed by resolved variable name.
 * @returns The present leaves split into namespace, leaf, and string value.
 */
function collectPresentLeaves(
  bindings: readonly SourceBinding[],
  source: ReadonlyMap<string, string | undefined>
): PresentLeaf[] {
  const present: PresentLeaf[] = []
  for (const binding of bindings) {
    const value = source.get(binding.variable)
    if (value === undefined) continue
    const separator = binding.path.indexOf('.')
    present.push({
      namespace: binding.path.slice(0, separator),
      leaf: binding.path.slice(separator + 1),
      value
    })
  }
  return present
}

/**
 * Build the nested parse candidate from the present leaves.
 *
 * Every declared namespace is included (empty when it has no present leaves) so
 * Zod reports absent required leaves at the leaf path rather than the namespace.
 *
 * @param namespaces - The declared namespace keys that frame the candidate.
 * @param present - The present leaves to place under their namespaces.
 * @returns The nested record passed to a single `safeParse` call.
 */
function buildCandidate(
  namespaces: readonly string[],
  present: readonly PresentLeaf[]
): Record<string, Record<string, string>> {
  // Objects with no prototype, so a name that matches a member of Object.prototype is absent, not inherited.
  const bare = <T extends object>(entries: Array<[string, unknown]>): T =>
    Object.assign(Object.create(null) as T, Object.fromEntries(entries))
  return bare(
    namespaces.map((namespace) => [
      namespace,
      bare(
        present
          .filter((leaf) => leaf.namespace === namespace)
          .map((leaf) => [leaf.leaf, leaf.value])
      )
    ])
  )
}

/**
 * Extract the message a schema author attached to a `custom` issue.
 *
 * A `custom` issue carries no structural constraint to describe: the rule lives
 * in the author's own check, and the message is the only statement of it. It is
 * schema text rather than input, so it is reported as written. Whitespace runs
 * (a message written across several source lines) collapse to single spaces so
 * the one-line-per-issue report layout holds.
 *
 * @param issue - The Zod issue reported at a binding's path.
 * @returns The authored message, or undefined when the issue is not `custom` or
 * carries no message of its own.
 */
function authoredMessage(issue: ZodValidationIssue): string | undefined {
  if (issue.code !== 'custom') return undefined
  const collapsed = issue.message.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0 || collapsed === ZOD_DEFAULT_CUSTOM_MESSAGE) return undefined
  return collapsed
}

/**
 * Translate a single Zod issue into a ConfigIssue for one binding.
 *
 * An authored `custom` message wins over both generated descriptions, including
 * the missing one: a conditional rule ("required when X is enabled") explains an
 * absent variable better than a bare presence complaint. The `code` still
 * classifies missing versus invalid, so machine consumers are unaffected.
 *
 * @param binding - The leaf binding the issue belongs to.
 * @param issue - The Zod issue reported at the binding's path.
 * @param source - The source values: they classify missing versus invalid, and a generated message
 * that would repeat the binding's is withheld.
 * @param someDeclared - Tests the declared variables' values.
 * @returns The issue with resolved variable name and code; its message is a
 * generated description of the constraint unless the author wrote one.
 */
function toConfigIssue(
  binding: SourceBinding,
  issue: ZodValidationIssue,
  source: ReadonlyMap<string, string | undefined>,
  someDeclared: SomeDeclared
): ConfigIssue {
  const value = mapGet(source, binding.variable)
  const authored = authoredMessage(issue)
  return {
    path: binding.path,
    variable: binding.variable,
    code: value === undefined ? ConfigErrorCode.MISSING : ConfigErrorCode.INVALID,
    message:
      authored ??
      (value === undefined ? MISSING_MESSAGE : constraintMessage(issue, value, someDeclared))
  }
}

/**
 * The issue of a rule that names no leaf, reported against a namespace or the schema.
 *
 * The variable column cannot hold a variable name, so it shows the namespace's
 * prefix followed by `*`, or `(schema)` for a rule on the whole schema. The author's
 * message is kept as written.
 *
 * @param path - The namespace key, or the empty string for the whole schema.
 * @param variable - The text for the variable column.
 * @param issue - The Zod issue that named no leaf.
 * @param someDeclared - Tests the declared variables' values.
 * @returns The ConfigIssue for the report.
 */
function toNamespaceIssue(
  path: string,
  variable: string,
  issue: ZodValidationIssue,
  someDeclared: SomeDeclared
): ConfigIssue {
  return {
    path,
    variable,
    code: ConfigErrorCode.INVALID,
    // No leaf of its own, so only a field that is a declared variable's value whole is withheld.
    message: authoredMessage(issue) ?? constraintMessage(issue, undefined, someDeclared)
  }
}

/**
 * Aggregate the Zod issues into ConfigIssues in declaration order.
 *
 * Iterates the bindings so the report follows schema order and every emitted
 * issue carries a resolved variable name. An issue that names no declared leaf
 * follows the leaf issues, as one issue per namespace in declaration order and
 * then one for the schema as a whole.
 *
 * @param zodIssues - The issues from the failed parse.
 * @param bindings - The leaf-to-variable bindings for the schema.
 * @param prefixes - The declared namespaces, in declaration order, with their prefixes.
 * @param source - The source values for missing-versus-invalid classification.
 * @returns The aggregated, ordered ConfigIssue list.
 */
function translateIssues(
  zodIssues: ReadonlyArray<ZodValidationIssue>,
  bindings: readonly SourceBinding[],
  prefixes: readonly NamespacePrefix[],
  source: ReadonlyMap<string, string | undefined>
): ConfigIssue[] {
  const leafPaths = setOf(bindings.map((binding) => binding.path))
  const namespaces = setOf(prefixes.map((entry) => entry.namespace))
  const issueByPath = mapOf<string, ZodValidationIssue>([])
  const issueByNamespace = mapOf<string, ZodValidationIssue>([])
  for (const issue of zodIssues) {
    // Collapse any deeper path (a nested field inside a complex leaf, e.g.
    // namespace.leaf.0) to its declared leaf path so the issue still maps to a
    // binding and is never dropped. Keep the first issue reported for a leaf:
    // Zod lists a leaf's primary failure first, and the report shows one line
    // per variable, so the choice must be deterministic, not order-dependent.
    const path = issue.path.slice(0, 2).join('.')
    if (setHas(leafPaths, path)) {
      if (!mapHas(issueByPath, path)) mapSet(issueByPath, path, issue)
      continue
    }
    // No leaf to point at: a rule on a namespace, or on the schema as a whole,
    // whose issue names no declared leaf. It is kept under its namespace, or under
    // the empty key for the schema, so a failed validation never reports nothing.
    const namespace = issue.path.length > 0 && setHas(namespaces, String(issue.path[0]))
    const key = namespace ? String(issue.path[0]) : ''
    if (!mapHas(issueByNamespace, key)) mapSet(issueByNamespace, key, issue)
  }
  const someDeclared: SomeDeclared = (test) =>
    some(bindings, (binding) => test(mapGet(source, binding.variable)))
  const result: ConfigIssue[] = []
  for (const binding of bindings) {
    const issue = mapGet(issueByPath, binding.path)
    if (issue === undefined) continue
    result.push(toConfigIssue(binding, issue, source, someDeclared))
  }
  for (const entry of prefixes) {
    const issue = mapGet(issueByNamespace, entry.namespace)
    if (issue === undefined) continue
    result.push(toNamespaceIssue(entry.namespace, `${entry.prefix}*`, issue, someDeclared))
  }
  const wholeSchema = mapGet(issueByNamespace, '')
  if (wholeSchema !== undefined)
    result.push(toNamespaceIssue('', '(schema)', wholeSchema, someDeclared))
  return result
}

/**
 * Find the most specific declared prefix a variable name starts with.
 *
 * Overlapping namespaces can share a leading prefix (for example `APP_` from
 * `app` and `APP_CONFIG_` from `appConfig`). Preferring the longest match
 * attributes a variable to its most specific namespace instead of whichever
 * namespace the schema happened to declare first.
 *
 * @param prefixes - The declared namespace prefixes.
 * @param key - The source variable name to classify.
 * @returns The longest matching prefix, or undefined when none match.
 */
function longestMatchingPrefix(
  prefixes: readonly NamespacePrefix[],
  key: string
): NamespacePrefix | undefined {
  let match: NamespacePrefix | undefined
  for (let at = 0; at < prefixes.length; at += 1) {
    const entry = prefixes[at] as NamespacePrefix
    if (!startsWith(key, entry.prefix)) continue
    if (match === undefined || entry.prefix.length > match.prefix.length) {
      match = entry
    }
  }
  return match
}

/**
 * Detect source variables that match a namespace prefix but no declared leaf.
 *
 * Only a variable that starts with a declared prefix is looked at, so `PATH` or `HOME` are ignored. A
 * namespace that declared `meta({ open: true })` waives the check for the rest of its prefix; its declared
 * leaves stay bound and validated, because the waiver applies only after a declared name is excluded.
 *
 * @param prefixes - The declared namespace prefixes and their open flags.
 * @param bindings - The leaf-to-variable bindings, used to skip declared names.
 * @param source - The source values keyed by variable name.
 * @returns One BYMAX_CONFIG_UNKNOWN_KEY issue per unrecognized prefixed variable.
 */
function detectUnknownKeys(
  prefixes: readonly NamespacePrefix[],
  bindings: readonly SourceBinding[],
  source: ReadonlyMap<string, string | undefined>
): ConfigIssue[] {
  // Captured calls and index reads only: a live `push` or iterator replaced by a getter could hide a key.
  const declared = setOfBy(bindings, (binding) => binding.variable)
  const issues: ConfigIssue[] = []
  // Sorted by UTF-16 code unit, with no comparator, so the report is stable whatever order the source
  // enumerates its keys in (`process.env` order can vary across runs).
  const keys = sortStrings(mapKeys(source))
  for (let at = 0; at < keys.length; at += 1) {
    const key = keys[at] as string
    if (setHas(declared, key)) continue
    if (mapGet(source, key) === undefined) continue // absent, not stray
    const match = longestMatchingPrefix(prefixes, key)
    if (match === undefined) continue
    // An open namespace shares its prefix with a library that reads those variables itself.
    if (match.open) continue
    append(issues, {
      path: match.namespace,
      variable: key,
      code: ConfigErrorCode.UNKNOWN_KEY,
      message: UNKNOWN_KEY_MESSAGE
    })
  }
  return issues
}

/**
 * Reject a schema in which two leaves read one source variable.
 *
 * Two leaves that derive, or are told through `meta({ env })`, the same variable would
 * each read the one value and neither could report on its own, so the schema is wrong
 * before any source is looked at. One issue is produced per colliding leaf, in order of
 * first appearance, each naming the other leaves that share its variable.
 *
 * @param bindings - Every leaf binding of a schema, from `resolveSourceNames`.
 * @throws {BymaxConfigValidationError} When any variable is bound by more than one leaf.
 */
export function assertDistinctVariables(bindings: ReadonlyArray<SourceBinding>): void {
  const byVariable = new Map<string, string[]>()
  for (const { path, variable } of bindings) {
    byVariable.set(variable, [...(byVariable.get(variable) ?? []), path])
  }
  const issues: ConfigIssue[] = []
  for (const [variable, paths] of byVariable) {
    if (paths.length < 2) continue
    for (const path of paths) {
      const others = paths.filter((other) => other !== path).join(', ')
      issues.push({
        path,
        variable,
        code: ConfigErrorCode.INVALID,
        message: `shares this variable with ${others}; rename one with meta({ env })`
      })
    }
  }
  if (issues.length > 0) throw libraryError(issues)
}

/**
 * Describe every leaf whose `meta({ env })` is present but cannot name a variable.
 *
 * The leaf would silently read the variable derived from its path, so it is a mistake in the
 * schema, reported beside the violations of the source. The message names the variable the
 * leaf reads and the kind of value `env` held, never the value.
 *
 * @param schema - A schema produced by `defineEnv`.
 * @param bindings - Every leaf binding of the schema, from `resolveSourceNames`.
 * @returns One issue per affected leaf, in schema order.
 */
export function unusableOverrideIssues(
  schema: SchemaView,
  bindings: ReadonlyArray<SourceBinding>
): ConfigIssue[] {
  const variables = mapOf(bindings.map((binding) => [binding.path, binding.variable] as const))
  return findUnusableEnvOverrides(schema).map(({ path, found }) => {
    const variable = mapGet(variables, path) as string
    return {
      path,
      variable,
      code: ConfigErrorCode.INVALID,
      message: `meta({ env }) must be a non-empty string, found ${found}; the leaf would read ${variable}`
    }
  })
}

/**
 * Describe every leaf built on `z.coerce.boolean()`.
 *
 * That rule reads `'false'` and `'0'` as `true`, so the leaf cannot turn a feature off. The
 * refusal is a mistake in the schema, decided before the parse and reported beside the
 * violations of the source. The message names the rule and its replacement, never a value.
 *
 * @param schema - A schema produced by `defineEnv`.
 * @param bindings - Every leaf binding of the schema, from `resolveSourceNames`.
 * @returns One issue per affected leaf, in schema order.
 */
export function coercedBooleanIssues(
  schema: SchemaView,
  bindings: ReadonlyArray<SourceBinding>
): ConfigIssue[] {
  const variables = mapOf(bindings.map((binding) => [binding.path, binding.variable] as const))
  return findCoercedBooleanLeaves(schema).map((path) => ({
    path,
    variable: mapGet(variables, path) as string,
    code: ConfigErrorCode.INVALID,
    message: "uses z.coerce.boolean(), where 'false' parses to true; use z.stringbool()"
  }))
}

/**
 * Describe every leaf whose namespace or own name is `__proto__`.
 *
 * Assigning that key sets a prototype instead of creating a property, so the parsed value would be
 * dropped from the configuration without a word. The refusal is a mistake in the schema, decided
 * before the parse and reported beside the violations of the source.
 *
 * @param bindings - Every leaf binding of the schema, from `resolveSourceNames`.
 * @returns One issue per affected leaf, in schema order.
 */
export function protoNamedIssues(bindings: ReadonlyArray<SourceBinding>): ConfigIssue[] {
  return bindings
    .filter(({ path }) => path.split('.').includes('__proto__'))
    .map(({ path, variable }) => ({
      path,
      variable,
      code: ConfigErrorCode.INVALID,
      message: 'a namespace or leaf cannot be named __proto__: it cannot be held as a property'
    }))
}

/** A constructor name that is plain code: an identifier, which a thrown object cannot smuggle text into. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * The class name of a thrown Error, when it is plain code.
 *
 * Only an Error is named, one that `util.types.isNativeError` recognises whichever realm made it (a
 * rule run in a `vm` context throws an Error that fails `instanceof Error`): a rule can throw data (the parsed received value, say), and a
 * `constructor` property of data is input, not code. The name is read from the prototype, so
 * an own `constructor` property an Error was given is not consulted. Reading it runs whatever
 * the thrown value defines (a getter, a proxy trap), and that code can throw too, so a failed
 * read is no name at all.
 *
 * @param thrown - Whatever a rule threw.
 * @returns The class name when the value is an Error and the name is an identifier, otherwise
 * undefined.
 */
function thrownClassName(thrown: unknown): string | undefined {
  try {
    if (!types.isNativeError(thrown)) return undefined
    const name = (Object.getPrototypeOf(thrown) as { constructor: { name: unknown } }).constructor
      .name
    return typeof name === 'string' && IDENTIFIER.test(name) ? name : undefined
  } catch {
    return undefined
  }
}

/**
 * The issue for a step of validation that threw instead of reporting.
 *
 * A thrown message can quote the received value (`JSON.parse` does), and Zod does not catch it,
 * so it would leave the validator as it is: raw, with the value in it, and without the hook
 * running. It is withheld, and the issue names only the class of what was thrown, when that
 * is an Error with an identifier for a name. A throw carries no leaf path, so it is reported for
 * the schema as a whole, and the leaves Zod had not yet reached cannot be reported.
 *
 * @param subject - What threw, as the start of the message: `a rule`, say.
 * @param thrown - Whatever it threw.
 * @returns The value-free issue for the whole schema.
 */
export function toWithheldIssue(subject: string, thrown: unknown): ConfigIssue {
  const name = thrownClassName(thrown)
  return {
    path: '',
    variable: '(schema)',
    code: ConfigErrorCode.INVALID,
    message:
      name === undefined
        ? `${subject} threw a value that is not an Error; the value is withheld because it can carry the value`
        : `${subject} threw ${name}; its message is withheld because it can carry the value`
  }
}

/**
 * Run a read of a value the host supplied, and refuse with a library error when the host's code throws.
 *
 * A host value can be an accessor or a Proxy, and what it throws is the host's own error. It would
 * leave the library raw: with whatever it quotes, with no library code and without the hook running.
 * It is refused as one issue that names the step and the class of what was thrown, and the original
 * is kept as the non-enumerable `cause`.
 *
 * @param subject - What was being read, as the start of the message: `reading the options`, say.
 * @param read - The step, which reads the host's value exactly once.
 * @returns What the step returned.
 * @throws {BymaxConfigValidationError} When the step threw.
 */
export function guarded<T>(subject: string, read: () => T): T {
  try {
    return read()
  } catch (thrown) {
    throw refusalOf(subject, thrown)
  }
}

/**
 * Await what the host's code produces, and refuse with a library error when producing or settling it
 * throws. Awaiting looks up `then` on the result, so a Proxy or a getter that throws there is the
 * host's code running inside the await, and it is covered like any other read.
 *
 * The result is handed back in a box with no prototype: a box that inherited `Object.prototype` would have
 * a `then` planted there looked up when it resolves, and the host's own object would be unwrapped again.

 * @param subject - What was being produced, as the start of the message.
 * @param run - The step, which produces the value or a promise of it.
 * @returns The settled value, in a box.
 * @throws {BymaxConfigValidationError} When the step threw, rejected, or its result threw while settling.
 */
export async function guardedResolve<T>(
  subject: string,
  run: () => T | PromiseLike<T>
): Promise<{ readonly value: T }> {
  try {
    return await awaitHost(run())
  } catch (thrown) {
    throw refusalOf(subject, thrown)
  }
}

/**
 * The error a failed read of the host's values becomes: a library error passes unchanged, anything
 * else is refused as one withheld issue with the original as the `cause`.
 *
 * @param subject - What was being read, as the start of the message.
 * @param thrown - Whatever the host's code threw.
 * @returns The error to throw.
 */
function refusalOf(subject: string, thrown: unknown): BymaxConfigValidationError {
  if (isLibraryError(thrown)) return thrown
  return withCause(libraryError([toWithheldIssue(subject, thrown)]), thrown)
}

/**
 * Attach what a host's code threw to a library error as its non-enumerable `cause`, so `code` and
 * `issues` stay its only own enumerable properties.
 *
 * @param error - The library error to annotate.
 * @param cause - What the host's code threw or rejected with.
 * @returns The same error.
 */
export function withCause<T extends Error>(error: T, cause: unknown): T {
  Object.defineProperty(
    error,
    'cause',
    bare({ value: cause, enumerable: false, writable: false, configurable: false })
  )
  return error
}

/**
 * The built-in kinds that are no record of variables and carry no `Symbol.toStringTag`, told apart by the
 * engine's own tests, since `Object.prototype.toString` answers with a tag that one planted on any root
 * prototype changes.
 */
const NOT_A_RECORD: ReadonlyArray<(value: unknown) => boolean> = [
  types.isMap,
  types.isSet,
  types.isWeakMap,
  types.isWeakSet,
  types.isDate,
  types.isRegExp,
  types.isTypedArray,
  types.isAnyArrayBuffer,
  types.isDataView,
  types.isPromise,
  types.isNativeError,
  types.isArgumentsObject,
  types.isBoxedPrimitive,
  types.isGeneratorObject,
  types.isMapIterator,
  types.isSetIterator
]

/**
 * Describe a source that is not an object of variables, without quoting it.
 *
 * Variables are looked up by name, so anything but an object is refused, and so is an array, a Map or
 * another object whose own kind says it is no record of variables. An object built on another, or on
 * a class, is a record and stays accepted.
 *
 * @param source - What the host supplied as the source.
 * @returns The kind of a refused source, or `undefined` when it is accepted.
 */
function refusedSourceKind(source: unknown): string | undefined {
  if (source === undefined || source === null) return String(source)
  if (typeof source !== 'object') return `a ${typeof source}`
  if (Array.isArray(source)) return 'an array'
  // A tag the object or a prototype that has one of its own carries (Map, URL, URLSearchParams, WeakRef,
  // Math, a class with a tag) says it is no record; one that only a root prototype supplies is not the host's.
  const tagged = typeof readOption(source, Symbol.toStringTag) === 'string'
  return tagged || some(NOT_A_RECORD, (isKind) => isKind(source))
    ? 'an object that is not a record of variables'
    : undefined
}

/** `Object.hasOwn` as it was when the module loaded. */
const hasOwn = Object.hasOwn

/**
 * The value a source holds under a name as a property of its own.
 *
 * @param source - The record the host supplied.
 * @param name - The variable name.
 * @returns The own value, or undefined when the source holds none of its own.
 */
function ownValue(source: object, name: string): unknown {
  return hasOwn(source, name) ? Reflect.get(source, name) : undefined
}

/**
 * Read the source into a map, each property once and by name: the keys come from the listing, and a
 * declared variable that is not in it is read too, so one held as a non-enumerable or inherited property,
 * or answered only by the get trap of a Proxy, is found. A value found by name is validated whatever its
 * type, as a listed one is. The one thing never taken is what the root prototype of a realm supplies: the
 * first object on the chain that holds the name must be the source itself or have a prototype of its own,
 * which finds that root in any realm without comparing against an object of this one, so `toString`,
 * `constructor` and a name planted on `Object.prototype` are not values of the source. Any other value
 * held under such a name is validated. `__proto__` is taken only as a property of the source's own.
 *
 * @param source - The record the host supplied.
 * @param bindings - Every leaf binding of the schema, whose variables are read by name.
 * @returns The variables of the source and the value of each.
 * @throws {BymaxConfigValidationError} When reading the source runs host code that throws.
 */
function readSource(
  source: EnvSource,
  bindings: ReadonlyArray<SourceBinding>
): Map<string, string | undefined> {
  return guarded('reading the source', () => {
    const kind = refusedSourceKind(source)
    if (kind !== undefined) {
      throw libraryError([
        {
          path: '',
          variable: '(source)',
          code: ConfigErrorCode.INVALID,
          message: `the source must be an object of variables, received ${kind}`
        }
      ])
    }
    const read = mapOf<string, string | undefined>(
      Object.keys(source).map(
        (name) => [name, Reflect.get(source, name) as string | undefined] as const
      )
    )
    for (const { variable } of bindings) {
      if (mapHas(read, variable)) continue
      // `__proto__` is the source's own property or nothing: a parent that holds one is not the host's value.
      const value =
        variable === '__proto__' ? ownValue(source, variable) : readOption(source, variable)
      mapSet(read, variable, value as string | undefined)
    }
    return read
  })
}

/**
 * Validate a flat source against a schema in a single pass.
 *
 * Maps the source onto the nested schema, runs exactly one `safeParse`, and
 * either returns the typed, default-applied, coerced output or throws a
 * BymaxConfigValidationError listing every violation at once. With `strict`,
 * unrecognized prefixed variables are aggregated alongside missing and invalid
 * issues, except under a namespace that declared `meta({ open: true })`. No
 * description this function generates contains a raw source value;
 * a message written by the schema author is passed through as written.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @param source - The flat source record, typically the process environment.
 * @param options - Optional behavior flags, such as strict unknown-key detection.
 * @returns The parsed, typed configuration output.
 * @throws {BymaxConfigValidationError} When two leaves read one variable, a rule throws, or any variable
 * is missing, invalid, or (under strict) an unrecognized declared-prefix variable.
 * @example
 * ```typescript
 * const config = validateEnv(envSchema, source, { strict: true });
 * config.database.url; // typed, validated, coerced
 * ```
 */
export function validateEnv<TShape extends EnvShape>(
  schema: EnvSchema<TShape>,
  source: EnvSource,
  options?: EnvValidationOptions
): EnvOutput<TShape> {
  assertBuiltinsIntact()
  // The schema is the host's too: a Proxy or a getter in it runs while its structure is read.
  const { bindings, namespaces, prefixes, overrides } = guarded('reading the schema', () => {
    // The shapes are read once, so the bindings, the prefixes and the refusals describe one schema.
    const view = snapshotSchema(schema)
    const resolved = bindingsOf(view)
    assertDistinctVariables(resolved)
    return {
      bindings: resolved,
      namespaces: Object.keys(view.shape),
      prefixes: resolveNamespacePrefixes(view),
      overrides: [
        ...unusableOverrideIssues(view, resolved),
        ...coercedBooleanIssues(view, resolved),
        ...protoNamedIssues(resolved)
      ]
    }
  })
  const sourceMap = readSource(source, bindings)
  // What the schema answers and what its issues hold are the host's code as well.
  return guarded('reading the schema', () => {
    const candidate = buildCandidate(namespaces, collectPresentLeaves(bindings, sourceMap))
    const unknown =
      (options ? readOption(options, 'strict') : undefined) === true
        ? detectUnknownKeys(prefixes, bindings, sourceMap)
        : []
    let result: ReturnType<typeof schema.safeParse>
    try {
      result = schema.safeParse(candidate)
    } catch (thrown) {
      throw libraryError(concatenated([overrides, [toWithheldIssue('a rule', thrown)], unknown]))
    }
    if (result.success) {
      if (unknown.length === 0 && overrides.length === 0) return result.data
      throw libraryError(concatenated([overrides, unknown]))
    }
    const issues = translateIssues(result.error.issues, bindings, prefixes, sourceMap)
    throw libraryError(concatenated([overrides, issues, unknown]))
  })
}
