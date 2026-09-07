"use client";

import { useState } from "react";
import { useCavos } from "@cavos/kit/react";
import { isCavosConfigured } from "@/lib/cavos-config";
import { useStarknetWallet } from "@/lib/use-starknet-wallet";
import {
  REQUIRED_APPROVALS,
  addApproval,
  approvalMessage,
  distinctApprovers,
  fundingBlockedReason,
  hasQuorum,
  type Approval,
} from "@/lib/quorum";

/**
 * Payroll-run admin, behind the dual-approval gate (issue #8).
 *
 * Supports two sign-in paths:
 * 1. Native Starknet wallet (ArgentX / Braavos) via get-starknet-core.
 * 2. Cavos (seed-phrase-free) — if the app is configured.
 *
 * Approvals are real signatures, not checkboxes.
 */
export default function AdminPage() {
  return <AdminConsole />;
}

type AuthMethod = "cavos" | "wallet" | null;

function AdminConsole() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [runId, setRunId] = useState("0x1");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Cavos hooks
  const {
    isAuthenticated: cavosAuth,
    address: cavosAddress,
    user,
    openModal,
    logout: cavosLogout,
    signMessage: cavosSign,
    isLoading: cavosLoading,
  } = useCavos();

  // Native Starknet wallet hook (works with React 19 + starknet v10)
  const {
    address: walletAddress,
    isConnected: walletConnected,
    isConnecting: walletConnecting,
    walletName,
    error: walletError,
    connect: walletConnect,
    disconnect: walletDisconnect,
    signMessage: walletSign,
  } = useStarknetWallet();

  const isUsingCavos = authMethod === "cavos" && cavosAuth;
  const isUsingWallet = authMethod === "wallet" && walletConnected;
  const isSignedIn = isUsingCavos || isUsingWallet;
  const activeAddress = isUsingCavos ? cavosAddress : walletAddress;

  const approvers = distinctApprovers(approvals, runId);
  const blocked = fundingBlockedReason(approvals, runId);
  const quorumReached = hasQuorum(approvals, runId);

  async function approve() {
    setError(null);
    if (!activeAddress) {
      setError("Connect a wallet before approving.");
      return;
    }
    try {
      const message = approvalMessage(runId);
      let signature: string;

      if (isUsingCavos) {
        const sig = await cavosSign(message);
        signature = JSON.stringify(sig);
      } else {
        signature = await walletSign(message);
      }

      setApprovals((current) =>
        addApproval(current, {
          approver: activeAddress,
          message,
          signature,
          signedAt: Date.now(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Signing failed.");
    }
  }

  function logout() {
    if (isUsingCavos) cavosLogout();
    else walletDisconnect();
    setAuthMethod(null);
  }

  // ── Auth selection screen ──────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <main className="page">
        <div className="panel" style={{ padding: "var(--s-5)", marginTop: "var(--s-6)" }}>
          <h1>Run a payroll</h1>
          <p className="lead" style={{ margin: "var(--s-3) 0 var(--s-5)" }}>
            Connect your wallet to open and fund a payroll run.
          </p>

          {/* Browser wallet — always available */}
          <div style={{ display: "grid", gap: "var(--s-2)", marginBottom: "var(--s-4)" }}>
            <p style={{ fontSize: "var(--t-12)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: "0.25rem" }}>
              Browser Wallet (ArgentX / Braavos)
            </p>
            <button
              id="connect-wallet-btn"
              className="btn"
              style={{ justifyContent: "center" }}
              disabled={walletConnecting}
              onClick={async () => {
                setAuthMethod("wallet");
                await walletConnect();
              }}
            >
              {walletConnecting ? "Opening wallet…" : "Connect Starknet Wallet"}
            </button>
            {walletError && (
              <p style={{ color: "var(--hidden)", fontSize: "var(--t-13)" }}>{walletError}</p>
            )}
          </div>

          {/* Cavos (seedless) */}
          {isCavosConfigured() && (
            <div style={{ borderTop: "1px solid var(--rule-2)", paddingTop: "var(--s-4)" }}>
              <p style={{ fontSize: "var(--t-12)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: "0.75rem" }}>
                Seedless Sign-in
              </p>
              <button
                id="connect-cavos-btn"
                className="btn btn-ghost"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => { setAuthMethod("cavos"); openModal(); }}
                disabled={cavosLoading}
              >
                {cavosLoading ? "Connecting…" : "Sign in with Cavos (no seed phrase)"}
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Authenticated console ──────────────────────────────────────────────────
  return (
    <main className="page">
      <div className="panel" style={{ padding: "var(--s-4)", marginTop: "var(--s-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1>Run a payroll</h1>
            <p className="dim" style={{ marginTop: "0.5rem" }}>
              {isUsingCavos ? (
                <>Cavos · <code>{user?.email ?? user?.userId}</code> · <code>{activeAddress}</code></>
              ) : (
                <>{walletName ?? "Wallet"} connected · <code>{activeAddress}</code></>
              )}
            </p>
          </div>
          <button id="disconnect-btn" onClick={logout} className="btn btn-ghost" style={{ padding: "0.5rem 1rem", fontSize: "var(--t-12)" }}>
            Disconnect
          </button>
        </div>

        <div style={{ marginTop: "var(--s-5)" }}>
          <h2>Payroll run</h2>
          <label style={{ marginTop: "var(--s-2)" }}>
            Run id{" "}
            <input id="run-id-input" type="text" value={runId} onChange={(event) => setRunId(event.target.value)} />
          </label>
        </div>

        <div style={{ marginTop: "var(--s-5)" }}>
          <h2>
            Approvals ({approvers.length} of {REQUIRED_APPROVALS})
          </h2>
          <p className="dim" style={{ maxWidth: "60ch" }}>
            Two <strong>distinct</strong> approvers must sign before funding. Each
            approval is a signature over a message naming this run, so it cannot be
            replayed onto another run, and a second signature from the same wallet
            replaces the first rather than counting twice.
          </p>

          <div className="actions">
            <button id="approve-btn" onClick={approve} className="btn">
              Approve as {activeAddress?.slice(0, 10)}…
            </button>
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--hidden)", marginTop: "var(--s-2)" }}>
              {error}
            </p>
          )}
        </div>

        <ul style={{ marginTop: "var(--s-3)" }}>
          {approvals.map((approval) => (
            <li key={approval.approver}>
              <code>{approval.approver}</code> — {new Date(approval.signedAt).toISOString()}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: "var(--s-5)" }}>
          <h2>Funding</h2>
          {blocked ? (
            <p role="status" className="dim" style={{ color: "var(--hidden)" }}>{blocked}</p>
          ) : (
            <p role="status" className="dim" style={{ color: "var(--ok)" }}>Quorum reached. Funding may proceed.</p>
          )}
          <div className="actions">
            <button id="fund-btn" disabled={!quorumReached} className="btn">
              Submit FundCommitment
            </button>
          </div>
        </div>

        <div className="caveat" style={{ marginTop: "var(--s-5)" }}>
          <p>
            Submitting is intentionally inert here. <code>Payroll.privacy_invoke</code>{" "}
            asserts its caller is the STRK20 pool and reverts{" "}
            <code>CALLER_NOT_PRIVACY</code> for anyone else — the pool carries the call
            through <code>InvokeExternal</code> inside a proved private transaction.
            That path needs a proving service not yet published for mainnet.
            See <code>src/lib/payroll-call.ts</code>.
          </p>
        </div>
      </div>
    </main>
  );
}
