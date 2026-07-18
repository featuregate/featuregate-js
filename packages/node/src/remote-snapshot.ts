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

  async load(currentVersion?: string, signal?: AbortSignal): Promise<RemoteSnapshotResult> {
    const headers = this.#buildHeaders();

    if (this.#etag) {
      headers.set("if-none-match", this.#etag);
    }

    let response: Response;

    try {
      response = await this.#fetch(`${this.#apiBaseUrl}/v1/snapshot`, {
        headers,
        signal: combineSignals(AbortSignal.timeout(this.#requestTimeoutMs), signal),
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

    assertSuccessfulResponse(response, "snapshot");

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

  async openStream(signal: AbortSignal): Promise<Response> {
    let response: Response;

    try {
      response = await this.#fetch(`${this.#apiBaseUrl}/v1/snapshot/stream`, {
        headers: this.#buildHeaders("text/event-stream"),
        signal,
      });
    } catch (cause) {
      throw new FeatureGateRequestError("FeatureGate snapshot stream request failed.", undefined, {
        cause,
      });
    }

    assertSuccessfulResponse(response, "snapshot stream");

    return response;
  }

  #buildHeaders(accept?: string): Headers {
    const headers = new Headers({
      authorization: `Bearer ${this.#runtimeApiKey}`,
    });

    if (accept) {
      headers.set("accept", accept);
    }

    return headers;
  }
}

function assertSuccessfulResponse(response: Response, requestName: string): void {
  if (response.status === 401 || response.status === 403) {
    throw new FeatureGateAuthenticationError(
      `FeatureGate rejected the runtime API key with status ${response.status}.`,
      response.status,
    );
  }

  if (response.status === 429 || response.status >= 500) {
    throw new FeatureGateRequestError(
      `FeatureGate ${requestName} request failed with status ${response.status}.`,
      response.status,
      { retryAfterMs: readRetryAfter(response.headers.get("retry-after")) },
    );
  }

  if (!response.ok) {
    throw new FeatureGateConfigurationError(
      `FeatureGate ${requestName} request failed with status ${response.status}.`,
      response.status,
    );
  }
}

function combineSignals(timeoutSignal: AbortSignal, signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
}

function readRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(value);

  if (!Number.isFinite(date)) {
    return undefined;
  }

  return Math.max(0, date - Date.now());
}
