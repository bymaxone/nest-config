/**
 * Unit tests for what the baseline of built-ins protects once the configuration is built: the reads of
 * the service, the redaction of the root, the own-property read of `__proto__`, the refusal built from
 * references taken at load, and the provider that reports through a hook.
 *
 * Layer: unit.
 * Goal: prove that a built-in replaced after the import, or while a validation runs, neither unredacts the
 * configuration nor changes the structured error nor lets a planted field change what is compared.
 * Mocks: none. Each built-in is replaced for one case and put back afterwards.
 */

import { inspect } from 'node:util'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { bymaxConfigProvider, createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { defineEnv } from './define-env'
import {
  BymaxConfigValidationError,
  ConfigErrorCode,
  isLibraryError,
  libraryError,
  runtimeRefusal
} from './errors'

const getDescriptor = Object.getOwnPropertyDescriptor
const defineProp = Reflect.defineProperty

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** Replaces `key` of `owner` with `value`, runs `run`, and puts the original descriptor back. */
function withReplaced<T>(owner: object, key: PropertyKey, value: unknown, run: () => T): T {
  const original = getDescriptor(owner, key)
  defineProp(owner, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: original?.enumerable === true
  })
  try {
    return run()
  } finally {
    if (original === undefined) Reflect.deleteProperty(owner, key)
    else defineProp(owner, key, original)
  }
}

/** A different object that behaves as what the property holds does, so only its identity differs. */
function sameBehaviour(owner: object, key: PropertyKey): unknown {
  const held = Reflect.get(owner, key) as unknown
  if (typeof held === 'symbol') return Symbol('replacement')
  return typeof held === 'function' || (typeof held === 'object' && held !== null)
    ? new Proxy(held, {})
    : held
}

describe('the reads of the service and the serializer of the root, after the boot', () => {
  it('answer as they did when a built-in they use is replaced later', () => {
    const config = createValidatedConfig({ schema, source: {} })
    const service = new ConfigService(config as never)

    const answers = withReplaced(
      Map.prototype,
      'get',
      () => 'hacked',
      () =>
        withReplaced(
          Object,
          'keys',
          () => ['hacked'],
          () =>
            withReplaced(
              Array.prototype,
              'slice',
              () => ['hacked'],
              () => ({
                value: service.get('app.name' as never),
                has: service.has('app.name' as never),
                service: service.toJSON().namespaces,
                root: (JSON.parse(JSON.stringify(config)) as { namespaces: string[] }).namespaces
              })
            )
        )
    )

    expect(answers).toEqual({ value: 'n', has: true, service: ['app'], root: ['app'] })
  })
})

describe('the symbol the redaction is installed under', () => {
  it('survives util.inspect.custom being reassigned while the validation runs', () => {
    const hostile = defineEnv({
      app: z.object({
        secret: z.string().refine(() => {
          Reflect.set(inspect, 'custom', Symbol('replacement'))
          return true
        })
      })
    })
    const original = getDescriptor(inspect, 'custom') as PropertyDescriptor
    let config: object
    try {
      config = createValidatedConfig({
        schema: hostile,
        source: { APP_SECRET: 'the-secret-value' }
      })
    } finally {
      defineProp(inspect, 'custom', original)
    }

    expect(inspect(config)).not.toContain('the-secret-value')
  })
})

describe('the redaction of the configuration', () => {
  it('survives Object.defineProperty being replaced while the validation runs', () => {
    const hostile = defineEnv({
      app: z.object({
        secret: z.string().refine(() => {
          Object.defineProperty = (() => undefined) as never
          return true
        })
      })
    })
    const original = getDescriptor(Object, 'defineProperty') as PropertyDescriptor
    let config: object
    try {
      config = createValidatedConfig({
        schema: hostile,
        source: { APP_SECRET: 'the-secret-value' }
      })
    } finally {
      defineProp(Object, 'defineProperty', original)
    }

    expect(JSON.stringify(config)).not.toContain('the-secret-value')
    expect(inspect(config)).not.toContain('the-secret-value')
  })
})

describe('the own-property read of a variable named __proto__', () => {
  it('survives Object.hasOwn being replaced while the source is read', () => {
    const named = defineEnv({
      app: z.object({ name: z.string().default('default-name').meta({ env: '__proto__' }) })
    })
    const original = getDescriptor(Object, 'hasOwn') as PropertyDescriptor
    const source = Object.defineProperty({}, '__proto__', { value: 'hidden' }) as Record<
      string,
      unknown
    >
    Object.defineProperty(source, 'TRIGGER', {
      enumerable: true,
      get: () => {
        defineProp(Object, 'hasOwn', { ...original, value: () => false })
        return 'x'
      }
    })
    let name: string | undefined
    try {
      name = createValidatedConfig({ schema: named, source: source as never }).app.name
    } finally {
      defineProp(Object, 'hasOwn', original)
    }

    expect(name).toBe('hidden')
  })
})

/** A copy of the errors module that is loaded afresh, so the code that builds its constants runs in the case. */
function freshErrors(): typeof import('./errors') {
  let loaded: typeof import('./errors') | undefined
  jest.isolateModules(() => {
    loaded = require('./errors') as typeof import('./errors')
  })
  return loaded as typeof import('./errors')
}

describe('the errors module, loaded afresh', () => {
  it.each([
    ['a control character', '\u0001', '\\u0001'],
    ['a format character', '\u200e', '\\u200e'],
    ['a lone surrogate', '\ud800', '\\ud800'],
    ['a line separator', '\u2028', '\\u2028'],
    ['a paragraph separator', '\u2029', '\\u2029']
  ])('writes %s as an escape and leaves a plain character alone', (_name, character, escaped) => {
    const { BymaxConfigValidationError: Fresh } = freshErrors()

    const error = new Fresh([
      { path: 'a', variable: 'V', code: ConfigErrorCode.INVALID, message: `x${character}y` }
    ])

    expect(error.issues[0]?.message).toBe(`x${escaped}y`)
  })

  it('gives the refusal the report the formatter lays out', () => {
    const { libraryError: freshLibraryError, runtimeRefusal: freshRefusal } = freshErrors()
    const reference = freshLibraryError([
      {
        path: '',
        variable: '(runtime)',
        code: ConfigErrorCode.INVALID,
        message: '7 of the built-ins the library calls were replaced after it loaded'
      }
    ])

    expect(freshRefusal(7).message).toBe(reference.message)
  })
})

describe('the provider that validates the environment, with a built-in replaced', () => {
  it('rejects with the refusal and gives the hook of the host the structured issue', async () => {
    const hook = jest.fn()
    const factory = bymaxConfigProvider.useFactory as (options: unknown) => Promise<unknown>
    let failure: unknown

    await withReplaced(
      Array.prototype,
      'sort',
      sameBehaviour(Array.prototype, 'sort'),
      async () => {
        try {
          await factory({ schema, source: {}, onValidationError: hook })
        } catch (error) {
          failure = error
        }
      }
    )

    expect(failure).toBeInstanceOf(BymaxConfigValidationError)
    expect(isLibraryError(failure)).toBe(true)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledWith([
      {
        path: '',
        variable: '(runtime)',
        code: ConfigErrorCode.INVALID,
        message: '1 of the built-ins the library calls were replaced after it loaded'
      }
    ])
  })
})
