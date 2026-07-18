import { getRolloutBucket } from "./hash";
import type {
  FeatureGateFlagValue,
  FeatureGateRollout,
  FeatureGateRolloutAllocation,
} from "./types";

export function getRolloutValue(
  rollout: FeatureGateRollout,
  flagKey: string,
  targetingKey: string,
): FeatureGateFlagValue | undefined {
  const bucket = getRolloutBucket(flagKey, rollout.seed, targetingKey);

  return selectRolloutValue(rollout.allocations, bucket);
}

export function selectRolloutValue(
  allocations: readonly FeatureGateRolloutAllocation[],
  bucket: number,
): FeatureGateFlagValue | undefined {
  let upperBound = 0;

  for (const allocation of allocations) {
    upperBound += allocation.weight;

    if (bucket < upperBound) {
      return allocation.value;
    }
  }

  return undefined;
}
