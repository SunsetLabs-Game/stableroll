import { describe, it, expect } from "vitest";
import { Account } from "starknet";
import type { InvokeCalldataBuilderArgs, TokenOperationsBuilder } from "@starkware-libs/starknet-privacy-sdk";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER, getTransfers, computeCommitmentHash } from "./config.js";
import { requireEnv } from "./env.js";
import { buildFundCommitmentCall } from "./payroll-invoke.js";
import { submitPrivateCall } from "./submit.js";

// Requires real Sepolia credentials — a funded Sepolia account, a hosted
// Sepolia proving-service URL, a deployed Sepolia STRK20 pool address, a
// deployed Sepolia Payroll contract address with an already-opened run, and
// the Sepolia STRK token address. None of those were available in the
// environment that first wrote this file; it is real, correctly-typed code
// wired via `getTransfers`, not a fake.
//
// `SEPOLIA_RUN_ID` must reference a run already opened on the deployed
// Payroll contract (via a separate `PayrollOperation::OpenRun` privacy_invoke).
// Since docs/adr-run-ownership.md, that OpenRun call fixes an owner_secret
// this run must be funded with; `SEPOLIA_RUN_OWNER_SECRET` must hold that
// same value.
//
// FundCommitment does not transferFrom. Claim later approves the pool to pull
// tokens FROM Payroll into an open note, so this test withdraws the deposited
// amount to the Payroll address in the same private tx as the invoke. Without
// that withdraw, Payroll holds nothing and Claim cannot settle.
describe("fund a payroll run", () => {
  it("deposits into the pool, parks tokens in Payroll, and records the commitment", async () => {
    const account = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });

    const transfers = await getTransfers(account);

    const runId = BigInt(requireEnv("SEPOLIA_RUN_ID"));
    const runOwnerSecret = BigInt(requireEnv("SEPOLIA_RUN_OWNER_SECRET"));
    const secret = process.env.TEST_COMMITMENT_SECRET ?? "task-4-fund-run-secret";
    const commitmentHash = computeCommitmentHash(secret);
    const amount = 100n;

    const { callAndProof } = await transfers
      .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
      .with(SEPOLIA_CONFIG.strkAddress, (t: TokenOperationsBuilder) =>
        t.deposit({ amount }).withdraw({
          recipient: SEPOLIA_CONFIG.payrollAddress,
          amount,
        }),
      )
      .invoke((_args: InvokeCalldataBuilderArgs) =>
        buildFundCommitmentCall({
          payrollAddress: SEPOLIA_CONFIG.payrollAddress,
          runId,
          commitmentHash,
          token: SEPOLIA_CONFIG.strkAddress,
          amount,
          runOwnerSecret,
        }),
      )
      .surplusTo(account.address)
      .execute();

    const { txHash, receipt } = await submitPrivateCall(account, callAndProof);
    expect(receipt.isSuccess()).toBe(true);

    console.log(
      `fund-commitment tx=${txHash} run=${runId} commitment=${commitmentHash} pool=${SEPOLIA_CONFIG.poolAddress} payroll=${SEPOLIA_CONFIG.payrollAddress}`,
    );
  }, 300_000);
});
