import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getCursor,
  registerPendingNotification,
  setCursor,
  takePendingNotification,
} from "./notification-outbox.js";

/**
 * Tokenless — pure filesystem, no chain and no Waku. See
 * docs/adr-commitment-funded-listener.md for why this store exists: the
 * commitment secret a funding submitter already holds needs to survive past
 * the moment its own process exits, so `commitment-listener.ts` can send the
 * notification later on the chain's own signal.
 */

const dirs: string[] = [];

function tempStorePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "notification-outbox-"));
  dirs.push(dir);
  return join(dir, "outbox.json");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("registerPendingNotification / takePendingNotification", () => {
  it("returns null for a commitment nothing registered", () => {
    const storePath = tempStorePath();
    expect(takePendingNotification(storePath, 0x77n)).toBeNull();
  });

  it("returns a registered entry with bigints restored", () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 424242n,
      token: "0xabc",
    });

    expect(takePendingNotification(storePath, 0x77n)).toEqual({
      runId: 0x11n,
      commitmentSecret: 424242n,
      token: "0xabc",
    });
  });

  /**
   * The dedup mechanism for the listener: a commitment is claimed by exactly
   * one successful `take`, so a restarted poll over the same block range
   * finds nothing left to send.
   */
  it("removes the entry once taken, so a second take returns null", () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 424242n,
      token: "0xabc",
    });

    takePendingNotification(storePath, 0x77n);

    expect(takePendingNotification(storePath, 0x77n)).toBeNull();
  });

  it("keeps entries for different commitments independent", () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 111n,
      token: "0xabc",
    });
    registerPendingNotification(storePath, 0x88n, {
      runId: 0x11n,
      commitmentSecret: 222n,
      token: "0xabc",
    });

    takePendingNotification(storePath, 0x77n);

    expect(takePendingNotification(storePath, 0x88n)).toEqual({
      runId: 0x11n,
      commitmentSecret: 222n,
      token: "0xabc",
    });
  });
});

describe("getCursor / setCursor", () => {
  it("returns null when nothing was ever set", () => {
    const storePath = tempStorePath();
    expect(getCursor(storePath)).toBeNull();
  });

  it("persists the last value written", () => {
    const storePath = tempStorePath();
    setCursor(storePath, 12345);
    expect(getCursor(storePath)).toBe(12345);

    setCursor(storePath, 12400);
    expect(getCursor(storePath)).toBe(12400);
  });

  it("does not disturb pending entries already in the store", () => {
    const storePath = tempStorePath();
    registerPendingNotification(storePath, 0x77n, {
      runId: 0x11n,
      commitmentSecret: 111n,
      token: "0xabc",
    });

    setCursor(storePath, 500);

    expect(takePendingNotification(storePath, 0x77n)).toEqual({
      runId: 0x11n,
      commitmentSecret: 111n,
      token: "0xabc",
    });
  });
});
