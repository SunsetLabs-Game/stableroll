import { describe, it, expect, afterEach } from "vitest";
import { Account } from "starknet";
import type { LightNode } from "@waku/sdk";
import { ecies } from "@waku/message-encryption";
import { deriveRecipientKeyPair, deriveContentTopic, routingInfoFor } from "payroll-notify/topics.js";
import { createNotificationNode } from "payroll-notify/send-claim-notification.js";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER } from "./config.js";
import { requireEnv } from "./env.js";
import { newFeltSecret, openAndFundSingleCommitment } from "./sepolia-run.js";

/**
 * Live FundCommitment + live Waku. No mocks on the Waku side (same rule as
 * notify/src/send-claim-notification.test.ts). Sepolia credentials follow
 * claim-registered.test.ts: missing env throws `Missing required env var`.
 *
 * Not in `test:offline` and not in the required CI gate: it needs both a
 * funded Sepolia account (privacy SDK) and the public Waku fleet.
 */
describe("FundCommitment notifies the recipient over Waku", () => {
  const nodes: LightNode[] = [];

  afterEach(async () => {
    await Promise.all(nodes.splice(0).map((n) => n.stop()));
  });

  it("delivers a payload decryptable only with the commitment secret", async () => {
    const payer = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });

    const amount = 100n;
    const ownerSecret = newFeltSecret();
    const commitmentSecret = newFeltSecret();
    const { publicKey, privateKey } = deriveRecipientKeyPair(commitmentSecret);
    const contentTopic = deriveContentTopic(publicKey);
    const routingInfo = routingInfoFor(contentTopic);

    const recipientNode = await createNotificationNode();
    nodes.push(recipientNode);

    const received: unknown[] = [];
    const decoder = ecies.createDecoder(contentTopic, routingInfo, privateKey);
    const subscribed = await recipientNode.filter.subscribe(decoder, (msg) => {
      received.push(JSON.parse(new TextDecoder().decode(msg.payload)));
    });
    expect(subscribed).toBe(true);

    const wrongKeyPair = deriveRecipientKeyPair(commitmentSecret + 1n);
    const eavesdropperReceived: unknown[] = [];
    const eavesdropperDecoder = ecies.createDecoder(
      contentTopic,
      routingInfo,
      wrongKeyPair.privateKey,
    );
    await recipientNode.filter.subscribe(eavesdropperDecoder, (msg) => {
      eavesdropperReceived.push(msg);
    });

    const { runId, commitmentHash } = await openAndFundSingleCommitment({
      payer,
      amount,
      ownerSecret,
      commitmentSecret,
    });

    await waitUntil(() => received.length > 0, 60_000);

    const expected = {
      runId: runId.toString(),
      commitmentHash: commitmentHash.toString(),
      secret: commitmentSecret.toString(),
      token: SEPOLIA_CONFIG.strkAddress,
      amount: amount.toString(),
    };
    expect(received.length).toBeGreaterThan(0);
    for (const message of received) {
      expect(message).toEqual(expected);
      expect(message).not.toHaveProperty("payer");
      expect(Object.keys(message as object).sort()).toEqual(
        ["amount", "commitmentHash", "runId", "secret", "token"].sort(),
      );
    }

    for (const message of eavesdropperReceived) {
      expect(message).toBeUndefined();
    }
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
