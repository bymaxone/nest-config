/**
 * Unit tests for the text an issue carries.
 *
 * Layer: unit.
 * Goal: prove that the variable, path and message of every issue are bounded and cannot rewrite or
 * flood a log line: each character that changes how a line reads is written as an escape, and a
 * field longer than the bound is cut with an ellipsis, never in the middle of an escape.
 * Mocks: none.
 */

import { BymaxConfigValidationError, ConfigErrorCode } from './errors'

/** An issue whose three text fields are the given text. */
function issueOf(text: string) {
  return { path: text, variable: text, code: ConfigErrorCode.INVALID, message: text }
}

/** The message field of the single issue an error built from `text` carries. */
function messageOf(text: string): string {
  const error = new BymaxConfigValidationError([issueOf(text)])
  return error.issues[0]?.message as string
}

const ESCAPED: ReadonlyArray<readonly [string, string]> = [
  ['U+0000', '\u0000'],
  ['LF', '\n'],
  ['CR', '\r'],
  ['U+001F', '\u001f'],
  ['ESC', '\u001b'],
  ['DEL', '\u007f'],
  ['NEL U+0085', '\u0085'],
  ['U+009F', '\u009f'],
  ['soft hyphen U+00AD', '\u00ad'],
  ['U+061C', '\u061c'],
  ['U+200B', '\u200b'],
  ['U+200C', '\u200c'],
  ['U+200D', '\u200d'],
  ['U+200E', '\u200e'],
  ['U+200F', '\u200f'],
  ['U+2028', '\u2028'],
  ['U+2029', '\u2029'],
  ['U+202A', '\u202a'],
  ['U+202B', '\u202b'],
  ['U+202C', '\u202c'],
  ['U+202D', '\u202d'],
  ['U+202E', '\u202e'],
  ['U+2060', '\u2060'],
  ['U+2061', '\u2061'],
  ['U+2064', '\u2064'],
  ['U+2066', '\u2066'],
  ['U+2067', '\u2067'],
  ['U+2068', '\u2068'],
  ['U+2069', '\u2069'],
  ['U+206A', '\u206a'],
  ['U+206F', '\u206f'],
  ['BOM U+FEFF', '\ufeff']
]

const LEFT_ALONE: ReadonlyArray<readonly [string, string]> = [
  ['space U+0020', ' '],
  ['tilde U+007E', '~'],
  ['U+00A0', '\u00a0'],
  ['U+00AC', '\u00ac'],
  ['U+00AE', '\u00ae'],
  ['U+061B', '\u061b'],
  ['U+061D', '\u061d'],
  ['U+200A', '\u200a'],
  ['U+2010', '\u2010'],
  ['U+2027', '\u2027'],
  ['U+202F', '\u202f'],
  ['U+205F', '\u205f'],
  ['U+2070', '\u2070'],
  ['U+FEFE', '\ufefe'],
  ['an accented letter', 'é'],
  ['an emoji', '😀']
]

describe('the text of an issue', () => {
  it.each(ESCAPED)(
    'writes %s as an escape in the variable, the path and the message',
    (_name, character) => {
      /** Every field and the report spell the code point out in place of the character. */
      const code = (character.codePointAt(0) as number).toString(16).padStart(4, '0')
      const error = new BymaxConfigValidationError([issueOf(`a${character}b`)])
      const [issue] = error.issues

      expect(issue?.variable).toBe(`a\\u${code}b`)
      expect(issue?.path).toBe(`a\\u${code}b`)
      expect(issue?.message).toBe(`a\\u${code}b`)
      expect(error.message).toContain(`a\\u${code}b`)
    }
  )

  it.each(LEFT_ALONE)('leaves %s as written', (_name, character) => {
    /** The neighbours of the escaped ranges, and ordinary text, are not touched. */
    expect(messageOf(`a${character}b`)).toBe(`a${character}b`)
  })

  it('keeps a field of exactly 200 characters whole', () => {
    expect(messageOf('a'.repeat(200))).toBe('a'.repeat(200))
  })

  it('cuts a field of 201 characters to 200 and an ellipsis', () => {
    expect(messageOf('a'.repeat(201))).toBe(`${'a'.repeat(200)}…`)
  })

  it('bounds the report as well as the issue', () => {
    /** A message of 5000 characters adds at most the bound plus the ellipsis to the report line. */
    const error = new BymaxConfigValidationError([issueOf('x'.repeat(5000))])

    expect(error.message.length).toBeLessThan(800)
  })

  it('keeps an escape that ends exactly at the bound', () => {
    expect(messageOf(`${'a'.repeat(194)}\u001b`)).toBe(`${'a'.repeat(194)}\\u001b`)
  })

  it('never cuts an escape in two', () => {
    /** One character short of room for the six-character escape: it is left out whole. */
    expect(messageOf(`${'a'.repeat(195)}\u001b`)).toBe(`${'a'.repeat(195)}…`)
  })

  it('never splits a surrogate pair at the bound', () => {
    expect(messageOf(`${'a'.repeat(199)}😀`)).toBe(`${'a'.repeat(199)}…`)
  })

  it('counts an escape by its written length', () => {
    /** Thirty-three escapes are 198 characters; a thirty-fourth would make 204. */
    expect(messageOf('\u001b'.repeat(40))).toBe(`${'\\u001b'.repeat(33)}…`)
  })

  it('writes the code point in lower case, four digits wide', () => {
    expect(messageOf('\u200b')).toBe('\\u200b')
    expect(messageOf('\u0001')).toBe('\\u0001')
  })
})
