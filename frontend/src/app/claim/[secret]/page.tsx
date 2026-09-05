"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import { useCavos } from "@cavos/kit/react";
import { isCavosConfigured } from "@/lib/cavos-config";

/**
 * `ssr: false` because the component starts a libp2p node — it must never run
 * on the server. This is the documented pattern for lazy-loading a client-only
 * component in this Next version (`docs/01-app/02-guides/lazy-loading.md`), and
 * it only works from inside a Client Component, which this page is.
 */
const PendingClaims = dynamic(() => import("@/components/PendingClaims"), {
  ssr: false,
  loading: () => <p role="status">Loading pending-claim lookup…</p>,
});

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
 *
 * ## Pending-claim discovery
 *
 * `PendingClaims` reads that same notification back (issue #35). It derives the
 * topic and key from the secret using `payroll-notify` directly rather than a
 * copy, so the payer's Node-side derivation and this browser-side one cannot
 * drift apart. The secret never leaves the browser: it is used to derive a
 * content topic and an ECIES key, and nothing else.
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

      <PendingClaims secret={secret} />
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
