import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Sprint eligibility (issue #2) requires at least three real mainnet
 * transactions that touched the STRK20 pool, recorded in `strk20.json`.
 *
 * This module is the machine-checkable half of that requirement. The issue's
 * acceptance criterion is "each verifiable on Voyager as touching the pool" —
 * eyeballing a block explorer is exactly the kind of assertion CLAUDE.md §4
 * rule 7 says to replace with something that goes red when it stops being
 * true. `verify-mainnet-eligibility.ts` does the on-chain half; this file does
 * the shape half and is deliberately dependency-free (no privacy SDK, no
 * network) so it runs on a clean tokenless checkout.
 */

/** Mainnet STRK20 privacy pool. Every eligibility tx must touch this. */
export const MAINNET_POOL_ADDRESS =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/** `SN_MAIN`, as the short-string felt Starknet uses for chain ids. */
export const MAINNET_CHAIN_ID = "0x534e5f4d41494e";

/** The sprint's hard floor. Fewer than this and the submission scores zero. */
export const REQUIRED_TRANSACTION_COUNT = 3;

export interface Strk20Manifest {
  transactions: string[];
  contracts: string[];
  demo_video: string;
  demo_url: string;
}

export interface ManifestProblem {
  field: string;
  message: string;
}

/**
 * Starknet felts are not zero-padded consistently — the same address appears as
 * `0x040337...` from one source and `0x40337...` from another. Comparing the
 * strings would report a false mismatch, so everything is normalized through
 * BigInt before comparison.
 */
export function normalizeFelt(value: string): bigint {
  return BigInt(value);
}

export function feltEquals(a: string, b: string): boolean {
  try {
    return normalizeFelt(a) === normalizeFelt(b);
  } catch {
    return false;
  }
}

/** A felt252 in hex: `0x` plus 1–64 hex digits, and non-zero. */
const FELT_HEX = /^0x[0-9a-fA-F]{1,64}$/;

export function isWellFormedTxHash(value: unknown): value is string {
  if (typeof value !== "string" || !FELT_HEX.test(value)) return false;
  try {
    return BigInt(value) !== 0n;
  } catch {
    return false;
  }
}

/**
 * Structural validation only — it cannot know whether a hash exists on chain
 * or touched the pool. That is `verify-mainnet-eligibility.ts`'s job, because
 * it needs a mainnet RPC and this must stay runnable offline.
 */
export function validateManifestShape(manifest: unknown): ManifestProblem[] {
  const problems: ManifestProblem[] = [];

  if (typeof manifest !== "object" || manifest === null) {
    return [{ field: "<root>", message: "manifest is not an object" }];
  }
  const m = manifest as Partial<Strk20Manifest>;

  if (!Array.isArray(m.transactions)) {
    problems.push({ field: "transactions", message: "missing or not an array" });
  } else {
    m.transactions.forEach((tx, i) => {
      if (!isWellFormedTxHash(tx)) {
        problems.push({
          field: `transactions[${i}]`,
          message: `not a well-formed non-zero felt hash: ${JSON.stringify(tx)}`,
        });
      }
    });

    // A duplicate hash would inflate the count without proving a second
    // interaction with the pool, which is precisely what the gate exists to
    // stop. Compared numerically so `0x0abc` and `0xabc` collide as they should.
    const seen = new Map<string, number>();
    m.transactions.forEach((tx, i) => {
      if (!isWellFormedTxHash(tx)) return;
      const key = normalizeFelt(tx).toString();
      const first = seen.get(key);
      if (first !== undefined) {
        problems.push({
          field: `transactions[${i}]`,
          message: `duplicate of transactions[${first}] (same hash, different formatting)`,
        });
      } else {
        seen.set(key, i);
      }
    });
  }

  if (!Array.isArray(m.contracts)) {
    problems.push({ field: "contracts", message: "missing or not an array" });
  }
  for (const field of ["demo_video", "demo_url"] as const) {
    if (typeof m[field] !== "string") {
      problems.push({ field, message: "missing or not a string" });
    }
  }

  return problems;
}

/** How many distinct, well-formed hashes the manifest actually carries. */
export function countUsableTransactions(manifest: Strk20Manifest): number {
  const unique = new Set<string>();
  for (const tx of manifest.transactions) {
    if (isWellFormedTxHash(tx)) unique.add(normalizeFelt(tx).toString());
  }
  return unique.size;
}

export function meetsTransactionFloor(manifest: Strk20Manifest): boolean {
  return countUsableTransactions(manifest) >= REQUIRED_TRANSACTION_COUNT;
}

/** Voyager link for a mainnet tx — the form issue #2 asks the doc to carry. */
export function voyagerTxUrl(txHash: string): string {
  return `https://voyager.online/tx/${txHash}`;
}

export const MANIFEST_PATH = fileURLToPath(
  new URL("../../strk20.json", import.meta.url),
);

export function loadManifest(path: string = MANIFEST_PATH): Strk20Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Strk20Manifest;
}
