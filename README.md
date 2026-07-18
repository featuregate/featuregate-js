# FeatureGate JavaScript SDKs

[![CI](https://github.com/featuregate/featuregate-js/actions/workflows/ci.yml/badge.svg)](https://github.com/featuregate/featuregate-js/actions/workflows/ci.yml)

Official JavaScript and TypeScript SDKs for [FeatureGate](https://featuregate.dev), a feature flag
platform for safely controlling releases across server and browser applications.

> [!IMPORTANT]
> This repository is under construction. The SDK implementations are being extracted from the
> main FeatureGate repository and are not yet published from this repository. Package installation
> instructions will be added when the first `0.1.0` releases are ready.

## Packages

| Package                                 | Use it for                                                      | Credential                |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| `@featuregate/server`                   | Local flag evaluation in trusted Node.js services               | Secret server runtime key |
| `@featuregate/browser`                  | Remote evaluation of client-exposed flags in browser JavaScript | Publishable client key    |
| `@featuregate/react`                    | React providers and typed hooks over the browser SDK            | Publishable client key    |
| `@featuregate/openfeature-provider`     | FeatureGate through the OpenFeature server SDK                  | Secret server runtime key |
| `@featuregate/openfeature-web-provider` | FeatureGate through the OpenFeature web and React SDKs          | Publishable client key    |

These package names describe the planned public surface. Public package directories and manifests
will land together with their implementations so this repository never exposes empty SDK packages.

## Security model

FeatureGate separates trusted server evaluation from browser-safe evaluation:

- Server and server-side OpenFeature integrations use secret runtime keys. Keep these keys in
  trusted process environments and never include them in browser bundles.
- Browser, React, and web OpenFeature integrations use publishable client keys. These keys are
  bound to one environment and allowed origins, and can evaluate only flags explicitly exposed to
  browser clients.
- Authorization, entitlements, billing decisions, and other security-sensitive checks belong on
  the server, even when the same flag also influences presentation in the browser.

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

Use `npm run format` to write formatting changes. Turborepo will coordinate package-level build,
typecheck, and test tasks as SDK workspaces are added; Oxlint checks the workspace as a whole.

## Repository structure

```text
.
├── .github/workflows/ci.yml  # Pull request and main-branch quality checks
├── packages/
│   ├── README.md             # Planned public package map
│   └── tsconfig/             # Private shared TypeScript configuration
├── package.json              # Private npm workspace root
└── turbo.json                # Monorepo task graph
```

## Contributing

The SDK extraction is in progress. Before opening a change, run the relevant linting, typechecking,
testing, and build commands, and keep credential boundaries explicit in code, tests, and
documentation. Bugs and proposals can be filed through
[GitHub Issues](https://github.com/featuregate/featuregate-js/issues).

## License

FeatureGate's JavaScript SDKs are available under the [MIT License](./LICENSE).
