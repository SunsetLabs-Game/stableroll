# StableRoll demo video

Remotion composition `Demo` (1920x1080, 30fps). Scenes use the Graphviz
SVGs from `diagrams/out/` (copied into `public/`) and a real `snforge test`
capture from `contracts/payroll`.

```bash
cd media/demo
npm ci
npm run render    # writes out/demo.mp4
```

On-screen claims follow CLAUDE.md §4.6. `MainnetProofScene` is omitted
from `Demo` while `strk20.json` `transactions` is empty (issue #2).
Do not invent Voyager screenshots.

Sepolia claim-flow footage from issue #4 is not included: those tests
need credentials this render did not have.
