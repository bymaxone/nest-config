/**
 * Unit tests for how the error copies the list of issues it is handed.
 *
 * Layer: unit.
 * Goal: prove the list is copied by index with its length read once and capped, that a list which
 * answers nothing to the iterator still yields every issue, that a list claiming no entries while it
 * lists some is refused, and that each field of an issue is read once.
 * Mocks: none. The host's lists are written for the case.
 */

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
      Object.assign(Object.create(Object.assign([], { [Symbol.iterator]: () => [].values() })), {
        0: issue,
        length: 1
      }) as unknown
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

  it.each([
    ['a length that is not a number', { length: '1', 0: issue }],
    ['a fractional length', { length: 1.5, 0: issue }],
    ['a negative length', { length: -1 }],
    ['no length', {}]
  ])('refuses %s', (_name, list) => {
    const error = thrownBy(() => new BymaxConfigValidationError(list as never))

    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe(
      'BymaxConfigValidationError: issues must be a list with a whole-number length'
    )
  })

  it('refuses a list longer than the cap before it reads an entry', () => {
    let entryReads = 0
    const huge = new Proxy(
      { length: 10_001 },
      {
        get: (target, key) => {
          if (key !== 'length') entryReads += 1
          return Reflect.get(target, key) as unknown
        }
      }
    )

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
      new Proxy(
        { length: 0 },
        {
          ownKeys: () => {
            throw hostError
          }
        }
      )
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
