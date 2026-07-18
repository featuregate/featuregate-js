import { describe, expect, it } from "vitest";

import { evaluateFlag, type FeatureGateFlags } from "./index";

const flags = {
  checkout: {
    disabledValue: false,
    enabled: true,
    enabledValue: true,
  },
  maintenance: {
    disabledValue: false,
    enabled: false,
    enabledValue: true,
  },
  heading: {
    disabledValue: "Unavailable",
    enabled: true,
    enabledValue: "Welcome",
  },
  regionalCheckout: {
    disabledValue: false,
    enabled: true,
    enabledValue: false,
    rules: [
      {
        conditions: [{ attribute: "country", operator: "equals", value: "AU" }],
        value: true,
      },
      {
        conditions: [{ attribute: "country", operator: "equals", value: "AU" }],
        value: false,
      },
    ],
  },
  gradualCheckout: {
    disabledValue: false,
    enabled: true,
    enabledValue: false,
    rollout: {
      allocations: [{ value: true, weight: 100_000 }],
      seed: "gradual-checkout-v1",
    },
  },
} satisfies FeatureGateFlags;

describe("evaluateFlag", () => {
  it("returns the enabled value", () => {
    expect(
      evaluateFlag({
        defaultValue: false,
        flagKey: "checkout",
        flags,
      }),
    ).toEqual({
      flagKey: "checkout",
      reason: "enabled",
      usedDefault: false,
      value: true,
    });
  });

  it("returns the disabled value", () => {
    expect(
      evaluateFlag({
        defaultValue: true,
        flagKey: "maintenance",
        flags,
      }),
    ).toEqual({
      flagKey: "maintenance",
      reason: "disabled",
      usedDefault: false,
      value: false,
    });
  });

  it("returns the caller default when the flag does not exist", () => {
    expect(
      evaluateFlag({
        defaultValue: false,
        flagKey: "missing",
        flags,
      }),
    ).toEqual({
      flagKey: "missing",
      reason: "flag_not_found",
      usedDefault: true,
      value: false,
    });
  });

  it("returns the caller default when the requested type does not match", () => {
    expect(
      evaluateFlag({
        defaultValue: false,
        flagKey: "heading",
        flags,
      }),
    ).toEqual({
      flagKey: "heading",
      reason: "type_mismatch",
      usedDefault: true,
      value: false,
    });
  });

  it("returns the first value whose conditions match", () => {
    expect(
      evaluateFlag({
        context: {
          attributes: { country: "AU" },
          targetingKey: "customer-123",
        },
        defaultValue: false,
        flagKey: "regionalCheckout",
        flags,
      }),
    ).toEqual({
      flagKey: "regionalCheckout",
      reason: "rule_match",
      usedDefault: false,
      value: true,
    });
  });

  it("falls back to the enabled value when no rule matches", () => {
    expect(
      evaluateFlag({
        context: {
          attributes: { country: "NZ" },
          targetingKey: "customer-123",
        },
        defaultValue: true,
        flagKey: "regionalCheckout",
        flags,
      }),
    ).toMatchObject({
      reason: "enabled",
      usedDefault: false,
      value: false,
    });
  });

  it("matches the targeting key as a built-in attribute", () => {
    const targetedFlags = {
      checkout: {
        disabledValue: false,
        enabled: true,
        enabledValue: false,
        rules: [
          {
            conditions: [{ attribute: "targetingKey", operator: "equals", value: "customer-123" }],
            value: true,
          },
        ],
      },
    } satisfies FeatureGateFlags;

    expect(
      evaluateFlag({
        context: { targetingKey: "customer-123" },
        defaultValue: false,
        flagKey: "checkout",
        flags: targetedFlags,
      }),
    ).toMatchObject({
      reason: "rule_match",
      value: true,
    });
  });

  it("returns the caller default when a matched rule has the wrong type", () => {
    const targetedFlags = {
      heading: {
        disabledValue: "Unavailable",
        enabled: true,
        enabledValue: "Welcome",
        rules: [
          {
            conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
            value: true,
          },
        ],
      },
    } satisfies FeatureGateFlags;

    expect(
      evaluateFlag({
        context: {
          attributes: { plan: "pro" },
          targetingKey: "customer-123",
        },
        defaultValue: "Default heading",
        flagKey: "heading",
        flags: targetedFlags,
      }),
    ).toMatchObject({
      reason: "type_mismatch",
      usedDefault: true,
      value: "Default heading",
    });
  });

  it("returns a rollout value when a targeting key is available", () => {
    expect(
      evaluateFlag({
        context: { targetingKey: "customer-123" },
        defaultValue: false,
        flagKey: "gradualCheckout",
        flags,
      }),
    ).toMatchObject({
      reason: "rollout",
      usedDefault: false,
      value: true,
    });
  });

  it("falls back to the enabled value when no targeting key is available", () => {
    expect(
      evaluateFlag({
        defaultValue: true,
        flagKey: "gradualCheckout",
        flags,
      }),
    ).toMatchObject({
      reason: "enabled",
      usedDefault: false,
      value: false,
    });
  });
});
