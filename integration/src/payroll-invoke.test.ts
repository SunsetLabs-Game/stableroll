import { describe, it, expect } from "vitest";
import {
  PAYROLL_OPERATION_APPROVE_RUN,
  PAYROLL_OPERATION_CLAIM,
  PAYROLL_OPERATION_FUND_COMMITMENT,
  PAYROLL_OPERATION_OPEN_RUN,
  buildApproveRunCall,
  buildClaimCall,
  buildFundCommitmentCall,
  buildOpenRunCall,
} from "./payroll-invoke.js";

/**
 * Tokenless calldata-shape pin. Does not talk to a chain. Guards the 8-felt
 * Serde order of `privacy_invoke` so a later edit cannot silently reorder
 * fields (which would fund or claim against the wrong slots).
 */
const PAYROLL = "0x123";
const TOKEN = "0x456";

describe("payroll privacy_invoke calldata", () => {
  it("encodes OpenRun as discriminant 0 with amount as expected_total", () => {
    const call = buildOpenRunCall({
      payrollAddress: PAYROLL,
      runId: 11n,
      token: TOKEN,
      expectedTotal: 100n,
      expectedCount: 2n,
      ownerSecret: 99n,
      approverACommitment: 0xaaan,
      approverBCommitment: 0xbbbn,
    });
    expect(call.contractAddress).toBe(PAYROLL);
    expect(call.calldata).toHaveLength(8);
    expect(BigInt(call.calldata[0])).toBe(PAYROLL_OPERATION_OPEN_RUN);
    expect(BigInt(call.calldata[4])).toBe(100n);
    expect(BigInt(call.calldata[5])).toBe(2n);
    expect(BigInt(call.calldata[6])).toBe(99n);
  });

  /**
   * The dual use issue #31 relies on: on OpenRun, slot 2 (commitment_hash) and
   * slot 7 (note_id) carry the approver commitments. Swap them and the run
   * registers the approvers in the wrong slots — which still *works*, silently,
   * until an approver's ApproveRun reverts NOT_APPROVER. Hence pinning them.
   */
  it("puts approver A in the commitment_hash slot and B in the note_id slot", () => {
    const call = buildOpenRunCall({
      payrollAddress: PAYROLL,
      runId: 11n,
      token: TOKEN,
      expectedTotal: 100n,
      expectedCount: 2n,
      ownerSecret: 99n,
      approverACommitment: 0xaaan,
      approverBCommitment: 0xbbbn,
    });
    expect(BigInt(call.calldata[2])).toBe(0xaaan);
    expect(BigInt(call.calldata[7])).toBe(0xbbbn);
  });

  it("encodes ApproveRun as discriminant 3 with the approver secret in slot 6", () => {
    const call = buildApproveRunCall({
      payrollAddress: PAYROLL,
      runId: 11n,
      token: TOKEN,
      approverSecret: 0xa11cen,
    });
    expect(call.calldata).toHaveLength(8);
    expect(BigInt(call.calldata[0])).toBe(PAYROLL_OPERATION_APPROVE_RUN);
    expect(BigInt(call.calldata[1])).toBe(11n);
    expect(BigInt(call.calldata[6])).toBe(0xa11cen);
  });

  /**
   * ApproveRun was appended after Claim in the Cairo enum precisely so the three
   * original discriminants keep their values. If someone reorders the enum, this
   * is what catches it before a FundCommitment gets encoded as a Claim.
   */
  it("keeps the original three discriminants at 0, 1 and 2", () => {
    expect(PAYROLL_OPERATION_OPEN_RUN).toBe(0n);
    expect(PAYROLL_OPERATION_FUND_COMMITMENT).toBe(1n);
    expect(PAYROLL_OPERATION_CLAIM).toBe(2n);
    expect(PAYROLL_OPERATION_APPROVE_RUN).toBe(3n);
  });

  it("encodes FundCommitment as discriminant 1 with the passed commitment hash", () => {
    const call = buildFundCommitmentCall({
      payrollAddress: PAYROLL,
      runId: 11n,
      commitmentHash: 77n,
      token: TOKEN,
      amount: 50n,
      runOwnerSecret: 99n,
    });
    expect(BigInt(call.calldata[0])).toBe(PAYROLL_OPERATION_FUND_COMMITMENT);
    expect(BigInt(call.calldata[2])).toBe(77n);
    expect(BigInt(call.calldata[4])).toBe(50n);
    expect(BigInt(call.calldata[6])).toBe(99n);
  });

  it("encodes Claim as discriminant 2 with secret and note_id in the last two slots", () => {
    const call = buildClaimCall({
      payrollAddress: PAYROLL,
      runId: 11n,
      token: TOKEN,
      secret: 123n,
      noteId: 456n,
    });
    expect(BigInt(call.calldata[0])).toBe(PAYROLL_OPERATION_CLAIM);
    expect(BigInt(call.calldata[6])).toBe(123n);
    expect(BigInt(call.calldata[7])).toBe(456n);
  });
});
