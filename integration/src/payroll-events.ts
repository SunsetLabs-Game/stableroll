import { hash } from "starknet";

/**
 * Decodes `Payroll`'s events from a transaction receipt.
 *
 * Why this exists (issue #33): the Waku claim notification used to be built
 * from the caller's own local variables — it fired because the call did not
 * throw, not because the chain said a commitment was funded. This reads the
 * `CommitmentFunded` event instead, so the notification carries what was
 * actually recorded on-chain.
 *
 * SDK-free on purpose, like `commitment.ts`, so its parity test runs without a
 * GitHub Packages token.
 *
 * ## On `getSelectorFromName`
 *
 * CLAUDE.md §3 warns that `starknetKeccak` near a *commitment* hash is silently
 * wrong. This is the opposite case: a Cairo event's `keys[0]` **is** the
 * starknet_keccak selector of the variant name, so `getSelectorFromName` is
 * exactly right here. The layout below is pinned on the Cairo side by
 * `test_commitment_funded_wire_layout_matches_typescript`.
 */

/** Raw event as a starknet.js receipt carries it. */
export interface RawEvent {
  from_address: string;
  keys: string[];
  data: string[];
}

export const COMMITMENT_FUNDED_SELECTOR = BigInt(hash.getSelectorFromName("CommitmentFunded"));

export interface CommitmentFundedEvent {
  runId: bigint;
  commitmentHash: bigint;
  amount: bigint;
  fundedCount: bigint;
  totalCommitted: bigint;
}

/**
 * Felts arrive zero-padded inconsistently (`0x0153…` from one source, `0x153…`
 * from another), so addresses must be compared numerically. Comparing the raw
 * strings would silently drop events from the very contract we are watching.
 */
function sameFelt(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}

/**
 * Every `CommitmentFunded` this receipt carries, emitted by `payrollAddress`.
 *
 * Layout, pinned by the Cairo test named above:
 *   keys = [selector, run_id, commitment_hash]
 *   data = [amount, funded_count, total_committed]
 *
 * `u128` and `u32` are one felt each, so `data` is exactly three felts. A
 * length mismatch means the event changed shape and is thrown on rather than
 * decoded into plausible-looking nonsense.
 */
export function parseCommitmentFunded(
  events: RawEvent[],
  payrollAddress: string,
): CommitmentFundedEvent[] {
  const out: CommitmentFundedEvent[] = [];
  for (const event of events) {
    if (!sameFelt(event.from_address, payrollAddress)) continue;
    if (event.keys.length === 0) continue;
    if (BigInt(event.keys[0]) !== COMMITMENT_FUNDED_SELECTOR) continue;

    if (event.keys.length !== 3 || event.data.length !== 3) {
      throw new Error(
        `CommitmentFunded has ${event.keys.length} keys and ${event.data.length} data felts, ` +
          `expected 3 and 3. The Cairo event changed shape; update parseCommitmentFunded ` +
          `and test_commitment_funded_wire_layout_matches_typescript together.`,
      );
    }
    out.push({
      runId: BigInt(event.keys[1]),
      commitmentHash: BigInt(event.keys[2]),
      amount: BigInt(event.data[0]),
      fundedCount: BigInt(event.data[1]),
      totalCommitted: BigInt(event.data[2]),
    });
  }
  return out;
}

/**
 * The one `CommitmentFunded` a single-commitment fund transaction must produce.
 *
 * Throws when it is absent. That is the point: a notification must never be
 * sent for a commitment the chain did not announce, which is precisely the bug
 * this replaces — notifying because `execute()` returned without throwing.
 */
export function requireCommitmentFunded(
  events: RawEvent[],
  payrollAddress: string,
  expected: { runId: bigint; commitmentHash: bigint },
): CommitmentFundedEvent {
  const found = parseCommitmentFunded(events, payrollAddress);
  const match = found.find(
    (e) => e.runId === expected.runId && e.commitmentHash === expected.commitmentHash,
  );
  if (!match) {
    throw new Error(
      `no CommitmentFunded event for run ${expected.runId} / commitment ` +
        `${expected.commitmentHash} in this receipt ` +
        `(${found.length} CommitmentFunded event(s) from ${payrollAddress}). ` +
        `Refusing to notify a recipient about a commitment the chain did not announce.`,
    );
  }
  return match;
}
