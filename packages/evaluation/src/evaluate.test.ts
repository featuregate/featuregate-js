import { describe, expect, it } from "vitest";

import { evaluateFlag, type FeatureGateFlags } from "./index";

const flags = {
  checkout: {
    defaultValue: true,
  },
  maintenance: {
    defaultValue: true,
    killSwitch: true,
  },
  heading: {
    defaultValue: "Welcome",
  },
  regionalCheckout: {
    defaultValue: false,
    rules: [
      {
        conditions: [
          {
            attributePath: "account.plan",
            operator: "equals",
            type: "attribute_match",
            value: "pro",
          },
          {
            attributePath: "country",
            operator: "in",
            type: "attribute_match",
            value: ["AU", "NZ"],
          },
        ],
        conditionsMatch: "all",
        value: true,
      },
    ],
  },
} satisfies FeatureGateFlags;

describe("evaluateFlag", () => {
  it("returns the environment default", () => {
    expect(evaluateFlag({ defaultValue: false, flagKey: "checkout", flags })).toEqual({
      flagKey: "checkout",
      reason: "environment_default",
      usedDefault: false,
      value: true,
    });
  });

  it("forces a killed boolean flag off", () => {
    expect(evaluateFlag({ defaultValue: true, flagKey: "maintenance", flags })).toEqual({
      flagKey: "maintenance",
      reason: "kill_switch",
      usedDefault: false,
      value: false,
    });
  });

  it("returns the caller default for missing flags and type mismatches", () => {
    expect(evaluateFlag({ defaultValue: false, flagKey: "missing", flags })).toMatchObject({
      reason: "flag_not_found",
      usedDefault: true,
      value: false,
    });
    expect(evaluateFlag({ defaultValue: false, flagKey: "heading", flags })).toMatchObject({
      reason: "type_mismatch",
      usedDefault: true,
      value: false,
    });
  });

  it("matches nested attributes and list operators", () => {
    expect(
      evaluateFlag({
        context: { attributes: { account: { plan: "pro" }, country: "AU" } },
        defaultValue: false,
        flagKey: "regionalCheckout",
        flags,
      }),
    ).toMatchObject({ reason: "targeting_match", usedDefault: false, value: true });
  });

  it("supports any-condition rules and the built-in targeting key", () => {
    const targetedFlags = {
      checkout: {
        defaultValue: false,
        rules: [
          {
            conditions: [
              {
                attributePath: "country",
                operator: "equals",
                type: "attribute_match",
                value: "US",
              },
              {
                attributePath: "targetingKey",
                operator: "equals",
                type: "attribute_match",
                value: "customer-123",
              },
            ],
            conditionsMatch: "any",
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
    ).toMatchObject({ reason: "targeting_match", value: true });
  });

  it("matches list exclusions only when the value is outside the list", () => {
    const targetedFlags = {
      checkout: {
        defaultValue: false,
        rules: [
          {
            conditions: [
              {
                attributePath: "account.plan",
                operator: "not_in",
                type: "attribute_match",
                value: ["free", "starter"],
              },
            ],
            conditionsMatch: "all",
            value: true,
          },
        ],
      },
    } satisfies FeatureGateFlags;

    expect(
      evaluateFlag({
        context: { attributes: { account: { plan: "pro" } } },
        defaultValue: false,
        flagKey: "checkout",
        flags: targetedFlags,
      }),
    ).toMatchObject({ reason: "targeting_match", value: true });
    expect(
      evaluateFlag({
        context: { attributes: { account: { plan: "free" } } },
        defaultValue: false,
        flagKey: "checkout",
        flags: targetedFlags,
      }),
    ).toMatchObject({ reason: "environment_default", value: false });
  });

  it("evaluates percentage conditions from stable nested attributes", () => {
    const rolloutFlags = {
      checkout: {
        defaultValue: false,
        rules: [
          {
            conditions: [{ attributePath: "user.id", percentage: 100, type: "percentage_rollout" }],
            conditionsMatch: "all",
            value: true,
          },
        ],
      },
    } satisfies FeatureGateFlags;

    expect(
      evaluateFlag({
        context: { attributes: { user: { id: "user-123" } } },
        defaultValue: false,
        flagKey: "checkout",
        flags: rolloutFlags,
      }),
    ).toMatchObject({ reason: "targeting_match", value: true });
  });
});
