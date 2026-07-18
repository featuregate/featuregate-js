# FeatureGate JavaScript SDK

[![CI](https://github.com/featuregate/featuregate-js/actions/workflows/ci.yml/badge.svg)](https://github.com/featuregate/featuregate-js/actions/workflows/ci.yml)

The official Node.js SDK for [FeatureGate](https://featuregate.dev), a feature flag platform for
safely controlling releases in server applications.

## Packages

| Package             | Use it for                                        | Credential                |
| ------------------- | ------------------------------------------------- | ------------------------- |
| `@featuregate/node` | Local flag evaluation in trusted Node.js services | Secret server runtime key |

`@featuregate/node` loads an environment snapshot, evaluates flags locally, refreshes the
snapshot in the background, and keeps serving the last successful configuration through transient
failures. See its [package documentation](./packages/node/README.md) for the complete API.

## Security model

The Node.js SDK uses secret runtime keys. Keep these keys in trusted process environments and never
include them in browser or mobile application bundles. Authorization, entitlements, billing
decisions, and other security-sensitive checks must continue to be enforced by your application.

See the [FeatureGate documentation](https://featuregate.dev/docs) for platform concepts and runtime
API behavior.

## Repository development

### Requirements

- Node.js 24.18.0 (see [`.nvmrc`](./.nvmrc))
- npm 11

Install the workspace dependencies:

```sh
npm install
```

Run the relevant quality checks:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

Use `npm run format` to write formatting changes. Turborepo coordinates package-level build,
typecheck, and test tasks; Oxlint checks the workspace as a whole.

## Repository structure

```text
.
├── .github/workflows/ci.yml  # Pull request and main-branch quality checks
├── packages/
│   ├── README.md             # Workspace package map
│   ├── evaluation/           # Private runtime-neutral evaluation primitives
│   ├── node/                 # Publishable Node.js SDK
│   └── tsconfig/             # Private shared TypeScript configuration
├── package.json              # Private npm workspace root
└── turbo.json                # Monorepo task graph
```

## Contributing

Before opening a change, run the relevant linting, typechecking, testing, and build commands. Keep
credential boundaries explicit in code, tests, and documentation. Bugs and proposals can be filed
through [GitHub Issues](https://github.com/featuregate/featuregate-js/issues).

## License

The FeatureGate JavaScript SDK is available under the [MIT License](./LICENSE).
