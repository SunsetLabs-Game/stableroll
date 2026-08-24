import {
  Account,
  OutsideExecutionVersion,
  type Call,
  type GetTransactionReceiptResponse,
  type OutsideExecutionOptions,
} from "starknet";
import { SEPOLIA_RPC_PROVIDER } from "./config.js";

type CallAndProof = {
  call: Call;
  proof: { proofFacts: string[]; data: string };
};

/**
 * `.execute()` only compiles and proves. Submit via outside-execution, the
 * same pattern StarkWare's e2e suite uses
 * (`account.getOutsideTransaction` → `executeFromOutside` → `waitForTransaction`).
 * Self-relay: `caller` is the signing account.
 */
export async function submitPrivateCall(account: Account, callAndProof: CallAndProof) {
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
  return { txHash: executeTx.transaction_hash, receipt };
}

/**
 * Block number the prover will later read. Narrows via `isSuccess()` because
 * `GetTransactionReceiptResponse` is a union; the ERROR variant has no
 * `block_number` (starknet.js v10 ReceiptTx helpers).
 */
export function receiptBlockNumber(receipt: GetTransactionReceiptResponse): number {
  if (!receipt.isSuccess()) {
    throw new Error(
      receipt.isError()
        ? `transaction failed: ${String(receipt.value)}`
        : "transaction receipt is not successful",
    );
  }
  if (receipt.block_number === undefined) {
    throw new Error("transaction receipt is missing block_number");
  }
  return receipt.block_number;
}

/**
 * 10-block rule (SDK README "Sequencing after transparent state changes",
 * CLAUDE.md §4 rule 5): do not prove against state written more recently than
 * this. Copied from the SDK recipe: wait while `fromBlock >= latest - 10`.
 */
export async function waitForMaturity(fromBlock: number, minDepth = 10, pollMs = 4000) {
  let latest = await SEPOLIA_RPC_PROVIDER.getBlockNumber();
  while (fromBlock >= latest - minDepth) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    latest = await SEPOLIA_RPC_PROVIDER.getBlockNumber();
  }
  return latest;
}
