# Packages

This directory will contain the public JavaScript and TypeScript SDKs for FeatureGate.

The SDK implementations are still being extracted from the main FeatureGate repository. The
`@featuregate/server` workspace is scaffolded but does not expose a functional SDK yet. The private
`@featuregate/evaluation` workspace owns runtime-neutral local evaluation primitives, while
`@featuregate/tsconfig` gives every package the same strict compiler defaults.

| Planned directory          | Package                                 | Runtime                                       |
| -------------------------- | --------------------------------------- | --------------------------------------------- |
| `server`                   | `@featuregate/server`                   | Trusted server-side JavaScript and TypeScript |
| `browser`                  | `@featuregate/browser`                  | Browser JavaScript                            |
| `react`                    | `@featuregate/react`                    | React applications                            |
| `openfeature-provider`     | `@featuregate/openfeature-provider`     | OpenFeature server SDK                        |
| `openfeature-web-provider` | `@featuregate/openfeature-web-provider` | OpenFeature web and React SDKs                |

The remaining public package manifests will be added with their implementations.
