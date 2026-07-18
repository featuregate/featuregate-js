import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  sortImports: {
    newlinesBetween: true,
    customGroups: [
      { elementNamePattern: ["@featuregate/"], groupName: "featuregate" },
    ],
  },
});
