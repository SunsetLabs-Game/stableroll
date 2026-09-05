// Sends an encrypted claim notification over Waku Light Push. Real API
// verified against @waku/message-encryption 0.0.38's published source
// (packages/message-encryption/src/ecies.ts: `createEncoder`) and
// @waku/interfaces 0.0.34's `ISender.send` — read 2026-08-23, same pass as
// topics.ts (see its header for the full pinned-version list).

import { createLightNode, Protocols, type LightNode } from "@waku/sdk";
import { ecies } from "@waku/message-encryption";
import { deriveContentTopic, routingInfoFor } from "./topics";

export interface ClaimNotificationPayload {
  runId: string;
  commitmentHash: string;
  secret: string;
  token: string;
  amount: string;
}

/**
 * Encrypts `payload` to `recipientPublicKey` and Light Pushes it to the
 * content topic derived from that same key. Called once per recipient right
 * after `FundCommitment` succeeds (see contracts/payroll/src/payroll.cairo).
 *
 * No server ever sees the plaintext or the recipient↔payment mapping: the
 * content topic and the ciphertext are both derived from/encrypted to a key
 * only the recipient can have (see topics.ts's derivation-rule comment).
 */
// `ISendOptions.autoRetry` (default true, `maxAttempts` default 3) retries
// against peers the node already knows about, but a fresh content topic
// (this one, derived per-recipient) maps to one shard of "The Waku Network",
// and the node's generic `waitForPeers(LightPush)` only confirms a
// LightPush-capable peer exists somewhere — not one that already serves
// THIS shard. Observed directly against the live fleet: an immediate send
// can fail with zero successes even right after `waitForPeers` resolves,
// and a bare retry after a short delay (giving shard-specific peer
// selection more time) succeeds. This mirrors the exact same class of
// "real infra needs a retry, not a mock" flakiness `.github/workflows/ci.yml`
// already retries around for Scarb's git-fetch race.
const SEND_RETRY_ATTEMPTS = 3;
const SEND_RETRY_DELAY_MS = 2_000;

export async function sendClaimNotification(
  node: LightNode,
  recipientPublicKey: Uint8Array,
  payload: ClaimNotificationPayload,
): Promise<void> {
  const contentTopic = deriveContentTopic(recipientPublicKey);
  const routingInfo = routingInfoFor(contentTopic);

  const encoder = ecies.createEncoder({
    contentTopic,
    routingInfo,
    publicKey: recipientPublicKey,
  });

  const message = { payload: new TextEncoder().encode(JSON.stringify(payload)) };

  let lastFailures: unknown;
  for (let attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt++) {
    const result = await node.lightPush.send(encoder, message);
    if (result.successes.length > 0) return;

    lastFailures = result.failures;
    if (attempt < SEND_RETRY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_DELAY_MS));
    }
  }

  throw new Error(
    `sendClaimNotification: no peer accepted the push after ${SEND_RETRY_ATTEMPTS} attempts (failures: ${JSON.stringify(lastFailures)})`,
  );
}

/**
 * Convenience factory for a payer- or recipient-side node — a thin wrapper
 * so callers don't have to remember `defaultBootstrap: true` connects to the
 * same fleet `deriveContentTopic`'s routing info targets
 * (`DefaultNetworkConfig`, cluster id 1, "The Waku Network"), and that both
 * `LightPush.send` and `Filter.subscribe` need at least one protocol-capable
 * peer connected first — `waitForPeers` (`WakuNode.waitForPeers`,
 * `@waku/sdk`) blocks until one is.
 */
export async function createNotificationNode(): Promise<LightNode> {
  const node = await createLightNode({ defaultBootstrap: true });
  await node.start();
  await node.waitForPeers([Protocols.Filter, Protocols.LightPush], 30_000);
  return node;
}
