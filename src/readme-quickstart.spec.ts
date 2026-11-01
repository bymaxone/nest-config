/**
 * Executes the README Quick Start as written.
 *
 * Layer: integration.
 * Goal: prove the code a reader copies from the Quick Start runs, not only that it type-checks:
 * the schema, the root module registration and the injected provider are taken from the README
 * text, compiled and run against a real Nest testing graph, and the outcomes the section states
 * are asserted.
 * Mocks: none. The variables the schema reads are set or unset on the process environment for the
 * duration of each phase and restored afterwards, because the README module reads it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileFunction } from 'node:vm'

import { Test } from '@nestjs/testing'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

import { BymaxConfigValidationError } from './errors'

const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8')

/** The TypeScript blocks of the Quick Start section, in the order the README shows them. */
function quickStartBlocks(): ReadonlyArray<string> {
  const section = readme.slice(
    readme.indexOf('## 🚀 Quick Start'),
    readme.indexOf('## 📖 API Reference')
  )
  return Array.from(section.matchAll(/```typescript\n([\s\S]*?)```/g), (match) => match[1] ?? '')
}

/** Compile one README block and run it, resolving its imports through the given modules. */
function runBlock(block: string, modules: Record<string, unknown>): Record<string, unknown> {
  const { outputText } = transpileModule(block, {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    }
  })
  const exported: Record<string, unknown> = {}
  const load = (specifier: string): unknown => {
    if (specifier in modules) return modules[specifier]
    throw new Error(`The Quick Start imports "${specifier}", which this test does not provide`)
  }
  compileFunction(outputText, ['require', 'exports'])(load, exported)
  return exported
}

/** The module and the provider the README declares, compiled from its text. */
function loadQuickStart(): {
  readonly AppModule: new () => unknown
  readonly FeatureProvider: new (config: never) => { describeConnection(): string }
} {
  const [schemaBlock, moduleBlock, providerBlock] = quickStartBlocks()
  const nest = {
    '@bymax-one/nest-config': require('./index') as unknown,
    '@nestjs/common': require('@nestjs/common') as unknown,
    zod: require('zod') as unknown
  }
  const withSchema = { ...nest, './config/env.schema': runBlock(schemaBlock ?? '', nest) }
  return {
    AppModule: runBlock(moduleBlock ?? '', withSchema).AppModule as new () => unknown,
    FeatureProvider: runBlock(providerBlock ?? '', withSchema).FeatureProvider as new (
      config: never
    ) => { describeConnection(): string }
  }
}

/** Run with exactly these process variables, an undefined value meaning unset, then restore. */
async function withEnvironment(
  variables: Readonly<Record<string, string | undefined>>,
  run: () => Promise<void>
): Promise<void> {
  const saved = Object.keys(variables).map((name) => [name, process.env[name]] as const)
  const apply = (values: ReadonlyArray<readonly [string, string | undefined]>): void => {
    for (const [name, value] of values) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  try {
    apply(Object.entries(variables))
    await run()
  } finally {
    apply(saved)
  }
}

/** The variables the Quick Start schema reads, so an ambient value cannot change the outcome. */
const SCHEMA_VARIABLES = ['DATABASE_URL', 'REDIS_URL', 'SERVER_PORT', 'SERVER_ENV', 'LOG_LEVEL']

describe('README Quick Start', () => {
  it('boots from the schema, module and provider the README shows', async () => {
    /**
     * Guards the README section "Quick Start", and changes when that section does: it runs the
     * schema, `BymaxConfigModule.forRoot({ schema: envSchema })` and the `FeatureProvider` as the
     * README prints them, not a copy. A complete environment boots and the provider reads the
     * typed values, with the declared port default; an environment missing both required
     * variables fails with one error that names both.
     */
    const { AppModule, FeatureProvider } = loadQuickStart()
    const unset = Object.fromEntries(SCHEMA_VARIABLES.map((name) => [name, undefined]))

    await withEnvironment(
      {
        ...unset,
        DATABASE_URL: 'postgres://localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379'
      },
      async () => {
        const booted = await Test.createTestingModule({
          imports: [AppModule],
          providers: [FeatureProvider]
        }).compile()
        expect(booted.get(FeatureProvider).describeConnection()).toBe(
          'postgres://localhost:5432/app::3000'
        )
        await booted.close()
      }
    )

    await withEnvironment(unset, async () => {
      const failure = await Test.createTestingModule({ imports: [AppModule] })
        .compile()
        .catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(BymaxConfigValidationError)
      expect((failure as BymaxConfigValidationError).issues.map((issue) => issue.variable)).toEqual(
        ['DATABASE_URL', 'REDIS_URL']
      )
    })
  })
})
