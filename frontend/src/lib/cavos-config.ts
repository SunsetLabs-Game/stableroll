import { validateCavosConfig, type CavosConfig, type CavosConfigProblem } from "@cavos/kit/react";

/**
 * Cavos configuration, read from the environment.
 *
 * `appId` and `appSalt` come from the Cavos dashboard and are per-deployment,
 * so they are not committed (CLAUDE.md §4 rule 2). Without them the admin page
 * renders a clearly-labelled unconfigured state instead of throwing: the
 * tokenless build and CI must stay green on a clean checkout (CLAUDE.md §4
 * rule 8), and a missing dashboard credential is not a code error.
 *
 * `NEXT_PUBLIC_` is required for a value to reach the browser. Both of these
 * are public client identifiers, not secrets — they are safe in the bundle.
 * Never put a private key, a viewing key, or a session secret behind that
 * prefix.
 *
 * `appSalt` in particular must stay stable: wallet addresses derive from it, so
 * changing it silently moves every user to a different account. `@cavos/kit`
 * ships `checkAppSaltDrift` for exactly that failure, and `validateCavosConfig`
 * reports it as `app-salt-changed`.
 */
export const CAVOS_APP_ID = process.env.NEXT_PUBLIC_CAVOS_APP_ID ?? "";
export const CAVOS_APP_SALT = process.env.NEXT_PUBLIC_CAVOS_APP_SALT ?? "";

/**
 * Starknet mainnet unless explicitly told otherwise. The sprint is mainnet-only
 * (CLAUDE.md §1), so defaulting to testnet would misconfigure the real
 * deployment while looking fine locally.
 */
export const CAVOS_NETWORK = process.env.NEXT_PUBLIC_CAVOS_NETWORK === "testnet" ? "testnet" : "mainnet";

export const CAVOS_ENVIRONMENT =
  process.env.NEXT_PUBLIC_CAVOS_ENVIRONMENT === "development" ? "development" : "production";

/**
 * Starknet only, deliberately.
 *
 * `@cavos/kit` also supports Solana and Stellar, and issue #8 draws a hard
 * scope boundary around not using them: EVM and Solana recipients claim with
 * their own wallets through the cross-chain routes and never see Cavos.
 * Configuring a single chain makes that boundary structural rather than a
 * convention someone can forget.
 */
export const cavosConfig: CavosConfig = {
  appId: CAVOS_APP_ID,
  appSalt: CAVOS_APP_SALT,
  network: CAVOS_NETWORK,
  environment: CAVOS_ENVIRONMENT,
  chains: ["starknet"],
  defaultChain: "starknet",
};

/**
 * Uses the SDK's own validator rather than a hand-rolled check, so the
 * conditions that actually matter to Cavos are the ones reported.
 */
export function cavosConfigProblems(): CavosConfigProblem[] {
  if (!CAVOS_APP_ID || !CAVOS_APP_SALT) {
    return [
      {
        code: !CAVOS_APP_ID ? "missing-app-id" : "missing-app-salt",
        level: "error",
        message:
          "Set NEXT_PUBLIC_CAVOS_APP_ID and NEXT_PUBLIC_CAVOS_APP_SALT from the Cavos dashboard.",
      },
    ];
  }
  return validateCavosConfig(cavosConfig);
}

export function isCavosConfigured(): boolean {
  return cavosConfigProblems().every((problem) => problem.level !== "error");
}
