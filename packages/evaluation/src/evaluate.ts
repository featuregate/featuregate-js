import { findMatchingRule } from "./conditions";
import type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationResult,
  FeatureGateFlags,
  FeatureGateFlagValue,
} from "./types";

/** Options for evaluating one flag from an in-memory snapshot. */
export interface FeatureGateEvaluationOptions<TValue extends FeatureGateFlagValue> {
  /** Optional targeting information for this evaluation. */
  context?: FeatureGateEvaluationContext;
  /** The fallback returned when the flag is missing or has an incompatible value type. */
  defaultValue: TValue;
  /** The key of the flag to evaluate. */
  flagKey: string;
  /** The in-memory flag snapshot to evaluate. */
  flags: FeatureGateFlags;
}

/**
 * Evaluates a flag from an in-memory configuration snapshot.
 *
 * @typeParam TValue - The expected flag value type.
 * @param options - The flag snapshot, requested flag, fallback value, and optional context.
 * @returns The evaluated value and details describing how it was selected.
 */
export function evaluateFlag<TValue extends FeatureGateFlagValue>(
  options: FeatureGateEvaluationOptions<TValue>,
): FeatureGateEvaluationResult<TValue> {
  const { context, defaultValue, flagKey, flags } = options;
  const flag = Object.hasOwn(flags, flagKey) ? flags[flagKey] : undefined;

  if (!flag) {
    return useDefault(flagKey, defaultValue, "flag_not_found");
  }

  if (flag.killSwitch) {
    return resolveValue(flagKey, false, defaultValue, "kill_switch");
  }

  const matchingRule = findMatchingRule(flag.rules, flagKey, context);

  if (matchingRule) {
    return resolveValue(flagKey, matchingRule.value, defaultValue, "targeting_match");
  }

  return resolveValue(flagKey, flag.defaultValue, defaultValue, "environment_default");
}

function resolveValue<TValue extends FeatureGateFlagValue>(
  flagKey: string,
  value: FeatureGateFlagValue,
  defaultValue: TValue,
  reason: "environment_default" | "kill_switch" | "targeting_match",
): FeatureGateEvaluationResult<TValue> {
  if (!hasCompatibleType(value, defaultValue)) {
    return useDefault(flagKey, defaultValue, "type_mismatch");
  }

  return {
    flagKey,
    reason,
    usedDefault: false,
    value,
  };
}

function useDefault<TValue extends FeatureGateFlagValue>(
  flagKey: string,
  defaultValue: TValue,
  reason: "flag_not_found" | "type_mismatch",
): FeatureGateEvaluationResult<TValue> {
  return {
    flagKey,
    reason,
    usedDefault: true,
    value: defaultValue,
  };
}

function hasCompatibleType<TValue extends FeatureGateFlagValue>(
  value: FeatureGateFlagValue,
  defaultValue: TValue,
): value is TValue {
  if (typeof defaultValue !== "object") {
    return typeof value === typeof defaultValue;
  }

  // Arrays are valid inside JSON values, but a top-level flag value must be an object.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
