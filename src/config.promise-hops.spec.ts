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
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const nativeThen = Promise.prototype.then
const nativeConstructor = Reflect.getOwnPropertyDescriptor(Promise.prototype, 'constructor')

/** Puts back what a hijack replaced, so a failing row cannot leak into the next one. */
function restore(): void {
  Promise.prototype.then = nativeThen
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
  afterEach(restore)

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

  it('tags a promise with the intrinsic Promise as an own, non-enumerable constructor', () => {
    const promise = tagged(Promise.resolve(1))

    expect(Reflect.getOwnPropertyDescriptor(promise, 'constructor')).toEqual({
      value: Promise,
      writable: true,
      enumerable: false,
      configurable: true
    })
  })

  it('returns a frozen promise unchanged instead of throwing', () => {
    const frozen = Object.freeze(Promise.resolve(1))

    expect(tagged(frozen)).toBe(frozen)
    expect(Object.hasOwn(frozen, 'constructor')).toBe(false)
  })

  it('keeps the provider token resolvable when nothing is hijacked', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source: { APP_NAME: 'ok' } })]
    }).compile()

    expect(moduleRef.get(BYMAX_CONFIG)).toEqual({ app: { name: 'ok' } })
  })
})
