export type FeatureGateJsonPrimitive = string | number | boolean | null;

export type FeatureGateJsonValue =
  | FeatureGateJsonPrimitive
  | readonly FeatureGateJsonValue[]
  | FeatureGateJsonObject;

export type FeatureGateJsonObject = {
  readonly [key: string]: FeatureGateJsonValue;
};

export type FeatureGateFlagValue = boolean | string | number | FeatureGateJsonObject;

export interface FeatureGateFlag {
  disabledValue: FeatureGateFlagValue;
  enabled: boolean;
  enabledValue: FeatureGateFlagValue;
  rules?: readonly FeatureGateRule[];
}

export type FeatureGateFlags = Readonly<Record<string, FeatureGateFlag>>;

export interface FeatureGateEvaluationContext {
  attributes?: FeatureGateJsonObject;
  // This stable identifier will also seed deterministic percentage rollouts.
  targetingKey: string;
}

export type FeatureGateConditionOperator = "equals";

export interface FeatureGateCondition {
  attribute: string;
  operator: FeatureGateConditionOperator;
  value: FeatureGateJsonPrimitive;
}

export interface FeatureGateRule {
  conditions: readonly FeatureGateCondition[];
  value: FeatureGateFlagValue;
}

export type FeatureGateEvaluationReason =
  | "enabled"
  | "disabled"
  | "flag_not_found"
  | "rule_match"
  | "type_mismatch";

export interface FeatureGateEvaluationResult<TValue extends FeatureGateFlagValue> {
  flagKey: string;
  reason: FeatureGateEvaluationReason;
  usedDefault: boolean;
  value: TValue;
}
