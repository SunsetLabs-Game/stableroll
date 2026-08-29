"use client";

import { use, useState } from "react";
import { useCavos } from "@cavos/kit/react";
import { isCavosConfigured } from "@/lib/cavos-config";

/**
 * Recipient claim page (issue #8).
 *
 * A Starknet-native recipient claims through the same seed-phrase-free flow the
 * admin uses. EVM and Solana recipients never reach this page — they claim with
 * their own wallets through the cross-chain routes (`docs/evm-claim-coverage.md`,
 * `docs/solana-claim-coverage.md`), which is the scope boundary issue #8 draws.
 *
 * ## The secret
 *
 * The `[secret]` segment is the commitment preimage: whoever holds it can claim
 * the payment. It is never logged, never sent to a third party, and never
 * persisted; it reaches the page in the URL the recipient already has, and it
 * would leave only inside the claim call itself.
 *
 * `redact()` below shortens it for display, and it is worth being precise about
 * what that does and does not buy. Next serialises route params into the RSC
 * payload, so the full value is still present in the page source — verified by
 * grepping the served HTML. Redaction therefore protects against screenshots
 * and shoulder-surfing of the rendered page, and nothing more. It is not a
 * confidentiality boundary: the secret is in the URL, so anyone who can see the
 * address bar, the browser history, or a referrer header already has it.
 *
 * The real mitigation is operational — these links are single-use and delivered
 * over the encrypted Waku notification (`notify/`), never posted somewhere
 * durable.
 */
export default function ClaimPage({ params }: PageProps<"/claim/[secret]">) {
  const { secret } = use(params);
  return isCavosConfigured() ? <ClaimConsole secret={secret} /> : <UnconfiguredClaim secret={secret} />;
}

function UnconfiguredClaim({ secret }: { secret: string }) {
  return (
    <main>
      <h1>Claim</h1>
      <p>
        Cavos is not configured, so this page cannot sign in a recipient. Set{" "}
        <code>NEXT_PUBLIC_CAVOS_APP_ID</code> and{" "}
        <code>NEXT_PUBLIC_CAVOS_APP_SALT</code> and reload.
      </p>
      <p>
        Claim secret present in the URL: <code>{redact(secret)}</code>
      </p>
    </main>
  );
}

function ClaimConsole({ secret }: { secret: string }) {
  const { isAuthenticated, address, openModal, isLoading } = useCavos();
  const [notice, setNotice] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Claim</h1>
        <p>
          Sign in to claim your payment into a Starknet wallet. No seed phrase,
          and no need to already hold one.
        </p>
        <button onClick={openModal} disabled={isLoading}>
          {isLoading ? "Connecting…" : "Sign in to claim"}
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Claim</h1>
      <p>
        Claiming into <code>{address}</code>.
      </p>
      <p>
        Claim secret: <code>{redact(secret)}</code>
      </p>

      <button onClick={() => setNotice(SUBMIT_NOTICE)}>Claim payment</button>
      {notice && <p role="status">{notice}</p>}

      <p>
        <small>
          Pending-claim discovery from the Waku notification (<code>notify/</code>)
          is not wired into this page yet. The notification itself works and is
          tested end-to-end against the live Waku fleet; what is missing is the
          browser-side hook that reads it.
        </small>
      </p>
    </main>
  );
}

const SUBMIT_NOTICE =
  "Not submitted. Payroll.privacy_invoke only accepts the STRK20 pool as caller " +
  "(CALLER_NOT_PRIVACY), so the claim travels through the pool's InvokeExternal " +
  "inside a proved private transaction — see src/lib/payroll-call.ts.";

/**
 * Shows enough of the secret to confirm the right link was opened. Display
 * only — see the note above on what this does not protect against.
 */
function redact(secret: string): string {
  if (secret.length <= 10) return secret;
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}
