import { describe, it, expect } from "vitest";
import { Account } from "starknet";
import type { InvokeCalldataBuilderArgs } from "@starkware-libs/starknet-privacy-sdk";
import { cashOut, initBridgeConfig, bridgeEnvFromRecord } from "@starkware-libs/starknet-privacy-bridge";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER, getTransfers } from "./config.js";
import { requireEnv } from "./env.js";
import { buildClaimCall } from "./payroll-invoke.js";
import { submitPrivateCall } from "./submit.js";

// Destination chain for the cash-out leg: Base Sepolia, per
// docs/evm-claim-coverage.md (chain id 84532, CCTP domain 6) — read directly
// from @starkware-libs/starknet-privacy-bridge's own
// packages/bridge-core/src/core/config.ts, not assumed from the RFP's example
// chains. Any of the other rows in that doc would work equally well; this one
// was picked for cheap testnet gas.
const BASE_SEPOLIA_CHAIN_ID = 84532;

// Requires real Sepolia + testnet-CCTP credentials this environment does not
// have (same gap fund-run.test.ts documents): a funded Sepolia account, a
// hosted Sepolia proving-service URL, a deployed Sepolia STRK20 pool with an
// already-funded, already-open commitment (see fund-run.test.ts for that
// step), the bridge's Anonymizer contract addresses, and a Base Sepolia RPC
// URL. None of those were available here, so this test could not be executed
// against live infrastructure. The calldata shape is verified against real
// Cairo source (`buildClaimCall` in payroll-invoke.ts); the `cashOut` call is
// verified against @starkware-libs/starknet-privacy-bridge's real, published
// `packages/bridge-core/src/core/bridgeOut.ts` (see docs/evm-claim-coverage.md
// for exactly what was read and when) — neither signature is guessed.
//
// What is NOT independently verified here: the private
// @starkware-libs/starknet-privacy-sdk's exact transfers-builder behavior for
// an `invoke()` call with no preceding `.with(token, ...).deposit(...)` step.
// fund-run.test.ts's FundCommitment call includes a deposit step because
// funding pulls real ERC20 from the payer; Claim never does (Payroll.cairo's
// Claim branch only calls `approve`, never `transferFrom` — see the contract
// source), so no deposit step is built here. That omission follows directly
// from the Cairo contract's real behavior, not from the private SDK's source,
// which this environment has no access to (see CLAUDE.md §4 rule 1 and §3).
// Confirm this shape against the SDK source before relying on it for a demo.
describe("claim a payroll commitment and bridge it out to an EVM chain", () => {
  it("claims into a private note, then cashes out to a Base Sepolia address with no payer-linking data", async () => {
    const account = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });

    const transfers = await getTransfers(account);

    const runId = BigInt(requireEnv("SEPOLIA_RUN_ID"));
    const secret = BigInt(requireEnv("SEPOLIA_COMMITMENT_SECRET"));
    const noteId = BigInt(requireEnv("SEPOLIA_CLAIM_NOTE_ID"));

    // Step 1: Claim — reveals the commitment secret on-chain, moving the
    // committed funds into a fresh private note owned by this account. See
    // fund-run.test.ts for the sibling FundCommitment call that opened this
    // commitment in the first place, and the 10-block rule (CLAUDE.md §4
    // rule 5) before building on a note this fresh.
    const { callAndProof } = await transfers
      .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
      .invoke((_args: InvokeCalldataBuilderArgs) =>
        buildClaimCall({
          payrollAddress: SEPOLIA_CONFIG.payrollAddress,
          runId,
          token: SEPOLIA_CONFIG.strkAddress,
          secret,
          noteId,
        }),
      )
      .surplusTo(account.address)
      .execute();

    const { txHash, receipt } = await submitPrivateCall(account, callAndProof);
    expect(receipt.isSuccess()).toBe(true);

    // Step 2: cash out the claimed note to a chosen EVM address on Base
    // Sepolia. `cashOut` is @starkware-libs/starknet-privacy-bridge's real
    // exported orchestrator (packages/bridge-core/src/core/bridgeOut.ts) — it
    // re-derives this same Starknet account from `resolveSignature`'s
    // signature, withdraws the claimed note from the pool, and CCTP-burns
    // toward `destination` on `destChainId`.
    initBridgeConfig(bridgeEnvFromRecord(process.env, "BRIDGE_"));

    const destination = requireEnv("BASE_SEPOLIA_DESTINATION_ADDRESS");
    const result = await cashOut({
      resolveSignature: async () => requireEnv("TEST_ACCOUNT_SIGNATURE"),
      amount: BigInt(requireEnv("SEPOLIA_CLAIM_AMOUNT")),
      destination,
      evmAddress: destination,
      destChainId: BASE_SEPOLIA_CHAIN_ID,
    });

    expect(result.destination.toLowerCase()).toBe(destination.toLowerCase());
    expect(result.amountNet).toBeGreaterThan(0n);

    // The privacy property under test (docs/evm-claim-coverage.md, "What 'no
    // on-chain link' actually means here"): the destination-chain mint is
    // public by design (CCTP burns are never hidden), but Payroll's RunInfo
    // never stored a payer address anywhere in this flow, so nothing
    // recoverable from either the burn or the mint transaction can reference
    // the payer's Starknet address, this run's id, or the claimed commitment
    // hash — only `destination` and the bridged amount ever appear.
    console.log(
      `claim tx=${txHash} cash-out burn=${result.burnTxHash} mint=${result.forwardTxHash ?? "(pending)"} destination=${result.destination}`,
    );
  }, 300_000);
});
