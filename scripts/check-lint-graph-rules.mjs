/**
 * @fileoverview Import-graph gate — proves the lint rules that read a module's
 * exports can actually see them, by making a real cycle and requiring the lint
 * to reject it.
 * @layer scripts
 *
 * The rules that walk the import graph (`no-cycle`, `named`, `namespace`,
 * `no-unused-modules`) work in two stages, and only one of them is visible in
 * the configuration. A resolver answers where a specifier points; a separate
 * dependency parser answers what the resolved file exports. That parser opens
 * each dependency itself and **skips in silence** every extension it cannot map
 * to a parser, which on a TypeScript project is all of them unless
 * `import-x/parsers` says otherwise.
 *
 * The failure is therefore invisible from the configuration. A rule declared
 * `error`, and reported enabled by `eslint --print-config`, still walks an empty
 * graph and lets a genuine cycle exit 0 — so neither the rule's severity nor the
 * printed config is evidence that it can see anything.
 *
 * That is why the mapping is not left to a reviewer noticing it was dropped.
 * This gate asserts the behaviour instead: it writes a cycle, runs the real lint
 * over it, and fails when the cycle is not reported. Any edit that blinds the
 * graph rules turns this red.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The rule whose silence this gate exists to detect. */
const GRAPH_RULE = 'import-x/no-cycle'

/** ESLint's numeric severity for an error; `warn` is 1 and does not fail a run. */
const ERROR_SEVERITY = 2

/**
 * The probe lives under `src/` because the lint configuration scopes the graph
 * rules to `src/**\/*.ts`. A temporary directory elsewhere would be linted by a
 * block that never enables them, and the gate would pass by not applying.
 *
 * Converted with `fileURLToPath` rather than read off `.pathname`, which keeps
 * the URL's percent-encoding: a checkout under a directory with a space in its
 * name would yield `%20` and a path that does not exist.
 */
const PROBE_PARENT = fileURLToPath(new URL('../src/', import.meta.url))

/**
 * Write a two-module import cycle into a throwaway directory.
 *
 * @param {string} dir - The directory to write the cycle into.
 * @returns {string[]} The two file paths forming the cycle.
 */
function writeCycle(dir) {
  const a = join(dir, 'cycle-a.ts')
  const b = join(dir, 'cycle-b.ts')
  writeFileSync(a, "import { b } from './cycle-b'\n\nexport const a = (): string => b()\n")
  writeFileSync(b, "import { a } from './cycle-a'\n\nexport const b = (): string => a()\n")
  return [a, b]
}

/**
 * Run the repository's own ESLint over the probe files.
 *
 * Invoked through the local binary rather than the API so the gate exercises the
 * same resolution path a developer and the pipeline do.
 *
 * @param {string[]} files - The probe files to lint.
 * @returns {{ status: number | null, output: string }} Exit status and combined output.
 */
function lint(files) {
  const result = spawnSync(
    'node_modules/.bin/eslint',
    ['--format', 'json', ...files.map((file) => relative(process.cwd(), file))],
    { encoding: 'utf8' }
  )
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/**
 * Report whether the lint *rejected* the cycle, rather than merely noticing it.
 *
 * Both halves are load-bearing, and each covers a regression the other misses:
 *
 * - The rule id must appear at **error** severity. Downgraded to `warn` the rule
 *   still emits a message carrying this id, and ESLint still exits 0 — so a gate
 *   that matched the id alone would stay green while the cycle no longer failed
 *   anything, which is the configuration regression this exists to catch.
 * - The run must exit nonzero, and the id must be present. Status alone would
 *   read a lint failing for an unrelated reason as the cycle being caught, and
 *   the gate would pass while the graph rules stayed blind.
 *
 * @param {{ status: number | null, output: string }} result - The lint run.
 * @returns {boolean} True when the cycle was reported as an error and failed the run.
 */
function rejectsCycle({ status, output }) {
  let raised
  try {
    raised = JSON.parse(output).some((file) =>
      (file.messages ?? []).some(
        (message) => message.ruleId === GRAPH_RULE && message.severity === ERROR_SEVERITY
      )
    )
  } catch {
    // A formatter that produced no parseable JSON cannot be read as a pass.
    return false
  }
  return raised && status !== 0
}

// The probe is a real import cycle inside `src/`, so leaving one behind would
// break every later lint and coverage run in the checkout. `process.exit()`
// does not run `finally`, so the failure is recorded here and reported only
// after cleanup has happened.
let failure

const dir = mkdtempSync(join(PROBE_PARENT, 'lint-graph-probe-'))
try {
  const result = lint(writeCycle(dir))
  if (!rejectsCycle(result)) {
    failure =
      `Import-graph gate FAILED: a real dependency cycle was not rejected by ${GRAPH_RULE}.\n\n` +
      'Two causes produce this. The rule may be blind, the usual reason being a\n' +
      "missing `import-x/parsers` entry in eslint.config.mjs mapping '.ts' to\n" +
      '@typescript-eslint/parser, without which it cannot read what a resolved\n' +
      'dependency exports and reports nothing. Or the rule may have been\n' +
      'downgraded to `warn`, which still reports the cycle but no longer fails\n' +
      'the run.\n\n' +
      `ESLint exit status: ${result.status}\nESLint output:\n${result.output}`
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failure !== undefined) {
  console.error(failure)
  process.exit(1)
}
console.log(`Import-graph rules can see the module graph (${GRAPH_RULE} rejected a real cycle).`)
