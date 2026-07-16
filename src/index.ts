/**
 * @fileoverview Public entry point for the server subpath of @bymax-one/nest-config.
 * @layer Module
 */

export { BymaxConfigModule } from './config.module'
export { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
export type { BymaxConfigModuleOptions } from './config.options'
export { defineEnv } from './define-env'
export { BymaxConfigValidationError, ConfigErrorCode } from './errors'
export type { ConfigIssue, ConfigIssueCode, ConfigValidationCode } from './errors'
export type { EnvLeaf, EnvNamespace, EnvOutput, EnvSchema, EnvShape } from './types'
