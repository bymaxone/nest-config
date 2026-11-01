/**
 * @fileoverview createTestConfig: the public test-config builder of the testing
 * subpath. It synthesizes a complete valid source from a `defineEnv` schema,
 * overlays selective nested partial overrides onto the targeted leaves through
 * the shared source mapping, then runs the exact production pipeline (validate,
 * deep-freeze) so a test exercises the same code path a running app does. An
 * override that violates a declared constraint fails through the production
 * validation error, and the returned configuration is deeply immutable. No
 * `process.env` is ever read.
 * @layer Utility
 */

import {
  assertDistinctVariables,
  BymaxConfigValidationError,
  ConfigErrorCode,
  createValidatedConfig,
  resolveSourceNames,
  unusableOverrideIssues
} from '@bymax-one/nest-config/internal'
import type { ConfigIssue, EnvOutput, EnvSchema, EnvShape } from '@bymax-one/nest-config/internal'

import { synthesizePlaceholderSource } from './placeholder-synthesizer'

/**
 * Selective nested partial overrides for a synthesized test configuration.
 *
 * Mirrors the two-level `namespace.leaf` shape of the inferred configuration,
 * with every namespace and leaf optional, so a test pins only the values it
 * cares about and lets synthesis and schema defaults resolve the rest.
 *
 * @typeParam TShape - The two-level schema shape.
 */
export type ConfigOverrides<TShape extends EnvShape> = {
  readonly [Namespace in keyof EnvOutput<TShape>]?: {
    readonly [Leaf in keyof EnvOutput<TShape>[Namespace]]?: EnvOutput<TShape>[Namespace][Leaf]
  }
}

/**
 * Whether a value is a plain object: one whose prototype is `Object.prototype` or none.
 *
 * Arrays, `Map`, `Date` and class instances are objects too, but reading their own entries
 * as a namespace's leaves applies nothing, or applies the indices of an array as paths.
 *
 * @param value - The value to test.
 * @returns True when the value is a plain object.
 */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Describe an override that cannot be placed, under its path and with no variable.
 *
 * @param path - The path of the override that was not applied.
 * @param code - What is wrong with it.
 * @param message - The description shown beside the path.
 * @returns The issue, listed in the report under its path.
 */
function unplacedIssue(path: string, code: ConfigIssue['code'], message: string): ConfigIssue {
  return { path, variable: '', code, message }
}

/**
 * Flatten nested partial overrides into a `namespace.leaf` to value map.
 *
 * Iterating entries (rather than indexing by a dynamic key) keeps the lookup a
 * `Map`, mirroring the rest of the package and avoiding a computed-property
 * access sink. An override that cannot be placed is not dropped: an overrides argument or a
 * namespace that is not a plain object, and a path that matches no declared leaf (whatever its
 * value), each become an issue, in the order the overrides are written. No overrides at all,
 * `undefined` or `null`, is an empty map.
 *
 * @param overrides - The selective nested partial overrides, as the caller passed them.
 * @param declared - The paths of the schema's leaves.
 * @returns The placed overrides as a map of `namespace.leaf` paths to their values, and the
 * issues for those that could not be placed.
 */
function flattenOverrides(
  overrides: unknown,
  declared: ReadonlySet<string>
): { readonly flat: ReadonlyMap<string, unknown>; readonly unplaced: readonly ConfigIssue[] } {
  const flat = new Map<string, unknown>()
  const unplaced: ConfigIssue[] = []
  if (overrides === undefined || overrides === null) return { flat, unplaced }
  if (!isPlainObject(overrides)) {
    unplaced.push(
      unplacedIssue('(overrides)', ConfigErrorCode.INVALID, 'the overrides must be an object')
    )
    return { flat, unplaced }
  }
  for (const [namespace, leaves] of Object.entries(overrides)) {
    if (!isPlainObject(leaves)) {
      unplaced.push(
        unplacedIssue(
          namespace,
          ConfigErrorCode.INVALID,
          `the override for \`${namespace}\` must be an object`
        )
      )
      continue
    }
    for (const [leaf, value] of Object.entries(leaves)) {
      const path = `${namespace}.${leaf}`
      if (declared.has(path)) {
        flat.set(path, value)
      } else {
        unplaced.push(
          unplacedIssue(
            path,
            ConfigErrorCode.UNKNOWN_KEY,
            'no leaf of the schema is at this path; the override was not applied'
          )
        )
      }
    }
  }
  return { flat, unplaced }
}

/**
 * Overlay the overrides onto a synthesized source, keyed by source variable.
 *
 * Walks every declared leaf, and for each one supplied by the overrides writes
 * its stringified value under the resolved source-variable name so the value
 * flows through the same coercion and validation as a real environment value.
 * Leaves absent from the overrides keep their synthesized (or omitted) value.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - The schema whose leaf-to-variable mapping is applied.
 * @param base - The synthesized source to overlay onto.
 * @param overrides - The selective nested partial overrides.
 * @returns A new flat source record with the overrides applied.
 */
function applyOverrides<TShape extends EnvShape>(
  schema: EnvSchema<TShape>,
  base: Record<string, string>,
  overrides: ConfigOverrides<TShape> | undefined,
  overridden: Set<string>
): Record<string, string> {
  const bindings = resolveSourceNames(schema)
  const { flat, unplaced } = flattenOverrides(
    overrides,
    new Set(bindings.map((binding) => binding.path))
  )
  if (unplaced.length > 0) throw new BymaxConfigValidationError(unplaced)
  const entries = new Map(Object.entries(base))
  for (const binding of bindings) {
    const value = flat.get(binding.path)
    if (value === undefined) continue
    entries.set(binding.variable, String(value))
    overridden.add(binding.variable)
  }
  // Null-prototype record so a meta({ env }) override named `__proto__` stays a
  // plain data key (consistent with the synthesizer) and cannot mutate a prototype.
  const source = Object.create(null) as Record<string, string>
  for (const [variable, value] of entries) source[variable] = value
  return source
}

/**
 * Rewrite the issues of leaves the caller did not override.
 *
 * Every leaf the caller left alone received a synthesized sample, so an issue on one of
 * them is not the caller's mistake: no sample fits what the schema asks, as with a regex
 * or a `refine` rule. The message says that and names the leaf to override; an issue on
 * a leaf the caller did override keeps its own description. So does an issue that names no
 * leaf (a rule on a namespace or on the whole schema, whose path has no `.`): there is no
 * leaf to point at, and the rule may as well have failed on a value the caller supplied.
 *
 * @param error - The validation error of the synthesized source.
 * @param overridden - The variables the caller supplied a value for.
 * @returns A validation error whose unsatisfied-leaf issues carry the guidance.
 */
function explainUnsatisfiedLeaves(
  error: BymaxConfigValidationError,
  overridden: ReadonlySet<string>
): BymaxConfigValidationError {
  return new BymaxConfigValidationError(
    error.issues.map((issue) =>
      !issue.path.includes('.') || overridden.has(issue.variable)
        ? issue
        : {
            ...issue,
            message: `no placeholder satisfies this leaf (${issue.message}); pass an override for ${issue.path}`
          }
    )
  )
}

/**
 * Synthesize and overlay a source for a schema, and validate it.
 *
 * Shared by {@link createTestConfig} and the testing module so both feed the
 * production registration path a source built the exact same way, and both fail the
 * same way when a leaf has no sample. Internal to the subpath; it is not re-exported
 * from the testing barrel.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @param overrides - Optional selective nested partial overrides.
 * @returns The synthesized source with overrides applied, and the config it validates to.
 * @throws {BymaxConfigValidationError} When the source does not satisfy the schema.
 */
export function prepareTestConfig<TShape extends EnvShape>(
  schema: EnvSchema<TShape>,
  overrides?: ConfigOverrides<TShape>
): { readonly source: Record<string, string>; readonly config: Readonly<EnvOutput<TShape>> } {
  const bindings = resolveSourceNames(schema)
  assertDistinctVariables(bindings)
  const unusable = unusableOverrideIssues(schema, bindings)
  if (unusable.length > 0) throw new BymaxConfigValidationError(unusable)
  const overridden = new Set<string>()
  const source = applyOverrides(schema, synthesizePlaceholderSource(schema), overrides, overridden)
  try {
    return { source, config: createValidatedConfig({ schema, source }) }
  } catch (error) {
    throw error instanceof BymaxConfigValidationError
      ? explainUnsatisfiedLeaves(error, overridden)
      : error
  }
}

/**
 * Build a validated, frozen test configuration from a schema and overrides.
 *
 * Synthesizes a complete constraint-compliant source, applies the selective
 * overrides, and runs the production validation and deep-freeze pipeline, so the
 * returned object is exactly what a running application would receive. A test
 * never touches `process.env`, yet an override that breaks a declared constraint
 * still throws the production {@link BymaxConfigValidationError}.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @param overrides - Optional selective nested partial overrides.
 * @returns The validated, deep-frozen configuration typed by the schema.
 * @throws {BymaxConfigValidationError} When an override violates a constraint, or when no
 * placeholder satisfies a leaf: that issue says so and names the leaf to override.
 * @example
 * ```typescript
 * const config = createTestConfig(envSchema, {
 *   database: { url: 'postgres://localhost:5432/test' },
 * });
 * config.database.url; // typed, validated, frozen
 * ```
 */
export function createTestConfig<TShape extends EnvShape>(
  schema: EnvSchema<TShape>,
  overrides?: ConfigOverrides<TShape>
): Readonly<EnvOutput<TShape>> {
  return prepareTestConfig(schema, overrides).config
}
