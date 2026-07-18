# @featuregate/evaluation

Private, runtime-neutral evaluation primitives shared by FeatureGate SDK packages.

This workspace owns local value validation, override and bootstrap precedence, caller defaults,
and evaluation details. It must not depend on networking, storage, Node.js, browser, framework, or
OpenFeature APIs. Public SDK builds bundle the code they use from this package.
