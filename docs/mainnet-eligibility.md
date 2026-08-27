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

**Met — 3 of 3 banked.** All three verified on mainnet: each exists, succeeded,
and carries an event emitted by the pool. `npm run verify:eligibility` is green.

Run `cd integration && npm run verify:eligibility` for the current state. It
goes green only when three distinct hashes are recorded *and* every one of them
is confirmed on mainnet as a successful transaction that emitted an event from
the pool.

## The transactions

Fill this in as each one lands. The hash goes in `strk20.json` too — the
verifier reads it from there, not from this table.

| # | Hash | What it proves | Voyager |
|---|------|----------------|---------|
| 1 | `0x044b5d46…2110b9` | Viewing key registered **and** STRK shielded, in one transaction: a `ViewingKeySet` and a `Deposit` event, 4 pool events of 17 total. Block 13964885. | [tx](https://voyager.online/tx/0x044b5d46090d34321729e253aea555b10de5f0ae81ff38fce0081048902110b9) |
| 2 | `0x04fe7d82…e2aa6` | A second shield into the pool — `Deposit`, 3 pool events of 16 total. Block 13965041. | [tx](https://voyager.online/tx/0x04fe7d82f82ecb150f595d4a5b519d8dbeb8761d64e01644193b310019ee2aa6) |
| 3 | `0x077f3f2f…5c42f` | A third shield into the pool — `Deposit`, 3 pool events of 16 total. Block 13965191. | [tx](https://voyager.online/tx/0x077f3f2fef3675148e41b712ea9ede30e411c6f50a490ba91c6640ae6575c42f) |

All three were performed from a privacy-enabled wallet (Ready) on `SN_MAIN`,
not through StableRoll's own code. That is what this gate asks for — the Day-0
guide frames it as proving you can reach the pool "before you write any code" —
but it is worth stating plainly: **these transactions establish eligibility,
they do not demonstrate StableRoll.** The `Payroll` contract is not deployed to
mainnet and `strk20.json`'s `contracts` array is still empty.

Transaction 1 covers Day-0 steps 1 and 2 together: a privacy-enabled wallet
registers the viewing key automatically on first use, which the STRK20 docs
describe as "wallets handle registration on first use". The event selectors
were decoded to confirm this rather than inferred from the event count —
`0x1321a49…` is `ViewingKeySet`, `0x9149d21…` is `Deposit`.

Transactions 2 and 3 are further shields rather than a private transfer and a
withdrawal. The eligibility criterion only requires three transactions that
exist, succeeded, and carry a pool event, and three deposits satisfy it. A
private spend would have exercised more of the protocol; it is not recorded
here because it was not done.

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
- **The 10-block rule** (CLAUDE.md §4 rule 5), but only where proofs are
  involved. Registering a viewing key and shielding are ordinary public
  transactions that carry no proof — the Day-0 guide is explicit that "what
  needs no proof at all: registering a viewing key, and shielding" — so those
  can be chained without waiting. The rule bites when you *spend* privately:
  the SDK sets `provingBlockId = currentBlock - 10`, so a note created moments
  ago cannot be spent yet. Doing so fails in a way that looks exactly like a
  logic bug.

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

The default endpoint is `https://rpc.starknet.lava.build`, which the Day-0
guide publishes as verified against the live network. Override it with
`MAINNET_RPC_URL` if it rate-limits; `https://api.cartridge.gg/x/starknet/mainnet`
also works keyless. Do not reach for
`starknet-mainnet.public.blastapi.io` — it no longer serves Starknet at all and
answers every call with "Blast API is no longer available".
