/**
 * @fileoverview Published-surface gate — proves the README, the CHANGELOG and the exported
 * types describe the package that is actually about to ship.
 * @layer scripts
 *
 * Every check here exists because its absence let a defect reach npm:
 *
 * - `1.0.3` shipped a README whose "Example App" link returned 404. Nothing read
 *   the links.
 * - `1.0.4` fixed an exported type that rejected the very snippet the README
 *   shows. `test:types` compiles `src` through a `paths` mapping, so it never
 *   sees what a consumer resolving through `exports` sees, and the consumer
 *   fixture happened to use a workaround form.
 * - A pull request deleted a `## [x.y.z]` heading while adding the next one,
 *   which leaves the release with no notes section, so the workflow stops before publishing.
 * - README examples are checked against the types a consumer sees, by `readme-snippets.mjs`,
 *   which keeps its own constraints.
 *
 * Run after `pnpm build` — the snippets compile against `dist/`.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkLinks } from './published-surface-links.mjs'
import { checkSnippets } from './readme-snippets.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')
const CHANGELOG = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')

const failures = []
/** Record a failure without stopping, so one run reports every problem. */
const fail = (check, detail) => failures.push(`${check}: ${detail}`)

// ---------------------------------------------------------------------------
// 1. Every link in the README points somewhere real. A bad HTTP status fails the
//    gate; a link the machine could not reach at all is reported as a note, since
//    an offline runner is not a defect in the documentation. The check is the family
//    template `published-surface-links.mjs`, called at the end of this file.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. The release notes for this version are extractable.
// ---------------------------------------------------------------------------

/** Mirrors the awk in `release.yml`: everything between this version's heading
 * and the next one, where the heading is matched as a literal prefix so only its
 * own first bracket counts. Kept deliberately identical — a check that reads the
 * file differently from the workflow proves nothing about the workflow. */
function releaseNotes(version) {
  const lines = CHANGELOG.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^## \[/.test(l))
  // `.replace(/\s+$/, '')` and not `.trim()`: the awk prints each line verbatim
  // and only command substitution drops the trailing newline. Trimming the left
  // side too would report a different body from the one the release publishes.
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').replace(/\s+$/, '')
}

function checkChangelog() {
  const notes = releaseNotes(PKG.version)
  if (notes === null) {
    fail(
      'changelog',
      `no "## [${PKG.version}]" heading — the release workflow would stop before publishing`
    )
    return
  }
  if (notes.length < 40) {
    fail(
      'changelog',
      `the "${PKG.version}" section is ${notes.length} characters — almost certainly an empty heading`
    )
  }
  const headings = [...CHANGELOG.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1])
  const documented = new Set(headings.filter((h) => /^\d+\.\d+\.\d+$/.test(h)))
  for (const v of documented) {
    const n = releaseNotes(v)
    if (!n || n.length < 40) fail('changelog', `the "${v}" section is empty or missing`)
  }

  // Every version heading is reference-link syntax, so it renders as plain text
  // unless a `[x.y.z]: url` definition exists. Three headings had one and three
  // did not, which is invisible until someone reads the rendered file.
  const defined = new Set([...CHANGELOG.matchAll(/^\[(\d+\.\d+\.\d+)\]: /gm)].map((m) => m[1]))
  for (const v of documented) {
    if (!defined.has(v)) {
      fail(
        'changelog',
        `the "${v}" heading is a reference link with no \`[${v}]: …\` definition, so it renders as plain text`
      )
    }
  }

  // Checking only the versions the file happens to list cannot notice one that
  // is ABSENT — and a heading deleted while adding the next one is exactly how
  // the 1.0.3 entry was swallowed by 1.0.4. The tags are the outside source of
  // truth for what was released, so they are what the file is measured against.
  // `actions/checkout` clones with depth 1 and no tags, so `git tag --list`
  // returns an empty set with exit code 0 — the cross-check would pass by
  // finding nothing to check. Fetch them first, and if they still are not there
  // while the changelog claims released versions, say so instead of passing:
  // a silent no-op is the failure mode this whole gate exists to prevent.
  try {
    // Bounded: an unreachable remote must not hang a publish. On timeout the
    // local tags below are all there is, and the shallow guard still fires.
    execFileSync('git', ['fetch', '--tags', '--quiet'], {
      cwd: ROOT,
      stdio: 'ignore',
      timeout: 20_000
    })
  } catch {
    // No network or no remote — the local tags below are then all there is.
  }
  // Declared without a value: the try below either assigns it or the catch
  // returns, so an initialiser would be a store nothing ever reads.
  let released
  try {
    released = execFileSync('git', ['tag', '--list', 'v*.*.*'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((t) => t.trim().replace(/^v/, ''))
      .filter((t) => /^\d+\.\d+\.\d+$/.test(t))
  } catch {
    fail('changelog', 'could not list git tags, so no version could be cross-checked')
    return
  }
  // No tags is the normal state of a package that has never been released, so
  // the absence alone proves nothing. What must not pass quietly is a SHALLOW
  // checkout, where the tags exist but were not fetched — there the check would
  // find nothing and report success.
  let shallow = false
  try {
    shallow =
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: ROOT,
        encoding: 'utf8'
      }).trim() === 'true'
  } catch {
    // Not a git repository at all; the tag list below is simply empty.
  }
  if (released.length === 0 && shallow) {
    fail(
      'changelog',
      'the checkout is shallow and carries no tags, so the cross-check cannot run. ' +
        'In CI, check out with `fetch-depth: 0` or `fetch-tags: true`.'
    )
    return
  }
  const missing = released.filter((v) => !documented.has(v))
  for (const v of missing) {
    fail(
      'changelog',
      `v${v} is tagged but has no "## [${v}]" section — its release notes would be the generic fallback`
    )
  }
  console.log(
    `  changelog: ${documented.size} sections, cross-checked against ${released.length} tag(s)`
  )
}

// ---------------------------------------------------------------------------

console.log(`Published-surface gate — ${PKG.name}@${PKG.version}`)
await checkLinks({ readme: README, root: ROOT, fail })
checkChangelog()
checkSnippets(fail)

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} problem(s):\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\n✔ The documentation and the exported types match the built package.')
