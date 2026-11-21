/**
 * @fileoverview ConfigService: the typed, injectable accessor over the frozen
 * BYMAX_CONFIG object. It is the recommended consumption surface for the
 * validated configuration, offering compile-time dot-path inference (`get`),
 * the frozen root (`getAll`), and a declared-path presence check (`has`). The
 * config is injected explicitly through the module-local Symbol token, so the
 * service carries no decorator metadata and needs no `emitDecoratorMetadata`.
 * @layer Service
 */

import { Inject, Injectable } from '@nestjs/common'

import { BYMAX_CONFIG } from './config.tokens'
import { guarded } from './env-validator'
import type { Path, PathValue } from './types'

/**
 * Typed accessor over the validated, deep-frozen configuration object.
 *
 * Wraps the frozen config registered under {@link BYMAX_CONFIG} and exposes it
 * through dot-path access limited to the two-level `namespace.leaf` convention.
 * Because validation completed at bootstrap, every declared leaf either passed
 * validation or received its default (or the process never started), so `get`
 * never throws for a declared path.
 *
 * @typeParam TConfig - The parsed, two-level configuration object type.
 * @example
 * ```typescript
 * @Injectable()
 * export class InvoiceService {
 *   public constructor(
 *     @Inject(ConfigService) private readonly config: ConfigService<AppConfig>,
 *   ) {}
 *
 *   public connect(): Connection {
 *     return connect(this.config.get('database.url'), this.config.get('server.port'));
 *   }
 * }
 * ```
 */
@Injectable()
export class ConfigService<TConfig> {
  /**
   * The frozen configuration root.
   *
   * Held in an ECMAScript private field rather than a TypeScript `private`
   * property: `private` is erased at runtime, leaving an enumerable own
   * property that `JSON.stringify`, `Object.entries`, object spread and
   * `util.inspect` all walk into. This object aggregates every secret the
   * application declared, so any code that incidentally serializes the
   * injected service — a logger that renders its arguments, an observability
   * SDK capturing the scope of a thrown error, a stray `console.log` — would
   * emit them in plaintext. A `#` field is unreachable to all of those.
   */
  readonly #config: Readonly<TConfig>

  /**
   * Precomputed `namespace.leaf` to value lookup, built once at construction.
   *
   * An ECMAScript private field for the same reason as the config root: it
   * holds the same values, flattened.
   */
  readonly #leaves: ReadonlyMap<string, unknown>

  readonly #namespaces: readonly string[]

  /**
   * Bind the accessor to the frozen configuration object.
   *
   * Builds a flat `namespace.leaf` lookup once so `get`/`has` are constant-time
   * and never rebuild a map per call. Iteration over entries (rather than dynamic
   * bracket indexing) avoids introducing a non-literal property sink.
   *
   * The configuration must be a plain object with own fields, as the module provides: its own property
   * names are read once, here, so a Proxy that lists none yields an empty configuration. A namespace that
   * is a function, a string or an array holds no leaves.
   *
   * @param config - The validated, deep-frozen config injected via {@link BYMAX_CONFIG}.
   */
  public constructor(@Inject(BYMAX_CONFIG) config: Readonly<TConfig>) {
    this.#config = config
    // An injected object is the host's to supply, so reading it is refused like any other host read.
    const snapshot = guarded('reading the configuration', () => {
      const leaves = new Map<string, unknown>()
      const namespaces: string[] = []
      const root = config as Record<string, unknown>
      for (const namespace of Object.getOwnPropertyNames(root)) {
        // The root carries its serializer as a non-enumerable `toJSON` function; it is not a namespace.
        const descriptor = Object.getOwnPropertyDescriptor(root, namespace)
        if (
          namespace === 'toJSON' &&
          descriptor?.enumerable === false &&
          typeof descriptor.value === 'function'
        )
          continue
        namespaces.push(namespace)
        const value = Reflect.get(root, namespace) as Record<string, unknown> | null
        // A namespace that is a function, a string or an array holds no leaves: the
        // own names of those are `name`, `length` and indices, which no schema declared.
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
        for (const leaf of Object.getOwnPropertyNames(value)) {
          leaves.set(`${namespace}.${leaf}`, Reflect.get(value, leaf))
        }
      }
      return { leaves, namespaces }
    })
    this.#leaves = snapshot.leaves
    this.#namespaces = snapshot.namespaces
  }

  /**
   * Describe the service for serialization without disclosing any value.
   *
   * `JSON.stringify` on an instance would otherwise yield `{}`, which reads as
   * a bug rather than as a deliberate omission. Returning the namespace names
   * keeps the output useful for debugging while the values stay unreachable.
   *
   * @returns The declared namespace names, never their contents.
   * @example
   * ```typescript
   * JSON.stringify(config); // {"service":"ConfigService","namespaces":["server","database"]}
   * ```
   */
  public toJSON(): { readonly service: string; readonly namespaces: readonly string[] } {
    return {
      service: 'ConfigService',
      namespaces: [...this.#namespaces]
    }
  }

  /**
   * Read a leaf value by its `namespace.leaf` dot-path.
   *
   * The return type is inferred from the path, so `get('server.port')` is typed
   * `number` with no cast. Never throws for a declared path: validation ran once
   * at bootstrap. An optional leaf without a default may still resolve to
   * `undefined` when its type includes it.
   *
   * @typeParam TPath - A declared path drawn from {@link Path}<TConfig>.
   * @param path - The two-level dot-path to resolve.
   * @returns The leaf value, typed as {@link PathValue}<TConfig, TPath>.
   * @example
   * ```typescript
   * const port = config.get('server.port'); // number
   * ```
   */
  public get<TPath extends Path<TConfig>>(path: TPath): PathValue<TConfig, TPath> {
    return this.resolve(path) as PathValue<TConfig, TPath>
  }

  /**
   * Return the whole validated configuration as its deep-frozen root.
   *
   * Yields the same frozen reference the module registered, fully typed for
   * arbitrary depth, which is the escape hatch for nesting deeper than the
   * two-level dot-path inference covers.
   *
   * @returns The frozen configuration root.
   * @example
   * ```typescript
   * const everything = config.getAll(); // Readonly<AppConfig>
   * ```
   */
  public getAll(): Readonly<TConfig> {
    return this.#config
  }

  /**
   * Report whether a declared path resolves to a defined value.
   *
   * Returns `false` when the leaf resolved to `undefined` (an optional leaf
   * without a default), distinguishing "declared but unset" from "declared and
   * set" without a truthiness pitfall on falsy values such as `0` or `''`.
   *
   * @param path - The two-level dot-path to check.
   * @returns True when the resolved value is not `undefined`.
   * @example
   * ```typescript
   * if (config.has('redis.url')) connectRedis(config.get('redis.url'));
   * ```
   */
  public has(path: Path<TConfig>): boolean {
    return this.resolve(path) !== undefined
  }

  /**
   * Resolve a two-level dot-path to its raw leaf value.
   *
   * Looks the path up in the precomputed `namespace.leaf` map, so an unset leaf
   * (or, defensively, an unexpected path) yields `undefined` instead of throwing.
   *
   * @param path - The declared two-level dot-path.
   * @returns The leaf value as `unknown`, or `undefined` when the leaf is unset.
   */
  private resolve(path: Path<TConfig>): unknown {
    return this.#leaves.get(String(path))
  }
}
