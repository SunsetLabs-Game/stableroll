import type { DiagramSpec } from "./types.js";

// EVM chain list and ids are copied from the table in
// docs/evm-claim-coverage.md (read from bridge-core evmCctpDestinations,
// 2026-08-23). Do not add a chain that is not in that table.
// Solana bound is docs/solana-claim-coverage.md: connector implemented,
// e2e claim not exercised (NEAR Intents has no testnet).

export const spec: DiagramSpec = {
  name: "claim-routing",
  graphAttributes: {
    rankdir: "TB",
    fontname: "Times-Roman",
    fontsize: "11",
    bgcolor: "white",
  },
  nodes: [
    {
      id: "dest",
      label: "Claim destination chain",
      shape: "diamond",
    },
    {
      id: "starknet",
      label: "Starknet\\npool payout",
      shape: "box",
    },
    {
      id: "evm",
      label: "EVM\\nprivacy-bridge cashOut",
      shape: "box",
    },
    {
      id: "ethereum",
      label: "Ethereum\\nmainnet 1 / Sepolia 11155111",
      shape: "box",
    },
    {
      id: "optimism",
      label: "Optimism\\nmainnet 10 / OP Sepolia 11155420",
      shape: "box",
    },
    {
      id: "arbitrum",
      label: "Arbitrum One\\nmainnet 42161 / Arbitrum Sepolia 421614",
      shape: "box",
    },
    {
      id: "base",
      label: "Base\\nmainnet 8453 / Base Sepolia 84532",
      shape: "box",
    },
    {
      id: "polygon",
      label: "Polygon\\nmainnet 137 / Polygon Amoy 80002",
      shape: "box",
    },
    {
      id: "solana",
      label:
        "Solana\\nNEAR Intents connector implemented\\ne2e claim not exercised\\n(no testnet; mainnet needs sign-off)",
      shape: "box",
    },
  ],
  edges: [
    { from: "dest", to: "starknet" },
    { from: "dest", to: "evm" },
    { from: "dest", to: "solana" },
    { from: "evm", to: "ethereum" },
    { from: "evm", to: "optimism" },
    { from: "evm", to: "arbitrum" },
    { from: "evm", to: "base" },
    { from: "evm", to: "polygon" },
  ],
};
