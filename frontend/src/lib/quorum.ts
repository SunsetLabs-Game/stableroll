/**
 * Dual-approval gate for payroll funding — the UI half.
 *
 * Separation of duties: two *distinct* approvers must sign off before any
 * `FundCommitment` is submitted. One person cannot fund a payroll run alone,
 * however many times they click.
 *
 * ## Where the real enforcement lives
 *
 * In the contract, since issue #31. `Payroll` fixes two approver commitments at
 * `OpenRun`, requires an `ApproveRun` revealing each approver's secret, and
 * reverts `QUORUM_NOT_MET` on any `FundCommitment` attempted before both have
 * landed — including calls routed straight through the privacy pool that never
 * load this UI. `contracts/payroll/src/tests.cairo` proves it: deleting the
 * quorum assert turns four tests red, among them
 * `test_same_approver_twice_does_not_satisfy_quorum`.
 *
 * That was not always true. This module originally *was* the gate, because the
 * issue-#8 reading step established Cavos has no M-of-N primitive to build on:
 * `cavos-labs/cavos-account` scopes a session key with `SpendingPolicy`,
 * `SessionTimeLimits` and an `allowed_contracts_root`, all per individual key
 * bound to one OAuth identity, and `@cavos/kit` v0.1.11's `addSigner` /
 * `removeSigner` / `listDevices` manage device signers on a single wallet.
 * Grepping that contract for `quorum|multisig|threshold|approver|m_of_n` still
 * returns nothing. The quorum moved into `Payroll` instead.
 *
 * ## So why keep this module
 *
 * It is a UX gate, not a security boundary. It fails the run early and locally,
 * before the user pays for a proof and waits on a transaction that would revert
 * `QUORUM_NOT_MET` anyway. It also tracks a different identity than the chain
 * does — a signing wallet address here, a commitment preimage there — so the
 * two are complementary rather than redundant:
 *
 * - This module answers "have two people in this browser session signed off?"
 * - The contract answers "were two distinct registered secrets revealed
 *   on-chain?" — the one that binds everyone.
 *
 * Neither can prove two different *people* hold the two approver secrets. The
 * contract enforces the mechanism; key custody is an organizational control.
 * See `docs/adr-dual-approval-quorum.md`.
 */

/** A single approver's sign-off, produced by `signMessage` on their wallet. */
export interface Approval {
  /** The approving wallet's Starknet address. Identity is the address alone. */
  approver: string;
  /** The message that was signed — must equal `approvalMessage(runId)`. */
  message: string;
  /** Signature returned by the wallet. Opaque here; presence is what is checked. */
  signature: string;
  /** Unix ms, for display and audit ordering only — never for identity. */
  signedAt: number;
}

/** Approvals required before funding may be submitted. */
export const REQUIRED_APPROVALS = 2;

/**
 * The exact message an approver signs. It names the run, so an approval
 * gathered for one run cannot be replayed as an approval for another.
 */
export function approvalMessage(runId: string): string {
  return `StableRoll: approve funding for payroll run ${normalizeRunId(runId)}`;
}

/**
 * Starknet felts are not zero-padded consistently — the same address arrives as
 * `0x0153…` from one source and `0x153…` from another. Comparing the raw
 * strings would let one approver count twice by reformatting their own address,
 * which is exactly the thing this gate exists to prevent.
 */
export function normalizeAddress(address: string): string {
  try {
    return "0x" + BigInt(address).toString(16);
  } catch {
    // Not felt-shaped. Fall back to a case-insensitive trim so malformed input
    // still collapses to one identity rather than silently counting twice.
    return address.trim().toLowerCase();
  }
}

function normalizeRunId(runId: string): string {
  try {
    return "0x" + BigInt(runId).toString(16);
  } catch {
    return runId.trim();
  }
}

/** True when the approval is well-formed and was signed for THIS run. */
export function isValidApproval(approval: Approval, runId: string): boolean {
  if (!approval.approver || !approval.signature) return false;
  return approval.message === approvalMessage(runId);
}

/**
 * Distinct approver addresses among valid approvals for this run.
 *
 * The whole gate reduces to this function: it counts *identities*, not
 * approvals. Two sign-offs from one wallet collapse to one.
 */
export function distinctApprovers(approvals: Approval[], runId: string): string[] {
  const seen = new Set<string>();
  for (const approval of approvals) {
    if (!isValidApproval(approval, runId)) continue;
    seen.add(normalizeAddress(approval.approver));
  }
  return [...seen];
}

/** Whether quorum is reached: `REQUIRED_APPROVALS` distinct approvers. */
export function hasQuorum(approvals: Approval[], runId: string): boolean {
  return distinctApprovers(approvals, runId).length >= REQUIRED_APPROVALS;
}

/**
 * The gate itself. Call this before building any `FundCommitment` call.
 * Returns the reason funding is blocked, or `null` when it may proceed.
 */
export function fundingBlockedReason(approvals: Approval[], runId: string): string | null {
  const distinct = distinctApprovers(approvals, runId).length;
  if (distinct >= REQUIRED_APPROVALS) return null;
  const submitted = approvals.length;
  if (submitted > distinct) {
    return (
      `Quorum not reached: ${distinct} of ${REQUIRED_APPROVALS} distinct approvers ` +
      `(${submitted} approvals submitted — repeats by the same approver do not count).`
    );
  }
  return `Quorum not reached: ${distinct} of ${REQUIRED_APPROVALS} distinct approvers.`;
}

/**
 * Adds an approval, replacing any earlier one from the same approver rather
 * than appending. Keeps the list a set of identities by construction, so a
 * caller cannot reach quorum by pushing the same approver twice.
 */
export function addApproval(approvals: Approval[], approval: Approval): Approval[] {
  const key = normalizeAddress(approval.approver);
  return [...approvals.filter((a) => normalizeAddress(a.approver) !== key), approval];
}
