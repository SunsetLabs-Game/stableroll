import { describe, it, expect } from "vitest";
import { Account } from "starknet";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER, getTransfers } from "./config.js";

// Requires real Sepolia credentials — see task-4-report.md for exactly what
// is missing in this environment (funded Sepolia account, a hosted Sepolia
// proving-service URL, a deployed Sepolia STRK20 pool address, and a
// deployed Sepolia Payroll contract address). None of those were available
// here, so this test could not be executed against live infrastructure;
// it is real, correctly-typed code wired via `getTransfers`, not a fake.
describe("fund a payroll run", () => {
  it("deposits into the pool and routes to the Payroll contract via InvokeExternal", async () => {
    // starknet.js 10.x's `Account` constructor takes a single options object
    // (verified against starknet@10.5.0's shipped .d.ts) — the older
    // positional-args constructor no longer exists in this major version.
    const account = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });

    const transfers = await getTransfers(account);

    const result = await transfers
      .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
      .with("STRK", (t) => t.deposit({ amount: 100n }))
      .surplusTo(account.address)
      .execute();

    expect(result.receipt.isSuccess()).toBe(true);

    // Step 5 (SDK README's "Sequencing after transparent state changes"):
    // do not chain a follow-up private action onto this deposit until
    // depositBlock is at least 10 blocks in the past. Task 5 must poll
    // provider.getBlockNumber() until that holds before building on this
    // deposit.
    console.log(
      `deposit tx=${result.receipt.transaction_hash} block=${result.receipt.block_number} pool=${SEPOLIA_CONFIG.poolAddress}`,
    );
  }, 300_000);
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
