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
  /**
   * Bind the accessor to the frozen configuration object.
   *
   * @param config - The validated, deep-frozen config injected via {@link BYMAX_CONFIG}.
   */
  public constructor(@Inject(BYMAX_CONFIG) private readonly config: TConfig) {}

  /**
   * Read a leaf value by its `namespace.leaf` dot-path.
   *
   * The return type is inferred from the path, so `get('server.port')` is typed
   * `number` with no cast. Never throws for a declared path: validation ran once
   * at bootstrap, so the leaf is guaranteed present.
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
   * Splits on the single dot dictated by the `namespace.leaf` convention and
   * walks the two fixed levels via `Map` lookups (rather than dynamic bracket
   * indexing) so no non-literal property sink is introduced. The structural
   * casts bridge the generic config to a two-level record; the namespace is
   * guaranteed to exist because a valid {@link Path} always names a declared one.
   *
   * @param path - The declared two-level dot-path.
   * @returns The leaf value as `unknown`, or `undefined` when the leaf is unset.
   */
  private resolve(path: Path<TConfig>): unknown {
    const dotPath = String(path)
    const separatorIndex = dotPath.indexOf('.')
    const namespace = dotPath.slice(0, separatorIndex)
    const leaf = dotPath.slice(separatorIndex + 1)
    const namespaces = new Map(Object.entries(this.config as Record<string, unknown>))
    const namespaceValue = namespaces.get(namespace) as Record<string, unknown>
    return new Map(Object.entries(namespaceValue)).get(leaf)
  }
}
