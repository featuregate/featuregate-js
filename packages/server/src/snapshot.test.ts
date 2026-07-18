import { describe, expect, it } from "vitest";

import { readSnapshotFlags } from "./snapshot";

describe("readSnapshotFlags", () => {
  it("normalizes and orders a valid runtime snapshot", () => {
    expect(
      readSnapshotFlags({
        snapshot: {
          flags: [
            {
              defaultValue: false,
              key: "checkout",
              killSwitch: { active: false },
              rules: [
                {
                  conditions: [
                    {
                      attributePath: "user.id",
                      operator: null,
                      rolloutPercentage: 12.5,
                      sortOrder: 1,
                      type: "percentage_rollout",
                      value: null,
                    },
                    {
                      attributePath: "account.plan",
                      operator: "in",
                      rolloutPercentage: null,
                      sortOrder: 0,
                      type: "attribute_match",
                      value: ["pro", "enterprise"],
                    },
                  ],
                  conditionsMatch: "all",
                  serveValue: true,
                  sortOrder: 0,
                },
              ],
            },
          ],
        },
      }),
    ).toEqual({
      checkout: {
        defaultValue: false,
        killSwitch: false,
        rules: [
          {
            conditions: [
              {
                attributePath: "account.plan",
                operator: "in",
                type: "attribute_match",
                value: ["pro", "enterprise"],
              },
              {
                attributePath: "user.id",
                percentage: 12.5,
                type: "percentage_rollout",
              },
            ],
            conditionsMatch: "all",
            value: true,
          },
        ],
      },
    });
  });

  it.each([
    {
      attributePath: "account.plan",
      operator: "not_in",
      rolloutPercentage: null,
      sortOrder: 0,
      type: "attribute_match",
      value: "pro",
    },
    {
      attributePath: "account.plan",
      operator: "equals",
      rolloutPercentage: null,
      sortOrder: 0,
      type: "attribute_match",
      value: ["pro"],
    },
    {
      attributePath: null,
      operator: "equals",
      rolloutPercentage: null,
      sortOrder: 0,
      type: "attribute_match",
      value: "pro",
    },
    {
      attributePath: "user.id",
      operator: null,
      rolloutPercentage: -1,
      sortOrder: 0,
      type: "percentage_rollout",
      value: null,
    },
    {
      attributePath: "user.id",
      operator: null,
      rolloutPercentage: 101,
      sortOrder: 0,
      type: "percentage_rollout",
      value: null,
    },
    {
      attributePath: "user.id",
      operator: null,
      rolloutPercentage: Number.POSITIVE_INFINITY,
      sortOrder: 0,
      type: "percentage_rollout",
      value: null,
    },
  ])("rejects a condition that cannot be evaluated", (condition) => {
    expect(() => readSnapshotFlags(buildSnapshot(condition))).toThrow(
      "FeatureGate returned an invalid snapshot response.",
    );
  });
});

function buildSnapshot(condition: unknown): unknown {
  return {
    snapshot: {
      flags: [
        {
          defaultValue: false,
          key: "checkout",
          killSwitch: { active: false },
          rules: [
            {
              conditions: [condition],
              conditionsMatch: "all",
              serveValue: true,
              sortOrder: 0,
            },
          ],
        },
      ],
    },
  };
}
