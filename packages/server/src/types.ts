import type {
  FeatureGateConditionOperator,
  FeatureGateFlagValue,
  FeatureGateJsonPrimitive,
} from "@featuregate/evaluation";

export interface RuntimeSnapshotResponse {
  snapshot: RuntimeSnapshot;
}

export interface RuntimeSnapshot {
  flags: RuntimeSnapshotFlag[];
}

export interface RuntimeSnapshotFlag {
  defaultValue: FeatureGateFlagValue;
  key: string;
  killSwitch: { active: boolean };
  rules: RuntimeSnapshotRule[];
}

export interface RuntimeSnapshotRule {
  conditions: RuntimeSnapshotCondition[];
  conditionsMatch: "all" | "any";
  serveValue: FeatureGateFlagValue;
  sortOrder: number;
}

export type RuntimeSnapshotCondition =
  | RuntimeSnapshotAttributeCondition
  | RuntimeSnapshotPercentageCondition;

export interface RuntimeSnapshotAttributeCondition {
  attributePath: string | null;
  operator: FeatureGateConditionOperator | null;
  rolloutPercentage: null;
  sortOrder: number;
  type: "attribute_match";
  value: FeatureGateJsonPrimitive | FeatureGateJsonPrimitive[] | null;
}

export interface RuntimeSnapshotPercentageCondition {
  attributePath: string | null;
  operator: null;
  rolloutPercentage: number | null;
  sortOrder: number;
  type: "percentage_rollout";
  value: null;
}
