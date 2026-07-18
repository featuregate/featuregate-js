# Changelog

All notable changes to `@featuregate/node` are documented in this file. Entries describe changes
that affect SDK consumers rather than internal implementation details.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/featuregate/featuregate-js/compare/node-v0.1.0...HEAD
[0.1.0]: https://github.com/featuregate/featuregate-js/releases/tag/node-v0.1.0
