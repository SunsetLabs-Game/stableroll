import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveRecipientKeyPair } from "payroll-notify/topics.js";
import { COMMITMENT_FUNDED_SELECTOR, type RawEvent } from "./payroll-events.js";
import { getCursor, registerPendingNotification, setCursor } from "./notification-outbox.js";
import {
  pollCommitmentFunded,
  type EventSource,
  type GetEventsFilter,
  type SendNotification,
} from "./commitment-listener.js";

/**
 * Tokenless. `EventSource` is a two-method structural subset of starknet.js's
 * `RpcProvider` (`getEvents`, `getBlockNumber`) — a fake satisfies it without
 * touching a real RPC endpoint. `sendNotification` is injected rather than a
 * real Waku `LightNode`, for the same reason: this file tests the polling and
 * dedup logic in docs/adr-commitment-funded-listener.md, not Waku transport
 * (already covered by notify/'s own tests and fund-run-notification.test.ts).
 */

const PAYROLL = "0x024e205271b683ee0a4a07f142c4c5cdef4c12a7e46af65c30e45d76ee6741d1";
const SELECTOR_HEX = "0x" + COMMITMENT_FUNDED_SELECTOR.toString(16);

function fundedEvent(over: Partial<RawEvent> = {}): RawEvent {
  return {
    from_address: PAYROLL,
    keys: [SELECTOR_HEX, "0x11", "0x77"], // run_id 0x11, commitment_hash 0x77
    data: ["0x64", "0x1", "0x64"], // amount 100, funded_count 1, total_committed 100
    ...over,
  };
}

/** A fake `EventSource` that ignores the requested range and always returns `pages`. */
function fakeProvider(pages: RawEvent[][], blockNumber = 1000) {
  const getEventsCalls: GetEventsFilter[] = [];
  let pageIndex = 0;
  return {
    getBlockNumber: vi.fn(async () => blockNumber),
    getEvents: vi.fn(async (filter: GetEventsFilter) => {
      getEventsCalls.push(filter);
      const events = pages[pageIndex] ?? [];
      pageIndex++;
      const hasMore = pageIndex < pages.length;
      return { events, continuation_token: hasMore ? `page-${pageIndex}` : undefined };
    }),
    getEventsCalls,
  };
}

const dirs: string[] = [];
function tempStorePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "commitment-listener-"));
  dirs.push(dir);
  return join(dir, "outbox.json");
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pollCommitmentFunded", () => {
  it("sends a notification for a commitment funded by a path that never called sendClaimNotification", async () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 999n,
      token: "0xabc",
    });
    const provider = fakeProvider([[fundedEvent()]]);
    const sendNotification = vi.fn<SendNotification>(async () => {});

    const result = await pollCommitmentFunded({
      provider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification,
      defaultFromBlock: 0,
    });

    expect(result).toEqual({ processed: 1, sent: 1, unregistered: 0, toBlock: 1000 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [publicKey, payload] = sendNotification.mock.calls[0];
    expect(publicKey).toEqual(deriveRecipientKeyPair(999n).publicKey);
    expect(payload).toEqual({
      runId: "17", // 0x11
      commitmentHash: "119", // 0x77
      secret: "999",
      token: "0xabc",
      amount: "100",
    });
  });

  it("does not send and does not error for a CommitmentFunded event with no registered entry", async () => {
    const storePath = tempStorePath();
    const provider = fakeProvider([[fundedEvent()]]);
    const sendNotification = vi.fn(async () => {});

    const result = await pollCommitmentFunded({
      provider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification,
      defaultFromBlock: 0,
    });

    expect(result).toEqual({ processed: 1, sent: 0, unregistered: 1, toBlock: 1000 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  /**
   * The dedup property from docs/adr-commitment-funded-listener.md's residual
   * risk section: if the process dies after a successful send but before the
   * cursor write reaches disk, the next poll re-requests a range that still
   * includes the already-handled event. It must not send a second time,
   * because the outbox entry that send would need is already gone.
   */
  it("does not re-send when the persisted cursor lags behind an already-sent event", async () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 999n,
      token: "0xabc",
    });
    const sendNotification = vi.fn(async () => {});

    const first = await pollCommitmentFunded({
      provider: fakeProvider([[fundedEvent()]]),
      payrollAddress: PAYROLL,
      storePath,
      sendNotification,
      defaultFromBlock: 0,
    });
    expect(first.sent).toBe(1);

    // Roll the cursor back as if this poll's write never reached disk, so the
    // next poll re-requests a range covering the same already-sent event.
    setCursor(storePath, -1);

    const second = await pollCommitmentFunded({
      provider: fakeProvider([[fundedEvent()]]),
      payrollAddress: PAYROLL,
      storePath,
      sendNotification,
      defaultFromBlock: 0,
    });

    expect(second).toEqual({ processed: 1, sent: 0, unregistered: 1, toBlock: 1000 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("advances the cursor to the polled tip and starts the next poll after it", async () => {
    const storePath = tempStorePath();
    const provider = fakeProvider([[]], 500);

    await pollCommitmentFunded({
      provider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification: vi.fn(async () => {}),
      defaultFromBlock: 0,
    });

    expect(getCursor(storePath)).toBe(500);

    const provider2 = fakeProvider([[]], 700);
    await pollCommitmentFunded({
      provider: provider2,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification: vi.fn(async () => {}),
      defaultFromBlock: 0,
    });

    expect(provider2.getEventsCalls[0].from_block).toEqual({ block_number: 501 });
    expect(getCursor(storePath)).toBe(700);
  });

  it("uses defaultFromBlock only when the store has no cursor yet", async () => {
    const storePath = tempStorePath();
    const provider = fakeProvider([[]], 200);

    await pollCommitmentFunded({
      provider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification: vi.fn(async () => {}),
      defaultFromBlock: 42,
    });

    expect(provider.getEventsCalls[0].from_block).toEqual({ block_number: 42 });
  });

  it("does nothing and leaves the cursor untouched when there is nothing new since the last poll", async () => {
    const storePath = tempStorePath();
    const provider = fakeProvider([[]], 100);
    await pollCommitmentFunded({
      provider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification: vi.fn(async () => {}),
      defaultFromBlock: 0,
    });
    expect(getCursor(storePath)).toBe(100);

    const stalledProvider = fakeProvider([[]], 100);
    const result = await pollCommitmentFunded({
      provider: stalledProvider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification: vi.fn(async () => {}),
      defaultFromBlock: 0,
    });

    expect(result).toEqual({ processed: 0, sent: 0, unregistered: 0, toBlock: 100 });
    expect(stalledProvider.getEvents).not.toHaveBeenCalled();
  });

  it("follows continuation_token across multiple pages", async () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 999n,
      token: "0xabc",
    });
    registerPendingNotification(storePath, 0x88n, {
      runId: 0x11n,
      commitmentSecret: 111n,
      token: "0xabc",
    });
    const provider = fakeProvider([
      [fundedEvent()],
      [fundedEvent({ keys: [SELECTOR_HEX, "0x11", "0x88"] })],
    ]);
    const sendNotification = vi.fn(async () => {});

    const result = await pollCommitmentFunded({
      provider,
      payrollAddress: PAYROLL,
      storePath,
      sendNotification,
      defaultFromBlock: 0,
    });

    expect(result).toEqual({ processed: 2, sent: 2, unregistered: 0, toBlock: 1000 });
    expect(provider.getEvents).toHaveBeenCalledTimes(2);
    expect(provider.getEventsCalls[1].continuation_token).toBe("page-1");
  });
});
