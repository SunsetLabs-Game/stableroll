// Recipient side of the notification loop (issue #35). Mirrors
// send-claim-notification.ts, against the same pinned versions.
//
// APIs read from the installed packages rather than assumed, because two of
// them are not symmetric with the send side:
// - `ecies.createDecoder(contentTopic, routingInfo, privateKey)` takes
//   POSITIONAL arguments, while `createEncoder` takes an options object
//   (@waku/message-encryption 0.0.38, dist/ecies.d.ts).
// - `filter.subscribe(decoders, callback)` returns `Promise<boolean>` — false
//   means the subscription was not established, not that no message arrived
//   (@waku/interfaces 0.0.34, dist/filter.d.ts).
//
// ## Why this queries Store before subscribing to Filter
//
// Filter only delivers messages published *while the subscription is open*. In
// the real sequence the payer sends the notification when FundCommitment lands
// and the recipient opens their link some time later, so a Filter-only reader
// would show an empty page for a payment that was correctly notified. Store is
// the historical query that makes "open the link and see your payment" work.
//
// Store retention on the public fleet is finite and not guaranteed. An empty
// result therefore means "nothing found", never "no payment exists" — the
// claim secret in the URL is the authority, not this.

import { createLightNode, Protocols, type LightNode } from "@waku/sdk";
import { ecies } from "@waku/message-encryption";
import type { IDecodedMessage } from "@waku/interfaces";
import { deriveContentTopic, deriveRecipientKeyPair, routingInfoFor } from "./topics";
import type { ClaimNotificationPayload } from "./send-claim-notification";

export type { ClaimNotificationPayload };

/**
 * Parses and validates a decrypted message body.
 *
 * Anything malformed is rejected rather than partially trusted: this payload
 * tells a recipient how much they were paid, and a half-parsed one would render
 * `undefined` next to a currency symbol. Returns null rather than throwing so a
 * single bad message cannot abort a whole page's worth of good ones.
 */
export function decodeClaimNotification(bytes: Uint8Array): ClaimNotificationPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const fields = ["runId", "commitmentHash", "secret", "token", "amount"] as const;
  const record = parsed as Record<string, unknown>;
  for (const field of fields) {
    if (typeof record[field] !== "string" || record[field] === "") return null;
  }
  return {
    runId: record.runId as string,
    commitmentHash: record.commitmentHash as string,
    secret: record.secret as string,
    token: record.token as string,
    amount: record.amount as string,
  };
}

/** Decoder for the topic derived from `secret`, plus that topic's routing info. */
function decoderFor(secret: bigint) {
  const { privateKey, publicKey } = deriveRecipientKeyPair(secret);
  const contentTopic = deriveContentTopic(publicKey);
  const routingInfo = routingInfoFor(contentTopic);
  return {
    contentTopic,
    routingInfo,
    decoder: ecies.createDecoder(contentTopic, routingInfo, privateKey),
  };
}

/**
 * A recipient-side light node. Waits for Store as well as Filter, unlike
 * `createNotificationNode` on the payer side which needs LightPush.
 */
export async function createRecipientNode(): Promise<LightNode> {
  const node = await createLightNode({ defaultBootstrap: true });
  await node.start();
  await node.waitForPeers([Protocols.Store, Protocols.Filter], 30_000);
  return node;
}

/**
 * Notifications already in Store for this secret's topic, newest first.
 *
 * An empty array is a normal outcome, not an error — see the header.
 */
export async function queryClaimNotifications(
  node: LightNode,
  secret: bigint,
): Promise<ClaimNotificationPayload[]> {
  const { contentTopic, routingInfo, decoder } = decoderFor(secret);
  const found: ClaimNotificationPayload[] = [];

  await node.store.queryWithOrderedCallback(
    [decoder],
    (message: IDecodedMessage) => {
      const payload = message.payload ? decodeClaimNotification(message.payload) : null;
      if (payload) found.push(payload);
    },
    {
      pubsubTopic: routingInfo.pubsubTopic,
      contentTopics: [contentTopic],
      includeData: true,
      // Newest first: a recipient who was paid twice on one secret cares about
      // the latest, and this bounds the work if retention is long.
      paginationForward: false,
    },
  );

  return found;
}

/**
 * Live notifications arriving after this call. Returns an unsubscribe function.
 *
 * Complements `queryClaimNotifications`: Store covers what was already sent,
 * this covers a payment funded while the page is open.
 */
export async function subscribeToClaimNotifications(
  node: LightNode,
  secret: bigint,
  onNotification: (payload: ClaimNotificationPayload) => void,
): Promise<() => Promise<void>> {
  const { decoder } = decoderFor(secret);

  const subscribed = await node.filter.subscribe(decoder, (message: IDecodedMessage) => {
    const payload = message.payload ? decodeClaimNotification(message.payload) : null;
    if (payload) onNotification(payload);
  });

  if (!subscribed) {
    throw new Error(
      "subscribeToClaimNotifications: no peer accepted the Filter subscription. " +
        "Live updates are unavailable; any Store results already fetched still stand.",
    );
  }

  return async () => {
    await node.filter.unsubscribe(decoder);
  };
}
