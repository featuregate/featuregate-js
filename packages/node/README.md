# @featuregate/node

FeatureGate's official Node.js SDK. It loads an environment snapshot from FeatureGate, evaluates
flags locally, and refreshes configuration in the background.

## Requirements

- Node.js 22 or newer
- ECMAScript modules (ESM)

The package is ESM-only.

## Installation

```sh
npm install @featuregate/node
```

## Quick start

Create one shared `FeatureGate` instance for each runtime API key and reuse it across requests.

```ts
import { FeatureGate } from "@featuregate/node";

const featureGate = new FeatureGate({
  runtimeApiKey: process.env.FEATUREGATE_RUNTIME_API_KEY!,
});

await featureGate.initialize();

const checkoutEnabled = featureGate.getBooleanValue("checkout", false, {
  attributes: { account: { plan: "pro" } },
  targetingKey: "customer-123",
});

// Stop streaming, polling, and in-flight SDK requests during application shutdown.
featureGate.close();
```

`initialize()` loads the first remote snapshot. Concurrent initialization calls share the same
request, and a failed initialization can be retried. Once initialized, the SDK opens a best-effort
snapshot invalidation stream and retains 30-second polling as its authoritative fallback. Failed
refreshes keep the last successful snapshot available.

## Configuration

`FeatureGate` requires `runtimeApiKey`, `flags`, or both.

| Option             | Type                                          | Default                       | Description                                                             |
| ------------------ | --------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `runtimeApiKey`    | `string`                                      | —                             | Secret key used to load the environment snapshot.                       |
| `flags`            | `FeatureGateFlags`                            | `{}`                          | In-memory flags available immediately for local evaluation.             |
| `apiBaseUrl`       | `string`                                      | `https://api.featuregate.dev` | FeatureGate API base URL.                                               |
| `fetch`            | `typeof fetch`                                | `globalThis.fetch`            | Custom fetch implementation, primarily for tests or custom hosts.       |
| `syncMode`         | `"streaming" \| "polling" \| "manual"`        | `"streaming"`                 | Background synchronization strategy for remote clients.                 |
| `pollIntervalMs`   | `number`                                      | `30000`                       | Polling cadence and streaming safety-net interval.                      |
| `requestTimeoutMs` | `number`                                      | `2000`                        | Maximum duration of each snapshot request.                              |
| `onError`          | `(error: FeatureGateError) => void`           | —                             | Called when background polling or streaming fails.                      |
| `onSnapshotChange` | `(change: FeatureGateSnapshotChange) => void` | —                             | Called after a different remote snapshot version is atomically applied. |
| `onStatusChange`   | `(status: FeatureGateStatus) => void`         | —                             | Called when observable lifecycle, freshness, or stream state changes.   |

Errors from `initialize()` and `refresh()` are returned through their rejected promises. Callback
exceptions are isolated by the SDK and do not stop synchronization. Existing clients that set
`pollIntervalMs: 0` without `syncMode` continue to use manual synchronization with no background
network work.

## Evaluating flags

Every evaluation requires a production-safe default. The SDK returns that default when the flag
does not exist or its configured value has a different type.

```ts
const enabled = featureGate.getBooleanValue("checkout", false, context);
const heading = featureGate.getStringValue("checkout-heading", "Checkout", context);
const pageSize = featureGate.getNumberValue("page-size", 25, context);
const theme = featureGate.getObjectValue("theme", { mode: "system" }, context);
```

Each value getter has a corresponding details getter:

```ts
const details = featureGate.getBooleanDetails("checkout", false, context);

console.log(details.value);
console.log(details.reason);
console.log(details.usedDefault);
```

Evaluation reasons are:

| Reason                | Meaning                                                         |
| --------------------- | --------------------------------------------------------------- |
| `targeting_match`     | An ordered targeting rule matched the evaluation context.       |
| `environment_default` | No targeting rule matched, so the environment value was used.   |
| `kill_switch`         | The flag's emergency kill switch forced the value off.          |
| `flag_not_found`      | The snapshot did not contain the requested flag.                |
| `type_mismatch`       | The configured value did not match the requested getter's type. |

### Evaluation context

Use `targetingKey` for a stable subject identifier and `attributes` for application-specific data.
Nested attributes can be addressed by dot-separated targeting paths configured in FeatureGate.
The SDK's `attributes` object corresponds to the root of the direct API's `context` object. For
example, SDK attributes `{ account: { plan: "pro" } }` are equivalent to sending
`{ "context": { "account": { "plan": "pro" } } }` to `POST /v1/evaluate`.

```ts
const context = {
  targetingKey: "customer-123",
  attributes: {
    account: {
      id: "account-456",
      plan: "pro",
    },
    country: "AU",
  },
};
```

Stable identifiers are important for deterministic percentage rollouts. The same flag,
attribute path, and attribute value always produce the same rollout bucket across evaluations.

## Local and bootstrap evaluation

Provide `flags` without a runtime key for fully local evaluation:

```ts
const featureGate = new FeatureGate({
  flags: {
    checkout: {
      defaultValue: true,
    },
  },
});

featureGate.getBooleanValue("checkout", false); // true
```

Local-only instances are ready immediately and do not need `initialize()`. Calling `initialize()`
or `refresh()` without a runtime key returns a `FeatureGateConfigurationError`.

You can provide both `flags` and `runtimeApiKey` to make bootstrap values available before remote
initialization completes. Bootstrap values remain available if initialization fails and are
atomically replaced after a successful refresh.

## Synchronization and status

Remote clients use `streaming` mode by default. The stream carries only version and invalidation
hints; the SDK always refetches `/v1/snapshot` with ETag revalidation before changing local flags.
Polling continues as a safety net if the stream disconnects. Use `polling` for hosts that cannot
keep long-lived HTTP connections, or `manual` when only explicit `refresh()` calls are wanted.

Use `getStatus()` for readiness and freshness checks:

```ts
const status = featureGate.getStatus();

console.log(status.state); // not_ready, ready, stale, error, or closed
console.log(status.snapshotSource); // none, local, bootstrap, or remote
console.log(status.snapshotVersion);
console.log(status.streamState); // disabled, connecting, connected, or reconnecting
```

Transient refresh failures mark an available snapshot as `stale` while continuing to serve it.
Authentication, configuration, and pre-snapshot request failures produce `error`. A later
successful refresh returns the client to `ready` and clears the redacted `lastError` summary.

## Refreshing and shutdown

Call `refresh()` to request configuration immediately:

```ts
const result = await featureGate.refresh();

if (result.status === "updated") {
  console.log(`Loaded snapshot ${result.version}`);
}
```

Concurrent refresh calls share one request. FeatureGate uses ETag revalidation, so an unchanged
snapshot returns `not_modified` without replacing local state.

Call `close()` during application shutdown. It stops streaming and polling, aborts in-flight SDK
requests, and leaves the last snapshot available for evaluation. Further lifecycle calls reject
with `FeatureGateConfigurationError`.

## Errors

All SDK errors extend `FeatureGateError`:

| Error                            | Meaning                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `FeatureGateAuthenticationError` | The API rejected the runtime key with `401` or `403`.      |
| `FeatureGateConfigurationError`  | SDK options or the returned snapshot were invalid.         |
| `FeatureGateRequestError`        | A request failed, timed out, was rate limited, or hit 5xx. |

```ts
import { FeatureGate, FeatureGateAuthenticationError } from "@featuregate/node";

try {
  await featureGate.initialize();
} catch (error) {
  if (error instanceof FeatureGateAuthenticationError) {
    // The runtime key is missing, invalid, or no longer authorized.
  }
}
```

## Security

Runtime API keys are secrets. Use this package only in trusted server environments, load keys from
your secret-management system, and never include them in browser or mobile application bundles.

Feature flags are not an authorization boundary. Continue enforcing permissions, entitlements,
and other security-sensitive decisions in your application.

## Changelog

See the [changelog](./CHANGELOG.md) for consumer-facing release notes.

## License

MIT
