export type FeatureGateJsonPrimitive = string | number | boolean | null;

export type FeatureGateJsonValue =
  | FeatureGateJsonPrimitive
  | readonly FeatureGateJsonValue[]
  | FeatureGateJsonObject;

export type FeatureGateJsonObject = {
  readonly [key: string]: FeatureGateJsonValue;
};

export type FeatureGateFlagValue = boolean | string | number | FeatureGateJsonObject;

export type FeatureGateLocalValues = Readonly<Record<string, unknown>>;

export type FeatureGateLocalEvaluationReason =
  | "override"
  | "bootstrap"
  | "caller_default"
  | "type_mismatch";

export interface FeatureGateLocalEvaluationDetails<TValue extends FeatureGateFlagValue> {
  flagKey: string;
  reason: FeatureGateLocalEvaluationReason;
  usedDefault: boolean;
  value: TValue;
}
