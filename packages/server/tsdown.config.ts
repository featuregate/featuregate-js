import { defineConfig } from "tsdown";

import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  banner: `/*! ${packageJson.name} v${packageJson.version} | MIT License | Copyright (c) 2026 Anthony Con Hagidimitriou */`,
  deps: {
    alwaysBundle: [/^@featuregate\/evaluation(?:\/|$)/],
    neverBundle: ["@noble/hashes", "zod"],
    onlyImport: ["@noble/hashes", "zod"],
  },
  dts: {
    eager: true,
  },
  entry: ["./src/index.ts"],
  outDir: "dist",
  platform: "node",
});
