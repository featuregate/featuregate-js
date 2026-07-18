import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import semver from "semver";

const DIST_TAG_PATTERN = /^[a-z][a-z0-9._-]*$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractReleaseNotes(changelog, version) {
  const escapedVersion = escapeRegExp(version);
  const heading = new RegExp(`^## \\[${escapedVersion}\\] - (\\d{4}-\\d{2}-\\d{2})$`, "m");
  const match = heading.exec(changelog);

  if (!match) {
    throw new Error(`CHANGELOG.md does not contain a dated [${version}] release`);
  }

  const contentStart = match.index + match[0].length;
  const remainingChangelog = changelog.slice(contentStart);
  const boundaries = [
    remainingChangelog.search(/^## \[/m),
    remainingChangelog.search(/^\[[^\]]+\]:/m),
  ]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  const contentEnd = boundaries.length === 0 ? changelog.length : contentStart + boundaries[0];
  const notes = changelog.slice(contentStart, contentEnd).trim();

  if (!notes) {
    throw new Error(`CHANGELOG.md contains no release notes for ${version}`);
  }

  return notes;
}

function formatDistTag(template, major) {
  const distTag = template.replaceAll("{major}", String(major));

  if (!DIST_TAG_PATTERN.test(distTag)) {
    throw new Error(`Release configuration produced an invalid npm dist-tag: ${distTag}`);
  }

  return distTag;
}

export function resolveRelease({ tag, config, packageJson, changelog }) {
  const packageEntry = Object.entries(config.packages).find(([, candidate]) =>
    tag.startsWith(candidate.tagPrefix),
  );

  if (!packageEntry) {
    throw new Error(`No package is configured for release tag ${tag}`);
  }

  const [packageId, packageConfig] = packageEntry;
  const version = tag.slice(packageConfig.tagPrefix.length);
  const parsedVersion = semver.parse(version);

  if (!parsedVersion || parsedVersion.version !== version) {
    throw new Error(`Release tag ${tag} does not contain an exact Semantic Version`);
  }

  if (packageJson.name !== packageConfig.name) {
    throw new Error(
      `Release configuration expects ${packageConfig.name}, but package.json contains ${packageJson.name}`,
    );
  }

  if (packageJson.version !== version) {
    throw new Error(
      `Release tag ${tag} does not match ${packageJson.name} version ${packageJson.version}`,
    );
  }

  const isPrerelease = parsedVersion.prerelease.length > 0;
  const isLatest = !isPrerelease && parsedVersion.major === packageConfig.currentMajor;
  let channel = "stable";
  let distTag;

  if (isPrerelease) {
    channel = String(parsedVersion.prerelease[0]);
    const channelTemplate = packageConfig.prereleaseChannels[channel];

    if (!channelTemplate) {
      throw new Error(`Prerelease channel ${channel} is not configured for ${packageJson.name}`);
    }

    distTag = formatDistTag(channelTemplate, parsedVersion.major);
  } else if (parsedVersion.major === packageConfig.currentMajor) {
    distTag = "latest";
  } else if (parsedVersion.major < packageConfig.currentMajor) {
    distTag = formatDistTag(packageConfig.stableTag, parsedVersion.major);
  } else {
    throw new Error(
      `${packageJson.name} major ${parsedVersion.major} cannot become stable until currentMajor is updated`,
    );
  }

  return {
    channel,
    distTag,
    isLatest,
    isPrerelease,
    notes: extractReleaseNotes(changelog, version),
    packageId,
    packageName: packageJson.name,
    packagePath: packageConfig.path,
    releaseTitle: `${packageJson.name} v${version}`,
    tag,
    version,
  };
}

async function loadRelease(tag) {
  const root = process.cwd();
  const config = JSON.parse(await readFile(path.join(root, "release.config.json"), "utf8"));
  const packageConfig = Object.values(config.packages).find((candidate) =>
    tag.startsWith(candidate.tagPrefix),
  );

  if (!packageConfig) {
    throw new Error(`No package is configured for release tag ${tag}`);
  }

  const packageRoot = path.join(root, packageConfig.path);
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const changelog = await readFile(path.join(packageRoot, "CHANGELOG.md"), "utf8");

  return resolveRelease({ changelog, config, packageJson, tag });
}

async function main() {
  const { values } = parseArgs({
    options: {
      "github-output": { type: "string" },
      notes: { type: "string" },
      tag: { type: "string" },
    },
    strict: true,
  });

  if (!values.tag) {
    throw new Error("A release tag is required with --tag");
  }

  const release = await loadRelease(values.tag);

  if (values.notes) {
    await writeFile(values.notes, `${release.notes}\n`);
  }

  if (values["github-output"]) {
    const output = [
      `channel=${release.channel}`,
      `dist_tag=${release.distTag}`,
      `is_latest=${release.isLatest}`,
      `is_prerelease=${release.isPrerelease}`,
      `package_id=${release.packageId}`,
      `package_name=${release.packageName}`,
      `package_path=${release.packagePath}`,
      `release_title=${release.releaseTitle}`,
      `version=${release.version}`,
    ].join("\n");

    await appendFile(values["github-output"], `${output}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
  }
}

const isCommandLine = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;

if (isCommandLine) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
