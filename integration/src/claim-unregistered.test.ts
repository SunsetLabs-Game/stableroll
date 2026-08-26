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
import { submitPrivateCall } from "./submit.js";

/**
 * Unregistered recipient path against live Sepolia, end to end.
 *
 * "Unregistered" means the recipient was not in the pool at deposit time and
 * authorizes the payroll release with the commitment secret only. The SDK
 * still requires a local viewingKeyProvider (`createPrivateTransfers` has no
 * keyless constructor — verified against sdk/src/interfaces.ts). At claim
 * time this test passes `autoRegister: true` so the account registers as
 * part of the Claim transaction. Payroll has no public `claim_to_address`
 * entrypoint; we will not add one.
 *
 * Off-chain hash parity for the secret lives in commitment-parity.test.ts
 * (tokenless). This file is the on-chain half.
 *
 * Credentials come from env; none are hardcoded.
 */
describe("unregistered recipient claims via commitment secret", () => {
  it("claims a funded commitment using only the secret, registering at claim time", async () => {
    const payer = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("TEST_ACCOUNT_ADDRESS"),
      signer: requireEnv("TEST_ACCOUNT_PRIVATE_KEY"),
    });
    const recipient = new Account({
      provider: SEPOLIA_RPC_PROVIDER,
      address: requireEnv("UNREGISTERED_ACCOUNT_ADDRESS"),
      signer: requireEnv("UNREGISTERED_ACCOUNT_PRIVATE_KEY"),
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
      viewingKey: BigInt(requireEnv("UNREGISTERED_VIEWING_KEY")),
    });

    const claimed = await transfers
      .build({
        autoRegister: true,
        autoSetup: true,
        autoDiscover: { notes: "refresh", channels: "refresh" },
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

    const payroll = await getPayrollContract();
    const entry = (await payroll.call("get_commitment", [commitmentHash])) as {
      claimed: unknown;
    };
    const run = (await payroll.call("get_run", [runId])) as {
      paid_count: unknown;
      closed: unknown;
    };
    expect(asBool(entry.claimed)).toBe(true);
    expect(asBigInt(run.paid_count)).toBe(1n);
    expect(asBool(run.closed)).toBe(true);

    console.log(
      `unregistered claim tx=${claimSubmit.txHash} run=${runId} commitment=${commitmentHash} recipient=${recipient.address}`,
    );
  }, 600_000);
});
