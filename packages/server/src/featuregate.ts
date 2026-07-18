import type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationResult,
  FeatureGateFlags,
  FeatureGateFlagValue,
  FeatureGateJsonObject,
} from "@featuregate/evaluation";
import { evaluateFlag } from "@featuregate/evaluation";

import { FeatureGateConfigurationError } from "./errors";
import { RemoteSnapshotLoader } from "./remote-snapshot";
import type { FeatureGateRefreshResult } from "./types";

const DEFAULT_API_BASE_URL = "https://api.featuregate.dev";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;

interface FeatureGateConfiguration {
  /** Base URL for the FeatureGate API. */
  apiBaseUrl?: string;
  /** Fetch implementation used to load snapshots. Defaults to the runtime's global fetch. */
  fetch?: typeof fetch;
  /** An optional in-memory snapshot used before remote configuration is loaded. */
  flags?: FeatureGateFlags;
  /** How often to refresh the snapshot. Set to `0` to disable automatic polling. */
  pollIntervalMs?: number;
  /** Maximum duration of each snapshot request in milliseconds. */
  requestTimeoutMs?: number;
  /** Secret server runtime key used to load this environment's snapshot. */
  runtimeApiKey?: string;
}

/**
 * Options for creating a {@link FeatureGate} instance.
 *
 * At least a runtime API key or an in-memory flag snapshot must be provided.
 */
export type FeatureGateOptions = FeatureGateConfiguration &
  ({ flags: FeatureGateFlags } | { runtimeApiKey: string });

/**
 * Loads FeatureGate configuration and evaluates flags locally on the server.
 *
 * Provide a runtime API key to load configuration from FeatureGate, an in-memory snapshot for
 * fully local evaluation, or both to use the in-memory snapshot during initialization.
 */
export class FeatureGate {
  #closed = false;
  #flags: FeatureGateFlags;
  #initialization: Promise<void> | undefined;
  readonly #pollIntervalMs: number;
  #pollTimer: ReturnType<typeof setInterval> | undefined;
  #refresh: Promise<FeatureGateRefreshResult> | undefined;
  readonly #remoteSnapshotLoader: RemoteSnapshotLoader | undefined;
  #version: string | undefined;

  /**
   * Creates a FeatureGate instance.
   *
   * @param options - The initial client configuration.
   */
  constructor(options: FeatureGateOptions) {
    this.#flags = options.flags ?? {};
    this.#pollIntervalMs = readPollInterval(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);

    if (options.runtimeApiKey) {
      this.#remoteSnapshotLoader = new RemoteSnapshotLoader({
        apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
        fetch: options.fetch ?? globalThis.fetch,
        requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        runtimeApiKey: options.runtimeApiKey,
      });
    }
  }

  /**
   * Loads the environment snapshot used for local evaluation.
   *
   * Call this during application startup before evaluating flags. If bootstrap flags were
   * provided, they remain available when initialization fails.
   *
   * Concurrent calls share one initialization attempt. Failed attempts can be retried, while a
   * successful initialization is reused. Polling starts unless `pollIntervalMs` is `0`.
   *
   * @returns A promise that resolves after the remote snapshot has been loaded.
   * @throws When no runtime API key was provided, the request fails, or the response is invalid.
   */
  initialize(): Promise<void> {
    if (!this.#remoteSnapshotLoader) {
      return Promise.reject(
        new FeatureGateConfigurationError(
          "FeatureGate requires a runtime API key to load remote configuration.",
        ),
      );
    }

    this.#initialization ??= this.refresh()
      .then(() => {
        this.#startPolling();
      })
      .catch((error: unknown) => {
        this.#initialization = undefined;
        throw error;
      });

    return this.#initialization;
  }

  /**
   * Fetches and atomically applies the latest FeatureGate snapshot.
   *
   * Concurrent calls share one request. Failed refreshes leave the previous snapshot available.
   *
   * @returns Whether the local snapshot changed and the current snapshot version.
   * @throws A typed FeatureGate error when the request or response is unsuccessful.
   */
  refresh(): Promise<FeatureGateRefreshResult> {
    const loader = this.#remoteSnapshotLoader;

    if (!loader) {
      return Promise.reject(
        new FeatureGateConfigurationError(
          "FeatureGate requires a runtime API key to refresh remote configuration.",
        ),
      );
    }

    this.#refresh ??= this.#refreshSnapshot(loader).finally(() => {
      this.#refresh = undefined;
    });

    return this.#refresh;
  }

  /**
   * Stops automatic snapshot polling.
   *
   * The last loaded snapshot remains available for local evaluation.
   */
  close(): void {
    this.#closed = true;

    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
  }

  async #refreshSnapshot(loader: RemoteSnapshotLoader): Promise<FeatureGateRefreshResult> {
    const result = await loader.load(this.#version);

    if (result.status === "not_modified") {
      return result;
    }

    // Replace the complete snapshot at once so evaluations never observe partial updates.
    this.#flags = result.snapshot.flags;
    this.#version = result.snapshot.version;

    return { status: "updated", version: result.snapshot.version };
  }

  #startPolling(): void {
    if (this.#closed || this.#pollIntervalMs === 0 || this.#pollTimer) {
      return;
    }

    this.#pollTimer = setInterval(() => {
      // A failed poll leaves the previous snapshot in place and the next interval retries.
      void this.refresh().catch(() => undefined);
    }, this.#pollIntervalMs);
    this.#pollTimer.unref?.();
  }

  /**
   * Evaluates a boolean flag.
   *
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce a boolean value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated boolean value.
   */
  getBooleanValue(
    flagKey: string,
    defaultValue: boolean,
    context?: FeatureGateEvaluationContext,
  ): boolean {
    return this.getBooleanDetails(flagKey, defaultValue, context).value;
  }

  /**
   * Evaluates a boolean flag and returns information about how its value was selected.
   *
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce a boolean value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated value and its evaluation details.
   */
  getBooleanDetails(
    flagKey: string,
    defaultValue: boolean,
    context?: FeatureGateEvaluationContext,
  ): FeatureGateEvaluationResult<boolean> {
    return this.#evaluate(flagKey, defaultValue, context);
  }

  /**
   * Evaluates a string flag.
   *
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce a string value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated string value.
   */
  getStringValue(
    flagKey: string,
    defaultValue: string,
    context?: FeatureGateEvaluationContext,
  ): string {
    return this.getStringDetails(flagKey, defaultValue, context).value;
  }

  /**
   * Evaluates a string flag and returns information about how its value was selected.
   *
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce a string value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated value and its evaluation details.
   */
  getStringDetails(
    flagKey: string,
    defaultValue: string,
    context?: FeatureGateEvaluationContext,
  ): FeatureGateEvaluationResult<string> {
    return this.#evaluate(flagKey, defaultValue, context);
  }

  /**
   * Evaluates a number flag.
   *
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce a number value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated number value.
   */
  getNumberValue(
    flagKey: string,
    defaultValue: number,
    context?: FeatureGateEvaluationContext,
  ): number {
    return this.getNumberDetails(flagKey, defaultValue, context).value;
  }

  /**
   * Evaluates a number flag and returns information about how its value was selected.
   *
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce a number value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated value and its evaluation details.
   */
  getNumberDetails(
    flagKey: string,
    defaultValue: number,
    context?: FeatureGateEvaluationContext,
  ): FeatureGateEvaluationResult<number> {
    return this.#evaluate(flagKey, defaultValue, context);
  }

  /**
   * Evaluates a JSON object flag.
   *
   * @typeParam TValue - The expected object value type.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce an object value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated object value.
   */
  getObjectValue<TValue extends FeatureGateJsonObject>(
    flagKey: string,
    defaultValue: TValue,
    context?: FeatureGateEvaluationContext,
  ): TValue {
    return this.getObjectDetails(flagKey, defaultValue, context).value;
  }

  /**
   * Evaluates a JSON object flag and returns information about how its value was selected.
   *
   * @typeParam TValue - The expected object value type.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The value returned when the flag cannot produce an object value.
   * @param context - Optional targeting information for this evaluation.
   * @returns The evaluated value and its evaluation details.
   */
  getObjectDetails<TValue extends FeatureGateJsonObject>(
    flagKey: string,
    defaultValue: TValue,
    context?: FeatureGateEvaluationContext,
  ): FeatureGateEvaluationResult<TValue> {
    return this.#evaluate(flagKey, defaultValue, context);
  }

  #evaluate<TValue extends FeatureGateFlagValue>(
    flagKey: string,
    defaultValue: TValue,
    context: FeatureGateEvaluationContext | undefined,
  ): FeatureGateEvaluationResult<TValue> {
    return evaluateFlag({ context, defaultValue, flagKey, flags: this.#flags });
  }
}

function readPollInterval(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new FeatureGateConfigurationError("pollIntervalMs must be zero or a positive number.");
  }

  return value;
}
