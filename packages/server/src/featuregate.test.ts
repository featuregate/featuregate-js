import { describe, expect, it, vi } from "vitest";

import type { FeatureGateFlags } from "./index";
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
    }
  });

  it("reports automatic refresh failures and keeps polling", async () => {
    vi.useFakeTimers();

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
