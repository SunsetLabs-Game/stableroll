import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `payroll-notify` ships raw TypeScript from its `exports` map, and Next does
   * not compile code inside `node_modules` by default — without this the
   * dynamic import in `PendingClaims` resolves to nothing and pending-claim
   * discovery silently never runs (issue #35).
   *
   * Listing it here rather than adding a build step to `notify/` keeps that
   * package importable as source from both `integration/` and `frontend/`,
   * which is what lets the Waku topic derivation have exactly one
   * implementation. See
   * docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md.
   */
  transpilePackages: ["payroll-notify"],

  turbopack: {
    /**
     * `payroll-notify` is a `file:../notify` dependency, so npm installs it as
     * a symlink pointing outside this directory. Turbopack will not resolve
     * files from a linked dependency outside its root, and the failure is a
     * build *warning* rather than an error — the page would ship and the
     * dynamic import would simply never load.
     *
     * The repo has no root package.json, so there is no npm workspace for
     * Turbopack to infer this from; the docs' own instruction for that case is
     * to point `root` at the parent of both the app and the linked package
     * (turbopack.md, "resolve files from linked dependencies outside the
     * project root").
     */
    root: path.join(import.meta.dirname, ".."),
  },
};

export default nextConfig;
