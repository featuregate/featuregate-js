import type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationResult,
  FeatureGateFlags,
  FeatureGateFlagValue,
  FeatureGateJsonObject,
} from "@featuregate/evaluation";
import { evaluateFlag } from "@featuregate/evaluation";

import { readSnapshotFlags } from "./snapshot";

const DEFAULT_API_BASE_URL = "https://api.featuregate.dev";

interface FeatureGateConfiguration {
  /** Base URL for the FeatureGate API. */
  apiBaseUrl?: string;
  /** Fetch implementation used to load snapshots. Defaults to the runtime's global fetch. */
  fetch?: typeof fetch;
  /** An optional in-memory snapshot used before remote configuration is loaded. */
  flags?: FeatureGateFlags;
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
  readonly #fetch: typeof fetch;
  #flags: FeatureGateFlags;
  #initialization: Promise<void> | undefined;
  readonly #runtimeApiKey: string | undefined;

  /**
   * Creates a FeatureGate instance.
   *
   * @param options - The initial client configuration.
   */
  constructor(options: FeatureGateOptions) {
    this.#apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#flags = options.flags ?? {};
    this.#runtimeApiKey = options.runtimeApiKey;
  }

  /**
   * Loads the environment snapshot used for local evaluation.
   *
   * Call this during application startup before evaluating flags. If bootstrap flags were
   * provided, they remain available when initialization fails.
   *
   * Concurrent and subsequent calls share the first initialization attempt.
   *
   * @returns A promise that resolves after the remote snapshot has been loaded.
   * @throws When no runtime API key was provided, the request fails, or the response is invalid.
   */
  initialize(): Promise<void> {
    if (!this.#runtimeApiKey) {
      return Promise.reject(
        new Error("FeatureGate requires a runtime API key to load remote configuration."),
      );
    }

    this.#initialization ??= this.#loadSnapshot();

    return this.#initialization;
  }

  async #loadSnapshot(): Promise<void> {
    const response = await this.#fetch(`${this.#apiBaseUrl}/v1/snapshot`, {
      headers: {
        authorization: `Bearer ${this.#runtimeApiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`FeatureGate snapshot request failed with status ${response.status}.`);
    }

    // Replace the complete snapshot at once so evaluations never observe partial updates.
    this.#flags = readSnapshotFlags(await response.json());
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
