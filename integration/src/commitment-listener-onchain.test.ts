import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Account } from "starknet";
import type { LightNode } from "@waku/sdk";
import { ecies } from "@waku/message-encryption";
import { deriveRecipientKeyPair, deriveContentTopic, routingInfoFor } from "payroll-notify/topics.js";
import { createNotificationNode, sendClaimNotification } from "payroll-notify/send-claim-notification.js";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER } from "./config.js";
import { requireEnv } from "./env.js";
import { computeCommitmentHash, computeRunId } from "./commitment.js";
import { newFeltSecret, openAndFundSingleCommitment } from "./sepolia-run.js";
import { registerPendingNotification } from "./notification-outbox.js";
import { pollCommitmentFunded } from "./commitment-listener.js";

/**
 * Live FundCommitment, funded WITHOUT the notifying helper (`notify: false`),
 * notified purely by `pollCommitmentFunded` observing `CommitmentFunded` —
 * the acceptance criterion in docs/adr-commitment-funded-listener.md /
 * tracker issue #42: "a commitment funded by a path that is not
 * sepolia-run.ts results in a notification".
 *
 * Same gating as fund-run-notification.test.ts: needs a funded Sepolia
 * account and the public Waku fleet, so this is not in `test:offline` and
 * not in the required CI gate.
 */
describe("pollCommitmentFunded notifies a commitment funded outside the notifying helper", () => {
  const nodes: LightNode[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(nodes.splice(0).map((n) => n.stop()));
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("delivers the notification once the chain confirms the commitment", async () => {
    const dir = mkdtempSync(join(tmpdir(), "commitment-listener-onchain-"));
    dirs.push(dir);
    const storePath = join(dir, "outbox.json");

    const payer = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });

    const amount = 100n;
    const ownerSecret = newFeltSecret();
    const commitmentSecret = newFeltSecret();
    const runId = computeRunId(ownerSecret);
    const commitmentHash = computeCommitmentHash(commitmentSecret);

    const { publicKey, privateKey } = deriveRecipientKeyPair(commitmentSecret);
    const contentTopic = deriveContentTopic(publicKey);
    const routingInfo = routingInfoFor(contentTopic);
    const recipientNode = await createNotificationNode();
    nodes.push(recipientNode);
    const received: unknown[] = [];
    const decoder = ecies.createDecoder(contentTopic, routingInfo, privateKey);
    const subscribed = await recipientNode.filter.subscribe(decoder, (msg) => {
      if (msg.payload) received.push(JSON.parse(new TextDecoder().decode(msg.payload)));
    });
    expect(subscribed).toBe(true);

    // Registered ahead of funding, the way any real submitter would: it
    // already needs `commitmentSecret` to build FundCommitment's calldata.
    registerPendingNotification(storePath, commitmentHash, {
      runId,
      commitmentSecret,
      token: SEPOLIA_CONFIG.strkAddress,
    });

    const startBlock = await SEPOLIA_RPC_PROVIDER.getBlockNumber();

    // notify: false — this path never calls sendClaimNotification itself.
    // Only pollCommitmentFunded, below, can produce the notification.
    await openAndFundSingleCommitment({
      payer,
      amount,
      ownerSecret,
      commitmentSecret,
      notify: false,
    });

    const senderNode = await createNotificationNode();
    nodes.push(senderNode);
    const result = await pollCommitmentFunded({
      provider: SEPOLIA_RPC_PROVIDER,
      payrollAddress: SEPOLIA_CONFIG.payrollAddress,
      storePath,
      sendNotification: (recipientPublicKey, payload) =>
        sendClaimNotification(senderNode, recipientPublicKey, payload),
      defaultFromBlock: startBlock,
    });

    expect(result.sent).toBe(1);

    await waitUntil(() => received.length > 0, 60_000);
    expect(received).toContainEqual({
      runId: runId.toString(),
      commitmentHash: commitmentHash.toString(),
      secret: commitmentSecret.toString(),
      token: SEPOLIA_CONFIG.strkAddress,
      amount: amount.toString(),
    });
  }, 600_000);
});

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
