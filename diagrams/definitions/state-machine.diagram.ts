import type { DiagramSpec } from "./types.js";

// Sourced from contracts/payroll/src/payroll.cairo RunInfo / is_complete /
// FundCommitment close path. expected_count and expected_total are fixed at
// OpenRun. closed is set only when funded_count == expected_count AND
// total_committed == expected_total. is_complete = closed &&
// paid_count == expected_count && total_paid == total_committed.

export const spec: DiagramSpec = {
  name: "state-machine",
  graphAttributes: {
    rankdir: "TB",
    fontname: "Times-Roman",
    fontsize: "11",
    bgcolor: "white",
  },
  nodes: [
    {
      id: "open",
      label: "OpenRun\\nfixes expected_count\\nand expected_total\\n(reject either = 0)",
      shape: "box",
    },
    {
      id: "fund",
      label: "FundCommitment*",
      shape: "box",
    },
    {
      id: "last",
      label:
        "last fund:\\nfunded_count == expected_count\\nAND total_committed == expected_total?",
      shape: "diamond",
    },
    {
      id: "closed",
      label: "closed = true",
      shape: "box",
    },
    {
      id: "under",
      label: "UNDER_COMMITTED",
      shape: "box",
    },
    {
      id: "omit",
      label: "omitted recipient\\nclosed stays false\\nis_complete never true",
      shape: "box",
    },
    {
      id: "claim",
      label: "Claim*\\nsecret preimage\\nrecomputes commitment hash",
      shape: "box",
    },
    {
      id: "complete",
      label:
        "is_complete\\nclosed AND paid_count == expected_count\\nAND total_paid == total_committed",
      shape: "box",
    },
  ],
  edges: [
    { from: "open", to: "fund" },
    { from: "fund", to: "fund", label: "more slots remain" },
    { from: "fund", to: "last", label: "attempt final slot" },
    { from: "last", to: "closed", label: "totals match" },
    { from: "last", to: "under", label: "short the last" },
    {
      from: "fund",
      to: "omit",
      label: "never fund a promised recipient",
    },
    { from: "closed", to: "claim" },
    { from: "claim", to: "complete", label: "every funded commitment claimed" },
  ],
};
