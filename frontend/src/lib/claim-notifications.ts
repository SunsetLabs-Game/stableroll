/**
 * Recipient-side pending-claim discovery for `/claim/[secret]` (issue #35).
 *
 * The topic and key derivation is NOT reimplemented here. It lives in
 * `payroll-notify` and is imported, which is why that package had to become
 * isomorphic — `notify/src/topics.ts` previously used Node's `Buffer`. One
 * implementation is a requirement of the issue, and for a good reason: the
 * payer publishes to a topic derived in Node and the recipient subscribes to
 * one derived in a browser. If the two derivations ever diverged, the payer
 * would publish where nobody listens and the failure would be silent — a topic
 * with no subscriber looks exactly like a payment that was never made.
 *
 * ## The secret
 *
 * `parseClaimSecret` is the only place the URL segment becomes a bigint, and
 * the value goes nowhere except into the derivation. It is never logged, never
 * persisted, and never sent to any server: Waku publishes to a content topic
 * derived from it, and the message is ECIES-encrypted to a key derived from it,
 * so no node on the path can read either the secret or the payment it names.
 */

import type { ClaimNotificationPayload } from "payroll-notify/receive-claim-notification.js";

export type { ClaimNotificationPayload };

/**
 * Turns the `[secret]` URL segment into the felt the derivation expects.
 *
 * Accepts hex (`0x…`) and decimal, matching how a felt is spelled across this
 * repo. Returns null for anything else rather than throwing, so a mistyped or
 * truncated link renders a message instead of a stack trace — a recipient who
 * pasted a broken link is the likeliest visitor with a bad value here.
 */
export function parseClaimSecret(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const value = BigInt(trimmed);
    // Zero is not a usable secret: compute_commitment_hash would still produce
    // a hash, but no run funds a commitment from a zero preimage.
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

/** What the page renders. Discriminated so the empty case cannot be mistaken for an error. */
export type ClaimLookupState =
  | { status: "idle" }
  | { status: "invalid-secret" }
  | { status: "connecting" }
  | { status: "searching" }
  | { status: "found"; notifications: ClaimNotificationPayload[] }
  | { status: "empty" }
  | { status: "failed"; reason: string };

/**
 * Human-readable text for each state.
 *
 * Split out from the component so the wording is testable without a browser or
 * a Waku node. The empty case is deliberately not phrased as a failure: issue
 * #35 asks for it to be handled honestly, and "no notification found" is the
 * normal outcome for a recipient whose payer never enabled notifications, or
 * whose message has aged out of Store retention. The claim secret in the URL
 * remains the authority either way.
 */
export function describeLookup(state: ClaimLookupState): string {
  switch (state.status) {
    case "idle":
      return "Looking for a pending claim…";
    case "invalid-secret":
      return "This link's claim secret is not a valid value, so no notification can be looked up.";
    case "connecting":
      return "Connecting to the Waku network…";
    case "searching":
      return "Searching for a notification for this secret…";
    case "found":
      return state.notifications.length === 1
        ? "Found 1 pending claim for this secret."
        : `Found ${state.notifications.length} pending claims for this secret.`;
    case "empty":
      return (
        "No notification found for this secret. That is normal: the payer may not " +
        "have sent one, or it may have aged out of Waku's retention. It does not " +
        "mean the payment is missing — the secret in this link is what authorises " +
        "the claim."
      );
    case "failed":
      return `Could not reach the Waku network: ${state.reason}. The claim itself does not depend on this.`;
  }
}
