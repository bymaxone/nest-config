/**
 * @fileoverview Pins how a path segment becomes a SCREAMING_SNAKE_CASE variable name.
 * Layer: unit (derivation); the segment converter is private, so it is observed through
 * `resolveSourceNames`.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { resolveSourceNames } from './source-mapping'

/**
 * The converter as it was written with two capturing regexes. It is the reference the
 * zero-width form must reproduce on every segment, not a second implementation to keep.
 */
function referenceScreamingSnake(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
}

/**
 * The words `resolveSourceNames` derives for each segment, taken as leaf keys of one
 * namespace so a whole batch costs one call, and returned in input order: an object lists
 * integer-like keys first, so the bindings themselves are not in that order. The `N_` is stripped.
 */
function derivedWords(segments: readonly string[]): string[] {
  const leaves = Object.fromEntries(segments.map((segment) => [segment, z.string()]))
  const schema = defineEnv({ n: z.object(leaves) })
  const byPath = new Map(
    resolveSourceNames(schema).map(({ path, variable }) => [path, variable.replace(/^N_/, '')])
  )
  return segments.map((segment) => byPath.get(`n.${segment}`) ?? '<missing>')
}

describe('segment to SCREAMING_SNAKE_CASE', () => {
  const CASES: ReadonlyArray<readonly [string, string]> = [
    ['database', 'DATABASE'],
    ['httpServer', 'HTTP_SERVER'],
    ['HTTPServer', 'HTTP_SERVER'],
    ['URLPath', 'URL_PATH'],
    ['A', 'A'],
    ['ABC', 'ABC'],
    ['aB', 'A_B'],
    ['already_snake', 'ALREADY_SNAKE'],
    ['http2Server', 'HTTP2_SERVER'],
    ['aBCd', 'A_B_CD'],
    ['ABCd', 'AB_CD'],
    ['ABCDe', 'ABC_DE'],
    ['xHTTPServer', 'X_HTTP_SERVER']
  ]

  it.each(CASES)('derives %s as %s', (segment, expected) => {
    /**
     * Scenario: representative camelCase, acronym and snake segments.
     * Expected: each yields its documented variable form.
     */
    expect(derivedWords([segment])).toEqual([expected])
    expect(referenceScreamingSnake(segment)).toBe(expected)
  })

  it('agrees with the two-regex reference on every short segment over the relevant alphabet', () => {
    /**
     * Scenario: every string up to seven characters over lowercase, uppercase, a digit and an
     * underscore, which covers each boundary the converter distinguishes.
     * Expected: the derived name equals the reference on all of them.
     */
    const alphabet = ['a', 'B', 'C', '1', '_']
    let level: string[] = ['']
    for (let length = 1; length <= 7; length += 1) {
      level = level.flatMap((prefix) => alphabet.map((char) => prefix + char))
      expect(derivedWords(level)).toEqual(level.map(referenceScreamingSnake))
    }
  })
})
