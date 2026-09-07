# `integration`

TypeScript tests and helpers that drive the STRK20 privacy pool and the
`Payroll` contract via the privacy SDK. For what StableRoll is as a whole,
read the [root README](../README.md) first; this file covers only this
package.

## Running it

```bash
npm install
npm run test:offline      # 7 files, 62 tests, no credentials, no network
```

Other scripts need either a network or credentials, never both at once:

| Script | Needs | What it checks |
|---|---|---|
| `npm run test:liquidity` | Network only | NEAR Intents' live 1-Click API: pinned asset IDs, a dry-run quote |
| `npm run verify:eligibility` | Network only | The 3 mainnet transaction hashes in `../strk20.json` against a public Starknet RPC |
| `npm test` | A GitHub Packages token with `read:packages` for `@starkware-libs/starknet-privacy-sdk`, plus `.env` (copy `.env.example`) | The full suite, including live-SDK tests |

CI runs only `test:offline` on every PR. See
[`../docs/verification-guide.md`](../docs/verification-guide.md) for exact
expected output and what each test file proves.

## Where things live

| What | File |
|---|---|
| Commitment-hash derivation (SDK-free, shared with Cairo's `compute_commitment_hash`) | `src/commitment.ts` |
| `privacy_invoke` calldata shape for `OpenRun`/`FundCommitment`/`ApproveRun`/`Claim` | `src/payroll-invoke.ts` |
| Driving a real Sepolia run end to end | `src/sepolia-run.ts` |
| Polling `CommitmentFunded` for commitments funded outside `sepolia-run.ts` | `src/commitment-listener.ts`, [`../docs/adr-commitment-funded-listener.md`](../docs/adr-commitment-funded-listener.md) |
| The Solana claim leg (NEAR Intents 1-Click) | `src/near-intents-connector.ts` |
