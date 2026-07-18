# Packages

This directory will contain the public JavaScript and TypeScript SDKs for FeatureGate.

The SDK implementations are still being extracted from the main FeatureGate repository. For now,
only the private `@featuregate/tsconfig` workspace lives here so every future package can share the
same strict compiler defaults.

| Planned directory          | Package                                 | Runtime                                       |
| -------------------------- | --------------------------------------- | --------------------------------------------- |
| `server`                   | `@featuregate/server`                   | Trusted server-side JavaScript and TypeScript |
| `browser`                  | `@featuregate/browser`                  | Browser JavaScript                            |
| `react`                    | `@featuregate/react`                    | React applications                            |
| `openfeature-provider`     | `@featuregate/openfeature-provider`     | OpenFeature server SDK                        |
| `openfeature-web-provider` | `@featuregate/openfeature-web-provider` | OpenFeature web and React SDKs                |

Public package manifests will be added with their implementations. Empty publishable packages are
intentionally not scaffolded.
