import { describe, expect, it, vi } from "vitest";

import type { FeatureGateFlags, FeatureGateStatus } from "./index";
import { FeatureGate, FeatureGateConfigurationError, FeatureGateRequestError } from "./index";

const flags: FeatureGateFlags = {
  checkout: {
    defaultValue: true,
  },
  heading: {
    defaultValue: "Welcome",
  },
  pageSize: {
    defaultValue: 25,
  },
  theme: {
    defaultValue: { mode: "dark" },
  },
  targetedCheckout: {
    defaultValue: false,
    rules: [
      {
        conditions: [
          { attributePath: "plan", operator: "equals", type: "attribute_match", value: "pro" },
        ],
        conditionsMatch: "all",
        value: true,
      },
    ],
  },
};

const featureGate = new FeatureGate({ flags });

describe("FeatureGate", () => {
  it("evaluates each supported value type", () => {
    expect(featureGate.getBooleanValue("checkout", false)).toBe(true);
    expect(featureGate.getStringValue("heading", "Default")).toBe("Welcome");
    expect(featureGate.getNumberValue("pageSize", 20)).toBe(25);
    expect(featureGate.getObjectValue("theme", { mode: "system" })).toEqual({ mode: "dark" });
  });

  it("returns the caller default when a flag is missing", () => {
    expect(featureGate.getBooleanValue("missing", false)).toBe(false);
  });

  it("passes evaluation context to targeting rules", () => {
    expect(
      featureGate.getBooleanValue("targetedCheckout", false, {
        attributes: { plan: "pro" },
        targetingKey: "customer-123",
      }),
    ).toBe(true);
  });

  it("returns evaluation details", () => {
    expect(featureGate.getBooleanDetails("checkout", false)).toEqual({
      flagKey: "checkout",
      reason: "environment_default",
      usedDefault: false,
      value: true,
    });
  });

  it("loads and evaluates a runtime snapshot", async () => {
    const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetchSnapshot: typeof fetch = async (input, init) => {
      requests.push({ input, init });

      return new Response(
        JSON.stringify({
          snapshot: {
            flags: [
              {
                defaultValue: true,
                key: "remote-checkout",
                killSwitch: { active: false },
                rules: [],
              },
            ],
            version: "snapshot-v1",
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const remoteFeatureGate = new FeatureGate({
      apiBaseUrl: "https://api.example.test/",
      fetch: fetchSnapshot,
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    await remoteFeatureGate.initialize();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("https://api.example.test/v1/snapshot");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
      "Bearer fg_runtime_test",
    );
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(remoteFeatureGate.getBooleanValue("remote-checkout", true)).toBe(true);
  });

  it("shares one initialization attempt across every call", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchSnapshot = vi.fn(() => responsePromise);
    const remoteFeatureGate = new FeatureGate({
      fetch: fetchSnapshot,
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    const firstInitialization = remoteFeatureGate.initialize();
    const secondInitialization = remoteFeatureGate.initialize();

    expect(secondInitialization).toBe(firstInitialization);
    expect(fetchSnapshot).toHaveBeenCalledOnce();

    resolveResponse?.(
      Response.json({
        snapshot: {
          flags: [],
          version: "snapshot-v1",
        },
      }),
    );

    await Promise.all([firstInitialization, secondInitialization]);
    await remoteFeatureGate.initialize();

    expect(fetchSnapshot).toHaveBeenCalledOnce();
  });

  it("keeps bootstrap flags when initialization fails", async () => {
    const failedRequests: Array<() => Promise<Response>> = [
      async () => new Response(null, { status: 500 }),
      async () => new Response("not json"),
      async () => Response.json({ snapshot: { flags: [{ key: "invalid" }] } }),
    ];

    for (const fetchSnapshot of failedRequests) {
      const bootstrappedFeatureGate = new FeatureGate({
        fetch: fetchSnapshot,
        flags,
        pollIntervalMs: 0,
        runtimeApiKey: "fg_runtime_test",
      });

      await expect(bootstrappedFeatureGate.initialize()).rejects.toThrow();
      expect(bootstrappedFeatureGate.getBooleanValue("checkout", false)).toBe(true);
    }
  });

  it("allows initialization to be retried after a failed attempt", async () => {
    let requestCount = 0;
    const remoteFeatureGate = new FeatureGate({
      fetch: async () => {
        requestCount += 1;
        return requestCount === 1
          ? new Response(null, { status: 503 })
          : snapshotResponse("snapshot-v1", true);
      },
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    await expect(remoteFeatureGate.initialize()).rejects.toBeInstanceOf(FeatureGateRequestError);
    await remoteFeatureGate.initialize();

    expect(requestCount).toBe(2);
    expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);
  });

  it("rejects remote initialization in local-only mode", async () => {
    const localFeatureGate = new FeatureGate({ flags });

    await expect(localFeatureGate.initialize()).rejects.toBeInstanceOf(
      FeatureGateConfigurationError,
    );
  });

  it("rejects invalid lifecycle durations", () => {
    expect(() => new FeatureGate({ flags, pollIntervalMs: -1 })).toThrowError(
      FeatureGateConfigurationError,
    );
    expect(
      () => new FeatureGate({ flags, requestTimeoutMs: 0, runtimeApiKey: "fg_runtime_test" }),
    ).toThrowError(FeatureGateConfigurationError);
    expect(
      () =>
        new FeatureGate({
          pollIntervalMs: 0,
          runtimeApiKey: "fg_runtime_test",
          syncMode: "streaming",
        }),
    ).toThrowError(FeatureGateConfigurationError);
  });

  it("reports snapshot lifecycle state and isolates consumer callbacks", async () => {
    const changes: Array<{ previousVersion?: string; version: string }> = [];
    const statuses: FeatureGateStatus[] = [];
    let requestCount = 0;
    const remoteFeatureGate = new FeatureGate({
      fetch: async () => {
        requestCount += 1;

        if (requestCount === 2) {
          return new Response(null, { status: 503 });
        }

        return snapshotResponse(`snapshot-v${requestCount === 1 ? 1 : 2}`, true);
      },
      onSnapshotChange: (change) => {
        changes.push(change);
        throw new Error("snapshot callback failed");
      },
      onStatusChange: (status) => {
        statuses.push(status);
        throw new Error("status callback failed");
      },
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    expect(remoteFeatureGate.getStatus()).toEqual({
      snapshotSource: "none",
      state: "not_ready",
      streamState: "disabled",
    });

    await remoteFeatureGate.initialize();
    expect(remoteFeatureGate.getStatus()).toMatchObject({
      snapshotSource: "remote",
      snapshotVersion: "snapshot-v1",
      state: "ready",
      streamState: "disabled",
    });

    await expect(remoteFeatureGate.refresh()).rejects.toBeInstanceOf(FeatureGateRequestError);
    expect(remoteFeatureGate.getStatus()).toMatchObject({
      lastError: { kind: "request", status: 503 },
      snapshotSource: "remote",
      snapshotVersion: "snapshot-v1",
      state: "stale",
    });

    await remoteFeatureGate.refresh();
    expect(remoteFeatureGate.getStatus()).toMatchObject({
      snapshotSource: "remote",
      snapshotVersion: "snapshot-v2",
      state: "ready",
    });
    expect(remoteFeatureGate.getStatus().lastError).toBeUndefined();
    expect(changes).toEqual([
      { version: "snapshot-v1" },
      { previousVersion: "snapshot-v1", version: "snapshot-v2" },
    ]);
    expect(statuses.length).toBeGreaterThanOrEqual(3);

    remoteFeatureGate.close();
    expect(remoteFeatureGate.getStatus()).toMatchObject({
      snapshotSource: "remote",
      snapshotVersion: "snapshot-v2",
      state: "closed",
      streamState: "disabled",
    });
    expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);
  });

  it("distinguishes local and bootstrap snapshot sources", async () => {
    expect(new FeatureGate({ flags }).getStatus()).toEqual({
      snapshotSource: "local",
      state: "ready",
      streamState: "disabled",
    });

    const bootstrappedFeatureGate = new FeatureGate({
      fetch: async () => new Response(null, { status: 503 }),
      flags,
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    expect(bootstrappedFeatureGate.getStatus()).toMatchObject({
      snapshotSource: "bootstrap",
      state: "ready",
    });
    await expect(bootstrappedFeatureGate.initialize()).rejects.toBeInstanceOf(
      FeatureGateRequestError,
    );
    expect(bootstrappedFeatureGate.getStatus()).toMatchObject({
      snapshotSource: "bootstrap",
      state: "stale",
    });
  });

  it("uses streaming invalidation by default and keeps snapshots authoritative", async () => {
    let snapshotRequestCount = 0;
    let stream: LiveStream | undefined;
    const changes: string[] = [];
    const remoteFeatureGate = new FeatureGate({
      apiBaseUrl: "https://api.example.test",
      fetch: async (input, init) => {
        if (String(input).endsWith("/v1/snapshot/stream")) {
          stream = createLiveStream(init?.signal);
          return stream.response;
        }

        snapshotRequestCount += 1;
        return snapshotResponse(`snapshot-v${snapshotRequestCount}`, snapshotRequestCount > 1);
      },
      onSnapshotChange: ({ version }) => changes.push(version),
      pollIntervalMs: 60_000,
      runtimeApiKey: "fg_runtime_test",
    });

    await remoteFeatureGate.initialize();
    await vi.waitFor(() => expect(remoteFeatureGate.getStatus().streamState).toBe("connected"));

    stream?.send("event: snapshot.ready\nid: snapshot-v1\ndata: {}\n\n");
    await flushMicrotasks();
    expect(snapshotRequestCount).toBe(1);

    stream?.send(
      'event: snapshot.invalidate\nid: snapshot-v2\ndata: {"version":"snapshot-v2"}\n\n',
    );
    await vi.waitFor(() => expect(snapshotRequestCount).toBe(2));

    expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);
    expect(changes).toEqual(["snapshot-v1", "snapshot-v2"]);
    remoteFeatureGate.close();
  });

  it("reconciles an invalidation that arrives during an in-flight refresh", async () => {
    let resolveSecondRefresh: ((response: Response) => void) | undefined;
    const secondRefresh = new Promise<Response>((resolve) => {
      resolveSecondRefresh = resolve;
    });
    let snapshotRequestCount = 0;
    let stream: LiveStream | undefined;
    const remoteFeatureGate = new FeatureGate({
      fetch: async (input, init) => {
        if (String(input).endsWith("/v1/snapshot/stream")) {
          stream = createLiveStream(init?.signal);
          return stream.response;
        }

        snapshotRequestCount += 1;

        if (snapshotRequestCount === 1) {
          return snapshotResponse("snapshot-v1", false);
        }

        if (snapshotRequestCount === 2) {
          return secondRefresh;
        }

        return snapshotResponse("snapshot-v3", true);
      },
      pollIntervalMs: 60_000,
      runtimeApiKey: "fg_runtime_test",
    });

    await remoteFeatureGate.initialize();
    await vi.waitFor(() => expect(remoteFeatureGate.getStatus().streamState).toBe("connected"));

    const manualRefresh = remoteFeatureGate.refresh();
    stream?.send(
      'event: snapshot.invalidate\nid: snapshot-v3\ndata: {"version":"snapshot-v3"}\n\n',
    );
    resolveSecondRefresh?.(snapshotResponse("snapshot-v2", false));
    await manualRefresh;
    await vi.waitFor(() => expect(snapshotRequestCount).toBe(3));

    expect(remoteFeatureGate.getStatus().snapshotVersion).toBe("snapshot-v3");
    expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);
    remoteFeatureGate.close();
  });

  it("reconnects a dropped stream with bounded jitter", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      let streamRequestCount = 0;
      const remoteFeatureGate = new FeatureGate({
        fetch: async (input) => {
          if (String(input).endsWith("/v1/snapshot/stream")) {
            streamRequestCount += 1;
            return new Response("");
          }

          return snapshotResponse("snapshot-v1", true);
        },
        pollIntervalMs: 60_000,
        runtimeApiKey: "fg_runtime_test",
      });

      await remoteFeatureGate.initialize();
      await flushMicrotasks();
      expect(streamRequestCount).toBe(1);
      expect(remoteFeatureGate.getStatus().streamState).toBe("reconnecting");

      await vi.advanceTimersByTimeAsync(500);
      expect(streamRequestCount).toBe(2);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(999);
      expect(streamRequestCount).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(streamRequestCount).toBe(3);
      remoteFeatureGate.close();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("honors Retry-After before the next automatic poll", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      let requestCount = 0;
      const remoteFeatureGate = new FeatureGate({
        fetch: async () => {
          requestCount += 1;

          return requestCount === 2
            ? new Response(null, { headers: { "retry-after": "5" }, status: 429 })
            : snapshotResponse(`snapshot-v${requestCount}`, true);
        },
        pollIntervalMs: 1_000,
        runtimeApiKey: "fg_runtime_test",
        syncMode: "polling",
      });

      await remoteFeatureGate.initialize();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(requestCount).toBe(2);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(requestCount).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(requestCount).toBe(3);
      remoteFeatureGate.close();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("aborts in-flight work and rejects lifecycle calls after closing", async () => {
    const remoteFeatureGate = new FeatureGate({
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });
    const initialization = remoteFeatureGate.initialize();

    remoteFeatureGate.close();

    await expect(initialization).rejects.toBeInstanceOf(FeatureGateRequestError);
    await expect(remoteFeatureGate.refresh()).rejects.toBeInstanceOf(FeatureGateConfigurationError);
    await expect(remoteFeatureGate.initialize()).rejects.toBeInstanceOf(
      FeatureGateConfigurationError,
    );
    expect(remoteFeatureGate.getStatus().state).toBe("closed");
  });

  it("shares concurrent manual refreshes", async () => {
    let requestCount = 0;
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchSnapshot: typeof fetch = async () => {
      requestCount += 1;
      return requestCount === 1 ? snapshotResponse("snapshot-v1", false) : refreshResponse;
    };
    const remoteFeatureGate = new FeatureGate({
      fetch: fetchSnapshot,
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    await remoteFeatureGate.initialize();
    const firstRefresh = remoteFeatureGate.refresh();
    const secondRefresh = remoteFeatureGate.refresh();

    expect(secondRefresh).toBe(firstRefresh);
    expect(requestCount).toBe(2);

    resolveRefresh?.(snapshotResponse("snapshot-v2", true));
    await Promise.all([firstRefresh, secondRefresh]);

    expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);
  });

  it("keeps the last successful snapshot after a transient refresh failure", async () => {
    let requestCount = 0;
    const fetchSnapshot: typeof fetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? snapshotResponse("snapshot-v1", true)
        : new Response(null, { status: 503 });
    };
    const remoteFeatureGate = new FeatureGate({
      fetch: fetchSnapshot,
      pollIntervalMs: 0,
      runtimeApiKey: "fg_runtime_test",
    });

    await remoteFeatureGate.initialize();
    await expect(remoteFeatureGate.refresh()).rejects.toBeInstanceOf(FeatureGateRequestError);

    expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);
  });

  it("polls after initialization and stops when closed", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      let requestCount = 0;
      const fetchSnapshot: typeof fetch = async () => {
        requestCount += 1;
        return snapshotResponse(`snapshot-v${requestCount}`, requestCount > 1);
      };
      const remoteFeatureGate = new FeatureGate({
        fetch: fetchSnapshot,
        pollIntervalMs: 1_000,
        runtimeApiKey: "fg_runtime_test",
        syncMode: "polling",
      });

      await remoteFeatureGate.initialize();
      expect(remoteFeatureGate.getBooleanValue("checkout", true)).toBe(false);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(requestCount).toBe(2);
      expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);

      remoteFeatureGate.close();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(requestCount).toBe(2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("reports automatic refresh failures and keeps polling", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      const errors: Error[] = [];
      let requestCount = 0;
      const remoteFeatureGate = new FeatureGate({
        fetch: async () => {
          requestCount += 1;
          return requestCount === 1
            ? snapshotResponse("snapshot-v1", true)
            : new Response(null, { status: 503 });
        },
        onError: (error) => {
          errors.push(error);
          throw new Error("consumer callback failed");
        },
        pollIntervalMs: 1_000,
        runtimeApiKey: "fg_runtime_test",
        syncMode: "polling",
      });

      await remoteFeatureGate.initialize();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(requestCount).toBe(3);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toBeInstanceOf(FeatureGateRequestError);
      expect(remoteFeatureGate.getBooleanValue("checkout", false)).toBe(true);

      remoteFeatureGate.close();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

function snapshotResponse(
  version: string,
  value: boolean,
  headers?: ResponseInit["headers"],
): Response {
  return Response.json(
    {
      snapshot: {
        flags: [
          {
            defaultValue: value,
            key: "checkout",
            killSwitch: { active: false },
            rules: [],
          },
        ],
        version,
      },
    },
    { headers },
  );
}

interface LiveStream {
  response: Response;
  send(value: string): void;
}

function createLiveStream(signal?: AbortSignal | null): LiveStream {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    }),
  );

  signal?.addEventListener(
    "abort",
    () => {
      if (!closed) {
        closed = true;
        streamController?.error(signal.reason);
      }
    },
    { once: true },
  );

  return {
    response,
    send(value) {
      if (!closed) {
        streamController?.enqueue(encoder.encode(value));
      }
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}
