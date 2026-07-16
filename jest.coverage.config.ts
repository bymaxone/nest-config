import type { Config } from 'jest'

/**
 * Aggregated Jest configuration for release-time coverage.
 *
 * Scans the whole project (`rootDir: '.'`) rather than `src/` alone so that a
 * future integration or end-to-end suite added outside `src/` is picked up by
 * the same coverage run without a second config fork. Use this for
 * release-time validation (`pnpm test:cov:all`) and CI gates. Day-to-day
 * development should still prefer the faster `pnpm test:cov`, which only
 * runs the unit suite via `jest.config.ts`.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
  // This config scans the whole project (rootDir '.'), so exclude build output
  // and Stryker sandboxes: both hold copies of `src/` that share the package's
  // Haste module name, which otherwise crashes jest-haste-map with
  // "dupMap.get is not a function" on the `@bymax-one/nest-config` alias.
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/.stryker-tmp/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Mirror the subpath aliases declared in tsconfig.json "paths" so tests and
  // production code resolve the same module instance; a dual-package hazard
  // would make `instanceof` checks return false across subpath boundaries.
  moduleNameMapper: {
    '^@bymax-one/nest-config$': '<rootDir>/src/index.ts',
    '^@bymax-one/nest-config/testing$': '<rootDir>/src/testing/index.ts'
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json'
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/**/*.d.ts'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  testTimeout: 30_000,
  clearMocks: true,
  restoreMocks: true,
  // Scaffold-phase default: no *.spec.ts files exist yet. Flip this to false
  // once the first spec lands so a suite with zero tests fails the build again.
  passWithNoTests: true,
  maxWorkers: '50%'
}

export default config
