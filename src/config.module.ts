/**
 * @fileoverview BymaxConfigModule: the dynamic module consumers import once via
 * `forRoot` / `forRootAsync`. It extends the generated ConfigurableModuleClass,
 * inheriting both registration methods and the `isGlobal` extra mapping. The
 * validated, deep-frozen BYMAX_CONFIG provider is wired into the returned
 * definition in the provider layer.
 * @layer Module
 */

import { Module } from '@nestjs/common'

import { ConfigurableModuleClass } from './config.module-definition'

/**
 * NestJS dynamic module exposing typed, validated environment configuration.
 *
 * Import it once (typically in `AppModule`) with `forRoot` for a static schema
 * or `forRootAsync` when the source is resolved through other providers. It is
 * global by default; pass `isGlobal: false` to scope it to a submodule.
 *
 * @example
 * ```typescript
 * @Module({ imports: [BymaxConfigModule.forRoot({ schema: envSchema })] })
 * export class AppModule {}
 * ```
 */
@Module({})
export class BymaxConfigModule extends ConfigurableModuleClass {}
