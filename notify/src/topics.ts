// Recipient identity for the Waku notification channel, and the content topic
// derived from it. Pinned against @waku/sdk 0.0.36, @waku/message-encryption
// 0.0.38, @waku/utils 0.0.27, @waku/interfaces 0.0.34 (current on npm,
// verified by downloading and reading their real source — read 2026-08-23).
//
// Two API facts this file depends on that are NOT obvious from older
// js-waku docs/examples floating around:
// - Encoders/decoders now require an `IRoutingInfo`, not a bare pubsub
//   topic string. It's built with
//   `AutoShardingRoutingInfo.fromContentTopic(contentTopic, networkConfig)`
//   (@waku/utils, re-exporting @waku/utils/dist/common/sharding/routing_info.js).
//   `DefaultNetworkConfig` (@waku/interfaces) is cluster id 1 — "The Waku
//   Network", the same fleet `defaultBootstrap: true` connects to.
// - A content topic must match `/{application}/{version}/{name}/{encoding}`
//   (RFC 51 autosharding format, enforced by `ensureValidContentTopic`) — a
//   4-field structure, not a free-form string.
//
// Critical derivation rule (tracker issue): the recipient's Waku keypair is
// derived from the SAME `secret` that
// `contracts/payroll/src/payroll.cairo`'s `compute_commitment_hash` builds
// the on-chain commitment hash from — never from a Starknet address or any
// account identity. An observer who watches both the notification topic and
// the eventual on-chain Claim learns nothing linking them beyond what the
// claim transaction itself already reveals, because nothing here is derived
// from anything the payer's Starknet identity ever touches.

// Relative imports in this package are extensionless on purpose. tsconfig sets
// `moduleResolution: "Bundler"`, which allows it, and Turbopack does not rewrite
// a `./x.js` specifier to the `./x.ts` file on disk — with the `.js` suffix the
// frontend's browser bundle fails to resolve this module (issue #35). The
// package's *external* subpath names in `exports` keep their `.js` spelling,
// since those are map keys rather than filesystem paths.

import { getPublicKey } from "@waku/message-encryption";
import { AutoShardingRoutingInfo, ensureValidContentTopic } from "@waku/utils";
import { DefaultNetworkConfig } from "@waku/interfaces";
import type { IRoutingInfo } from "@waku/interfaces";
import { sha256 } from "@noble/hashes/sha256";
// Hex helpers from @noble/hashes rather than Node's Buffer, so this module runs
// unchanged in a browser bundle. The claim page (issue #35) must derive the
// same topic and key the payer does, and the issue is explicit that the
// derivation has exactly one implementation — which means this file has to be
// isomorphic rather than duplicated. Verified byte-identical to the previous
// Buffer-based output by notify/src/topics.test.ts's pinned literals.
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export const APPLICATION_NAME = "stableroll-payroll";
export const CONTENT_TOPIC_VERSION = "1";

export interface RecipientKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

const PRIVATE_KEY_DOMAIN_TAG = "STABLEROLL_WAKU_PRIVATE_KEY:V1";
const TOPIC_ID_DOMAIN_TAG = "STABLEROLL_WAKU_TOPIC_ID:V1";

function secretToBytes(secret: bigint): Uint8Array {
  if (secret < 0n) {
    throw new Error("secret must be a non-negative bigint");
  }
  let hex = secret.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  return hexToBytes(hex);
}

/**
 * Derives the recipient's ECIES keypair from the same `secret` the on-chain
 * commitment hash is built from. Deterministic: the same secret always
 * yields the same keypair, so the recipient can re-derive it locally from
 * the secret alone — nothing about it is persisted anywhere.
 *
 * The private key is `sha256(PRIVATE_KEY_DOMAIN_TAG || secret_bytes)`,
 * reduced to the 32-byte secp256k1 scalar `@waku/message-encryption`'s ECIES
 * implementation requires (`Asymmetric.keySize`, confirmed in its source).
 * A domain-tagged hash rather than the raw secret both fits the required key
 * size and keeps this key cryptographically separate from the on-chain
 * commitment hash and from any other secret-derived value.
 */
export function deriveRecipientKeyPair(secret: bigint): RecipientKeyPair {
  const tag = new TextEncoder().encode(PRIVATE_KEY_DOMAIN_TAG);
  const secretBytes = secretToBytes(secret);
  const privateKey = sha256(Uint8Array.from([...tag, ...secretBytes]));
  const publicKey = getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Derives the content topic a recipient's Waku Filter subscription listens
 * on, from their derived public key — never from a Starknet address or any
 * value an on-chain observer could tie to the payer or the run. Format:
 * `/stableroll-payroll/1/claim-<id>/proto`, where `<id>` is the first 16
 * hex chars of `sha256(TOPIC_ID_DOMAIN_TAG || publicKey)` — short enough to
 * stay a reasonable topic name, long enough that distinct public keys never
 * collide in practice.
 */
export function deriveContentTopic(publicKey: Uint8Array): string {
  const tag = new TextEncoder().encode(TOPIC_ID_DOMAIN_TAG);
  const digest = sha256(Uint8Array.from([...tag, ...publicKey]));
  const id = bytesToHex(digest).slice(0, 16);
  const contentTopic = `/${APPLICATION_NAME}/${CONTENT_TOPIC_VERSION}/claim-${id}/proto`;
  ensureValidContentTopic(contentTopic);
  return contentTopic;
}

/**
 * Routing info for a content topic derived above, using the same
 * `DefaultNetworkConfig` (cluster id 1, "The Waku Network") that
 * `createLightNode({ defaultBootstrap: true })` connects to. Encoders and
 * decoders both require this — see the file header.
 */
export function routingInfoFor(contentTopic: string): IRoutingInfo {
  return AutoShardingRoutingInfo.fromContentTopic(contentTopic, DefaultNetworkConfig);
}
