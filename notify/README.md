# `notify`

Waku ECIES key/topic derivation and encrypted claim notifications for
StableRoll recipients, keyed off the same commitment secret as the on-chain
claim, never a Starknet address. For what StableRoll is as a whole, read the
[root README](../README.md) first; this file covers only this package.

## Running it

```bash
npm install
npm run test:offline   # 2 files, 23 tests: deterministic derivation, no network
npm test                # full suite, talks to the live Waku test fleet, no credentials needed
```

`npm test` can be slower or occasionally flaky by design (real P2P infra);
`npm run test:offline` is what CI runs.

## Where things live

| What | File |
|---|---|
| Recipient keypair and content-topic derivation from a commitment secret | `src/topics.ts` |
| Sending a notification after a successful `FundCommitment` | `src/send-claim-notification.ts` |
| The recipient side: reading Store history and subscribing via Filter | `src/receive-claim-notification.ts` |
| Why this is its own package rather than living inside `integration/` | [`../docs/adr-notify-package-boundary.md`](../docs/adr-notify-package-boundary.md) |
| Why a listener also sends notifications for commitments funded outside `integration/src/sepolia-run.ts` | [`../docs/adr-commitment-funded-listener.md`](../docs/adr-commitment-funded-listener.md) |

`integration/` depends on this package via `file:../notify`, not a published
version.
