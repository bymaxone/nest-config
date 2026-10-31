/**
 * Contract tests pinning the README's factual claims to the code that makes them true.
 *
 * Layer: unit.
 * Goal: `check:published` compiles the README's code fences, but nothing reads its prose
 * or tables. These tests parse the option defaults, the error catalog, the peer
 * requirements, the mutation score and the sample failure report out of the README and
 * assert each against the behavior, constant or document it describes, so a stale claim
 * fails CI instead of shipping to npm.
 * Mocks: none. Reads README.md, package.json and docs/mutation_testing_results.md.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { resolveSourceNames } from './source-mapping'

const root = join(__dirname, '..')
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  readonly peerDependencies: Readonly<Record<string, string>>
  readonly engines: { readonly node: string }
}
const mutationResults = readFileSync(join(root, 'docs', 'mutation_testing_results.md'), 'utf8')

/** The README with every fenced code block removed: prose, headings and tables only. */
const prose = (() => {
  let inFence = false
  return readme
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

/** The one prose line or table row matching `pattern`; fails when it is absent or ambiguous. */
function lineMatching(pattern: RegExp): string {
  const lines = prose.split('\n').filter((line) => pattern.test(line))
  expect(lines).toHaveLength(1)
  return lines[0] as string
}

/** The first capture group of `pattern` on `line`; fails when the line does not state it. */
function captured(line: string, pattern: RegExp): string {
  const match = pattern.exec(line)
  expect(match).not.toBeNull()
  return (match as RegExpExecArray)[1] as string
}

const leafSchema = defineEnv({ readmepin: z.object({ url: z.string().default('unset') }) })

describe('README option defaults', () => {
  it('documents the strict default the validator actually applies', () => {
    /**
     * A source variable that shares a declared namespace prefix but matches no leaf is
     * rejected only under strict. Whether it is accepted with `strict` omitted therefore
     * reveals the default, and the README must state that same value.
     */
    const documented = captured(lineMatching(/^\| `strict` /), /Defaults to `(true|false)`/)

    const acceptedWithoutStrictOption = (): boolean => {
      try {
        createValidatedConfig({ schema: leafSchema, source: { READMEPIN_STRAY: '1' } })
        return true
      } catch (error) {
        expect(error).toBeInstanceOf(BymaxConfigValidationError)
        return false
      }
    }

    expect(acceptedWithoutStrictOption()).toBe(documented === 'false')
  })

  it('documents process.env as the default source', () => {
    /**
     * The row must name `process.env`, and omitting `source` must read it: a variable set
     * on the real environment reaches the validated object.
     */
    const documented = captured(lineMatching(/^\| `source` /), /Defaults to `([^`]+)`/)
    expect(documented).toBe('process.env')

    process.env['READMEPIN_URL'] = 'from-process-env'
    try {
      const config = createValidatedConfig({ schema: leafSchema })
      expect(config.readmepin.url).toBe('from-process-env')
    } finally {
      delete process.env['READMEPIN_URL']
    }
  })

  it('documents the isGlobal default the module definition applies', () => {
    /** `forRoot` without the extra must produce a module registered as global exactly when the README says so. */
    const documented = captured(
      lineMatching(/`isGlobal` defaults to `(true|false)`/),
      /`isGlobal` defaults to `(true|false)`/
    )

    expect(BymaxConfigModule.forRoot({ schema: leafSchema }).global).toBe(documented === 'true')
  })
})

describe('README error catalog', () => {
  it('lists exactly the codes of ConfigErrorCode, with the top-level code marked as such', () => {
    /**
     * Each catalog row is `| code | meaning |`. The set of codes must equal the frozen
     * catalog, and only VALIDATION may be described as the top-level code.
     */
    const rows = prose
      .split('\n')
      .map((line) => /^\| `(BYMAX_CONFIG_[A-Z_]+)` +\| (.+?) +\|$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ code: match[1] as string, meaning: match[2] as string }))

    expect(rows.map((row) => row.code).sort()).toEqual(Object.values(ConfigErrorCode).sort())
    for (const row of rows) {
      expect(row.meaning.includes('top-level')).toBe(row.code === ConfigErrorCode.VALIDATION)
    }
  })
})

describe('README peer requirements', () => {
  it('matches the peerDependencies and engines of package.json', () => {
    /**
     * The peer table is the only place consumers read the supported ranges, and the
     * Tech Stack bullet repeats the Zod range, so both must agree with the manifest.
     */
    const row = (name: string): string =>
      captured(lineMatching(new RegExp(`^\\| ${name} +\\|`)), /\| `([^`]+)` *\|$/)

    expect(row('Node\\.js')).toBe(packageJson.engines.node)
    for (const [name, range] of Object.entries(packageJson.peerDependencies)) {
      expect(row(`\`${name}\``)).toBe(range)
    }

    const techStackZod = captured(
      lineMatching(/^- \*\*Validation:\*\* Zod /),
      /Zod `([^`]+)` \(peer\)/
    )
    expect(techStackZod).toBe(packageJson.peerDependencies['zod'])
  })
})

describe('README mutation score', () => {
  it('repeats the score of the mutation results document in the badge and the bullet', () => {
    /** The results document is the source of truth; the README states its score twice. */
    const documented = captured(
      mutationResults,
      /\| \*\*Global mutation score\*\* +\| \*\*(\d+\.\d+) %\*\*/
    )

    expect(captured(readme, /badge\/mutation-(\d+\.\d+)%25/)).toBe(documented)
    expect(captured(lineMatching(/mutation score\*\*/), /\*\*(\d+\.\d+)% mutation score\*\*/)).toBe(
      documented
    )
  })
})

describe('README sample failure report', () => {
  it('is the exact output of the validator for the inputs it documents', () => {
    /**
     * The first sample report is produced by a missing DATABASE_URL, a too-short
     * AUTH_JWT_SECRET and an out-of-range SERVER_PORT. Running those inputs must
     * print it character for character, so an invented message or a misaligned column
     * cannot survive.
     */
    const sample = captured(
      readme,
      /```\n(BymaxConfigValidationError: environment validation failed \(3 issues\)\n[\s\S]*?)\n```/
    )
    const schema = defineEnv({
      database: z.object({ url: z.url() }),
      auth: z.object({ jwtSecret: z.string().min(32) }),
      server: z.object({ port: z.coerce.number().int().min(1).max(65535).default(3000) })
    })

    let report = ''
    try {
      createValidatedConfig({ schema, source: { AUTH_JWT_SECRET: 'short', SERVER_PORT: '99999' } })
    } catch (error) {
      expect(error).toBeInstanceOf(BymaxConfigValidationError)
      report = `${(error as Error).name}: ${(error as Error).message}`
    }

    expect(report).toBe(sample)
  })
})

/** The Quick Start schema the README shows, declared here because tsc keeps the sources under src/. */
const quickStartSchema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    env: z.enum(['development', 'test', 'production']).default('development')
  }),
  database: z.object({ url: z.url() }),
  redis: z.object({ url: z.url() }),
  log: z.object({ level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info') })
})

describe('README resolveSourceNames section', () => {
  it('names the variables the Quick Start schema reads, in order', () => {
    /**
     * The section shows what the helper returns for the Quick Start schema declared
     * above. The documented list must be the function's actual output, so a change
     * to the naming rules fails here.
     */
    const example = captured(
      readme,
      /resolveSourceNames\(envSchema\)\.map\(\(binding\) => binding\.variable\)\n\/\/ \[(.+)\]/
    )
    const documented = Array.from(example.matchAll(/'([A-Z_]+)'/g), (match) => match[1])

    expect(documented).toEqual(
      resolveSourceNames(quickStartSchema).map((binding) => binding.variable)
    )
  })

  it('lists the helper among the root entry point contents', () => {
    /** The subpath table is where a reader learns what the root exports. */
    expect(lineMatching(/^\| `\.` +\|/)).toContain('`resolveSourceNames`')
  })
})
