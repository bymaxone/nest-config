/**
 * Table tests for how BymaxConfigModule reads its registration options.
 *
 * Layer: unit and integration.
 * Goal: pin that an own option key holding undefined or null means "use the default" for every
 * option that has one, that a `source` key that is present but undefined or null is refused rather
 * than defaulted to the process environment, and that options held by an object whose properties are
 * accessors (a class instance, whose accessors live on the prototype) are read by property access
 * instead of being lost to a copy of its own enumerable keys.
 * Mocks: none.
 */

import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import type {
  BymaxConfigForRootAsyncOptions,
  BymaxConfigForRootOptions
} from './config.module-definition'
import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string() }) })
const valid = { APP_NAME: 'ok' }
const withTypo = { APP_NAME: 'ok', APP_NAMEE: 'typo' }

/** Options as a host that passes an own key set to undefined or null would write them. */
const options = (own: object): BymaxConfigForRootOptions => own as BymaxConfigForRootOptions

/** Async options, written the same way. */
const asyncOptions = (own: object): BymaxConfigForRootAsyncOptions =>
  own as BymaxConfigForRootAsyncOptions

/** Compile a testing module that imports the registered module, and return the injected root. */
async function boot(module: ReturnType<typeof BymaxConfigModule.forRoot>): Promise<object> {
  const testing = await Test.createTestingModule({ imports: [module] }).compile()
  return testing.get<object>(BYMAX_CONFIG)
}

/** An options holder whose properties are accessors on its prototype, as a class instance has them. */
class AccessorOptions {
  public constructor(private readonly values: Record<string, unknown>) {}
  public get schema(): unknown {
    return this.values['schema']
  }
  public get source(): unknown {
    return this.values['source']
  }
  public get strict(): unknown {
    return this.values['strict']
  }
  public get isGlobal(): unknown {
    return this.values['isGlobal']
  }
}

describe('registration options read as defaults', () => {
  it.each([
    { label: 'undefined', value: undefined, expected: true },
    { label: 'null', value: null, expected: true },
    { label: 'false', value: false, expected: false },
    { label: 'true', value: true, expected: true }
  ])(
    'forRoot with isGlobal $label registers a module with global $expected',
    ({ value, expected }) => {
      const module = BymaxConfigModule.forRoot(options({ schema, source: valid, isGlobal: value }))

      expect(module.global).toBe(expected)
    }
  )

  it.each([
    { label: 'undefined', value: undefined, expected: true },
    { label: 'null', value: null, expected: true },
    { label: 'false', value: false, expected: false }
  ])(
    'forRootAsync with isGlobal $label registers a module with global $expected',
    ({ value, expected }) => {
      const module = BymaxConfigModule.forRootAsync(
        asyncOptions({ useFactory: () => ({ schema, source: valid }), isGlobal: value })
      )

      expect(module.global).toBe(expected)
    }
  )

  it.each([
    ['undefined', undefined],
    ['null', null]
  ])(
    'forRoot with strict %s validates like an absent strict, so a stray variable passes',
    async (_, value) => {
      const root = await boot(
        BymaxConfigModule.forRoot(options({ schema, source: withTypo, strict: value }))
      )

      expect(Object.keys(root)).toEqual(['app'])
    }
  )

  it('forRoot with strict true refuses the same stray variable', async () => {
    await expect(
      boot(BymaxConfigModule.forRoot(options({ schema, source: withTypo, strict: true })))
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)
  })

  it.each([
    ['undefined', undefined],
    ['null', null]
  ])(
    'forRoot with onValidationError %s throws the aggregated error with no hook',
    async (_, value) => {
      await expect(
        boot(BymaxConfigModule.forRoot(options({ schema, source: {}, onValidationError: value })))
      ).rejects.toBeInstanceOf(BymaxConfigValidationError)
    }
  )

  it('forRoot calls an onValidationError hook that is set once, with the issues it throws', async () => {
    const hook = jest.fn()

    const error = await boot(
      BymaxConfigModule.forRoot(options({ schema, source: {}, onValidationError: hook }))
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as BymaxConfigValidationError).issues).toHaveLength(1)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledWith((error as BymaxConfigValidationError).issues)
  })

  it.each([
    ['undefined', undefined],
    ['null', null]
  ])(
    'forRoot with source %s is refused instead of falling back to the process environment',
    async (_, value) => {
      /**
       * A source that failed to load must not silently become process.env: that would validate the
       * wrong environment. The key being present is the signal, so this is the one option whose
       * undefined or null is an error, not a default.
       */
      await expect(
        boot(BymaxConfigModule.forRoot(options({ schema, source: value })))
      ).rejects.toThrow('source was provided but is undefined or null')
    }
  )

  it('forRoot with the source key absent validates the process environment', async () => {
    const before = process.env['APP_NAME']
    process.env['APP_NAME'] = 'from-process-env'
    try {
      const root = await boot(BymaxConfigModule.forRoot(options({ schema })))

      expect(Object.keys(root)).toEqual(['app'])
    } finally {
      if (before === undefined) delete process.env['APP_NAME']
      else process.env['APP_NAME'] = before
    }
  })
})

describe('registration options held by an object with accessor properties', () => {
  it('forRoot reads schema and source through the accessors', async () => {
    const root = await boot(
      BymaxConfigModule.forRoot(options(new AccessorOptions({ schema, source: valid })))
    )

    expect(Object.keys(root)).toEqual(['app'])
  })

  it('forRoot reads strict through its accessor', async () => {
    await expect(
      boot(
        BymaxConfigModule.forRoot(
          options(new AccessorOptions({ schema, source: withTypo, strict: true }))
        )
      )
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)
  })

  it('forRoot reads isGlobal through its accessor', () => {
    const module = BymaxConfigModule.forRoot(
      options(new AccessorOptions({ schema, source: valid, isGlobal: false }))
    )

    expect(module.global).toBe(false)
  })

  it('forRoot treats an accessor that returns undefined or null as the default', () => {
    expect(
      BymaxConfigModule.forRoot(
        options(new AccessorOptions({ schema, source: valid, isGlobal: undefined }))
      ).global
    ).toBe(true)
    expect(
      BymaxConfigModule.forRoot(
        options(new AccessorOptions({ schema, source: valid, isGlobal: null }))
      ).global
    ).toBe(true)
  })

  it('forRoot refuses a source accessor that returns undefined, as it refuses the key set to undefined', async () => {
    await expect(
      boot(BymaxConfigModule.forRoot(options(new AccessorOptions({ schema, source: undefined }))))
    ).rejects.toThrow('source was provided but is undefined or null')
  })

  it('forRootAsync reads the factory and isGlobal through accessors', async () => {
    class AsyncAccessorOptions {
      public get useFactory(): () => object {
        return () => ({ schema, source: valid })
      }
      public get isGlobal(): boolean {
        return false
      }
    }

    const module = BymaxConfigModule.forRootAsync(asyncOptions(new AsyncAccessorOptions()))
    const root = await boot(module)

    expect(module.global).toBe(false)
    expect(Object.keys(root)).toEqual(['app'])
  })
})

describe('registration options held by a Proxy that defines only a get trap', () => {
  /** Options whose keys exist only through the get trap, so `in` finds none of them. */
  const trapped = (values: Record<string, unknown>): BymaxConfigForRootOptions =>
    options(new Proxy({}, { get: (_target, key) => values[String(key)] }))

  it('forRoot validates the source the trap returns, not the process environment', async () => {
    const before = process.env['APP_NAME']
    process.env['APP_NAME'] = 'from-process-env'
    try {
      const root = await boot(
        BymaxConfigModule.forRoot(trapped({ schema, source: { APP_NAME: 'from-trap' } }))
      )

      expect(root).toEqual({ app: { name: 'from-trap' } })
    } finally {
      if (before === undefined) delete process.env['APP_NAME']
      else process.env['APP_NAME'] = before
    }
  })

  it('forRoot refuses a source the trap returns as null, like a literal key set to null', async () => {
    await expect(
      boot(BymaxConfigModule.forRoot(trapped({ schema, source: null })))
    ).rejects.toThrow('source was provided but is undefined or null')
  })

  it('forRoot validates the process environment when the trap returns no source', async () => {
    const before = process.env['APP_NAME']
    process.env['APP_NAME'] = 'from-process-env'
    try {
      const root = await boot(BymaxConfigModule.forRoot(trapped({ schema })))

      expect(root).toEqual({ app: { name: 'from-process-env' } })
    } finally {
      if (before === undefined) delete process.env['APP_NAME']
      else process.env['APP_NAME'] = before
    }
  })
})

describe('a forRoot or forRootAsync argument that is not an object', () => {
  const SENTINEL = 'SeNtInEl-options-9d41'

  it.each([
    { label: 'a string', value: SENTINEL, type: 'string' },
    { label: 'a number', value: 42, type: 'number' },
    { label: 'a boolean', value: true, type: 'boolean' },
    { label: 'null', value: null, type: 'null' },
    { label: 'undefined', value: undefined, type: 'undefined' }
  ])('forRoot refuses $label with a message that names only its type', ({ value, type }) => {
    const call = () => BymaxConfigModule.forRoot(value as never)

    expect(call).toThrow(TypeError)
    expect(call).toThrow(`BymaxConfigModule.forRoot: options must be an object, received ${type}`)
    expect(call).not.toThrow(new RegExp(SENTINEL))
  })

  it.each([
    { label: 'a string', value: SENTINEL, type: 'string' },
    { label: 'null', value: null, type: 'null' }
  ])('forRootAsync refuses $label with a message that names only its type', ({ value, type }) => {
    const call = () => BymaxConfigModule.forRootAsync(value as never)

    expect(call).toThrow(TypeError)
    expect(call).toThrow(
      `BymaxConfigModule.forRootAsync: options must be an object, received ${type}`
    )
  })
})

describe('options returned by a forRootAsync factory', () => {
  it('treats onValidationError null as absent: the aggregated error carries no swallowed hook error', async () => {
    const error = await boot(
      BymaxConfigModule.forRootAsync(
        asyncOptions({ useFactory: () => ({ schema, source: {}, onValidationError: null }) })
      )
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as Error).cause).toBeUndefined()
  })

  it('still reports a hook that is set, so the cause stays reserved for a hook that throws', async () => {
    const failing = (): never => {
      throw new Error('hook failed')
    }
    const error = await boot(
      BymaxConfigModule.forRootAsync(
        asyncOptions({ useFactory: () => ({ schema, source: {}, onValidationError: failing }) })
      )
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    expect((error as Error).cause).toEqual(new Error('hook failed'))
  })
})

describe('the options a forRootAsync factory, class or existing provider returns', () => {
  class OptionsFactory {
    public constructor(private readonly returned: object) {}
    public create(): object {
      return this.returned
    }
  }

  /** The value the options token resolves to, whichever form produced the options provider. */
  async function tokenValue(
    registration: BymaxConfigForRootAsyncOptions,
    ...args: unknown[]
  ): Promise<Record<string, unknown>> {
    const provider = Reflect.get(
      (BymaxConfigModule.forRootAsync(registration).providers ?? []).find(
        (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
      ) as object,
      'useFactory'
    ) as (...factoryArgs: unknown[]) => Promise<Record<string, unknown>>
    return provider(...args)
  }

  const returned = { schema, source: valid, strict: true }

  it.each([
    {
      form: 'useFactory',
      registration: asyncOptions({ useFactory: () => returned }),
      args: [] as unknown[]
    },
    {
      form: 'useClass',
      registration: asyncOptions({ useClass: OptionsFactory }),
      args: [new OptionsFactory(returned)]
    },
    {
      form: 'useExisting',
      registration: asyncOptions({ useExisting: OptionsFactory }),
      args: [new OptionsFactory(returned)]
    }
  ])(
    '$form carries only the options the module reads to the options token',
    async ({ registration, args }) => {
      const value = await tokenValue(registration, ...args)

      expect(Object.keys(value).sort()).toEqual(['schema', 'source', 'strict'])
    }
  )

  it('drops an onValidationError that is null from what the token carries', async () => {
    const value = await tokenValue(
      asyncOptions({ useFactory: () => ({ schema, source: valid, onValidationError: null }) })
    )

    expect(Object.keys(value)).not.toContain('onValidationError')
  })

  it('reads a returned object held by a Proxy with only a get trap, source included', async () => {
    const value = await tokenValue(
      asyncOptions({
        useFactory: () =>
          new Proxy(
            {},
            { get: (_target, key) => ({ schema, source: valid })[String(key) as 'schema'] }
          )
      })
    )

    expect(value['source']).toBe(valid)
  })

  it('refuses a factory that returns something that is not an object, naming only its type', async () => {
    const sentinel = 'SeNtInEl-factory-3c7a'

    await expect(tokenValue(asyncOptions({ useFactory: () => sentinel }))).rejects.toThrow(
      'BymaxConfigModule.forRootAsync: options must be an object, received string'
    )
    await expect(tokenValue(asyncOptions({ useFactory: () => sentinel }))).rejects.not.toThrow(
      new RegExp(sentinel)
    )
  })
})

describe('the providers of a generated definition that are not the options provider', () => {
  class Dependency {}

  it('forRoot keeps the options as a value, with no factory added', () => {
    const module = BymaxConfigModule.forRoot(options({ schema, source: valid }))
    const provider = (module.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS
    ) as object

    expect(Reflect.has(provider, 'useValue')).toBe(true)
    expect(Reflect.has(provider, 'useFactory')).toBe(false)
  })

  it('forRootAsync leaves a provider handed through provideInjectionTokensFrom untouched', () => {
    const useFactory = (): number => 1
    const handed = { provide: Dependency, useFactory, inject: [] }

    const module = BymaxConfigModule.forRootAsync(
      asyncOptions({
        useFactory: () => ({ schema, source: valid }),
        inject: [Dependency],
        provideInjectionTokensFrom: [handed]
      })
    )
    const found = (module.providers ?? []).find(
      (candidate) => Reflect.get(candidate, 'provide') === Dependency
    ) as object

    expect(Reflect.get(found, 'useFactory')).toBe(useFactory)
  })
})

describe('a registration option that must be a boolean', () => {
  const SENTINEL = 'SeNtInEl-boolean-5b2e'

  const values = [
    { label: 'the number 0', value: 0, type: 'number' },
    { label: 'the number 1', value: 1, type: 'number' },
    { label: 'NaN', value: Number.NaN, type: 'number' },
    { label: 'an empty string', value: '', type: 'string' },
    { label: 'the string "false"', value: 'false', type: 'string' },
    { label: 'a secret-shaped string', value: SENTINEL, type: 'string' },
    { label: 'an object', value: {}, type: 'object' },
    { label: 'an array', value: [], type: 'object' }
  ]

  it.each(values)('forRoot refuses isGlobal $label, naming only its type', ({ value, type }) => {
    const call = () =>
      BymaxConfigModule.forRoot(options({ schema, source: valid, isGlobal: value }))

    expect(call).toThrow(TypeError)
    expect(call).toThrow(`BymaxConfigModule.forRoot: isGlobal must be a boolean, received ${type}`)
    expect(call).not.toThrow(new RegExp(SENTINEL))
  })

  it.each(values)('forRoot refuses strict $label, naming only its type', ({ value, type }) => {
    const call = () => BymaxConfigModule.forRoot(options({ schema, source: valid, strict: value }))

    expect(call).toThrow(TypeError)
    expect(call).toThrow(`BymaxConfigModule.forRoot: strict must be a boolean, received ${type}`)
    expect(call).not.toThrow(new RegExp(SENTINEL))
  })

  it.each(values)(
    'forRootAsync refuses isGlobal $label, naming only its type',
    ({ value, type }) => {
      const call = () =>
        BymaxConfigModule.forRootAsync(
          asyncOptions({ useFactory: () => ({ schema, source: valid }), isGlobal: value })
        )

      expect(call).toThrow(
        `BymaxConfigModule.forRootAsync: isGlobal must be a boolean, received ${type}`
      )
    }
  )

  it.each(values)(
    'a forRootAsync factory that returns strict $label is refused, naming only its type',
    async ({ value, type }) => {
      const provider = Reflect.get(
        (
          BymaxConfigModule.forRootAsync(
            asyncOptions({ useFactory: () => ({ schema, source: valid, strict: value }) })
          ).providers ?? []
        ).find((candidate) => Reflect.get(candidate, 'provide') === BYMAX_CONFIG_OPTIONS) as object,
        'useFactory'
      ) as () => Promise<unknown>

      await expect(provider()).rejects.toThrow(
        `BymaxConfigModule.forRootAsync: strict must be a boolean, received ${type}`
      )
    }
  )

  it.each([true, false, null, undefined])('still accepts %s for isGlobal and strict', (value) => {
    const module = BymaxConfigModule.forRoot(
      options({ schema, source: valid, isGlobal: value, strict: value })
    )

    expect(module.global).toBe(value !== false)
  })
})
