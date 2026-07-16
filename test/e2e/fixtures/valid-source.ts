/**
 * @fileoverview A complete, schema-compliant source for the success boot path.
 * Deliberately omits `SERVER_PORT`, `SERVER_ENV`, and `LOG_LEVEL` so the
 * success specs also prove that declared defaults resolve through the built
 * package when the source leaves them unset.
 * @layer Fixture
 */

export const validSource: Record<string, string> = {
  DATABASE_URL: 'postgres://localhost:5432/fixture',
  REDIS_URL: 'redis://localhost:6379'
}
