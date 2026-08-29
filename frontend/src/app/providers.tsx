"use client";

import type { ReactNode } from "react";
import { CavosProvider } from "@cavos/kit/react";
import { cavosConfig, isCavosConfigured } from "@/lib/cavos-config";

/**
 * Wraps the tree in Cavos only when an App ID is configured.
 *
 * Mounting `CavosProvider` with an empty `appId` would fail at runtime on a
 * clean checkout, where the dashboard credential does not exist. Rendering the
 * children unwrapped instead keeps `npm run dev` and the CI build working with
 * zero credentials, and the pages below detect the unconfigured state and say
 * so rather than half-working.
 */
export function Providers({ children }: { children: ReactNode }) {
  if (!isCavosConfigured()) return <>{children}</>;
  return <CavosProvider config={cavosConfig}>{children}</CavosProvider>;
}
