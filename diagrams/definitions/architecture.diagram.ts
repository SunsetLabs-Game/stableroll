import type { DiagramSpec } from "./types.js";

// Sourced from contracts/payroll/src/payroll.cairo (RunInfo stores no payer
// address; owner_commitment is secret-proven, see docs/adr-run-ownership.md),
// docs/evm-claim-coverage.md (privacy-bridge cashOut is wired), and
// docs/solana-claim-coverage.md (NEAR Intents connector implemented; e2e
// claim not exercised). Labels must not overclaim chain coverage.

export const spec: DiagramSpec = {
  name: "architecture",
  graphAttributes: {
    rankdir: "TB",
    fontname: "Times-Roman",
    fontsize: "12",
    bgcolor: "white",
  },
  nodes: [
    { id: "payer", label: "Payer", shape: "box" },
    { id: "pool", label: "STRK20 Privacy Pool", shape: "box" },
    {
      id: "payroll",
      label: "Payroll.privacy_invoke\\nOpenRun / FundCommitment",
      shape: "box",
    },
    {
      id: "runinfo",
      label:
        "RunInfo\\naggregate accounting\\nno payer address\\nowner_commitment (secret-proven)",
      shape: "note",
    },
    {
      id: "claim",
      label: "Payroll.privacy_invoke\\nClaim",
      shape: "box",
    },
    {
      id: "starknet",
      label: "Starknet wallet\\npool payout",
      shape: "box",
    },
    {
      id: "evm",
      label: "EVM wallet\\nprivacy-bridge cashOut\\nwired not live-exercised",
      shape: "box",
    },
    {
      id: "solana",
      label:
        "Solana wallet\\nNEAR Intents connector\\ne2e claim not exercised",
      shape: "box",
    },
  ],
  edges: [
    { from: "payer", to: "pool", label: "fund" },
    {
      from: "pool",
      to: "payroll",
      label: "InvokeExternal",
    },
    { from: "payroll", to: "runinfo" },
    {
      from: "runinfo",
      to: "claim",
      label: "recipient reveals\\ncommitment secret",
    },
    { from: "claim", to: "starknet" },
    { from: "claim", to: "evm" },
    { from: "claim", to: "solana" },
  ],
};
