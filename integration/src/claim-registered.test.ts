import { describe, it, expect } from "vitest";
import { Account } from "starknet";
import {
  Open,
  type InvokeCalldataBuilderArgs,
  type TokenOperationsBuilder,
} from "@starkware-libs/starknet-privacy-sdk";
import {
  SEPOLIA_CONFIG,
  SEPOLIA_RPC_PROVIDER,
  getPayrollContract,
  getTransfers,
} from "./config.js";
import { requireEnv } from "./env.js";
import { buildClaimCall } from "./payroll-invoke.js";
import { asBigInt, asBool, newFeltSecret, openAndFundSingleCommitment } from "./sepolia-run.js";
import { receiptBlockNumber, submitPrivateCall, waitForMaturity } from "./submit.js";

/**
 * Registered recipient path against live Sepolia.
 *
 * The recipient already has a viewing key registered in the pool. The payer
 * opens a one-recipient run and funds a commitment (tokens parked in Payroll).
 * The recipient then Claims with the commitment secret into an open note
 * (`transfer({ amount: Open })` + `args.openNotes[0].noteId`, the real escrow
 * claim shape from sdk/src/interfaces.ts), waits 10 blocks, discovers that
 * note via ContractDiscoveryProvider (keyed by token address, not Payroll),
 * and withdraws to their own wallet.
 *
 * `WithdrawOutput.recipient` is the real field name — a `to` field would
 * silently drop (excess-property checks do not fire through the token-builder
 * callback).
 *
 * Credentials come from env; none are hardcoded. Without them this throws
 * `Missing required env var`, the same convention as fund-run.test.ts.
 */
describe("registered recipient claims a payroll commitment", () => {
  it("claims into an open note, discovers it, and withdraws to the recipient wallet", async () => {
    const payer = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });
    const recipient = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("RECIPIENT_ACCOUNT_ADDRESS"),
      signer: requireEnv("RECIPIENT_ACCOUNT_PRIVATE_KEY"),
    });

    const amount = 100n;
    const ownerSecret = newFeltSecret();
    const commitmentSecret = newFeltSecret();
    const { runId, commitmentHash } = await openAndFundSingleCommitment({
      payer,
      amount,
      ownerSecret,
      commitmentSecret,
    });

    const transfers = await getTransfers(recipient, {
      viewingKey: BigInt(requireEnv("RECIPIENT_VIEWING_KEY")),
    });

    const claimed = await transfers
      .build({
        autoDiscover: { notes: "refresh", channels: "refresh" },
        autoSetup: true,
      })
      .with(SEPOLIA_CONFIG.strkAddress, (t: TokenOperationsBuilder) =>
        t.transfer({ recipient: recipient.address, amount: Open }),
      )
      .invoke((args: InvokeCalldataBuilderArgs) => {
        const openNote = args.openNotes[0];
        if (!openNote) {
          throw new Error("Claim invoke received no open note from the builder");
        }
        return buildClaimCall({
          payrollAddress: SEPOLIA_CONFIG.payrollAddress,
          runId,
          token: SEPOLIA_CONFIG.strkAddress,
          secret: commitmentSecret,
          noteId: BigInt(openNote.noteId),
        });
      })
      .surplusTo(recipient.address)
      .execute();

    const claimSubmit = await submitPrivateCall(recipient, claimed.callAndProof);
    expect(claimSubmit.receipt.isSuccess()).toBe(true);
    await waitForMaturity(receiptBlockNumber(claimSubmit.receipt));

    const payroll = await getPayrollContract();
    const entry = (await payroll.call("get_commitment", [commitmentHash])) as {
      claimed: unknown;
    };
    const run = (await payroll.call("get_run", [runId])) as { paid_count: unknown };
    expect(asBool(entry.claimed)).toBe(true);
    expect(asBigInt(run.paid_count)).toBe(1n);

    const { notes } = await transfers.discoverNotes({ blockIdentifier: "latest" });
    const strkNotes = notes.get(BigInt(SEPOLIA_CONFIG.strkAddress)) ?? [];
    expect(strkNotes.length).toBeGreaterThan(0);

    const { callAndProof: withdrawProof } = await transfers
      .build({ autoDiscover: { notes: "refresh", channels: "refresh" } })
      .with(SEPOLIA_CONFIG.strkAddress, (t: TokenOperationsBuilder) =>
        t.withdraw({ amount: strkNotes[0].amount, recipient: recipient.address }),
      )
      .execute();

    const withdrawSubmit = await submitPrivateCall(recipient, withdrawProof);
    expect(withdrawSubmit.receipt.isSuccess()).toBe(true);

    console.log(
      `registered claim tx=${claimSubmit.txHash} withdraw tx=${withdrawSubmit.txHash} run=${runId} commitment=${commitmentHash} recipient=${recipient.address}`,
    );
  }, 600_000);
});
