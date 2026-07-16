/**
 * @fileoverview The `defineEnv` factory: a thin, typed wrapper over
 * `z.object(...)` that establishes the two-level namespace convention of the
 * package and exposes the inferred configuration type through a phantom
 * accessor. It composes the caller's schemas as-is and never rewrites, clones,
 * or wraps them, so coercion and defaults stay explicit consumer choices.
 * @layer Utility
 */

import { z } from 'zod'

import type { EnvSchema, EnvShape } from './types'

/**
 * Compose environment namespaces into a single typed schema.
 *
 * Wraps the passed shape in `z.object(...)` and returns it augmented with the
 * `infer` phantom accessor, so the configuration type is extracted ergonomically
 * via `typeof schema.infer`. The caller's namespace and leaf schemas are reused
 * unchanged: `defineEnv` documents and encourages `z.coerce.*` for the
 * string-shaped environment, but never injects coercion or defaults itself.
 *
 * @typeParam TShape - The two-level shape: namespace keys mapped to Zod objects.
 * @param shape - Top-level namespaces, each a Zod object of leaf schemas.
 * @returns The composed Zod object schema carrying the `infer` type helper.
 * @example
 * ```typescript
 * import { defineEnv } from '@bymax-one/nest-config';
 * import { z } from 'zod';
 *
 * export const envSchema = defineEnv({
 *   server: z.object({
 *     port: z.coerce.number().int().min(1).max(65535).default(3000),
 *   }),
 *   database: z.object({ url: z.url() }),
 * });
 *
 * export type AppConfig = typeof envSchema.infer;
 * ```
 */
export function defineEnv<TShape extends EnvShape>(shape: TShape): EnvSchema<TShape> {
  // The composed object is created here, so the caller's namespace and leaf
  // instances are referenced directly by z.object without any rewriting. The
  // cast attaches the type-only `infer` accessor; it adds no runtime property.
  return z.object(shape) as EnvSchema<TShape>
}
