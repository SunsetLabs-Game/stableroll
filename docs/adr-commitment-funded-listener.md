# ADR: On-chain `CommitmentFunded` listener for the Waku notification

## Status

Accepted. Fixes tracker issue #42, "Notifications still require being the
submitter: no chain listener for CommitmentFunded".

## Problem

`integration/src/sepolia-run.ts` sends the Waku claim notification from
inside the same process that submits `FundCommitment`, right after it reads
`CommitmentFunded` back out of the receipt (issue #33). That fixed *what*
triggers a notification — the chain's own event, not "the call didn't
throw" — but not *who* can trigger it. A commitment funded by any other
path notifies nobody:

- A payer funding through their own tooling instead of `sepolia-run.ts`.
- The admin UI, once it can submit (blocked on #34).
- A run recovered after the submitting process died between the transaction
  landing and the Waku send.

## Constraint

The notification payload's `secret` field is the commitment preimage the
recipient needs to claim (`notify/src/send-claim-notification.ts`). It is
never on-chain and never in an event (CLAUDE.md §6) — `CommitmentFunded`
carries `commitment_hash`, a one-way hash of that secret, and nothing else.
A pure chain listener therefore sees that a commitment was funded but has no
way to invert the hash back into the value the notification needs to carry.

`docs/adr-notify-package-boundary.md` already documents the relevant
residual: nothing in this repo delivers `commitmentSecret` to a real
recipient before funding. Every path that funds a commitment today —
`sepolia-run.ts`, and any future admin or wallet-mediated submitter — must
already hold that secret locally, because `FundCommitment`'s calldata needs
`commitment_hash = compute_commitment_hash(secret)`. The question this ADR
answers is how to let that already-necessary knowledge survive past the
moment the funding transaction lands, without ever putting it anywhere a
chain observer or a third party can read it.

## Options considered

- **(a) The funding submitter registers `commitment_hash → secret` with the
  notifier ahead of time; a chain listener supplies the trigger.** The
  option sketched first in the issue. Requires a small durable store, but
  invents no new secret-distribution problem: the submitter already holds
  the secret at the moment it funds, this only lets that fact outlive the
  process.
- **(b) Drop `secret` from the notification payload; it becomes a "you have
  a pending claim" ping, with the secret delivered by the existing
  out-of-band path.** Rejected. The recipient must already possess the
  secret before they can derive the ECIES topic to receive *any*
  notification at all (`notify/src/topics.ts`), so a secret-less payload
  buys nothing a recipient doesn't already have. It would also break the
  pinned `ClaimNotificationPayload` schema — `notify/`'s parity tests,
  `frontend/src/lib/claim-notifications.ts`, and `PendingClaims.tsx` all
  assert the current five-field shape — for no corresponding gain.
- **(c) The recipient derives their own secret from a shared seed.**
  Rejected. No shared-seed mechanism exists anywhere in this repo, and
  CLAUDE.md §1 is explicit that the design docs this would depend on are
  not here and their contents must not be invented.

## Decision

Option (a), as an **outbox**: `commitment_hash → {run_id, commitment_secret,
token}`, plus a persisted block cursor.

- `integration/src/notification-outbox.ts` — a JSON-file-backed store.
  `registerPendingNotification` writes an entry keyed by `commitment_hash`
  before or during submission. `takePendingNotification` reads and deletes
  an entry atomically (read-modify-write under the same file), so a
  commitment is claimed by exactly one successful delivery — the dedup
  mechanism is "the entry is gone", not a separate "already sent" set.
  `getCursor`/`setCursor` persist the last block a poll has fully
  processed.
- `integration/src/commitment-listener.ts` — `pollCommitmentFunded` calls
  `provider.getEvents` (verified against `@starknet-io/starknet-types-0104`'s
  real `EVENT_FILTER`/`EVENTS_CHUNK` shapes, not assumed) filtered to the
  Payroll address and the `CommitmentFunded` selector, from the stored
  cursor to the chain tip, paginating on `continuation_token`. It decodes
  with the existing `parseCommitmentFunded` — no second decoder to drift
  out of sync with `test_commitment_funded_wire_layout_matches_typescript`.
  For each event it takes the matching outbox entry (if any — an event with
  no registered entry is not an error, since not every commitment need go
  through this relay) and sends the same payload shape `sepolia-run.ts`
  already sends, via the existing `sendClaimNotification`.
- `sepolia-run.ts` is unchanged. Its own receipt-driven send still works
  standalone; the outbox is an additional path, not a replacement.

## What this does and does not prove

It proves that a commitment funded through *any* submission path — not just
`sepolia-run.ts` — produces a notification once the listener observes the
matching `CommitmentFunded` event, and that restarting the listener cannot
cause a duplicate send (the entry it would need is already gone).

It does not turn the notification into something purely chain-driven the
way `RunOpened`/`RunClosed` are purely storage-derived. The secret still has
to reach the outbox from somewhere off-chain — the listener resolves *when*
to notify, never *what* to notify with. Say it this way in demo copy: "a
commitment funded through any registered path is notified once the chain
confirms it", not "the chain drives the notification end to end"
(CLAUDE.md §4 rule 6).

## Residual risk (documented, not solved)

**The outbox holds a commitment secret at rest, however briefly.** This is
not a new party learning the secret — it is payer-operated infrastructure,
the same trust boundary that already generates the secret and holds it in
memory for the same duration today (`params.commitmentSecret` in
`openAndFundSingleCommitment`). Whoever runs the listener process is
whoever would otherwise have run the submitting process; this does not
introduce a third party into the notification path. Operational security of
the outbox file (and, later, wherever it is deployed) is now part of that
same trust boundary — same as any credential the submitter already holds.

**An entry for a commitment that never funds is never cleaned up.** No TTL
or expiry sweep is built. For the sprint's scope (test fixtures and a
single operator's own runs) this is inert disk usage, not a live risk; a
sweep is straightforward to add if a stale-entry count ever matters, and
adding it before it is needed would be exactly the kind of speculative
generality CLAUDE.md's working rules ask this repo to avoid.

**Reprocessing after a crash mid-poll is not exactly-once.** If the process
dies after `sendClaimNotification` succeeds but before the cursor and the
outbox delete are persisted, the next poll's event range could overlap
already-sent commitments whose entries were not yet removed, causing a
duplicate send. This is the same class of at-least-once delivery any
poll-then-act pipeline without a transactional write has; a recipient
receiving the same notification twice is a UI nuisance, not a fund-safety
issue — `queryClaimNotifications` already returns every matching message it
finds in Store, so a duplicate just renders as a second identical entry,
and the notification carries no authority the secret itself does not
already carry.
