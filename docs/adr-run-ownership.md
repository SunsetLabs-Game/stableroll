# ADR: Run ownership for `Payroll::privacy_invoke`

## Status

Accepted. Fixes tracker issue "Payroll: anyone can squat or fund into any
run_id (no run ownership)".

## Problem

`privacy_invoke` only checked that the caller was the privacy pool. Since
anyone can route a call through the pool's `InvokeExternal`, that gave no
notion of run ownership:

1. **`run_id` squatting** — anyone could `OpenRun` on any `run_id`, including
   one a legitimate payer intended to use, blocking the payer's own
   `OpenRun` with `RUN_EXISTS`.
2. **Third-party funding** — anyone could `FundCommitment` against an
   existing run with a commitment only they know the secret to, consuming a
   slot of `expected_count`/`expected_total` so the real payer's final
   commitment reverts `UNDER_COMMITTED`, and then claim their own commitment
   to drain that portion.

## Constraint

`RunInfo` deliberately stores no payer address: `privacy_invoke`'s caller is
always the pool, so a stored "payer" could only ever record the pool's own
address — storing the *real* payer would publish exactly the link the pool
exists to hide. Any fix has to authorize the run's opener without ever
touching an address.

## Options considered

- **Derive `run_id` from a payer secret.** Cheap, preserves privacy, but on
  its own does nothing to stop a third party funding into a run whose id has
  already become public on-chain.
- **Register a run admin key in `RunInfo`.** Simplest to reason about, but an
  address-shaped admin key risks re-introducing the payer-identity leak
  `RunInfo` was designed to avoid — and structurally the caller into
  `privacy_invoke` is always the pool, so there is no caller address to check
  a stored admin key against anyway. Any "key" here would really have to be a
  secret-based proof, not an address check.
- **Bind a run to a payer commitment at `OpenRun`, require every
  `FundCommitment` to prove knowledge of the preimage.** Strongest against
  attack 2, costs one hash per call and a 9th `privacy_invoke` parameter — or
  reuse of an existing one.

## Decision

Combine the first and third options, reusing the existing `secret`
parameter (previously unused by `OpenRun`/`FundCommitment`) instead of adding
a new one:

- `OpenRun` now requires `run_id == compute_run_id(secret)`, where
  `compute_run_id(s) = poseidon(PAYROLL_RUN_ID_TAG, s)`. `secret` here is an
  `owner_secret` the payer generates off-chain per run.
- `OpenRun` stores `owner_commitment = compute_run_owner_commitment(secret)`
  on `RunInfo`, using a *different* domain tag
  (`PAYROLL_RUN_OWNER_TAG`) from `compute_run_id` so the public `run_id`
  never doubles as the commitment.
- `FundCommitment` now requires
  `compute_run_owner_commitment(secret) == run.owner_commitment` — the caller
  must reveal the same `owner_secret` used at `OpenRun`.

This closes both attacks as described in the issue:

- **Squatting**: an attacker cannot produce a valid `OpenRun` call for a
  `run_id` the payer intends to use without knowing a secret whose
  `compute_run_id` hash equals it — infeasible without knowing the payer's
  secret, since Poseidon is one-way.
- **Third-party funding**: an attacker without `owner_secret` cannot satisfy
  `NOT_RUN_OWNER`'s check, so they cannot fund into an existing run they did
  not open.

## Residual risk (documented, not solved)

`owner_secret` becomes public calldata the moment the payer's first
`FundCommitment` call lands on-chain (Starknet has no native per-call
confidentiality for contract calldata — only the pool's own transfer
mechanics are shielded). From that point on, an attacker who front-runs the
payer's *subsequent* `FundCommitment` transactions in the mempool could reuse
the now-public secret. This is a generic blockchain front-running problem,
not specific to this scheme, and is a materially smaller attack surface than
the original hole: it requires actively racing specific pending transactions
mid-run, rather than passively guessing or pre-opening a run before the payer
starts. It is not addressed here; a hash-chain (one-time-use secret per call)
would close it at the cost of meaningfully more contract and client
complexity, and is left as a follow-up if front-running against live runs is
observed in practice.

## Privacy property

No address is stored or compared anywhere in this scheme — only Poseidon
hashes of a secret the payer alone generates. `RunInfo` still contains no
payer address, and nothing here creates a new way to link a run back to the
pool caller's real identity.
