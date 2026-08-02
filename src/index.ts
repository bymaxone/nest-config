/**
 * @fileoverview Public entry point for the server subpath of @bymax-one/nest-config.
 * @layer Module
 *
 * The names come from the shared runtime rather than from the modules that
 * define them, and by package specifier rather than by relative path. That is
 * what makes them the *same* objects the `./testing` entry point registers: each
 * entry is a separate bundle, and a class copied into two of them is two
 * different injection tokens.
 *
 * This barrel decides what is public. `./internal` resolves at runtime but
 * promises nothing, so an export missing here is not part of the API.
 */

export {
  BYMAX_CONFIG,
  BYMAX_CONFIG_OPTIONS,
  BymaxConfigModule,
  BymaxConfigValidationError,
  ConfigErrorCode,
  ConfigService,
  defineEnv
} from '@bymax-one/nest-config/internal'

export type {
  BymaxConfigModuleOptions,
  ConfigIssue,
  ConfigIssueCode,
  ConfigValidationCode,
  EnvLeaf,
  EnvNamespace,
  EnvOutput,
  EnvSchema,
  EnvShape,
  Path,
  PathValue
} from '@bymax-one/nest-config/internal'
