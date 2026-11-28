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

/** The diagnostics of the prepared snippets compiled as one project, as `file: TScode`. */
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
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => `${basename(d.file?.fileName ?? '')}: TS${String(d.code)}`)
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('readme-snippets', () => {
  // Scenario: one snippet declares an interface and a second uses it without declaring or importing
  // it. Expected: the second reports the name as unknown. Why: each snippet is a claim of its own, so
  // a declaration must not reach another snippet.
  it('keeps a declaration inside the snippet that makes it', () => {
    const found = diagnose(
      'interface Leaked {\n  a: string\n}\n',
      "const v: Leaked = { a: 'x' }\nconsole.log(v)\n"
    )
    expect(found).toContain('snippet-2.ts: TS2304')
  })

  // Scenario: a snippet that declares a function and mentions no public name also declares a constant
  // nothing reads. Expected: the unused constant is reported. Why: unused declarations are reported
  // only inside a module, so every prepared snippet has to be one.
  it('reports an unused local in a snippet that declares and imports nothing', () => {
    expect(diagnose('export function helper(): number {\n  return 1\n}\n')).toEqual([])
    expect(diagnose('function helper(): void {}\nconst unused = 1\n')).toContain(
      'snippet-1.ts: TS6133'
    )
  })
})
