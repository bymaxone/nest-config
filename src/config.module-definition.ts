/**
 * @fileoverview Dynamic-module definition for BymaxConfigModule, built on the
 * NestJS ConfigurableModuleBuilder. It binds the resolved options to the
 * BYMAX_CONFIG_OPTIONS Symbol token, renames the registration methods to
 * `forRoot` / `forRootAsync`, and maps the `isGlobal` extra (default true) to
 * `DynamicModule.global` through `setExtras`. Globality therefore flows through
 * the builder extras, never through a global decorator.
 * @layer Module
 */

import { ConfigurableModuleBuilder } from '@nestjs/common'

import type { BymaxConfigModuleOptions } from './config.options'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'

/**
 * Extra registration options that shape the module without being injected.
 *
 * `setExtras` keeps these out of the {@link BYMAX_CONFIG_OPTIONS} provider, so a
 * consumer of the options token never sees `isGlobal`; it only influences the
 * generated `DynamicModule`.
 */
export interface BymaxConfigModuleExtras {
  /**
   * Register the module globally by mapping to `DynamicModule.global`. The
   * builder applies the `true` default before the transform runs, so this is
   * required at the extras level; consumers see it optional through the
   * generated `OPTIONS_TYPE` (a `Partial` of the extras). Defaults to true.
   */
  readonly isGlobal: boolean
}

/**
 * The generated dynamic-module artifacts.
 *
 * `MODULE_OPTIONS_TOKEN` is the {@link BYMAX_CONFIG_OPTIONS} Symbol (bound
 * through `optionsInjectionToken`), so the config provider factory and the
 * generated options provider share one token. `OPTIONS_TYPE` and
 * `ASYNC_OPTIONS_TYPE` type the `forRoot` / `forRootAsync` parameters, including
 * the `isGlobal` extra.
 */
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
  new ConfigurableModuleBuilder<BymaxConfigModuleOptions>({
    optionsInjectionToken: BYMAX_CONFIG_OPTIONS
  })
    .setClassMethodName('forRoot')
    .setExtras<BymaxConfigModuleExtras>({ isGlobal: true }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal
    }))
    .build()

/** Parameter type of `BymaxConfigModule.forRoot`: the options plus the `isGlobal` extra. */
export type BymaxConfigForRootOptions = typeof OPTIONS_TYPE

/** Parameter type of `BymaxConfigModule.forRootAsync`: async options plus the `isGlobal` extra. */
export type BymaxConfigForRootAsyncOptions = typeof ASYNC_OPTIONS_TYPE
