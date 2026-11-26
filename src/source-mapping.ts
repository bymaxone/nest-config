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

import { assertBuiltinsIntact } from './builtins'
import { setAdd, setHas, setOf } from './captured'
import { ConfigErrorCode, libraryError } from './errors'
import { hasOption, readOption } from './option-read'
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
      // A zero-width boundary: the position between an uppercase letter and the
      // `[A-Z][a-z]` that follows it. Nothing is captured, so no quantifier on a captured
      // group can shrink without changing the result.
      .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, '_')
      .toUpperCase()
  )
}

/** The most wrappers one leaf schema may nest; a chain that goes deeper is refused instead of followed. */
const MAX_WRAPPER_DEPTH = 64

/**
 * The node a wrapper holds inside it, read from the definition by the rule of the options so that a name
 * planted on the root prototype is not taken for one.
 *
 * @param definition - The definition object of a schema node.
 * @returns The wrapped node (`innerType`, or `in` for a pipe), or undefined when the node wraps none.
 */
function wrappedBy<TNode>(definition: object): TNode | undefined {
  const wrapped = readOption(definition, 'innerType') ?? readOption(definition, 'in')
  return wrapped as TNode | undefined
}

/**
 * Refuse a chain of wrappers that is deeper than any schema a person writes.
 *
 * @param depth - How many wrappers have been followed so far.
 * @throws {BymaxConfigValidationError} When the depth is past {@link MAX_WRAPPER_DEPTH}.
 */
function assertWrapperDepth(depth: number): void {
  if (depth > MAX_WRAPPER_DEPTH) {
    throw libraryError([
      {
        path: '',
        variable: '(schema)',
        code: ConfigErrorCode.INVALID,
        message: `a leaf schema nests wrappers deeper than ${MAX_WRAPPER_DEPTH}`
      }
    ])
  }
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
  let depth = 0
  for (let node: OverrideNode | undefined = leaf; node !== undefined;) {
    assertWrapperDepth((depth += 1))
    const meta = node.meta()
    const override = meta === undefined ? undefined : readOption(meta, 'env')
    if (typeof override === 'string' && override.length > 0) return override
    node = wrappedBy<OverrideNode>(node._zod.def)
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
function readOpenFlag(namespace: NamespaceView): boolean {
  const meta = namespace.meta()
  return meta !== undefined && readOption(meta, 'open') === true
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

/** A namespace as the resolvers read it: its shape, read once, and its metadata. */
export interface NamespaceView {
  readonly shape: EnvNamespace['shape']
  meta(): Readonly<Record<string, unknown>> | undefined
}

/** A schema as the resolvers read it: each shape read once, so every resolver sees the same one. */
export interface SchemaView {
  readonly shape: Readonly<Record<string, NamespaceView>>
}

/**
 * Read the shape of a schema and of each of its namespaces once.
 *
 * The resolvers walk the shape several times, and a getter on a schema that is not Zod's own could
 * answer differently on each walk, so the bindings, the prefixes and the refusals would describe
 * different schemas. They are given this copy instead. The leaves and the namespace metadata are
 * read through the schema's own nodes.
 *
 * @param schema - A schema produced by `defineEnv`.
 * @returns A view of the schema whose shapes are plain data.
 */
export function snapshotSchema<TShape extends EnvShape = EnvShape>(
  schema: EnvSchema<TShape>
): SchemaView {
  return {
    shape: Object.fromEntries(
      Object.entries(schema.shape).map(([key, namespace]) => [
        key,
        {
          shape: readOption(namespace, 'shape') as typeof namespace.shape,
          meta: () => namespace.meta()
        }
      ])
    )
  }
}

/**
 * Reject a schema that holds a top-level key which is not a namespace, or is named `toJSON`.
 *
 * The types allow only `z.object` namespaces at the top level; a flat leaf reaches here only past
 * them, and walking its missing `shape` would fail with a raw `TypeError`. Every offending key is
 * reported, in declaration order, with the variable the key itself derives, so the operator sees a
 * typed report that names it. A function that reads the shape of every namespace before it calls
 * `resolveSourceNames` calls this first.
 *
 * @param schema - A schema produced by `defineEnv`.
 * @throws {BymaxConfigValidationError} When any top-level key is not a namespace or is named `toJSON`.
 */
export function assertNamespaces(schema: SchemaView): void {
  const issues = Object.entries(
    schema.shape as Record<string, { readonly shape?: unknown }>
  ).flatMap(([key, node]) => {
    const message =
      typeof readOption(node, 'shape') !== 'object'
        ? 'is not a namespace; declare it inside a z.object({ ... }) namespace'
        : key === 'toJSON'
          ? 'is reserved: the configuration root serializes through this name; rename the namespace'
          : undefined
    return message === undefined
      ? []
      : [{ path: key, variable: toScreamingSnake(key), code: ConfigErrorCode.INVALID, message }]
  })
  if (issues.length > 0) throw libraryError(issues)
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
 * @throws {BymaxConfigValidationError} When a top-level key is not a namespace or is named `toJSON`, a leaf
 * schema chain is longer than 64, or a built-in the library calls was replaced after it loaded.
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
  assertBuiltinsIntact()
  return bindingsOf(snapshotSchema(schema))
}

/**
 * Resolve the bindings of a schema read once: the walk `resolveSourceNames` makes.
 *
 * @param schema - The view of a schema, from {@link snapshotSchema}.
 * @returns The ordered list of leaf-to-variable bindings.
 * @throws {BymaxConfigValidationError} When any top-level key is not a namespace or is named `toJSON`.
 */
export function bindingsOf(schema: SchemaView): readonly SourceBinding[] {
  assertNamespaces(schema)
  return Object.entries(schema.shape).flatMap(([namespace, namespaceSchema]) =>
    Object.entries(namespaceSchema.shape).map(([leafKey, leafSchema]) => ({
      path: `${namespace}.${leafKey}`,
      variable: readEnvOverride(leafSchema) ?? deriveVariable(namespace, leafKey)
    }))
  )
}

/**
 * Describe a `meta({ env })` value that cannot name a variable, without quoting it.
 *
 * @param value - The unusable value.
 * @returns A short description of its kind: `an empty string`, `undefined`, `a number`.
 */
function describeUnusable(value: unknown): string {
  if (value === '') return 'an empty string'
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  return `${typeof value === 'object' ? 'an' : 'a'} ${typeof value}`
}

/**
 * Describe the first unusable `meta({ env })` on a leaf, looking through every wrapper layer.
 *
 * @param leaf - The leaf schema to inspect.
 * @returns What `env` held at the first layer where it is present but not a non-empty string,
 * or `undefined` when no layer has an unusable one.
 */
function describeUnusableEnv(leaf: OverrideNode): string | undefined {
  let depth = 0
  for (let node: OverrideNode | undefined = leaf; node !== undefined;) {
    assertWrapperDepth((depth += 1))
    const meta = node.meta()
    if (meta !== undefined && hasOption(meta, 'env')) {
      const value = readOption(meta, 'env')
      if (typeof value !== 'string' || value.length === 0) return describeUnusable(value)
    }
    node = wrappedBy<OverrideNode>(node._zod.def)
  }
  return undefined
}

/**
 * Find the leaves whose `meta({ env })` is present but is not a non-empty string.
 *
 * Such a value cannot name a variable, and resolution skips it, so the leaf reads the variable
 * derived from its path instead of the one its author meant. A leaf with no `env` in its
 * metadata at all is not listed. Every wrapper layer is read, as resolution does, and each leaf
 * is listed once, for the first layer found unusable.
 *
 * @param schema - A schema produced by `defineEnv`.
 * @returns One entry per affected leaf: its path and a description of what `env` held.
 */
export function findUnusableEnvOverrides(
  schema: SchemaView
): ReadonlyArray<{ readonly path: string; readonly found: string }> {
  assertNamespaces(schema)
  const unusable: Array<{ readonly path: string; readonly found: string }> = []
  for (const [namespace, namespaceSchema] of Object.entries(schema.shape)) {
    for (const [leafKey, leafSchema] of Object.entries(namespaceSchema.shape)) {
      const found = describeUnusableEnv(leafSchema)
      if (found !== undefined) unusable.push({ path: `${namespace}.${leafKey}`, found })
    }
  }
  return unusable
}

/** A schema node as far as the coercion walk needs it: what it is and what it wraps. */
interface CoercionNode {
  readonly _zod: {
    readonly def: {
      readonly type: string
      readonly coerce?: unknown
      readonly innerType?: CoercionNode
      readonly in?: CoercionNode
      readonly out?: CoercionNode
    }
  }
}

/**
 * Whether a schema is, or wraps, a boolean that coerces its input.
 *
 * `z.coerce.boolean()` is a boolean node whose definition carries `coerce: true`, and it parses
 * every non-empty string, `'false'` and `'0'` included, to `true`. `.default`, `.optional`,
 * `.nullable`, `.readonly`, `.catch`, `.prefault` and `.nonoptional` build a node around it,
 * and `.pipe` and `.transform` hold it on either side of a pipe, so the walk goes inward through
 * `innerType`, `in` and `out`. A check method such as `.refine` keeps the same node.
 *
 * @param node - The schema node to inspect.
 * @returns True when a coercing boolean sits anywhere in the wrapped chain.
 */
function wrapsCoercedBoolean(
  node: CoercionNode | undefined,
  depth = 1,
  seen: Set<CoercionNode> = setOf([])
): boolean {
  if (node === undefined || setHas(seen, node)) return false
  setAdd(seen, node)
  assertWrapperDepth(depth)
  const def = node._zod.def
  if (readOption(def, 'type') === 'boolean' && readOption(def, 'coerce') === true) return true
  return (['innerType', 'in', 'out'] as const).some((side) =>
    wrapsCoercedBoolean(readOption(def, side) as CoercionNode | undefined, depth + 1, seen)
  )
}

/**
 * Find the leaves built on `z.coerce.boolean()`.
 *
 * Environment values are strings, and that rule reads any non-empty string as `true`, so a leaf
 * that means to turn a feature off with `'false'` or `'0'` turns it on instead. `z.stringbool()`
 * is the rule that reads those words as written.
 *
 * @param schema - A schema produced by `defineEnv`.
 * @returns The path of every affected leaf, in schema order.
 */
export function findCoercedBooleanLeaves(schema: SchemaView): readonly string[] {
  assertNamespaces(schema)
  return Object.entries(schema.shape).flatMap(([namespace, namespaceSchema]) =>
    Object.entries(namespaceSchema.shape)
      .filter(([, leafSchema]) => wrapsCoercedBoolean(leafSchema))
      .map(([leafKey]) => `${namespace}.${leafKey}`)
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
export function resolveNamespacePrefixes(schema: SchemaView): readonly NamespacePrefix[] {
  return Object.entries(schema.shape).map(([namespace, namespaceSchema]) => ({
    namespace,
    prefix: `${toScreamingSnake(namespace)}_`,
    open: readOpenFlag(namespaceSchema)
  }))
}
