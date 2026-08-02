import type { Config } from 'jest'

/**
 * Jest configuration for end-to-end tests.
 *
 * Runs the e2e suite against the BUILT package rather than the source tree:
 * `moduleNameMapper` points the `@bymax-one/nest-config` and
 * `@bymax-one/nest-config/testing` specifiers at the compiled `dist/*.cjs`
 * artifacts, the same files the package.json "exports" map resolves under
 * `require`. This proves the shipped bundle, not `src/`, boots a real NestJS
 * application graph. Run `pnpm build` before `pnpm test:e2e` (or use
 * `pnpm build && pnpm test:e2e`); a missing `dist/` fails module resolution
 * immediately with a clear "Cannot find module" error.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'test/e2e',
  testMatch: ['**/*.e2e-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@bymax-one/nest-config$': '<rootDir>/../../dist/index.cjs',
    '^@bymax-one/nest-config/internal$': '<rootDir>/../../dist/internal/index.cjs',
    '^@bymax-one/nest-config/testing$': '<rootDir>/../../dist/testing/index.cjs'
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../../tsconfig.e2e.json'
      }
    ]
  },
  testTimeout: 30_000,
  clearMocks: true,
  restoreMocks: true,
  maxWorkers: '50%'
}

export default config
