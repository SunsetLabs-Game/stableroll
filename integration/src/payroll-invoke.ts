import { num } from "starknet";

/**
 * PayrollOperation's Cairo Serde discriminant (contracts/payroll/src/payroll.cairo):
 * `enum PayrollOperation { OpenRun, FundCommitment, Claim, ApproveRun }` — Cairo's derived
 * Serde for a unit-variant enum writes only the variant index (no payload on
 * any variant), in declaration order.
 */
export const PAYROLL_OPERATION_OPEN_RUN = 0n;
export const PAYROLL_OPERATION_FUND_COMMITMENT = 1n;
export const PAYROLL_OPERATION_CLAIM = 2n;
/**
 * Appended after Claim in the Cairo enum, so the three original discriminants
 * are unchanged. Added by issue #31 for the on-chain dual-approval quorum.
 */
export const PAYROLL_OPERATION_APPROVE_RUN = 3n;

/**
 * Raw felt calldata for `Payroll.privacy_invoke`. The pool calls the contract's
 * fixed `privacy_invoke` entrypoint itself once it has verified the proof, so
 * the SDK `CallDetails` carries only `{ contractAddress, calldata }` — no
 * `entrypoint` field. Positional Serde order, verified against
 * `IPayroll::privacy_invoke`:
 * `(operation, run_id, commitment_hash, token, amount, expected_count, secret, note_id)`.
 * `amount` is u128 (one felt, unlike u256's two).
 */
function buildPrivacyInvokeCall(params: {
  payrollAddress: string;
  operation: bigint;
  runId: bigint;
  commitmentHash: bigint;
  token: string;
  amount: bigint;
  expectedCount: bigint;
  secret: bigint;
  noteId: bigint;
}) {
  return {
    contractAddress: params.payrollAddress,
    calldata: [
      num.toHex(params.operation),
      num.toHex(params.runId),
      num.toHex(params.commitmentHash),
      num.toHex(params.token),
      num.toHex(params.amount),
      num.toHex(params.expectedCount),
      num.toHex(params.secret),
      num.toHex(params.noteId),
    ],
  };
}

/**
 * OpenRun: `amount` is expected_total and `secret` is owner_secret, with
 * `run_id` required to equal computeRunId(secret).
 *
 * Since issue #31 `commitment_hash` and `note_id` are overloaded too, carrying
 * the run's two approver commitments — the same documented dual-use trick that
 * lets `amount` stand in for expected_total, which keeps the quorum from
 * costing two more privacy_invoke parameters.
 *
 * Pass the approvers' *commitments*, never their secrets: each approver runs
 * `computeApproverCommitment` on a secret only they hold and hands over the
 * hash. The two must be non-zero and distinct or OpenRun reverts.
 */
export function buildOpenRunCall(params: {
  payrollAddress: string;
  runId: bigint;
  token: string;
  expectedTotal: bigint;
  expectedCount: bigint;
  ownerSecret: bigint;
  approverACommitment: bigint;
  approverBCommitment: bigint;
}) {
  return buildPrivacyInvokeCall({
    payrollAddress: params.payrollAddress,
    operation: PAYROLL_OPERATION_OPEN_RUN,
    runId: params.runId,
    commitmentHash: params.approverACommitment,
    token: params.token,
    amount: params.expectedTotal,
    expectedCount: params.expectedCount,
    secret: params.ownerSecret,
    noteId: params.approverBCommitment,
  });
}

/**
 * ApproveRun: one approver reveals the secret behind a commitment fixed at
 * OpenRun. The contract reads only `run_id` and `secret`; the rest is passed
 * for calldata-shape parity with the other operations.
 *
 * Both approvers must call this before any FundCommitment is accepted, or the
 * contract reverts QUORUM_NOT_MET. The same secret revealed twice advances one
 * slot only — see docs/adr-dual-approval-quorum.md.
 */
export function buildApproveRunCall(params: {
  payrollAddress: string;
  runId: bigint;
  token: string;
  approverSecret: bigint;
}) {
  return buildPrivacyInvokeCall({
    payrollAddress: params.payrollAddress,
    operation: PAYROLL_OPERATION_APPROVE_RUN,
    runId: params.runId,
    commitmentHash: 0n,
    token: params.token,
    amount: 0n,
    expectedCount: 0n,
    secret: params.approverSecret,
    noteId: 0n,
  });
}

/**
 * FundCommitment: `commitment_hash` is passed in (not derived from secret).
 * `secret` is the run's owner_secret or the call reverts NOT_RUN_OWNER.
 *
 * Requires both approvals to be on-chain already (issue #31); without them the
 * call reverts QUORUM_NOT_MET even for the legitimate run owner.
 */
export function buildFundCommitmentCall(params: {
  payrollAddress: string;
  runId: bigint;
  commitmentHash: bigint;
  token: string;
  amount: bigint;
  runOwnerSecret: bigint;
}) {
  return buildPrivacyInvokeCall({
    payrollAddress: params.payrollAddress,
    operation: PAYROLL_OPERATION_FUND_COMMITMENT,
    runId: params.runId,
    commitmentHash: params.commitmentHash,
    token: params.token,
    amount: params.amount,
    expectedCount: 0n,
    secret: params.runOwnerSecret,
    noteId: 0n,
  });
}

/**
 * Claim: the contract ignores run_id / commitment_hash / token / amount /
 * expected_count and recomputes the hash from `secret`. They are still passed
 * for calldata-shape parity with the other operations (matching tests.cairo).
 */
export function buildClaimCall(params: {
  payrollAddress: string;
  runId: bigint;
  token: string;
  secret: bigint;
  noteId: bigint;
}) {
  return buildPrivacyInvokeCall({
    payrollAddress: params.payrollAddress,
    operation: PAYROLL_OPERATION_CLAIM,
    runId: params.runId,
    commitmentHash: 0n,
    token: params.token,
    amount: 0n,
    expectedCount: 0n,
    secret: params.secret,
    noteId: params.noteId,
  });
}
