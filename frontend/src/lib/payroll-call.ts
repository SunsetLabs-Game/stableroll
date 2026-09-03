import { num } from "starknet";

/**
 * Builds the raw `Payroll.privacy_invoke` calldata for the admin UI.
 *
 * Mirrors `integration/src/payroll-invoke.ts`, which is the source of truth for
 * this encoding. It is duplicated rather than imported because `integration`
 * depends on the auth-gated privacy SDK, and pulling that package in here would
 * break the tokenless build (CLAUDE.md §8). If the positional Serde order in
 * `IPayroll::privacy_invoke` changes, both copies must change together.
 *
 * Positional order, verified against `contracts/payroll/src/payroll.cairo`:
 * `(operation, run_id, commitment_hash, token, amount, expected_count, secret, note_id)`.
 * `amount` is a `u128` — one felt, unlike a `u256`'s two.
 */

/** Cairo's derived Serde for a unit-variant enum writes the variant index. */
export const PAYROLL_OPERATION_OPEN_RUN = 0n;
export const PAYROLL_OPERATION_FUND_COMMITMENT = 1n;
export const PAYROLL_OPERATION_CLAIM = 2n;
/** Appended after Claim in the Cairo enum, so 0/1/2 are unchanged (issue #31). */
export const PAYROLL_OPERATION_APPROVE_RUN = 3n;

/** `ChainCall` as `@cavos/kit` v0.1.11 declares it (dist/ChainAdapter-*.d.ts). */
export interface ChainCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

function privacyInvokeCalldata(params: {
  operation: bigint;
  runId: bigint;
  commitmentHash: bigint;
  token: string;
  amount: bigint;
  expectedCount: bigint;
  secret: bigint;
  noteId: bigint;
}): string[] {
  return [
    num.toHex(params.operation),
    num.toHex(params.runId),
    num.toHex(params.commitmentHash),
    num.toHex(params.token),
    num.toHex(params.amount),
    num.toHex(params.expectedCount),
    num.toHex(params.secret),
    num.toHex(params.noteId),
  ];
}

/**
 * `OpenRun`: `amount` carries expected_total and `secret` is the run's
 * owner_secret. Since issue #31 `commitment_hash` and `note_id` carry the two
 * approver commitments — hashes the approvers hand over, never their secrets.
 * They must be non-zero and distinct or the call reverts.
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
}): ChainCall {
  return {
    contractAddress: params.payrollAddress,
    entrypoint: "privacy_invoke",
    calldata: privacyInvokeCalldata({
      operation: PAYROLL_OPERATION_OPEN_RUN,
      runId: params.runId,
      commitmentHash: params.approverACommitment,
      token: params.token,
      amount: params.expectedTotal,
      expectedCount: params.expectedCount,
      secret: params.ownerSecret,
      noteId: params.approverBCommitment,
    }),
  };
}

/**
 * `ApproveRun`: one approver reveals the secret behind a commitment fixed at
 * `OpenRun`. Both approvers must do this before `FundCommitment` is accepted.
 */
export function buildApproveRunCall(params: {
  payrollAddress: string;
  runId: bigint;
  token: string;
  approverSecret: bigint;
}): ChainCall {
  return {
    contractAddress: params.payrollAddress,
    entrypoint: "privacy_invoke",
    calldata: privacyInvokeCalldata({
      operation: PAYROLL_OPERATION_APPROVE_RUN,
      runId: params.runId,
      commitmentHash: 0n,
      token: params.token,
      amount: 0n,
      expectedCount: 0n,
      secret: params.approverSecret,
      noteId: 0n,
    }),
  };
}

/**
 * `FundCommitment`: gated by the dual-approval quorum. The gate that matters is
 * now in `Payroll` itself — this call reverts `QUORUM_NOT_MET` unless both
 * `ApproveRun` calls have landed, whoever builds it. `quorum.ts` still gates the
 * UI so the user sees the problem before paying for a proof.
 */
export function buildFundCommitmentCall(params: {
  payrollAddress: string;
  runId: bigint;
  commitmentHash: bigint;
  token: string;
  amount: bigint;
  runOwnerSecret: bigint;
}): ChainCall {
  return {
    contractAddress: params.payrollAddress,
    entrypoint: "privacy_invoke",
    calldata: privacyInvokeCalldata({
      operation: PAYROLL_OPERATION_FUND_COMMITMENT,
      runId: params.runId,
      commitmentHash: params.commitmentHash,
      token: params.token,
      amount: params.amount,
      expectedCount: 0n,
      secret: params.runOwnerSecret,
      noteId: 0n,
    }),
  };
}

/**
 * Why the admin page does not submit these calls with `useCavos().execute(...)`.
 *
 * `Payroll.privacy_invoke` asserts `get_caller_address() == privacy_contract`
 * and reverts `CALLER_NOT_PRIVACY` otherwise. A Cavos smart account calling it
 * directly is exactly that rejected case. The only caller the contract accepts
 * is the STRK20 pool, reaching it through `InvokeExternal` from inside a proved
 * private transaction — see `integration/src/sepolia-run.ts` for the real path.
 *
 * So these builders produce the call that the pool will carry, and the UI shows
 * it. Wiring the proof-and-submit step needs a proving service, which on
 * mainnet is not published yet (`docs/mainnet-eligibility.md`). Writing an
 * `execute()` here would compile, look finished, and revert on every run.
 */
export const SUBMISSION_IS_POOL_MEDIATED = true;
