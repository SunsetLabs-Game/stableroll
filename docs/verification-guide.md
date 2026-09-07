# Verification guide

Every claim in [`README.md`](../README.md) as a command a reviewer can run or
a link they can open: no step here requires trusting the prose. This is a
companion to the README, not a duplicate of it: read the README for what
StableRoll is; read this for how to check that each specific claim is true.

Test counts below were verified by actually running each suite against this
repo, not assumed from memory or an earlier pass. If a command's output here
disagrees with what you get, trust your own run: this table is a snapshot,
not a promise. **Reverified 2026-09-07** against `main` at commit `33f5c58`.

## Tokenless suites

| README claim | Evidence | How to reproduce |
|---|---|---|
| `contracts/payroll`: implemented, tested, CI-enforced | `contracts/payroll/src/tests.cairo`, 49 tests | `cd contracts/payroll && scarb build && snforge test` → `Tests: 49 passed, 0 failed, 0 ignored, 0 filtered out` |
| `integration`: commitment-hash parity, `privacy_invoke` calldata shape, run-lifecycle event payloads, claim-notification payload shape, mainnet-eligibility manifest shape, notification-outbox bookkeeping, on-chain `CommitmentFunded` listener | 7 test files, 62 tests | `cd integration && npm install && npm run test:offline` → `Test Files 7 passed (7)`, `Tests 62 passed (62)` |
| `notify`: Waku recipient-notification derivation, sender and recipient sides | `notify/src/topics.test.ts` + `receive-claim-notification.test.ts`, 2 files, 23 tests (deterministic, no network) | `cd notify && npm install && npm run test:offline` → `Test Files 2 passed (2)`, `Tests 23 passed (23)` |
| `diagrams`: generated SVGs match their typed source | CI's `diagrams` job | `cd diagrams && npm ci && npm run generate && git diff --exit-code -- out/*.dot`: clean diff means the committed SVGs are current |
| `notify`: real Waku fleet send/receive (real and runnable, not part of the required CI gate) | `notify/src/send-claim-notification.test.ts` | `cd notify && npm test`: talks to the live Waku test fleet (`defaultBootstrap: true`), no credentials needed, can be slower/occasionally flaky against real P2P infra by design |
| `integration`: NEAR Intents liquidity is live, not assumed (not part of the required CI gate) | `integration/src/near-intents-liquidity.test.ts` | `cd integration && npm run test:liquidity`: hits the real 1-Click API; needs network, no credentials |
| Mainnet eligibility: on-chain check (not part of the required CI gate) | `integration/src/mainnet-eligibility-onchain.test.ts` | `cd integration && npm run verify:eligibility`: fetches each `strk20.json` hash's receipt from a public mainnet RPC |

## Privacy table (README's "What is and isn't private")

Each README row mapped to the real source that proves it, not a restatement
of the README sentence:

| README claim | Real source |
|---|---|
| "That a payroll run exists (`run_id`)" is visible | `contracts/payroll/src/payroll.cairo`'s `get_run(run_id) -> RunInfo` is a public view function; any `run_id` can be queried |
| "`expected_count` and `expected_total`" are visible | Both are public fields on `RunInfo` (`payroll.cairo`), fixed at `OpenRun` and never mutated after |
| "Running totals" (`funded_count`, `paid_count`, `total_committed`, `total_paid`) are visible | Same `RunInfo` struct, updated in the `FundCommitment` and `Claim` match arms of `privacy_invoke` |
| "No payer address stored" | `RunInfo`'s complete field list, as of `payroll.cairo`: `token, expected_count, funded_count, paid_count, expected_total, total_committed, total_paid, closed, owner_commitment, approver_a_commitment, approver_b_commitment, approved_a, approved_b`, no address field of any kind. `owner_commitment` and the two approver commitments are Poseidon hashes of secrets, not addresses; see `docs/adr-run-ownership.md`'s and `docs/adr-dual-approval-quorum.md`'s "Privacy property" sections for why that doesn't leak identity |
| "Which recipient corresponds to which commitment" stays hidden | `Claim`'s only input is `secret` (`privacy_invoke`'s `secret` param); the contract recomputes `commitment_hash` on-chain via `compute_commitment_hash(secret)` and never takes an identity-linked argument. Only whoever the payer told the secret to can address a commitment |
| "The payer↔run link" stays hidden | `privacy_invoke` asserts only `get_caller_address() == privacy_addr` (the pool); no payer identity is ever read or stored, per the `RunInfo` field list above |
| Run ownership no longer has the squatting/third-party-funding hole | `docs/adr-run-ownership.md`: `OpenRun` requires `run_id == compute_run_id(owner_secret)`; `FundCommitment` requires the same `owner_secret` against `RunInfo.owner_commitment`. Negative tests: `test_open_run_rejects_run_id_not_derived_from_secret`, `test_fund_commitment_rejects_third_party_without_owner_secret` (`contracts/payroll/src/tests.cairo`) |
| Waku notification stays unlinkable to the on-chain claim | `notify/src/topics.ts`: the recipient's keypair and content topic are derived solely from the same commitment `secret`, never a Starknet address; see the file's derivation-rule header comment |

## EVM chain coverage

See [`docs/evm-claim-coverage.md`](evm-claim-coverage.md) directly: it
already names its own source commit and read date. To re-verify it hasn't
drifted:

```bash
git clone https://github.com/starkware-libs/privacy-bridge /tmp/privacy-bridge
cd /tmp/privacy-bridge && git log -1 --format="%H %ad" --date=short
```

Compare that commit's `packages/bridge-core/src/core/config.ts` (the
`EVM_CCTP_SOURCES_TESTNET`/`EVM_CCTP_SOURCES_MAINNET` chain registries) against
the table in `docs/evm-claim-coverage.md`. If they've diverged, the coverage
doc is stale: update it, don't patch around it.

## Solana chain coverage

See [`docs/solana-claim-coverage.md`](solana-claim-coverage.md), pinned
against the real NEAR Intents 1-Click API docs and OpenAPI spec, dated. It
also documents why this leg is *not* a bridge in the Privacy Bridge sense
(intent/solver-based, not a deterministic burn-and-mint), and why the
end-to-end claim itself is not exercised: NEAR Intents has no testnet, so a
full run needs real mainnet funds and explicit human sign-off (`CLAUDE.md`
§4 rule 3).

```bash
cd integration && npm run test:liquidity
```

reverifies the connector's pinned asset IDs and a dry-run quote against the
live API: the honest floor of what can be checked without spending real
funds.

## Mainnet transactions

Recorded in [`strk20.json`](../strk20.json) and explained in full in
[`docs/mainnet-eligibility.md`](mainnet-eligibility.md). All three establish
**eligibility only**: they were made from a privacy-enabled wallet, not
through StableRoll's own code. `Payroll` itself is deployed to `SN_MAIN` (see
the table below), but the deployed class predates the on-chain dual-approval
quorum from #31. Read "Known gaps" below before treating that deployment as
feature-complete.

| Hash | Voyager | What it proves |
|---|---|---|
| `0x044b5d46090d34321729e253aea555b10de5f0ae81ff38fce0081048902110b9` | [tx](https://voyager.online/tx/0x044b5d46090d34321729e253aea555b10de5f0ae81ff38fce0081048902110b9) | Viewing key registered **and** STRK shielded in one transaction: `ViewingKeySet` + `Deposit` events. Block 13964885. |
| `0x04fe7d82f82ecb150f595d4a5b519d8dbeb8761d64e01644193b310019ee2aa6` | [tx](https://voyager.online/tx/0x04fe7d82f82ecb150f595d4a5b519d8dbeb8761d64e01644193b310019ee2aa6) | A second shield into the pool: `Deposit` event. Block 13965041. |
| `0x077f3f2fef3675148e41b712ea9ede30e411c6f50a490ba91c6640ae6575c42f` | [tx](https://voyager.online/tx/0x077f3f2fef3675148e41b712ea9ede30e411c6f50a490ba91c6640ae6575c42f) | A third shield into the pool: `Deposit` event. Block 13965191. |

Re-verify all three are still live and pool-touching with:

```bash
cd integration && npm run verify:eligibility
```

`docs/mainnet-eligibility.md` explains why these are three shields rather
than a shield/transfer/withdrawal spread (the eligibility criterion only
requires three pool-touching, successful transactions), and why that is
stated plainly rather than rounded up to "the full flow was demonstrated."

## Known gaps

Three things this repo does not yet do, each backed by a command that
reproduces the finding rather than a claim to take on trust. These are the
only three rows in the README's "What actually works today" table that are
not fully proven live.

| Gap | Verify it yourself | Tracking |
|---|---|---|
| The `Payroll` class deployed to `SN_MAIN` predates the on-chain dual-approval quorum landed in #31 (`ApproveRun`, `QUORUM_NOT_MET`) | Build current source and compute its class hash: `cd contracts/payroll && scarb build && sncast utils class-hash --sierra-file target/dev/payroll_Payroll.contract_class.json`. Reverified 2026-09-07, current source hashes to `0x0032bb6f7cdcd730569e7c9baaba188bf8f7cf48f611d7db7c315440b82ed871`. The deployed address's class hash, recorded in `docs/mainnet-eligibility.md`, is `0x04adc544ccaba9ceb2b0eb30fd913279bdfead4edc16d39c5fb7ff546f9ca76e`, a different hash, confirming the drift rather than assuming it | [#41](https://github.com/SunsetLabs-Game/stableroll/issues/41) |
| No real payroll run has been opened and funded through `privacy_invoke` on mainnet end to end | `frontend/src/lib/payroll-call.ts` builds the call and stops short of submitting it; the file documents why (`privacy_invoke` accepts only the pool as caller, and the wallet-mediated route to reach it is unconfirmed) | [#34](https://github.com/SunsetLabs-Game/stableroll/issues/34) |
| The Solana claim leg (NEAR Intents) has not run end to end on mainnet | `integration/src/claim-solana.test.ts`'s end-to-end case is `it.skip`, with the two structural reasons (network mismatch, missing deposit step) written in the file itself | [#37](https://github.com/SunsetLabs-Game/stableroll/issues/37) |

## Demo video

A ~93-second product demo (Remotion composition `Demo` at `media/demo/`),
recorded in `strk20.json`'s `demo_video` field and hosted as a
[GitHub Release asset](https://github.com/SunsetLabs-Game/stableroll/releases/download/demo-video/demo.mp4).
It uses the generated architecture SVGs (see the `diagrams` row above) and a
real `snforge test` capture, not staged footage.

The video is the fast path through this guide, not a substitute source of
truth for it: every specific claim it makes (test counts, the privacy
guarantees) already has its own row above. If a claim exists only in the
video and not in this table, that is a gap in this table to fix, not
something the video gets to assert on its own. The rendered `demo.mp4` does
**not** show the mainnet transaction hashes: `media/demo/src/Demo.tsx`'s
scene sequence never includes `MainnetProofScene`, and the video predates
issue #2 banking them regardless. See `media/demo/README.md` for the render
pipeline and a note on a latent duration mismatch that needs fixing before
anyone re-renders it.

`strk20.json`'s `demo_url` field is intentionally blank: it is meant for a
hosted, clickable build of `frontend/`, which is not deployed anywhere
(`npm run dev` only). `integration/src/mainnet-eligibility.ts` requires the
field to be a string, not that it be non-empty, so this passes the manifest
shape check.

## Keeping this guide honest

This guide needs updating whenever a claim it documents changes: a new
test, a changed field list, a bumped upstream commit, a newly-banked mainnet
hash. Treat a stale row here the same way `CLAUDE.md` §4 rule 7 treats an
unproven guarantee: a bug, not a formatting nit. If you're reading this and
a row disagrees with what the referenced command actually prints, fix the
row in the same change that made it stale, not as a follow-up.
