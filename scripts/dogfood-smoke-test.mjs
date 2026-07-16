#!/usr/bin/env node
/**
 * Dogfood smoke test: validates the published package shape before tagging.
 *
 * What this script validates:
 *   1. Build artifacts exist for every subpath (ESM, CJS, .d.ts)
 *   2. Named exports resolve from ESM for every subpath
 *   3. Named exports resolve from CJS for every subpath
 *   4. The packed tarball contains only dist/ + meta files
 *   5. A minimal consumer, scaffolded in an OS temp dir, installs the packed
 *      tarball via a `file:` dependency and resolves every subpath from both
 *      ESM and CJS through the published `exports` map
 *
 * Exit codes:
 *   0: all assertions pass
 *   1: one or more assertions failed (details printed to stderr)
 *   2: build artifacts missing (run `pnpm build` first)
 *
 * Usage:
 *   pnpm build && node scripts/dogfood-smoke-test.mjs
 */

import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pkg = require(resolve(ROOT, 'package.json'))

// The subpaths this package publishes, kept in sync with package.json "exports".
const SUBPATHS = ['.', './testing']

// Named exports each subpath must resolve to. Both lists stay empty until the
// schema engine, dynamic module, and testing utilities land their public API;
// the structural checks below (build artifacts, subpath resolution, tarball
// contents) still gate the package shape from the very first build.
const EXPECTED_EXPORTS = {
  '.': [],
  './testing': []
}

const ALLOWED_TARBALL_PATHS = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'dist/']

let failures = 0
let consumerDir
let packOutDir

function fail(msg) {
  console.error(`  FAIL: ${msg}`)
  failures++
}

function pass(msg) {
  console.log(`  PASS: ${msg}`)
}

function section(title) {
  console.log(`\n${title}`)
}

function specifierFor(subpath) {
  return subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`
}

function distArtifactsFor(subpath) {
  const entry = pkg.exports[subpath]
  return {
    types: entry.types.replace(/^\.\//, ''),
    esm: entry.import.replace(/^\.\//, ''),
    cjs: entry.require.replace(/^\.\//, '')
  }
}

function checkBuildArtifacts() {
  section('1. Build artifacts')
  for (const subpath of SUBPATHS) {
    const { types, esm, cjs } = distArtifactsFor(subpath)
    for (const f of [types, esm, cjs]) {
      const abs = resolve(ROOT, f)
      if (!existsSync(abs)) {
        console.error(`Missing build artifact: ${f}. Run "pnpm build" first.`)
        process.exit(2)
      }
      pass(f)
    }
  }
}

async function checkNamedExports() {
  for (const subpath of SUBPATHS) {
    const { esm, cjs } = distArtifactsFor(subpath)
    const expected = EXPECTED_EXPORTS[subpath]

    section(`2. ESM named exports: ${subpath}`)
    const esmModule = await import(resolve(ROOT, esm))
    for (const name of expected) {
      if (name in esmModule) pass(`export ${name}`)
      else fail(`Missing export: ${name}`)
    }
    if (expected.length === 0) pass('no named exports declared yet')

    section(`3. CJS named exports: ${subpath}`)
    const cjsModule = require(resolve(ROOT, cjs))
    for (const name of expected) {
      if (name in cjsModule) pass(`cjs export ${name}`)
      else fail(`Missing CJS export: ${name}`)
    }
    if (expected.length === 0) pass('no named exports declared yet')
  }
}

function packTarball() {
  packOutDir = mkdtempSync(join(tmpdir(), 'dogfood-pack-'))
  const packJson = execSync(`npm pack --json --pack-destination "${packOutDir}"`, {
    cwd: ROOT,
    encoding: 'utf8'
  })
  const [result] = JSON.parse(packJson)
  return { tarballPath: resolve(packOutDir, result.filename), files: result.files }
}

function checkTarballContents(files) {
  section('4. Tarball contents (npm pack)')
  const unexpectedFiles = files
    .map((f) => f.path)
    .filter((f) => !ALLOWED_TARBALL_PATHS.some((prefix) => f === prefix || f.startsWith(prefix)))
  if (unexpectedFiles.length === 0) {
    pass(`Tarball contains only dist/ + meta files (${files.length} entries)`)
  } else {
    for (const f of unexpectedFiles) fail(`Unexpected file in tarball: ${f}`)
  }
}

function scaffoldConsumer(tarballPath) {
  consumerDir = mkdtempSync(join(tmpdir(), 'dogfood-consumer-'))
  const consumerPkgJson = {
    name: 'dogfood-consumer',
    version: '0.0.1',
    type: 'module',
    dependencies: { [pkg.name]: `file:${tarballPath}` }
  }
  writeFileSync(resolve(consumerDir, 'package.json'), JSON.stringify(consumerPkgJson, null, 2))
  return spawnSync('pnpm', ['install', '--no-frozen-lockfile'], {
    cwd: consumerDir,
    encoding: 'utf8',
    timeout: 60_000
  })
}

function checkConsumerResolution() {
  const esmScript = SUBPATHS.map((s) => `import(${JSON.stringify(specifierFor(s))})`)
  const esmProbe = [
    `Promise.all([${esmScript.join(', ')}])`,
    '.then(() => process.exit(0))',
    '.catch((e) => { console.error(e); process.exit(5) })'
  ].join('')
  const esmResult = spawnSync('node', ['--input-type=module', '-e', esmProbe], {
    cwd: consumerDir,
    encoding: 'utf8',
    timeout: 30_000
  })
  if (esmResult.status === 0) pass('ESM specifiers resolve via exports map from consumer cwd')
  else fail(`Consumer ESM import failed (code ${esmResult.status}): ${esmResult.stderr}`)

  const cjsLines = SUBPATHS.map((s) => `require(${JSON.stringify(specifierFor(s))})`).join('\n')
  const cjsResult = spawnSync('node', ['--input-type=commonjs', '-e', cjsLines], {
    cwd: consumerDir,
    encoding: 'utf8',
    timeout: 30_000
  })
  if (cjsResult.status === 0) pass('CJS specifiers resolve via exports map from consumer cwd')
  else fail(`Consumer CJS require failed (code ${cjsResult.status}): ${cjsResult.stderr}`)
}

function checkConsumerInstall() {
  section('5. Consumer file: install smoke (packed tarball)')
  const { tarballPath, files } = packTarball()
  checkTarballContents(files)

  const installResult = scaffoldConsumer(tarballPath)
  if (installResult.status !== 0) {
    fail(`pnpm install in consumer failed: ${installResult.stderr}`)
    return
  }
  pass('pnpm install with packed tarball succeeded')
  checkConsumerResolution()
}

function cleanup() {
  for (const dir of [consumerDir, packOutDir]) {
    if (!dir) continue
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup: a leftover temp dir does not affect correctness.
    }
  }
}

checkBuildArtifacts()
await checkNamedExports()
try {
  checkConsumerInstall()
} catch (err) {
  fail(`Consumer scaffolding failed: ${String(err.message)}`)
} finally {
  cleanup()
}

console.log('')
if (failures === 0) {
  console.log('All dogfood smoke assertions passed.')
  process.exit(0)
} else {
  console.error(`${failures} assertion(s) failed.`)
  process.exit(1)
}
