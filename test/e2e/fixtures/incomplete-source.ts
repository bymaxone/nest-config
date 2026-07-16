/**
 * @fileoverview An incomplete, invalid source for the aggregated-failure boot
 * path. Combines two missing required variables with two present-but-invalid
 * ones so a single bootstrap attempt collects four issues in one pass.
 * @layer Fixture
 */

export const incompleteSource: Record<string, string> = {
  // DATABASE_URL and REDIS_URL are absent: two BYMAX_CONFIG_MISSING issues.
  SERVER_PORT: 'not-a-number',
  LOG_LEVEL: 'not-a-level'
}
