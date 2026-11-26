/**
 * @fileoverview The generated message of a failed constraint. It is built from the structural fields of a
 * Zod issue, which a rule can fill itself when it raises one, so it is withheld when a field holds the
 * value of the issue's variable or is another variable's value whole.
 * @layer Utility
 */

import type { z } from 'zod'

import { holds, mapGet, mapKeys, some } from './captured'

/** A single issue as produced by a failed Zod parse. */
type ZodValidationIssue = z.ZodError['issues'][number]

/** Renders one field of an issue for the message. */
type Show = (field: unknown) => string

/**
 * Describe a Zod issue by its structural constraint fields (expected type, bounds, format, enum options).
 * Every field that reaches the text goes through `show`, so the text searched is the text printed.
 *
 * @param issue - The issue.
 * @param show - Renders a field.
 * @returns The expected constraint.
 */
function describeConstraint(issue: ZodValidationIssue, show: Show): string {
  switch (issue.code) {
    case 'invalid_type':
      return `invalid value (expected: ${show(issue.expected)})`
    case 'invalid_format':
      return `invalid format (expected: ${show(issue.format)})`
    case 'invalid_value':
      return `invalid value (expected one of: ${show(issue.values.map(show).join(', '))})`
    case 'too_small':
      return issue.origin === 'string'
        ? `too short (expected: string, minimum ${show(issue.minimum)} characters)`
        : `out of range (expected: ${show(issue.origin)} >= ${show(issue.minimum)})`
    case 'too_big':
      return issue.origin === 'string'
        ? `too long (expected: string, maximum ${show(issue.maximum)} characters)`
        : `out of range (expected: ${show(issue.origin)} <= ${show(issue.maximum)})`
    default:
      return 'invalid value'
  }
}

/**
 * Whether a field repeats a source value: the value of the issue's own variable anywhere inside its
 * rendering, or a field that is another variable's value whole. Source values are strings and that
 * comparison is strict, so a numeric bound is never taken for a neighbour's value. Another variable's
 * value is not searched for inside a field, because a short one is part of many constraints.
 *
 * @param field - The field as the issue holds it.
 * @param text - The field as it is printed.
 * @param own - The value of the issue's variable, or undefined when it has none.
 * @param source - The source values by variable.
 * @returns True when the field must not be printed.
 */
function repeatsSource(
  field: unknown,
  text: string,
  own: string | undefined,
  source: ReadonlyMap<string, string | undefined>
): boolean {
  // Every text holds the empty string, so an empty value is not searched for.
  if (own && holds(text, own)) return true
  return some(mapKeys(source), (variable) => mapGet(source, variable) === field)
}

/**
 * The generated message of an issue, which states the expected constraint.
 *
 * @param issue - The Zod issue.
 * @param own - The value of the issue's variable, or undefined for a rule that names no leaf.
 * @param source - The source values by variable.
 * @returns The constraint, or `invalid value` when a field is withheld.
 */
export function constraintMessage(
  issue: ZodValidationIssue,
  own: string | undefined,
  source: ReadonlyMap<string, string | undefined>
): string {
  let repeats = false
  const message = describeConstraint(issue, (field) => {
    const text = String(field)
    if (repeatsSource(field, text, own, source)) repeats = true
    return text
  })
  return repeats ? 'invalid value' : message
}
