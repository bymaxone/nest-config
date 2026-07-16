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

import { createValidatedConfig } from '../config.providers'
import { resolveSourceNames } from '../source-mapping'
import type { EnvOutput, EnvSchema, EnvShape } from '../types'
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

/** Internal read view over the overrides for dynamic leaf lookup. */
type OverrideRecord = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/**
 * Flatten nested partial overrides into a `namespace.leaf` to value map.
 *
 * Iterating entries (rather than indexing by a dynamic key) keeps the lookup a
 * `Map`, mirroring the rest of the package and avoiding a computed-property
 * access sink.
 *
 * @param overrides - The selective nested partial overrides.
 * @returns A flat map of `namespace.leaf` paths to their override values.
 */
function flattenOverrides(overrides: OverrideRecord): ReadonlyMap<string, unknown> {
  const flat = new Map<string, unknown>()
  for (const [namespace, leaves] of Object.entries(overrides)) {
    for (const [leaf, value] of Object.entries(leaves)) {
      flat.set(`${namespace}.${leaf}`, value)
    }
  }
  return flat
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
  overrides: ConfigOverrides<TShape> | undefined
): Record<string, string> {
  const flat = flattenOverrides((overrides ?? {}) as OverrideRecord)
  const entries = new Map(Object.entries(base))
  for (const binding of resolveSourceNames(schema)) {
    const value = flat.get(binding.path)
    if (value !== undefined) entries.set(binding.variable, String(value))
  }
  return Object.fromEntries(entries)
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
 * @throws {BymaxConfigValidationError} When an override violates a constraint.
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
  const source = applyOverrides(schema, synthesizePlaceholderSource(schema), overrides)
  return createValidatedConfig({ schema, source })
}
