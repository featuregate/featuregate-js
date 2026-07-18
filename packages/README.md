# Packages

This directory contains the FeatureGate server SDK and the private workspaces used to build it.

The private `@featuregate/evaluation` workspace owns runtime-neutral local evaluation primitives,
while `@featuregate/tsconfig` gives each package the same strict compiler defaults.

| Directory    | Package                   | Visibility | Purpose                                       |
| ------------ | ------------------------- | ---------- | --------------------------------------------- |
| `server`     | `@featuregate/server`     | Public     | Trusted server-side JavaScript and TypeScript |
| `evaluation` | `@featuregate/evaluation` | Private    | Runtime-neutral local evaluation              |
| `tsconfig`   | `@featuregate/tsconfig`   | Private    | Shared strict TypeScript configuration        |
