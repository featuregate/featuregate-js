import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const BUCKET_COUNT = 100;

/** Encodes the percentage-rollout seed used by every FeatureGate SDK. */
export function encodeRolloutInput(
  flagKey: string,
  attributePath: string,
  attributeValue: string,
): Uint8Array {
  return utf8ToBytes(`${flagKey}:${attributePath}:${attributeValue}`);
}

export function hashRolloutInput(
  flagKey: string,
  attributePath: string,
  attributeValue: string,
): Uint8Array {
  return sha256(encodeRolloutInput(flagKey, attributePath, attributeValue));
}

export function getRolloutBucket(
  flagKey: string,
  attributePath: string,
  attributeValue: string,
): number {
  const digest = hashRolloutInput(flagKey, attributePath, attributeValue);
  const hashValue = new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0);

  return hashValue % BUCKET_COUNT;
}
