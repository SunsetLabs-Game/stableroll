import { describe, it, expect } from "vitest";
import {
  COMMITMENT_FUNDED_SELECTOR,
  parseCommitmentFunded,
  requireCommitmentFunded,
  type RawEvent,
} from "./payroll-events.js";

/**
 * Tokenless. The other half of the wire-layout parity pair: Cairo pins the same
 * selector literal and the same keys/data positions in
 * `contracts/payroll/src/tests.cairo::test_commitment_funded_wire_layout_matches_typescript`.
 *
 * Change the event's fields, their order, or which are `#[key]`, and exactly
 * one of the two goes red. Without this pair the drift is quiet: the parser
 * reads `funded_count` as the amount and notifies a recipient of the wrong sum.
 */
const CAIRO_COMMITMENT_FUNDED_SELECTOR =
  210239575222622801988925347656546139608989566980615942258882279379756782329n;

const PAYROLL = "0x024e205271b683ee0a4a07f142c4c5cdef4c12a7e46af65c30e45d76ee6741d1";
const RUN_ID = 0x11n;
const COMMITMENT = 0x77n;

function fundedEvent(over: Partial<RawEvent> = {}): RawEvent {
  return {
    from_address: PAYROLL,
    keys: ["0x" + COMMITMENT_FUNDED_SELECTOR.toString(16), "0x11", "0x77"],
    data: ["0x64", "0x1", "0x64"], // amount 100, funded_count 1, total_committed 100
    ...over,
  };
}

describe("CommitmentFunded selector parity with Cairo", () => {
  it("matches the literal Cairo pins for selector!(\"CommitmentFunded\")", () => {
    expect(COMMITMENT_FUNDED_SELECTOR).toBe(CAIRO_COMMITMENT_FUNDED_SELECTOR);
  });
});

describe("parseCommitmentFunded", () => {
  it("decodes keys and data by the pinned positions", () => {
    const [event] = parseCommitmentFunded([fundedEvent()], PAYROLL);
    expect(event).toEqual({
      runId: RUN_ID,
      commitmentHash: COMMITMENT,
      amount: 100n,
      fundedCount: 1n,
      totalCommitted: 100n,
    });
  });

  /**
   * A receipt for a private transaction also carries the pool's own events and
   * the token's Transfer. Only Payroll's may be decoded with this layout.
   */
  it("ignores events from other contracts", () => {
    const foreign = fundedEvent({ from_address: "0xdead" });
    expect(parseCommitmentFunded([foreign], PAYROLL)).toHaveLength(0);
  });

  it("compares addresses numerically, not as strings", () => {
    // Same address, zero-padded differently — must still match.
    const padded = fundedEvent({ from_address: "0x0" + PAYROLL.slice(2) });
    expect(parseCommitmentFunded([padded], PAYROLL)).toHaveLength(1);
  });

  it("ignores Payroll's other events", () => {
    const other = fundedEvent({ keys: ["0x1234", "0x11"], data: [] });
    expect(parseCommitmentFunded([other], PAYROLL)).toHaveLength(0);
  });

  /**
   * A changed event shape must be loud. Decoding three felts out of four would
   * produce a plausible-looking amount that is simply the wrong field.
   */
  it("throws rather than guess when the shape changed", () => {
    const extra = fundedEvent({ data: ["0x64", "0x1", "0x64", "0x9"] });
    expect(() => parseCommitmentFunded([extra], PAYROLL)).toThrow(/changed shape/);
  });
});

describe("requireCommitmentFunded", () => {
  it("returns the event matching the expected run and commitment", () => {
    const event = requireCommitmentFunded([fundedEvent()], PAYROLL, {
      runId: RUN_ID,
      commitmentHash: COMMITMENT,
    });
    expect(event.amount).toBe(100n);
  });

  /**
   * The behaviour that replaces "notify because execute() did not throw". If
   * the chain announced nothing, nobody gets told a payment is waiting.
   */
  it("refuses to notify when the chain announced nothing", () => {
    expect(() =>
      requireCommitmentFunded([], PAYROLL, { runId: RUN_ID, commitmentHash: COMMITMENT }),
    ).toThrow(/Refusing to notify/);
  });

  it("refuses when the receipt funded a different commitment", () => {
    expect(() =>
      requireCommitmentFunded([fundedEvent()], PAYROLL, {
        runId: RUN_ID,
        commitmentHash: 0x99n,
      }),
    ).toThrow(/Refusing to notify/);
  });
});
