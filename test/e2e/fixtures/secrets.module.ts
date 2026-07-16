/**
 * @fileoverview Wraps `FixtureSecretsProvider` in an importable module so the
 * `forRootAsync` e2e spec can inject it through the standard `imports` +
 * `inject` composition, exactly as a real secrets-manager module would be
 * wired into an application.
 * @layer Fixture
 */

import { Module } from '@nestjs/common'

import { FixtureSecretsProvider } from './secrets.provider'

@Module({
  providers: [FixtureSecretsProvider],
  exports: [FixtureSecretsProvider]
})
export class FixtureSecretsModule {}
