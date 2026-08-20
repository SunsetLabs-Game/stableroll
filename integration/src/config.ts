import {
  Account,
  Contract,
  RpcProvider,
  constants,
  hash,
  shortString,
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
// `compute_commitment_hash(secret) = poseidon_hash_span([TAG, secret])`.
//
// Cairo never hashes the tag or the secret before the Poseidon call — a
// Cairo short-string literal like `'PAYROLL_COMMITMENT_TAG:V1'` IS already
// its own felt252 encoding (ASCII bytes packed into one felt), and `secret`
// is passed straight through as a felt252. An earlier version of this file
// (and the plan document's original Task 5 snippet) used
// `hash.starknetKeccak(...)` on both operands before Poseidon-hashing them
// — `starknetKeccak` is the *selector*-hashing function Starknet uses for
// entrypoint names, an entirely different hash from "the felt252 encoding
// of a short string." That produced a commitment hash that could never
// match Cairo's, which would make any funded commitment permanently
// unclaimable (`Claim` would always revert with `COMMITMENT_NOT_FOUND`).
// Fixed: use `shortString.encodeShortString`, which reproduces the exact
// felt252 encoding Cairo's `'...'` short-string literal syntax produces.
export const PAYROLL_COMMITMENT_TAG = "PAYROLL_COMMITMENT_TAG:V1";
const PAYROLL_COMMITMENT_TAG_FELT = shortString.encodeShortString(PAYROLL_COMMITMENT_TAG);

/**
 * @param secret Either an already-felt252 value (bigint — pass through
 *   unhashed, matching Cairo's `secret: felt252` parameter directly), or a
 *   short human-readable string identifier (like the Cairo test's literal
 *   `'COMMIT-A'`), which is short-string-encoded to a felt252 first so it
 *   matches what the equivalent Cairo string literal would encode to.
 */
export function computeCommitmentHash(secret: bigint | string): bigint {
  const secretFelt = typeof secret === "string" ? shortString.encodeShortString(secret) : secret;
  return BigInt(hash.computePoseidonHashOnElements([PAYROLL_COMMITMENT_TAG_FELT, secretFelt]));
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
