# StableRoll demo video

Remotion composition `Demo` (1920x1080, 30fps, ~93s). Inter + JetBrains Mono
via `@remotion/google-fonts`, scene fades via `@remotion/transitions`.
Diagrams are the LumenWipe-styled Graphviz SVGs from `diagrams/out/`.
Completeness is a real `snforge test` capture from `contracts/payroll`.

```bash
cd media/demo
npm ci
npm run render    # writes out/demo.mp4
```

On-screen claims follow CLAUDE.md §4 rule 6. Do not invent Voyager
screenshots.

Sepolia claim-flow footage from issue #4 is not included: those tests
need credentials this render did not have.

`MainnetProofScene` exists as its own composition (`src/scenes/MainnetProofScene.tsx`)
but `Demo.tsx`'s `TransitionSeries` never includes it: the committed
`out/demo.mp4` does not show mainnet transaction hashes, and was rendered
before issue #2 banked them anyway. `Demo.tsx`'s `demoDurationInFrames`
still adds `MAINNET_FRAMES` to the composition's declared duration once
`strk20.json`'s `transactions` array is non-empty (true as of the 3 banked
eligibility transactions), which no longer matches what `TransitionSeries`
actually renders. Re-running `npm run render` today would produce a
`Demo` composition whose declared duration exceeds its rendered content;
wire `MainnetProofScene` into `TransitionSeries` (or drop the duration
adjustment) before re-rendering, rather than assuming the ~93s figure
above still holds.
