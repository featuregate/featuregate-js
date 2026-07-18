import {
  FeatureGateAuthenticationError,
  FeatureGateConfigurationError,
  FeatureGateRequestError,
} from "./errors";
import { readSnapshot } from "./snapshot";
import type { RemoteSnapshotResult } from "./types";

interface RemoteSnapshotLoaderOptions {
  apiBaseUrl: string;
  fetch: typeof fetch;
  requestTimeoutMs: number;
  runtimeApiKey: string;
}

export class RemoteSnapshotLoader {
  readonly #apiBaseUrl: string;
  #etag: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;
  readonly #runtimeApiKey: string;

  constructor(options: RemoteSnapshotLoaderOptions) {
    if (!Number.isFinite(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new FeatureGateConfigurationError("requestTimeoutMs must be a positive number.");
    }

    this.#apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#runtimeApiKey = options.runtimeApiKey;
  }

  async load(currentVersion?: string): Promise<RemoteSnapshotResult> {
    const headers = new Headers({
      authorization: `Bearer ${this.#runtimeApiKey}`,
    });

    if (this.#etag) {
      headers.set("if-none-match", this.#etag);
    }

    let response: Response;

    try {
      response = await this.#fetch(`${this.#apiBaseUrl}/v1/snapshot`, {
        headers,
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      });
    } catch (cause) {
      throw new FeatureGateRequestError("FeatureGate snapshot request failed.", undefined, {
        cause,
      });
    }

    if (response.status === 304) {
      if (!currentVersion) {
        throw new FeatureGateConfigurationError(
          "FeatureGate returned 304 before a snapshot was available.",
          response.status,
        );
      }

      return { status: "not_modified", version: currentVersion };
    }

    if (response.status === 401 || response.status === 403) {
      throw new FeatureGateAuthenticationError(
        `FeatureGate rejected the runtime API key with status ${response.status}.`,
        response.status,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      throw new FeatureGateRequestError(
        `FeatureGate snapshot request failed with status ${response.status}.`,
        response.status,
      );
    }

    if (!response.ok) {
      throw new FeatureGateConfigurationError(
        `FeatureGate snapshot request failed with status ${response.status}.`,
        response.status,
      );
    }

    let value: unknown;

    try {
      value = await response.json();
    } catch (cause) {
      throw new FeatureGateConfigurationError(
        "FeatureGate returned an invalid snapshot response.",
        response.status,
        { cause },
      );
    }

    const snapshot = readSnapshot(value);
    this.#etag = response.headers.get("etag") ?? JSON.stringify(snapshot.version);

    return { snapshot, status: "updated" };
  }
}
