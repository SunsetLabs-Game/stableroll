import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The outbox `commitment-listener.ts` reads from once `CommitmentFunded`
 * confirms a commitment. See docs/adr-commitment-funded-listener.md for why
 * this exists: the notification's `secret` field can only come from whoever
 * funded the commitment, and this lets that already-necessary knowledge
 * survive past the funding process's own lifetime.
 *
 * A commitment is claimed by exactly one successful `takePendingNotification`
 * — that is the whole dedup mechanism. There is no separate "already sent"
 * set to fall out of sync with the pending one.
 */
export interface PendingNotificationEntry {
  runId: bigint;
  commitmentSecret: bigint;
  token: string;
}

interface SerializedEntry {
  runId: string;
  commitmentSecret: string;
  token: string;
}

interface OutboxFile {
  cursor: number | null;
  pending: Record<string, SerializedEntry>;
}

function readOutbox(storePath: string): OutboxFile {
  if (!existsSync(storePath)) return { cursor: null, pending: {} };
  return JSON.parse(readFileSync(storePath, "utf8")) as OutboxFile;
}

function writeOutbox(storePath: string, file: OutboxFile): void {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(file, null, 2));
}

/** Registers `entry` under `commitmentHash`, overwriting any prior entry for the same hash. */
export function registerPendingNotification(
  storePath: string,
  commitmentHash: bigint,
  entry: PendingNotificationEntry,
): void {
  const file = readOutbox(storePath);
  file.pending[commitmentHash.toString()] = {
    runId: entry.runId.toString(),
    commitmentSecret: entry.commitmentSecret.toString(),
    token: entry.token,
  };
  writeOutbox(storePath, file);
}

/**
 * Reads and deletes the entry for `commitmentHash`, or returns null if none is
 * registered. Deletion happens in the same read-modify-write as the read, so a
 * repeated call for the same hash returns null the second time.
 */
export function takePendingNotification(
  storePath: string,
  commitmentHash: bigint,
): PendingNotificationEntry | null {
  const file = readOutbox(storePath);
  const key = commitmentHash.toString();
  const serialized = file.pending[key];
  if (!serialized) return null;

  delete file.pending[key];
  writeOutbox(storePath, file);

  return {
    runId: BigInt(serialized.runId),
    commitmentSecret: BigInt(serialized.commitmentSecret),
    token: serialized.token,
  };
}

/** Last block a poll fully processed, or null before the first `setCursor`. */
export function getCursor(storePath: string): number | null {
  return readOutbox(storePath).cursor;
}

export function setCursor(storePath: string, blockNumber: number): void {
  const file = readOutbox(storePath);
  file.cursor = blockNumber;
  writeOutbox(storePath, file);
}
