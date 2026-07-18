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
  type FeatureGateError,
  FeatureGateRequestError,
} from "./errors";
import { RemoteSnapshotLoader } from "./remote-snapshot";
import { consumeSnapshotStream, type SnapshotStreamEvent } from "./snapshot-stream";
import type {
  FeatureGateErrorSummary,
  FeatureGateRefreshResult,
  FeatureGateSnapshotChange,
  FeatureGateSnapshotSource,
  FeatureGateState,
  FeatureGateStatus,
  FeatureGateStreamState,
  FeatureGateSyncMode,
} from "./types";

const DEFAULT_API_BASE_URL = "https://api.featuregate.dev";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const STREAM_RECONNECT_BASE_MS = 1_000;
const STREAM_RECONNECT_MAX_MS = 30_000;

interface FeatureGateConfiguration {
  /** Base URL for the FeatureGate API. */
  apiBaseUrl?: string;
  /** Fetch implementation used to load snapshots. Defaults to the runtime's global fetch. */
  fetch?: typeof fetch;
  /** An optional in-memory snapshot used before remote configuration is loaded. */
  flags?: FeatureGateFlags;
  /** Called when automatic polling or streaming synchronization fails. */
  onError?: (error: FeatureGateError) => void;
  /** Called after a different remote snapshot version is applied. */
  onSnapshotChange?: (change: FeatureGateSnapshotChange) => void;
  /** Called when observable lifecycle or freshness information changes. */
  onStatusChange?: (status: FeatureGateStatus) => void;
  /** How often to refresh the snapshot. Set to `0` to disable automatic polling. */
  pollIntervalMs?: number;
  /** Maximum duration of each snapshot request in milliseconds. */
  requestTimeoutMs?: number;
  /** Secret server runtime key used to load this environment's snapshot. */
  runtimeApiKey?: string;
  /** Background synchronization strategy. Defaults to streaming with polling as a fallback. */
  syncMode?: FeatureGateSyncMode;
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
  #backgroundStarted = false;
  #closed = false;
  #flags: FeatureGateFlags;
  #initialization: Promise<void> | undefined;
  #lastError: FeatureGateErrorSummary | undefined;
  #lastRefreshAt: Date | undefined;
  #lastSuccessfulRefreshAt: Date | undefined;
  readonly #onError: ((error: FeatureGateError) => void) | undefined;
  readonly #onSnapshotChange: ((change: FeatureGateSnapshotChange) => void) | undefined;
  readonly #onStatusChange: ((status: FeatureGateStatus) => void) | undefined;
  readonly #pollIntervalMs: number;
  #pollTimer: ReturnType<typeof setTimeout> | undefined;
  #refresh: Promise<FeatureGateRefreshResult> | undefined;
  #refreshAbortController: AbortController | undefined;
  readonly #remoteSnapshotLoader: RemoteSnapshotLoader | undefined;
  #snapshotSource: FeatureGateSnapshotSource;
  #state: FeatureGateState;
  #streamAbortController: AbortController | undefined;
  #streamBlocked = false;
  #streamReconnectAttempt = 0;
  #streamReconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #streamState: FeatureGateStreamState = "disabled";
  readonly #syncMode: FeatureGateSyncMode;
  #version: string | undefined;

  /**
   * Creates a FeatureGate instance.
   *
   * @param options - The initial client configuration.
   */
  constructor(options: FeatureGateOptions) {
    const hasFlags = Object.hasOwn(options, "flags");
    const runtimeApiKey = options.runtimeApiKey;
    const hasRuntimeApiKey = Boolean(runtimeApiKey);

    this.#flags = options.flags ?? {};
    this.#onError = options.onError;
    this.#onSnapshotChange = options.onSnapshotChange;
    this.#onStatusChange = options.onStatusChange;
    this.#pollIntervalMs = readPollInterval(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    this.#syncMode = readSyncMode(options.syncMode, this.#pollIntervalMs);
    this.#snapshotSource = hasFlags ? (hasRuntimeApiKey ? "bootstrap" : "local") : "none";
    this.#state = hasFlags ? "ready" : "not_ready";

    if (runtimeApiKey) {
      this.#remoteSnapshotLoader = new RemoteSnapshotLoader({
        apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
        fetch: options.fetch ?? globalThis.fetch,
        requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        runtimeApiKey,
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
   * successful initialization is reused. Background synchronization then starts according to
   * `syncMode`.
   *
   * @returns A promise that resolves after the remote snapshot has been loaded.
   * @throws When no runtime API key was provided, the request fails, or the response is invalid.
   */
  initialize(): Promise<void> {
    if (this.#closed) {
      return Promise.reject(closedError());
    }

    if (!this.#remoteSnapshotLoader) {
      return Promise.reject(
        new FeatureGateConfigurationError(
          "FeatureGate requires a runtime API key to load remote configuration.",
        ),
      );
    }

    this.#initialization ??= this.refresh()
      .then(() => {
        this.#startBackgroundSynchronization();
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
    if (this.#closed) {
      return Promise.reject(closedError());
    }

    const loader = this.#remoteSnapshotLoader;

    if (!loader) {
      return Promise.reject(
        new FeatureGateConfigurationError(
          "FeatureGate requires a runtime API key to refresh remote configuration.",
        ),
      );
    }

    if (!this.#refresh) {
      const controller = new AbortController();
      this.#refreshAbortController = controller;
      this.#refresh = this.#refreshSnapshot(loader, controller.signal).finally(() => {
        if (this.#refreshAbortController === controller) {
          this.#refreshAbortController = undefined;
        }

        this.#refresh = undefined;
      });
    }

    return this.#refresh;
  }

  /**
   * Stops all automatic synchronization and aborts in-flight SDK requests.
   *
   * The last loaded snapshot remains available for local evaluation.
   */
  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#backgroundStarted = false;

    if (this.#pollTimer) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = undefined;
    }

    if (this.#streamReconnectTimer) {
      clearTimeout(this.#streamReconnectTimer);
      this.#streamReconnectTimer = undefined;
    }

    this.#streamAbortController?.abort();
    this.#streamAbortController = undefined;
    this.#refreshAbortController?.abort();
    this.#streamState = "disabled";
    this.#state = "closed";
    this.#emitStatus();
  }

  /** Returns the client's current lifecycle and snapshot freshness state. */
  getStatus(): FeatureGateStatus {
    return {
      ...(this.#lastError ? { lastError: cloneErrorSummary(this.#lastError) } : {}),
      ...(this.#lastRefreshAt ? { lastRefreshAt: new Date(this.#lastRefreshAt) } : {}),
      ...(this.#lastSuccessfulRefreshAt
        ? { lastSuccessfulRefreshAt: new Date(this.#lastSuccessfulRefreshAt) }
        : {}),
      snapshotSource: this.#snapshotSource,
      ...(this.#version ? { snapshotVersion: this.#version } : {}),
      state: this.#state,
      streamState: this.#streamState,
    };
  }

  async #refreshSnapshot(
    loader: RemoteSnapshotLoader,
    signal: AbortSignal,
  ): Promise<FeatureGateRefreshResult> {
    try {
      const result = await loader.load(this.#version, signal);
      const refreshedAt = new Date();

      if (this.#closed) {
        throw closedError();
      }

      this.#lastError = undefined;
      this.#lastRefreshAt = refreshedAt;
      this.#lastSuccessfulRefreshAt = refreshedAt;
      this.#state = "ready";
      this.#streamBlocked = false;

      if (result.status === "not_modified") {
        this.#emitStatus();
        this.#startStreaming();

        return result;
      }

      const previousVersion = this.#version;

      // Replace the complete snapshot at once so evaluations never observe partial updates.
      this.#flags = result.snapshot.flags;
      this.#version = result.snapshot.version;
      this.#snapshotSource = "remote";

      if (previousVersion !== result.snapshot.version) {
        this.#emitSnapshotChange({
          ...(previousVersion ? { previousVersion } : {}),
          version: result.snapshot.version,
        });
      }

      this.#emitStatus();
      this.#startStreaming();

      return { status: "updated", version: result.snapshot.version };
    } catch (cause) {
      const error = toFeatureGateError(cause);

      if (!this.#closed) {
        this.#lastError = summarizeError(error);
        this.#lastRefreshAt = new Date();
        this.#state =
          error instanceof FeatureGateAuthenticationError ||
          error instanceof FeatureGateConfigurationError ||
          this.#snapshotSource === "none"
            ? "error"
            : "stale";
        this.#emitStatus();
      }

      throw error;
    }
  }

  #startBackgroundSynchronization(): void {
    if (this.#closed || this.#backgroundStarted) {
      return;
    }

    this.#backgroundStarted = true;

    if (this.#syncMode !== "manual") {
      this.#schedulePoll();
    }

    this.#startStreaming();
  }

  #schedulePoll(minimumDelayMs = 0): void {
    if (
      this.#closed ||
      !this.#backgroundStarted ||
      this.#syncMode === "manual" ||
      this.#pollTimer
    ) {
      return;
    }

    const delay = Math.max(minimumDelayMs, jitter(this.#pollIntervalMs, 0.1));
    this.#pollTimer = setTimeout(() => {
      this.#pollTimer = undefined;
      void this.#pollOnce();
    }, delay);
    this.#pollTimer.unref?.();
  }

  async #pollOnce(): Promise<void> {
    let retryAfterMs: number | undefined;

    try {
      await this.refresh();
    } catch (error) {
      const featureGateError = toFeatureGateError(error);
      this.#emitError(featureGateError);
      retryAfterMs =
        featureGateError instanceof FeatureGateRequestError
          ? featureGateError.retryAfterMs
          : undefined;
    }

    this.#schedulePoll(retryAfterMs);
  }

  #startStreaming(): void {
    if (
      this.#closed ||
      !this.#backgroundStarted ||
      this.#syncMode !== "streaming" ||
      this.#streamBlocked ||
      this.#streamAbortController ||
      this.#streamReconnectTimer
    ) {
      return;
    }

    const loader = this.#remoteSnapshotLoader;

    if (!loader) {
      return;
    }

    const controller = new AbortController();
    this.#streamAbortController = controller;
    this.#setStreamState("connecting");

    void this.#runStream(loader, controller).finally(() => {
      if (this.#streamAbortController === controller) {
        this.#streamAbortController = undefined;
      }

      if (!this.#closed && !this.#streamBlocked) {
        this.#scheduleStreamReconnect();
      }
    });
  }

  async #runStream(loader: RemoteSnapshotLoader, controller: AbortController): Promise<void> {
    try {
      const response = await loader.openStream(controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      this.#setStreamState("connected");
      await consumeSnapshotStream(response, (event) => {
        this.#streamReconnectAttempt = 0;

        return this.#handleStreamEvent(event, controller);
      });

      if (!controller.signal.aborted) {
        this.#recordStreamFailure(
          new FeatureGateRequestError("FeatureGate snapshot stream disconnected."),
        );
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        return;
      }

      const error = toFeatureGateError(cause);
      this.#recordStreamFailure(error);

      if (
        error instanceof FeatureGateAuthenticationError ||
        error instanceof FeatureGateConfigurationError
      ) {
        this.#streamBlocked = true;

        try {
          await this.refresh();
        } catch {
          // The refresh records authoritative lifecycle state; the stream error was already sent.
        }
      }
    }
  }

  async #handleStreamEvent(event: SnapshotStreamEvent, controller: AbortController): Promise<void> {
    if (event.type === "heartbeat") {
      return;
    }

    if (event.type === "stream.close") {
      if (isTerminalStreamClose(event.reason)) {
        this.#streamBlocked = true;
      }

      controller.abort();

      if (event.reason !== "max_duration") {
        await this.#refreshFromBackground();
      }

      return;
    }

    if (event.version && event.version === this.#version) {
      return;
    }

    await this.#refreshFromBackground();

    // An invalidation can arrive while another refresh is already in flight. Reconcile once more
    // when the announced version was not present after the shared request completed.
    if (event.version && event.version !== this.#version && !this.#closed) {
      await this.#refreshFromBackground();
    }
  }

  async #refreshFromBackground(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      this.#emitError(toFeatureGateError(error));
    }
  }

  #scheduleStreamReconnect(): void {
    if (
      this.#closed ||
      this.#streamBlocked ||
      this.#syncMode !== "streaming" ||
      this.#streamReconnectTimer
    ) {
      return;
    }

    this.#streamReconnectAttempt += 1;
    const maximumDelay = Math.min(
      STREAM_RECONNECT_BASE_MS * 2 ** (this.#streamReconnectAttempt - 1),
      STREAM_RECONNECT_MAX_MS,
    );
    const delay = Math.max(1, Math.floor(Math.random() * maximumDelay));
    this.#setStreamState("reconnecting");
    this.#streamReconnectTimer = setTimeout(() => {
      this.#streamReconnectTimer = undefined;
      this.#startStreaming();
    }, delay);
    this.#streamReconnectTimer.unref?.();
  }

  #setStreamState(state: FeatureGateStreamState): void {
    if (this.#streamState === state) {
      return;
    }

    this.#streamState = state;
    this.#emitStatus();
  }

  #recordStreamFailure(error: FeatureGateError): void {
    if (this.#closed) {
      return;
    }

    this.#lastError = summarizeError(error, "stream");
    this.#emitStatus();
    this.#emitError(error);
  }

  #emitError(error: FeatureGateError): void {
    try {
      this.#onError?.(error);
    } catch {
      // Consumer callbacks must not change SDK synchronization behavior.
    }
  }

  #emitSnapshotChange(change: FeatureGateSnapshotChange): void {
    try {
      this.#onSnapshotChange?.(change);
    } catch {
      // Consumer callbacks must not change SDK synchronization behavior.
    }
  }

  #emitStatus(): void {
    try {
      this.#onStatusChange?.(this.getStatus());
    } catch {
      // Consumer callbacks must not change SDK synchronization behavior.
    }
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

function readSyncMode(
  value: FeatureGateSyncMode | undefined,
  pollIntervalMs: number,
): FeatureGateSyncMode {
  const mode = value ?? (pollIntervalMs === 0 ? "manual" : "streaming");

  if (mode !== "manual" && pollIntervalMs === 0) {
    throw new FeatureGateConfigurationError(
      `pollIntervalMs must be positive when syncMode is "${mode}".`,
    );
  }

  return mode;
}

function jitter(value: number, ratio: number): number {
  return Math.round(value * (1 - ratio + Math.random() * ratio * 2));
}

function closedError(): FeatureGateConfigurationError {
  return new FeatureGateConfigurationError("FeatureGate has been closed.");
}

function toFeatureGateError(value: unknown): FeatureGateError {
  return value instanceof FeatureGateAuthenticationError ||
    value instanceof FeatureGateConfigurationError ||
    value instanceof FeatureGateRequestError
    ? value
    : new FeatureGateRequestError("FeatureGate synchronization failed.", undefined, {
        cause: value,
      });
}

function summarizeError(
  error: FeatureGateError,
  kindOverride?: FeatureGateErrorSummary["kind"],
): FeatureGateErrorSummary {
  const status =
    error instanceof FeatureGateAuthenticationError ||
    error instanceof FeatureGateConfigurationError ||
    error instanceof FeatureGateRequestError
      ? error.status
      : undefined;
  const kind =
    kindOverride ??
    (error instanceof FeatureGateAuthenticationError
      ? "authentication"
      : error instanceof FeatureGateConfigurationError
        ? "configuration"
        : "request");

  return {
    kind,
    message: error.message,
    occurredAt: new Date(),
    ...(status === undefined ? {} : { status }),
  };
}

function cloneErrorSummary(summary: FeatureGateErrorSummary): FeatureGateErrorSummary {
  return {
    ...summary,
    occurredAt: new Date(summary.occurredAt),
  };
}

function isTerminalStreamClose(reason: string | undefined): boolean {
  return (
    reason === "environment_deleted" ||
    reason === "project_deleted" ||
    reason === "runtime_key_revoked"
  );
}
