/**
 * Unit tests for the options the module reads while the realm's root prototype carries option names.
 *
 * Layer: unit.
 * Goal: prove that a name planted on `Object.prototype`, as a prototype pollution would plant it, is not
 * taken for an option of `forRoot`, `forRootAsync` or `createValidatedConfig`, while an option held as a
 * field of a class instance, or on a prototype of the host's own, is still read.
 * Mocks: none. The names are planted for the case and removed afterwards.
 */

import { runInNewContext } from 'node:vm'

import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { bymaxConfigProvider, createValidatedConfig } from './config.providers'
import { BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** Runs `run` with `key` planted on the realm root as `value`, and removes it afterwards. */
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

/** As {@link planted}, for a run that is asynchronous: the name stays until what it returns settles. */
async function plantedAsync<T>(key: string, value: unknown, run: () => Promise<T>): Promise<T> {
  Object.defineProperty(Object.prototype, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: false
  })
  try {
    return await run()
  } finally {
    Reflect.deleteProperty(Object.prototype, key)
  }
}

/** The options an options provider of a registration holds. */
function optionsOf(registration: { providers?: unknown[] }): Record<string, unknown> {
  const provider = (registration.providers ?? []).find(
    (candidate) => Reflect.get(candidate as object, 'provide') === BYMAX_CONFIG_OPTIONS
  )
  return Reflect.get(provider as object, 'useValue') as Record<string, unknown>
}

describe('an option name planted on Object.prototype is not an option of forRoot', () => {
  it.each([
    ['source', { APP_NAME: 'planted' }],
    ['onValidationError', () => 1],
    ['strict', true],
    ['schema', schema]
  ])('does not read %s', (key, value) => {
    const registration = planted(key, value, () =>
      BymaxConfigModule.forRoot(key === 'schema' ? ({} as never) : { schema })
    )

    const held = optionsOf(registration)
    expect(held['schema']).toBe(key === 'schema' ? undefined : schema)
    expect(Object.keys(held).filter((name) => name !== 'schema')).toEqual([])
  })

  it('does not run a hook planted as onValidationError when the validation fails', async () => {
    const hook = jest.fn()
    const failing = defineEnv({ app: z.object({ name: z.string() }) })
    const held = optionsOf(BymaxConfigModule.forRoot({ schema: failing }))
    const factory = bymaxConfigProvider.useFactory as (options: unknown) => Promise<unknown>

    await expect(plantedAsync('onValidationError', hook, () => factory(held))).rejects.toThrow(
      'environment validation failed'
    )

    expect(hook).not.toHaveBeenCalled()
  })

  it('does not read isGlobal, so the module stays global', () => {
    const registration = planted('isGlobal', false, () => BymaxConfigModule.forRoot({ schema }))

    expect(registration.global).toBe(true)
  })

  it('does not take a planted source for a source that is present and undefined', () => {
    expect(() =>
      planted('source', undefined, () => createValidatedConfig({ schema }))
    ).not.toThrow()
  })
})

describe('an option name planted on Object.prototype is not an option of forRootAsync', () => {
  it.each([
    ['inject', ['X']],
    ['imports', [class Planted {}]],
    ['provideInjectionTokensFrom', [class Planted {}]]
  ])('does not read %s', (key, value) => {
    const registration = planted(key, value, () =>
      BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }) })
    )

    const provider = (registration.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
    )
    expect(Reflect.get(provider as object, 'inject') ?? []).toEqual([])
    expect(registration.imports ?? []).toEqual([])
  })

  it('does not read isGlobal, so the module stays global', () => {
    const registration = planted('isGlobal', false, () =>
      BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }) })
    )

    expect(registration.global).toBe(true)
  })

  it.each(['useFactory', 'useClass', 'useExisting'])('does not read %s', (key) => {
    const providerOf = (registration: { providers?: unknown[] }): object =>
      (registration.providers ?? []).find(
        (candidate) => Reflect.get(candidate as object, 'provide') === BYMAX_CONFIG_OPTIONS
      ) as object
    const baseline = providerOf(BymaxConfigModule.forRootAsync({} as never))
    const value = key === 'useFactory' ? () => ({ schema }) : class Planted {}

    const provider = planted(key, value, () =>
      providerOf(BymaxConfigModule.forRootAsync({} as never))
    )

    expect(Reflect.get(provider, 'inject')).toEqual(Reflect.get(baseline, 'inject'))
    expect(Reflect.get(provider, 'useFactory')).not.toBe(value)
  })

  it.each([
    ['source', { APP_NAME: 'planted' }],
    ['strict', true],
    ['onValidationError', () => 1]
  ])('does not read %s in what the factory returns', async (key, value) => {
    const registration = BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }) })
    const factory = (registration.providers ?? [])
      .map((provider) => Reflect.get(provider, 'useFactory') as unknown)
      .find((candidate): candidate is () => Promise<unknown> => typeof candidate === 'function')

    const resolved = (await plantedAsync(key, value, factory as () => Promise<unknown>)) as object

    expect(Object.keys(resolved)).toEqual(['schema'])
  })
})

describe('an option name planted on Object.prototype is not an option of createValidatedConfig', () => {
  it('validates the process environment, not a planted source', () => {
    const config = planted('source', { APP_NAME: 'planted' }, () =>
      createValidatedConfig({ schema })
    )

    expect(config.app.name).toBe('n')
  })

  it('does not turn strict on', () => {
    process.env['APP_STRAY'] = 'x'
    try {
      expect(() => planted('strict', true, () => createValidatedConfig({ schema }))).not.toThrow()
    } finally {
      delete process.env['APP_STRAY']
    }
  })

  it('does not turn strict on for the validator either', () => {
    expect(() =>
      planted('strict', true, () => validateEnv(schema, { APP_STRAY: 'x' }, {}))
    ).not.toThrow()
  })
})

describe('the options held by the host are still read with the root prototype carrying the same names', () => {
  it('reads the own options of a plain object', () => {
    const registration = planted('strict', false, () =>
      BymaxConfigModule.forRoot({ schema, strict: true, source: {} })
    )

    expect(optionsOf(registration)['strict']).toBe(true)
  })

  it('reads the options of a class instance held on its prototype', () => {
    class Held {
      public get schema(): typeof schema {
        return schema
      }

      public get strict(): boolean {
        return true
      }
    }

    const registration = planted('strict', false, () =>
      BymaxConfigModule.forRoot(new Held() as never)
    )

    expect(optionsOf(registration)['strict']).toBe(true)
  })

  it('reads an option held on a prototype of the host that is not the root', () => {
    const base = { strict: true }
    const options = Object.assign(Object.create(base) as object, { schema })

    const registration = planted('strict', false, () => BymaxConfigModule.forRoot(options as never))

    expect(optionsOf(registration)['strict']).toBe(true)
  })

  it('does not read a name that only a parent with no prototype holds', () => {
    const base = Object.create(null) as Record<string, unknown>
    base['strict'] = true
    const options = Object.assign(Object.create(base) as object, { schema })

    const registration = BymaxConfigModule.forRoot(options as never)

    expect(optionsOf(registration)['strict']).toBeUndefined()
  })

  it('reads an option that a Proxy with no prototype answers by a get trap alone', () => {
    const answers: Record<string, unknown> = { schema, strict: true }
    const options = new Proxy(Object.create(null) as object, {
      get: (_target, key) => answers[key as string]
    })

    const registration = BymaxConfigModule.forRoot(options as never)

    expect(optionsOf(registration)['strict']).toBe(true)
  })

  it('reads an option of an object with no prototype', () => {
    const options = Object.assign(Object.create(null) as object, { schema, strict: true })

    const registration = BymaxConfigModule.forRoot(options as never)

    expect(optionsOf(registration)['strict']).toBe(true)
  })
})

describe("metadata names planted on Object.prototype are not the schema author's", () => {
  const described = defineEnv({
    app: z.object({ name: z.string().default('n').meta({ description: 'the name' }) }).meta({
      description: 'the app'
    })
  })

  it('does not open a namespace for a planted open', () => {
    const source = { APP_STRAY: 'x' }

    expect(() =>
      planted('open', true, () =>
        createValidatedConfig({ schema: described, source, strict: true })
      )
    ).toThrow('environment validation failed')
  })

  it('does not rename a variable for a planted env', () => {
    const source = { APP_NAME: 'real', PLANTED_VARIABLE: 'planted' }

    const config = planted('env', 'PLANTED_VARIABLE', () =>
      createValidatedConfig({ schema: described, source })
    )

    expect(config.app.name).toBe('real')
  })

  it('does not call a planted env unusable', () => {
    expect(() =>
      planted('env', 5, () => createValidatedConfig({ schema: described, source: {} }))
    ).not.toThrow()
  })
})

describe('the root prototype is found without reading a property of it', () => {
  it('still ignores a planted name when Object.prototype.constructor is overwritten', () => {
    const registration = planted('constructor', 5, () =>
      planted('strict', true, () => BymaxConfigModule.forRoot({ schema }))
    )

    expect(Object.keys(optionsOf(registration))).toEqual(['schema'])
  })

  it('still ignores a planted source when Object.prototype.constructor is overwritten', () => {
    const config = planted('constructor', null, () =>
      planted('source', { APP_NAME: 'planted' }, () => createValidatedConfig({ schema }))
    )

    expect(config.app.name).toBe('n')
  })

  it('ignores a name planted on the root prototype of another realm', () => {
    const options = runInNewContext(
      `Object.defineProperty(Object.prototype, 'constructor', { value: 5, configurable: true, writable: true });
       Object.defineProperty(Object.prototype, 'strict', { value: true, configurable: true, writable: true });
       ({})`
    ) as Record<string, unknown>
    options['schema'] = schema

    const registration = BymaxConfigModule.forRoot(options as never)

    expect(optionsOf(registration)['strict']).toBeUndefined()
  })

  it('still reads a name the other realm holds as an own property', () => {
    const options = runInNewContext('({ strict: true })') as Record<string, unknown>
    options['schema'] = schema

    const registration = BymaxConfigModule.forRoot(options as never)

    expect(optionsOf(registration)['strict']).toBe(true)
  })
})
