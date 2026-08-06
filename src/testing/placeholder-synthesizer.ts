/**
 * @fileoverview Deterministic placeholder synthesizer for the testing subpath.
 * Walks a two-level `defineEnv` schema and produces a complete flat source
 * record whose values satisfy every declared constraint (string min/max/exact
 * lengths, url and email formats, integer ranges, enum membership, booleans)
 * without inventing meaningful secrets: placeholders are obvious repeated filler
 * or fixed tokens. Defaulted and optional leaves are omitted so the schema
 * decides their value; nullable leaves are unwrapped to a concrete value. The
 * walk reads only Zod v4 schema internals (`_zod.def`) and never touches
 * `process.env`, a clock, or any source of randomness, so two runs are
 * byte-for-byte identical. This module is internal and is not re-exported from
 * the testing barrel.
 * @layer Utility
 */

import { resolveSourceNames } from '@bymax-one/nest-config/internal'
import type { EnvLeaf, EnvSchema, EnvShape } from '@bymax-one/nest-config/internal'

/** A single filler character, repeated to build clearly-placeholder strings. */
const FILLER_CHARACTER = 'a'

/** Base placeholder URL for `url`-format leaves; a valid, obviously-fake host. */
const PLACEHOLDER_URL = 'https://placeholder.local'

/** Domain used to build placeholder email addresses. */
const PLACEHOLDER_EMAIL_DOMAIN = '@placeholder.local'

/** Deterministic in-type value for an unconstrained numeric leaf. */
const DEFAULT_NUMBER = 1

/** Minimum length used for a string leaf that declares no length constraint. */
const DEFAULT_STRING_LENGTH = 1

/** Fixed, coercible placeholder for boolean leaves. */
const PLACEHOLDER_BOOLEAN = 'true'

/**
 * Typed view over a single Zod v4 check definition.
 *
 * The runtime check object only carries the fields relevant to its `check`
 * discriminant (a `min_length` check has `minimum`, a `greater_than` check has
 * `value` and `inclusive`). This view types them all as present; each is read
 * only under the matching `check` branch, so the assertion is sound.
 */
interface CheckDefinition {
  readonly check: string
  readonly minimum: number
  readonly maximum: number
  readonly length: number
  readonly value: number
  readonly inclusive: boolean
}

/** One check attached to a leaf, exposing its definition under `_zod.def`. */
interface CheckWrapper {
  readonly _zod: { readonly def: CheckDefinition }
}

/**
 * Typed view over the Zod v4 leaf definition the synthesizer reads.
 *
 * `innerType` and `entries` exist only on wrapper and enum leaves respectively
 * and are read only under those branches; `format` and `checks` are genuinely
 * optional (a plain string declares neither).
 */
interface LeafDefinition {
  readonly type: string
  readonly format?: string
  readonly checks?: readonly CheckWrapper[]
  readonly innerType: EnvLeaf
  readonly entries: Readonly<Record<string, string | number>>
}

/** A leaf schema surfaced through its Zod v4 internals. */
interface LeafInternals {
  readonly _zod: { readonly def: LeafDefinition }
}

/**
 * Read a leaf's Zod v4 definition object.
 *
 * Zod stores a schema's definition under the `_zod.def` internal, which is not
 * part of the public TypeScript surface; this is the single, documented boundary
 * where that runtime shape is asserted so the rest of the module stays typed.
 *
 * @param leaf - Any leaf schema produced within a `defineEnv` namespace.
 * @returns The internal definition describing the leaf's type and constraints.
 */
function readDef(leaf: EnvLeaf): LeafDefinition {
  return (leaf as unknown as LeafInternals)._zod.def
}

/**
 * Return a leaf definition's checks, normalizing an absent list to empty.
 *
 * Some leaf kinds expose no `checks` array at all (a plain string), so this
 * single accessor keeps the empty case in one place for both string and number
 * synthesis.
 *
 * @param def - The leaf definition to read.
 * @returns The declared checks, or an empty list when none are present.
 */
function checksOf(def: LeafDefinition): readonly CheckWrapper[] {
  return def.checks ?? []
}

/**
 * Extract the string length bounds declared on a leaf definition.
 *
 * @param def - The string leaf definition.
 * @returns The minimum, maximum, and exact length when each is declared.
 */
function readStringLengths(def: LeafDefinition): { min: number; max: number; exact?: number } {
  let min = 0
  let max = Number.POSITIVE_INFINITY
  let exact: number | undefined
  for (const wrapper of checksOf(def)) {
    const check = wrapper._zod.def
    if (check.check === 'min_length') min = check.minimum
    if (check.check === 'max_length') max = check.maximum
    if (check.check === 'length_equals') exact = check.length
  }
  return exact === undefined ? { min, max } : { min, max, exact }
}

/** The scheme of a synthesized URL; `http` keeps the shortest value small. */
const URL_PREFIX = 'http://'

/** The fixed tail of a synthesized email: `<local>@a.lo`. */
const EMAIL_SUFFIX = '@a.lo'

/**
 * Clamp a preferred length into the declared `[min, max]` window.
 *
 * @param preferred - The length to use when it already fits the bounds.
 * @param min - The declared minimum length.
 * @param max - The declared maximum length.
 * @returns The preferred length pulled inside the bounds.
 */
function clampLength(preferred: number, min: number, max: number): number {
  return Math.min(Math.max(preferred, min), max)
}

/**
 * Build a syntactically valid URL of the requested character length.
 *
 * Uses an `http://<filler>` host so the shortest value (`http://a`) is eight
 * characters, matching the shortest URL the validator accepts.
 *
 * @param target - The desired total length.
 * @returns A URL shaped `http://<filler>` sized to `target`.
 */
function urlOfLength(target: number): string {
  const hostFill = Math.max(target - URL_PREFIX.length, 1)
  return `${URL_PREFIX}${FILLER_CHARACTER.repeat(hostFill)}`
}

/**
 * Build a syntactically valid email of the requested character length.
 *
 * @param target - The desired total length.
 * @returns An address shaped `<filler>@a.lo` sized to `target`.
 */
function emailOfLength(target: number): string {
  const localFill = Math.max(target - EMAIL_SUFFIX.length, 1)
  return `${FILLER_CHARACTER.repeat(localFill)}${EMAIL_SUFFIX}`
}

/**
 * Build a valid placeholder URL that honors the declared length bounds.
 *
 * Keeps the readable canonical placeholder when it already fits `[min, max]`;
 * otherwise resizes to the exact length, or to the bound-clamped length, while
 * staying a syntactically valid URL.
 *
 * @param lengths - The declared min, max, and optional exact lengths.
 * @returns A valid placeholder URL within the declared bounds.
 */
function synthesizeUrl(lengths: { min: number; max: number; exact?: number }): string {
  if (
    lengths.exact === undefined &&
    PLACEHOLDER_URL.length >= lengths.min &&
    PLACEHOLDER_URL.length <= lengths.max
  ) {
    return PLACEHOLDER_URL
  }
  return urlOfLength(lengths.exact ?? clampLength(PLACEHOLDER_URL.length, lengths.min, lengths.max))
}

/**
 * Build a valid placeholder email that honors the declared length bounds.
 *
 * Keeps the readable canonical address when it fits `[min, max]`; otherwise
 * resizes to the exact or bound-clamped length while staying a valid email.
 *
 * @param lengths - The declared min, max, and optional exact lengths.
 * @returns A valid placeholder email within the declared bounds.
 */
function synthesizeEmail(lengths: { min: number; max: number; exact?: number }): string {
  const canonical = `${FILLER_CHARACTER}${PLACEHOLDER_EMAIL_DOMAIN}`
  if (
    lengths.exact === undefined &&
    canonical.length >= lengths.min &&
    canonical.length <= lengths.max
  ) {
    return canonical
  }
  return emailOfLength(lengths.exact ?? clampLength(canonical.length, lengths.min, lengths.max))
}

/**
 * Build a plain filler string honoring exact, minimum, and maximum lengths.
 *
 * @param lengths - The declared minimum, maximum, and optional exact length.
 * @returns Repeated filler sized within the declared bounds.
 */
function synthesizePlainString(lengths: { min: number; max: number; exact?: number }): string {
  if (lengths.exact !== undefined) return FILLER_CHARACTER.repeat(lengths.exact)
  const target = Math.max(lengths.min, DEFAULT_STRING_LENGTH)
  // Stryker disable next-line EqualityOperator: equivalent — `>` and `>=` choose a different branch only when `target === lengths.max`, and in that case both branches evaluate to the same number, so the filler length is identical.
  const bounded = target > lengths.max ? lengths.max : target
  return FILLER_CHARACTER.repeat(bounded)
}

/**
 * Synthesize a placeholder for a string leaf, respecting its format and lengths.
 *
 * @param def - The string leaf definition.
 * @returns A constraint-compliant placeholder string.
 */
function synthesizeString(def: LeafDefinition): string {
  const lengths = readStringLengths(def)
  if (def.format === 'url') return synthesizeUrl(lengths)
  if (def.format === 'email') return synthesizeEmail(lengths)
  return synthesizePlainString(lengths)
}

/**
 * Choose an in-range number from the resolved inclusive bounds.
 *
 * @param lower - The inclusive lower bound, when declared.
 * @param upper - The inclusive upper bound, when declared.
 * @returns The bounded midpoint, a present bound, or the fixed default.
 */
function selectNumber(bounds: {
  lower?: number
  upper?: number
  lowerExclusive: boolean
  upperExclusive: boolean
  integer: boolean
}): number {
  const { lower, upper, integer } = bounds
  if (lower !== undefined && upper !== undefined) {
    if (integer) {
      // Derive the admissible integer window from the (possibly fractional)
      // bounds, respecting exclusivity, so the chosen integer is always inside
      // the range: gt(0).max(1) -> [1,1]; min(1.1).max(2.2) -> [2,2].
      const lo = bounds.lowerExclusive ? Math.floor(lower) + 1 : Math.ceil(lower)
      const hi = bounds.upperExclusive ? Math.ceil(upper) - 1 : Math.floor(upper)
      return Math.floor((lo + hi) / 2)
    }
    // Floats: the midpoint of any interval is strictly inside it, so it
    // satisfies inclusive and exclusive bounds alike without stepping.
    return (lower + upper) / 2
  }
  // With one bound only, step past an exclusive edge (there is no opposite bound
  // to cross); a fractional step keeps a float leaf strictly beyond its edge.
  if (lower !== undefined) return bounds.lowerExclusive ? lower + (integer ? 1 : 0.5) : lower
  if (upper !== undefined) return bounds.upperExclusive ? upper - (integer ? 1 : 0.5) : upper
  return DEFAULT_NUMBER
}

/**
 * Synthesize a placeholder for a number leaf within its declared range.
 *
 * Reads the greater-than/less-than bounds and whether the leaf is an integer,
 * then picks an in-range value: the midpoint for a two-sided range (floored for
 * integers), or a value stepped just past a single exclusive edge.
 *
 * @param def - The number leaf definition.
 * @returns The string form of a constraint-compliant number.
 */
function synthesizeNumber(def: LeafDefinition): string {
  const bounds = { lowerExclusive: false, upperExclusive: false, integer: false } as {
    lower?: number
    upper?: number
    lowerExclusive: boolean
    upperExclusive: boolean
    integer: boolean
  }
  for (const wrapper of checksOf(def)) {
    const check = wrapper._zod.def
    if (check.check === 'greater_than') {
      bounds.lower = check.value
      bounds.lowerExclusive = check.inclusive !== true
    }
    if (check.check === 'less_than') {
      bounds.upper = check.value
      bounds.upperExclusive = check.inclusive !== true
    }
    if (check.check === 'number_format') bounds.integer = true
  }
  return String(selectNumber(bounds))
}

/**
 * Synthesize a placeholder for an enum leaf as its first declared member.
 *
 * @param def - The enum leaf definition.
 * @returns The string form of the first declared enum member.
 */
function synthesizeEnum(def: LeafDefinition): string {
  const [first] = Object.values(def.entries)
  return String(first)
}

/**
 * Synthesize a placeholder value for one leaf, or omit it.
 *
 * Defaulted and optional leaves are omitted (returning `undefined`) so the
 * schema resolves their value; nullable leaves recurse into the inner type so a
 * present value is supplied. Leaf kinds beyond the documented set fall back to a
 * generic filler rather than aborting the walk.
 *
 * @param leaf - The leaf schema to synthesize.
 * @returns The placeholder string, or `undefined` to omit the leaf.
 */
function synthesizeLeaf(leaf: EnvLeaf): string | undefined {
  const def = readDef(leaf)
  switch (def.type) {
    case 'default':
    case 'optional':
      return undefined
    case 'nullable':
      return synthesizeLeaf(def.innerType)
    case 'string':
      return synthesizeString(def)
    case 'number':
      return synthesizeNumber(def)
    case 'boolean':
      return PLACEHOLDER_BOOLEAN
    case 'enum':
      return synthesizeEnum(def)
    default:
      return FILLER_CHARACTER
  }
}

/**
 * Synthesize a complete flat source record for a `defineEnv` schema.
 *
 * Walks every declared leaf, synthesizing a constraint-compliant placeholder for
 * each and omitting defaulted and optional leaves, then renames the nested paths
 * to their resolved source-variable names through the shared source mapping so
 * the record can be fed straight into the production validator. The output is
 * deterministic: identical schemas always produce identical records.
 *
 * @typeParam TShape - The two-level schema shape.
 * @param schema - A schema produced by `defineEnv`.
 * @returns A flat record of resolved variable names to placeholder values.
 * @example
 * ```typescript
 * const schema = defineEnv({ database: z.object({ url: z.url() }) });
 * synthesizePlaceholderSource(schema);
 * // => { DATABASE_URL: 'https://placeholder.local' }
 * ```
 */
export function synthesizePlaceholderSource<TShape extends EnvShape = EnvShape>(
  schema: EnvSchema<TShape>
): Record<string, string> {
  const valueByPath = new Map<string, string>()
  for (const [namespace, namespaceSchema] of Object.entries(schema.shape)) {
    for (const [leafKey, leafSchema] of Object.entries(namespaceSchema.shape)) {
      const value = synthesizeLeaf(leafSchema)
      if (value !== undefined) valueByPath.set(`${namespace}.${leafKey}`, value)
    }
  }
  // Null-prototype object so a meta({ env }) override named `__proto__` (or
  // similar) becomes a plain own key instead of mutating Object.prototype.
  const source = Object.create(null) as Record<string, string>
  for (const binding of resolveSourceNames(schema)) {
    const value = valueByPath.get(binding.path)
    if (value !== undefined) source[binding.variable] = value
  }
  return source
}
