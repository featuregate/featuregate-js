# @featuregate/server

FeatureGate's official server-side JavaScript and TypeScript SDK. It loads an environment snapshot
from FeatureGate, evaluates flags locally, and refreshes configuration in the background.

## Requirements

- Node.js 22 or newer
- ECMAScript modules (ESM)

The package is ESM-only.

## Installation

```sh
npm install @featuregate/server
```

## Quick start

Create one shared `FeatureGate` instance for each runtime API key and reuse it across requests.

```ts
import { FeatureGate } from "@featuregate/server";

const featureGate = new FeatureGate({
  runtimeApiKey: process.env.FEATUREGATE_RUNTIME_API_KEY!,
});

await featureGate.initialize();

const checkoutEnabled = featureGate.getBooleanValue("checkout", false, {
  attributes: { account: { plan: "pro" } },
  targetingKey: "customer-123",
});

// Stop background polling during application shutdown.
featureGate.close();
```

`initialize()` loads the first remote snapshot. Concurrent initialization calls share the same
request, and a failed initialization can be retried. Once initialized, the SDK polls every 30
seconds by default. Failed refreshes keep the last successful snapshot available.

## Configuration

`FeatureGate` requires `runtimeApiKey`, `flags`, or both.

| Option             | Type                                | Default                       | Description                                                       |
| ------------------ | ----------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `runtimeApiKey`    | `string`                            | —                             | Secret key used to load the environment snapshot.                 |
| `flags`            | `FeatureGateFlags`                  | `{}`                          | In-memory flags available immediately for local evaluation.       |
| `apiBaseUrl`       | `string`                            | `https://api.featuregate.dev` | FeatureGate API base URL.                                         |
| `fetch`            | `typeof fetch`                      | `globalThis.fetch`            | Custom fetch implementation, primarily for tests or custom hosts. |
| `pollIntervalMs`   | `number`                            | `30000`                       | Refresh interval. Set to `0` to disable automatic polling.        |
| `requestTimeoutMs` | `number`                            | `2000`                        | Maximum duration of each snapshot request.                        |
| `onError`          | `(error: FeatureGateError) => void` | —                             | Called when an automatic refresh fails.                           |

The `onError` callback is for background polling failures. Errors from `initialize()` and
`refresh()` are returned through their rejected promises. An exception thrown by `onError` is
isolated by the SDK and does not stop future refresh attempts.

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

Call `close()` during application shutdown. It stops automatic polling while leaving the last
snapshot available for evaluation.

## Errors

All SDK errors extend `FeatureGateError`:

| Error                            | Meaning                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `FeatureGateAuthenticationError` | The API rejected the runtime key with `401` or `403`.      |
| `FeatureGateConfigurationError`  | SDK options or the returned snapshot were invalid.         |
| `FeatureGateRequestError`        | A request failed, timed out, was rate limited, or hit 5xx. |

```ts
import { FeatureGate, FeatureGateAuthenticationError } from "@featuregate/server";

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

## License

MIT
