import type { FeatureGateFlags } from "@featuregate/evaluation";

export interface FeatureGateConfigurationSnapshot {
  flags: FeatureGateFlags;
  version: string;
}

/** Result of refreshing the locally cached FeatureGate snapshot. */
export interface FeatureGateRefreshResult {
  /** Whether the refresh loaded a new snapshot or confirmed that the current one is unchanged. */
  status: "not_modified" | "updated";
  /** Version of the snapshot available after the refresh. */
  version: string;
}
