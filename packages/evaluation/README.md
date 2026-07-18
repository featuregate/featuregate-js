# @featuregate/evaluation

Private, runtime-neutral evaluation primitives shared by FeatureGate SDK packages.

This workspace owns flag definitions, evaluation context, conditions, local evaluation, caller
defaults, and evaluation results. It must not depend on networking, storage, Node.js, browser,
framework, or OpenFeature APIs. Public SDK builds bundle the code they use from this package.

Evaluation supports enabled and disabled values plus ordered equality-based targeting rules.
Percentage rollouts will be added separately so their hashing behavior can remain isolated and
well tested.
