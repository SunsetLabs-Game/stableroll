import { describe, it, expect } from "vitest";
import {
  PAYROLL_APPROVER_TAG,
  PAYROLL_COMMITMENT_TAG,
  PAYROLL_RUN_ID_TAG,
  PAYROLL_RUN_OWNER_TAG,
  computeApproverCommitment,
  computeCommitmentHash,
  computeRunId,
  computeRunOwnerCommitment,
} from "./commitment.js";

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

  it("PAYROLL_COMMITMENT_TAG matches the Cairo short-string literal", () => {
    expect(PAYROLL_COMMITMENT_TAG).toBe("PAYROLL_COMMITMENT_TAG:V1");
  });
});

/**
 * Same parity pair as the commitment hash, for the two run-ownership hashes
 * introduced in docs/adr-run-ownership.md. OpenRun requires
 * `run_id == compute_run_id(owner_secret)`; FundCommitment checks
 * `compute_run_owner_commitment(owner_secret)` against the stored
 * `owner_commitment`. If TS drifts, OpenRun reverts RUN_ID_MISMATCH and
 * FundCommitment reverts NOT_RUN_OWNER.
 *
 * Cairo pins the same OWNER-1 literals in
 * `test_run_id_hash_matches_typescript` and
 * `test_run_owner_commitment_hash_matches_typescript`.
 */
const CAIRO_RUN_ID_OF_OWNER_1 =
  1155664066368691955274112831219001117446171185908481296176988237071824193606n;
const CAIRO_OWNER_COMMITMENT_OF_OWNER_1 =
  1457531891617558283633604771381914416639085145906137038567439060842776331852n;

describe("run-id hash parity with Cairo", () => {
  it("reproduces compute_run_id('OWNER-1') exactly", () => {
    expect(computeRunId("OWNER-1")).toBe(CAIRO_RUN_ID_OF_OWNER_1);
  });

  it("passes bigint secrets through unhashed", () => {
    const asFelt = BigInt("0x" + Buffer.from("OWNER-1", "ascii").toString("hex"));
    expect(computeRunId(asFelt)).toBe(CAIRO_RUN_ID_OF_OWNER_1);
  });

  it("is collision-free across distinct secrets", () => {
    expect(computeRunId("OWNER-1")).not.toBe(computeRunId("OWNER-2"));
  });

  it("PAYROLL_RUN_ID_TAG matches the Cairo short-string literal", () => {
    expect(PAYROLL_RUN_ID_TAG).toBe("PAYROLL_RUN_ID_TAG:V1");
  });
});

describe("run-owner-commitment hash parity with Cairo", () => {
  it("reproduces compute_run_owner_commitment('OWNER-1') exactly", () => {
    expect(computeRunOwnerCommitment("OWNER-1")).toBe(CAIRO_OWNER_COMMITMENT_OF_OWNER_1);
  });

  it("uses a different domain than computeRunId so a public run_id cannot stand in for owner_commitment", () => {
    expect(computeRunOwnerCommitment("OWNER-1")).not.toBe(computeRunId("OWNER-1"));
  });

  it("PAYROLL_RUN_OWNER_TAG matches the Cairo short-string literal", () => {
    expect(PAYROLL_RUN_OWNER_TAG).toBe("PAYROLL_RUN_OWNER_TAG:V1");
  });
});

/**
 * Same parity pair again, for the approver commitment behind the on-chain
 * dual-approval quorum (issue #31). Cairo pins this identical literal in
 * `contracts/payroll/src/tests.cairo::test_approver_commitment_hash_matches_typescript`.
 *
 * Drift is quiet and expensive here: the payer registers a commitment the
 * approver's own secret can never reproduce, so `ApproveRun` reverts
 * NOT_APPROVER and the run becomes permanently unfundable — the quorum can
 * never be met by anyone.
 */
const CAIRO_APPROVER_COMMITMENT_OF_APPROVER_1 =
  2727062285932658029016924568603133935256695660341735614525950280572049281991n;

describe("approver-commitment hash parity with Cairo", () => {
  it("reproduces compute_approver_commitment('APPROVER-1') exactly", () => {
    expect(computeApproverCommitment("APPROVER-1")).toBe(CAIRO_APPROVER_COMMITMENT_OF_APPROVER_1);
  });

  it("passes bigint secrets through unhashed", () => {
    const asFelt = BigInt("0x" + Buffer.from("APPROVER-1", "ascii").toString("hex"));
    expect(computeApproverCommitment(asFelt)).toBe(CAIRO_APPROVER_COMMITMENT_OF_APPROVER_1);
  });

  /**
   * Distinctness is what OpenRun enforces, so two approvers who pick different
   * secrets must land on different commitments.
   */
  it("is collision-free across distinct secrets", () => {
    expect(computeApproverCommitment("APPROVER-A")).not.toBe(
      computeApproverCommitment("APPROVER-B"),
    );
  });

  /**
   * Its own domain, so one secret reused across roles yields four unrelated
   * values — a run_id already public on-chain can never satisfy an approver
   * commitment, and the payer's owner_secret is not self-approval.
   */
  it("uses a domain distinct from every other Payroll hash", () => {
    const s = "APPROVER-1";
    const approver = computeApproverCommitment(s);
    expect(approver).not.toBe(computeRunId(s));
    expect(approver).not.toBe(computeRunOwnerCommitment(s));
    expect(approver).not.toBe(computeCommitmentHash(s));
  });

  it("PAYROLL_APPROVER_TAG matches the Cairo short-string literal", () => {
    expect(PAYROLL_APPROVER_TAG).toBe("PAYROLL_APPROVER_TAG:V1");
  });
});
