import { describe, expect, it, vi } from "vitest";

import type { FeatureGateFlags } from "./index";
import { FeatureGate } from "./index";

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
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const remoteFeatureGate = new FeatureGate({
      apiBaseUrl: "https://api.example.test/",
      fetch: fetchSnapshot,
      runtimeApiKey: "fg_runtime_test",
    });

    await remoteFeatureGate.initialize();

    expect(requests).toEqual([
      {
        input: "https://api.example.test/v1/snapshot",
        init: { headers: { authorization: "Bearer fg_runtime_test" } },
      },
    ]);
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
        runtimeApiKey: "fg_runtime_test",
      });

      await expect(bootstrappedFeatureGate.initialize()).rejects.toThrow();
      expect(bootstrappedFeatureGate.getBooleanValue("checkout", false)).toBe(true);
    }
  });

  it("rejects remote initialization in local-only mode", async () => {
    const localFeatureGate = new FeatureGate({ flags });

    await expect(localFeatureGate.initialize()).rejects.toThrow(
      "FeatureGate requires a runtime API key",
    );
  });
});
