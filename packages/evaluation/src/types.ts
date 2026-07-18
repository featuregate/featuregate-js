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
  /** The value returned while the flag is disabled. */
  disabledValue: FeatureGateFlagValue;
  /** Whether targeting and rollout evaluation are active for the flag. */
  enabled: boolean;
  /** The value returned when no enabled rule or rollout allocation is selected. */
  enabledValue: FeatureGateFlagValue;
  /** An optional deterministic percentage rollout. */
  rollout?: FeatureGateRollout;
  /** Ordered targeting rules evaluated before the rollout. */
  rules?: readonly FeatureGateRule[];
}

/** An immutable flag snapshot keyed by flag key. */
export type FeatureGateFlags = Readonly<Record<string, FeatureGateFlag>>;

/** Targeting information supplied for a single flag evaluation. */
export interface FeatureGateEvaluationContext {
  /** Custom attributes available to targeting conditions. */
  attributes?: FeatureGateJsonObject;
  /** A stable subject identifier used by targeting and deterministic rollouts. */
  targetingKey: string;
}

/** A targeting condition operator supported by the local evaluator. */
export type FeatureGateConditionOperator = "equals";

/** A comparison performed against an evaluation-context attribute. */
export interface FeatureGateCondition {
  /** The context attribute to read, or `targetingKey` for the built-in targeting key. */
  attribute: string;
  /** The comparison performed by the condition. */
  operator: FeatureGateConditionOperator;
  /** The expected attribute value. */
  value: FeatureGateJsonPrimitive;
}

/** An ordered targeting rule whose conditions must all match. */
export interface FeatureGateRule {
  /** Conditions that must all match for this rule to be selected. */
  conditions: readonly FeatureGateCondition[];
  /** The value returned when this rule matches. */
  value: FeatureGateFlagValue;
}

/** A value and its integer weight within a percentage rollout. */
export interface FeatureGateRolloutAllocation {
  /** The value returned when this allocation is selected. */
  value: FeatureGateFlagValue;
  /** The allocation's integer bucket count out of 100,000. */
  weight: number;
}

/** A deterministic rollout made up of ordered weighted allocations. */
export interface FeatureGateRollout {
  /** Ordered allocations whose weights should total 100,000. */
  allocations: readonly FeatureGateRolloutAllocation[];
  /** A server-generated value that controls deterministic bucket assignment. */
  seed: string;
}

/** The reason an evaluation returned its final value. */
export type FeatureGateEvaluationReason =
  | "enabled"
  | "disabled"
  | "flag_not_found"
  | "rollout"
  | "rule_match"
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
