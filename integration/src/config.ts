import { Account, Contract, RpcProvider, constants, hash, type AccountInterface } from "starknet";
import {
  createPrivateTransfers,
  ProvingServiceProofProvider,
} from "@starkware-libs/starknet-privacy-sdk";
// `ContractDiscoveryProvider` is only exported from the SDK's `/testing`
// subpath (verified against sdk/src/testing/index.ts and sdk/src/index.ts
// in starkware-libs/starknet-privacy at fetch time) — it is NOT exported
// from the package root.
import { ContractDiscoveryProvider, type PoolContractInterface } from "@starkware-libs/starknet-privacy-sdk/testing";

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

// Mirrors `contracts/payroll/src/payroll.cairo`'s
// `PAYROLL_COMMITMENT_TAG: felt252 = 'PAYROLL_COMMITMENT_TAG:V1'` and
// `compute_commitment_hash(secret) = poseidon_hash_span([TAG, secret])`,
// using the exact off-chain formula the plan itself specifies (see
// docs/superpowers/plans/2026-08-15-plan1-eligibility-and-payroll-core.md,
// Task 5's `claim-unregistered.test.ts` snippet) so Task 4 and Task 5 never
// drift independently on how a JS-side `secret` string maps to the Cairo
// `commitment_hash` felt.
export const PAYROLL_COMMITMENT_TAG = "PAYROLL_COMMITMENT_TAG:V1";

export function computeCommitmentHash(secret: string): bigint {
  return BigInt(
    hash.computePoseidonHashOnElements([
      hash.starknetKeccak(PAYROLL_COMMITMENT_TAG),
      hash.starknetKeccak(secret),
    ]),
  );
}

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
 * Reusable factory for a `createPrivateTransfers` handle wired to Sepolia,
 * used by fund-run.test.ts and (per the task brief) importable by later
 * integration tasks (Task 5, Plan 2).
 *
 * Requires SEPOLIA_RPC_URL, SEPOLIA_POOL_ADDRESS, SEPOLIA_PROVING_SERVICE_URL,
 * and TEST_VIEWING_KEY to be set — see task-4-report.md for why none of
 * these could be filled with real values in this environment.
 */
export async function getTransfers(account: AccountInterface | Account) {
  const pool = await buildPoolContract(SEPOLIA_RPC_PROVIDER, SEPOLIA_CONFIG.poolAddress);

  return createPrivateTransfers({
    account,
    viewingKeyProvider: {
      // `ViewingKeyProvider.getViewingKey()` is declared `Promise<ViewingKey>`
      // in sdk/src/interfaces.ts — must be async, a bare `() => BigInt(...)`
      // returning a plain `bigint` does not satisfy the interface.
      getViewingKey: async () => BigInt(requireEnv("TEST_VIEWING_KEY")),
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
