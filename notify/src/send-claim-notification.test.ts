import { describe, it, expect, afterEach } from "vitest";
import type { LightNode } from "@waku/sdk";
import { ecies } from "@waku/message-encryption";
import { deriveRecipientKeyPair, deriveContentTopic, routingInfoFor } from "./topics.js";
import { createNotificationNode, sendClaimNotification } from "./send-claim-notification.js";

// Talks to the live Waku test fleet (`defaultBootstrap: true` — "The Waku
// Network", cluster id 1) by design, per the tracker issue: proving real P2P
// delivery is the deliverable, and a mock would let a broken integration
// pass silently. Expect this to be slower and occasionally flaky — it
// depends on public infrastructure this repo does not control.
describe("sendClaimNotification (live Waku fleet)", () => {
  const nodes: LightNode[] = [];

  afterEach(async () => {
    await Promise.all(nodes.splice(0).map((n) => n.stop()));
  });

  it("is decryptable only by the holder of the recipient secret", async () => {
    const payerNode = await createNotificationNode();
    nodes.push(payerNode);
    const recipientNode = await createNotificationNode();
    nodes.push(recipientNode);

    const recipientSecret = BigInt(Date.now()); // unique per test run
    const { privateKey, publicKey } = deriveRecipientKeyPair(recipientSecret);
    const contentTopic = deriveContentTopic(publicKey);
    const routingInfo = routingInfoFor(contentTopic);

    const payload = {
      runId: "0x1",
      commitmentHash: "0x2",
      secret: recipientSecret.toString(),
      token: "0x3",
      amount: "100",
    };

    const received: unknown[] = [];
    const decoder = ecies.createDecoder(contentTopic, routingInfo, privateKey);
    const subscribed = await recipientNode.filter.subscribe(decoder, (msg) => {
      received.push(JSON.parse(new TextDecoder().decode(msg.payload)));
    });
    expect(subscribed).toBe(true);

    // A holder of a DIFFERENT secret must not be able to decrypt this
    // payload — subscribing to the SAME topic with the wrong private key
    // must never yield a decoded message (ecies.Decoder.fromProtoObj
    // returns undefined on a failed decrypt, so the callback never fires).
    const wrongKeyPair = deriveRecipientKeyPair(recipientSecret + 1n);
    const eavesdropperReceived: unknown[] = [];
    const eavesdropperDecoder = ecies.createDecoder(contentTopic, routingInfo, wrongKeyPair.privateKey);
    await recipientNode.filter.subscribe(eavesdropperDecoder, (msg) => {
      eavesdropperReceived.push(msg);
    });

    await sendClaimNotification(payerNode, publicKey, payload);

    await waitUntil(() => received.length > 0, 60_000);

    // Waku Light Push/Filter deliver at-least-once, not exactly-once, so a
    // duplicate delivery of the same message is expected protocol behavior,
    // not a bug here — assert every delivery decrypted to the right
    // payload, not that there was exactly one.
    expect(received.length).toBeGreaterThan(0);
    for (const message of received) {
      expect(message).toEqual(payload);
    }

    // The eavesdropper's callback may still fire at the transport level
    // (Filter delivers whatever `Decoder.fromProtoObj` returns, including a
    // failed decrypt) — what matters for the privacy property under test is
    // that a failed decrypt never yields the plaintext payload. `ecies`'s
    // own Decoder returns `undefined` on a decrypt failure (verified in its
    // source), never a partially-decoded object.
    for (const message of eavesdropperReceived) {
      expect(message).toBeUndefined();
    }
  }, 90_000);
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
