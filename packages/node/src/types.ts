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

/** Background synchronization strategy used by a remote FeatureGate client. */
export type FeatureGateSyncMode = "manual" | "polling" | "streaming";

/** Current lifecycle state of a FeatureGate client. */
export type FeatureGateState = "closed" | "error" | "not_ready" | "ready" | "stale";

/** Source of the snapshot currently used for local evaluation. */
export type FeatureGateSnapshotSource = "bootstrap" | "local" | "none" | "remote";

/** Current state of the optional snapshot invalidation stream. */
export type FeatureGateStreamState = "connected" | "connecting" | "disabled" | "reconnecting";

/** Redacted information about the most recent SDK synchronization error. */
export interface FeatureGateErrorSummary {
  /** Broad error category suitable for health checks and metrics. */
  kind: "authentication" | "configuration" | "request" | "stream";
  /** Safe SDK-authored error message. */
  message: string;
  /** Time at which the error was observed. */
  occurredAt: Date;
  /** Associated HTTP status, when available. */
  status?: number;
}

/** Read-only lifecycle and freshness information for a FeatureGate client. */
export interface FeatureGateStatus {
  /** Most recent background or manual synchronization error, when present. */
  lastError?: FeatureGateErrorSummary;
  /** Most recent completed snapshot refresh attempt. */
  lastRefreshAt?: Date;
  /** Most recent successful snapshot refresh. */
  lastSuccessfulRefreshAt?: Date;
  /** Source of the flags currently used for local evaluation. */
  snapshotSource: FeatureGateSnapshotSource;
  /** Version of the active remote snapshot, when one has loaded. */
  snapshotVersion?: string;
  /** Client readiness and freshness state. */
  state: FeatureGateState;
  /** Current snapshot stream connection state. */
  streamState: FeatureGateStreamState;
}

/** Notification emitted after a different remote snapshot version is applied. */
export interface FeatureGateSnapshotChange {
  /** Previously active remote snapshot version, when one existed. */
  previousVersion?: string;
  /** Newly active remote snapshot version. */
  version: string;
}

export type RemoteSnapshotResult =
  | {
      snapshot: FeatureGateConfigurationSnapshot;
      status: "updated";
    }
  | {
      status: "not_modified";
      version: string;
    };
