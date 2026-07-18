import type { FeatureGateCondition, FeatureGateEvaluationContext, FeatureGateRule } from "./types";

export function findMatchingRule(
  rules: readonly FeatureGateRule[] | undefined,
  context: FeatureGateEvaluationContext | undefined,
): FeatureGateRule | undefined {
  return rules?.find((rule) =>
    rule.conditions.every((condition) => matchesCondition(condition, context)),
  );
}

function matchesCondition(
  condition: FeatureGateCondition,
  context: FeatureGateEvaluationContext | undefined,
): boolean {
  if (!context) {
    return false;
  }

  // The targeting key behaves like a built-in attribute so rules use one lookup model.
  const actualValue =
    condition.attribute === "targetingKey"
      ? context.targetingKey
      : context.attributes?.[condition.attribute];

  return actualValue === condition.value;
}
