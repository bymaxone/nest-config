/**
 * @fileoverview The mutation-scope facts specific to this library, read by `stryker-scope.spec.ts`: which
 * shipped files `mutate` leaves out and why, and what the shipped closure must contain.
 * @layer tests
 *
 * The spec is the family template and is copied byte for byte; everything that differs between libraries
 * lives here. This file is data for that spec, so `stryker.config.json` does not mutate it.
 */
import type { Exclusion } from './stryker-scope.spec'

/** The shipped files `mutate` does not select, each with the property that justifies leaving it out. */
export const EXCLUSIONS: readonly Exclusion[] = [
  {
    kind: 'barrel',
    reason:
      'Public and shared-runtime entry barrels: they re-export names and hold no statement a mutant could change.',
    files: ['src/index.ts', 'src/internal/index.ts', 'src/testing/index.ts']
  }
]

/** What the closure of the package entries must contain, so an empty closure cannot pass the checks vacuously. */
export const EXPECTED = {
  entries: 3,
  includes: [
    'src/index.ts',
    'src/internal/index.ts',
    'src/testing/index.ts',
    'src/config.module.ts',
    'src/env-validator.ts',
    'src/testing/placeholder-synthesizer.ts'
  ],
  shipped: 24
} as const

/** Shipped files that are data rather than code: none, this package ships bundles only. */
export const SHIPPED_DATA: readonly { readonly path: string; readonly tsupNeedle: string }[] = []

/** The end-to-end suite that owns excluded files, or `null` when no exclusion is owned that way. */
export const E2E_OWNED: { readonly suites: readonly string[]; readonly subpath: string } | null =
  null
