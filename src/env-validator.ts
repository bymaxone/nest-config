/**
 * @fileoverview Single-pass environment validator. Maps a flat source record
 * onto the nested schema through the resolved source-name bindings, runs exactly
 * one Zod parse, and either returns the typed parsed output or throws a
 * BymaxConfigValidationError aggregating every violation. Zod issues are
 * translated into value-free ConfigIssue descriptions that state only the
 * expected constraint, never the received value.
 * @layer Service
 */

import type { z } from 'zod'

import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { ConfigIssue } from './errors'
import { resolveNamespacePrefixes, resolveSourceNames } from './source-mapping'
import type { NamespacePrefix, SourceBinding } from './source-mapping'
import type { EnvOutput, EnvSchema, EnvShape } from './types'

/** The flat, value-free source record consumed by the validator. */
type EnvSource = Readonly<Record<string, string | undefined>>

/** Options controlling validation behavior. */
export interface EnvValidationOptions {
  /**
   * When true, source variables that match a declared namespace prefix but no
   * declared leaf produce BYMAX_CONFIG_UNKNOWN_KEY issues. Defaults to false.
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
  return Object.fromEntries(
    namespaces.map((namespace) => [
      namespace,
      Object.fromEntries(
        present
          .filter((leaf) => leaf.namespace === namespace)
          .map((leaf) => [leaf.leaf, leaf.value])
      )
    ])
  )
}

/**
 * Render the allowed enum options as a value-free option list.
 *
 * @param values - The declared enum options (schema constants, never input).
 * @returns The options joined for a human-readable message.
 */
function formatEnumValues(values: ReadonlyArray<unknown>): string {
  return values.map(String).join(', ')
}

/**
 * Describe a Zod issue as a value-free constraint message.
 *
 * Reads only the structural constraint fields (expected type, bounds, format,
 * enum options), never the received value, so the message can never leak a
 * secret.
 *
 * @param issue - The Zod issue for a present-but-invalid leaf.
 * @returns A human-readable description of the expected constraint.
 */
function describeConstraint(issue: ZodValidationIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `invalid value (expected: ${issue.expected})`
    case 'invalid_format':
      return `invalid format (expected: ${issue.format})`
    case 'invalid_value':
      return `invalid value (expected one of: ${formatEnumValues(issue.values)})`
    case 'too_small':
      return issue.origin === 'string'
        ? `too short (expected: string, minimum ${issue.minimum} characters)`
        : `out of range (expected: ${issue.origin} >= ${issue.minimum})`
    case 'too_big':
      return issue.origin === 'string'
        ? `too long (expected: string, maximum ${issue.maximum} characters)`
        : `out of range (expected: ${issue.origin} <= ${issue.maximum})`
    default:
      return 'invalid value'
  }
}

/**
 * Translate a single Zod issue into a value-free ConfigIssue for one binding.
 *
 * @param binding - The leaf binding the issue belongs to.
 * @param issue - The Zod issue reported at the binding's path.
 * @param source - The source values, used to classify missing versus invalid.
 * @returns The value-free issue with resolved variable name and code.
 */
function toConfigIssue(
  binding: SourceBinding,
  issue: ZodValidationIssue,
  source: ReadonlyMap<string, string | undefined>
): ConfigIssue {
  const isMissing = source.get(binding.variable) === undefined
  return {
    path: binding.path,
    variable: binding.variable,
    code: isMissing ? ConfigErrorCode.MISSING : ConfigErrorCode.INVALID,
    message: isMissing ? MISSING_MESSAGE : describeConstraint(issue)
  }
}

/**
 * Aggregate the Zod issues into value-free ConfigIssues in declaration order.
 *
 * Iterates the bindings so the report follows schema order and every emitted
 * issue carries a resolved variable name.
 *
 * @param zodIssues - The issues from the failed parse.
 * @param bindings - The leaf-to-variable bindings for the schema.
 * @param source - The source values for missing-versus-invalid classification.
 * @returns The aggregated, ordered ConfigIssue list.
 */
function translateIssues(
  zodIssues: ReadonlyArray<ZodValidationIssue>,
  bindings: readonly SourceBinding[],
  source: ReadonlyMap<string, string | undefined>
): ConfigIssue[] {
  const issueByPath = new Map<string, ZodValidationIssue>()
  for (const issue of zodIssues) {
    // Collapse any deeper path (a nested field inside a complex leaf, e.g.
    // namespace.leaf.0) to its declared leaf path so the issue still maps to a
    // binding and is never dropped. Keep the first issue reported for a leaf:
    // Zod lists a leaf's primary failure first, and the report shows one line
    // per variable, so the choice must be deterministic, not order-dependent.
    const path = issue.path.slice(0, 2).join('.')
    if (!issueByPath.has(path)) {
      issueByPath.set(path, issue)
    }
  }
  const result: ConfigIssue[] = []
  for (const binding of bindings) {
    const issue = issueByPath.get(binding.path)
    if (issue === undefined) continue
    result.push(toConfigIssue(binding, issue, source))
  }
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
  for (const entry of prefixes) {
    if (!key.startsWith(entry.prefix)) continue
    if (match === undefined || entry.prefix.length > match.prefix.length) {
      match = entry
    }
  }
  return match
}

/**
 * Detect source variables that match a namespace prefix but no declared leaf.
 *
 * The namespace-prefix gate is mandatory: unrelated process variables (such as
 * `PATH` or `HOME`) never match a declared prefix and are therefore ignored, so
 * strict mode reports only variables that look like configuration.
 *
 * @param prefixes - The declared namespace prefixes.
 * @param bindings - The leaf-to-variable bindings, used to skip declared names.
 * @param source - The source values keyed by variable name.
 * @returns One BYMAX_CONFIG_UNKNOWN_KEY issue per unrecognized prefixed variable.
 */
function detectUnknownKeys(
  prefixes: readonly NamespacePrefix[],
  bindings: readonly SourceBinding[],
  source: ReadonlyMap<string, string | undefined>
): ConfigIssue[] {
  const declared = new Set(bindings.map((binding) => binding.variable))
  const issues: ConfigIssue[] = []
  for (const key of source.keys()) {
    if (declared.has(key)) continue
    // A key mapped to undefined represents an absent variable, not a stray one.
    if (source.get(key) === undefined) continue
    const match = longestMatchingPrefix(prefixes, key)
    if (match === undefined) continue
    issues.push({
      path: match.namespace,
      variable: key,
      code: ConfigErrorCode.UNKNOWN_KEY,
      message: UNKNOWN_KEY_MESSAGE
    })
  }
  // Sort by variable in code-point order (locale-independent) so the aggregated
  // report is stable across platforms regardless of the source key-enumeration
  // order (process.env order can vary across runs).
  return issues.sort(
    (left, right) => Number(left.variable > right.variable) - Number(left.variable < right.variable)
  )
}

/**
 * Validate a flat source against a schema in a single pass.
 *
 * Maps the source onto the nested schema, runs exactly one `safeParse`, and
 * either returns the typed, default-applied, coerced output or throws a
 * BymaxConfigValidationError listing every violation at once. With `strict`,
 * unrecognized prefixed variables are aggregated alongside missing and invalid
 * issues. The thrown error never contains a raw source value.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @param source - The flat source record, typically the process environment.
 * @param options - Optional behavior flags, such as strict unknown-key detection.
 * @returns The parsed, typed configuration output.
 * @throws {BymaxConfigValidationError} When any variable is missing, invalid, or
 * (under strict) an unrecognized declared-prefix variable.
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
  const bindings = resolveSourceNames(schema)
  const sourceMap = new Map(Object.entries(source))
  const namespaces = Object.keys(schema.shape)
  const candidate = buildCandidate(namespaces, collectPresentLeaves(bindings, sourceMap))
  const result = schema.safeParse(candidate)
  const unknown =
    options?.strict === true
      ? detectUnknownKeys(resolveNamespacePrefixes(schema), bindings, sourceMap)
      : []
  if (result.success) {
    if (unknown.length === 0) return result.data
    throw new BymaxConfigValidationError(unknown)
  }
  const issues = translateIssues(result.error.issues, bindings, sourceMap)
  throw new BymaxConfigValidationError([...issues, ...unknown])
}
