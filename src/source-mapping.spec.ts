/**
 * Unit tests for the deterministic source-name mapping.
 *
 * Layer: unit.
 * Goal: prove the derivation from nested config path to SCREAMING_SNAKE_CASE
 * variable name (single word, camelCase, numeric suffix), that a meta({ env })
 * override wins over derivation, and that the full mapping table for a
 * representative schema is stable.
 * Mocks: none.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { resolveSourceNames } from './source-mapping'

describe('resolveSourceNames derivation', () => {
  it('derives DATABASE_URL from database.url', () => {
    /**
     * Single-word leaf.
     *
     * The canonical example from spec 4.2: a single-word namespace and leaf
     * join into an underscore-separated, uppercased variable name.
     */
    const schema = defineEnv({ database: z.object({ url: z.url() }) })

    expect(resolveSourceNames(schema)).toEqual([{ path: 'database.url', variable: 'DATABASE_URL' }])
  })

  it('splits a camelCase leaf into words, e.g. auth.jwtSecret to AUTH_JWT_SECRET', () => {
    /**
     * camelCase boundary splitting.
     *
     * A camelCase leaf must break on case boundaries so each word becomes a
     * snake segment. Protects readable, operator-facing variable names.
     */
    const schema = defineEnv({
      auth: z.object({
        jwtSecret: z.string(),
        accessTtlSeconds: z.coerce.number()
      })
    })

    expect(resolveSourceNames(schema)).toEqual([
      { path: 'auth.jwtSecret', variable: 'AUTH_JWT_SECRET' },
      { path: 'auth.accessTtlSeconds', variable: 'AUTH_ACCESS_TTL_SECONDS' }
    ])
  })

  it('keeps a digit attached to its word for numeric-suffix names', () => {
    /**
     * Numeric-suffix edge case.
     *
     * A digit stays with the preceding lowercase run, and an uppercase after a
     * digit still starts a new segment, so `s3Bucket` becomes `S3_BUCKET` and a
     * trailing-digit word like `oauth2` stays intact.
     */
    const schema = defineEnv({
      storage: z.object({ s3Bucket: z.string() }),
      oauth2: z.object({ clientId: z.string() })
    })

    expect(resolveSourceNames(schema)).toEqual([
      { path: 'storage.s3Bucket', variable: 'STORAGE_S3_BUCKET' },
      { path: 'oauth2.clientId', variable: 'OAUTH2_CLIENT_ID' }
    ])
  })
})

describe('resolveSourceNames override precedence', () => {
  it('lets a meta({ env }) override win over the derived name', () => {
    /**
     * Override precedence (spec 4.2).
     *
     * When a leaf declares meta({ env }), that explicit name replaces the
     * derived one, so a legacy variable name is preserved verbatim.
     */
    const schema = defineEnv({
      database: z.object({ url: z.url().meta({ env: 'DB_CONNECTION_STRING' }) })
    })

    expect(resolveSourceNames(schema)).toEqual([
      { path: 'database.url', variable: 'DB_CONNECTION_STRING' }
    ])
  })

  it('ignores unrelated metadata and an empty env override, falling back to derivation', () => {
    /**
     * Override guard.
     *
     * Metadata without a usable `env` string (absent, wrong type, or empty)
     * must not suppress the derivation, keeping the mapping total.
     */
    const schema = defineEnv({
      database: z.object({
        url: z.url().meta({ description: 'primary database' }),
        replicaUrl: z.url().meta({ env: '' })
      })
    })

    expect(resolveSourceNames(schema)).toEqual([
      { path: 'database.url', variable: 'DATABASE_URL' },
      { path: 'database.replicaUrl', variable: 'DATABASE_REPLICA_URL' }
    ])
  })
})

describe('resolveSourceNames contract stability', () => {
  it('pins the full leaf-to-variable table for a representative schema', () => {
    /**
     * Contract snapshot.
     *
     * The complete mapping table is part of the package contract; a snapshot
     * makes any accidental change to derivation or ordering a visible failure.
     */
    const schema = defineEnv({
      server: z.object({
        port: z.coerce.number(),
        nodeEnv: z.string()
      }),
      database: z.object({
        url: z.url(),
        poolSize: z.coerce.number()
      }),
      auth: z.object({
        jwtSecret: z.string(),
        accessTtlSeconds: z.coerce.number()
      }),
      legacy: z.object({
        connectionString: z.url().meta({ env: 'DB_CONNECTION_STRING' })
      })
    })

    expect(resolveSourceNames(schema)).toMatchInlineSnapshot(`
[
  {
    "path": "server.port",
    "variable": "SERVER_PORT",
  },
  {
    "path": "server.nodeEnv",
    "variable": "SERVER_NODE_ENV",
  },
  {
    "path": "database.url",
    "variable": "DATABASE_URL",
  },
  {
    "path": "database.poolSize",
    "variable": "DATABASE_POOL_SIZE",
  },
  {
    "path": "auth.jwtSecret",
    "variable": "AUTH_JWT_SECRET",
  },
  {
    "path": "auth.accessTtlSeconds",
    "variable": "AUTH_ACCESS_TTL_SECONDS",
  },
  {
    "path": "legacy.connectionString",
    "variable": "DB_CONNECTION_STRING",
  },
]
`)
  })
})
