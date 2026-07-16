#!/usr/bin/env node
// Zero-dependency bundle-size gate. Measures every published subpath's ESM
// bundle (raw + brotli-compressed) and fails when any subpath exceeds the
// hard-coded budget below.
//
// Why zero deps: this package ships "dependencies": {} on purpose. The
// CI/release runner must stay free of third-party tooling so a compromised
// devDep cannot tamper with the bundle before `pnpm publish`. `node:zlib`'s
// brotli matches what npm/CDN compression produces on the wire.

import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Budgets are in bytes (KiB units, `n * 1024`, matching the table's /1024
// display) measured against the brotli'd .mjs bundle: what a consumer's
// bundler/CDN ships. Brotli, not gzip, to match real wire compression.
//
// Bymax bundle-size convention: the .mjs ships UNMINIFIED with JSDoc (tsup
// `minify: false`) on purpose, readable stack traces and source inside a
// consumer's node_modules outweigh a few KB on a backend lib that never
// reaches a browser. The budget is a bloat tripwire, not a hard design
// ceiling: raise it (and say why here) when growth is legitimate, tighten it
// when the artifact shrinks.
//
// Calibration history (newest first):
//   - 2026-07-16: testing subpath budget raised 2 -> 8 KiB when it gained its
//     real content (constraint-aware synthesizer, createTestConfig,
//     configTestingModule); it measures ~5.01 KiB brotli, so 8 KiB keeps a
//     tripwire margin of roughly 1.6x. Final calibration of both subpaths
//     lands once the full public surface and documentation stabilize.
//   - 2026-07-16: provisional budgets set at scaffold time against the
//     placeholder `export {}` barrels. Both subpaths recalibrate once the
//     real public API lands and the built artifact stabilizes.
const BUDGETS = [
  { name: 'root (schema, module, service)', path: 'dist/index.mjs', brotli: 6 * 1024 },
  { name: 'testing (test doubles)', path: 'dist/testing/index.mjs', brotli: 8 * 1024 }
]

const fmt = (n) => `${(n / 1024).toFixed(2)} kB`

const BROTLI_OPTS = {
  params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY }
}

let failed = 0
const rows = []

for (const { name, path, brotli: limit } of BUDGETS) {
  const abs = resolve(ROOT, path)
  try {
    statSync(abs)
  } catch {
    console.error(`Missing build artifact: ${path}. Run "pnpm build" first.`)
    process.exit(2)
  }
  const raw = readFileSync(abs)
  const compressed = brotliCompressSync(raw, BROTLI_OPTS).length
  const ok = compressed <= limit
  if (!ok) failed += 1
  rows.push({
    name,
    raw: raw.length,
    brotli: compressed,
    limit,
    delta: compressed - limit,
    ok
  })
}

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)

console.log('')
console.log(
  `  ${pad('Subpath', 32)}${padL('Raw', 12)}${padL('Brotli', 12)}${padL('Budget', 12)}  Status`
)
console.log(`  ${'-'.repeat(32)}${'-'.repeat(12)}${'-'.repeat(12)}${'-'.repeat(12)}  ------`)
for (const r of rows) {
  const status = r.ok ? 'PASS' : `FAIL +${fmt(r.delta)}`
  console.log(
    `  ${pad(r.name, 32)}${padL(fmt(r.raw), 12)}${padL(fmt(r.brotli), 12)}${padL(fmt(r.limit), 12)}  ${status}`
  )
}
console.log('')

if (failed > 0) {
  console.error(`${failed} subpath(s) exceeded the brotli budget.`)
  process.exit(1)
}
