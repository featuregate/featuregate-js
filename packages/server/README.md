# @featuregate/server

FeatureGate's official server-side JavaScript and TypeScript SDK.

The SDK loads a FeatureGate environment snapshot once during initialization, then evaluates flags
locally. Automatic refresh, caching, and background lifecycle management will be added separately.

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
```

You can also provide `flags` as an in-memory bootstrap snapshot. Bootstrap flags are available
immediately and remain available if remote initialization fails.
