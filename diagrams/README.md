# `diagrams`

Generates the architecture, run-state-machine, and claim-routing SVGs used by
the [root README](../README.md) and [`ARCHITECTURE.md`](../ARCHITECTURE.md)
from typed specs, rather than hand-drawn images that silently drift from the
code they describe.

## Regenerating

Requires [Graphviz](https://graphviz.org) (`dot` on `PATH`):

```bash
brew install graphviz          # macOS
# apt-get install graphviz     # Debian/Ubuntu
npm ci
npm run generate                # writes out/<name>.{dot,svg}
```

CI fails the PR if a typed spec changed without regenerating the committed
`.dot` files (`git diff --exit-code -- out/*.dot` after generating). SVG
layout numbers vary by Graphviz version (Homebrew vs. apt), so the drift
check compares the `.dot`, which this repo fully controls, not the `.svg`.

## Where things live

| What | File |
|---|---|
| Node/edge/cluster type definitions | `definitions/types.ts` |
| System architecture (payer, pool, `Payroll`, claim legs) | `definitions/architecture.diagram.ts` |
| Run state machine, including the dual-approval quorum gate | `definitions/state-machine.diagram.ts` |
| Claim routing across Starknet/EVM/Solana | `definitions/claim-routing.diagram.ts` |
| Shared visual style (colors, fonts, tones) | `style.ts` |

Do not edit `out/*.dot` or `out/*.svg` by hand: change the matching
`*.diagram.ts` file and regenerate. Each spec's invariants are copied from
the real source it documents (`contracts/payroll/src/payroll.cairo`, the ADRs
in `../docs/`), not restated from memory, so keep them in sync when that
source changes.
