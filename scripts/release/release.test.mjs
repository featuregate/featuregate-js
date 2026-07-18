import assert from "node:assert/strict";
import test from "node:test";

import { extractReleaseNotes, resolveRelease } from "./release.mjs";

const basePackageConfig = {
  currentMajor: 2,
  name: "@featuregate/node",
  path: "packages/node",
  prereleaseChannels: {
    alpha: "alpha-{major}",
    beta: "beta-{major}",
    nightly: "nightly-{major}",
    rc: "rc-{major}",
  },
  stableTag: "stable-{major}",
  tagPrefix: "node-v",
};

function createRelease(version, packageConfig = basePackageConfig) {
  return resolveRelease({
    changelog: `# Changelog

## [Unreleased]

## [${version}] - 2026-07-18

### Added

- A consumer-facing change.

## [0.1.0] - 2026-01-01

### Added

- Initial release.
`,
    config: { packages: { node: packageConfig } },
    packageJson: { name: "@featuregate/node", version },
    tag: `node-v${version}`,
  });
}

test("publishes the current stable major to latest", () => {
  const release = createRelease("2.1.0");

  assert.equal(release.channel, "stable");
  assert.equal(release.distTag, "latest");
  assert.equal(release.isLatest, true);
  assert.equal(release.isPrerelease, false);
});

test("keeps maintenance releases away from latest", () => {
  const release = createRelease("1.4.3");

  assert.equal(release.distTag, "stable-1");
  assert.equal(release.isLatest, false);
});

test("uses major-specific prerelease channels", () => {
  const release = createRelease("3.0.0-rc.2");

  assert.equal(release.channel, "rc");
  assert.equal(release.distTag, "rc-3");
  assert.equal(release.isLatest, false);
  assert.equal(release.isPrerelease, true);
});

test("supports nightly Semantic Versions", () => {
  const release = createRelease("3.1.0-nightly.20260718.abc123");

  assert.equal(release.distTag, "nightly-3");
});

test("requires an intentional current major promotion", () => {
  assert.throws(
    () => createRelease("3.0.0"),
    /major 3 cannot become stable until currentMajor is updated/,
  );
});

test("rejects prerelease channels that are not configured", () => {
  assert.throws(() => createRelease("3.0.0-canary.1"), /channel canary is not configured/);
});

test("requires the tag and package version to match", () => {
  assert.throws(
    () =>
      resolveRelease({
        changelog: "",
        config: { packages: { node: basePackageConfig } },
        packageJson: { name: "@featuregate/node", version: "2.0.0" },
        tag: "node-v2.0.1",
      }),
    /does not match @featuregate\/node version 2.0.0/,
  );
});

test("extracts only the requested consumer release notes", () => {
  const notes = extractReleaseNotes(
    `## [1.1.0] - 2026-07-18

### Fixed

- Corrected refresh behavior.

## [1.0.0] - 2026-06-01

### Added

- Initial release.

[1.1.0]: https://github.com/featuregate/featuregate-js/releases/tag/node-v1.1.0
`,
    "1.1.0",
  );

  assert.equal(notes, "### Fixed\n\n- Corrected refresh behavior.");
});

test("requires dated and non-empty release notes", () => {
  assert.throws(() => extractReleaseNotes("## [1.0.0]\n\n- Missing date.", "1.0.0"), /dated/);
  assert.throws(
    () => extractReleaseNotes("## [1.0.0] - 2026-07-18\n\n## [0.9.0] - 2026-01-01", "1.0.0"),
    /no release notes/,
  );
});
