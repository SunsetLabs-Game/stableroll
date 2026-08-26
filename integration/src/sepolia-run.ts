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
import { computeCommitmentHash, computeRunId } from "./commitment.js";
import { buildFundCommitmentCall, buildOpenRunCall } from "./payroll-invoke.js";
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
 * Waits the 10-block maturity window after each private tx.
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
  notify?: boolean;
}) {
  const sendNotification = params.notify !== false;
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
      }),
    )
    .surplusTo(params.payer.address)
    .execute();
  const openSubmit = await submitPrivateCall(params.payer, opened.callAndProof);
  await waitForMaturity(receiptBlockNumber(openSubmit.receipt));

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
