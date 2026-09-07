# `Payroll` (Cairo)

The `privacy_invoke`-driven helper the STRK20 privacy pool calls to run a
payroll. For what StableRoll is as a whole, read the [root README](../../README.md)
first; this file covers only the Cairo contract.

## Build and test

Requires the pinned toolchain in [`../../.tool-versions`](../../.tool-versions)
(scarb 2.17.0, starknet-foundry 0.63.0) via `asdf install`. No credentials
needed.

```bash
scarb build
snforge test    # 49 tests
```

## Where things live

| What | File |
|---|---|
| The contract and its invariants | `src/payroll.cairo` |
| Tests, including the negative cases that pin each invariant | `src/tests.cairo` |
| Why run ownership is proven by secret, not address | [`../../docs/adr-run-ownership.md`](../../docs/adr-run-ownership.md) |
| Why funding requires two on-chain approvals | [`../../docs/adr-dual-approval-quorum.md`](../../docs/adr-dual-approval-quorum.md) |
| Full invariant list and error-to-cause map | [`../../CLAUDE.md`](../../CLAUDE.md) §3 and §6 |

`compute_commitment_hash` is mirrored in TypeScript at
`../../integration/src/commitment.ts`; the two are pinned to the same literal
by a test on each side (`test_commitment_hash_matches_typescript` here,
`commitment-parity.test.ts` there). Changing the hash on one side without the
other makes funded commitments permanently unclaimable.
