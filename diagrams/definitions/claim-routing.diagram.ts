import type { DiagramSpec } from "./types.js";

// EVM chain list and ids copied from docs/evm-claim-coverage.md.
// Solana bound copied from docs/solana-claim-coverage.md.

export const spec: DiagramSpec = {
  name: "claim-routing",
  title: "StableRoll - Claim Routing",
  subtitle:
    "Destination is chosen by the recipient · EVM ids from bridge-core evmCctpDestinations · Solana via NEAR Intents",
  rankdir: "TB",
  splines: "spline",
  size: "16,10",
  clusters: [
    {
      id: "evm",
      title: "EVM  -  privacy-bridge cashOut",
      subtitle: "Five chains from docs/evm-claim-coverage.md · wired, not live-exercised",
      tone: "client",
    },
    {
      id: "solana",
      title: "Solana  -  NEAR Intents",
      subtitle: "Connector implemented · e2e claim not exercised (no testnet)",
      tone: "decision",
    },
  ],
  nodes: [
    {
      id: "dest",
      title: "Claim destination",
      subtitle: "Chosen by the recipient at claim time",
      shape: "diamond",
      tone: "decision",
      penwidth: "2.5",
    },
    {
      id: "starknet",
      title: "Starknet",
      subtitle: "Pool payout into an open note",
      subtitle2: "Same chain the run was funded on",
      tone: "success",
      penwidth: "2",
    },
    {
      id: "ethereum",
      title: "Ethereum",
      subtitle: "mainnet 1 / Sepolia 11155111",
      tone: "client",
      cluster: "evm",
    },
    {
      id: "optimism",
      title: "Optimism",
      subtitle: "mainnet 10 / OP Sepolia 11155420",
      tone: "client",
      cluster: "evm",
    },
    {
      id: "arbitrum",
      title: "Arbitrum One",
      subtitle: "mainnet 42161 / Arbitrum Sepolia 421614",
      tone: "client",
      cluster: "evm",
    },
    {
      id: "base",
      title: "Base",
      subtitle: "mainnet 8453 / Base Sepolia 84532",
      tone: "client",
      cluster: "evm",
    },
    {
      id: "polygon",
      title: "Polygon",
      subtitle: "mainnet 137 / Polygon Amoy 80002",
      tone: "client",
      cluster: "evm",
    },
    {
      id: "solana",
      title: "Solana USDC",
      subtitle: "1-Click quote → deposit-notify → poll",
      subtitle2: "Mainnet-only API · needs funds + human sign-off",
      tone: "decision",
      cluster: "solana",
      penwidth: "2",
    },
  ],
  edges: [
    { from: "dest", to: "starknet", label: "same chain", kind: "success" },
    { from: "dest", to: "ethereum", label: "EVM" },
    { from: "dest", to: "optimism" },
    { from: "dest", to: "arbitrum" },
    { from: "dest", to: "base" },
    { from: "dest", to: "polygon" },
    { from: "dest", to: "solana", label: "Solana", kind: "warning" },
  ],
};
