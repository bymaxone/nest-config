/**
 * @fileoverview Public entry point for the testing subpath of @bymax-one/nest-config.
 * Exposes only the two testing utilities: `createTestConfig` for a validated,
 * frozen configuration object, and `configTestingModule` for a ready-to-import
 * Nest testing module. The placeholder synthesizer and source builder stay
 * internal. This subpath ships no test-runner dependency and works with any
 * runner.
 * @layer Module
 */

export { createTestConfig } from './create-test-config'
export { configTestingModule } from './config-testing.module'
