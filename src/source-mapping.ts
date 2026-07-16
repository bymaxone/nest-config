/**
 * @fileoverview Deterministic mapping between nested config paths and flat
 * environment variable names. Each leaf resolves to exactly one variable:
 * SCREAMING_SNAKE_CASE of the joined path (`database.url` reads `DATABASE_URL`),
 * unless the leaf declares a `meta({ env })` override, which wins. This is an
 * internal module consumed by the validator; it is not part of the public API.
 * @layer Utility
 */

import type { EnvSchema, EnvShape } from './types'

/**
 * The resolved binding between one config leaf and its source variable name.
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
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
}

/**
 * Read a leaf's `meta({ env })` override when it is a usable string.
 *
 * @param leaf - The leaf schema whose metadata may carry an `env` override.
 * @returns The override variable name, or `undefined` to fall back to derivation.
 */
function readEnvOverride(leaf: { meta(): { env?: unknown } | undefined }): string | undefined {
  const override = leaf.meta()?.env
  return typeof override === 'string' && override.length > 0 ? override : undefined
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
 * declared leaf, without ever scanning unrelated process variables.
 *
 * @typeParam TShape - The two-level shape the schema was composed from.
 * @param schema - A schema produced by `defineEnv`.
 * @returns One namespace-to-prefix entry per declared namespace, in order.
 * @example
 * ```typescript
 * const schema = defineEnv({ database: z.object({ url: z.url() }) });
 * resolveNamespacePrefixes(schema);
 * // => [{ namespace: 'database', prefix: 'DATABASE_' }]
 * ```
 */
export function resolveNamespacePrefixes<TShape extends EnvShape = EnvShape>(
  schema: EnvSchema<TShape>
): readonly NamespacePrefix[] {
  return Object.keys(schema.shape).map((namespace) => ({
    namespace,
    prefix: `${toScreamingSnake(namespace)}_`
  }))
}
