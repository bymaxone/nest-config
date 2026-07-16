/**
 * @fileoverview configTestingModule: a thin testing wrapper that registers the
 * production BymaxConfigModule with a fully synthesized (and optionally
 * overridden) source. It delegates to `BymaxConfigModule.forRoot`, so a Nest
 * `TestingModule` graph exercises the exact production registration path, the
 * same validation, freezing, and provider wiring an application boots with,
 * without touching `process.env`. This is the module-shaped counterpart to
 * `createTestConfig`.
 * @layer Module
 */

import type { DynamicModule } from '@nestjs/common'

import { BymaxConfigModule } from '../config.module'
import type { EnvSchema, EnvShape } from '../types'
import { buildTestSource } from './create-test-config'
import type { ConfigOverrides } from './create-test-config'

/**
 * Build an importable testing module preconfigured with a synthesized source.
 *
 * Synthesizes a complete valid source for the schema, applies the selective
 * overrides, and registers the production {@link BymaxConfigModule} with it, so
 * the returned module provides and exports the frozen `BYMAX_CONFIG` and the
 * typed `ConfigService` exactly as in production. Import it into a Nest
 * `TestingModule` to inject configuration without a process environment.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @param overrides - Optional selective nested partial overrides.
 * @returns A dynamic module registered through the production `forRoot` path.
 * @example
 * ```typescript
 * const moduleRef = await Test.createTestingModule({
 *   imports: [configTestingModule(envSchema, { server: { port: 0 } })],
 *   providers: [InvoiceService],
 * }).compile();
 * ```
 */
export function configTestingModule<TShape extends EnvShape>(
  schema: EnvSchema<TShape>,
  overrides?: ConfigOverrides<TShape>
): DynamicModule {
  const source = buildTestSource(schema, overrides)
  // Widen the schema to the registration parameter's default shape: the phantom
  // `infer` accessor makes `EnvSchema<TShape>` structurally incompatible with the
  // non-generic `forRoot` parameter, though the runtime schema is identical.
  return BymaxConfigModule.forRoot({ schema: schema as EnvSchema, source })
}
