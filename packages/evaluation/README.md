# @featuregate/evaluation

Private, runtime-neutral evaluation primitives shared by FeatureGate SDK packages.

This workspace owns flag definitions, evaluation context, conditions, local evaluation, caller
defaults, and evaluation results. It must not depend on networking, storage, Node.js, browser,
framework, or OpenFeature APIs. Public SDK builds bundle the code they use from this package.

Evaluation supports environment defaults, kill switches, ordered `all`/`any` targeting rules,
nested attribute paths, comparison operators, and deterministic percentage conditions.

## Rollout compatibility

Rollout assignment is a cross-SDK compatibility contract. The flag key, attribute path, and
attribute value are joined with `:` and encoded as UTF-8. The first four bytes of the SHA-256
digest are read as an unsigned big-endian integer and reduced modulo 100. A percentage condition
matches when that bucket is below its configured percentage.
