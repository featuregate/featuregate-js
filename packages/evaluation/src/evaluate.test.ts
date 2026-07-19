import { describe, expect, it } from "vitest";

import {
  evaluateFlag,
  type FeatureGateAttributeCondition,
  type FeatureGateEvaluationContext,
  type FeatureGateFlags,
  type FeatureGateJsonValue,
} from "./index";

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

  it.each([
    {
      actual: "pro",
      condition: attributeCondition("equals", "pro"),
      expectedReason: "targeting_match",
      name: "equals matching primitives",
    },
    {
      actual: "free",
      condition: attributeCondition("equals", "pro"),
      expectedReason: "environment_default",
      name: "equals different primitives",
    },
    {
      actual: "free",
      condition: attributeCondition("not_equals", "pro"),
      expectedReason: "targeting_match",
      name: "not_equals different primitives",
    },
    {
      actual: { plan: "pro" },
      condition: attributeCondition("not_equals", "pro"),
      expectedReason: "targeting_match",
      name: "not_equals compound values",
    },
    {
      condition: attributeCondition("not_equals", "pro"),
      expectedReason: "environment_default",
      name: "not_equals missing paths",
    },
    {
      actual: "team",
      condition: attributeCondition("in", ["pro", "team"]),
      expectedReason: "targeting_match",
      name: "in list members",
    },
    {
      actual: "pro",
      condition: attributeCondition("not_in", ["free", "starter"]),
      expectedReason: "targeting_match",
      name: "not_in non-members",
    },
    {
      condition: attributeCondition("not_in", ["free", "starter"]),
      expectedReason: "environment_default",
      name: "not_in missing paths",
    },
  ] satisfies readonly AttributeParityCase[])(
    "matches the runtime API for $name",
    ({ actual, condition, expectedReason }) => {
      const context: FeatureGateEvaluationContext = {
        attributes: actual === undefined ? {} : { candidate: actual },
      };
      const parityFlags = {
        parity: {
          defaultValue: false,
          rules: [{ conditions: [condition], conditionsMatch: "all", value: true }],
        },
      } satisfies FeatureGateFlags;

      expect(
        evaluateFlag({ context, defaultValue: false, flagKey: "parity", flags: parityFlags }),
      ).toMatchObject({
        reason: expectedReason,
        value: expectedReason === "targeting_match",
      });
    },
  );

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

  it("uses the first matching ordered rule", () => {
    const orderedFlags = {
      checkout: {
        defaultValue: false,
        rules: [
          {
            conditions: [attributeCondition("equals", "pro")],
            conditionsMatch: "all",
            value: true,
          },
          {
            conditions: [attributeCondition("equals", "pro")],
            conditionsMatch: "all",
            value: false,
          },
        ],
      },
    } satisfies FeatureGateFlags;

    expect(
      evaluateFlag({
        context: { attributes: { candidate: "pro" } },
        defaultValue: false,
        flagKey: "checkout",
        flags: orderedFlags,
      }),
    ).toMatchObject({ reason: "targeting_match", value: true });
  });
});

interface AttributeParityCase {
  actual?: FeatureGateJsonValue;
  condition: FeatureGateAttributeCondition;
  expectedReason: "environment_default" | "targeting_match";
  name: string;
}

function attributeCondition(
  operator: "equals" | "not_equals",
  value: string,
): FeatureGateAttributeCondition;
function attributeCondition(
  operator: "in" | "not_in",
  value: string[],
): FeatureGateAttributeCondition;
function attributeCondition(
  operator: FeatureGateAttributeCondition["operator"],
  value: string | string[],
): FeatureGateAttributeCondition {
  if (operator === "in" || operator === "not_in") {
    if (!Array.isArray(value)) {
      throw new TypeError(`${operator} requires an array value.`);
    }

    return {
      attributePath: "candidate",
      operator,
      type: "attribute_match",
      value,
    };
  }

  if (Array.isArray(value)) {
    throw new TypeError(`${operator} requires a scalar value.`);
  }

  return {
    attributePath: "candidate",
    operator,
    type: "attribute_match",
    value,
  };
}
