# @featuregate/server

FeatureGate's official server-side JavaScript and TypeScript SDK.

The SDK loads a FeatureGate environment snapshot during initialization, evaluates flags locally,
and polls for configuration updates in the background. Failed refreshes leave the last successful
snapshot available.

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

// During application shutdown:
featureGate.close();
```

You can also provide `flags` as an in-memory bootstrap snapshot. Bootstrap flags are available
immediately and remain available if remote initialization fails.

Use `refresh()` to request an update immediately. Set `pollIntervalMs` to `0` when you only want
manual refreshes, and call `close()` during application shutdown to stop automatic polling.
