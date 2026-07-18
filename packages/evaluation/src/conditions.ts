import { getRolloutBucket } from "./hash";
import type {
  FeatureGateAttributeCondition,
  FeatureGateCondition,
  FeatureGateEvaluationContext,
  FeatureGateJsonPrimitive,
  FeatureGateRule,
} from "./types";

export function findMatchingRule(
  rules: readonly FeatureGateRule[] | undefined,
  flagKey: string,
  context: FeatureGateEvaluationContext | undefined,
): FeatureGateRule | undefined {
  return rules?.find((rule) => matchesRule(rule, flagKey, context));
}

function matchesRule(
  rule: FeatureGateRule,
  flagKey: string,
  context: FeatureGateEvaluationContext | undefined,
): boolean {
  if (rule.conditions.length === 0) {
    return false;
  }

  const matches = (condition: FeatureGateCondition) =>
    matchesCondition(condition, flagKey, context);

  return rule.conditionsMatch === "any"
    ? rule.conditions.some(matches)
    : rule.conditions.every(matches);
}

function matchesCondition(
  condition: FeatureGateCondition,
  flagKey: string,
  context: FeatureGateEvaluationContext | undefined,
): boolean {
  const value = readContextValue(context, condition.attributePath);

  if (value === undefined) {
    return false;
  }

  if (condition.type === "percentage_rollout") {
    return (
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean") &&
      getRolloutBucket(flagKey, condition.attributePath, String(value)) < condition.percentage
    );
  }

  return matchesAttribute(condition, value);
}

function matchesAttribute(condition: FeatureGateAttributeCondition, actual: unknown): boolean {
  if (condition.operator === "equals") {
    return isComparable(actual) && actual === condition.value;
  }

  if (condition.operator === "not_equals") {
    return isComparable(actual) && actual !== condition.value;
  }

  const includes =
    Array.isArray(condition.value) &&
    isComparable(actual) &&
    condition.value.some((value) => value === actual);

  return condition.operator === "in" ? includes : !includes;
}

function readContextValue(
  context: FeatureGateEvaluationContext | undefined,
  attributePath: string,
): unknown {
  if (!context) {
    return undefined;
  }

  if (attributePath === "targetingKey") {
    return context.targetingKey;
  }

  let value: unknown = context.attributes;

  for (const part of attributePath.split(".")) {
    if (!isRecord(value) || !(part in value)) {
      return undefined;
    }

    value = value[part];
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComparable(value: unknown): value is FeatureGateJsonPrimitive {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}
