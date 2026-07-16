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
  private readonly config: Readonly<TConfig>

  /** Precomputed `namespace.leaf` to value lookup, built once at construction. */
  private readonly leaves: ReadonlyMap<string, unknown>

  /**
   * Bind the accessor to the frozen configuration object.
   *
   * Builds a flat `namespace.leaf` lookup once so `get`/`has` are constant-time
   * and never rebuild a map per call. Iteration over entries (rather than dynamic
   * bracket indexing) avoids introducing a non-literal property sink.
   *
   * @param config - The validated, deep-frozen config injected via {@link BYMAX_CONFIG}.
   */
  public constructor(@Inject(BYMAX_CONFIG) config: Readonly<TConfig>) {
    this.config = config
    const leaves = new Map<string, unknown>()
    for (const [namespace, value] of Object.entries(config as Record<string, unknown>)) {
      for (const [leaf, leafValue] of Object.entries(value as Record<string, unknown>)) {
        leaves.set(`${namespace}.${leaf}`, leafValue)
      }
    }
    this.leaves = leaves
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
    return this.config
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
    return this.leaves.get(String(path))
  }
}
