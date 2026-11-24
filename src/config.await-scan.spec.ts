/**
 * Source scan for the places the library awaits or chains on a promise.
 *
 * Layer: unit.
 * Goal: prove that every file under `src` is scanned, and that each `await`, `for await`, promise chain or
 * live `Promise.race/all/any/allSettled` outside the spec files is one the library has argued for. A new
 * file with a bare host await fails here until it is exempted with a reason.
 * Mocks: none. The scan reads the source text.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_ROOT = __dirname
const SHAPE = /\bawait\b|\.then\(|\.catch\(|\.finally\(|Promise\.(?:race|all|any|allSettled)\b/

/** Every file under `src` that is not a spec, as a path relative to `src`. */
function sourceFiles(dir: string, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory())
      found.push(...sourceFiles(join(dir, entry.name), `${prefix}${entry.name}/`))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
      found.push(`${prefix}${entry.name}`)
  }
  return found.sort()
}

/** The lines of code (not comments) of a file that hold one of the shapes, as `file:line`. */
function hitsOf(file: string): string[] {
  const lines = readFileSync(join(SOURCE_ROOT, file), 'utf8').split('\n')
  const hits: string[] = []
  lines.forEach((line, at) => {
    const code = line.trim()
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
    if (SHAPE.test(code.replace(/\/\/.*$/, ''))) hits.push(`${file}:${at + 1}`)
  })
  return hits
}

/**
 * The awaits the library has argued for, by file and with the count it expects. Each one awaits a promise
 * the module built, or hands a host promise to the checked hop that boxes its answer.
 */
const EXEMPT: Readonly<Record<string, { readonly count: number; readonly reason: string }>> = {
  'captured.ts': {
    count: 1,
    reason:
      'boxedAwait awaits a promise whose constructor was pinned, and returns its answer in a box'
  },
  'config.module.ts': {
    count: 1,
    reason:
      'awaits the promise guardedResolve built; the host promise is read inside the checked hop'
  },
  'config.providers.ts': {
    count: 2,
    reason: 'one awaits the checked hop for the hook, one a promise the module built'
  },
  'env-validator.ts': {
    count: 1,
    reason: 'guardedResolve hands the host promise to the checked hop and rethrows a refusal'
  },
  'host-promise.ts': {
    count: 3,
    reason:
      'the checked hop: it awaits the followed promise, the thenable it adopted and the value that answered, each boxed'
  }
}

describe('awaits and promise chains in src', () => {
  const files = sourceFiles(SOURCE_ROOT)

  it('scans every source file, including those below a directory', () => {
    expect(files).toContain('captured.ts')
    expect(files).toContain('host-promise.ts')
    expect(files).toContain('internal/index.ts')
    expect(files).toContain('testing/create-test-config.ts')
    expect(files.every((file) => !file.endsWith('.spec.ts'))).toBe(true)
  })

  it('finds an await only in a file that is exempted, and as many as it is exempted for', () => {
    const counts: Record<string, number> = {}
    for (const file of files) {
      const hits = hitsOf(file)
      if (hits.length > 0) counts[file] = hits.length
    }

    expect(counts).toEqual(
      Object.fromEntries(Object.entries(EXEMPT).map(([file, { count }]) => [file, count]))
    )
  })

  it('gives every exemption a reason', () => {
    for (const { reason } of Object.values(EXEMPT)) expect(reason.length).toBeGreaterThan(20)
  })
})
