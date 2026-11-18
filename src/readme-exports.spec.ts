/**
 * Contract test: every name the published entry points export is documented in the README.
 *
 * Layer: unit.
 * Goal: `check:api` pins the declarations and `check:published` compiles the README's code
 * fences, but nothing asks whether a new export reached the README at all. This reads the
 * names out of `src/index.ts` and `src/testing/index.ts`, cross-checks the value names
 * against what the modules actually export at runtime so the parser cannot silently match
 * nothing, and asserts each name appears in the README's prose or tables as inline code.
 * Mocks: none. Reads README.md, src/index.ts and src/testing/index.ts.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as library from './index'
import * as testing from './testing'

const root = join(__dirname, '..')

/** The README with every fenced code block removed: prose, headings and tables only. */
const prose = (() => {
  let inFence = false
  return readFileSync(join(root, 'README.md'), 'utf8')
    .split('\n')
    .filter((line) => {
      if (line.trimStart().startsWith('```')) {
        inFence = !inFence
        return false
      }
      return !inFence
    })
    .join('\n')
})()

/** The inline code spans of the prose, joined: where an export has to be named. */
const inlineCode = (prose.match(/`[^`\n]+`/g) ?? []).join('\n')

/** The names of one barrel's `export { ... }` or `export type { ... }` blocks. */
function exportedNames(path: string, kind: 'value' | 'type'): ReadonlyArray<string> {
  const source = readFileSync(join(root, path), 'utf8')
  const blocks =
    source.match(kind === 'type' ? /export type \{[^}]*\}/g : /export \{[^}]*\}/g) ?? []
  return blocks.flatMap((block) =>
    block
      .slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
  )
}

const rootValues = exportedNames('src/index.ts', 'value')
const rootTypes = exportedNames('src/index.ts', 'type')
const testingValues = exportedNames('src/testing/index.ts', 'value')

describe('README names every published export', () => {
  it('reads the same value names from the barrels that the modules export at runtime', () => {
    expect([...rootValues].sort()).toEqual(Object.keys(library).sort())
    expect([...testingValues].sort()).toEqual(Object.keys(testing).sort())
  })

  it('reads the type names of the root barrel', () => {
    expect(rootTypes).toEqual(expect.arrayContaining(['EnvLeaf', 'ConfigIssue', 'PathValue']))
    expect(rootTypes.length).toBeGreaterThan(0)
  })

  it.each([...rootValues, ...rootTypes, ...testingValues].map((name) => [name]))(
    'names %s as inline code outside the fenced examples',
    (name) => {
      expect(inlineCode).toMatch(new RegExp(`\`[^\`\\n]*\\b${name}\\b[^\`\\n]*\``))
    }
  )
})
