/**
 * End-to-end spec for the marker of the errors the library raises, across its entry points.
 *
 * Layer: e2e.
 * Goal: prove, against the BUILT package, that an error the testing entry point raises is recognised
 * by the root entry's guards and the other way round, in CommonJS here and in ESM in a child process,
 * because the marker is shared by the entry points through one bundle. An error a host builds itself
 * from the same public class is refused with it as the cause, in both.
 * Mocks: none. Exercises `@nestjs/testing` and the built artifacts.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { Test } from '@nestjs/testing'
import { z } from 'zod'
import { BymaxConfigModule, BymaxConfigValidationError, defineEnv } from '@bymax-one/nest-config'
import { createTestConfig } from '@bymax-one/nest-config/testing'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const ROOT = resolve(__dirname, '..', '..')

/** What a failed compile of a module built from the given options factory rejects with. */
async function compileRejection(useFactory: () => unknown): Promise<unknown> {
  try {
    await Test.createTestingModule({
      imports: [BymaxConfigModule.forRootAsync({ useFactory: useFactory as never })]
    }).compile()
  } catch (error) {
    return error
  }
  throw new Error('the compile was expected to reject')
}

/** The error a call throws, or a failure when it did not throw. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('the call was expected to throw')
}

describe('the marker of the errors the library raises (built package, CommonJS)', () => {
  it('lets an error raised by the testing entry pass through a guard of the root entry unchanged', async () => {
    let raised: unknown
    const rejection = await compileRejection(() => {
      try {
        createTestConfig(schema, { ghost: { x: '1' } } as never)
      } catch (error) {
        raised = error
        throw error
      }
    })

    expect(raised).toBeInstanceOf(BymaxConfigValidationError)
    expect(rejection).toBe(raised)
    expect((rejection as Error).cause).toBeUndefined()
  })

  it('lets an error raised by the root entry pass through a guard of the testing entry unchanged', async () => {
    const rootRaised = await compileRejection(() => ({ schema, source: {} }))
    expect(rootRaised).toBeInstanceOf(BymaxConfigValidationError)
    const overrides = {
      get app(): never {
        throw rootRaised
      }
    }

    const thrown = thrownBy(() => createTestConfig(schema, overrides as never))

    expect(thrown).toBe(rootRaised)
    expect((thrown as Error).cause).toBeUndefined()
  })

  it('refuses an error that the host built from the public class, in either direction', async () => {
    const own = new BymaxConfigValidationError([
      { path: 'host', variable: 'HOST', code: 'BYMAX_CONFIG_INVALID', message: 'host issue' }
    ])

    const fromFactory = await compileRejection(() => {
      throw own
    })
    const fromOverrides = thrownBy(() =>
      createTestConfig(schema, {
        get app(): never {
          throw own
        }
      } as never)
    )

    for (const refused of [fromFactory, fromOverrides]) {
      expect(refused).toBeInstanceOf(BymaxConfigValidationError)
      expect(refused).not.toBe(own)
      expect((refused as Error).cause).toBe(own)
      expect((refused as BymaxConfigValidationError).message).not.toContain('host issue')
    }
  })
})

describe('the marker of the errors the library raises (built package, ESM)', () => {
  /** The child: the same three checks, through `dist/*.mjs`, printed as booleans. */
  const CHILD = `
import { Test } from '@nestjs/testing'
import { z } from 'zod'
const root = await import(process.env.ROOT_ESM)
const testing = await import(process.env.TESTING_ESM)
const { BymaxConfigModule, BymaxConfigValidationError, defineEnv } = root
const schema = defineEnv({ app: z.object({ name: z.string() }) })
const compile = async (useFactory) => {
  try { await Test.createTestingModule({ imports: [BymaxConfigModule.forRootAsync({ useFactory })] }).compile() }
  catch (error) { return error }
  return undefined
}
let raised
const a = await compile(() => {
  try { testing.createTestConfig(schema, { ghost: { x: '1' } }) } catch (error) { raised = error; throw error }
})
const rootRaised = await compile(() => ({ schema, source: {} }))
let b
try { testing.createTestConfig(schema, { get app() { throw rootRaised } }) } catch (error) { b = error }
const own = new BymaxConfigValidationError([{ path: 'h', variable: 'H', code: 'BYMAX_CONFIG_INVALID', message: 'm' }])
const c = await compile(() => { throw own })
console.log(JSON.stringify({
  testingToRoot: a === raised && a.cause === undefined,
  rootToTesting: b === rootRaised && b.cause === undefined,
  hostBuiltRefused: c !== own && c.cause === own
}))
`

  it('behaves the same through the ESM entry points', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
      encoding: 'utf8',
      timeout: 30_000,
      cwd: ROOT,
      env: {
        ...process.env,
        ROOT_ESM: resolve(ROOT, 'dist', 'index.mjs'),
        TESTING_ESM: resolve(ROOT, 'dist', 'testing', 'index.mjs')
      }
    })

    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout.trim().split('\n').pop() as string)).toEqual({
      testingToRoot: true,
      rootToTesting: true,
      hostBuiltRefused: true
    })
  })
})
