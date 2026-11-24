/**
 * Unit tests for the promises the module hands to the code that awaits them.
 *
 * Layer: unit.
 * Goal: prove that a `constructor` or `then` replaced by host code inside the validation window cannot
 * answer for a promise the library returns, whether Nest awaits it (the validated-config provider, the
 * factory of `forRootAsync`) or the module awaits it itself.
 * Mocks: none. The host's code is a source getter written for the case, and Nest's own injector awaits.
 */

import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { tagged } from './captured'
import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const nativeThen = Promise.prototype.then
const nativeConstructor = Reflect.getOwnPropertyDescriptor(Promise.prototype, 'constructor')
const nativeThenDescriptor = Reflect.getOwnPropertyDescriptor(Promise.prototype, 'then')

/** Puts back what a hijack replaced, so a failing row cannot leak into the next one. */
function restore(): void {
  Reflect.defineProperty(Promise.prototype, 'then', nativeThenDescriptor as PropertyDescriptor)
  Reflect.defineProperty(Promise.prototype, 'constructor', nativeConstructor as PropertyDescriptor)
}

/**
 * Hijacks promise resolution until the next microtask: replaces `constructor` and a `then` that turns a
 * rejection into the given answer. An await of a native promise made in the same turn, which is where
 * Nest awaits what a factory returns, would take that answer instead of the refusal.
 */
function hijackPromises(answer: unknown): void {
  Reflect.defineProperty(Promise.prototype, 'constructor', {
    value: function Foreign() {},
    configurable: true,
    writable: true
  })
  Promise.prototype.then = function hijacked(
    this: Promise<unknown>,
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) {
    return nativeThen.call(this, onFulfilled, (reason: unknown) =>
      onFulfilled === undefined ? onRejected?.(reason) : onFulfilled(answer)
    )
  } as typeof Promise.prototype.then
  queueMicrotask(restore)
}

/**
 * Plants accessors on `Promise.prototype` for `constructor` and `then` that each put the native property
 * back the first time it is read. An `await` of a native promise reads `constructor`, and when that is not
 * the intrinsic it reads `then`, so the pair answers for the promise with the given value and leaves
 * nothing behind for the runner's own awaits to trip on.
 */
function plantSelfRestoringAnswer(answer: unknown): void {
  Reflect.defineProperty(Promise.prototype, 'constructor', {
    configurable: true,
    get() {
      Reflect.defineProperty(
        Promise.prototype,
        'constructor',
        nativeConstructor as PropertyDescriptor
      )
      return function Foreign() {}
    }
  })
  Reflect.defineProperty(Promise.prototype, 'then', {
    configurable: true,
    get() {
      Reflect.defineProperty(Promise.prototype, 'then', nativeThenDescriptor as PropertyDescriptor)
      return (onFulfilled: (value: unknown) => unknown) => onFulfilled(answer)
    }
  })
}

/** A source whose `APP_NAME` getter hijacks promise resolution and reads as missing. */
function hijackingSource(): Record<string, string> {
  const source: Record<string, string> = {}
  Object.defineProperty(source, 'APP_NAME', {
    enumerable: true,
    get() {
      hijackPromises('let through')
      return undefined as never
    }
  })
  return source
}

/**
 * Lets the runner's own await of the row's promise read it before a hijack is planted, so the hijack
 * reaches the code under test and not the harness that reports its result.
 */
async function settled(): Promise<void> {
  await Promise.resolve()
}

/** Awaits what `call` returns the way Nest's injector awaits a factory result, and reports the outcome. */
async function outcomeOf(call: () => unknown): Promise<unknown> {
  try {
    return { resolved: await call() }
  } catch (error) {
    return { rejected: error }
  }
}

/** The factory of the provider that has `token`, from a registration the module produced. */
function factoryOf(providers: readonly unknown[], token: unknown): (...args: unknown[]) => unknown {
  const found = providers.find((provider) => Reflect.get(provider as object, 'provide') === token)
  return Reflect.get(found as object, 'useFactory') as (...args: unknown[]) => unknown
}

describe('the promises the module hands to its callers', () => {
  afterEach(() => {
    restore()
    Reflect.deleteProperty(Object.prototype, 'then')
  })

  it('rejects with the refusal from the validated-config factory when the host hijacks resolution inside the source', async () => {
    await settled()
    const factory = factoryOf(
      BymaxConfigModule.forRoot({ schema, source: hijackingSource() }).providers ?? [],
      BYMAX_CONFIG
    )

    const outcome = (await outcomeOf(() => factory({ schema, source: hijackingSource() }))) as {
      rejected?: unknown
    }

    expect(outcome.rejected).toBeInstanceOf(BymaxConfigValidationError)
  })

  it('rejects from the options factory of forRootAsync when the host hijacks resolution inside its own factory', async () => {
    await settled()
    const factory = factoryOf(
      BymaxConfigModule.forRootAsync({
        useFactory: () => {
          hijackPromises('let through')
          return null as never
        }
      }).providers ?? [],
      BYMAX_CONFIG_OPTIONS
    )

    const outcome = (await outcomeOf(factory)) as { rejected?: unknown; resolved?: unknown }

    expect(outcome.resolved).toBeUndefined()
    expect(outcome.rejected).toEqual(
      new TypeError('BymaxConfigModule.forRootAsync: options must be an object, received null')
    )
  })

  it('tags a promise with the intrinsic Promise as a pinned, non-enumerable constructor', () => {
    const promise = tagged(Promise.resolve(1))

    expect(Reflect.getOwnPropertyDescriptor(promise, 'constructor')).toEqual({
      value: Promise,
      writable: false,
      enumerable: false,
      configurable: false
    })
  })

  it('returns a frozen promise unchanged instead of throwing', () => {
    const frozen = Object.freeze(Promise.resolve(1))

    expect(tagged(frozen)).toBe(frozen)
    expect(Object.hasOwn(frozen, 'constructor')).toBe(false)
  })

  it('resolves with the configuration when a then is planted on Object.prototype inside the source', async () => {
    await settled()
    const factory = factoryOf(
      BymaxConfigModule.forRoot({ schema, source: { APP_NAME: 'ok' } }).providers ?? [],
      BYMAX_CONFIG
    )
    const source: Record<string, string> = {}
    Object.defineProperty(source, 'APP_NAME', {
      enumerable: true,
      get() {
        Object.defineProperty(Object.prototype, 'then', {
          value: (resolve: (value: unknown) => void) => resolve({ app: { name: 'forged' } }),
          configurable: true
        })
        queueMicrotask(() => Reflect.deleteProperty(Object.prototype, 'then'))
        return 'ok'
      }
    })

    const outcome = (await outcomeOf(() => factory({ schema, source }))) as { resolved?: unknown }

    expect(outcome.resolved).toEqual({ app: { name: 'ok' } })
  })

  it('pins an own then of undefined on the root, out of sight of keys and JSON', () => {
    const root = createValidatedConfig({ schema, source: { APP_NAME: 'ok' } })

    expect(Reflect.getOwnPropertyDescriptor(root, 'then')).toEqual({
      value: undefined,
      writable: false,
      enumerable: false,
      configurable: false
    })
    expect(Object.keys(root)).toEqual(['app'])
    expect(JSON.parse(JSON.stringify(root))).toEqual({
      service: 'BymaxConfig',
      namespaces: ['app']
    })
  })

  /**
   * A setter on `Object.prototype`, named after a namespace, that runs when validation assigns that namespace
   * to the root, and defines `own` on the root in its place.
   */
  function plantSetter(name: string, own: PropertyDescriptor): () => void {
    let planted = true
    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      set(this: object, value: unknown) {
        Object.defineProperty(this, name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true
        })
        if (planted) {
          planted = false
          Object.defineProperty(this, 'then', { ...own, configurable: true })
        }
      }
    })
    return () => Reflect.deleteProperty(Object.prototype, name)
  }

  it.each([
    ['a callable own then', { value: (): void => undefined, writable: true }],
    ['an accessor own then', { get: (): undefined => undefined }],
    ['a setter-only own then', { set: (): void => undefined }]
  ])('refuses %s defined on the root while it is built', (_title, own) => {
    const unplant = plantSetter('app', own)
    try {
      expect(() => createValidatedConfig({ schema, source: { APP_NAME: 'ok' } })).toThrow(
        BymaxConfigValidationError
      )
    } finally {
      unplant()
    }
  })

  it('refuses a callable then swapped in for a namespace named then', () => {
    const named = defineEnv({ then: z.object({ name: z.string() }) })
    const unplant = plantSetter('then', { value: (): void => undefined, writable: true })
    try {
      expect(() => createValidatedConfig({ schema: named, source: { THEN_NAME: 'ok' } })).toThrow(
        BymaxConfigValidationError
      )
    } finally {
      unplant()
    }
  })

  it('leaves a namespace named then as the namespace it is', () => {
    const named = defineEnv({ then: z.object({ name: z.string() }) })

    const root = createValidatedConfig({ schema: named, source: { THEN_NAME: 'ok' } })

    expect(root.then).toEqual({ name: 'ok' })
  })

  it('keeps what the options factory returned when a native promise it returns is answered for by accessors planted inside it', async () => {
    await settled()
    const real = { APP_NAME: 'real' }
    const factory = factoryOf(
      BymaxConfigModule.forRootAsync({
        useFactory: () => {
          plantSelfRestoringAnswer({ schema, source: { APP_NAME: 'forged' } })
          return Promise.resolve({ schema, source: real })
        }
      }).providers ?? [],
      BYMAX_CONFIG_OPTIONS
    )

    let outcome: { resolved?: { source?: unknown } }
    try {
      outcome = (await tagged(outcomeOf(factory))) as typeof outcome
    } finally {
      restore()
    }

    expect(outcome.resolved?.source).toEqual(real)
  })

  it('keeps the cause a hook rejected with when a native promise it returns is answered for by accessors planted inside it', async () => {
    await settled()
    const failure = new Error('the hook failed')
    const onValidationError = (): Promise<void> => {
      const rejected = Promise.reject(failure)
      nativeThen.call(rejected, undefined, () => undefined)
      plantSelfRestoringAnswer(undefined)
      return rejected
    }
    const factory = factoryOf(
      BymaxConfigModule.forRoot({ schema, source: {}, onValidationError }).providers ?? [],
      BYMAX_CONFIG
    )

    let outcome: { rejected?: BymaxConfigValidationError }
    try {
      outcome = (await tagged(
        outcomeOf(() => factory({ schema, source: {}, onValidationError }))
      )) as typeof outcome
    } finally {
      restore()
    }

    expect(outcome.rejected).toBeInstanceOf(BymaxConfigValidationError)
    expect(outcome.rejected?.cause).toBe(failure)
  })

  it('keeps what the options factory returned when the native promise it returns is frozen and answered for by accessors', async () => {
    /**
     * Scenario: the factory freezes its promise, so no own constructor can be pinned, and plants accessors
     * that answer for it on their first read.
     * Expectation: the options that reach the provider are the ones the promise resolved with.
     */
    await settled()
    const real = { APP_NAME: 'real' }
    const factory = factoryOf(
      BymaxConfigModule.forRootAsync({
        useFactory: () => {
          const frozen = Object.freeze(Promise.resolve({ schema, source: real }))
          plantSelfRestoringAnswer({ schema, source: { APP_NAME: 'forged' } })
          return frozen
        }
      }).providers ?? [],
      BYMAX_CONFIG_OPTIONS
    )

    let outcome: { resolved?: { source?: unknown } }
    try {
      outcome = (await tagged(outcomeOf(factory))) as typeof outcome
    } finally {
      restore()
    }

    expect(outcome.resolved?.source).toEqual(real)
  })

  it('keeps the cause a hook rejected with when the native promise it returns is frozen and answered for by accessors', async () => {
    /**
     * Scenario: the hook returns a frozen rejected promise and plants accessors that answer on first read.
     * Expectation: the validation error still carries the cause the hook rejected with.
     */
    await settled()
    const failure = new Error('the hook failed')
    const onValidationError = (): Promise<void> => {
      const rejected = Object.freeze(Promise.reject(failure))
      nativeThen.call(rejected, undefined, () => undefined)
      plantSelfRestoringAnswer(undefined)
      return rejected
    }
    const factory = factoryOf(
      BymaxConfigModule.forRoot({ schema, source: {}, onValidationError }).providers ?? [],
      BYMAX_CONFIG
    )

    let outcome: { rejected?: BymaxConfigValidationError }
    try {
      outcome = (await tagged(
        outcomeOf(() => factory({ schema, source: {}, onValidationError }))
      )) as typeof outcome
    } finally {
      restore()
    }

    expect(outcome.rejected).toBeInstanceOf(BymaxConfigValidationError)
    expect(outcome.rejected?.cause).toBe(failure)
  })

  it.each([
    ['sealed', (value: Promise<unknown>) => Object.seal(value)],
    ['not extensible', (value: Promise<unknown>) => Object.preventExtensions(value)],
    [
      'carrying a constructor of its own that cannot be redefined',
      (value: Promise<unknown>) =>
        Object.defineProperty(value, 'constructor', { value: function Foreign() {} })
    ],
    [
      'an instance of a subclass',
      () => {
        class Sub extends Promise<unknown> {}
        return Sub.resolve({ schema, source: { APP_NAME: 'real' } })
      }
    ]
  ])(
    'keeps what the options factory returned when its promise is %s and accessors answer for it',
    async (_shape, shape) => {
      /**
       * Scenario: the factory returns a promise that takes no pin, or one of another class, and plants
       * accessors on Promise.prototype that answer on their first read.
       * Expectation: the options that reach the provider are the ones the promise resolved with.
       */
      await settled()
      const factory = factoryOf(
        BymaxConfigModule.forRootAsync({
          useFactory: () => {
            const shaped = shape(Promise.resolve({ schema, source: { APP_NAME: 'real' } }))
            plantSelfRestoringAnswer({ schema, source: { APP_NAME: 'forged' } })
            return shaped as Promise<never>
          }
        }).providers ?? [],
        BYMAX_CONFIG_OPTIONS
      )

      let outcome: { resolved?: { source?: unknown } }
      try {
        outcome = (await tagged(outcomeOf(factory))) as typeof outcome
      } finally {
        restore()
      }

      expect(outcome.resolved?.source).toEqual({ APP_NAME: 'real' })
    }
  )

  it('keeps the provider token resolvable when nothing is hijacked', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source: { APP_NAME: 'ok' } })]
    }).compile()

    expect(moduleRef.get(BYMAX_CONFIG)).toEqual({ app: { name: 'ok' } })
  })
})
