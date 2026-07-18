/** A primitive value supported inside FeatureGate JSON data. */
export type FeatureGateJsonPrimitive = string | number | boolean | null;

/** Any value supported inside FeatureGate JSON data. */
export type FeatureGateJsonValue =
  | FeatureGateJsonPrimitive
  | readonly FeatureGateJsonValue[]
  | FeatureGateJsonObject;

/** A JSON object supported as a FeatureGate flag value. */
export type FeatureGateJsonObject = {
  readonly [key: string]: FeatureGateJsonValue;
};

/** A value that can be returned by a FeatureGate flag. */
export type FeatureGateFlagValue = boolean | string | number | FeatureGateJsonObject;

/** A locally evaluable FeatureGate flag definition. */
export interface FeatureGateFlag {
  /** The environment value returned when no targeting rule matches. */
  defaultValue: FeatureGateFlagValue;
  /** Whether the flag is being forced off by its emergency kill switch. */
  killSwitch?: boolean;
  /** Ordered targeting rules evaluated before the environment default. */
  rules?: readonly FeatureGateRule[];
}

/** An immutable flag snapshot keyed by flag key. */
export type FeatureGateFlags = Readonly<Record<string, FeatureGateFlag>>;

/** Targeting information supplied for a single flag evaluation. */
export interface FeatureGateEvaluationContext {
  /** Custom attributes available to targeting conditions. */
  attributes?: FeatureGateJsonObject;
  /** A stable subject identifier available as the built-in `targetingKey` attribute. */
  targetingKey?: string;
}

/** A comparison supported by an attribute targeting condition. */
export type FeatureGateConditionOperator = "equals" | "in" | "not_equals" | "not_in";

/** A scalar value supported by targeting comparisons. */
export type FeatureGateComparisonScalar = FeatureGateJsonPrimitive;

/** A scalar or list of scalars supported by targeting comparisons. */
export type FeatureGateComparisonValue =
  | FeatureGateComparisonScalar
  | readonly FeatureGateComparisonScalar[];

/** A comparison performed against an evaluation-context attribute. */
interface FeatureGateAttributeConditionBase {
  /** Dot-separated path to an evaluation attribute, or `targetingKey`. */
  attributePath: string;
  /** Identifies this as an attribute comparison. */
  type: "attribute_match";
}

/** A scalar equality or inequality targeting condition. */
export interface FeatureGateScalarCondition extends FeatureGateAttributeConditionBase {
  /** The comparison performed by the condition. */
  operator: "equals" | "not_equals";
  /** The expected scalar value. */
  value: FeatureGateComparisonScalar;
}

/** A list membership targeting condition. */
export interface FeatureGateListCondition extends FeatureGateAttributeConditionBase {
  /** The comparison performed by the condition. */
  operator: "in" | "not_in";
  /** The expected list of scalar values. */
  value: readonly FeatureGateComparisonScalar[];
}

/** An attribute comparison supported by local evaluation. */
export type FeatureGateAttributeCondition = FeatureGateScalarCondition | FeatureGateListCondition;

/** A deterministic percentage check against one evaluation attribute. */
export interface FeatureGatePercentageCondition {
  /** Dot-separated path to the stable rollout attribute, or `targetingKey`. */
  attributePath: string;
  /** Percentage of buckets that match, from 0 through 100. */
  percentage: number;
  /** Identifies this as a percentage rollout. */
  type: "percentage_rollout";
}

/** A condition supported by local evaluation. */
export type FeatureGateCondition = FeatureGateAttributeCondition | FeatureGatePercentageCondition;

/** An ordered targeting rule that serves a value when its conditions match. */
export interface FeatureGateRule {
  /** Conditions evaluated by this rule. */
  conditions: readonly FeatureGateCondition[];
  /** Whether every condition or at least one condition must match. */
  conditionsMatch: "all" | "any";
  /** The value returned when this rule matches. */
  value: FeatureGateFlagValue;
}

/** The reason an evaluation returned its final value. */
export type FeatureGateEvaluationReason =
  | "environment_default"
  | "flag_not_found"
  | "kill_switch"
  | "targeting_match"
  | "type_mismatch";

/** The value and metadata produced by a flag evaluation. */
export interface FeatureGateEvaluationResult<TValue extends FeatureGateFlagValue> {
  /** The key of the evaluated flag. */
  flagKey: string;
  /** Why the evaluator selected the returned value. */
  reason: FeatureGateEvaluationReason;
  /** Whether the evaluator returned the caller-provided default value. */
  usedDefault: boolean;
  /** The final evaluated value. */
  value: TValue;
}
