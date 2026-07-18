import type {
  FeatureGateFlagValue,
  FeatureGateLocalEvaluationDetails,
  FeatureGateLocalValues,
} from "./types";

export type {
  FeatureGateFlagValue,
  FeatureGateJsonObject,
  FeatureGateJsonPrimitive,
  FeatureGateJsonValue,
  FeatureGateLocalEvaluationDetails,
  FeatureGateLocalEvaluationReason,
  FeatureGateLocalValues,
} from "./types";

export interface FeatureGateLocalEvaluationOptions<TValue extends FeatureGateFlagValue> {
  bootstrap?: FeatureGateLocalValues;
  defaultValue: TValue;
  flagKey: string;
  overrides?: FeatureGateLocalValues;
}

export function evaluateLocalFlag<TValue extends FeatureGateFlagValue>(
  options: FeatureGateLocalEvaluationOptions<TValue>,
): FeatureGateLocalEvaluationDetails<TValue> {
  const { bootstrap, defaultValue, flagKey, overrides } = options;

  if (hasOwn(overrides, flagKey)) {
    return resolveCandidate(flagKey, overrides[flagKey], defaultValue, "override");
  }

  if (hasOwn(bootstrap, flagKey)) {
    return resolveCandidate(flagKey, bootstrap[flagKey], defaultValue, "bootstrap");
  }

  return {
    flagKey,
    reason: "caller_default",
    usedDefault: true,
    value: defaultValue,
  };
}

function resolveCandidate<TValue extends FeatureGateFlagValue>(
  flagKey: string,
  candidate: unknown,
  defaultValue: TValue,
  reason: "override" | "bootstrap",
): FeatureGateLocalEvaluationDetails<TValue> {
  if (!hasCompatibleType(candidate, defaultValue)) {
    return {
      flagKey,
      reason: "type_mismatch",
      usedDefault: true,
      value: defaultValue,
    };
  }

  return {
    flagKey,
    reason,
    usedDefault: false,
    value: candidate,
  };
}

function hasOwn(
  values: FeatureGateLocalValues | undefined,
  key: string,
): values is FeatureGateLocalValues {
  return values !== undefined && Object.hasOwn(values, key);
}

function hasCompatibleType<TValue extends FeatureGateFlagValue>(
  value: unknown,
  defaultValue: TValue,
): value is TValue {
  if (typeof defaultValue !== "object") {
    return typeof value === typeof defaultValue;
  }

  return typeof value === "object" && value !== null && !Array.isArray(value);
}
