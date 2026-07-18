import { describe, expect, it } from "vitest";

import { getRolloutValue, selectRolloutValue } from "./rollouts";
import type { FeatureGateRollout } from "./types";

const rollout = {
  allocations: [
    { value: "control", weight: 25_000 },
    { value: "treatment", weight: 75_000 },
  ],
  seed: "checkout-v1",
} satisfies FeatureGateRollout;

describe("selectRolloutValue", () => {
  it("selects allocations using ordered percentage boundaries", () => {
    expect(selectRolloutValue(rollout.allocations, 0)).toBe("control");
    expect(selectRolloutValue(rollout.allocations, 24_999)).toBe("control");
    expect(selectRolloutValue(rollout.allocations, 25_000)).toBe("treatment");
    expect(selectRolloutValue(rollout.allocations, 99_999)).toBe("treatment");
    expect(selectRolloutValue(rollout.allocations, 100_000)).toBeUndefined();
  });
});

describe("getRolloutValue", () => {
  it("returns the same allocation for the same flag and targeting key", () => {
    const first = getRolloutValue(rollout, "checkout", "customer-123");
    const second = getRolloutValue(rollout, "checkout", "customer-123");

    expect(first).toBe(second);
  });

  it("distributes targeting keys across the configured allocations", () => {
    const controlCount = Array.from({ length: 10_000 }, (_, index) =>
      getRolloutValue(rollout, "checkout", `customer-${index}`),
    ).filter((value) => value === "control").length;

    expect(controlCount).toBeGreaterThan(2_300);
    expect(controlCount).toBeLessThan(2_700);
  });
});
