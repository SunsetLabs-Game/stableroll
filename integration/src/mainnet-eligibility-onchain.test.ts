import { describe, it, expect } from "vitest";
import { RpcProvider } from "starknet";
import {
  MAINNET_POOL_ADDRESS,
  REQUIRED_TRANSACTION_COUNT,
  countUsableTransactions,
  feltEquals,
  isWellFormedTxHash,
  loadManifest,
  validateManifestShape,
  voyagerTxUrl,
} from "./mainnet-eligibility.js";

/**
 * Issue #2's acceptance criterion, as a check instead of an assertion:
 * ">= 3 mainnet tx hashes, each verifiable on Voyager as touching the pool."
 *
 * Reading that off a block explorer by hand is the failure mode CLAUDE.md §4
 * rule 7 warns about — a claim nobody can re-run. This re-runs it: every
 * recorded hash is fetched from a mainnet RPC, confirmed to have succeeded,
 * and confirmed to carry an event emitted by the STRK20 pool.
 *
 *   npm run verify:eligibility
 *
 * Deliberately OUT of the required CI gate, for two independent reasons: it
 * needs public RPC infrastructure this repo does not control (the same
 * precedent as `test:liquidity` and notify's Waku suite), and it is
 * legitimately red until the transactions are banked — whereas CLAUDE.md §4
 * rule 8 requires the tokenless suite to stay green on a clean checkout.
 *
 * The default is the RPC the sprint's own Day-0 guide publishes as verified
 * against the live network. Override with MAINNET_RPC_URL if it rate-limits;
 * `https://api.cartridge.gg/x/starknet/mainnet` also works keyless. Note that
 * `starknet-mainnet.public.blastapi.io` no longer serves Starknet at all — it
 * answers every call with "Blast API is no longer available" — so do not reach
 * for it as a fallback.
 */
const RPC_URL =
  process.env.MAINNET_RPC_URL ?? "https://rpc.starknet.lava.build";

interface Verdict {
  ok: boolean;
  status: string;
  poolEvents: number;
  totalEvents: number;
  detail: string;
}

/** Events carry `from_address`; the union-typed receipt does not expose it directly. */
function receiptEventAddresses(receipt: unknown): string[] {
  const events = (receipt as { events?: Array<{ from_address?: string }> })?.events;
  if (!Array.isArray(events)) return [];
  return events.map((e) => e.from_address).filter((a): a is string => typeof a === "string");
}

function executionStatus(receipt: unknown): string {
  return (receipt as { execution_status?: string })?.execution_status ?? "UNKNOWN";
}

async function verifyTransaction(provider: RpcProvider, hash: string): Promise<Verdict> {
  let receipt: unknown;
  try {
    receipt = await provider.getTransactionReceipt(hash);
  } catch (error) {
    // A hash that does not resolve on mainnet is the likeliest mistake here:
    // a Sepolia hash pasted into the mainnet manifest.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: "NOT_FOUND", poolEvents: 0, totalEvents: 0, detail: message };
  }

  const status = executionStatus(receipt);
  const addresses = receiptEventAddresses(receipt);
  const poolEvents = addresses.filter((a) => feltEquals(a, MAINNET_POOL_ADDRESS)).length;

  if (status !== "SUCCEEDED") {
    return {
      ok: false,
      status,
      poolEvents,
      totalEvents: addresses.length,
      detail: `execution_status=${status}, expected SUCCEEDED`,
    };
  }
  if (poolEvents === 0) {
    return {
      ok: false,
      status,
      poolEvents,
      totalEvents: addresses.length,
      detail: `succeeded, but none of its ${addresses.length} event(s) came from the pool`,
    };
  }
  return {
    ok: true,
    status,
    poolEvents,
    totalEvents: addresses.length,
    detail: `succeeded, ${poolEvents}/${addresses.length} event(s) from the pool`,
  };
}

const manifest = loadManifest();
const hashes = manifest.transactions.filter(isWellFormedTxHash);

/**
 * Two real, historical mainnet transactions used to prove the checker above is
 * not vacuous. Without these, a `verifyTransaction` that silently returned no
 * event addresses would fail every hash, and one with an inverted comparison
 * would pass every hash — both look identical to "the manifest is wrong".
 */
const KNOWN_POOL_TX =
  "0x4b8748da220ab60037ef0d30256d61652b76bbeece8808f7afe3214d48806df";
const KNOWN_NON_POOL_TX =
  "0x77364ce8145e511b7bc8008aad82b94e6ff046f2939c1e1cf03b12729542667";

describe("the pool-touching check itself", () => {
  it("recognises a real transaction that touched the pool", async () => {
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const verdict = await verifyTransaction(provider, KNOWN_POOL_TX);
    expect(verdict.status).toBe("SUCCEEDED");
    expect(verdict.poolEvents).toBeGreaterThan(0);
    expect(verdict.ok).toBe(true);
  }, 60_000);

  it("rejects a real transaction that did not touch the pool", async () => {
    // The negative half. This is what stops the gate from being satisfiable by
    // any three arbitrary mainnet hashes.
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const verdict = await verifyTransaction(provider, KNOWN_NON_POOL_TX);

    // Pinning the status and event count first is not decoration: a hash that
    // does not resolve on mainnet also yields ok=false with zero pool events,
    // so without these two lines this test would still pass against a
    // mistyped or invented hash and prove nothing at all. (It did, once.)
    expect(verdict.status).toBe("SUCCEEDED");
    expect(verdict.totalEvents).toBeGreaterThan(0);

    expect(verdict.poolEvents).toBe(0);
    expect(verdict.ok).toBe(false);
  }, 60_000);
});

describe("mainnet eligibility (issue #2)", () => {
  it("has a structurally valid strk20.json", () => {
    expect(validateManifestShape(manifest)).toEqual([]);
  });

  it(`records at least ${REQUIRED_TRANSACTION_COUNT} distinct transactions`, () => {
    const usable = countUsableTransactions(manifest);
    if (usable < REQUIRED_TRANSACTION_COUNT) {
      console.log(
        `\nNOT ELIGIBLE YET: ${usable}/${REQUIRED_TRANSACTION_COUNT} transactions recorded.\n` +
          `Bank them first — see docs/mainnet-eligibility.md for the route and what each proves.\n`,
      );
    }
    expect(usable).toBeGreaterThanOrEqual(REQUIRED_TRANSACTION_COUNT);
  });

  it.runIf(hashes.length > 0)(
    "every recorded transaction succeeded on mainnet and touched the pool",
    async () => {
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      console.log(`\nPool: ${MAINNET_POOL_ADDRESS}\nRPC:  ${RPC_URL}\n`);

      const failures: string[] = [];
      for (const hash of hashes) {
        const verdict = await verifyTransaction(provider, hash);
        console.log(
          `${verdict.ok ? "PASS" : "FAIL"}  ${hash}\n` +
            `      ${verdict.detail}\n      ${voyagerTxUrl(hash)}`,
        );
        if (!verdict.ok) failures.push(`${hash}: ${verdict.detail}`);
      }
      console.log(`\n${hashes.length - failures.length}/${hashes.length} verified.\n`);
      expect(failures).toEqual([]);
    },
    180_000,
  );
});
