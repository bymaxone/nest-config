/**
 * @fileoverview Deterministic mapping between nested config paths and flat
 * environment variable names. Each leaf resolves to exactly one variable:
 * SCREAMING_SNAKE_CASE of the joined path (`database.url` reads `DATABASE_URL`),
 * unless the leaf declares a `meta({ env })` override, which wins. It also
 * resolves the shared prefix of each namespace and whether that namespace
 * declared `meta({ open: true })`, the two facts strict unknown-key detection
 * runs on. The validator and the package root share this one module:
 * `resolveSourceNames` and `SourceBinding` are exported from the package root,
 * while the namespace-prefix helpers stay internal.
 * @layer Utility
 */

import type { EnvNamespace, EnvSchema, EnvShape } from './types'

/**
 * The resolved binding between one config leaf and its source variable name.
 * Part of the public API, as the element type of `resolveSourceNames`.
 */
export interface SourceBinding {
  /** Nested config path, e.g. `database.url`. */
  readonly path: string
  /** Resolved environment variable name, e.g. `DATABASE_URL`. */
  readonly variable: string
}

/**
 * The variable-name prefix that every derived leaf of one namespace shares.
 */
export interface NamespacePrefix {
  /** Top-level namespace key, e.g. `database`. */
  readonly namespace: string
  /** Shared SCREAMING_SNAKE_CASE prefix including the separator, e.g. `DATABASE_`. */
  readonly prefix: string
  /**
   * Whether the namespace declared `meta({ open: true })`, waiving strict
   * unknown-key detection for the rest of its prefix.
   */
  readonly open: boolean
}

/**
 * Convert one path segment to SCREAMING_SNAKE_CASE.
 *
 * Inserts a boundary before an uppercase letter that follows a lowercase letter
 * or digit, and before the final uppercase of an acronym that precedes a word,
 * then uppercases the result. A trailing digit stays attached to its word.
 *
 * @param segment - A single camelCase or lowercase path segment.
 * @returns The segment as one or more underscore-joined uppercase words.
 */
function toScreamingSnake(segment: string): string {
  return (
    segment
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      // Shrinking the first group from `[A-Z]+` to a single `[A-Z]` is an equivalent
      // mutation: the underscore's position is fixed by group 2 (the following
      // `[A-Z][a-z]` boundary), which both variants locate identically, and group 1 only
      // extends left over characters reproduced verbatim either way. It is NOT written as
      // a `// Stryker disable` directive because one does not attach inside a method
      // chain — measured, not assumed: with the directive here the mutant still reported
      // as surviving. Silencing it would mean a block directive spanning the `.replace()`
      // above, whose own regex mutants the suite does kill, and a killable mutant is never
      // disabled. It stays a counted survivor, recorded in `docs/mutation_testing_results.md`.
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .toUpperCase()
  )
}

/** A schema node as far as the override walk needs it: its metadata and what it wraps. */
interface OverrideNode {
  meta(): { env?: unknown } | undefined
  readonly _zod: { readonly def: { readonly innerType?: OverrideNode; readonly in?: OverrideNode } }
}

/**
 * Read a leaf's `meta({ env })` override when it is a usable string.
 *
 * Zod stores metadata per schema node. A check method such as `.min` or `.refine` keeps
 * it on the node, but `.default`, `.optional`, `.nullable`, `.nonoptional`, `.readonly`,
 * `.catch`, `.prefault`, `.transform` and `.pipe` build a new node around the old one,
 * and that node carries none. The walk therefore starts at the outermost node and goes
 * inward through `innerType`, or `in` for a pipe, so where `meta` was written does not
 * change the answer. The outermost usable override wins; an empty or non-string value is
 * skipped rather than ending the walk.
 *
 * @param leaf - The leaf schema whose metadata may carry an `env` override.
 * @returns The override variable name, or `undefined` to fall back to derivation.
 */
function readEnvOverride(leaf: OverrideNode): string | undefined {
  for (let node: OverrideNode | undefined = leaf; node !== undefined;) {
    const override = node.meta()?.env
    if (typeof override === 'string' && override.length > 0) return override
    node = node._zod.def.innerType ?? node._zod.def.in
  }
  return undefined
}

/**
 * Read a namespace's `meta({ open: true })` opt-out of strict detection.
 *
 * Only the literal `true` opens a namespace. Metadata carrying no `open` key,
 * or an `open` of another type, leaves detection in force: the flag waives a
 * safety check, so it is granted on an unambiguous declaration and never
 * inferred from a merely truthy value.
 *
 * @param namespace - The namespace schema whose metadata may carry the flag.
 * @returns True when the namespace waives strict unknown-key detection.
 */
function readOpenFlag(namespace: EnvNamespace): boolean {
  return namespace.meta()?.open === true
}

/**
 * Derive the SCREAMING_SNAKE_CASE variable name for a nested path.
 *
 * @param namespace - The top-level namespace key.
 * @param leafKey - The leaf key within the namespace.
 * @returns The underscore-joined, uppercased variable name.
 */
function deriveVariable(namespace: string, leafKey: string): string {
  return `${toScreamingSnake(namespace)}_${toScreamingSnake(leafKey)}`
}

/**
 * Resolve the source variable name of every leaf in a `defineEnv` schema.
 *
 * Walks the two-level schema (namespaces then leaves) and yields one binding
 * per leaf. The variable name is the `meta({ env })` override when present,
 * otherwise the SCREAMING_SNAKE_CASE derivation of the joined path. The result
 * is total: every declared leaf maps to exactly one variable, in declaration
 * order.
 *
 * This is the list the validator reads, not a copy of its rules: validation
 * resolves its bindings through this same function. It reads the schema only,
 * never a source record. Declared is not required: a leaf with a default or an
 * optional leaf is listed like any other. Two distinct paths can resolve to one
 * variable (`a.bC` and `aB.c` both derive `A_B_C`); both bindings are returned
 * and none is dropped, though validation rejects a schema that holds such a pair. An open namespace changes nothing here, since opening
 * only waives strict unknown-key detection.
 *
 * @typeParam TShape - The two-level shape the schema was composed from.
 * @param schema - A schema produced by `defineEnv`.
 * @returns The ordered list of leaf-to-variable bindings, typed `readonly`.
 * @example
 * ```typescript
 * const schema = defineEnv({ database: z.object({ url: z.url() }) });
 * resolveSourceNames(schema);
 * // => [{ path: 'database.url', variable: 'DATABASE_URL' }]
 * ```
 */
export function resolveSourceNames<TShape extends EnvShape = EnvShape>(
  schema: EnvSchema<TShape>
): readonly SourceBinding[] {
  return Object.entries(schema.shape).flatMap(([namespace, namespaceSchema]) =>
    Object.entries(namespaceSchema.shape).map(([leafKey, leafSchema]) => ({
      path: `${namespace}.${leafKey}`,
      variable: readEnvOverride(leafSchema) ?? deriveVariable(namespace, leafKey)
    }))
  )
}

/**
 * Resolve the shared source-variable prefix of every declared namespace.
 *
 * Each derived leaf variable starts with its namespace's SCREAMING_SNAKE_CASE
 * prefix (`database` yields `DATABASE_`). Strict validation uses these prefixes
 * to recognize variables that look like config for a namespace but match no
 * declared leaf, so unrelated process variables are never reported as issues.
 * Each entry also carries the namespace's `meta({ open: true })` opt-out, which
 * waives that detection for the rest of the prefix.
 *
 * @typeParam TShape - The two-level shape the schema was composed from.
 * @param schema - A schema produced by `defineEnv`.
 * @returns One namespace-to-prefix entry per declared namespace, in order.
 * @example
 * ```typescript
 * const schema = defineEnv({ database: z.object({ url: z.url() }) });
 * resolveNamespacePrefixes(schema);
 * // => [{ namespace: 'database', prefix: 'DATABASE_', open: false }]
 * ```
 */
export function resolveNamespacePrefixes<TShape extends EnvShape = EnvShape>(
  schema: EnvSchema<TShape>
): readonly NamespacePrefix[] {
  return Object.entries(schema.shape).map(([namespace, namespaceSchema]) => ({
    namespace,
    prefix: `${toScreamingSnake(namespace)}_`,
    open: readOpenFlag(namespaceSchema)
  }))
}
