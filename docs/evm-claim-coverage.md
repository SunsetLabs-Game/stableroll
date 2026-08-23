# EVM claim coverage

The EVM claim leg is built on StarkWare's [Privacy Bridge][privacy-bridge]
(`@starkware-libs/starknet-privacy-bridge`, Apache-2.0), specifically its
`cashOut` orchestrator (`packages/bridge-core/src/core/bridgeOut.ts`), which
withdraws from the pool and CCTP-burns toward a caller-chosen EVM destination
chain and address.

**This list is the actual `evmCctpDestinations` registry read directly from
that package's source** — not the sprint RFP's example chains, and not
inferred from the top-level README. Source read:
`packages/bridge-core/src/core/config.ts`, commit
`0798ac522ec38c0af9cff53b6fd1f7b44a1acfdd`, read **2026-08-23**.

Do not add a chain to this table, or to any README/demo copy, without
re-reading that file — the registry can change without notice and StableRoll
does not control it.

## Supported destination chains

| Chain | Mainnet chain id | Testnet (chain id) | CCTP domain |
|---|---|---|---|
| Ethereum | 1 | Ethereum Sepolia (11155111) | 0 |
| Optimism | 10 | OP Sepolia (11155420) | 2 |
| Arbitrum One | 42161 | Arbitrum Sepolia (421614) | 3 |
| Base | 8453 | Base Sepolia (84532) | 6 |
| Polygon | 137 | Polygon Amoy (80002) | 7 |

Notes:

- Base, Arbitrum, and Optimism mainnet rows are marked `Optional — drop the
  row to disable` in `bridge-core`'s own source comments — StarkWare may prune
  them without notice. Re-verify before relying on any one of them for a
  demo.
- Mainnet and testnet registries are **network-selected, never merged** (a
  fund-safety invariant in `bridge-core`): a given deployment is entirely on
  one or the other, not a mix.
- `bridge-core`'s default bridge-OUT destination (used when the caller passes
  no `destChainId`) is **Polygon** — a holdover from the package's original
  Polymarket-specific naming (`@polymarket-privacy/bridge-core` in its
  package-level README, `@starkware-libs/starknet-privacy-bridge` in its
  actual `package.json`). StableRoll's claim flow always passes an explicit
  `destChainId`; it does not rely on that default.
- USDC contract addresses and CCTP `TokenMessenger` addresses are versioned in
  the same source file — see it directly rather than duplicating addresses
  here, since duplicated addresses are exactly the kind of claim that goes
  stale silently.

## What "no on-chain link" actually means here

Per `bridge-core`'s own `docs/threat-model.md` (same commit): a cash-out's
`BurnInitiated{mint_recipient, amount}` and the destination-chain mint are
**both public** — the destination address and amount are never hidden. What
the privacy property actually guarantees is that **no data recoverable from
either side ties the withdrawal back to the depositor's Starknet identity**,
provided the funds rested in the pool first and a paymaster (not the shared
manager account) submits the proven legs.

For StableRoll specifically this is a strictly easier bar to clear than the
bridge's general case: `Payroll`'s `RunInfo` never records a payer address at
all (see `CLAUDE.md` §6), so there is no payer-identifying data anywhere in
this system for a claim's cash-out to leak in the first place. The property
that must hold, and that any EVM claim test must assert, is narrower and
concrete: the destination-chain mint transaction contains nothing beyond the
recipient's own chosen destination address and the claimed amount — no
Starknet address, no run identifier, no commitment hash.

[privacy-bridge]: https://github.com/starkware-libs/privacy-bridge
