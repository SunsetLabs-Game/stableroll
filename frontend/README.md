# StableRoll frontend

Next.js app shell with two real routes, not scaffolding. For what StableRoll
is and what actually works end to end, read the [root README](../README.md)
first; this file covers only what lives in `frontend/`.

## Routes

| Route | What it does | Source |
|---|---|---|
| `/admin` | Cavos sign-in for the payer, the dual-approval gate, and the `Payroll.privacy_invoke` calldata builder for opening/funding a run | `src/app/admin/page.tsx`, `src/lib/quorum.ts`, `src/lib/payroll-call.ts` |
| `/claim/[secret]` | Cavos sign-in for the recipient, plus Waku pending-claim discovery: queries Waku Store for a notification already sent and subscribes via Filter for one sent while the page is open | `src/app/claim/[secret]/page.tsx`, `src/lib/claim-notifications.ts`, `src/components/PendingClaims.tsx` |

Both routes render a clearly labelled "Cavos not configured" state without
`NEXT_PUBLIC_CAVOS_APP_ID`/`NEXT_PUBLIC_CAVOS_APP_SALT` set, so `npm run dev`
and CI work with zero credentials. See [`.env.example`](.env.example) for
every variable and what each one does.

## What does not submit, and why

Both pages build the real `Payroll.privacy_invoke` calldata and stop short of
sending it. This is not an unfinished feature, it's a structural gap: the
contract's `privacy_invoke` accepts only the privacy pool as caller
(`get_caller_address() == privacy_contract`), and reaching it from a Cavos
smart account needs a proving path the sprint has not published. The full
reasoning, including the one route that might still work, lives in
`src/lib/payroll-call.ts`'s header comment and is tracked as
[issue #34](https://github.com/SunsetLabs-Game/stableroll/issues/34).
`SUBMISSION_IS_POOL_MEDIATED` in that file is the flag that gates this off;
do not flip it without re-reading the comment above it first.

## The dual-approval gate lives here, not on-chain, in the UI's own right

`src/lib/quorum.ts` enforces the separation-of-duties rule that two distinct
approvers must sign off before a run funds. As of
[issue #31](https://github.com/SunsetLabs-Game/stableroll/issues/31) this is
also enforced on-chain in `Payroll` itself (see
[`docs/adr-dual-approval-quorum.md`](../docs/adr-dual-approval-quorum.md)),
so this module is now a UX convenience layered on top of a real contract
invariant, not the only thing standing between a run and a single-approver
funding. The mainnet-deployed contract does not have that invariant yet;
see the "Known gaps" section of
[`docs/verification-guide.md`](../docs/verification-guide.md).

## Running it

```bash
npm install
npm run dev   # serves /admin and /claim/[secret], no credentials needed
```

Tests: `npm test` (Vitest, tokenless, no network).
