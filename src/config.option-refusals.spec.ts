/**
 * Unit tests for what the module and the validator refuse instead of ignoring.
 *
 * Layer: unit.
 * Goal: prove that a registration option the module does not read, a validation hook that is not a
 * function and a source that is not an object of variables are refused where they are passed, naming
 * the fault and never a value, and that the schema's shapes are read once for a validation.
 * Mocks: none. The host's objects are written for the case.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** Runs `run` and returns what it threw, or fails when it did not throw. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}

/** The paths of the issues of a refusal. */
function pathsOf(error: unknown): string[] {
  return (error as BymaxConfigValidationError).issues.map((issue) => issue.path)
}

/** The resolved options of the options provider a `forRootAsync` registration carries. */
async function resolvedOptions(registration: object): Promise<unknown> {
  const factory = (Reflect.get(registration, 'providers') as object[])
    .map((provider) => Reflect.get(provider, 'useFactory') as unknown)
    .find((candidate): candidate is () => Promise<unknown> => typeof candidate === 'function')
  return (factory as () => Promise<unknown>)()
}

describe('a registration option that the module does not read', () => {
  it('is refused by forRoot, naming every such key and no value', () => {
    const error = thrownBy(() =>
      BymaxConfigModule.forRoot({ schema, stict: true, onValidationErorr: () => 1 } as never)
    )

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect(pathsOf(error)).toEqual(['stict', 'onValidationErorr'])
    expect(
      (error as BymaxConfigValidationError).issues.every(
        (issue) => issue.code === ConfigErrorCode.UNKNOWN_KEY
      )
    ).toBe(true)
  })

  it('is refused by forRootAsync', () => {
    const error = thrownBy(() =>
      BymaxConfigModule.forRootAsync({
        useFactory: () => ({ schema }),
        inject: [],
        injects: []
      } as never)
    )

    expect(pathsOf(error)).toEqual(['injects'])
  })

  it.each([
    ['isGlobal', { schema, isGlobal: false }],
    ['a misspelled strict', { schema, stict: true }]
  ])('is refused in what the factory of forRootAsync returns: %s', async (_name, returned) => {
    const registration = BymaxConfigModule.forRootAsync({ useFactory: () => returned } as never)

    const error = await resolvedOptions(registration).then(
      () => undefined,
      (thrown: unknown) => thrown
    )

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect(pathsOf(error)).toEqual([Object.keys(returned)[1]])
  })

  it('is written with its unsafe characters escaped', () => {
    const error = thrownBy(() => BymaxConfigModule.forRoot({ schema, 'a\nb': 1 } as never))

    expect(pathsOf(error)).toEqual(['a\\u000ab'])
  })

  it('is refused as a read that threw when the listing of the keys throws', () => {
    const hostError = new Error('listing')
    const held = new Proxy(
      { schema },
      {
        ownKeys: () => {
          throw hostError
        }
      }
    )

    const error = thrownBy(() => BymaxConfigModule.forRoot(held as never))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as Error).cause).toBe(hostError)
  })

  it.each([
    [
      'the options the module reads',
      { schema, source: {}, strict: true, onValidationError: () => 1, isGlobal: false }
    ],
    ['an object with no prototype', Object.assign(Object.create(null) as object, { schema })],
    [
      'an instance of a class that keeps its own fields',
      new (class Holder {
        public readonly raw = {}
        public readonly schema = schema
      })()
    ]
  ])('is not looked for in %s', (_name, options) => {
    expect(() => BymaxConfigModule.forRoot(options as never)).not.toThrow()
  })
})

describe('the options held by an instance of a class', () => {
  /** Options held as accessors on the prototype, with a field of its own that is no option. */
  class Held {
    public readonly stict = true

    public get schema(): typeof schema {
      return schema
    }

    public get source(): Record<string, string> {
      return { APP_STRAY: 'x' }
    }

    public get strict(): boolean {
      return true
    }
  }

  it('is not refused for a field of its own that no option is named', () => {
    const registration = BymaxConfigModule.forRoot(new Held() as never)

    expect(registration.module).toBe(BymaxConfigModule)
  })

  it('has its known options read by name, so its strict getter is honoured', () => {
    const registration = BymaxConfigModule.forRoot(new Held() as never)
    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
    )
    const options = Reflect.get(provider as object, 'useValue') as object

    expect(Object.keys(options).sort()).toEqual(['schema', 'source', 'strict'])
    expect((options as { strict: boolean }).strict).toBe(true)
  })

  it('has its known options checked by kind: a strict getter that is not a boolean is refused', () => {
    class Loose {
      public readonly schema = schema

      public get strict(): string {
        return 'false'
      }
    }

    const error = thrownBy(() => BymaxConfigModule.forRoot(new Loose() as never))

    expect((error as Error).message).toBe(
      'BymaxConfigModule.forRoot: strict must be a boolean, received string'
    )
  })
})

describe('a validation hook that is not a function', () => {
  it.each([
    ['a string', 'nope', 'string'],
    ['a number', 5, 'number'],
    ['an object', {}, 'object']
  ])('is refused by forRoot as %s, by its type', (_name, hook, type) => {
    const error = thrownBy(() =>
      BymaxConfigModule.forRoot({ schema, onValidationError: hook } as never)
    )

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe(
      `BymaxConfigModule.forRoot: onValidationError must be a function, received ${type}`
    )
  })

  it('is refused in what the factory of forRootAsync returns', async () => {
    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => ({ schema, onValidationError: 'nope' })
    } as never)

    const error = await resolvedOptions(registration).then(
      () => undefined,
      (thrown: unknown) => thrown
    )

    expect((error as Error).message).toBe(
      'BymaxConfigModule.forRootAsync: onValidationError must be a function, received string'
    )
  })

  it.each([
    ['a function', () => 1],
    ['null', null],
    ['undefined', undefined]
  ])('accepts %s', (_name, hook) => {
    expect(() =>
      BymaxConfigModule.forRoot({ schema, onValidationError: hook } as never)
    ).not.toThrow()
  })
})

describe('a source that is not an object of variables', () => {
  it.each([
    ['an array', ['APP_NAME'], 'an array'],
    ['a Map', new Map([['APP_NAME', 'x']]), 'an object that is not a record of variables'],
    ['a Set', new Set(['APP_NAME']), 'an object that is not a record of variables'],
    ['a number', 5, 'a number'],
    ['a string', 'APP_NAME=x', 'a string'],
    ['a boolean', true, 'a boolean'],
    ['a function', () => 1, 'a function']
  ])('refuses %s, by its kind', (_name, source, kind) => {
    const error = thrownBy(() => createValidatedConfig({ schema, source: source as never }))

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues.map((issue) => issue.message)).toEqual([
      `the source must be an object of variables, received ${kind}`
    ])
  })

  it.each([
    ['undefined', undefined],
    ['null', null]
  ])('refuses %s handed straight to the validator, by its kind', (name, source) => {
    const error = thrownBy(() => validateEnv(schema, source as never))

    expect((error as BymaxConfigValidationError).issues.map((issue) => issue.message)).toEqual([
      `the source must be an object of variables, received ${name}`
    ])
  })

  it.each([
    ['an object', { APP_NAME: 'x' }],
    [
      'an object with no prototype',
      Object.assign(Object.create(null) as object, { APP_NAME: 'x' })
    ],
    ['an object built on another', Object.create({ APP_NAME: 'x' }) as object],
    [
      'an instance of a class',
      new (class Holder {
        public readonly APP_NAME = 'x'
      })()
    ],
    ['process.env', process.env]
  ])('accepts %s', (_name, source) => {
    expect(() => createValidatedConfig({ schema, source: source as never })).not.toThrow()
  })
})

describe('the shapes of a schema read for one validation', () => {
  it('are each read once', () => {
    const reads = { root: 0, namespace: 0 }
    const app = z.object({ name: z.string().default('n') })
    const spiedApp = new Proxy(app, {
      get(target, key, receiver) {
        if (key === 'shape') reads.namespace += 1
        return Reflect.get(target, key, receiver) as unknown
      }
    })
    const spied = new Proxy(defineEnv({ app }), {
      get(target, key, receiver) {
        if (key === 'shape') {
          reads.root += 1
          return { app: spiedApp }
        }
        return Reflect.get(target, key, receiver) as unknown
      }
    })

    createValidatedConfig({ schema: spied as never, source: {} })

    expect(reads).toEqual({ root: 1, namespace: 1 })
  })
})
