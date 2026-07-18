import { findMatchingRule } from "./conditions";
import type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationResult,
  FeatureGateFlags,
  FeatureGateFlagValue,
} from "./types";

export interface FeatureGateEvaluationOptions<TValue extends FeatureGateFlagValue> {
  context?: FeatureGateEvaluationContext;
  defaultValue: TValue;
  flagKey: string;
  flags: FeatureGateFlags;
}

/** Evaluates a flag from an in-memory configuration snapshot. */
export function evaluateFlag<TValue extends FeatureGateFlagValue>(
  options: FeatureGateEvaluationOptions<TValue>,
): FeatureGateEvaluationResult<TValue> {
  const { context, defaultValue, flagKey, flags } = options;
  const flag = Object.hasOwn(flags, flagKey) ? flags[flagKey] : undefined;

  if (!flag) {
    return useDefault(flagKey, defaultValue, "flag_not_found");
  }

  if (!flag.enabled) {
    return resolveValue(flagKey, flag.disabledValue, defaultValue, "disabled");
  }

  const matchingRule = findMatchingRule(flag.rules, context);

  return resolveValue(
    flagKey,
    matchingRule?.value ?? flag.enabledValue,
    defaultValue,
    matchingRule ? "rule_match" : "enabled",
  );
}

function resolveValue<TValue extends FeatureGateFlagValue>(
  flagKey: string,
  value: FeatureGateFlagValue,
  defaultValue: TValue,
  reason: "disabled" | "enabled" | "rule_match",
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
