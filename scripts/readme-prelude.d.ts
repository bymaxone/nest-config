/**
 * @fileoverview The names a README snippet uses without declaring them, typed against
 * the published package. `check-published-surface.mjs` copies this file into the
 * throwaway consumer it compiles the snippets in, so a call made through one of these
 * names is checked against the real types instead of resolving to `any`.
 * Only names the surrounding prose introduces belong here; a wrong option, method or
 * field on a package type is a real error and must stay one.
 */
import type { EnvSchema } from '@bymax-one/nest-config'

declare global {
  /** The schema a snippet shows being passed to the module or the helpers. */
  const envSchema: EnvSchema

  /** A secrets source the `forRootAsync` example composes with `process.env`. */
  class SecretsModule {}
  class SecretsProvider {
    asEnvRecord(): Record<string, string>
  }

  /** The failure a bootstrap `catch` receives. */
  const error: unknown

  /** The two loggers the failure-reporting example calls, as far as the prose shows. */
  const pino: { error(objectOrMessage: unknown, ...rest: unknown[]): void }
  const nestLogger: { error(code: string, error: Error): void }
}
