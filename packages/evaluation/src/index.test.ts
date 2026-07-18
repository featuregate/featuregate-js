import { describe, expect, it } from "vitest";

import { evaluateLocalFlag } from "./index";

describe("evaluateLocalFlag", () => {
  it("prefers overrides to bootstrap values", () => {
    const details = evaluateLocalFlag({
      bootstrap: { checkout: false },
      defaultValue: false,
      flagKey: "checkout",
      overrides: { checkout: true },
    });

    expect(details).toEqual({
      flagKey: "checkout",
      reason: "override",
      usedDefault: false,
      value: true,
    });
  });

  it("uses a bootstrap value when no override exists", () => {
    const details = evaluateLocalFlag({
      bootstrap: { heading: "Welcome back" },
      defaultValue: "Welcome",
      flagKey: "heading",
    });

    expect(details).toEqual({
      flagKey: "heading",
      reason: "bootstrap",
      usedDefault: false,
      value: "Welcome back",
    });
  });

  it("returns the caller default when the flag is absent", () => {
    const details = evaluateLocalFlag({
      defaultValue: 10,
      flagKey: "page-size",
    });

    expect(details).toEqual({
      flagKey: "page-size",
      reason: "caller_default",
      usedDefault: true,
      value: 10,
    });
  });

  it("returns the caller default when the selected source has the wrong type", () => {
    const details = evaluateLocalFlag({
      bootstrap: { checkout: true },
      defaultValue: false,
      flagKey: "checkout",
      overrides: { checkout: "enabled" },
    });

    expect(details).toEqual({
      flagKey: "checkout",
      reason: "type_mismatch",
      usedDefault: true,
      value: false,
    });
  });

  it("supports JSON object values", () => {
    const details = evaluateLocalFlag({
      bootstrap: { theme: { colors: ["blue", "white"], compact: true } },
      defaultValue: { colors: ["black"] },
      flagKey: "theme",
    });

    expect(details.reason).toBe("bootstrap");
    expect(details.value).toEqual({ colors: ["blue", "white"], compact: true });
  });

  it("returns the caller default when an object flag receives a non-object value", () => {
    const details = evaluateLocalFlag({
      bootstrap: { theme: [] },
      defaultValue: { mode: "light" },
      flagKey: "theme",
    });

    expect(details).toEqual({
      flagKey: "theme",
      reason: "type_mismatch",
      usedDefault: true,
      value: { mode: "light" },
    });
  });
});
