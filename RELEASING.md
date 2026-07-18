# Releasing FeatureGate SDKs

FeatureGate releases are intentionally driven by curated changelogs. The release tooling validates
and delivers an exact version chosen by a maintainer; it does not infer versions or release notes
from commit history.

## Release model

Each public package defines its release policy in [`release.config.json`](./release.config.json).
For `@featuregate/node`:

| Release                  | Git tag                          | npm dist-tag |
| ------------------------ | -------------------------------- | ------------ |
| Current stable major     | `node-v2.1.0`                    | `latest`     |
| Older stable major       | `node-v1.4.3`                    | `stable-1`   |
| Alpha                    | `node-v3.0.0-alpha.1`            | `alpha-3`    |
| Beta                     | `node-v3.0.0-beta.1`             | `beta-3`     |
| Release candidate        | `node-v3.0.0-rc.1`               | `rc-3`       |
| Reserved nightly channel | `node-v3.1.0-nightly.20260718.1` | `nightly-3`  |

Major-specific prerelease tags allow multiple release lines to coexist. npm recommends dist-tags
that do not begin with a number or `v`, because dist-tags share a namespace with Semantic Versions.

The package's `currentMajor` controls `latest`. A stable release above that major is rejected until
the release policy is deliberately updated. A stable release below it is published to its
`stable-N` maintenance channel instead, so an older fix can never move `latest` backwards.
The same rule controls GitHub's “Latest release” marker.

## Prepare a release

1. Choose the exact [Semantic Version](https://semver.org/) based on consumer impact.
2. Update the package version and workspace lockfile. For example:

   ```sh
   npm version 0.1.1 --workspace packages/node --no-git-tag-version
   ```

3. Move the relevant content from `[Unreleased]` into a dated version section in
   [`packages/node/CHANGELOG.md`](./packages/node/CHANGELOG.md). Use the standard headings `Added`,
   `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security` where they are useful.
4. Update the changelog comparison links at the bottom of the file.
5. For a new stable major, update `currentMajor` in `release.config.json` in the same pull request.
6. Validate the release locally:

   ```sh
   npm run release:validate -- --tag node-v0.1.1
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

Commit the version, lockfile, changelog, and any release-policy change together and merge them
through the normal pull request process.

## Publish a release

Create an annotated tag on the reviewed release commit and push it:

```sh
git tag -a node-v0.1.1 -m "@featuregate/node v0.1.1"
git push origin node-v0.1.1
```

The [release workflow](./.github/workflows/release.yml) then:

1. Verifies the tag, package name, package version, release policy, and changelog entry.
2. Runs linting, type checking, tests, and the production build.
3. Publishes the package using the release's explicit npm dist-tag.
4. Creates a GitHub Release using the matching changelog section verbatim.

The workflow is safe to rerun. It skips npm publication or GitHub Release creation when that part
of the release already exists.

## Prereleases

Alpha, beta, and release-candidate versions use normal Semantic Version prerelease identifiers:

```text
1.0.0-alpha.1
1.0.0-beta.1
1.0.0-rc.1
```

Each prerelease has its own curated changelog entry and is marked as a prerelease on GitHub. The
final stable entry should summarize the complete consumer-facing release rather than merely refer
readers back through all prerelease entries.

The `nightly` channel is reserved but not scheduled. If automated nightlies are added later, they
must use unique Semantic Versions and can adopt generated operational notes without changing the
stable release process.

## Maintaining older release lines

Create a maintenance branch only when an older line needs continued support:

```text
release/node/0.x
release/node/1.x
release/node/2.x
```

Branch from the last release in that line, apply the fix, update that branch's package version and
changelog, and merge through a pull request targeting the maintenance branch. Tag the resulting
commit normally. The release policy routes it to `stable-N` rather than `latest`.

Forward-port the fix to newer supported lines when it applies. Changelog conflicts should be
resolved deliberately so each branch continues to describe the releases made from that line.

## npm trusted publishing

After the package exists on npm, configure `featuregate/featuregate-js` and `release.yml` as its
trusted GitHub publisher with `npm publish` permission. The workflow grants only the required OIDC
and repository-content permissions. npm automatically attaches provenance when trusted publishing
is used from a public GitHub repository.

The initial package publication can use a short-lived granular token stored as the `NPM_TOKEN`
repository secret. After trusted publishing succeeds, remove that secret and revoke the token.
