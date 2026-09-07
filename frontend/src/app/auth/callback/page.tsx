"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCavos } from "@cavos/kit/react";
import { isCavosConfigured } from "@/lib/cavos-config";

/**
 * OAuth landing route.
 *
 * `@cavos/kit` takes a `redirectUri` and exposes `handleCallback(authData)`, but
 * this app wired neither, so a Google or Apple sign-in had nowhere to come back
 * to. The provider cannot finish a session without this page.
 *
 * `useSearchParams` forces client-side rendering of everything under it, so the
 * Suspense boundary is required — without it the whole route opts out of static
 * generation and Next fails the build.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Status message="Completing sign-in…" />}>
      <CallbackHandler />
    </Suspense>
  );
}

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // `useCavos` throws outside the provider, and Providers only mounts it when
  // configured — so read the flag before touching the hook.
  const configured = isCavosConfigured();

  return configured ? (
    <ConfiguredCallback router={router} params={params} error={error} setError={setError} />
  ) : (
    <Status message="Cavos is not configured on this deployment, so there is no sign-in to complete." />
  );
}

function ConfiguredCallback({
  router,
  params,
  error,
  setError,
}: {
  router: ReturnType<typeof useRouter>;
  params: ReturnType<typeof useSearchParams>;
  error: string | null;
  setError: (value: string | null) => void;
}) {
  const { handleCallback } = useCavos();

  useEffect(() => {
    const authData = params.toString();
    if (!authData) {
      setError("This page is only reached after signing in — there is nothing to complete.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await handleCallback(authData);
        if (!cancelled) router.replace("/admin");
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Sign-in could not be completed.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, handleCallback, router, setError]);

  return <Status message={error ?? "Completing sign-in…"} isError={error !== null} />;
}

function Status({ message, isError = false }: { message: string; isError?: boolean }) {
  return (
    <main className="page">
      <h1>Signing you in</h1>
      <p role={isError ? "alert" : "status"} className="muted">
        {message}
      </p>
    </main>
  );
}
