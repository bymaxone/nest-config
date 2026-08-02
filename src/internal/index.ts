/**
 * @fileoverview The shared runtime both public entry points build on.
 * @layer Module
 *
 * NOT PUBLIC API. It is present in the `exports` map because it has to be
 * resolvable at runtime, not because consumers should import it — nothing here
 * is covered by the package's compatibility promise.
 *
 * It exists because entry points are separate bundles. Anything reached from
 * two of them by a relative path is *copied* into each, and a copied class is a
 * different injection token and a different `instanceof` target: registering
 * `configTestingModule()` from `./testing` and then injecting `ConfigService`
 * from the package root failed with `UnknownElementException`, which is the flow
 * `configTestingModule`'s own documentation describes. Owning the shared graph
 * in one bundle that both entry points import by package specifier gives it a
 * single identity in ESM and CommonJS alike — which code splitting alone could
 * not, since esbuild splits ESM only.
 */

// The module and the tokens it provides — classes and symbols, and therefore
// identity-sensitive.
export { BymaxConfigModule } from '../config.module'
export { ConfigService } from '../config.service'
export { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from '../config.tokens'

// The error the validation path throws. `createValidatedConfig` narrows on it
// with `instanceof`, so a second copy would make the narrowing silently fail.
export { BymaxConfigValidationError, ConfigErrorCode } from '../errors'
export type { ConfigIssue, ConfigIssueCode, ConfigValidationCode } from '../errors'

// Schema and validation helpers the testing entry builds on.
export { defineEnv } from '../define-env'
export { createValidatedConfig } from '../config.providers'
export { resolveSourceNames } from '../source-mapping'
export type { SourceBinding } from '../source-mapping'

// Contracts.
export type { BymaxConfigModuleOptions } from '../config.options'
export type {
  EnvLeaf,
  EnvNamespace,
  EnvOutput,
  EnvSchema,
  EnvShape,
  Path,
  PathValue
} from '../types'
