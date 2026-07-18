import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const BUCKET_COUNT = 100_000;
const UINT32_RANGE = 0x1_0000_0000;
const VERSION = utf8ToBytes("featuregate-rollout-v1");

/** Encodes rollout identifiers using the language-independent FeatureGate v1 format. */
export function encodeRolloutInput(
  flagKey: string,
  seed: string,
  targetingKey: string,
): Uint8Array {
  const flagKeyBytes = utf8ToBytes(flagKey);
  const seedBytes = utf8ToBytes(seed);
  const targetingKeyBytes = utf8ToBytes(targetingKey);
  const input = new Uint8Array(
    VERSION.length + 12 + flagKeyBytes.length + seedBytes.length + targetingKeyBytes.length,
  );
  const view = new DataView(input.buffer);

  let offset = 0;
  input.set(VERSION, offset);
  offset += VERSION.length;

  view.setUint32(offset, flagKeyBytes.length);
  offset += 4;
  input.set(flagKeyBytes, offset);
  offset += flagKeyBytes.length;

  view.setUint32(offset, seedBytes.length);
  offset += 4;
  input.set(seedBytes, offset);
  offset += seedBytes.length;

  view.setUint32(offset, targetingKeyBytes.length);
  offset += 4;
  input.set(targetingKeyBytes, offset);

  return input;
}

export function hashRolloutInput(flagKey: string, seed: string, targetingKey: string): Uint8Array {
  return sha256(encodeRolloutInput(flagKey, seed, targetingKey));
}

export function getRolloutBucket(flagKey: string, seed: string, targetingKey: string): number {
  const digest = hashRolloutInput(flagKey, seed, targetingKey);
  const hashValue = new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0);

  return Math.floor((hashValue * BUCKET_COUNT) / UINT32_RANGE);
}
