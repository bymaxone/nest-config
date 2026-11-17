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
import { BYMAX_CONFIG } from './config.tokens'
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
