import {
  Account,
  Contract,
  RpcProvider,
  constants,
  type AccountInterface,
} from "starknet";
import {
  createPrivateTransfers,
  ProvingServiceProofProvider,
} from "@starkware-libs/starknet-privacy-sdk";
// `ContractDiscoveryProvider` is only exported from the SDK's `/testing`
// subpath (verified against sdk/src/testing/index.ts and sdk/src/index.ts
// in starkware-libs/starknet-privacy at fetch time) — it is NOT exported
// from the package root.
import { ContractDiscoveryProvider, type PoolContractInterface } from "@starkware-libs/starknet-privacy-sdk/testing";
import { requireEnv } from "./env.js";

export const SEPOLIA_CONFIG = {
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  rpcUrl: process.env.SEPOLIA_RPC_URL ?? "",
  poolAddress: process.env.SEPOLIA_POOL_ADDRESS ?? "",
  // Payroll contract address, filled in after Task 4 Step 3's deploy.
  payrollAddress: process.env.SEPOLIA_PAYROLL_ADDRESS ?? "",
  // ERC-20 token address the run is denominated in (Sepolia STRK). Passed
  // both to the SDK's `.with(token, ...)` deposit builder and as the
  // `token: ContractAddress` positional arg to `Payroll.privacy_invoke`.
  // Must be a real felt address — a bare token symbol like "STRK" is not
  // a valid `StarknetAddress` (the SDK's `StarknetAddress` type is
  // `BigNumberish`; a non-numeric string type-checks but throws at
  // runtime when the SDK calls `toBigInt()` on it).
  strkAddress: process.env.SEPOLIA_STRK_ADDRESS ?? "",
  // Hosted Sepolia proving-service URL. No publicly documented hosted
  // Sepolia prover URL was found (see task-4-report.md) — this must be
  // supplied by whoever has access to StarkWare's hosted Sepolia
  // infrastructure, or a self-hosted `crates/proof-interceptor`/proving
  // service instance's URL.
  provingServiceUrl: process.env.SEPOLIA_PROVING_SERVICE_URL ?? "",
};

// Commitment-hash derivation lives in its own SDK-free module so its
// Cairo-parity test can run without a GitHub Packages token. Re-exported here
// so existing importers keep working.
export {
  PAYROLL_COMMITMENT_TAG,
  PAYROLL_RUN_ID_TAG,
  PAYROLL_RUN_OWNER_TAG,
  computeCommitmentHash,
  computeRunId,
  computeRunOwnerCommitment,
} from "./commitment.js";

export const SEPOLIA_RPC_PROVIDER = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.rpcUrl });

/**
 * Builds a `ContractDiscoveryProvider`-compatible pool contract handle by
 * fetching the pool's ABI on chain and wrapping it in a typed `Contract`.
 * `PoolContractInterface` (sdk/src/internal/pool-contract-interface.ts) is a
 * structural subset of the pool's view methods (channel_exists,
 * get_num_of_channels, get_note, nullifier_exists, ...) — a starknet.js
 * `Contract` connected to the real pool ABI satisfies it at runtime, but
 * `Contract`'s dynamic call surface isn't nominally typed as
 * `PoolContractInterface`, hence the cast.
 */
async function buildPoolContract(
  provider: RpcProvider,
  poolAddress: string,
): Promise<PoolContractInterface> {
  const { abi } = await provider.getClassAt(poolAddress);
  // starknet.js 10.x's `Contract` constructor takes a single options object
  // (verified against starknet@10.5.0's shipped .d.ts — the old 3-positional-arg
  // constructor is gone in this major version).
  const contract = new Contract({ abi, address: poolAddress, providerOrAccount: provider });
  return contract as unknown as PoolContractInterface;
}

/**
 * Reusable factory for a `createPrivateTransfers` handle wired to Sepolia.
 *
 * `options.viewingKey` lets a recipient use their own key instead of the
 * funder's `TEST_VIEWING_KEY`. Defaults to the funder key so existing
 * `getTransfers(account)` call sites stay unchanged.
 */
export async function getTransfers(
  account: AccountInterface | Account,
  options?: { viewingKey?: bigint },
) {
  const pool = await buildPoolContract(SEPOLIA_RPC_PROVIDER, SEPOLIA_CONFIG.poolAddress);
  const viewingKey = options?.viewingKey ?? BigInt(requireEnv("TEST_VIEWING_KEY"));

  return createPrivateTransfers({
    account,
    viewingKeyProvider: {
      // `ViewingKeyProvider.getViewingKey()` is declared `Promise<ViewingKey>`
      // in sdk/src/interfaces.ts — must be async, a bare `() => BigInt(...)`
      // returning a plain `bigint` does not satisfy the interface.
      getViewingKey: async () => viewingKey,
    },
    provingProvider: new ProvingServiceProofProvider(
      requireEnv("SEPOLIA_PROVING_SERVICE_URL"),
      SEPOLIA_CONFIG.chainId,
      { ohttp: true },
    ),
    discoveryProvider: new ContractDiscoveryProvider(pool, {}),
    poolContractAddress: SEPOLIA_CONFIG.poolAddress,
  });
}

/** Payroll dispatcher against the deployed Sepolia helper, ABI fetched on-chain. */
export async function getPayrollContract() {
  const address = requireEnv("SEPOLIA_PAYROLL_ADDRESS");
  const { abi } = await SEPOLIA_RPC_PROVIDER.getClassAt(address);
  return new Contract({ abi, address, providerOrAccount: SEPOLIA_RPC_PROVIDER });
}
