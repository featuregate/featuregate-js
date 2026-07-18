import { describe, expect, it } from "vitest";

import {
  FeatureGateAuthenticationError,
  FeatureGateConfigurationError,
  FeatureGateRequestError,
} from "./errors";
import { RemoteSnapshotLoader } from "./remote-snapshot";

const options = {
  apiBaseUrl: "https://api.example.test/",
  requestTimeoutMs: 2_000,
  runtimeApiKey: "fg_runtime_test",
};

describe("RemoteSnapshotLoader", () => {
  it("loads snapshots with the runtime key", async () => {
    let request: { input: string | URL | Request; init?: RequestInit } | undefined;
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async (input, init) => {
        request = { input, init };
        return snapshotResponse();
      },
    });

    await expect(loader.load()).resolves.toMatchObject({
      snapshot: { version: "snapshot-v1" },
      status: "updated",
    });
    expect(request?.input).toBe("https://api.example.test/v1/snapshot");
    expect(new Headers(request?.init?.headers).get("authorization")).toBe("Bearer fg_runtime_test");
    expect(request?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("revalidates snapshots with ETags", async () => {
    const requests: RequestInit[] = [];
    const responses = [
      snapshotResponse({ etag: '"snapshot-v1"' }),
      new Response(null, { status: 304 }),
    ];
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async (_input, init) => {
        requests.push(init ?? {});
        return responses.shift()!;
      },
    });

    await loader.load();
    await expect(loader.load("snapshot-v1")).resolves.toEqual({
      status: "not_modified",
      version: "snapshot-v1",
    });
    expect(new Headers(requests[1]?.headers).get("if-none-match")).toBe('"snapshot-v1"');
  });

  it("rejects a 304 when no local snapshot exists", async () => {
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async () => new Response(null, { status: 304 }),
    });

    await expect(loader.load()).rejects.toBeInstanceOf(FeatureGateConfigurationError);
  });

  it.each([401, 403])("returns an authentication error for status %i", async (status) => {
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async () => new Response(null, { status }),
    });

    await expect(loader.load()).rejects.toBeInstanceOf(FeatureGateAuthenticationError);
  });

  it.each([429, 500, 503])("returns a request error for status %i", async (status) => {
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async () => new Response(null, { status }),
    });

    await expect(loader.load()).rejects.toBeInstanceOf(FeatureGateRequestError);
  });

  it("preserves Retry-After guidance on rate limits", async () => {
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async () => new Response(null, { headers: { "retry-after": "7" }, status: 429 }),
    });

    const error = await loader.load().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(FeatureGateRequestError);
    expect((error as FeatureGateRequestError).retryAfterMs).toBe(7_000);
  });

  it("opens an authenticated event stream", async () => {
    let request: { input: string | URL | Request; init?: RequestInit } | undefined;
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async (input, init) => {
        request = { input, init };
        return new Response("event: heartbeat\ndata: {}\n\n");
      },
    });
    const controller = new AbortController();

    await expect(loader.openStream(controller.signal)).resolves.toBeInstanceOf(Response);
    expect(request?.input).toBe("https://api.example.test/v1/snapshot/stream");
    expect(new Headers(request?.init?.headers).get("accept")).toBe("text/event-stream");
    expect(new Headers(request?.init?.headers).get("authorization")).toBe("Bearer fg_runtime_test");
    expect(request?.init?.signal).toBe(controller.signal);
  });

  it.each([
    ["an unsuccessful response", () => new Response(null, { status: 400 })],
    ["invalid JSON", () => new Response("not json")],
    ["an invalid snapshot", () => Response.json({ snapshot: { flags: [], version: "" } })],
  ])("returns a configuration error for %s", async (_name, response) => {
    const loader = new RemoteSnapshotLoader({
      ...options,
      fetch: async () => response(),
    });

    await expect(loader.load()).rejects.toBeInstanceOf(FeatureGateConfigurationError);
  });

  it("wraps network failures and request timeouts", async () => {
    const networkLoader = new RemoteSnapshotLoader({
      ...options,
      fetch: async () => Promise.reject(new Error("offline")),
    });
    const timeoutLoader = new RemoteSnapshotLoader({
      ...options,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
      requestTimeoutMs: 5,
    });

    await expect(networkLoader.load()).rejects.toBeInstanceOf(FeatureGateRequestError);
    await expect(timeoutLoader.load()).rejects.toBeInstanceOf(FeatureGateRequestError);
  });
});

function snapshotResponse(headers?: ResponseInit["headers"]): Response {
  return Response.json(
    {
      snapshot: {
        flags: [],
        version: "snapshot-v1",
      },
    },
    { headers },
  );
}
