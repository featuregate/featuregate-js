import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { encodeRolloutInput, getRolloutBucket, hashRolloutInput } from "./hash";

describe("rollout hashing", () => {
  it.each([
    {
      bucket: 70_664,
      digest: "b4e6bb18dd252d9c8346743f172dcd25679eb259b69bd780cf79d57e05634492",
      encoded: "66656174757265676174652d726f6c6c6f75742d7631000000000000000000000000",
      flagKey: "",
      seed: "",
      targetingKey: "",
    },
    {
      bucket: 762,
      digest: "01f4051d6217ef02a227adac6b1209daf0e345183be83f213f8502c262630279",
      encoded:
        "66656174757265676174652d726f6c6c6f75742d763100000008636865636b6f75740000000b636865636b6f75742d76310000000c637573746f6d65722d313233",
      flagKey: "checkout",
      seed: "checkout-v1",
      targetingKey: "customer-123",
    },
    {
      bucket: 58_638,
      digest: "961d651182ce0ed1d7834a08c16a9f23f904b3d3a9875e63d8b53e942b12c910",
      encoded:
        "66656174757265676174652d726f6c6c6f75742d76310000000973616c7574f09f918b00000009736565642df09f918b0000000ae5aea2e688b72d313233",
      flagKey: "salut👋",
      seed: "seed-👋",
      targetingKey: "客户-123",
    },
  ])("matches the compatibility vector for $flagKey / $targetingKey", (vector) => {
    expect(bytesToHex(encodeRolloutInput(vector.flagKey, vector.seed, vector.targetingKey))).toBe(
      vector.encoded,
    );
    expect(bytesToHex(hashRolloutInput(vector.flagKey, vector.seed, vector.targetingKey))).toBe(
      vector.digest,
    );
    expect(getRolloutBucket(vector.flagKey, vector.seed, vector.targetingKey)).toBe(vector.bucket);
  });

  it("changes the bucket when the seed is rotated", () => {
    const first = getRolloutBucket("checkout", "checkout-v1", "customer-123");
    const second = getRolloutBucket("checkout", "checkout-v2", "customer-123");

    expect(first).not.toBe(second);
  });
});
