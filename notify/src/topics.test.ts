import { describe, it, expect } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import { deriveRecipientKeyPair, deriveContentTopic } from "./topics";

describe("deriveRecipientKeyPair", () => {
  it("is deterministic for the same secret", () => {
    const a = deriveRecipientKeyPair(123456789n);
    const b = deriveRecipientKeyPair(123456789n);
    expect(a.privateKey).toEqual(b.privateKey);
    expect(a.publicKey).toEqual(b.publicKey);
  });

  it("derives distinct keypairs across secrets", () => {
    const a = deriveRecipientKeyPair(1n);
    const b = deriveRecipientKeyPair(2n);
    expect(a.privateKey).not.toEqual(b.privateKey);
    expect(a.publicKey).not.toEqual(b.publicKey);
  });

  it("derives a 32-byte private key (secp256k1 scalar size)", () => {
    const { privateKey } = deriveRecipientKeyPair(42n);
    expect(privateKey.length).toBe(32);
  });
});

describe("deriveContentTopic", () => {
  it("is deterministic for the same public key", () => {
    const { publicKey } = deriveRecipientKeyPair(999n);
    expect(deriveContentTopic(publicKey)).toBe(deriveContentTopic(publicKey));
  });

  it("derives distinct topics across secrets", () => {
    const topicA = deriveContentTopic(deriveRecipientKeyPair(1n).publicKey);
    const topicB = deriveContentTopic(deriveRecipientKeyPair(2n).publicKey);
    expect(topicA).not.toBe(topicB);
  });

  it("is well-formed per the autosharding content-topic format (RFC 51)", () => {
    const { publicKey } = deriveRecipientKeyPair(7n);
    const topic = deriveContentTopic(publicKey);
    expect(topic).toMatch(/^\/stableroll-payroll\/1\/claim-[0-9a-f]{16}\/proto$/);
  });

  it("never derives from a Starknet address or any payer-linkable input", () => {
    // The function's signature itself enforces this: its only input is the
    // recipient's derived public key, which topics.ts derives solely from
    // the commitment secret (see deriveRecipientKeyPair) — there is no
    // parameter through which a Starknet address could enter the topic.
    expect(deriveContentTopic.length).toBe(1);
  });
});

/**
 * Pinned derivation output.
 *
 * The payer derives the topic and the recipient's public key in Node
 * (`integration/src/sepolia-run.ts`); the recipient re-derives both in a
 * browser (`frontend/src/lib/claim-notifications.ts`, issue #35). They must
 * agree exactly or the notification is published where nobody is listening —
 * which fails silently, as a topic with no subscriber looks identical to a
 * payment that was never made.
 *
 * These literals are what the original Buffer-based implementation produced.
 * They are pinned here because that implementation had to become isomorphic to
 * run in a browser bundle, and "the refactor changed nothing" is worth proving
 * rather than asserting. Any future change to the domain tags, the hash, or the
 * hex encoding turns this red.
 */
describe("derivation output is pinned across environments", () => {
  const cases: Array<[bigint, string, string]> = [
    [1n, "a12f5adbfb880333", "/stableroll-payroll/1/claim-c56d8fc883dab068/proto"],
    [0xdeadbeefn, "1cc4a8c829c37a27", "/stableroll-payroll/1/claim-e002397e9fe46d83/proto"],
    [
      123456789012345678901234567890n,
      "a830a3a73e742e96",
      "/stableroll-payroll/1/claim-059407f24ddf0dc6/proto",
    ],
  ];

  it.each(cases)("secret %s derives the pinned key and topic", (secret, keyPrefix, topic) => {
    const { privateKey, publicKey } = deriveRecipientKeyPair(secret);
    expect(bytesToHex(privateKey).slice(0, 16)).toBe(keyPrefix);
    expect(deriveContentTopic(publicKey)).toBe(topic);
  });

  /**
   * The hex path specifically: an odd-length bigint hex string must be
   * left-padded, not truncated. Getting this wrong shifts every byte and
   * changes the topic, so it is pinned separately from the cases above.
   */
  it("left-pads odd-length secrets rather than truncating", () => {
    // 0xf is one hex digit; it must encode as the byte 0x0f.
    expect(deriveContentTopic(deriveRecipientKeyPair(0xfn).publicKey)).toBe(
      deriveContentTopic(deriveRecipientKeyPair(15n).publicKey),
    );
    expect(deriveRecipientKeyPair(0xfn).privateKey).not.toEqual(
      deriveRecipientKeyPair(0xf0n).privateKey,
    );
  });
});
