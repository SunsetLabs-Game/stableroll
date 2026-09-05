"use client";

import { useEffect, useState } from "react";
import {
  describeLookup,
  parseClaimSecret,
  type ClaimLookupState,
  type ClaimNotificationPayload,
} from "@/lib/claim-notifications";

/**
 * Reads the Waku notification `notify/` already sends, for the secret in the
 * URL (issue #35).
 *
 * ## Why the import is dynamic
 *
 * `@waku/sdk` starts a libp2p node and belongs nowhere near the server bundle.
 * The page loads this component through `next/dynamic` with `ssr: false` (the
 * documented pattern for this Next version, `docs/01-app/02-guides/lazy-loading.md`),
 * and the Waku modules are additionally imported inside the effect so they are
 * fetched only when a recipient actually opens a claim link.
 *
 * ## Store then Filter
 *
 * Store answers "was I already notified?", which is the normal case — the payer
 * sends when FundCommitment lands, and the recipient opens their link later.
 * Filter then covers a payment funded while the page is open. A Filter-only
 * implementation would show an empty page for a payment that was correctly
 * notified, which is the bug this component would otherwise ship with.
 */
export default function PendingClaims({ secret }: { secret: string }) {
  const [state, setState] = useState<ClaimLookupState>({ status: "idle" });

  useEffect(() => {
    const parsed = parseClaimSecret(secret);
    if (parsed === null) {
      setState({ status: "invalid-secret" });
      return;
    }

    // `cancelled` guards every setState after an await: React may unmount this
    // component while a 30s peer wait is still pending.
    let cancelled = false;
    let cleanup: (() => Promise<void>) | null = null;

    (async () => {
      const found: ClaimNotificationPayload[] = [];
      try {
        setState({ status: "connecting" });
        const { createRecipientNode, queryClaimNotifications, subscribeToClaimNotifications } =
          await import("payroll-notify/receive-claim-notification.js");

        const node = await createRecipientNode();
        if (cancelled) {
          await node.stop();
          return;
        }

        setState({ status: "searching" });
        found.push(...(await queryClaimNotifications(node, parsed)));
        if (cancelled) {
          await node.stop();
          return;
        }
        setState(found.length > 0 ? { status: "found", notifications: [...found] } : { status: "empty" });

        // Live updates are a bonus: a failure here must not discard the Store
        // results already on screen, so it is caught separately.
        let unsubscribe: (() => Promise<void>) | null = null;
        try {
          unsubscribe = await subscribeToClaimNotifications(node, parsed, (payload) => {
            if (cancelled) return;
            found.push(payload);
            setState({ status: "found", notifications: [...found] });
          });
        } catch {
          // Keep whatever Store returned; live updates simply stay unavailable.
        }

        cleanup = async () => {
          if (unsubscribe) await unsubscribe();
          await node.stop();
        };
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
      void cleanup?.();
    };
  }, [secret]);

  return (
    <section aria-labelledby="pending-claims-heading">
      <h2 id="pending-claims-heading">Pending claim</h2>
      <p role="status">{describeLookup(state)}</p>
      {state.status === "found" && (
        <ul>
          {state.notifications.map((n) => (
            <li key={n.commitmentHash}>
              <dl>
                <dt>Amount</dt>
                <dd>{n.amount}</dd>
                <dt>Token</dt>
                <dd>
                  <code>{n.token}</code>
                </dd>
                <dt>Run</dt>
                <dd>
                  <code>{n.runId}</code>
                </dd>
                <dt>Commitment</dt>
                <dd>
                  <code>{n.commitmentHash}</code>
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
