import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cavosConfig } from "./cavos-config.js";

/**
 * Acceptance criterion (issue #8): "No Cavos call is made on any EVM or Solana
 * path."
 *
 * Cavos is for the Starknet side only. EVM and Solana recipients use their own
 * wallets (MetaMask/Phantom) via the cross-chain claim routes and never see it.
 * Asserted here rather than trusted, because the boundary is a review comment
 * otherwise — and `@cavos/kit` genuinely ships Solana and Stellar adapters, so
 * crossing it is one import away.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const SRC = join(process.cwd(), "src");

describe("Cavos stays on the Starknet side", () => {
  it("configures Starknet and nothing else", () => {
    // Structural, not conventional: the provider is only ever given one chain,
    // so a Solana wallet cannot be derived even by mistake.
    expect(cavosConfig.chains).toEqual(["starknet"]);
    expect(cavosConfig.defaultChain).toBe("starknet");
  });

  it("never imports the SDK's Solana or Stellar entrypoints", () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const body = readFileSync(file, "utf8");
      return /@cavos\/kit\/(solana|stellar)/.test(body);
    });
    expect(offenders).toEqual([]);
  });

  it("names no EVM or Solana wallet alongside a Cavos import", () => {
    // The failure this catches is a claim page that signs in with Cavos and
    // then routes a Solana or EVM payout through it.
    const offenders = sourceFiles(SRC).filter((file) => {
      const body = readFileSync(file, "utf8");
      if (!/from "@cavos\/kit/.test(body)) return false;
      return /\b(metamask|phantom|@solana\/web3|ethers|wagmi|viem)\b/i.test(body);
    });
    expect(offenders).toEqual([]);
  });
});
