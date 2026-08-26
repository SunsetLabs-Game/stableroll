# ADR: How `integration/` imports `notify/`

## Status

Accepted. Tracker issue "Wire notify/'s Waku notification into the real
FundCommitment call path".

## Problem

`integration/` and `notify/` are independent npm packages with no import
relationship. Wiring `sendClaimNotification` into
`openAndFundSingleCommitment` needs `deriveRecipientKeyPair` and the send
helper from `notify/`, without inventing a second derivation.

## Options considered

- **(a) npm workspace at repo root.** Joins both packages under one
  `package.json`. There is no workspace today. Introducing one would also
  pull in `diagrams/` (a separate package, separate issue) and change how
  CI runs `npm ci` in `integration/` and `notify/`. Out of scope for a
  single call-site wiring.
- **(b) `integration` depends on `notify` via `file:../notify`.** Smallest
  change that preserves a single copy of the derivation. `notify` grows an
  `exports` map so the import path is a package subpath, not a relative
  crawl into another tree.
- **(c) Duplicate `deriveRecipientKeyPair` (and friends) into
  `integration/`.** Matches the `commitment.ts` parity-pair precedent, but
  that pair exists because Cairo cannot import TypeScript. Two TypeScript
  packages *can* share a module. Duplicating a domain-tagged hash is the
  class of silent failure CLAUDE.md §5 exists to prevent: a drifted
  derivation notifies a topic the recipient is not listening on, and the
  commitment still funds.

## Decision

Option (b). `integration/package.json` declares
`"payroll-notify": "file:../notify"`. `notify/package.json` exports
`./topics.js` and `./send-claim-notification.js` to the existing `src/`
files.

## Residual risk (documented, not solved)

Nothing in this repo generates a `commitmentSecret` and delivers it to a
real recipient before funding happens. Test fixtures hold the secret in
the same process that funds. Real secret provisioning belongs to the
admin flow that creates commitments for real recipients (issue #8) and
must reuse `deriveRecipientKeyPair`, not add a second derivation.

The live Waku send is not in the required CI gate (same carve-out as
`notify/`'s own fleet test): it depends on public P2P infrastructure this
repo does not control, and the FundCommitment half needs Sepolia
credentials. `npm run test:offline` pins the payload shape via
`claim-notification-payload.test.ts` (no network).

`openAndFundSingleCommitment` starts the Waku node in parallel with
OpenRun/FundCommitment so `waitForPeers` is not added to the critical
path. Claim-path tests pass `notify: false` so they do not also depend
on the live fleet; the dedicated notification test uses the default.

`integration/` also pins `@waku/sdk` 0.0.36 and `@waku/message-encryption`
0.0.38 (the same versions `notify/` already pins) so
`fund-run-notification.test.ts` can subscribe with `ecies.createDecoder`
without crawling `notify/` internals. The TypeScript job runs `npm ci` in
`notify/` first because tsc follows the `file:` package's `.ts` exports
and those files resolve `@waku/*` from `notify/node_modules`.
