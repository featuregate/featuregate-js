# Changelog

All notable changes to `@featuregate/node` are documented in this file. Entries describe changes
that affect SDK consumers rather than internal implementation details.

Each release starts with a short summary and groups consumer-facing changes by type. This package
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Aligned negative targeting comparisons with `POST /v1/evaluate` when an existing context value
  is a JSON object or array.

## [0.2.0] - 2026-07-18

This release makes remote configuration faster to react to changes and easier to operate in
production. It adds streaming invalidation with polling fallback, exposes client health, and
hardens retry and shutdown behavior.

### Features

- Added lifecycle and freshness status through `getStatus()` and the `onStatusChange` callback.
- Added snapshot version notifications through `onSnapshotChange`.
- Added streaming snapshot invalidation with bounded reconnects and authoritative polling fallback.
- Added `streaming`, `polling`, and `manual` synchronization modes.
- Remote clients now use streaming synchronization by default. Existing clients using
  `pollIntervalMs: 0` retain manual synchronization behavior.

### Bug fixes

- Prevented overlapping automatic refreshes and synchronized client polling through jittered
  scheduling.
- Respected `Retry-After` guidance when the snapshot API rate-limits a client.
- Reconciled stream invalidations that arrive while a snapshot refresh is already in flight.
- Made fragmented server-sent events safe across chunk and line-ending boundaries.
- Made `close()` abort in-flight SDK requests as well as stopping background synchronization.

## [0.1.0] - 2026-07-18

### Added

- Introduced the `FeatureGate` SDK for ESM-based applications running Node.js 22 or newer.
- Added local evaluation of boolean, string, number, and object flags with caller-provided defaults
  and detailed evaluation results.
- Added kill switches, attribute targeting, nested attribute paths, stable targeting keys, and
  deterministic percentage rollouts.
- Added remote configuration initialization, manual refresh, background polling, and configurable
  request timeouts.
- Added last-known-good behavior so transient refresh failures do not interrupt flag evaluation.
- Added local and bootstrap flag configuration for evaluating flags before or without connecting
  to FeatureGate.
- Added typed authentication, configuration, and request errors.

[Unreleased]: https://github.com/featuregate/featuregate-js/compare/node-v0.2.0...HEAD
[0.2.0]: https://github.com/featuregate/featuregate-js/compare/node-v0.1.0...node-v0.2.0
[0.1.0]: https://github.com/featuregate/featuregate-js/releases/tag/node-v0.1.0
