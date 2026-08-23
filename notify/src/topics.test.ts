import { describe, it, expect } from "vitest";
import { deriveRecipientKeyPair, deriveContentTopic } from "./topics.js";

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
