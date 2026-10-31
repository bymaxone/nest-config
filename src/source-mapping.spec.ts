/**
 * Unit tests for the deterministic source-name mapping.
 *
 * Layer: unit.
 * Goal: prove the derivation from nested config path to SCREAMING_SNAKE_CASE
 * variable name (single word, camelCase, numeric suffix), that a meta({ env })
 * override wins over derivation, that a namespace's meta({ open: true })
 * opt-out is resolved onto its prefix entry, and that the full mapping table
 * for a representative schema is stable, and that the function published from
 * the package root is the one validation reads its variables through.
 * Mocks: none.
 */

import { resolveSourceNames as publishedResolveSourceNames } from '@bymax-one/nest-config'
import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'
import { resolveNamespacePrefixes, resolveSourceNames } from './source-mapping'

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

  it('splits the trailing capital of an acronym that precedes a word', () => {
    /**
     * Acronym-to-word boundary.
     *
     * When an uppercase run is immediately followed by a capitalized word
     * (`oldAPIKey`), only the final capital of the run starts the next word, so
     * the name resolves to `OLD_API_KEY` rather than merging or dropping the
     * boundary. Pins the exact separator the derivation inserts between an
     * acronym and the following word.
     */
    const schema = defineEnv({ service: z.object({ oldAPIKey: z.string() }) })

    expect(resolveSourceNames(schema)).toEqual([
      { path: 'service.oldAPIKey', variable: 'SERVICE_OLD_API_KEY' }
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

describe('resolveNamespacePrefixes derivation', () => {
  it('derives the SCREAMING_SNAKE_CASE prefix of every namespace in order', () => {
    /**
     * Namespace prefix derivation.
     *
     * Strict mode recognizes a namespace's variables by their shared prefix, so
     * each declared namespace must resolve to its uppercased key plus separator,
     * in declaration order, including camelCase and numeric-suffix namespaces.
     */
    const schema = defineEnv({
      server: z.object({ port: z.coerce.number() }),
      database: z.object({ url: z.url() }),
      oauth2: z.object({ clientId: z.string() })
    })

    expect(resolveNamespacePrefixes(schema)).toEqual([
      { namespace: 'server', prefix: 'SERVER_', open: false },
      { namespace: 'database', prefix: 'DATABASE_', open: false },
      { namespace: 'oauth2', prefix: 'OAUTH2_', open: false }
    ])
  })

  it('reports open true for a namespace declared meta({ open: true })', () => {
    /**
     * Open-namespace opt-out.
     *
     * A namespace that shares its prefix with another program declares itself
     * open; the resolved entry must carry the flag so strict detection can
     * waive the rest of that prefix.
     */
    const schema = defineEnv({
      otel: z.object({ enabled: z.coerce.boolean().default(false) }).meta({ open: true }),
      database: z.object({ url: z.url() })
    })

    expect(resolveNamespacePrefixes(schema)).toEqual([
      { namespace: 'otel', prefix: 'OTEL_', open: true },
      { namespace: 'database', prefix: 'DATABASE_', open: false }
    ])
  })

  it('leaves a namespace closed when its metadata omits the open key', () => {
    /**
     * Unrelated metadata.
     *
     * Metadata is a general-purpose Zod facility; carrying a description or any
     * other key must not open a namespace, or an unrelated annotation would
     * silently disable a safety check.
     */
    const schema = defineEnv({
      database: z.object({ url: z.url() }).meta({ description: 'primary store' })
    })

    expect(resolveNamespacePrefixes(schema)).toEqual([
      { namespace: 'database', prefix: 'DATABASE_', open: false }
    ])
  })

  it('leaves a namespace closed when open is truthy but not the literal true', () => {
    /**
     * Strict flag reading.
     *
     * The flag waives a safety check, so it is granted only on an unambiguous
     * `true`. A truthy value of another type (here the string 'true') must not
     * be read as intent to open the namespace.
     */
    const schema = defineEnv({
      database: z.object({ url: z.url() }).meta({ open: 'true' })
    })

    expect(resolveNamespacePrefixes(schema)).toEqual([
      { namespace: 'database', prefix: 'DATABASE_', open: false }
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

/** The variables a failed validation reports, or none when the source is accepted. */
function reportedVariables(
  schema: ReturnType<typeof defineEnv>,
  source: Record<string, string>
): string[] {
  try {
    createValidatedConfig({ schema, source })
    return []
  } catch (error) {
    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    return (error as BymaxConfigValidationError).issues.map((issue) => issue.variable)
  }
}

describe('resolveSourceNames metadata through wrappers', () => {
  const placements: ReadonlyArray<readonly [string, () => z.ZodType]> = [
    ['default', () => z.string().meta({ env: 'LEGACY_NAME' }).default('d')],
    ['prefault', () => z.string().meta({ env: 'LEGACY_NAME' }).prefault('d')],
    ['optional', () => z.string().meta({ env: 'LEGACY_NAME' }).optional()],
    ['nullable', () => z.string().meta({ env: 'LEGACY_NAME' }).nullable()],
    ['nonoptional', () => z.string().optional().meta({ env: 'LEGACY_NAME' }).nonoptional()],
    ['readonly', () => z.string().meta({ env: 'LEGACY_NAME' }).readonly()],
    ['catch', () => z.string().meta({ env: 'LEGACY_NAME' }).catch('d')],
    [
      'transform',
      () =>
        z
          .string()
          .meta({ env: 'LEGACY_NAME' })
          .transform((value) => value)
    ],
    ['pipe', () => z.string().meta({ env: 'LEGACY_NAME' }).pipe(z.string())],
    ['two wrappers', () => z.string().meta({ env: 'LEGACY_NAME' }).default('d').optional()]
  ]

  it.each(placements)('finds an override set before .%s()', (_wrapper, build) => {
    /**
     * Placement does not matter.
     *
     * A wrapper such as .default() builds a new schema node that carries no metadata of
     * its own, so a meta({ env }) written before it has to be found through the wrapper,
     * or the derived name would be read instead. The override is read through every
     * wrapper Zod offers, and a check method (.min, .refine) keeps it on the schema itself.
     */
    const schema = defineEnv({ legacy: z.object({ value: build() }) })

    expect(resolveSourceNames(schema)).toEqual([{ path: 'legacy.value', variable: 'LEGACY_NAME' }])
  })

  it('lets the outermost override win over an inner one', () => {
    /** Two overrides on one leaf: the one written last is the one the author means. */
    const schema = defineEnv({
      legacy: z.object({
        value: z.string().meta({ env: 'INNER_NAME' }).default('d').meta({ env: 'OUTER_NAME' })
      })
    })

    expect(resolveSourceNames(schema)).toEqual([{ path: 'legacy.value', variable: 'OUTER_NAME' }])
  })

  it('falls through an unusable outer override to an inner one', () => {
    /** An empty or non-string outer value is ignored, so the walk goes on to the next. */
    const schema = defineEnv({
      legacy: z.object({
        empty: z.string().meta({ env: 'INNER_EMPTY' }).default('d').meta({ env: '' }),
        notString: z.string().meta({ env: 'INNER_NUMBER' }).default('d').meta({ env: 7 })
      })
    })

    expect(resolveSourceNames(schema).map((binding) => binding.variable)).toEqual([
      'INNER_EMPTY',
      'INNER_NUMBER'
    ])
  })

  it('derives the name when no layer carries an override', () => {
    /** A wrapper chain with no metadata anywhere still derives the name from the path. */
    const schema = defineEnv({ legacy: z.object({ value: z.string().default('d').optional() }) })

    expect(resolveSourceNames(schema)).toEqual([{ path: 'legacy.value', variable: 'LEGACY_VALUE' }])
  })

  it('is the variable validation reads for an override set before a default', () => {
    /**
     * List and read agree. Validation resolves its variables through the same function,
     * so a value supplied under the override name reaches the leaf instead of the default.
     */
    const schema = defineEnv({
      legacy: z.object({ value: z.string().meta({ env: 'LEGACY_NAME' }).default('fallback') })
    })

    expect(
      createValidatedConfig({ schema, source: { LEGACY_NAME: 'supplied' } }).legacy.value
    ).toBe('supplied')
    expect(
      createValidatedConfig({ schema, source: { LEGACY_VALUE: 'ignored' } }).legacy.value
    ).toBe('fallback')
  })
})

describe('resolveSourceNames as published from the package root', () => {
  it('is the very function validation resolves its variables through', () => {
    /**
     * Same-function guarantee.
     *
     * The root entry re-exports the function the validator calls, so a list built
     * by a consumer cannot drift from the variables validation reads.
     */
    expect(publishedResolveSourceNames).toBe(resolveSourceNames)
  })

  it('lists exactly the variables validation reads, one at a time', () => {
    /**
     * Read-set equivalence.
     *
     * With every listed variable present the source is accepted, and removing any
     * single one makes validation report that variable and no other, so no listed
     * name is unread and no read name is unlisted. The schema mixes a derived
     * name, an acronym, a numeric suffix and a meta({ env }) override.
     */
    const schema = defineEnv({
      database: z.object({ url: z.string(), poolSize: z.string() }),
      httpServer: z.object({ http2Port: z.string() }),
      legacy: z.object({ connection: z.string().meta({ env: 'DB_CONNECTION_STRING' }) })
    })
    const variables = publishedResolveSourceNames(schema).map((binding) => binding.variable)
    const complete = Object.fromEntries(variables.map((variable) => [variable, 'x']))

    expect(variables).toEqual([
      'DATABASE_URL',
      'DATABASE_POOL_SIZE',
      'HTTP_SERVER_HTTP2_PORT',
      'DB_CONNECTION_STRING'
    ])
    expect(reportedVariables(schema, complete)).toEqual([])
    for (const variable of variables) {
      const { [variable]: _removed, ...withoutIt } = complete
      expect(reportedVariables(schema, withoutIt)).toEqual([variable])
    }
  })

  it('lists defaulted and optional leaves like any other', () => {
    /**
     * Declared is not required.
     *
     * A leaf validation can do without is still a variable the schema reads, so it
     * appears in the list; deciding whether it belongs in a template file is the
     * caller's policy.
     */
    const schema = defineEnv({
      server: z.object({
        port: z.coerce.number().default(3000),
        host: z.string().optional(),
        name: z.string()
      })
    })

    expect(publishedResolveSourceNames(schema).map((binding) => binding.variable)).toEqual([
      'SERVER_PORT',
      'SERVER_HOST',
      'SERVER_NAME'
    ])
    expect(reportedVariables(schema, { SERVER_NAME: 'x' })).toEqual([])
  })

  it('is unchanged by opening a namespace', () => {
    /**
     * Open namespaces.
     *
     * meta({ open: true }) only waives strict unknown-key detection, so the list
     * for an open namespace equals the list for the same namespace left closed.
     */
    const leaves = { enabled: z.string() }
    const closed = defineEnv({ otel: z.object(leaves) })
    const open = defineEnv({ otel: z.object(leaves).meta({ open: true }) })

    expect(publishedResolveSourceNames(open)).toEqual(publishedResolveSourceNames(closed))
  })

  it('returns both bindings when two paths derive one variable', () => {
    /**
     * Collisions are neither detected nor deduplicated.
     *
     * a.bC and aB.c both derive A_B_C, and httpServer.port and HTTPServer.port both
     * derive HTTP_SERVER_PORT. Every binding is returned, so a tool can see the collision;
     * validation rejects such a schema, naming both leaves of each pair.
     */
    const schema = defineEnv({
      a: z.object({ bC: z.string() }),
      aB: z.object({ c: z.string() }),
      httpServer: z.object({ port: z.string() }),
      HTTPServer: z.object({ port: z.string() })
    })

    expect(publishedResolveSourceNames(schema)).toEqual([
      { path: 'a.bC', variable: 'A_B_C' },
      { path: 'aB.c', variable: 'A_B_C' },
      { path: 'httpServer.port', variable: 'HTTP_SERVER_PORT' },
      { path: 'HTTPServer.port', variable: 'HTTP_SERVER_PORT' }
    ])
    expect(reportedVariables(schema, { A_B_C: 'x', HTTP_SERVER_PORT: 'x' })).toEqual([
      'A_B_C',
      'A_B_C',
      'HTTP_SERVER_PORT',
      'HTTP_SERVER_PORT'
    ])
  })
})
