# ADR: On-chain dual-approval quorum for `Payroll`

## Status

Accepted. Fixes tracker issue #31, "Enforce the dual-approval quorum in
Payroll, not just the UI".

## Problem

The dual-approval gate shipped in #29 lived entirely in
`frontend/src/lib/quorum.ts` and said so plainly: it bound the UI, not the
chain. Anyone routing a call through the privacy pool's `InvokeExternal` could
fund a run with no second approver at all, never loading the frontend. A
separation-of-duties control that only one of the two paths honours is a
convention, not a control.

The gated reading step in issue #8 established that Cavos cannot close this.
`cavos-labs/cavos-account` scopes a session key with `SpendingPolicy
{ token, limit }`, `SessionTimeLimits { valid_after, valid_until,
registered_at }` and an `allowed_contracts_root` — all per *individual* session
key, each bound to one OAuth identity. Grepping that contract for
`quorum|multisig|threshold|approver|m_of_n` returns nothing, and `@cavos/kit`
v0.1.11's `addSigner` / `removeSigner` / `listDevices` manage device signers on
a single wallet rather than multi-party approval. There is no M-of-N primitive
to build on.

## Constraint

The same one that shaped `docs/adr-run-ownership.md`: `RunInfo` deliberately
stores no payer address, because `privacy_invoke`'s caller is always the pool
and recording a real payer would publish the link the pool exists to hide.
Approver identity must therefore be a commitment, never an address — otherwise
the quorum becomes the exception that reintroduces the leak.

## Options considered

- **Reveal both approver secrets in a single `FundCommitment`.** Fewest
  transactions, but `privacy_invoke` carries one `secret` parameter, so it
  would need a second — and it forces one party to hold both secrets at the
  moment of funding, which is the opposite of separation of duties.
- **Record approvals as they arrive, gate funding on the tally.** Costs two
  extra private transactions per run, but each approver reveals their own
  secret in their own call and never shares it with the payer. Uses the
  existing `secret` parameter unchanged.
- **An approval counter rather than two named slots.** Simpler storage, but a
  counter cannot tell two approvals from one approver revealing twice without
  also storing which secrets were seen — which is the named-slot design with
  extra steps.

## Decision

Take the second option, with two fixed slots rather than a counter.

- `compute_approver_commitment(s) = poseidon(PAYROLL_APPROVER_TAG, s)`, its own
  domain tag alongside the commitment, run-id and run-owner tags. One secret
  reused across roles yields four unrelated values, so a `run_id` already
  public on-chain can never satisfy an approver commitment, and the payer's
  `owner_secret` is not self-approval.
- `OpenRun` fixes `approver_a_commitment` and `approver_b_commitment` on
  `RunInfo`. Both must be non-zero (`ZERO_APPROVER_COMMITMENT`) and distinct
  (`APPROVERS_NOT_DISTINCT`). They reuse the otherwise-unused `commitment_hash`
  and `note_id` parameters — the same documented dual-use trick that lets
  `amount` stand in for `expected_total`, and it keeps the quorum from costing
  two more `privacy_invoke` parameters.
- A new `ApproveRun` operation takes an approver secret, matches
  `compute_approver_commitment(secret)` against the two slots, and sets the
  corresponding `approved_a` / `approved_b` flag. A secret matching neither
  reverts `NOT_APPROVER`.
- `FundCommitment` asserts `approved_a && approved_b`, reverting
  `QUORUM_NOT_MET` otherwise — after the existing `NOT_RUN_OWNER` check, so
  ownership failures still report as ownership failures.

`ApproveRun` is appended *after* `Claim` in `PayrollOperation` so the three
original Serde discriminants stay 0/1/2 and the TypeScript constants mirroring
them remain correct.

## Why one secret twice cannot pass the gate

Two independent reasons, which is why the property holds even if one is later
weakened:

1. `ApproveRun` advances **at most one flag per call** — the match is an
   if/else over two slots, not two independent checks.
2. A given secret hashes to one commitment, so it always matches the *same*
   slot. Re-revealing it rewrites a flag that is already set.

The `APPROVERS_NOT_DISTINCT` assert is not what provides this. It does
something narrower but still necessary: with `a == b` the second slot would be
unreachable and the run could never be funded by anyone, so rejecting it at
`OpenRun` turns a permanently-stuck run into an immediate, legible failure.

`contracts/payroll/src/tests.cairo::test_same_approver_twice_does_not_satisfy_quorum`
pins the property. Deleting the `QUORUM_NOT_MET` assert turns four tests red.

## What this does and does not prove

It proves, on-chain, that **two distinct registered secrets were revealed**
before any commitment was funded, and that no approver address was recorded
anywhere.

It does **not** prove that two different *people* hold those secrets. A payer
who generates both approver secrets themselves satisfies the contract
completely. The contract enforces the mechanism; key custody is an
organizational control, exactly as it is for any multisig. Say it this way in
demo copy — "the chain enforces two distinct approver secrets" is true;
"the chain enforces two people" is not (CLAUDE.md §4 rule 6).

## Residual risk (documented, not solved)

**An approver secret becomes public calldata the moment their `ApproveRun`
lands.** Starknet has no per-call confidentiality for contract calldata; only
the pool's transfer mechanics are shielded. Within the run being approved this
is harmless — the flag is already set, so replaying it changes nothing.

Across runs it is not. **An approver who reuses one secret for a second run
has no security left**: anyone who read the first run's calldata can satisfy
that approver's slot on the new run. Approvers must generate a fresh secret per
run and hand over only the commitment. This is the same shape as the
`owner_secret` residual in `docs/adr-run-ownership.md` and is left to client
discipline for the same reason — a hash-chain of one-time secrets would close
it at the cost of meaningfully more contract and client complexity.

## Cost

Two additional private transactions per run, each with the 10-block maturity
wait from CLAUDE.md §5. `integration/src/sepolia-run.ts` now runs four private
transactions rather than two. That is the price of the guarantee being real,
and it is paid once per run rather than once per recipient.

## Privacy property

Unchanged from `docs/adr-run-ownership.md`: no address is stored or compared
anywhere in this scheme, only Poseidon hashes of secrets the parties generate
themselves. `RunInfo` still contains no payer address and now no approver
address either.
