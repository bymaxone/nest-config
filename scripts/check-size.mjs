#!/usr/bin/env node
// Zero-dependency bundle-size gate. Measures every published subpath's ESM
// bundle (raw + brotli-compressed) and fails when any subpath exceeds the
// hard-coded budget below.
//
// Why zero deps: this package ships "dependencies": {} on purpose. The
// CI/release runner must stay free of third-party tooling so a compromised
// devDep cannot tamper with the bundle before `pnpm publish`. `node:zlib`'s
// brotli matches what npm/CDN compression produces on the wire.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Budgets are in bytes (KiB units, `n * 1024`, matching the table's /1024
// display) measured against the brotli'd .mjs bundle: what a consumer's
// bundler/CDN ships. Brotli, not gzip, to match real wire compression.
//
// Bymax bundle-size convention: the .mjs ships UNMINIFIED, without comments
// (tsup `minify: false`, then scripts/strip-bundle-comments.mjs) on purpose,
// readable stack traces and source inside a consumer's node_modules outweigh a
// few KB on a backend lib that never reaches a browser, and the documentation
// lives in the .d.ts. The budget is a bloat tripwire, not a hard design
// ceiling: raise it (and say why here) when growth is legitimate, tighten it
// when the artifact shrinks.
//
// Calibration history (newest first):
//   - The internal subpath measures 11.00 KiB brotli (11266 bytes), 42 bytes under the previous measurement: the
//     unknown-variable report is ordered by sorting the source keys with no comparator, and the freeze guard and the
//     string clamp lost their helper and their conditional. The budget, 11296 bytes (11.03 KiB), is that measurement
//     plus 30 bytes, so a shrink tightens it.
//   - The internal subpath measures 11.04 KiB brotli (11308 bytes): the engine below plus the capture of the engine's
//     `Promise` and its `then` from the prototype of an async function's promise, and the refusal of a `then` accessor held by a prototype other than `Object.prototype`. The budget,
//     11340 bytes (11.07 KiB), is that measurement plus 32 bytes.
//   - The internal subpath measures 10.93 KiB brotli (11190 bytes): the engine below plus the lookup of the `then` a
//     value the host returned would be resolved through, found by descriptor so that no getter runs, and the
//     follower of a thenable with a data `then`, the one read of a `then` the host owns, which replace an `await` of a
//     value that is not a promise. The budget, 11220 bytes (10.96 KiB), is that measurement plus 30 bytes.
//   - The internal subpath measures 10.66 KiB brotli (10922 bytes): the engine below plus the follower of a promise the
//     host returns and the check that the global `Promise` is the constructor of the promises of the engine, and `captured.ts`, the
//     built-ins that decide a strict-mode refusal, an issue lookup, the layout of a report or the mark of a
//     library error, taken when the module loads and called through a captured `Reflect.apply`, the own-field
//     definition of `code` and `issues` on the error, the keys of the source and every report list built by index and by defined elements, with `keys` and the iterator `next` captured, and the four absent
//     `String.prototype` hooks in the baseline, and the own `constructor` that tags each promise handed to a caller
//     that awaits it, pinned for good, and the own `then` of `undefined` that keeps a `then` planted on
//     `Object.prototype` from answering when a promise resolves with the root, and the refusal of a callable or accessor own `then` on that root, with its typed error. The budget, 10952 bytes (10.70 KiB),
//     is that measurement plus 30 bytes.
//   - The internal subpath measures 9.37 KiB brotli (9753 bytes): the engine below plus the one reader of an
//     option by name, which finds the first holder of a name without reading a property of the root prototype,
//     the metadata, source and schema-definition reads that go through it, the depth bound of the wrapper walks,
//     the own-property read of `__proto__`, the built-ins of the reader and `Reflect.get` and `Reflect.set` taken at load,
//     the objects handed to Nest with no prototype, the refusal of a wrapper chain that is too deep as a library error, the
//     visited set of the coercion walk the tag of a source read through the option reader, the engine tests that tell the kinds of a source apart, and the baseline of the built-ins the library calls with the check that compares it at every entry. The
//     budget, 9783 bytes (9.55 KiB), is that measurement plus 30 bytes.
//   - The internal subpath measures 7.27 KiB brotli (7442 bytes): the engine below plus the report built by
//     index and the unsafe-character check through the `exec` taken at load. The budget, 7.30 KiB, is that
//     measurement plus a few bytes.
//   - The internal subpath measures 7.23 KiB brotli (7402 bytes): the engine below plus the escaping of a field
//     read by index with the string methods taken at load. The budget, 7.25 KiB, is that measurement plus a few
//     bytes.
//   - The internal subpath measures 7.19 KiB brotli (7363 bytes): the engine below plus the test of an array
//     index by its unsigned 32-bit round trip. The budget, 7.21 KiB, is that measurement plus a few bytes.
//   - The internal subpath measures 7.17 KiB brotli (7337 bytes): the engine below plus the array requirement
//     of the list of issues and the count of index keys alone. The budget, 7.19 KiB, is that measurement plus
//     a few bytes.
//   - The internal subpath measures 7.11 KiB brotli (7283 bytes): the engine below plus the guarded read of
//     every field of an issue and its kind check. The budget, 7.13 KiB, is that measurement plus a few bytes.
//   - The internal subpath measures 7.01 KiB brotli (7174 bytes): the engine below plus the copy of the
//     issues of an error by index, with the length bounded and each entry checked. The budget, 7.03 KiB, is
//     that measurement plus a few bytes.
//   - The internal subpath measures 6.78 KiB brotli: the engine below plus the refusal of unknown options, of
//     a hook that is no function and of a source that is no record of variables, and the one-read
//     snapshot of the schema. The budget, 6.80 KiB, is that measurement plus a few bytes.
//   - The internal subpath measures 6.29 KiB brotli: the engine below plus the parse candidate built from
//     objects with no prototype, the refusal of a namespace or leaf named `__proto__`, and the source rule
//     that ignores only what a plain object itself answers. The budget, 6.31 KiB, is that measurement plus
//     a few bytes.
//   - The internal subpath measured 6.19 KiB brotli (6340 bytes): the validation engine with the guard
//     that refuses a host accessor or Proxy that throws while an option, the schema, what it answers, the
//     source, what an options factory returns or the configuration a service is given is read, the single read of `source`, the
//     validation of a declared variable of any type found by name, and the escaping and bounding of
//     the text of every issue by Unicode category. The budget, 6.21 KiB, is that
//     measurement plus a few bytes, so the next growth of the subpath is looked at, not absorbed.
//   - The internal subpath measures 5.38 KiB brotli (5510 bytes): the validation engine with its
//     value-free reporting of a throwing rule, its refusal of `z.coerce.boolean()` and of a
//     top-level key that is not a namespace, its capped report column, the redacted print and
//     JSON serialization of the configuration root, and the module's by-property-access read of
//     its registration options, including the refusal of an argument that is not an object and the
//     same read of what an asynchronous factory returns, the refusal of an option that must be a
//     boolean, the log event of the validation failure and the same refusal in `createValidatedConfig`
//     and its single read of `strict`, and the absorbing log call. The budget is that measurement
//     plus a few dozen bytes, 5.41 KiB, so the next growth of the subpath is looked at, not absorbed.
//   - The internal subpath carries nearly all of the code, so it has its own budget. Measured
//     after the build strips the comments: 4.13 KiB brotli (4226 bytes). The budget is that
//     measurement plus about 11 %, 4.6 KiB.
//   - 2026-07-16: final calibration against the frozen public surface (Phase 6,
//     integration-docs-dogfood). Measured brotli baseline: root 4.06 KiB
//     (4160 bytes), testing 5.24 KiB (5364 bytes). Budgets set to roughly 1.3x
//     the measured baseline (root 5.25 KiB, testing 7 KiB), inside the 1.2x to
//     1.5x tripwire band: enough headroom for JSDoc growth without masking
//     real bloat.
//   - 2026-07-16: testing subpath budget raised 2 -> 8 KiB when it gained its
//     real content (constraint-aware synthesizer, createTestConfig,
//     configTestingModule); it measures ~5.01 KiB brotli, so 8 KiB keeps a
//     tripwire margin of roughly 1.6x. Final calibration of both subpaths
//     lands once the full public surface and documentation stabilize.
//   - 2026-07-16: provisional budgets set at scaffold time against the
//     placeholder `export {}` barrels. Both subpaths recalibrate once the
//     real public API lands and the built artifact stabilizes.
const BUDGETS = [
  { name: 'root (schema, module, service)', path: 'dist/index.mjs', brotli: 5.25 * 1024 },
  { name: 'internal (validation engine)', path: 'dist/internal/index.mjs', brotli: 11296 },
  { name: 'testing (test doubles)', path: 'dist/testing/index.mjs', brotli: 7 * 1024 }
]

const fmt = (n) => `${(n / 1024).toFixed(2)} kB`

const BROTLI_OPTS = {
  params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY }
}

let failed = 0
const rows = []

for (const { name, path, brotli: limit } of BUDGETS) {
  const abs = resolve(ROOT, path)
  // Read straight away rather than stat-then-read: two syscalls where one will
  // do, and the pair is a check-then-use race — the artifact can be replaced
  // between them, so the size reported would not be the size that was checked.
  let raw
  try {
    raw = readFileSync(abs)
  } catch (error) {
    // Only a genuinely absent artifact gets the friendly message. Anything
    // else — EACCES, EISDIR, a transient IO fault — keeps its own error, or
    // the real cause would be reported as "run pnpm build" and hide itself.
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    console.error(`Missing build artifact: ${path}. Run "pnpm build" first.`)
    process.exit(2)
  }
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
