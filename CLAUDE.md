# CLAUDE.md — AI context and working rules for StableRoll

Read this before touching anything. It exists because this repo sits on a stack
(Cairo 2.17 + `privacy` RC + an auth-gated SDK) where the *default* failure mode
is a cryptic error that points at the wrong thing. Most of the rules below were
paid for once already.

---

## 1. What this project is

**StableRoll — cross-chain private payroll hub.** A company funds a payroll run
once on Starknet; recipients claim into a wallet on Starknet, an EVM chain, or
Solana, with no on-chain link between payer and recipient, and no centralized
service holding the payment list.

Built for the **STRK20 Private Sprint (Starknet), 14–31 Aug 2026**. Scoring:
30% STRK20 integration depth · 30% working mainnet product · 25% innovation ·
15% documentation.

The core on-chain piece is `contracts/payroll` — a thin Cairo `privacy_invoke`
helper that the STRK20 privacy pool calls via its `InvokeExternal` action. It
generalizes the reference **Escrow** helper (one commitment, one claim) into a
**run**: a group of commitments opened together with aggregate accounting that
proves, on-chain, whether every promised recipient was actually paid.

Mainnet pool: `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`
(chain `SN_MAIN`).

### The design docs are NOT in this repo

`.gitignore` excludes `**/superpowers/**`. The design spec and the four
implementation plans (Plan 1 payroll core · Plan 2 cross-chain claim routes ·
Plan 3 Waku notification · Plan 4 Cavos UX) live only on the original author's
machine. **Do not assume you can read them. Do not invent their contents.** If a
task references "the spec", ask for it. The GitHub issues carry the context that
matters; treat those as the source of truth.

---

## 2. Toolchain — pinned, and pinned for reasons

`.tool-versions` pins **scarb 2.17.0** and **starknet-foundry 0.63.0**. Use
`asdf install` and honour the pin. Do not "upgrade to latest" to make an error go
away; every one of these versions is load-bearing:

| Pin | Why exactly this |
|---|---|
| `scarb 2.17.0` | `privacy` PRIVACY-0.14.3-RC.0 requires Cairo **2.17.0**. Older Scarb fails *inside the privacy package*, not in our code. Newer is untested against the RC. |
| `starknet-foundry 0.63.0` | Its bundled `universal-sierra-compiler` (2.10.0) handles **Sierra 1.8.0**, which Cairo 2.17 emits, and its runtime supports `get_execution_info_v3_syscall`. 0.52.0 fails on both. |
| `snforge_std = "0.63.0"` (registry, in `Scarb.toml`) | Must match the snforge binary, and must come from the **registry**, not git. |

---

## 3. Error → cause map (read this before debugging)

These are real errors this repo produced. The error text almost never names the
actual cause.

### Cairo / Scarb / snforge

**`error: found dependencies on the same package snforge_std coming from incompatible sources: source 1: git+... source 2: registry+https://scarbs.xyz/`**
→ `Scarb.toml` declares `snforge_std` as a **git** dependency while the
transitive graph pulls it from the registry. Fix: declare it as a plain registry
version (`snforge_std = "0.63.0"`). Never use the git form here.

**Compile errors *inside* `privacy` itself** — `Ambiguous method call ... ArrayTrait::is_empty and SpanTrait::is_empty`, `Type annotations needed. Failed to infer ?0`, `This expression is not supported as constant` pointing at
`.../starknet-privacy-.../packages/privacy/src/*.cairo`
→ **Your Scarb/Cairo is too old.** `privacy` needs Cairo 2.17.0. It is not a bug
in `privacy` and not something to patch around. Check `scarb --version`.

**`[ERROR] Unable to compile Sierra to Casm. No matching ContractClass or CasmContractClass found for version 1.8.0`**
→ `universal-sierra-compiler` is too old for Cairo 2.17's Sierra output. Comes
bundled with snforge; installing starknet-foundry 0.63.0 via asdf installs USC
2.10.0 alongside it. A stale standalone binary in `~/.local/bin` can shadow it —
check `which universal-sierra-compiler`.

**`[ERROR] Error during libfunc specialization ... Could not find the requested extension: get_execution_info_v3_syscall`**
→ snforge binary too old (0.52.0). Its runtime predates the syscall Cairo 2.17
emits. Upgrade the binary, not the code.

**`Reading from buffer failed ... Probably snforge_std version is incompatible`**
→ `snforge_std` in `Scarb.toml` does not match the `snforge` binary version.
Look for the `[WARNING] Package snforge_std version does not meet the
recommended version requirement` line printed *earlier* in the same output — it
names the version snforge wants.

**`failed to deserialize index record from cache ... missing field 'kind'`**
→ Scarb's registry cache was written by a different Scarb version. Run
`scarb cache clean` and delete `Scarb.lock`. Expect this every time you switch
Scarb versions.

**`scarb test` reports 0 tests** → without `[scripts] test = "snforge test"` in
`Scarb.toml`, Scarb runs the built-in `cairo-test` runner, which silently
collects nothing from an snforge suite. The script is already there; don't
remove it. When in doubt run `snforge test` directly.

**Calling an ERC-20 in a unit test panics** → there is no real token deployed at
the test address. Mock it: `start_mock_call(token, selector!("approve"), true)`.

### TypeScript / SDK

**`npm error 401 Unauthorized - GET https://npm.pkg.github.com/@starkware-libs%2fstarknet-privacy-sdk`**
→ The privacy SDK ships on **GitHub Packages** and needs a token with
`read:packages`:
```bash
npm config set //npm.pkg.github.com/:_authToken <TOKEN>
```
It is declared in `optionalDependencies` precisely so that `npm install`
*succeeds without a token* and only the SDK-dependent tests fail. Keep it there.
`npm run test:offline` runs everything that works tokenless.

**`hash.starknetKeccak` anywhere near a commitment hash** → **wrong, and it fails
silently.** `starknetKeccak` is Starknet's entrypoint-*selector* hash. Cairo's
`compute_commitment_hash` Poseidon-hashes the domain tag and the secret as **raw
felt252 values, neither pre-hashed**; a Cairo short-string literal
(`'PAYROLL_COMMITMENT_TAG:V1'`) *is already* its felt252 encoding. Use
`shortString.encodeShortString`. Getting this wrong does not throw — the
commitment funds fine on-chain and becomes **permanently unclaimable**, with
`Claim` reverting `COMMITMENT_NOT_FOUND`. Guarded by the parity test pair in
§5; if you touch either side, run both.

**`transfers.build(...).execute()` does not return a receipt.** It returns
`{ callAndProof, registry, warnings }` — it only *compiles and proves*.
Submitting is a separate outside-execution step:
`account.getOutsideTransaction(...)` → `account.executeFromOutside(...)` →
`provider.waitForTransaction(...)`. There is no `result.receipt`.

**starknet.js v10 constructors take a single options object**, not positional
args: `new Account({ provider, address, signer })`,
`new Contract({ abi, address, providerOrAccount })`. Pre-v10 examples found
online will not compile.

**`ContractDiscoveryProvider` is exported from the `/testing` subpath only**
(`@starkware-libs/starknet-privacy-sdk/testing`), not the package root.

**`ViewingKeyProvider.getViewingKey()` must be `async`** — it is declared
`Promise<ViewingKey>`. A bare `() => BigInt(...)` does not satisfy it.

**Token arguments are felt addresses, not symbols.** `.with("STRK", ...)` type-
checks (`StarknetAddress` is `BigNumberish`) and then throws at runtime when the
SDK calls `toBigInt()` on it. Pass the real token address.

### Environment

`timeout` is not installed on macOS by default — don't wrap commands in it.

---

## 4. Rules for working in this repo

1. **Never guess a third-party API signature.** If the exact shape of a
   `bridge-core`, NEAR Intents, Cavos, or privacy-SDK call is not confirmed by
   reading the real source or docs, stop and read it first. A plausible-looking
   wrong signature is worse than an honest `TODO`, because it looks finished.
   Several issues in the tracker are deliberately gated on a "read the real API
   first" step — respect the gate.
2. **Never commit secrets.** No private keys, no viewing keys, no tokens, no RPC
   URLs with embedded keys. Placeholders only. `.env` is gitignored; keep it so.
3. **Mainnet is real money.** The sprint is mainnet-only. Any mainnet
   transaction uses amounts you would not mind losing. Never send a mainnet
   transaction without explicit human confirmation for that specific action.
4. **Do not commit or push without explicit confirmation for that specific
   commit.** Standing project preference.
5. **The 10-block rule.** Any on-chain state a prover reads (a freshly
   registered viewing key, a topped-up balance, a previous private tx) must be
   at least 10 blocks old before the next proof's base block. Chaining two
   on-chain operations without waiting produces proof failures that look like
   logic bugs. Poll `provider.getBlockNumber()`.
6. **Don't overclaim privacy or chain coverage.** README and demo copy must state
   exactly what is and isn't private, and list only chains actually verified to
   work. Overclaiming is a direct scoring risk and a user-trust problem.
7. **Prove properties, don't assert them.** "Cryptographic proof of
   completeness" means a test that goes red when a payment is omitted. If you
   add a guarantee, add the negative test that fails without it.
8. **Keep tests runnable without credentials where possible.** The tokenless
   path (`npm run test:offline`, `snforge test`) must stay green on a clean
   checkout. Don't add a token requirement to logic that doesn't need one.

---

## 5. Layout and how to run things

```
contracts/payroll/     Cairo `Payroll` helper (privacy_invoke) + snforge suite
integration/           TypeScript integration tests against the pool + SDK
  src/commitment.ts    Commitment hash — SDK-free on purpose, runs tokenless
strk20.json            Sprint submission manifest (tx hashes, contracts, demo)
```

```bash
# Cairo — no credentials needed
cd contracts/payroll && scarb build && snforge test

# TypeScript — no credentials needed
cd integration && npm install && npm run test:offline

# TypeScript — needs a GitHub Packages token + Sepolia credentials
cd integration && npm test
```

### The parity pair — always run both together

`compute_commitment_hash` is duplicated in Cairo and TypeScript by necessity.
Two tests pin the **same** literal felt for the same secret:

- `contracts/payroll/src/tests.cairo::test_commitment_hash_matches_typescript`
- `integration/src/commitment-parity.test.ts`

If you change the domain tag, the operand encoding, or the hash function on
either side, exactly one goes red. That is the point. Never "fix" one by
copying the other's new value without understanding which side drifted.

---

## 6. Contract invariants — don't weaken these

`Payroll` is what makes the completeness claim true rather than aspirational:

- `expected_count` and `expected_total` are fixed at `OpenRun` and cannot be
  raised later. A run with either set to zero is rejected (`expected_count == 0`
  is how "run does not exist" is encoded).
- Every commitment's token must equal the run's token, or the aggregate totals
  would silently sum different currencies.
- The **final** `FundCommitment` must land the run exactly on `expected_total`
  (`UNDER_COMMITTED` otherwise), and the run then `closed`s. A payer therefore
  cannot short a recipient.
- A payer who omits a recipient never reaches `funded_count == expected_count`,
  so `closed` stays false and `is_complete` can never return true — even after
  every commitment they *did* fund is claimed.
- `is_complete` = `closed && paid_count == expected_count && total_paid == total_committed`.
- `privacy_invoke` is callable **only** by the privacy pool.
- `RunInfo` stores **no payer address** — deliberately. The pool is always the
  caller, so it could only ever record the pool; recording the real payer would
  publish the link the pool exists to hide.
- Run ownership is proven with a secret, never an address: `OpenRun` requires
  `run_id == compute_run_id(owner_secret)`, and every `FundCommitment` must
  reveal that same `owner_secret` against the run's stored `owner_commitment`.
  This closes both the `run_id`-squatting and third-party-funding holes — see
  `docs/adr-run-ownership.md` for the design reasoning, the alternatives
  considered, and the one documented residual (an attacker who front-runs a
  pending `FundCommitment` after `owner_secret` first becomes public calldata;
  narrower than the original hole, not eliminated).
- Funding requires an on-chain dual-approval quorum. `OpenRun` fixes two
  distinct approver commitments; each approver reveals their secret via
  `ApproveRun`; `FundCommitment` reverts `QUORUM_NOT_MET` until both have
  landed. Approvers are commitments, never addresses — same reason as the payer.
  What this proves is that **two distinct secrets** were revealed, not that two
  distinct *people* hold them; do not overclaim it. See
  `docs/adr-dual-approval-quorum.md`, including the residual that an approver
  reusing a secret across runs has no security left once the first reveal is
  public calldata.
