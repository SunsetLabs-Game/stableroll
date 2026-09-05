import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  describeLookup,
  parseClaimSecret,
  type ClaimLookupState,
} from "./claim-notifications.js";

describe("parseClaimSecret", () => {
  it("accepts decimal and hex spellings of the same felt", () => {
    expect(parseClaimSecret("255")).toBe(255n);
    expect(parseClaimSecret("0xff")).toBe(255n);
  });

  it("tolerates surrounding whitespace from a pasted link", () => {
    expect(parseClaimSecret("  0xff \n")).toBe(255n);
  });

  /**
   * A recipient who mistyped or truncated their link is the likeliest visitor
   * with a bad value here, so this returns null rather than throwing — the page
   * shows a message instead of an error boundary.
   */
  it.each(["", "   ", "not-a-felt", "0x", "12abc", "1.5"])(
    "returns null for %o rather than throwing",
    (input) => {
      expect(parseClaimSecret(input)).toBeNull();
    },
  );

  it("rejects zero and negatives, which no run funds", () => {
    expect(parseClaimSecret("0")).toBeNull();
    expect(parseClaimSecret("0x0")).toBeNull();
    expect(parseClaimSecret("-1")).toBeNull();
  });

  it("keeps full precision on secrets beyond Number.MAX_SAFE_INTEGER", () => {
    const big = "123456789012345678901234567890";
    expect(parseClaimSecret(big)).toBe(BigInt(big));
  });
});

describe("describeLookup", () => {
  /**
   * Acceptance criterion (issue #35): "Handle the empty case honestly: no
   * notification found is normal, not an error." Pinned as wording, because it
   * is the one state a recipient is most likely to see and most likely to
   * misread as "my money is gone".
   */
  it("states plainly that an empty result is not a missing payment", () => {
    const text = describeLookup({ status: "empty" });
    expect(text).toMatch(/normal/i);
    expect(text).toMatch(/does not mean the payment is missing/i);
    expect(text).not.toMatch(/error|failed/i);
  });

  it("distinguishes a network failure from an empty result", () => {
    const failed = describeLookup({ status: "failed", reason: "no peers" });
    expect(failed).toMatch(/no peers/);
    // The claim does not depend on Waku, and the page must say so.
    expect(failed).toMatch(/does not depend on this/i);
    expect(failed).not.toBe(describeLookup({ status: "empty" }));
  });

  it("singularises one pending claim and pluralises more", () => {
    const one = { runId: "1", commitmentHash: "2", secret: "3", token: "0x4", amount: "5" };
    expect(describeLookup({ status: "found", notifications: [one] })).toMatch(
      /\b1 pending claim\b/,
    );
    expect(describeLookup({ status: "found", notifications: [one, one] })).toMatch(
      /2 pending claims/,
    );
  });

  it("covers every state, so a new one cannot render blank", () => {
    const states: ClaimLookupState[] = [
      { status: "idle" },
      { status: "invalid-secret" },
      { status: "connecting" },
      { status: "searching" },
      { status: "empty" },
      { status: "failed", reason: "x" },
      { status: "found", notifications: [] },
    ];
    for (const state of states) {
      expect(describeLookup(state)).toBeTruthy();
    }
  });
});

/**
 * Acceptance criterion (issue #35): "The topic/key derivation has exactly one
 * implementation in the repo."
 *
 * Asserted rather than trusted, following the precedent in
 * `scope-boundary.test.ts`. The risk is concrete: `notify/src/topics.ts` used
 * Node's `Buffer`, and the tempting fix when it failed to bundle would have
 * been to copy the derivation into the frontend and swap the hex helper. Two
 * copies would then drift, the payer would publish to a topic nobody listens
 * on, and nothing would report an error — a topic with no subscriber is
 * indistinguishable from a payment that was never made.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      // Test files are excluded: this very file names the domain tags in order
      // to search for them, and the rule is about shipped code anyway.
      out.push(full);
    }
  }
  return out;
}

describe("the Waku derivation has exactly one implementation", () => {
  const files = sourceFiles(join(import.meta.dirname, ".."));

  it("no frontend file redefines the domain tags", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes("STABLEROLL_WAKU_PRIVATE_KEY") ||
        source.includes("STABLEROLL_WAKU_TOPIC_ID") ||
        source.includes("stableroll-payroll/1/claim-")
      );
    });
    expect(offenders).toEqual([]);
  });

  it("the notification module imports the shared package rather than deriving", () => {
    const source = readFileSync(join(import.meta.dirname, "claim-notifications.ts"), "utf8");
    expect(source).toContain("payroll-notify/receive-claim-notification.js");
    // No hashing here: derivation belongs to notify/src/topics.ts alone.
    expect(source).not.toMatch(/sha256|getPublicKey|createDecoder/);
  });
});
