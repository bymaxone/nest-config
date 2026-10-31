/**
 * @fileoverview The README-snippet half of the published-surface gate: compiles every
 * TypeScript fence of the README against the built package, the way a consumer sees it.
 * @layer scripts
 *
 * The compile keeps three constraints:
 *
 * 1. Syntactic and semantic diagnostics are collected together. The `tsc` command stops
 *    after syntax errors, so one unparsable snippet would hide every semantic error in the
 *    others; the project is compiled through the TypeScript API.
 * 2. Every snippet is compiled, with the package's public names imported for those that do
 *    not import it, and a relative import resolves to the README snippet that declares what
 *    it imports, so a value passed through it keeps its type.
 * 3. The names a snippet takes from the surrounding prose are typed in
 *    `scripts/readme-prelude.d.ts`; an undeclared name is an error, and a typed one is
 *    checked instead of resolving to `any`.
 *
 * Run through `check-published-surface.mjs` after `pnpm build` — the snippets compile
 * against `dist/`.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')

/** A throwaway consumer built by this script. Nothing outside it is touched, and
 * it is portable: the sibling libraries have no consumer fixture to borrow.
 *
 * The package is symlinked into its own `node_modules` so TypeScript resolves it
 * through the published `exports` map into `dist/` — exactly what a consumer
 * sees — while peers still resolve by walking up to the repository's own
 * `node_modules`. */
const GATE_DIR = join(ROOT, '.docs-gate')

/** The published type tests, compiled here against `dist/` as well. Empty when a
 * library has none — the check then covers only the README snippets. */
const TYPE_TESTS_GLOB = existsSync(join(ROOT, 'test', 'types')) ? '../test/types/**/*.ts' : '*.ts'

/** The repository's pinned compiler, loaded as a library: the `tsc` command stops
 * after the syntax errors and never reports the semantic ones, so a single
 * unparsable snippet would hide every wrong option name in every other snippet
 * and in the type tests. */
const ts = createRequire(join(ROOT, 'package.json'))('typescript')

/** The consumer project as TypeScript parses it: its files and compiler options. */
function gateProject() {
  const config = ts.readConfigFile(join(GATE_DIR, 'tsconfig.json'), ts.sys.readFile)
  return ts.parseJsonConfigFileContent(config.config, ts.sys, GATE_DIR)
}

/** Every name the package root exports, and whether it is a value or only a type, read
 * from the built declaration file so it cannot drift from `dist/`. The program uses the
 * consumer project's options, because the root declaration re-exports from
 * `<pkg>/internal` by package name. */
function publicNames(options) {
  const entry = join(ROOT, 'dist', 'index.d.ts')
  const program = ts.createProgram({ rootNames: [entry], options })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(entry)
  const moduleSymbol = source && checker.getSymbolAtLocation(source)
  const symbols = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []
  return symbols.map((symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    return { name: symbol.name, isValue: Boolean(target.flags & ts.SymbolFlags.Value) }
  })
}

/** One `import ... from '...'` statement, so it can be lifted out of a snippet or kept
 * out of a search for what the snippet itself declares. */
const IMPORT_STATEMENT = /^import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;?\n/gm

/** Names a snippet declares at its top level. */
const declaredNames = (code) =>
  [
    ...code.matchAll(
      /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const)\s+(\w+)/gm
    )
  ].map((m) => m[1])

/** Turns a README fragment into something a compiler can check without changing what
 * it claims. A snippet that does not import the package gets every public name
 * imported, except the ones it declares itself; one that uses `z` without importing it
 * gets zod; a fragment that is a property of the schema shape goes inside `defineEnv`;
 * a block of statements goes in an async function so `await` means what the prose
 * means. Imports are hoisted out of the wrapper, and a snippet that declares classes or
 * types is left as written, apart from a class that restates an exported one, which
 * becomes an ambient declaration so its fields need no initializer. */
function prepareSnippet(code, importsPkg, names) {
  const imports = code.match(IMPORT_STATEMENT) ?? []
  // `{ ... }` is how a snippet says "the usual arguments". Left alone it is a parse
  // error, and a parse error in a call hides every semantic error around it.
  let body = code.replace(IMPORT_STATEMENT, '').replaceAll('{ ... }', '{} as never')
  const declared = new Set(declaredNames(body))
  const restated = names.filter((n) => declared.has(n.name))
  const headerLines = []
  if (!importsPkg) {
    const parts = names
      .filter((n) => !declared.has(n.name))
      .map((n) => (n.isValue ? n.name : `type ${n.name}`))
    headerLines.push(`import { ${parts.join(', ')} } from '${PKG.name}'`)
  }
  if (/\bz\./.test(body) && !imports.some((i) => /from ['"]zod['"]/.test(i))) {
    headerLines.push("import { z } from 'zod'")
  }
  const header = `${headerLines.join('\n')}${headerLines.length > 0 ? '\n' : ''}${imports.join('')}`
  if (restated.length > 0) {
    body = body.replace(/^((?:export\s+)?)class\s/gm, '$1declare class ')
  }
  const declares =
    /^(export\s+)?(declare\s+)?(abstract\s+)?(class|interface|type|enum|function)\s|^export\s+const\s/m.test(
      body
    )
  if (declares) return `${header}${body}`
  const isShapeProperty = /^(?:\s*\/\/.*\n)*\s*[A-Za-z_]\w*\s*:\s/.test(body)
  if (isShapeProperty) return `${header}defineEnv({\n${body}})\n`
  return `${header}async function snippet() {\n${body}}\n`
}

/** Where a snippet leaves an argument, an element or a property out with a bare `...`, as
 * the positions of the diagnostics the parser reports for it. The parse tree decides, not
 * the text: regular expressions, template literals, JSX text, comments and strings are
 * already resolved there, so none of them can pass for an elision. An elision is a spread
 * whose expression is missing, and the parser reports the missing expression at the next
 * token, which is where the position is taken. Returns `line:column` keys, both 1-based,
 * in the numbering of the compiled text. */
function elisionPositions(code, ext) {
  const kind = ext === 'tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile('snippet', code, ts.ScriptTarget.Latest, true, kind)
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, file.languageVariant, code)
  const positions = new Set()
  const visit = (node) => {
    const spread = node.kind === ts.SyntaxKind.SpreadElement || ts.isSpreadAssignment(node)
    if (spread && node.expression.pos === node.expression.end) {
      scanner.resetTokenState(node.expression.pos)
      scanner.scan()
      const { line, character } = file.getLineAndCharacterOfPosition(scanner.getTokenStart())
      positions.add(`${String(line + 1)}:${String(character + 1)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return positions
}

/** Compiles the consumer project and returns every diagnostic as a `tsc`-shaped
 * line, syntactic and semantic together. */
function compileGate() {
  const parsed = gateProject()
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const text = ts.flattenDiagnosticMessageText(d.messageText, ' ')
    if (!d.file) return `error TS${String(d.code)}: ${text}`
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start ?? 0)
    const where = relative(ROOT, d.file.fileName).split(sep).join('/')
    return `${where}(${String(line + 1)},${String(character + 1)}): error TS${String(d.code)}: ${text}`
  })
}

// ---------------------------------------------------------------------------
// A throwaway consumer, so everything below resolves through `exports` → dist/.
// ---------------------------------------------------------------------------

/** Create `.docs-gate/` with the package symlinked into its own `node_modules`.
 * `paths` is emptied: the repository tsconfig maps the package name to `./src`,
 * which is precisely the mapping that has to be out of the way here. */
function scaffoldConsumer() {
  rmSync(GATE_DIR, { recursive: true, force: true })
  const scope = join(GATE_DIR, 'node_modules', ...PKG.name.split('/').slice(0, -1))
  mkdirSync(scope, { recursive: true })
  // 'junction' rather than 'dir': a directory symlink needs elevation or Developer
  // Mode on Windows, where a junction does not. Node ignores the type on POSIX.
  symlinkSync(ROOT, join(GATE_DIR, 'node_modules', PKG.name), 'junction')
  writeFileSync(
    join(GATE_DIR, 'tsconfig.json'),
    `${JSON.stringify(
      {
        extends: '../tsconfig.json',
        compilerOptions: {
          noEmit: true,
          rootDir: '..',
          baseUrl: '.',
          paths: {},
          noUnusedLocals: false,
          // A README snippet may name a handler parameter it does not use; that is
          // prose, not an API defect.
          noUnusedParameters: false,
          // A React snippet is JSX; without this it fails to parse for a reason
          // that says nothing about the published API. Inert when there is none.
          jsx: 'react-jsx'
        },
        include: ['*.ts', '*.tsx', TYPE_TESTS_GLOB]
      },
      null,
      2
    )}\n`
  )
  // The names a snippet uses without introducing them, typed for real so a call
  // made through one is checked instead of silently resolving to `any`. Copied with a
  // `.ts` extension: the repository tsconfig sets `skipLibCheck`, a declaration file is
  // never diagnosed, and a prelude type that stopped resolving would turn into `any`
  // without a word.
  copyFileSync(join(ROOT, 'scripts', 'readme-prelude.d.ts'), join(GATE_DIR, 'prelude.ts'))
}

// ---------------------------------------------------------------------------
// 3. The README's own snippets compile against the built package.
// ---------------------------------------------------------------------------

/** Relative imports across the snippets, each resolved to the first snippet that
 * exports every name imported from it. A README shows `./config/env.schema` in one
 * block and imports it in another, so the importing block is checked against the
 * schema the README actually wrote instead of against `any`. */
function localModules(blocks) {
  const modules = new Map()
  for (const { code } of blocks) {
    for (const m of code.matchAll(
      /^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/gm
    )) {
      const [, list, specifier] = m
      if (modules.has(specifier)) continue
      const wanted = list
        .split(',')
        .map(
          (n) =>
            n
              .trim()
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0]
        )
        .filter(Boolean)
      const source = blocks.find((b) =>
        wanted.every((n) =>
          new RegExp(
            `^export\\s+(?:const|class|interface|type|function|enum)\\s+${n}\\b`,
            'm'
          ).test(b.code)
        )
      )
      if (source) modules.set(specifier, source)
    }
  }
  return modules
}

export function checkSnippets(fail) {
  // `tsx` too, and the fence language is kept: a React example has to be written
  // to a .tsx file or it does not parse, and a package with a React subpath
  // documents its surface in exactly those blocks.
  const blocks = [...README.matchAll(/^```(ts|typescript|tsx)\n([\s\S]*?)^```$/gm)].map((m) => ({
    ext: m[1] === 'tsx' ? 'tsx' : 'ts',
    code: m[2]
  }))
  const importsPackage = (code) => new RegExp(`from ['"]${PKG.name}`).test(code)
  if (!blocks.some((b) => importsPackage(b.code))) {
    fail('snippets', 'no README snippet imports the package — the gate would be vacuous')
    return
  }

  scaffoldConsumer()
  const names = publicNames(gateProject().options)
  const prepare = (b) => prepareSnippet(b.code, importsPackage(b.code), names)

  /** file name → what the author wrote, so a diagnostic can be traced back to the snippet. */
  const sources = new Map()
  // Every snippet is compiled, not only the ones that import the package: a snippet
  // that shows a `forRootAsync({ ... })` call without repeating the import still
  // makes a claim about the options.
  /** file name → the positions of its elisions in the text actually compiled, which is
   * what a diagnostic's line and column index. */
  const elisions = new Map()
  blocks.forEach((b, i) => {
    const name = `snippet-${String(i + 1).padStart(2, '0')}.${b.ext}`
    const code = prepare(b)
    sources.set(name, b.code)
    elisions.set(name, elisionPositions(code, b.ext))
    writeFileSync(join(GATE_DIR, name), code)
  })
  for (const [specifier, source] of localModules(blocks)) {
    const file = join(GATE_DIR, `${specifier}.ts`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, prepare(source))
  }

  // What is still not held against a snippet is the parse error a bare `...` elision
  // leaves in an argument, element or property position, and a peer package the fixture
  // does not install; those are counted and reported, never dropped silently.
  const PARSE_ELISION = new Set(['TS1108', 'TS1109'])
  /** The snippet file a diagnostic line points at, with its path split on either
   * separator because paths may carry backslashes on Windows. */
  const fileOf = (line) => (/^([^(]+)\(/.exec(line)?.[1] ?? '').split(/[\\/]/).pop() ?? ''
  /** Whether a parse diagnostic is the one the parser reports for an elision. Decided by
   * the diagnostic's own position, so an ellipsis elsewhere in the snippet, or on the same
   * line, says nothing about a missing expression somewhere else. */
  const isParseElision = (line) => {
    if (!PARSE_ELISION.has((/error (TS\d+)/.exec(line) ?? [])[1])) return false
    const at = /\((\d+),(\d+)\)/.exec(line)
    return at !== null && (elisions.get(fileOf(line))?.has(`${at[1]}:${at[2]}`) ?? false)
  }
  /** `Property 'x' does not exist on type 'Y'` is an API defect when `Y` comes
   * from the package, and snippet noise when `Y` is a class the snippet declares
   * itself and abbreviates — a README example routinely writes `this.repo`
   * without spelling out the constructor that injects it. Decided by looking for
   * the declaration in the snippet the author wrote, not the one compiled. */
  const isAbbreviatedLocalType = (line) => {
    const m = /Property '[^']+' does not exist on type '([^']+)'/.exec(line)
    if (!m) return false
    const file = /^([^(]+)\(/.exec(line)?.[1]
    // A union, an object type or a generic instance is not a declared name, and an
    // imported `type Name` is the package's own type: neither may exempt the error.
    if (!/^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u.test(m[1])) return false
    // `tsc` emits backslashes on Windows, so the basename is taken on either.
    const own = (sources.get(file?.split(/[\\/]/).pop() ?? '') ?? '').replace(IMPORT_STATEMENT, '')
    // `$` is the one identifier character that is also a regexp metacharacter, so it is
    // escaped; a lookahead over the identifier-continue characters, not `\b`, ends the
    // name, so a non-ASCII letter or a `$` neither cuts it short nor extends it.
    const name = m[1].replaceAll('$', '\\$')
    return new RegExp(
      `\\b(class|interface|type)\\s+${name}(?![\\p{ID_Continue}$\\u200c\\u200d])`,
      'u'
    ).test(own)
  }
  /** An import of some OTHER package the fixture does not install — a documented
   * optional integration. A relative import that no snippet declares is a defect. */
  const isForeignModule = (line) => {
    const specifier = /Cannot find module '([^']+)'/.exec(line)?.[1]
    return (
      /error TS2307/.test(line) &&
      specifier !== undefined &&
      !specifier.startsWith('.') &&
      !specifier.startsWith(PKG.name)
    )
  }

  try {
    const lines = compileGate()
    if (process.env.GATE_DEBUG) console.log(lines.join('\n'))
    const real = lines.filter(
      (l) => !isParseElision(l) && !isForeignModule(l) && !isAbbreviatedLocalType(l)
    )
    const context = lines.length - real.length
    if (real.length > 0) {
      fail(
        'snippets',
        `${real.length} README snippet error(s) about the published API:\n${real.map((l) => `      ${l}`).join('\n')}`
      )
    }
    console.log(
      `  snippets: ${blocks.length} compiled against dist/` +
        (context > 0
          ? ` (${context} diagnostic(s) ignored: a peer the fixture does not install, or a parse-level elision)`
          : '')
    )
  } finally {
    rmSync(GATE_DIR, { recursive: true, force: true })
  }
}
