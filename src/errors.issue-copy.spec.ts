/**
 * Unit tests for how the error copies the list of issues it is handed.
 *
 * Layer: unit.
 * Goal: prove the list is copied by index with its length read once and capped, that a list which
 * answers nothing to the iterator still yields every issue, that a list claiming no entries while it
 * lists some is refused, and that each field of an issue is read once.
 * Mocks: none. The host's lists are written for the case.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { ConfigIssue } from './errors'

const issue: ConfigIssue = {
  path: 'app.name',
  variable: 'APP_NAME',
  code: ConfigErrorCode.MISSING,
  message: 'missing required value'
}

/** What a construction throws, or a failure of the test when it does not throw. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the construction to throw')
}

describe('a list of issues that no iterator can shorten', () => {
  it.each([
    [
      'an Array subclass with an empty iterator',
      (() => {
        class Quiet extends Array<unknown> {
          public override [Symbol.iterator](): ArrayIterator<unknown> {
            return [].values()
          }
        }
        const list = new Quiet()
        list.push(issue)
        return list as unknown
      })()
    ],
    [
      'an array whose map answers nothing',
      Object.defineProperty([issue], 'map', { value: () => [] }) as unknown
    ],
    [
      'an array whose own iterator ends at once',
      Object.defineProperty([issue], Symbol.iterator, { value: () => [].values() }) as unknown
    ]
  ])('keeps every issue of %s', (_name, list) => {
    const error = new BymaxConfigValidationError(list as never)

    expect(error.issues).toEqual([issue])
    expect(error.message).toContain('(1 issue)')
  })

  it('is refused when it claims no entries while it lists one', () => {
    const claimed = new Proxy([issue], {
      get: (target, key, receiver) =>
        key === 'length' ? 0 : (Reflect.get(target, key, receiver) as unknown)
    })

    const error = thrownBy(() => new BymaxConfigValidationError(claimed as never))

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: issues claims no entries but lists some'
    )
  })

  it('accepts an empty list', () => {
    expect(new BymaxConfigValidationError([]).issues).toEqual([])
  })
})

describe('the length and the entries of a list of issues', () => {
  it('reads the length once', () => {
    let reads = 0
    const counted = new Proxy([issue, issue], {
      get: (target, key, receiver) => {
        if (key === 'length') reads += 1
        return Reflect.get(target, key, receiver) as unknown
      }
    })

    new BymaxConfigValidationError(counted as never)

    expect(reads).toBe(1)
  })

  it('reads each index once and each field of an issue once', () => {
    const reads: string[] = []
    const watched = new Proxy(issue, {
      get: (target, key, receiver) => {
        reads.push(String(key))
        return Reflect.get(target, key, receiver) as unknown
      }
    })
    const indices: string[] = []
    const list = new Proxy([watched], {
      get: (target, key, receiver) => {
        if (key === '0') indices.push(String(key))
        return Reflect.get(target, key, receiver) as unknown
      }
    })

    new BymaxConfigValidationError(list as never)

    expect(indices).toEqual(['0'])
    expect([...reads].sort()).toEqual(['code', 'message', 'path', 'variable'])
  })

  /** An array whose length answers `length`, which only a Proxy can make a list say. */
  const claiming = (length: unknown): unknown =>
    new Proxy([issue], {
      get: (target, key, receiver) =>
        key === 'length' ? length : (Reflect.get(target, key, receiver) as unknown)
    })

  it.each([
    ['a length that is not a number', claiming('1')],
    ['a fractional length', claiming(1.5)],
    ['a negative length', claiming(-1)],
    ['no length', claiming(undefined)]
  ])('refuses %s', (_name, list) => {
    const error = thrownBy(() => new BymaxConfigValidationError(list as never))

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: issues must be a list with a whole-number length'
    )
  })

  it('refuses a list longer than the cap before it reads an entry', () => {
    let entryReads = 0
    const huge = new Proxy([] as unknown[], {
      get: (target, key) => {
        if (key === 'length') return 10_001
        entryReads += 1
        return Reflect.get(target, key) as unknown
      }
    })

    const error = thrownBy(() => new BymaxConfigValidationError(huge as never))

    expect(error).toBeInstanceOf(RangeError)
    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: at most 10000 issues, received 10001'
    )
    expect(entryReads).toBe(0)
  })

  it('accepts a list at the cap', () => {
    const list = Array.from({ length: 10_000 }, () => issue)

    expect(new BymaxConfigValidationError(list).issues).toHaveLength(10_000)
  })

  it.each([
    ['undefined', undefined, 0],
    ['null', null, 1],
    ['a string', 'text', 0]
  ])('refuses an entry that is %s, naming its index', (_name, entry, at) => {
    const list: unknown[] = [issue, issue]
    list[at] = entry

    const error = thrownBy(() => new BymaxConfigValidationError(list as never))

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe(
      `BymaxConfigValidationError: issue ${at} must be an object`
    )
  })
})

describe('the host code that reads a list of issues', () => {
  const SENTINEL = 'sentinel-value-never-printed'
  const WITHHELD =
    'BymaxConfigValidationError: reading the issues threw; its message is withheld because it can carry the value'

  /** A host error whose message carries a value no refusal may print. */
  const hostError = new Error(SENTINEL)

  it.each([
    [
      'the length',
      new Proxy([issue], {
        get: (target, key, receiver) => {
          if (key === 'length') throw hostError
          return Reflect.get(target, key, receiver) as unknown
        }
      })
    ],
    [
      'the keys of a list that claims no entries',
      new Proxy([] as unknown[], {
        ownKeys: () => {
          throw hostError
        }
      })
    ],
    [
      'an entry',
      new Proxy([issue], {
        get: (target, key, receiver) => {
          if (key === '0') throw hostError
          return Reflect.get(target, key, receiver) as unknown
        }
      })
    ],
    [
      'a field of an entry',
      [
        {
          ...issue,
          get message(): string {
            throw hostError
          }
        }
      ]
    ]
  ])(
    'is refused with its cause when it throws reading %s, and the message is withheld',
    (_name, list) => {
      const error = thrownBy(() => new BymaxConfigValidationError(list as never))

      expect(error).toBeInstanceOf(TypeError)
      expect((error as Error).message).toBe(WITHHELD)
      expect((error as Error).message).not.toContain(SENTINEL)
      expect((error as Error).cause).toBe(hostError)
    }
  )

  it.each([
    ['path', 7],
    ['variable', ['A', 'B']],
    ['code', undefined],
    ['code', 5],
    ['message', { toString: () => SENTINEL }]
  ])('refuses an entry whose %s is not a string, naming the field and no value', (field, value) => {
    const error = thrownBy(
      () => new BymaxConfigValidationError([{ ...issue }, { ...issue, [field]: value }] as never)
    )

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe(
      `BymaxConfigValidationError: issue 1 field ${field} must be a string`
    )
  })

  it('writes the code like the other fields: escaped and bounded', () => {
    const error = new BymaxConfigValidationError([
      { ...issue, code: `a\nb${'x'.repeat(300)}` } as never
    ])

    const code = (error.issues[0] as ConfigIssue).code as string
    expect(code.startsWith('a\\u000ab')).toBe(true)
    expect(code.length).toBeLessThanOrEqual(201)
  })
})

describe('the issues the validator itself raises', () => {
  it('are accepted again by the constructor, with every code and the empty path', () => {
    const plain = defineEnv({
      app: z.object({ name: z.string(), port: z.coerce.number().max(10) })
    })
    const throwing = defineEnv({
      app: z.object({
        flag: z.string().transform(() => {
          throw new Error('rule')
        })
      })
    })
    const issues = [
      ...(
        thrownBy(() =>
          validateEnv(plain, { APP_PORT: '99', APP_STRAY: 'y' }, { strict: true })
        ) as BymaxConfigValidationError
      ).issues,
      ...(thrownBy(() => validateEnv(throwing, { APP_FLAG: 'x' })) as BymaxConfigValidationError)
        .issues
    ]

    const rebuilt = new BymaxConfigValidationError(issues)

    expect(issues.map((entry) => entry.code).sort()).toEqual([
      ConfigErrorCode.INVALID,
      ConfigErrorCode.INVALID,
      ConfigErrorCode.MISSING,
      ConfigErrorCode.UNKNOWN_KEY
    ])
    expect(issues.some((entry) => entry.path === '')).toBe(true)
    expect(rebuilt.issues).toEqual(issues)
  })
})

describe('a value that is not an array', () => {
  it.each([
    ['a function', () => issue],
    ['a String object', new String('')],
    ['an object that has a length of 0', { length: 0 }],
    ['an object that lists an issue', { length: 1, 0: issue }],
    ['a string', 'text'],
    ['a number', 3],
    ['null', null]
  ])('is refused as %s, naming no value', (_name, list) => {
    const error = thrownBy(() => new BymaxConfigValidationError(list as never))

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe('BymaxConfigValidationError: issues must be an array')
  })
})

describe('an empty array that carries more than entries', () => {
  /** An empty Array subclass that keeps a field of its own, as a class of the host's can. */
  class Tagged extends Array<unknown> {
    public readonly tag = 'host'
  }

  it.each([
    ['a named property', Object.assign([], { note: 'x' })],
    ['an Array subclass with a field of its own', new Tagged()],
    ['a name just past the last index, 4294967295', Object.assign([], { '4294967295': 'x' })],
    ['a name far past the last index', Object.assign([], { '99999999999': 'x' })],
    ['a property whose name is not an index', Object.assign([], { '01': 'x', '-1': 'y' })]
  ])('is accepted as empty with %s', (_name, list) => {
    expect(new BymaxConfigValidationError(list as never).issues).toEqual([])
  })

  it('is refused for the last index, 4294967294, when it claims no entries', () => {
    const claimed = new Proxy([] as unknown[], {
      get: (target, key, receiver) =>
        key === 'length' ? 0 : (Reflect.get(target, key, receiver) as unknown),
      ownKeys: () => ['length', '4294967294'],
      getOwnPropertyDescriptor: (target, key) =>
        key === 'length'
          ? Reflect.getOwnPropertyDescriptor(target, key)
          : { value: issue, enumerable: true, configurable: true }
    })

    const error = thrownBy(() => new BymaxConfigValidationError(claimed as never))

    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: issues claims no entries but lists some'
    )
  })

  it('is refused only for an own index key, with its own reason', () => {
    const claimed = new Proxy([issue], {
      get: (target, key, receiver) =>
        key === 'length' ? 0 : (Reflect.get(target, key, receiver) as unknown)
    })

    const error = thrownBy(() => new BymaxConfigValidationError(claimed as never))

    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: issues claims no entries but lists some'
    )
  })
})

describe('which own property names of an array that claims no entries are entries', () => {
  /** A list that claims no entries and answers one own, enumerable property under `key`. */
  const listing = (key: string): unknown =>
    new Proxy([] as unknown[], {
      get: (target, name, receiver) =>
        name === 'length' ? 0 : (Reflect.get(target, name, receiver) as unknown),
      ownKeys: () => ['length', key],
      getOwnPropertyDescriptor: (target, name) =>
        name === 'length'
          ? Reflect.getOwnPropertyDescriptor(target, name)
          : { value: issue, enumerable: true, configurable: true }
    })

  it.each(['0', '1', '10', '4294967294'])('refuses the index %s', (key) => {
    const error = thrownBy(() => new BymaxConfigValidationError(listing(key) as never))

    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: issues claims no entries but lists some'
    )
  })

  it.each([
    '4294967295',
    '4294967296',
    '99999999999',
    '00',
    '01',
    '-1',
    '1.5',
    '1e3',
    ' 1',
    '0x1',
    'Infinity',
    'NaN',
    '',
    'note'
  ])('accepts %j, which is no array index', (key) => {
    expect(new BymaxConfigValidationError(listing(key) as never).issues).toEqual([])
  })
})

describe('a list or an entry whose Symbol.iterator throws', () => {
  it('is read by index, so the iterator is never asked for', () => {
    const list = Object.defineProperty([issue], Symbol.iterator, {
      get: () => {
        throw new Error('iterator')
      }
    })
    const entry = Object.defineProperty({ ...issue }, Symbol.iterator, {
      get: () => {
        throw new Error('iterator')
      }
    })

    expect(new BymaxConfigValidationError(list as never).issues).toEqual([issue])
    expect(new BymaxConfigValidationError([entry] as never).issues).toEqual([issue])
  })
})
