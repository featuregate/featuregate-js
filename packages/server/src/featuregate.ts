import type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationResult,
  FeatureGateFlags,
  FeatureGateFlagValue,
  FeatureGateJsonObject,
} from "@featuregate/evaluation";
import { evaluateFlag } from "@featuregate/evaluation";

import {
  FeatureGateAuthenticationError,
  FeatureGateConfigurationError,
  FeatureGateRequestError,
} from "./errors";
import { readSnapshot } from "./snapshot";
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
  readonly #apiBaseUrl: string;
  #closed = false;
  #etag: string | undefined;
  readonly #fetch: typeof fetch;
  #flags: FeatureGateFlags;
  #initialization: Promise<void> | undefined;
  readonly #pollIntervalMs: number;
  #pollTimer: ReturnType<typeof setInterval> | undefined;
  #refresh: Promise<FeatureGateRefreshResult> | undefined;
  readonly #requestTimeoutMs: number;
  readonly #runtimeApiKey: string | undefined;
  #version: string | undefined;

  /**
   * Creates a FeatureGate instance.
   *
   * @param options - The initial client configuration.
   */
  constructor(options: FeatureGateOptions) {
    this.#apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#flags = options.flags ?? {};
    this.#pollIntervalMs = readDuration(
      "pollIntervalMs",
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      true,
    );
    this.#requestTimeoutMs = readDuration(
      "requestTimeoutMs",
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      false,
    );
    this.#runtimeApiKey = options.runtimeApiKey;
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
    if (!this.#runtimeApiKey) {
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
    if (!this.#runtimeApiKey) {
      return Promise.reject(
        new FeatureGateConfigurationError(
          "FeatureGate requires a runtime API key to refresh remote configuration.",
        ),
      );
    }

    this.#refresh ??= this.#refreshSnapshot().finally(() => {
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

  async #refreshSnapshot(): Promise<FeatureGateRefreshResult> {
    const headers = new Headers({
      authorization: `Bearer ${this.#runtimeApiKey}`,
    });

    if (this.#etag) {
      headers.set("if-none-match", this.#etag);
    }

    let response: Response;

    try {
      response = await this.#fetch(`${this.#apiBaseUrl}/v1/snapshot`, {
        headers,
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch (cause) {
      throw new FeatureGateRequestError("FeatureGate snapshot request failed.", undefined, {
        cause,
      });
    }

    if (response.status === 304) {
      if (!this.#version) {
        throw new FeatureGateConfigurationError(
          "FeatureGate returned 304 before a snapshot was available.",
          response.status,
        );
      }

      return { status: "not_modified", version: this.#version };
    }

    if (response.status === 401 || response.status === 403) {
      throw new FeatureGateAuthenticationError(
        `FeatureGate rejected the runtime API key with status ${response.status}.`,
        response.status,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      throw new FeatureGateRequestError(
        `FeatureGate snapshot request failed with status ${response.status}.`,
        response.status,
      );
    }

    if (!response.ok) {
      throw new FeatureGateConfigurationError(
        `FeatureGate snapshot request failed with status ${response.status}.`,
        response.status,
      );
    }

    let value: unknown;

    try {
      value = await response.json();
    } catch (cause) {
      throw new FeatureGateConfigurationError(
        "FeatureGate returned an invalid snapshot response.",
        response.status,
        { cause },
      );
    }

    const snapshot = readSnapshot(value);

    // Replace the complete snapshot at once so evaluations never observe partial updates.
    this.#flags = snapshot.flags;
    this.#version = snapshot.version;
    this.#etag = response.headers.get("etag") ?? JSON.stringify(snapshot.version);

    return { status: "updated", version: snapshot.version };
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

function readDuration(name: string, value: number, allowZero: boolean): number {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new FeatureGateConfigurationError(
      `${name} must be ${allowZero ? "zero or a positive number" : "a positive number"}.`,
    );
  }

  return value;
}
