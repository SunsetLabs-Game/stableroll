# StableRoll

Cross-chain private payroll on Starknet. 

A company funds a payroll run once,
on Starknet, using the [STRK20 privacy pool][strk20-pool]. Recipients claim
into a wallet on Starknet, an EVM chain, or Solana, with no on-chain link
between payer and recipient, and no centralized service holding the payment
list.

Built for the **STRK20 Private Sprint** (Starknet, 14–31 Aug 2026).

![Cairo](https://img.shields.io/badge/Cairo-2.17.0-4E4E4E?logo=rust&logoColor=white)
![Starknet](https://img.shields.io/badge/Starknet-Foundry_0.63.0-0C0C4E)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Status](https://img.shields.io/badge/status-work_in_progress-orange)

## Why payroll needs privacy

A payroll run funded and claimed in the open on a public ledger leaks a
company's entire headcount, compensation bands, and org structure to anyone
watching the chain. StableRoll routes funding and claiming through the STRK20
privacy pool so the run's existence and its aggregate numbers are public (so
recipients and auditors can verify the run is fully funded), but which
recipient got which payment is not.

## What is and isn't private

Do not read this as "fully private". An on-chain observer of the Payroll
contract and the pool can still see real information:

| Visible to any on-chain observer | Never visible on-chain |
|---|---|
| That a payroll run exists (`run_id`) | Which recipient corresponds to which commitment |
| The run's `expected_count` and `expected_total` | The amount a specific identity was paid |
| Running totals: `funded_count`, `paid_count`, `total_committed`, `total_paid` | The link between the payer and the run (the pool is always the caller; `RunInfo` stores no payer address) |
| That a given commitment was claimed, and the claim transaction itself | Which claim transaction belongs to which commitment/recipient, beyond what the commitment hash itself reveals |
| The token used and whether the run is `closed` | Recipient identities across claims (no address reuse is required, and none is enforced) |

The completeness guarantee (`is_complete`) is a public, verifiable property —
that a run was funded exactly as promised and every promised recipient was
paid — without revealing who those recipients are.

Every row above is mapped to its real source (contract fields, tests) in
[`docs/verification-guide.md`](docs/verification-guide.md) — check that
before taking this table's word for it.

## What actually works today

This repo is mid-build. Only claim the chains and legs that are real:

| Component | Status |
|---|---|
| `contracts/payroll` — Cairo contract, `privacy_invoke`-driven run accounting, run-ownership authorization | Done — tested (`snforge test`, CI-enforced) |
| Starknet → Starknet fund + claim, via the pool | Done and tested locally. Not yet exercised against live Sepolia or mainnet infrastructure |
| EVM claim leg (privacy-bridge) | Wired against the real API (`cashOut`, see `docs/evm-claim-coverage.md`). Not yet exercised against live testnet infrastructure |
| Solana claim leg (NEAR Intents) | Connector implemented against the real 1-Click API (see `docs/solana-claim-coverage.md`). Route verified live — pinned asset IDs and a dry-run quote are re-checked by `npm run test:liquidity`. The end-to-end claim is **not** exercised: NEAR Intents has no testnet, so it needs mainnet funds and human sign-off |
| Waku recipient notification | Done and tested end-to-end against the live Waku test fleet (`notify/`). Sent from `openAndFundSingleCommitment` after a successful `FundCommitment` (see `integration/src/sepolia-run.ts`), and independently by `integration/src/commitment-listener.ts` polling `CommitmentFunded` for any commitment registered in the outbox ahead of time — so a commitment funded through a different path than `sepolia-run.ts` still gets notified once the chain confirms it (see `docs/adr-commitment-funded-listener.md`). The secret still has to reach the outbox from whoever funds the commitment; this is not a purely chain-driven notification |
| Frontend app shell (`frontend/`) | Done — placeholder `/admin` and `/claim/[secret]` routes, zero business logic |
| Cavos payer/recipient UX | Partial — sign-in wired against the real `@cavos/kit` v0.1.11 API on `/admin` and `/claim/[secret]`, dual-approval gate implemented and unit-tested. Submission is **not** wired: `privacy_invoke` accepts only the pool as caller, and that path needs a mainnet proving service that is not published. Waku pending-claim discovery now read by the page: `/claim/[secret]` queries Waku Store for a notification already sent and subscribes via Filter for one sent while it is open, reusing `notify/`'s derivation rather than a copy. Proven by a live-fleet round trip; an empty result is rendered as normal, not an error, since Store retention is finite |
| Mainnet eligibility transactions | Done — 3 recorded in `strk20.json` and verified on-chain (`npm run verify:eligibility`). See `docs/mainnet-eligibility.md` |
| `Payroll` mainnet deployment | Done — declared and deployed to `SN_MAIN`, address recorded in `strk20.json`. See `docs/mainnet-eligibility.md`. Deployed only; no run has been submitted through it yet — see issue #34 |

Check the repo's GitHub issues for what's actively in progress; treat that
tracker, not this README, as the up-to-date source of truth on scope.

## Architecture

![Architecture](diagrams/out/architecture.svg)

Generated from `diagrams/definitions/`, not drawn by hand. The ASCII diagram
this replaced had already drifted (it omitted run ownership and still labelled
the EVM and Solana legs "planned"). Do not edit the SVG; change the typed
spec and run `npm run generate` in `diagrams/`. The run state machine and
claim-routing tree live in [`ARCHITECTURE.md`](ARCHITECTURE.md).

- **`contracts/payroll`** — the only component that ever touches recipient
  funds. Called exclusively by the privacy pool's `InvokeExternal`; see
  `CLAUDE.md` §6 for the accounting invariants it enforces (fixed
  `expected_count`/`expected_total`, exact-final-commitment closing, run
  ownership proven by secret rather than address).
- **`integration`** — TypeScript tests and helpers driving the pool +
  Payroll contract via the privacy SDK.
- **`notify`** — Waku ECIES key/topic derivation and encrypted claim
  notifications, keyed off the same commitment secret as the on-chain claim,
  never a Starknet address (see the package's `topics.ts`). Called from
  `integration/src/sepolia-run.ts` after each successful `FundCommitment`,
  and from `integration/src/commitment-listener.ts` for commitments funded
  through any other path (see `docs/adr-commitment-funded-listener.md`).
  `integration/` depends on it via `file:../notify` (see
  `docs/adr-notify-package-boundary.md`).
- **`integration/src/near-intents-connector.ts`** — the Solana claim leg:
  quote → deposit-notify → poll, against NEAR Intents' 1-Click API. It sits
  downstream of a Starknet claim and never touches custody or the
  privacy-critical accounting above.
- **`frontend`** — Next.js app with `/admin` and `/claim/[secret]`. Cavos
  provides seed-phrase-free sign-in on the Starknet side only; EVM and Solana
  recipients never see it. The dual-approval gate lives in `src/lib/quorum.ts`
  and is where the separation-of-duties guarantee is enforced today — in the
  UI, not on-chain, for reasons that module documents.

## Dependency transparency

| Dependency | Role | License |
|---|---|---|
| [STRK20 Privacy Pool][strk20-pool], Escrow pattern, Privacy Bridge | Core privacy primitive this repo builds on (StarkWare) | Apache-2.0 |
| [Cavos](https://github.com/cavos-labs) | Starknet-side payer/recipient UX only — never custody, never a cross-chain leg | Verified directly: `cavos-account` is MIT (`LICENSE` in-repo) and `@cavos/kit` v0.1.11 declares MIT in its npm metadata — those two are what this repo depends on. Most other Cavos repositories carry **no declared license**; treat them as all-rights-reserved until Cavos states otherwise. |
| [Waku](https://waku.org) | Recipient notification transport only — no custody, no privacy-critical logic depends on it | Apache-2.0 / MIT (dual, per Waku project) |

## Local setup

Requires [asdf](https://asdf-vm.com) with the `scarb` and `starknet-foundry`
plugins.

```bash
asdf install   # reads .tool-versions: scarb 2.17.0, starknet-foundry 0.63.0
```

### Cairo — no credentials needed

```bash
cd contracts/payroll
scarb build
snforge test
```

### TypeScript — tokenless path (no credentials needed)

```bash
cd integration
npm install
npm run test:offline
```

### Notify — Waku recipient notifications

```bash
cd notify
npm install
npm run test:offline   # deterministic derivation tests, no network
npm test               # full suite — talks to the live Waku test fleet, no credentials needed
```

No environment variables — see [`notify/.env.example`](notify/.env.example).

### Diagrams: regenerate the committed SVGs

Requires [Graphviz](https://graphviz.org) (`dot` on `PATH`). It is a local
and CI dependency, not pinned in `.tool-versions`.

```bash
brew install graphviz          # macOS
# apt-get install graphviz     # Debian/Ubuntu
cd diagrams
npm ci
npm run generate               # writes diagrams/out/<name>.{dot,svg}
```

CI fails the PR if a typed spec changed without regenerating the committed
`.dot` files. See [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Frontend — app shell

```bash
cd frontend
npm install
npm run dev   # serves /admin and /claim/[secret], no credentials needed
```

Cavos sign-in is wired on `/admin` and `/claim/[secret]`, behind the
dual-approval gate. Both pages render a labelled unconfigured state without
`NEXT_PUBLIC_CAVOS_APP_ID` and `NEXT_PUBLIC_CAVOS_APP_SALT`, so `npm run dev`
and CI work with zero credentials. Submitting a run is deliberately inert —
see `src/lib/payroll-call.ts` for why. See
[`frontend/.env.example`](frontend/.env.example) for every variable; copy it
to `.env.local` to configure Cavos.

### TypeScript — full suite (needs a GitHub Packages token)

`@starkware-libs/starknet-privacy-sdk` ships on GitHub Packages and is
declared as an `optionalDependency` specifically so `npm install` succeeds
without a token — only the SDK-dependent tests are skipped/fail without one.

```bash
npm config set //npm.pkg.github.com/:_authToken <TOKEN>   # needs read:packages
cd integration
cp .env.example .env   # fill in — see integration/.env.example for what each var is and where it comes from
npm test
```

CI (`.github/workflows/ci.yml`) runs only the tokenless path on every PR, by
design — see `CLAUDE.md` §8.

If you hit a build/toolchain error, check `CLAUDE.md` §3 first — its
error-to-cause map covers every trap this repo's toolchain has actually
produced, and the fix is almost never what the error text suggests.

Every command above, plus each suite's current pass count, is pinned in
[`docs/verification-guide.md`](docs/verification-guide.md) — if a command
here and that guide disagree, trust what the command actually prints.

## Demo video

A ~93-second product demo (Remotion composition `Demo` at `media/demo/`) is
recorded in [`strk20.json`](strk20.json) `demo_video` and hosted as a
[GitHub Release asset](https://github.com/SunsetLabs-Game/stableroll/releases/download/demo-video/demo.mp4).
It uses the generated architecture SVGs and a real `snforge test` capture.
Mainnet tx hashes are omitted until issue #2 fills `strk20.json` `transactions`.
Every claim it makes also has its own row in
[`docs/verification-guide.md`](docs/verification-guide.md) — the video is a
fast path through that guide, not a substitute source of truth for it.

## Mainnet contracts and transactions

Recorded in [`strk20.json`](strk20.json) and explained in
[`docs/mainnet-eligibility.md`](docs/mainnet-eligibility.md), which also gives
the route to bank them and the rules that apply. Each hash is also listed in
[`docs/verification-guide.md`](docs/verification-guide.md)'s mainnet-transactions
table, alongside the specific claim it substantiates.

**The eligibility floor is met**: three mainnet transactions are recorded, each
verified on-chain as successful and carrying an event from the pool. They
establish eligibility only — they were made from a privacy-enabled wallet, not
through StableRoll, and the `Payroll` contract is not yet deployed to mainnet.
That state is machine-checked rather than tracked by hand:

```bash
cd integration && npm run verify:eligibility
```

It passes only when three distinct hashes are recorded *and* each one is
confirmed on mainnet as a successful transaction that emitted an event from the
pool. It is not part of CI — it needs a public RPC this repo does not control.

## License

Apache-2.0 — see [`LICENSE`](LICENSE), matching the reference contracts this
project extends.

---

For contributor and toolchain context (pinned versions, the full
error-to-cause map, and the rules this repo is built under), read
[`CLAUDE.md`](CLAUDE.md) before opening a PR.

[strk20-pool]: https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
