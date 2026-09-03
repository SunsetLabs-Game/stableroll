import { randomBytes } from "node:crypto";
import { Account } from "starknet";
import type { InvokeCalldataBuilderArgs, TokenOperationsBuilder } from "@starkware-libs/starknet-privacy-sdk";
import { deriveRecipientKeyPair } from "payroll-notify/topics.js";
import {
  createNotificationNode,
  sendClaimNotification,
} from "payroll-notify/send-claim-notification.js";
import { buildClaimNotificationPayload } from "./claim-notification-payload.js";
import { SEPOLIA_CONFIG, getTransfers } from "./config.js";
import {
  computeApproverCommitment,
  computeCommitmentHash,
  computeRunId,
} from "./commitment.js";
import {
  buildApproveRunCall,
  buildFundCommitmentCall,
  buildOpenRunCall,
} from "./payroll-invoke.js";
import { receiptBlockNumber, submitPrivateCall, waitForMaturity } from "./submit.js";

/** 128-bit non-zero felt, unique per test run so two claims cannot squat the same run_id. */
export function newFeltSecret(): bigint {
  const value = BigInt("0x" + randomBytes(16).toString("hex"));
  return value === 0n ? 1n : value;
}

export function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  throw new Error(`expected bigint-compatible value, got ${typeof value}`);
}

export function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return asBigInt(value) !== 0n;
}

/**
 * Opens a one-recipient run and funds a single commitment, parking the tokens
 * in Payroll (withdraw-to-helper, then FundCommitment). Matches the STRK20
 * escrow pattern: FundCommitment does not transferFrom; Claim later approves
 * the pool to pull from Payroll into an open note.
 *
 * Waits the 10-block maturity window after each private tx. Since issue #31
 * that is four private transactions rather than two: OpenRun, two ApproveRun
 * calls satisfying the on-chain quorum, then FundCommitment.
 *
 * Both approver secrets are generated here because this helper drives the whole
 * run from one account. That exercises the contract's rule — two *distinct*
 * secrets — but it is not separation of duties by itself: the contract can
 * enforce that two different secrets were revealed, never that two different
 * people hold them. See docs/adr-dual-approval-quorum.md.
 *
 * After a successful FundCommitment, sends a Waku claim notification unless
 * `notify` is false. Claim-path tests pass `notify: false` so they do not
 * also depend on the live Waku fleet; the dedicated notification test uses
 * the default (true).
 */
export async function openAndFundSingleCommitment(params: {
  payer: Account;
  amount: bigint;
  ownerSecret: bigint;
  commitmentSecret: bigint;
  /** Defaults to fresh random secrets. Must differ, or OpenRun reverts. */
  approverASecret?: bigint;
  approverBSecret?: bigint;
  notify?: boolean;
}) {
  const sendNotification = params.notify !== false;
  const approverASecret = params.approverASecret ?? newFeltSecret();
  const approverBSecret = params.approverBSecret ?? newFeltSecret();
  if (approverASecret === approverBSecret) {
    throw new Error("approver secrets must differ; OpenRun reverts APPROVERS_NOT_DISTINCT");
  }
  const transfers = await getTransfers(params.payer);
  const runId = computeRunId(params.ownerSecret);
  const commitmentHash = computeCommitmentHash(params.commitmentSecret);
  const payrollAddress = SEPOLIA_CONFIG.payrollAddress;
  const token = SEPOLIA_CONFIG.strkAddress;

  // Overlap Waku peer discovery with OpenRun + FundCommitment + the
  // 10-block waits. createNotificationNode's waitForPeers is ~30s; doing
  // it after fund would add that on the critical path for no reason.
  const nodePromise = sendNotification ? createNotificationNode() : null;

  const opened = await transfers
    .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
    .invoke((_args: InvokeCalldataBuilderArgs) =>
      buildOpenRunCall({
        payrollAddress,
        runId,
        token,
        expectedTotal: params.amount,
        expectedCount: 1n,
        ownerSecret: params.ownerSecret,
        approverACommitment: computeApproverCommitment(approverASecret),
        approverBCommitment: computeApproverCommitment(approverBSecret),
      }),
    )
    .surplusTo(params.payer.address)
    .execute();
  const openSubmit = await submitPrivateCall(params.payer, opened.callAndProof);
  await waitForMaturity(receiptBlockNumber(openSubmit.receipt));

  // The quorum, on-chain. FundCommitment below reverts QUORUM_NOT_MET until
  // both of these land, however valid the owner secret is.
  for (const approverSecret of [approverASecret, approverBSecret]) {
    const approved = await transfers
      .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
      .invoke((_args: InvokeCalldataBuilderArgs) =>
        buildApproveRunCall({ payrollAddress, runId, token, approverSecret }),
      )
      .surplusTo(params.payer.address)
      .execute();
    const approveSubmit = await submitPrivateCall(params.payer, approved.callAndProof);
    await waitForMaturity(receiptBlockNumber(approveSubmit.receipt));
  }

  const funded = await transfers
    .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
    .with(token, (t: TokenOperationsBuilder) =>
      t.deposit({ amount: params.amount }).withdraw({
        recipient: payrollAddress,
        amount: params.amount,
      }),
    )
    .invoke((_args: InvokeCalldataBuilderArgs) =>
      buildFundCommitmentCall({
        payrollAddress,
        runId,
        commitmentHash,
        token,
        amount: params.amount,
        runOwnerSecret: params.ownerSecret,
      }),
    )
    .surplusTo(params.payer.address)
    .execute();
  const fundSubmit = await submitPrivateCall(params.payer, funded.callAndProof);
  await waitForMaturity(receiptBlockNumber(fundSubmit.receipt));

  let notified = false;
  if (nodePromise) {
    const { publicKey } = deriveRecipientKeyPair(params.commitmentSecret);
    const payload = buildClaimNotificationPayload({
      runId,
      commitmentHash,
      secret: params.commitmentSecret,
      token,
      amount: params.amount,
    });
    const node = await nodePromise;
    try {
      await sendClaimNotification(node, publicKey, payload);
      notified = true;
    } finally {
      await node.stop();
    }
  }

  return {
    runId,
    commitmentHash,
    openTx: openSubmit.txHash,
    fundTx: fundSubmit.txHash,
    notified,
  };
}
