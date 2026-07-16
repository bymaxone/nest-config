/**
 * @fileoverview A feature-level provider that consumes the typed
 * `ConfigService`, mirroring the `InvoiceService` pattern from the technical
 * specification: no `process.env` reads, no casts, values resolved through
 * compile-time dot-path inference.
 * @layer Fixture
 */

import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@bymax-one/nest-config'

import type { FixtureConfig } from './env.schema'

@Injectable()
export class FeatureProvider {
  public constructor(
    @Inject(ConfigService) private readonly config: ConfigService<FixtureConfig>
  ) {}

  /** Builds a connection descriptor from typed database and server values. */
  public describeConnection(): string {
    return `${this.config.get('database.url')}::${this.config.get('server.port')}`
  }
}
