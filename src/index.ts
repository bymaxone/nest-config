/**
 * @fileoverview Public entry point for the server subpath of @bymax-one/nest-config.
 * @layer Module
 */

export { defineEnv } from './define-env'
export { BymaxConfigValidationError, ConfigErrorCode } from './errors'
export type { ConfigIssue, ConfigIssueCode, ConfigValidationCode } from './errors'
export type { EnvLeaf, EnvNamespace, EnvOutput, EnvSchema, EnvShape } from './types'
