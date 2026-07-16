/**
 * @fileoverview Foundational schema shape types for the two-level environment
 * configuration convention: top-level keys are namespaces (Zod object schemas)
 * whose leaves are the individual environment-derived values. Everything the
 * package builds (the `defineEnv` factory, the source-name mapping, and the
 * validator) is expressed in terms of these types.
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
