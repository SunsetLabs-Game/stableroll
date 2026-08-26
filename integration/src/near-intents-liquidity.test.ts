import { describe, it, expect } from "vitest";
import {
  queryTokens,
  verifyLiquidity,
  STARKNET_STRK_ASSET_ID,
  SOLANA_USDC_ASSET_ID,
} from "./near-intents-connector.js";

/**
 * Issue #6's third acceptance criterion: "STRK/USDC liquidity to Solana is
 * confirmed live ... at implementation time, not assumed from the design doc."
 *
 * This lives in its own file, importing ONLY `near-intents-connector.ts`,
 * because that module is SDK-free. `claim-solana.test.ts` imports `config.ts`,
 * which imports `@starkware-libs/starknet-privacy-sdk` at module scope — so on
 * a tokenless checkout Vitest fails the entire file with "Failed to load url
 * @starkware-libs/starknet-privacy-sdk" before a single test runs. Keeping the
 * liquidity check here is what makes its "no credentials required" claim
 * actually true.
 *
 * It still needs public internet (it hits the live 1-Click API), so it stays
 * out of the required CI gate for the same reason `notify`'s Waku suite does:
 * third-party infrastructure this repo does not control. Run it with
 * `npm run test:liquidity`.
 */
describe("NEAR Intents STRK→Solana route", () => {
  it("still lists the pinned Starknet STRK and Solana USDC asset IDs", async () => {
    const tokens = await queryTokens();

    const strkToken = tokens.find((t) => t.assetId === STARKNET_STRK_ASSET_ID);
    expect(strkToken, "Starknet STRK should be listed in /v0/tokens").toBeDefined();
    expect(strkToken!.blockchain).toBe("starknet");
    expect(strkToken!.decimals).toBe(18);

    const solUsdcToken = tokens.find((t) => t.assetId === SOLANA_USDC_ASSET_ID);
    expect(solUsdcToken, "Solana USDC should be listed in /v0/tokens").toBeDefined();
    expect(solUsdcToken!.blockchain).toBe("sol");
    expect(solUsdcToken!.decimals).toBe(6);
  }, 30_000);

  it("returns a live dry-run quote, proving the route is fillable", async () => {
    const quote = await verifyLiquidity();

    expect(quote.quote.amountOut).toBeTruthy();
    expect(BigInt(quote.quote.amountOut)).toBeGreaterThan(0n);
    // A quote with no deliverable output is not a live route.
    expect(BigInt(quote.quote.minAmountOut)).toBeGreaterThan(0n);
  }, 30_000);
});
