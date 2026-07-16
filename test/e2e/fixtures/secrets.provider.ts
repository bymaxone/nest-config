/**
 * @fileoverview A fixture secrets snapshot standing in for a real
 * secrets-manager client, used by the `forRootAsync` e2e spec to prove
 * composition of a `process.env`-shaped source with values resolved through
 * another injected provider.
 * @layer Fixture
 */

import { Injectable } from '@nestjs/common'

@Injectable()
export class FixtureSecretsProvider {
  /** Returns the secret values as a flat, `process.env`-shaped record. */
  public asEnvRecord(): Record<string, string> {
    return {
      DATABASE_URL: 'postgres://localhost:5432/fixture-async',
      REDIS_URL: 'redis://localhost:6379/1'
    }
  }
}
