import { describe, it, expect, afterEach } from "vitest";
import type { LightNode } from "@waku/sdk";
import { deriveRecipientKeyPair } from "./topics";
import { createNotificationNode, sendClaimNotification } from "./send-claim-notification";
import {
  createRecipientNode,
  queryClaimNotifications,
  subscribeToClaimNotifications,
} from "./receive-claim-notification";

// Live Waku fleet, same precedent as send-claim-notification.test.ts: excluded
// from `test:offline` and therefore from the required gate, because it depends
// on public infrastructure this repo does not control.
//
// It exists because the offline tests cover the *parsing* boundary only. The
// thing issue #35 actually promises — a recipient opens their link and sees the
// payment — depends on the payer's Node-side derivation and the recipient's
// browser-side derivation agreeing, and on the decoder matching the encoder.
// Nothing but a real round trip proves that.
describe("claim notification round trip (live Waku fleet)", () => {
  const nodes: LightNode[] = [];

  afterEach(async () => {
    await Promise.all(nodes.splice(0).map((n) => n.stop()));
  });

  const payloadFor = (secret: bigint) => ({
    runId: "0x1",
    commitmentHash: "0x2",
    secret: secret.toString(),
    token: "0x3",
    amount: "100",
  });

  /**
   * The deterministic half: subscribe first, then send. Proves the encoder and
   * decoder agree and that both sides derive the same content topic.
   */
  it("delivers a sent notification to a Filter subscriber holding the secret", async () => {
    const recipientSecret = BigInt(Date.now());
    const recipientNode = await createRecipientNode();
    nodes.push(recipientNode);

    const received: unknown[] = [];
    const unsubscribe = await subscribeToClaimNotifications(
      recipientNode,
      recipientSecret,
      (payload) => received.push(payload),
    );

    const payerNode = await createNotificationNode();
    nodes.push(payerNode);
    const { publicKey } = deriveRecipientKeyPair(recipientSecret);
    await sendClaimNotification(payerNode, publicKey, payloadFor(recipientSecret));

    // Poll rather than sleep a fixed interval: P2P delivery time is not fixed.
    const deadline = Date.now() + 30_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await unsubscribe();

    expect(received).toEqual([payloadFor(recipientSecret)]);
  }, 90_000);

  /**
   * The half the claim page actually depends on: the notification is sent
   * BEFORE the recipient ever connects, which is the real sequence. A
   * Filter-only implementation returns nothing here.
   *
   * Store retention on the public fleet is finite and not guaranteed, so this
   * asserts only that a message sent moments ago is retrievable.
   */
  it("returns an already-sent notification from Store to a late recipient", async () => {
    const recipientSecret = BigInt(Date.now()) + 1n;

    const payerNode = await createNotificationNode();
    nodes.push(payerNode);
    const { publicKey } = deriveRecipientKeyPair(recipientSecret);
    await sendClaimNotification(payerNode, publicKey, payloadFor(recipientSecret));

    // Only now does the recipient show up, holding nothing but the secret.
    const recipientNode = await createRecipientNode();
    nodes.push(recipientNode);

    let found: unknown[] = [];
    const deadline = Date.now() + 45_000;
    while (found.length === 0 && Date.now() < deadline) {
      found = await queryClaimNotifications(recipientNode, recipientSecret);
      if (found.length === 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    expect(found).toEqual([payloadFor(recipientSecret)]);
  }, 120_000);
});
