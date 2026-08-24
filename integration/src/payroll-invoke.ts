import { num } from "starknet";

/**
 * PayrollOperation's Cairo Serde discriminant (contracts/payroll/src/payroll.cairo):
 * `enum PayrollOperation { OpenRun, FundCommitment, Claim }` — Cairo's derived
 * Serde for a unit-variant enum writes only the variant index (no payload on
 * any variant), in declaration order.
 */
export const PAYROLL_OPERATION_OPEN_RUN = 0n;
export const PAYROLL_OPERATION_FUND_COMMITMENT = 1n;
export const PAYROLL_OPERATION_CLAIM = 2n;

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

/** OpenRun: `amount` is expected_total, `secret` is owner_secret, run_id must equal computeRunId(secret). */
export function buildOpenRunCall(params: {
  payrollAddress: string;
  runId: bigint;
  token: string;
  expectedTotal: bigint;
  expectedCount: bigint;
  ownerSecret: bigint;
}) {
  return buildPrivacyInvokeCall({
    payrollAddress: params.payrollAddress,
    operation: PAYROLL_OPERATION_OPEN_RUN,
    runId: params.runId,
    commitmentHash: 0n,
    token: params.token,
    amount: params.expectedTotal,
    expectedCount: params.expectedCount,
    secret: params.ownerSecret,
    noteId: 0n,
  });
}

/**
 * FundCommitment: `commitment_hash` is passed in (not derived from secret).
 * `secret` is the run's owner_secret or the call reverts NOT_RUN_OWNER.
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
