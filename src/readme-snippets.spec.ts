/**
 * @fileoverview Pins what `scripts/readme-snippets.mjs` hands the compiler for a README snippet. The
 * script is plain Node, so each case prepares its snippets in a child process and then compiles the
 * prepared files together, as the published-surface gate does, with unused locals and parameters on.
 *
 * @layer tests
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const SCRIPT = pathToFileURL(resolve(__dirname, '..', 'scripts', 'readme-snippets.mjs')).href

const roots: string[] = []

/** The text the gate compiles for a snippet that does not import the package. */
function prepare(code: string): string {
  const program = `import { prepareSnippet } from ${JSON.stringify(SCRIPT)}
process.stdout.write(prepareSnippet(${JSON.stringify(code)}, 'ts', false, []))`
  return execFileSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8'
  })
}

/** Every diagnostic of the prepared snippets compiled as one project, with the message, which is
 * what names the declaration a diagnostic is about: two unused names share one code. */
function diagnose(...snippets: string[]): string[] {
  const root = mkdtempSync(join(tmpdir(), 'readme-snippets-spec-'))
  roots.push(root)
  const files = snippets.map((code, index) => {
    const file = join(root, `snippet-${String(index + 1)}.ts`)
    writeFileSync(file, prepare(code))
    return file
  })
  const program = ts.createProgram(files, {
    noEmit: true,
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    types: []
  })
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, ' ')
    return `${basename(d.file?.fileName ?? '')}: TS${String(d.code)} ${message}`
  })
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('readme-snippets', () => {
  // Scenario: one snippet declares an interface and a second uses it without declaring or importing
  // it. Expected: the first reports it unused and the second reports the name as unknown. Why: each
  // snippet is a claim of its own, so a declaration must not reach another snippet.
  it('keeps a declaration inside the snippet that makes it', () => {
    const found = diagnose(
      'interface Leaked {\n  a: string\n}\n',
      "const v: Leaked = { a: 'x' }\nconsole.log(v)\n"
    )
    expect(found).toEqual([
      "snippet-1.ts: TS6196 'Leaked' is declared but never used.",
      "snippet-2.ts: TS2304 Cannot find name 'Leaked'."
    ])
  })

  // Scenario: a snippet with no import and no export declares a function nothing calls and a constant
  // nothing reads. Expected: both are reported by name. Why: unused declarations are reported only
  // inside a module, so every prepared snippet has to be one.
  it('reports each unused declaration of a snippet that imports and exports nothing', () => {
    expect(diagnose('function helper(): void {}\nconst unused = 1\n')).toEqual([
      "snippet-1.ts: TS6133 'helper' is declared but its value is never read.",
      "snippet-1.ts: TS6133 'unused' is declared but its value is never read."
    ])
  })

  // Scenario: a snippet that exports the function it declares. Expected: no diagnostic. Why: the
  // control for the two cases above, so that what they report comes from their snippets.
  it('reports nothing for a snippet that exports what it declares', () => {
    expect(diagnose('export function helper(): number {\n  return 1\n}\n')).toEqual([])
  })
})
