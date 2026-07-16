/**
 * @fileoverview Foundational schema shape types for the two-level environment
 * configuration convention: top-level keys are namespaces (Zod object schemas)
 * whose leaves are the individual environment-derived values. Everything the
 * package builds (the `defineEnv` factory, the source-name mapping, the
 * validator, and the `ConfigService` dot-path accessor) is expressed in terms
 * of these types.
 * @layer Types
 */

import type { z } from 'zod'

/**
 * A single environment-derived leaf schema.
 *
 * Any Zod type may be a leaf (`z.string()`, `z.coerce.number()`, `z.enum(...)`,
 * and so on). Leaves live one level below a namespace and never at the top
 * level of a shape.
 */
export type EnvLeaf = z.ZodType

/**
 * A configuration namespace: a Zod object schema that groups related leaves
 * under one top-level key (for example `server`, `database`, or `auth`).
 */
export type EnvNamespace = z.ZodObject

/**
 * The shape accepted by `defineEnv`.
 *
 * Encodes the two-level convention as a record of namespace keys, each mapped
 * to a Zod object schema. A bare leaf at the top level is intentionally not
 * assignable, which keeps the namespace boundary explicit and greppable.
 */
export type EnvShape = Record<string, EnvNamespace>

/**
 * The parsed, validated output type produced by a shape.
 *
 * Mirrors what Zod infers for `z.object(shape)`, so applied coercions and
 * defaults are reflected exactly. Used to type the `infer` phantom accessor on
 * the schema returned by `defineEnv`.
 *
 * @typeParam TShape - The env shape whose composed output is inferred.
 */
export type EnvOutput<TShape extends EnvShape> = z.infer<z.ZodObject<TShape>>

/**
 * The schema returned by `defineEnv`.
 *
 * The composed Zod object augmented with a phantom `infer` accessor that
 * carries the inferred configuration type for ergonomic extraction via
 * `typeof schema.infer`. The property exists only in the type system; reading
 * it at runtime is not part of the contract.
 *
 * @typeParam TShape - The env shape the schema was composed from.
 */
export type EnvSchema<TShape extends EnvShape = EnvShape> = z.ZodObject<TShape> & {
  /** Phantom accessor exposing the inferred config type; use `typeof schema.infer`. */
  readonly infer: EnvOutput<TShape>
}

/**
 * The union of every valid `namespace.leaf` dot-path for a config object.
 *
 * Given a parsed config type whose top-level keys are namespaces and whose
 * second-level keys are leaves, this resolves to the union of `` `${namespace}.${leaf}` ``
 * strings. Inference is deliberately fixed at exactly two levels (namespace and
 * leaf) with no recursive conditional types, so the compiler cost stays flat
 * even for large schemas. Deeper nesting stays typed through `getAll()` but is
 * intentionally not addressable through a dot-path; this is a documented limit
 * of the two-level convention, not an oversight.
 *
 * @typeParam TConfig - The parsed, two-level configuration object type.
 * @example
 * ```typescript
 * type AppConfig = { server: { port: number }; database: { url: string } };
 * type Paths = Path<AppConfig>; // 'server.port' | 'database.url'
 * ```
 */
export type Path<TConfig> = {
  [Namespace in keyof TConfig & string]: TConfig[Namespace] extends Record<string, unknown>
    ? {
        [Leaf in keyof TConfig[Namespace] & string]: `${Namespace}.${Leaf}`
      }[keyof TConfig[Namespace] & string]
    : never
}[keyof TConfig & string]

/**
 * The leaf value type addressed by a `namespace.leaf` path.
 *
 * Splits the path on its single dot and walks exactly the two fixed levels to
 * resolve the leaf type, so `PathValue<AppConfig, 'server.port'>` is `number`.
 * The split is a single template-literal inference with no recursion, matching
 * the flat-cost guarantee of {@link Path}.
 *
 * @typeParam TConfig - The parsed, two-level configuration object type.
 * @typeParam TPath - A path drawn from {@link Path}<TConfig>.
 * @example
 * ```typescript
 * type AppConfig = { server: { port: number }; database: { url: string } };
 * type Port = PathValue<AppConfig, 'server.port'>; // number
 * ```
 */
export type PathValue<
  TConfig,
  TPath extends Path<TConfig>
> = TPath extends `${infer Namespace}.${infer Leaf}`
  ? Namespace extends keyof TConfig
    ? Leaf extends keyof TConfig[Namespace]
      ? TConfig[Namespace][Leaf]
      : never
    : never
  : never
