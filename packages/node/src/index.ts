export {
  FeatureGateAuthenticationError,
  FeatureGateConfigurationError,
  FeatureGateError,
  FeatureGateRequestError,
} from "./errors";
export type { FeatureGateOptions } from "./featuregate";
export { FeatureGate } from "./featuregate";
export type {
  FeatureGateErrorSummary,
  FeatureGateRefreshResult,
  FeatureGateSnapshotChange,
  FeatureGateSnapshotSource,
  FeatureGateState,
  FeatureGateStatus,
  FeatureGateStreamState,
  FeatureGateSyncMode,
} from "./types";

export type {
  FeatureGateEvaluationContext,
  FeatureGateEvaluationReason,
  FeatureGateEvaluationResult,
  FeatureGateFlag,
  FeatureGateFlags,
  FeatureGateFlagValue,
  FeatureGateJsonObject,
  FeatureGateJsonPrimitive,
  FeatureGateJsonValue,
} from "@featuregate/evaluation";
