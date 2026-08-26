# Solana claim coverage

The Solana claim leg is built on [NEAR Intents][near-intents]' 1-Click Swap
API (`https://1click.chaindefuser.com`), a REST-based intent orchestrator
that routes cross-chain swaps through a decentralized solver network on the
NEAR Protocol.

**This is NOT a bridge in the Privacy Bridge sense.** Where the EVM claim leg
(see `docs/evm-claim-coverage.md`) uses StarkWare's Privacy Bridge + CCTP —
a deterministic burn-and-mint protocol — the Solana leg uses an intent-based
system where solvers compete to fill the swap. The privacy properties differ
accordingly; see "What 'no on-chain link' actually means here" below.

## API shape — pinned from real docs

Source: [NEAR Intents documentation](https://docs.near-intents.org),
[OpenAPI spec](https://1click.chaindefuser.com/docs/v0/openapi.yaml).
Read **2026-08-23**.

Do not modify the connector's API calls without re-reading the spec — the
solver network's request/response schema can change without notice and
StableRoll does not control it.

### Endpoints used

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v0/tokens` | Discover supported asset IDs |
| POST | `/v0/quote` | Request a swap quote; returns `depositAddress` |
| POST | `/v0/deposit/submit` | (Optional) Notify of deposit tx for faster detection |
| GET | `/v0/status?depositAddress=<addr>` | Poll swap execution status |

### Quote request shape (POST /v0/quote)

```json
{
  "dry": false,
  "swapType": "EXACT_INPUT",
  "slippageTolerance": 100,
  "originAsset": "nep141:starknet.omft.near",
  "depositType": "ORIGIN_CHAIN",
  "destinationAsset": "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  "amount": "<amount-in-smallest-unit>",
  "recipient": "<solana-base58-address>",
  "recipientType": "DESTINATION_CHAIN",
  "refundTo": "<starknet-refund-address>",
  "refundType": "ORIGIN_CHAIN",
  "deadline": "<ISO-8601>"
}
```

### Status response terminal states

| Status | Meaning |
|--------|---------|
| `SUCCESS` | Tokens delivered to destination Solana address |
| `REFUNDED` | Swap failed, funds returned to Starknet refund address |
| `FAILED` | Swap encountered an unrecoverable error |

On `SUCCESS`, `swapDetails.destinationChainTxHashes[0].hash` contains the
Solana transaction signature.

## Confirmed asset IDs

Queried from `GET /v0/tokens` on **2026-08-23**:

| Asset | Chain | Asset ID | Decimals | Contract |
|-------|-------|----------|----------|----------|
| STRK | Starknet | `nep141:starknet.omft.near` | 18 | (native) |
| SOL | Solana | `nep141:sol.omft.near` | 9 | (native) |
| USDC | Solana | `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near` | 6 | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

## Liquidity verification

The STRK→Solana USDC route was confirmed live via a dry-run quote on
**2026-08-23** and re-verified on **2026-08-25** (25 STRK -> 0.6323 USDC).

`integration/src/near-intents-liquidity.test.ts` re-checks this at runtime
against the live 1-Click API. Run it with `npm run test:liquidity`. It needs
no credentials, only public internet, so it deliberately imports **only**
`near-intents-connector.ts` — that module is SDK-free, whereas
`claim-solana.test.ts` imports `config.ts` and therefore cannot load at all
without a GitHub Packages token.

Two details of the dry-run call are load-bearing, and both were found by
running it against the real API rather than by reading the spec:

- The recipient must be an Ed25519 pubkey the API actually accepts. The
  obvious-looking system-program address `11111111111111111111111111111111`
  is rejected with `400 recipient is not valid`; the incinerator address
  `1nc1nerator11111111111111111111111111111111` is accepted.
- The API enforces a minimum notional per swap that tracks the STRK price.
  At 10 STRK the call sat on that boundary and failed intermittently with
  `amount is too low for bridge, try at least 10255031098236391937`, so the
  dry run quotes 25 STRK for headroom. `dry: true` never moves funds.

USDC on Solana (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) has deep
liquidity on Jupiter and other Solana DEXes. The solver network sources
liquidity independently; StableRoll does not need to provide it.

## Testnet availability

**None.** NEAR Intents does not offer a testnet or devnet environment
(confirmed in [FAQ](https://docs.near-intents.org/resources/faqs.md) and
[quickstart](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/going-live.md),
read 2026-08-23). Developers are advised to use small amounts of real tokens
for testing.

This means:
- The `claim-solana.test.ts` end-to-end test requires mainnet STRK and human
  sign-off (per CLAUDE.md §4 rule 3).
- The liquidity-verification sub-test runs against production without sending
  funds (dry-run mode).

## What "no on-chain link" actually means here

The privacy property is structurally similar to the EVM leg but mechanistically
different:

**EVM leg (Privacy Bridge + CCTP):** A deterministic `BurnInitiated` event on
Starknet and a `MintReceived` on the EVM destination chain. Both are public.
What is hidden: the link between the depositor's Starknet identity and the
recipient, because the funds rested in the privacy pool first.

**Solana leg (NEAR Intents):** The solver receives STRK at a fresh deposit
address on Starknet (or via the NEAR Intents verifier contract), then delivers
USDC to the specified Solana address. The Solana delivery transaction is
public (like all Solana transactions). What is hidden: the NEAR Intents solver
sees only the deposit address — it has **no visibility into the privacy pool's
internal state**, the payer's identity, the run id, or the commitment hash.

For StableRoll specifically:
- `Payroll`'s `RunInfo` never records a payer address (see CLAUDE.md §6).
- The claim's privacy-pool withdrawal is unlinkable to the original deposit.
- The 1-Click API's deposit address is a fresh, single-use address — it does
  not encode any payer metadata.
- The Solana recipient sees only their own address and the received USDC
  amount.

**What IS public (and must be disclosed):**
- The Solana delivery transaction (amount, recipient address).
- The Starknet deposit to the 1-Click deposit address (amount, deposit address).
- The NEAR Intents solver's internal execution (visible on NEAR explorer).

**What is NOT public:**
- Any link between the Starknet deposit and the original payer.
- The payroll run id or commitment hash.
- The payer's Starknet address.

## Differences from the EVM claim leg

| Property | EVM (Privacy Bridge + CCTP) | Solana (NEAR Intents) |
|----------|---------------------------|----------------------|
| Bridge type | Deterministic burn/mint | Intent-based solver network |
| Protocol | CCTP (Circle) | NEAR Intents Verifier Contract |
| Testnet | Sepolia (CCTP testnet) | None |
| Output token | Same-denomination (USDC) | Configurable (default USDC) |
| Fee model | Gas only | 0.2% unauthenticated, free with API key |
| Finality | CCTP attestation (~minutes) | Solver-dependent (~seconds to minutes) |
| License | Apache-2.0 (bridge-core) | N/A (REST API, no local dependency) |

## Authentication

Unauthenticated requests to the 1-Click API incur a 0.2% (20 basis points)
platform fee. Authenticated requests using a JWT token from the
[Partner Dashboard](https://partners.near-intents.org/home) are fee-free.

The connector reads `NEAR_INTENTS_API_KEY` from the environment. If set, it
is sent as `Authorization: Bearer <token>` on all API calls.

[near-intents]: https://docs.near-intents.org
