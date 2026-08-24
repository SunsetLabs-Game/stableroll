import { hash, shortString } from "starknet";

/**
 * Commitment-hash derivation, mirrored from
 * `contracts/payroll/src/payroll.cairo`.
 *
 * Deliberately kept in its own module with NO dependency on
 * `@starkware-libs/starknet-privacy-sdk`, so the parity test that guards it can
 * run without a GitHub Packages token (see README "Install"). Everything else in
 * `integration/` needs that token; this does not.
 *
 * Cairo side:
 *   const PAYROLL_COMMITMENT_TAG: felt252 = 'PAYROLL_COMMITMENT_TAG:V1';
 *   compute_commitment_hash(secret) = poseidon_hash_span([TAG, secret])
 *
 * Neither operand is pre-hashed. A Cairo short-string literal like
 * `'PAYROLL_COMMITMENT_TAG:V1'` IS already its felt252 encoding (ASCII bytes
 * packed into one felt), and `secret` is passed straight through as a felt252.
 *
 * `hash.starknetKeccak` is NOT the way to reproduce that — it is Starknet's
 * entrypoint-*selector* hash, an unrelated function. Using it here yields a
 * commitment hash Cairo can never reproduce, which does not fail loudly: the
 * commitment funds fine on-chain and then becomes permanently unclaimable,
 * because `Claim` recomputes the hash from the secret and reverts
 * COMMITMENT_NOT_FOUND. Use `shortString.encodeShortString`.
 */
export const PAYROLL_COMMITMENT_TAG = "PAYROLL_COMMITMENT_TAG:V1";
export const PAYROLL_RUN_ID_TAG = "PAYROLL_RUN_ID_TAG:V1";
export const PAYROLL_RUN_OWNER_TAG = "PAYROLL_RUN_OWNER_TAG:V1";

const PAYROLL_COMMITMENT_TAG_FELT = shortString.encodeShortString(PAYROLL_COMMITMENT_TAG);
const PAYROLL_RUN_ID_TAG_FELT = shortString.encodeShortString(PAYROLL_RUN_ID_TAG);
const PAYROLL_RUN_OWNER_TAG_FELT = shortString.encodeShortString(PAYROLL_RUN_OWNER_TAG);

function poseidonTagged(tagFelt: string, secret: bigint | string): bigint {
  const secretFelt = typeof secret === "string" ? shortString.encodeShortString(secret) : secret;
  return BigInt(hash.computePoseidonHashOnElements([tagFelt, secretFelt]));
}

/**
 * @param secret Either an already-felt252 value (bigint — passed through
 *   unhashed, matching Cairo's `secret: felt252` parameter directly), or a short
 *   human-readable identifier (like the Cairo tests' `'SECRET-A'` literal),
 *   which is short-string-encoded first so it matches what the equivalent Cairo
 *   literal encodes to.
 */
export function computeCommitmentHash(secret: bigint | string): bigint {
  return poseidonTagged(PAYROLL_COMMITMENT_TAG_FELT, secret);
}

/** Mirrors `compute_run_id` in payroll.cairo. OpenRun requires run_id to equal this. */
export function computeRunId(ownerSecret: bigint | string): bigint {
  return poseidonTagged(PAYROLL_RUN_ID_TAG_FELT, ownerSecret);
}

/**
 * Mirrors `compute_run_owner_commitment` in payroll.cairo. Stored on RunInfo
 * at OpenRun; every FundCommitment must reveal the same owner_secret.
 * Uses a different domain tag from computeRunId so a public run_id cannot
 * stand in for the owner commitment.
 */
export function computeRunOwnerCommitment(ownerSecret: bigint | string): bigint {
  return poseidonTagged(PAYROLL_RUN_OWNER_TAG_FELT, ownerSecret);
}
