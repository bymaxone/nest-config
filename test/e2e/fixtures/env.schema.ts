/**
 * @fileoverview Fixture schema for the e2e suite: mirrors the technical
 * specification's example integration (server, database, redis, log
 * namespaces) so the specs exercise the same shape a real consumer would
 * declare, resolved through the built `@bymax-one/nest-config` artifact.
 * @layer Fixture
 */

import { z } from 'zod'
import { defineEnv } from '@bymax-one/nest-config'

export const envSchema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    env: z.enum(['development', 'test', 'production']).default('development')
  }),
  database: z.object({
    url: z.url()
  }),
  redis: z.object({
    url: z.url()
  }),
  log: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info')
  })
})

/** The typed configuration shape inferred from {@link envSchema}. */
export type FixtureConfig = typeof envSchema.infer
