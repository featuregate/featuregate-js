export {
  FeatureGateAuthenticationError,
  FeatureGateConfigurationError,
  FeatureGateError,
  FeatureGateRequestError,
} from "./errors";
export type { FeatureGateOptions } from "./featuregate";
export { FeatureGate } from "./featuregate";
export type { FeatureGateRefreshResult } from "./types";

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
