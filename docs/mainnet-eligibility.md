# Mainnet eligibility

Sprint eligibility requires **at least three real mainnet transactions that
touched the STRK20 privacy pool**, recorded in [`strk20.json`](../strk20.json).
This is a hard gate: without it the submission scores zero regardless of what
else is built. Deadline **31 Aug 2026, 23:59 UTC**.

| | |
|---|---|
| Pool | [`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`](https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a) |
| Chain | `SN_MAIN` (`0x534e5f4d41494e`) |
| Required | 3 distinct transactions |

## Status

**Not yet banked.** `strk20.json`'s `transactions` array is empty.

Run `cd integration && npm run verify:eligibility` for the current state. It
goes green only when three distinct hashes are recorded *and* every one of them
is confirmed on mainnet as a successful transaction that emitted an event from
the pool.

## The transactions

Fill this in as each one lands. The hash goes in `strk20.json` too — the
verifier reads it from there, not from this table.

| # | Hash | What it proves | Voyager |
|---|------|----------------|---------|
| 1 | `<pending>` | A viewing key is registered on mainnet — the `ViewingKeySet` event. Without this the pool cannot discover notes for this account. | |
| 2 | `<pending>` | STRK was shielded into the pool — the `Deposit` event. This is the funding side of a payroll run. | |
| 3 | `<pending>` | A private transfer inside the pool, and a withdrawal back out. This is the claim side: value moves without a public link between the two ends. | |

## Which route to use

Use the **hosted app at `strk20.starknet.io/app`**, which handles registration
and shielding through the UI.

This is not just the lower-risk option, it is the intended one. Upstream
`starkience/strk20-hackathon#31` ("the starter kit does not ship Sepolia
proving or discovery endpoints") was closed as completed on 2026-08-15, and the
resolution is that mainnet goes through the **Wallet API route**
(`WalletAccountV6`): the user's own wallet performs the proving and the
discovery. There are no separate mainnet prover or discovery URLs to supply,
and self-hosting `starknet_transaction_prover` is not expected of sprint teams —
its README asks for a 48 vCPU / 96 GB machine.

So: connect a wallet, and let it do the work. Do not go looking for endpoint
configuration; there isn't any on this path.

## Rules that apply here

- **This is real money on a real network.** Use amounts you would not mind
  losing. The gate cares that the transactions exist and touched the pool, not
  how large they were.
- **No agent sends a mainnet transaction.** CLAUDE.md §4 rule 3 requires
  explicit human confirmation for each specific mainnet transaction. Every hash
  in the table above is signed by a person.
- **Never commit the viewing key, the private key, or an RPC URL with an
  embedded API key.** Only the resulting public transaction hashes belong in
  this repo.
- **The 10-block rule** (CLAUDE.md §4 rule 5). Any on-chain state a prover
  reads — a freshly registered viewing key, a balance topped up a moment ago —
  must be at least 10 blocks old before the next proof's base block. Chaining
  these three steps back to back produces proof failures that look exactly like
  logic bugs. Wait between them.

## How the verification works

Two layers, deliberately split so the offline one can run on a clean checkout
with no credentials and no network:

**Shape** — `integration/src/mainnet-eligibility.ts`, covered by
`mainnet-eligibility.test.ts` and part of `npm run test:offline`. It validates
that every recorded hash is a well-formed non-zero felt and that no hash is
recorded twice. Duplicates are compared numerically, so padding one
transaction out to three entries (`0xdeadbeef`, `0x0deadbeef`, `0x00deadbeef`)
is caught rather than counted as three.

**On chain** — `mainnet-eligibility-onchain.test.ts`, run with
`npm run verify:eligibility`. For each hash it fetches the receipt from a
mainnet RPC, requires `execution_status == SUCCEEDED`, and requires at least
one event whose `from_address` is the pool. Addresses are compared as BigInt,
because the same address legitimately appears as both `0x040337…` and
`0x40337…` depending on the source.

That second file also pins two real historical mainnet transactions and asserts
the checker classifies them correctly — one that touched the pool, one that did
not. Without that negative case the check could be silently vacuous: a bug that
returned no event addresses would reject every hash, and an inverted comparison
would accept every hash, and both would look identical to "the manifest is
wrong".

The on-chain check is not in the required CI gate. It depends on public RPC
infrastructure this repo does not control (the same reason `test:liquidity` and
notify's Waku suite stay out), and it is legitimately red until the
transactions are banked, whereas CLAUDE.md §4 rule 8 requires the tokenless
suite to stay green on a clean checkout.

The default endpoint is `https://api.cartridge.gg/x/starknet/mainnet`. Override
it with `MAINNET_RPC_URL` if it rate-limits; `https://rpc.starknet.lava.build`
also works keyless. Do not reach for
`starknet-mainnet.public.blastapi.io` — it no longer serves Starknet at all and
answers every call with "Blast API is no longer available".
