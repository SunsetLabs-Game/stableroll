import { describe, it, expect } from "vitest";
import { computeCommitmentHash } from "./commitment.js";

/**
 * Guards the one piece of logic that MUST be byte-identical in Cairo and
 * TypeScript. The literal below is the value `compute_commitment_hash('SECRET-A')`
 * actually returns, and the Cairo suite asserts the same literal in
 * `contracts/payroll/src/tests.cairo::test_commitment_hash_matches_typescript`.
 *
 * Change the domain tag, the operand encoding, or the hash function on either
 * side and exactly one of these two tests goes red. Without this pair, the drift
 * is silent until a real recipient cannot claim real money.
 *
 * This test imports only `starknet`, never the auth-gated privacy SDK, so it
 * runs on a clean checkout with no GitHub Packages token.
 */
const CAIRO_HASH_OF_SECRET_A =
  2916571549562949959572444329737062239145273904095529778681389446543678977274n;

describe("commitment hash parity with Cairo", () => {
  it("reproduces compute_commitment_hash('SECRET-A') exactly", () => {
    expect(computeCommitmentHash("SECRET-A")).toBe(CAIRO_HASH_OF_SECRET_A);
  });

  it("passes bigint secrets through unhashed, matching Cairo's felt252 param", () => {
    // A bigint secret must NOT be re-encoded; encodeShortString would reject or
    // mangle it. Same secret via both spellings must agree.
    const asFelt = BigInt(
      "0x" + Buffer.from("SECRET-A", "ascii").toString("hex"),
    );
    expect(computeCommitmentHash(asFelt)).toBe(CAIRO_HASH_OF_SECRET_A);
  });

  it("is collision-free across distinct secrets", () => {
    expect(computeCommitmentHash("SECRET-A")).not.toBe(computeCommitmentHash("SECRET-B"));
  });
});
