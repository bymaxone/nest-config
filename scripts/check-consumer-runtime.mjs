#!/usr/bin/env node
/**
 * Consumer runtime gate.
 *
 * Every other gate reads the source or the type declarations. This one packs the
 * tarball, lays it out the way npm would, and boots NestJS against it — in ESM
 * and in CommonJS — because a defect in how the entry points are *bundled* is
 * invisible to all of them.
 *
 * What it proves: a consumer can register `configTestingModule()` from
 * `@bymax-one/nest-config/testing` and then resolve `ConfigService` and
 * `BYMAX_CONFIG` imported from the package root — the flow `configTestingModule`
 * documents. Entry points are separate bundles, so a module reached from two of
 * them by a relative path is copied into each, and a copied class is a different
 * injection token, so the container rejects both while the source suite and
 * `attw` stay green.
 *
 * It shells out to `npm pack` and `tar`, both of which have to be on PATH. That
 * is deliberate: packing through npm itself is what makes the gate inspect the
 * same tarball a publish would produce, rather than a directory that resembles
 * it. On Windows, run it from a shell that provides `tar` (Git Bash, WSL, or
 * Windows 10 1803+, which ships bsdtar).
 *
 * Usage: `node scripts/check-consumer-runtime.mjs` (run after `pnpm build`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
// Read from the manifest rather than hard-coded: this gate exists to inspect
// the packed artifact, so a rename must not leave it silently checking a
// package that no longer exists.
const packageName = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).name

// The consumer lives inside the repository so Node walks up to the repo's own
// `node_modules` for the peer dependencies. Nothing is installed and nothing is
// fetched; only the package under test comes from the tarball.
const consumerDir = join(rootDir, '.consumer-runtime-check')

/** Values the package root must expose, whatever the resolution mode. */
const ROOT_EXPORTS = [
  'BymaxConfigModule',
  'ConfigService',
  'BYMAX_CONFIG',
  'BYMAX_CONFIG_OPTIONS',
  'BymaxConfigValidationError',
  'ConfigErrorCode',
  'defineEnv'
]

/** Values the testing subpath must expose. */
const TESTING_EXPORTS = ['createTestConfig', 'configTestingModule']

/** Tokens the testing module has to provide under the root's identities. */
const RESOLVED_TOKENS = ['ConfigService', 'BYMAX_CONFIG']

/**
 * The probe, identical in both formats. Only the bindings it opens with differ,
 * which is the point: the same assertions have to hold under `import` and under
 * `require`, and only running both can show that they do.
 */
const probeBody = `
const failures = []
const missing = (namespace, names) => names.filter((n) => namespace[n] === undefined).join(', ')

const absentRoot = missing(root, ${JSON.stringify(ROOT_EXPORTS)})
if (absentRoot) failures.push('root does not export: ' + absentRoot)
const absentTesting = missing(testing, ${JSON.stringify(TESTING_EXPORTS)})
if (absentTesting) failures.push('./testing does not export: ' + absentTesting)

const main = async () => {
  const schema = root.defineEnv({ server: z.object({ port: z.coerce.number().default(3000) }) })

  // The gate itself: a module registered from one entry point, its providers
  // resolved through the objects the *other* entry point exports. A second copy
  // of the shared runtime fails here and nowhere else.
  const moduleRef = await Test.createTestingModule({
    imports: [testing.configTestingModule(schema)],
  }).compile()
  try {
    const unresolved = []
    for (const name of ${JSON.stringify(RESOLVED_TOKENS)}) {
      try {
        moduleRef.get(root[name])
      } catch (error) {
        const kind = error && error.constructor ? error.constructor.name : 'Error'
        unresolved.push(name + ' (' + kind + ')')
      }
    }
    if (unresolved.length) failures.push('configTestingModule: ' + unresolved.join(', '))
    const service = moduleRef.get(root.ConfigService)
    if (!(service instanceof root.ConfigService)) {
      failures.push('ConfigService instance is not an instance of the exported class')
    }
  } finally {
    await moduleRef.close()
  }

  // createTestConfig must reject through the error class the root exports, or a
  // consumer's \`instanceof\` narrowing silently misses it.
  try {
    root.defineEnv({ server: z.object({ port: z.coerce.number() }) })
    const bad = testing.createTestConfig(
      root.defineEnv({ server: z.object({ port: z.coerce.number() }) }),
      { server: { port: 'not-a-number' } },
    )
    if (bad === undefined) failures.push('createTestConfig returned undefined')
  } catch (error) {
    if (!(error instanceof root.BymaxConfigValidationError)) {
      failures.push(
        'createTestConfig threw ' + (error && error.constructor ? error.constructor.name : '?') +
          ', which is not the BymaxConfigValidationError the root exports',
      )
    }
  }

  if (failures.length) {
    for (const failure of failures) console.error('  ✗ ' + failure)
    process.exit(1)
  }
  console.log('  ✓ ' + FORMAT + ': testing module registered, ' + ${RESOLVED_TOKENS.length} +
    ' token(s) resolved through the package root')
}

main().catch((error) => {
  console.error('  ✗ ' + FORMAT + ' probe crashed: ' + (error && error.stack ? error.stack : error))
  process.exit(1)
})
`

const esmProbe = `import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { z } from 'zod'
import * as root from '${packageName}'
import * as testing from '${packageName}/testing'
const FORMAT = 'ESM'
${probeBody}`

const cjsProbe = `require('reflect-metadata')
const { Test } = require('@nestjs/testing')
const { z } = require('zod')
const root = require('${packageName}')
const testing = require('${packageName}/testing')
const FORMAT = 'CJS'
${probeBody}`

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options })
}

function cleanup() {
  rmSync(consumerDir, { recursive: true, force: true })
}

console.log('Consumer runtime gate')

if (!existsSync(join(rootDir, 'dist'))) {
  console.error('✗ dist/ is missing — run `pnpm build` first')
  process.exit(1)
}

cleanup()
const packDir = mkdtempSync(join(tmpdir(), 'nest-config-pack-'))
let failed = false

try {
  // `--ignore-scripts` keeps `prepublishOnly` from rebuilding underneath the
  // artifact this gate is meant to inspect.
  const packOutput = run('npm', [
    'pack',
    '--ignore-scripts',
    '--silent',
    '--pack-destination',
    packDir
  ])
  const tarball = join(packDir, packOutput.trim().split('\n').pop().trim())

  const packageDir = join(consumerDir, 'node_modules', packageName)
  mkdirSync(packageDir, { recursive: true })
  run('tar', ['-xzf', tarball, '-C', packageDir, '--strip-components=1'])

  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ name: 'consumer-runtime-check', private: true, version: '0.0.0', type: 'module' }, null, 2)}\n`
  )
  writeFileSync(join(consumerDir, 'probe.mjs'), esmProbe)
  writeFileSync(join(consumerDir, 'probe.cjs'), cjsProbe)

  for (const probe of ['probe.mjs', 'probe.cjs']) {
    try {
      process.stdout.write(run('node', [probe], { cwd: consumerDir, stdio: 'pipe' }))
    } catch (error) {
      process.stdout.write(error.stdout ?? '')
      process.stderr.write(error.stderr ?? '')
      failed = true
    }
  }
} catch (error) {
  console.error(`✗ gate setup failed: ${error.message}`)
  if (error.stderr) process.stderr.write(error.stderr)
  failed = true
} finally {
  cleanup()
  rmSync(packDir, { recursive: true, force: true })
}

if (failed) {
  console.error('\n✗ The published artifact does not work for a consumer.')
  process.exit(1)
}

console.log('✓ Entry points share one runtime in ESM and CommonJS.')
