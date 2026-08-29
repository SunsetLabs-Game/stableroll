"use client";

import { useState } from "react";
import { useCavos } from "@cavos/kit/react";
import { isCavosConfigured } from "@/lib/cavos-config";
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
 * Sign-in is Cavos, so an admin never touches a seed phrase. Approvals are
 * real signatures from `signMessage`, not checkboxes: identity is the signing
 * wallet address, so the same person approving twice stays one approver. The
 * counting logic lives in `@/lib/quorum` and is unit-tested there.
 */
export default function AdminPage() {
  if (!isCavosConfigured()) return <UnconfiguredNotice />;
  return <AdminConsole />;
}

function UnconfiguredNotice() {
  return (
    <main>
      <h1>Admin</h1>
      <p>
        Cavos is not configured. Set <code>NEXT_PUBLIC_CAVOS_APP_ID</code> and{" "}
        <code>NEXT_PUBLIC_CAVOS_APP_SALT</code> from the Cavos dashboard, then
        reload.
      </p>
      <p>
        Both are per-deployment credentials and are deliberately not committed,
        so a clean checkout renders this notice instead of failing to build.
      </p>
    </main>
  );
}

function AdminConsole() {
  const { isAuthenticated, address, user, openModal, logout, signMessage, isLoading } = useCavos();
  const [runId, setRunId] = useState("0x1");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const approvers = distinctApprovers(approvals, runId);
  const blocked = fundingBlockedReason(approvals, runId);
  const quorumReached = hasQuorum(approvals, runId);

  async function approve() {
    setError(null);
    if (!address) {
      setError("Connect a wallet before approving.");
      return;
    }
    try {
      const message = approvalMessage(runId);
      const signature = await signMessage(message);
      setApprovals((current) =>
        addApproval(current, {
          approver: address,
          message,
          signature: JSON.stringify(signature),
          signedAt: Date.now(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Signing failed.");
    }
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Admin</h1>
        <p>Sign in to open and fund a payroll run. No seed phrase involved.</p>
        <button onClick={openModal} disabled={isLoading}>
          {isLoading ? "Connecting…" : "Sign in"}
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Admin</h1>
      <p>
        Signed in as <code>{user?.email ?? user?.userId}</code> — <code>{address}</code>{" "}
        <button onClick={logout}>Sign out</button>
      </p>

      <h2>Payroll run</h2>
      <label>
        Run id{" "}
        <input value={runId} onChange={(event) => setRunId(event.target.value)} />
      </label>

      <h2>
        Approvals ({approvers.length} of {REQUIRED_APPROVALS})
      </h2>
      <p>
        Two <strong>distinct</strong> approvers must sign before funding. Each
        approval is a signature over a message naming this run, so it cannot be
        replayed onto another run, and a second signature from the same wallet
        replaces the first rather than counting twice.
      </p>

      <button onClick={approve}>Approve as {address?.slice(0, 10)}…</button>
      {error && <p role="alert">{error}</p>}

      <ul>
        {approvals.map((approval) => (
          <li key={approval.approver}>
            <code>{approval.approver}</code> — {new Date(approval.signedAt).toISOString()}
          </li>
        ))}
      </ul>

      <h2>Funding</h2>
      {blocked ? (
        <p role="status">{blocked}</p>
      ) : (
        <p role="status">Quorum reached. Funding may proceed.</p>
      )}
      <button disabled={!quorumReached}>Submit FundCommitment</button>

      <p>
        <small>
          Submitting is intentionally inert here. <code>Payroll.privacy_invoke</code>{" "}
          asserts its caller is the STRK20 pool and reverts{" "}
          <code>CALLER_NOT_PRIVACY</code> for anyone else, so a Cavos account
          cannot call it directly — the pool carries the call through{" "}
          <code>InvokeExternal</code> inside a proved private transaction. That
          path needs a proving service, which is not published for mainnet yet.
          See <code>src/lib/payroll-call.ts</code>.
        </small>
      </p>
    </main>
  );
}
