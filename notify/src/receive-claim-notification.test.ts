import { describe, it, expect } from "vitest";
import { decodeClaimNotification } from "./receive-claim-notification";

/**
 * Tokenless. Covers the parsing boundary only — the Waku round trip needs the
 * live fleet and stays out of the required gate, matching the precedent set by
 * send-claim-notification.test.ts.
 *
 * This is the boundary where a hostile or corrupted message reaches a
 * recipient's screen, so every rejection path is pinned. A payload that
 * half-parses would render `undefined` where an amount belongs.
 */
const valid = {
  runId: "123",
  commitmentHash: "456",
  secret: "789",
  token: "0xabc",
  amount: "1000",
};

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
}

describe("decodeClaimNotification", () => {
  it("round-trips a well-formed payload", () => {
    expect(decodeClaimNotification(encode(valid))).toEqual(valid);
  });

  it("returns null rather than throwing on non-JSON", () => {
    expect(decodeClaimNotification(encode("not json at all"))).toBeNull();
  });

  it("rejects JSON that is not an object", () => {
    expect(decodeClaimNotification(encode(42))).toBeNull();
    expect(decodeClaimNotification(encode([valid]))).toBeNull();
  });

  it("rejects null, which typeof reports as object", () => {
    expect(decodeClaimNotification(encode(null))).toBeNull();
  });

  it.each(["runId", "commitmentHash", "secret", "token", "amount"])(
    "rejects a payload missing %s",
    (field) => {
      const partial = { ...valid };
      delete (partial as Record<string, unknown>)[field];
      expect(decodeClaimNotification(encode(partial))).toBeNull();
    },
  );

  /**
   * Numbers specifically: the sender stringifies bigints because amounts exceed
   * Number.MAX_SAFE_INTEGER. Accepting a JSON number here would silently lose
   * precision on exactly the field that says how much someone was paid.
   */
  it("rejects numeric fields, which would lose bigint precision", () => {
    expect(decodeClaimNotification(encode({ ...valid, amount: 1000 }))).toBeNull();
  });

  it("rejects empty strings", () => {
    expect(decodeClaimNotification(encode({ ...valid, secret: "" }))).toBeNull();
  });

  it("ignores unknown extra fields rather than rejecting", () => {
    const decoded = decodeClaimNotification(encode({ ...valid, futureField: "x" }));
    expect(decoded).toEqual(valid);
  });
});
