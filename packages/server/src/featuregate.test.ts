import { describe, expect, it } from "vitest";

import type { FeatureGateFlags } from "./index";
import { FeatureGate } from "./index";

const flags: FeatureGateFlags = {
  checkout: {
    disabledValue: false,
    enabled: true,
    enabledValue: true,
  },
  heading: {
    disabledValue: "Unavailable",
    enabled: true,
    enabledValue: "Welcome",
  },
  pageSize: {
    disabledValue: 10,
    enabled: true,
    enabledValue: 25,
  },
  theme: {
    disabledValue: { mode: "light" },
    enabled: true,
    enabledValue: { mode: "dark" },
  },
  targetedCheckout: {
    disabledValue: false,
    enabled: true,
    enabledValue: false,
    rules: [
      {
        conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
        value: true,
      },
    ],
  },
};

const featureGate = new FeatureGate({ flags });

describe("FeatureGate", () => {
  it("evaluates each supported value type", () => {
    expect(featureGate.getBooleanValue("checkout", false)).toBe(true);
    expect(featureGate.getStringValue("heading", "Default")).toBe("Welcome");
    expect(featureGate.getNumberValue("pageSize", 20)).toBe(25);
    expect(featureGate.getObjectValue("theme", { mode: "system" })).toEqual({ mode: "dark" });
  });

  it("returns the caller default when a flag is missing", () => {
    expect(featureGate.getBooleanValue("missing", false)).toBe(false);
  });

  it("passes evaluation context to targeting rules", () => {
    expect(
      featureGate.getBooleanValue("targetedCheckout", false, {
        attributes: { plan: "pro" },
        targetingKey: "customer-123",
      }),
    ).toBe(true);
  });

  it("returns evaluation details", () => {
    expect(featureGate.getBooleanDetails("checkout", false)).toEqual({
      flagKey: "checkout",
      reason: "enabled",
      usedDefault: false,
      value: true,
    });
  });
});
