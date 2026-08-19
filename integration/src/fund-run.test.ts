import { describe, it, expect } from "vitest";
import { Account, OutsideExecutionVersion, num, type OutsideExecutionOptions } from "starknet";
import type { InvokeCalldataBuilderArgs, TokenOperationsBuilder } from "@starkware-libs/starknet-privacy-sdk";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER, getTransfers, computeCommitmentHash } from "./config.js";

// PayrollOperation's Cairo Serde discriminant (contracts/payroll/src/payroll.cairo):
// `enum PayrollOperation { OpenRun, FundCommitment, Claim }` — Cairo's derived
// `Serde` for a unit-variant enum writes only the variant index (no payload
// on any variant here), in declaration order.
const PAYROLL_OPERATION_FUND_COMMITMENT = 1n;

/**
 * Builds the raw felt calldata for `Payroll.privacy_invoke`, matching its
 * exact real positional Serde order:
 * `(operation, run_id, commitment_hash, token, amount, expected_count, secret, note_id)`
 * — verified directly against `contracts/payroll/src/payroll.cairo`'s
 * `IPayroll::privacy_invoke` signature and the `FundCommitment` match arm,
 * and cross-checked against the plan's own Task 2 Cairo test snippet
 * (`.privacy_invoke(PayrollOperation::FundCommitment, run_id, 'COMMIT-A', token, 100_u128, 0, 0, 0)`),
 * which confirms `expected_count`, `secret`, and `note_id` are all unused
 * (and passed as 0) for the `FundCommitment` branch — that branch takes
 * `commitment_hash` directly rather than deriving it from `secret` (only
 * `Claim` recomputes the hash from `secret`).
 *
 * The pool calls this contract's fixed `privacy_invoke` entrypoint itself
 * once it has verified the proof, so `CallDetails` (the SDK/starknet.js
 * type `.invoke()`'s callBuilder must return) carries only
 * `{ contractAddress, calldata }` — no `entrypoint` field to set.
 */
function buildFundCommitmentCall(params: {
  payrollAddress: string;
  runId: bigint;
  commitmentHash: bigint;
  token: string;
  amount: bigint;
}) {
  return {
    contractAddress: params.payrollAddress,
    calldata: [
      num.toHex(PAYROLL_OPERATION_FUND_COMMITMENT),
      num.toHex(params.runId),
      num.toHex(params.commitmentHash),
      num.toHex(params.token),
      num.toHex(params.amount), // u128 fits in a single felt (Cairo Serde: 1 felt, unlike u256's 2)
      num.toHex(0), // expected_count — unused for FundCommitment
      num.toHex(0), // secret — unused for FundCommitment (commitment_hash is passed directly)
      num.toHex(0), // note_id — unused for FundCommitment
    ],
  };
}

// Requires real Sepolia credentials — see task-4-report.md for exactly what
// is missing in this environment (funded Sepolia account, a hosted Sepolia
// proving-service URL, a deployed Sepolia STRK20 pool address, a deployed
// Sepolia Payroll contract address with an already-opened run, and the
// Sepolia STRK token address). None of those were available here, so this
// test could not be executed against live infrastructure; it is real,
// correctly-typed code wired via `getTransfers`, not a fake.
//
// `SEPOLIA_RUN_ID` must reference a run already opened on the deployed
// Payroll contract (via a separate `PayrollOperation::OpenRun` privacy_invoke
// — out of scope for this task, which only funds a commitment against an
// existing run).
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

    const runId = BigInt(requireEnv("SEPOLIA_RUN_ID"));
    const secret = process.env.TEST_COMMITMENT_SECRET ?? "task-4-fund-run-secret";
    const commitmentHash = computeCommitmentHash(secret);
    const amount = 100n;

    // `PrivateTransfersInterface.execute()` (sdk/src/interfaces.ts) only
    // compiles and proves the actions — it returns
    // `{ callAndProof, registry, warnings }`, NOT a submitted-transaction
    // receipt. There is no `result.receipt` on the real type. Submitting
    // requires a separate outside-execution step, exactly as StarkWare's own
    // e2e/tests/integration/privacy-starknet-integration.test.ts does.
    const { callAndProof } = await transfers
      .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
      .with(SEPOLIA_CONFIG.strkAddress, (t: TokenOperationsBuilder) => t.deposit({ amount }))
      .invoke((_args: InvokeCalldataBuilderArgs) =>
        buildFundCommitmentCall({
          payrollAddress: SEPOLIA_CONFIG.payrollAddress,
          runId,
          commitmentHash,
          token: SEPOLIA_CONFIG.strkAddress,
          amount,
        }),
      )
      .surplusTo(account.address)
      .execute();

    // Self-relay: the funder submits its own pre-signed outside-execution
    // call (no separate admin/relayer account is required for this to
    // work — `caller` is just set to the funder's own address).
    const nowSeconds = Math.floor(Date.now() / 1000);
    const callOptions: OutsideExecutionOptions = {
      caller: account.address,
      execute_after: nowSeconds - 3600,
      execute_before: nowSeconds + 3600,
    };
    const outsideTransaction = await account.getOutsideTransaction(
      callOptions,
      callAndProof.call,
      OutsideExecutionVersion.V2,
    );
    const executeTx = await account.executeFromOutside(outsideTransaction, {
      tip: 0n,
      proofFacts: callAndProof.proof.proofFacts,
      proof: callAndProof.proof.data,
    });

    const receipt = await SEPOLIA_RPC_PROVIDER.waitForTransaction(executeTx.transaction_hash);
    expect(receipt.isSuccess()).toBe(true);

    // Step 5 (SDK README's "Sequencing after transparent state changes"):
    // do not chain a follow-up private action onto this deposit until
    // depositBlock is at least 10 blocks in the past. Task 5 must poll
    // provider.getBlockNumber() until that holds before building on this
    // deposit/commitment.
    console.log(
      `fund-commitment tx=${executeTx.transaction_hash} run=${runId} commitment=${commitmentHash} pool=${SEPOLIA_CONFIG.poolAddress} payroll=${SEPOLIA_CONFIG.payrollAddress}`,
    );
  }, 300_000);
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
