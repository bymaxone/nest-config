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
import { resolveSourceNames } from './source-mapping'
import type { SourceBinding } from './source-mapping'
import type { EnvOutput, EnvSchema, EnvShape } from './types'

/** The flat, value-free source record consumed by the validator. */
type EnvSource = Readonly<Record<string, string | undefined>>

/** A single issue as produced by a failed Zod parse. */
type ZodValidationIssue = z.ZodError['issues'][number]

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
    issueByPath.set(issue.path.join('.'), issue)
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
 * Validate a flat source against a schema in a single pass.
 *
 * Maps the source onto the nested schema, runs exactly one `safeParse`, and
 * either returns the typed, default-applied, coerced output or throws a
 * BymaxConfigValidationError listing every violation at once. The thrown error
 * never contains a raw source value.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @param source - The flat source record, typically `process.env`.
 * @returns The parsed, typed configuration output.
 * @throws {BymaxConfigValidationError} When any variable is missing or invalid.
 * @example
 * ```typescript
 * const config = validateEnv(envSchema, process.env);
 * config.database.url; // typed, validated, coerced
 * ```
 */
export function validateEnv<TShape extends EnvShape>(
  schema: EnvSchema<TShape>,
  source: EnvSource
): EnvOutput<TShape> {
  const bindings = resolveSourceNames(schema)
  const sourceMap = new Map(Object.entries(source))
  const namespaces = Object.keys(schema.shape)
  const candidate = buildCandidate(namespaces, collectPresentLeaves(bindings, sourceMap))
  const result = schema.safeParse(candidate)
  if (result.success) {
    return result.data
  }
  throw new BymaxConfigValidationError(translateIssues(result.error.issues, bindings, sourceMap))
}
