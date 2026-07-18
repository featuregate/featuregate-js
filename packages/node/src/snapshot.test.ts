import { describe, expect, it } from "vitest";

import runtimeSnapshotFixture from "./fixtures/runtime-snapshot.json" with { type: "json" };
import { readSnapshot } from "./snapshot";

describe("readSnapshot", () => {
  it("normalizes and orders a valid runtime snapshot", () => {
    expect(
      readSnapshot({
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
          version: "snapshot-v1",
        },
      }),
    ).toEqual({
      flags: {
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
      },
      version: "snapshot-v1",
    });
  });

  it("accepts a complete snapshot from the runtime contract", () => {
    expect(readSnapshot(runtimeSnapshotFixture)).toMatchObject({
      flags: {
        checkout: {
          defaultValue: false,
          rules: [
            {
              conditions: [
                {
                  attributePath: "account.plan",
                  operator: "in",
                  value: ["pro", "enterprise"],
                },
              ],
              value: true,
            },
          ],
        },
      },
      version: "snapshot_version_fixture",
    });
  });

  it("normalizes non-evaluable wire conditions without leaking nullable domain types", () => {
    const snapshot = readSnapshot({
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
                    attributePath: null,
                    operator: "equals",
                    rolloutPercentage: null,
                    sortOrder: 0,
                    type: "attribute_match",
                    value: "pro",
                  },
                ],
                conditionsMatch: "all",
                serveValue: true,
                sortOrder: 0,
              },
              {
                conditions: [
                  {
                    attributePath: "account.plan",
                    operator: "not_in",
                    rolloutPercentage: null,
                    sortOrder: 0,
                    type: "attribute_match",
                    value: "free",
                  },
                  {
                    attributePath: "country",
                    operator: "equals",
                    rolloutPercentage: null,
                    sortOrder: 1,
                    type: "attribute_match",
                    value: "AU",
                  },
                ],
                conditionsMatch: "any",
                serveValue: true,
                sortOrder: 1,
              },
            ],
          },
        ],
        version: "snapshot-v1",
      },
    });

    expect(snapshot.flags.checkout?.rules).toEqual([
      {
        conditions: [
          {
            attributePath: "country",
            operator: "equals",
            type: "attribute_match",
            value: "AU",
          },
        ],
        conditionsMatch: "any",
        value: true,
      },
    ]);
  });

  it.each([
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
  ])("rejects a condition outside the runtime contract", (condition) => {
    expect(() => readSnapshot(buildSnapshot(condition))).toThrow(
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
      version: "snapshot-v1",
    },
  };
}
