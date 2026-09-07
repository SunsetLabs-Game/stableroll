"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseClaimSecret } from "@/lib/claim-notifications";

/**
 * Entry point for a recipient who has a claim secret but not a link.
 *
 * Most recipients arrive at `/claim/<secret>` directly, from the link the payer
 * sends them. This page exists for the ones who were given the secret some
 * other way, and so that the landing page has somewhere concrete to point.
 *
 * Validation reuses `parseClaimSecret` — the same function the claim page uses
 * to decide whether it can look anything up. Writing a second check here would
 * let this page accept a value the next one rejects.
 *
 * The secret is held in component state and put into the URL. It is not logged,
 * not persisted, and not sent anywhere: the lookup on the next page derives a
 * Waku topic and an encryption key from it locally.
 */
export default function ClaimEntryPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = secret.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (parseClaimSecret(trimmed) === null) {
      setError(
        "That does not look like a claim secret. It is a single number, written " +
          "either in decimal or as 0x-prefixed hex.",
      );
      return;
    }
    setError(null);
    router.push(`/claim/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="page">
      <h1>Claim a payment</h1>
      <p className="lede">
        Your claim secret is the one thing that authorises your payment. It
        arrives in an encrypted Waku notification, or in a link from whoever
        paid you.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="secret">Claim secret</label>
        <input
          id="secret"
          type="text"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="0x… or a decimal number"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="secret-help"
          aria-invalid={error !== null}
        />
        <p id="secret-help" className="muted">
          Anyone holding this value can claim the payment, so treat it the way
          you would treat the money itself.
        </p>
        {error && (
          <p role="alert" className="muted">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="button" disabled={trimmed === ""}>
            Look up my payment
          </button>
        </div>
      </form>

      <div className="note">
        <p>
          Nothing you type here leaves your browser. The next page derives a
          Waku content topic and a decryption key from the secret locally, so
          the network only ever sees a topic name that cannot be traced back to
          you, and a message only your key can open.
        </p>
      </div>
    </main>
  );
}
