import { describe, expect, it } from "vitest";

import { matchesPercentage } from "./rollouts";

describe("matchesPercentage", () => {
  it("is stable for the same flag and attribute", () => {
    expect(matchesPercentage("checkout", "user.id", "user-123", 50)).toBe(
      matchesPercentage("checkout", "user.id", "user-123", 50),
    );
  });

  it("respects empty and complete rollout boundaries", () => {
    expect(matchesPercentage("checkout", "user.id", "user-123", 0)).toBe(false);
    expect(matchesPercentage("checkout", "user.id", "user-123", 100)).toBe(true);
  });

  it("distributes identifiers across the configured percentage", () => {
    const matchCount = Array.from({ length: 10_000 }, (_, index) =>
      matchesPercentage("checkout", "user.id", `user-${index}`, 25),
    ).filter(Boolean).length;

    expect(matchCount).toBeGreaterThan(2_300);
    expect(matchCount).toBeLessThan(2_700);
  });
});
