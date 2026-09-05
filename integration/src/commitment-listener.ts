import { deriveRecipientKeyPair } from "payroll-notify/topics.js";
import { buildClaimNotificationPayload } from "./claim-notification-payload.js";
import { getCursor, setCursor, takePendingNotification } from "./notification-outbox.js";
import { COMMITMENT_FUNDED_SELECTOR, parseCommitmentFunded, type RawEvent } from "./payroll-events.js";

/**
 * On-chain half of docs/adr-commitment-funded-listener.md: polls
 * `CommitmentFunded` and sends the notification for any commitment whose
 * secret was registered in the outbox ahead of time, regardless of which
 * process or path actually submitted `FundCommitment`. Complements, and does
 * not replace, `sepolia-run.ts`'s own receipt-driven send.
 */

/**
 * The `BLOCK_SELECTOR` shape of the real `BLOCK_ID` type `provider.getEvents`
 * expects (`@starknet-io/starknet-types-0104`'s `EVENT_FILTER`). This module
 * only ever queries by block number, never a tag or a hash.
 */
export type BlockSelector = { block_number: number };

export interface GetEventsFilter {
  address: string;
  keys: string[][];
  from_block: BlockSelector;
  to_block: BlockSelector;
  chunk_size: number;
  continuation_token?: string;
}

export interface GetEventsResult {
  events: RawEvent[];
  continuation_token?: string;
}

/** Structural subset of starknet.js's `RpcProvider` — a fake satisfies this in tests without an RPC endpoint. */
export interface EventSource {
  getBlockNumber(): Promise<number>;
  getEvents(filter: GetEventsFilter): Promise<GetEventsResult>;
}

export type SendNotification = (
  recipientPublicKey: Uint8Array,
  payload: ReturnType<typeof buildClaimNotificationPayload>,
) => Promise<void>;

export interface PollCommitmentFundedParams {
  provider: EventSource;
  payrollAddress: string;
  storePath: string;
  sendNotification: SendNotification;
  /** Used only the first time this store is polled, before any cursor exists. */
  defaultFromBlock: number;
  chunkSize?: number;
}

export interface PollCommitmentFundedResult {
  /** CommitmentFunded events observed in the polled range. */
  processed: number;
  /** Of those, how many matched a registered outbox entry and were sent. */
  sent: number;
  /** Of those, how many had no registered outbox entry (not an error). */
  unregistered: number;
  /** The new cursor value — the block this poll processed up to. */
  toBlock: number;
}

const DEFAULT_CHUNK_SIZE = 1000;
const SELECTOR_HEX = "0x" + COMMITMENT_FUNDED_SELECTOR.toString(16);

async function fetchCommitmentFundedEvents(
  provider: EventSource,
  payrollAddress: string,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await provider.getEvents({
      address: payrollAddress,
      keys: [[SELECTOR_HEX]],
      from_block: { block_number: fromBlock },
      to_block: { block_number: toBlock },
      chunk_size: chunkSize,
      continuation_token: continuationToken,
    });
    events.push(...page.events);
    continuationToken = page.continuation_token;
  } while (continuationToken);

  return events;
}

/**
 * Polls `CommitmentFunded` since this store's cursor (or `defaultFromBlock`,
 * before any cursor exists) up to the chain tip, and sends a notification for
 * each event whose commitment has a pending entry in the outbox.
 *
 * An event with no matching entry is not an error — not every commitment
 * funded on this contract need go through this relay. An entry is consumed by
 * `takePendingNotification` the moment it is used, so re-polling an
 * overlapping range (a restarted listener, a lagging cursor) cannot send the
 * same notification twice.
 */
export async function pollCommitmentFunded(
  params: PollCommitmentFundedParams,
): Promise<PollCommitmentFundedResult> {
  const cursor = getCursor(params.storePath);
  const fromBlock = cursor !== null ? cursor + 1 : params.defaultFromBlock;
  const toBlock = await params.provider.getBlockNumber();

  if (fromBlock > toBlock) {
    return { processed: 0, sent: 0, unregistered: 0, toBlock: cursor ?? params.defaultFromBlock };
  }

  const rawEvents = await fetchCommitmentFundedEvents(
    params.provider,
    params.payrollAddress,
    fromBlock,
    toBlock,
    params.chunkSize ?? DEFAULT_CHUNK_SIZE,
  );
  const fundedEvents = parseCommitmentFunded(rawEvents, params.payrollAddress);

  let sent = 0;
  let unregistered = 0;
  for (const event of fundedEvents) {
    const entry = takePendingNotification(params.storePath, event.commitmentHash);
    if (!entry) {
      unregistered++;
      continue;
    }

    const payload = buildClaimNotificationPayload({
      runId: event.runId,
      commitmentHash: event.commitmentHash,
      secret: entry.commitmentSecret,
      token: entry.token,
      amount: event.amount,
    });
    const { publicKey } = deriveRecipientKeyPair(entry.commitmentSecret);
    await params.sendNotification(publicKey, payload);
    sent++;
  }

  setCursor(params.storePath, toBlock);

  return { processed: fundedEvents.length, sent, unregistered, toBlock };
}
