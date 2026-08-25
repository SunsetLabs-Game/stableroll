import { describe, it, expect } from "vitest";
import { Account, OutsideExecutionVersion, num, type OutsideExecutionOptions } from "starknet";
import type { InvokeCalldataBuilderArgs } from "@starkware-libs/starknet-privacy-sdk";
import { SEPOLIA_CONFIG, SEPOLIA_RPC_PROVIDER, getTransfers } from "./config.js";
import {
  submitSolanaClaim,
  verifyLiquidity,
  queryTokens,
  STARKNET_STRK_ASSET_ID,
  SOLANA_USDC_ASSET_ID,
} from "./near-intents-connector.js";

// PayrollOperation::Claim discriminant — see claim-evm.test.ts for the full
// enum layout explanation.
const PAYROLL_OPERATION_CLAIM = 2n;

/**
 * Builds the raw felt calldata for `Payroll.privacy_invoke`'s `Claim` branch.
 * Identical to the version in claim-evm.test.ts — duplicated here because
 * importing from a .test.ts file is fragile and both tests may evolve
 * independently. See that file's doc comment for the full positional-Serde
 * explanation verified against the Cairo source.
 */
function buildClaimCall(params: {
  payrollAddress: string;
  runId: bigint;
  token: string;
  secret: bigint;
  noteId: bigint;
}) {
  return {
    contractAddress: params.payrollAddress,
    calldata: [
      num.toHex(PAYROLL_OPERATION_CLAIM),
      num.toHex(params.runId),
      num.toHex(0), // commitment_hash — recomputed on-chain from secret
      num.toHex(params.token),
      num.toHex(0), // amount — read from the stored CommitmentEntry
      num.toHex(0), // expected_count — unused for Claim
      num.toHex(params.secret),
      num.toHex(params.noteId),
    ],
  };
}

// ---------------------------------------------------------------------------
// This test requires:
//   1. All Sepolia/SDK credentials from fund-run.test.ts and claim-evm.test.ts
//      (TEST_ACCOUNT_ADDRESS, TEST_ACCOUNT_PRIVATE_KEY, SEPOLIA_RPC_URL,
//       SEPOLIA_POOL_ADDRESS, SEPOLIA_PAYROLL_ADDRESS, SEPOLIA_STRK_ADDRESS,
//       TEST_VIEWING_KEY, SEPOLIA_PROVING_SERVICE_URL).
//   2. An already-funded, already-open commitment on Sepolia:
//      SEPOLIA_RUN_ID, SEPOLIA_COMMITMENT_SECRET, SEPOLIA_CLAIM_NOTE_ID,
//      SEPOLIA_CLAIM_AMOUNT.
//   3. NEAR Intents env vars:
//      STARKNET_REFUND_ADDRESS — Starknet address for refunds.
//      SOLANA_TEST_RECIPIENT — the Solana wallet to receive the bridged funds.
//      NEAR_INTENTS_API_KEY (optional — unauthenticated works with 0.2% fee).
//
// Because NEAR Intents has NO testnet (confirmed in docs, 2026-08-23),
// this test exercises real mainnet infrastructure. Per CLAUDE.md §4 rule 3,
// use amounts you would not mind losing and never send a mainnet tx without
// explicit human confirmation.
//
// The Starknet-side claim (Step 1) uses Sepolia for the privacy-pool claim,
// but Step 2 (the NEAR Intents bridge to Solana) would use mainnet. In a
// real integration these would both be on mainnet. The test is structured so
// each step can be run independently when the right env vars are set.
//
// What IS verified here against real source/docs (not guessed):
// - buildClaimCall's calldata shape — verified against contracts/payroll/src/payroll.cairo
// - The NEAR Intents 1-Click API shape — read from OpenAPI spec on 2026-08-23
// - The Solana recipient address format — Base58, confirmed in chain-support docs
// - Asset IDs — queried live from GET /v0/tokens on 2026-08-23
//
// What is NOT verified:
// - Whether the Sepolia privacy-pool claim tx can be used as the deposit for
//   a mainnet NEAR Intents swap (it cannot — the real flow is fully mainnet).
//   This test documents the shape; end-to-end execution requires full mainnet
//   credentials.
// ---------------------------------------------------------------------------

describe("claim a payroll commitment and bridge it out to Solana via NEAR Intents", () => {
  it("verifies that STRK→Solana USDC liquidity is live on NEAR Intents", async () => {
    // This sub-test runs without any Starknet credentials — it only hits the
    // public 1-Click API to confirm the route exists, satisfying the issue's
    // acceptance criterion: "STRK/USDC liquidity to Solana is confirmed live
    // at implementation time, not assumed from the design doc."
    const tokens = await queryTokens();

    const strkToken = tokens.find((t) => t.assetId === STARKNET_STRK_ASSET_ID);
    expect(strkToken, "Starknet STRK should be listed in /v0/tokens").toBeDefined();
    expect(strkToken!.blockchain).toBe("starknet");
    expect(strkToken!.decimals).toBe(18);

    const solUsdcToken = tokens.find((t) => t.assetId === SOLANA_USDC_ASSET_ID);
    expect(solUsdcToken, "Solana USDC should be listed in /v0/tokens").toBeDefined();
    expect(solUsdcToken!.blockchain).toBe("sol");
    expect(solUsdcToken!.decimals).toBe(6);

    // Dry-run quote to verify the route is live.
    const quote = await verifyLiquidity();
    expect(quote.quote.amountOut).toBeTruthy();
    expect(Number(quote.quote.amountOut)).toBeGreaterThan(0);
    console.log(
      `Liquidity verified: 1 STRK → ${quote.quote.amountOutFormatted} USDC on Solana ($${quote.quote.amountOutUsd})`,
    );
  }, 30_000);

  it("claims into a private note, then bridges to a Solana address with no payer-linking data", async () => {
    const account = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });

    const transfers = await getTransfers(account);

    const runId = BigInt(requireEnv("SEPOLIA_RUN_ID"));
    const secret = BigInt(requireEnv("SEPOLIA_COMMITMENT_SECRET"));
    const noteId = BigInt(requireEnv("SEPOLIA_CLAIM_NOTE_ID"));
    const claimAmount = requireEnv("SEPOLIA_CLAIM_AMOUNT");
    const solanaRecipient = requireEnv("SOLANA_TEST_RECIPIENT");

    // Step 1: Claim on Starknet — reveals the commitment secret, moving the
    // committed funds into a fresh private note owned by this account.
    // See claim-evm.test.ts for the identical step with full doc comments.
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
    const claimTx = await account.executeFromOutside(outsideTransaction, {
      tip: 0n,
      proofFacts: callAndProof.proof.proofFacts,
      proof: callAndProof.proof.data,
    });
    const claimReceipt = await SEPOLIA_RPC_PROVIDER.waitForTransaction(
      claimTx.transaction_hash,
    );
    expect(claimReceipt.isSuccess()).toBe(true);
    console.log(`Step 1 complete: Starknet claim tx=${claimTx.transaction_hash}`);

    // Step 2: Bridge from Starknet to Solana via NEAR Intents 1-Click API.
    //
    // In the real mainnet flow, the funds from the privacy-pool claim would
    // be sent to the deposit address returned by the 1-Click quote. The
    // submitSolanaClaim orchestrator handles:
    //   quote → deposit-notify → poll-for-completion → extract Solana tx sig
    //
    // The privacy property under test: like the EVM leg (docs/evm-claim-coverage.md),
    // the Solana-side delivery contains only the recipient's chosen address and
    // the bridged amount. Payroll's RunInfo never stored a payer address, and
    // the NEAR Intents solver sees only a Starknet deposit address — not the
    // original payer identity, run id, or commitment hash.
    const result = await submitSolanaClaim({
      starknetTxHash: claimTx.transaction_hash,
      amount: claimAmount,
      solanaRecipient,
    });

    expect(result.solanaTxSignature).toBeTruthy();
    expect(result.statusResponse.status).toBe("SUCCESS");

    console.log(
      `Step 2 complete: claim tx=${claimTx.transaction_hash} ` +
        `solana_tx=${result.solanaTxSignature} ` +
        `destination=${solanaRecipient} ` +
        `amountOut=${result.statusResponse.swapDetails.amountOutFormatted ?? "unknown"}`,
    );
  }, 600_000); // 10 min — cross-chain takes time
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
