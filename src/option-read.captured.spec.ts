/**
 * Unit tests for the option reader and the literals the module hands to Nest, with built-ins replaced.
 *
 * Layer: unit.
 * Goal: prove that the reader keeps ignoring a planted name and keeps reading an own one when
 * `Object.hasOwn`, `Object.getPrototypeOf` and `Reflect.get` are replaced after import, and that the
 * provider and module objects the library builds have no prototype, so Nest reads nothing a prototype
 * supplies from them.
 * Mocks: none. The built-ins are replaced for the case and put back afterwards.
 */

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { bymaxConfigProvider } from './config.providers'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { hasOption, readOption } from './option-read'

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** Runs `run` with `owner[key]` replaced by `value`, and puts the original back afterwards. */
function withReplaced<T>(owner: object, key: PropertyKey, value: unknown, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(owner, key) as PropertyDescriptor
  Object.defineProperty(owner, key, { ...original, value })
  try {
    return run()
  } finally {
    Object.defineProperty(owner, key, original)
  }
}

/** Runs `run` with `key` planted on the realm root and removes it afterwards. */
function planted<T>(key: string, value: unknown, run: () => T): T {
  Object.defineProperty(Object.prototype, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: false
  })
  try {
    return run()
  } finally {
    Reflect.deleteProperty(Object.prototype, key)
  }
}

/** Runs `run` with the three built-ins the reader walks with replaced by ones that answer wrongly. */
function withWrongBuiltins<T>(run: () => T): T {
  return withReplaced(
    Object,
    'hasOwn',
    () => false,
    () =>
      withReplaced(
        Object,
        'getPrototypeOf',
        () => null,
        () => withReplaced(Reflect, 'get', () => 'wrong', run)
      )
  )
}

describe('the option reader, with the built-ins it walks with replaced after the import', () => {
  it('still ignores a planted name', () => {
    const value = planted('strict', true, () => withWrongBuiltins(() => readOption({}, 'strict')))

    expect(value).toBeUndefined()
  })

  it('still reads an own option', () => {
    const value = withWrongBuiltins(() => readOption({ strict: true }, 'strict'))

    expect(value).toBe(true)
  })

  it('still answers has for an own option and not for a planted one', () => {
    const own = withWrongBuiltins(() => hasOption({ source: {} }, 'source'))
    const root = planted('source', {}, () => withWrongBuiltins(() => hasOption({}, 'source')))

    expect([own, root]).toEqual([true, false])
  })
})

describe('the provider and module objects the library builds', () => {
  const planting = (run: () => unknown): unknown =>
    planted('scope', 1, () =>
      planted('useClass', class Planted {}, () => planted('useValue', 1, run))
    )

  it('has no prototype for the config provider, so Nest reads no planted scope or class', () => {
    expect(Object.getPrototypeOf(bymaxConfigProvider)).toBeNull()
    expect(planting(() => Reflect.get(bymaxConfigProvider, 'scope'))).toBeUndefined()
  })

  it('has no prototype for the module that forRoot and forRootAsync return', () => {
    expect(Object.getPrototypeOf(BymaxConfigModule.forRoot({ schema }))).toBeNull()
    expect(
      Object.getPrototypeOf(BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }) }))
    ).toBeNull()
  })

  it('keeps a class that provideInjectionTokensFrom brings in as the provider it is', () => {
    class Dependency {}

    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => ({ schema }),
      inject: [Dependency],
      provideInjectionTokensFrom: [Dependency]
    })

    expect(registration.providers).toContain(Dependency)
  })

  it('leaves the providers that the host brings in as they are', () => {
    class Dependency {}
    class Held {
      public get provide(): string {
        return 'held'
      }

      public get useValue(): number {
        return 1
      }
    }
    const token = { provide: 'T', useValue: 1 }
    const held = new Held()

    const registration = BymaxConfigModule.forRootAsync({
      useFactory: () => ({ schema }),
      inject: [Dependency, 'T', 'held'],
      provideInjectionTokensFrom: [Dependency, token, held as never]
    })

    expect(registration.providers).toEqual(expect.arrayContaining([Dependency, token, held]))
    expect(registration.providers?.filter((provider) => provider === held)).toHaveLength(1)
  })

  it('has no prototype for the options provider of forRootAsync', () => {
    const registration = BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }) })
    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
    )

    expect(Object.getPrototypeOf(provider)).toBeNull()
  })

  it('reads no planted scope from the options provider of forRootAsync', () => {
    const registration = BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }) })
    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
    )

    expect(planting(() => Reflect.get(provider as object, 'scope'))).toBeUndefined()
  })
})
