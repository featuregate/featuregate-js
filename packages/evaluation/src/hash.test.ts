import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { encodeRolloutInput, getRolloutBucket, hashRolloutInput } from "./hash";

describe("rollout hashing", () => {
  it("matches the runtime API compatibility vector", () => {
    expect(bytesToHex(encodeRolloutInput("checkout", "user.id", "user-123"))).toBe(
      "636865636b6f75743a757365722e69643a757365722d313233",
    );
    expect(bytesToHex(hashRolloutInput("checkout", "user.id", "user-123"))).toBe(
      "0820e382eead487f39ed88049def3d22ba3270bc62434137a9a6a050ae646af8",
    );
    expect(getRolloutBucket("checkout", "user.id", "user-123")).toBe(22);
  });

  it("changes when any input changes", () => {
    const bucket = getRolloutBucket("checkout", "user.id", "user-123");

    expect(getRolloutBucket("checkout-v2", "user.id", "user-123")).not.toBe(bucket);
    expect(getRolloutBucket("checkout", "account.id", "user-123")).not.toBe(bucket);
    expect(getRolloutBucket("checkout", "user.id", "user-456")).not.toBe(bucket);
  });

  it("returns buckets across the complete percentage range", () => {
    const buckets = Array.from({ length: 10_000 }, (_, index) =>
      getRolloutBucket("checkout", "user.id", `user-${index}`),
    );
    const firstQuarter = buckets.filter((bucket) => bucket < 25).length;

    expect(Math.min(...buckets)).toBe(0);
    expect(Math.max(...buckets)).toBe(99);
    expect(firstQuarter).toBeGreaterThan(2_300);
    expect(firstQuarter).toBeLessThan(2_700);
  });
});
