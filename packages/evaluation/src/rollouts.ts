import { getRolloutBucket } from "./hash";

export function matchesPercentage(
  flagKey: string,
  attributePath: string,
  attributeValue: string,
  percentage: number,
): boolean {
  return getRolloutBucket(flagKey, attributePath, attributeValue) < percentage;
}
