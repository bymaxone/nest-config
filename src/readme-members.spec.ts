/**
 * Contract test: every member of the published contracts, and every subpath, is named in the README.
 *
 * Layer: unit.
 * Goal: `readme-exports.spec.ts` asks whether each exported name reached the README, but a member of
 * a contract (an option, an issue field, a method of the service, a code of the error catalog) can be
 * added to a type without any export changing. Each contract is written here as a record keyed by the
 * members of its type, so adding a member stops this file compiling until it is listed, and each listed
 * member must then appear as inline code in the README's prose or tables. The subpaths of the package
 * are listed the same way, so a new entry in `exports` fails until it is classified and documented.
 * Mocks: none. Reads README.md and package.json.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { z } from 'zod'

import type {
  BymaxConfigForRootAsyncOptions,
  BymaxConfigForRootOptions
} from './config.module-definition'
import { BymaxConfigModule } from './config.module'
import type { BymaxConfigModuleOptions } from './config.options'
import type { ConfigService } from './config.service'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { ConfigIssue } from './errors'

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

/** The inline code spans of the prose, joined: where a member has to be named. */
const inlineCode = (prose.match(/`[^`\n]+`/g) ?? []).join('\n')

/** Whether the README names `member` as inline code, on its own or inside a longer span. */
function isNamed(member: string): boolean {
  const escaped = member.replace(/[$.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`\`[^\`\\n]*(?<![\\w$])${escaped}(?![\\w$])[^\`\\n]*\``).test(inlineCode)
}

/** The registration options of the options token. */
const MODULE_OPTIONS = {
  schema: true,
  source: true,
  onValidationError: true,
  strict: true
} satisfies Record<keyof BymaxConfigModuleOptions, true>

/** What `forRoot` takes beside them. */
const FOR_ROOT_EXTRAS = { isGlobal: true } satisfies Record<
  Exclude<keyof BymaxConfigForRootOptions, keyof BymaxConfigModuleOptions>,
  true
>

/** What `forRootAsync` takes: the async options of the builder and the `isGlobal` extra. */
const FOR_ROOT_ASYNC_OPTIONS = {
  useFactory: true,
  useClass: true,
  useExisting: true,
  inject: true,
  imports: true,
  provideInjectionTokensFrom: true,
  isGlobal: true
} satisfies Record<keyof BymaxConfigForRootAsyncOptions, true>

/** The fields of an issue. */
const ISSUE_FIELDS = { path: true, variable: true, code: true, message: true } satisfies Record<
  keyof ConfigIssue,
  true
>

/** What the thrown error adds to `Error`. */
const ERROR_MEMBERS = { code: true, issues: true } satisfies Record<
  Exclude<keyof BymaxConfigValidationError, keyof Error>,
  true
>

/** The public methods of the injectable service. */
const SERVICE_METHODS = { get: true, getAll: true, has: true, toJSON: true } satisfies Record<
  keyof ConfigService<object>,
  true
>

/** The subpaths of `exports` that the README's table of entry points has to list. */
const DOCUMENTED_SUBPATHS = ['.', './testing', './internal']

/** The keys of `exports` that are no entry point of the code. */
const NOT_ENTRY_POINTS = ['./package.json']

describe('README names every member of the published contracts', () => {
  it.each([
    ['BymaxConfigModuleOptions', Object.keys(MODULE_OPTIONS)],
    ['forRoot', Object.keys(FOR_ROOT_EXTRAS)],
    ['forRootAsync', Object.keys(FOR_ROOT_ASYNC_OPTIONS)],
    ['ConfigIssue', Object.keys(ISSUE_FIELDS)],
    ['BymaxConfigValidationError', Object.keys(ERROR_MEMBERS)],
    ['ConfigService', Object.keys(SERVICE_METHODS)]
  ])('%s: every member is inline code', (_contract, members) => {
    expect(members.filter((member) => !isNamed(member))).toEqual([])
  })

  it('names every value of the error catalog', () => {
    expect(Object.values(ConfigErrorCode).filter((code) => !isNamed(code))).toEqual([])
  })

  it('lists the members the runtime carries, so the records above are not stale', () => {
    const error = new BymaxConfigValidationError([])

    expect(Object.keys(error).sort()).toEqual(Object.keys(ERROR_MEMBERS).sort())
    expect(Object.keys(ConfigErrorCode).length).toBe(4)
  })
})

describe('README documents the log event the provider writes', () => {
  it('lists the event and exactly the fields it carries', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      const schema = defineEnv({ app: z.object({ name: z.string() }) })
      await Test.createTestingModule({
        imports: [BymaxConfigModule.forRoot({ schema, source: {} })]
      })
        .compile()
        .catch(() => undefined)

      const logged = error.mock.calls[0]?.[0] as Record<string, unknown>
      const row = prose
        .split('\n')
        .find((line) => line.startsWith(`| \`${String(logged['event'])}\``))

      expect(row).toBeDefined()
      const fields = Object.keys(logged).filter((key) => key !== 'event')
      expect([...(row ?? '').matchAll(/`([a-z]+)`/g)].map((match) => match[1])).toEqual(fields)
    } finally {
      error.mockRestore()
    }
  })
})

describe('README documents every subpath of the package', () => {
  const exportsMap = (
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      readonly exports: Readonly<Record<string, unknown>>
    }
  ).exports

  it('classifies every key of exports', () => {
    expect(Object.keys(exportsMap).sort()).toEqual(
      [...DOCUMENTED_SUBPATHS, ...NOT_ENTRY_POINTS].sort()
    )
  })

  it.each(DOCUMENTED_SUBPATHS)('lists %s in the table of entry points', (subpath) => {
    expect(prose).toMatch(new RegExp(`^\\| \`${subpath.replace(/[./]/g, '\\$&')}\` +\\|`, 'm'))
  })
})
