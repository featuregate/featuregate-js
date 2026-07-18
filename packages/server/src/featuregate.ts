import type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationResult,
  FeatureGateFlags,
  FeatureGateFlagValue,
  FeatureGateJsonObject,
} from "@featuregate/evaluation";
import { evaluateFlag } from "@featuregate/evaluation";

/** Options for creating a {@link FeatureGate} instance. */
export interface FeatureGateOptions {
  /** The initial in-memory flag snapshot. */
  flags: FeatureGateFlags;
}

/**
 * Evaluates FeatureGate flags on the server from an in-memory flag snapshot.
 *
 * The current implementation performs no network requests and evaluates every flag locally.
 */
export class FeatureGate {
  readonly #flags: FeatureGateFlags;

  /**
   * Creates a FeatureGate instance.
   *
   * @param options - The initial client configuration.
   */
  constructor(options: FeatureGateOptions) {
    this.#flags = options.flags;
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
