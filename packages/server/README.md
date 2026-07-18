# @featuregate/server

FeatureGate's official server-side JavaScript and TypeScript SDK.

The current implementation supports local evaluation from an in-memory flag snapshot. Networking,
configuration refresh, caching, and lifecycle management will be added separately.

```ts
import { FeatureGate } from "@featuregate/server";

const featureGate = new FeatureGate({
  flags: {
    checkout: {
      disabledValue: false,
      enabled: true,
      enabledValue: true,
    },
  },
});

const checkoutEnabled = featureGate.getBooleanValue("checkout", false);
```
