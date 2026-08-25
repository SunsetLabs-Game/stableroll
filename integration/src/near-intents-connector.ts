/**
 * NEAR Intents 1-Click API connector for the Solana claim leg.
 *
 * ---
 * API SHAPE — PINNED FROM REAL DOCS
 * Source: https://docs.near-intents.org (OpenAPI at https://1click.chaindefuser.com/docs/v0/openapi.yaml)
 * Read: 2026-08-23
 *
 * 1. QUOTE REQUEST (POST /v0/quote)
 *    Required fields:
 *      { dry: boolean, swapType: "EXACT_INPUT"|"EXACT_OUTPUT"|"FLEX_INPUT"|"ANY_INPUT",
 *        slippageTolerance: number (basis points, e.g. 100 = 1%),
 *        originAsset: string (nep141:... asset ID), depositType: "ORIGIN_CHAIN"|"INTENTS"|"CONFIDENTIAL_INTENTS",
 *        destinationAsset: string, amount: string (smallest unit, integer string),
 *        recipient: string, recipientType: "DESTINATION_CHAIN"|"INTENTS"|"CONFIDENTIAL_INTENTS",
 *        refundTo: string, refundType: "ORIGIN_CHAIN"|"INTENTS"|"CONFIDENTIAL_INTENTS",
 *        deadline: string (ISO 8601) }
 *    Response:
 *      { correlationId, timestamp, signature, quoteRequest, quote: { depositAddress, amountIn,
 *        amountOut, minAmountOut, timeEstimate, deadline, ... } }
 *
 * 2. DEPOSIT NOTIFICATION (POST /v0/deposit/submit) — optional, speeds up detection
 *      { depositAddress: string, txHash: string }
 *
 * 3. STATUS POLLING (GET /v0/status?depositAddress=<addr>)
 *    Response:
 *      { correlationId, quoteResponse, status: "PENDING_DEPOSIT"|"KNOWN_DEPOSIT_TX"|"INCOMPLETE_DEPOSIT"
 *        |"PROCESSING"|"SUCCESS"|"REFUNDED"|"FAILED", updatedAt, swapDetails: { destinationChainTxHashes:
 *        [{ hash, explorerUrl }], amountOut, ... } }
 *
 * 4. SOLANA DESTINATION ADDRESS
 *    Specified via `recipient` field as a Base58-encoded Ed25519 public key (typically 44 chars).
 *    `recipientType` must be "DESTINATION_CHAIN" for on-chain delivery to Solana.
 *
 * CONFIRMED ASSET IDs (queried from GET /v0/tokens on 2026-08-23):
 *   Starknet STRK: "nep141:starknet.omft.near" (18 decimals)
 *   Solana SOL:    "nep141:sol.omft.near" (9 decimals)
 *   Solana USDC:   "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near" (6 decimals,
 *                   contract EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
 *
 * NO TESTNET: NEAR Intents has no testnet/devnet. All operations are mainnet-only.
 * ---
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the OpenAPI QuoteRequest schema, subset relevant to our flow. */
export interface OneClickQuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  destinationAsset: string;
  amount: string;
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  deadline: string;
}

export interface OneClickQuote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline?: string;
  timeWhenInactive?: string;
  timeEstimate: number;
}

export interface OneClickQuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: OneClickQuoteRequest;
  quote: OneClickQuote;
}

export interface TransactionDetails {
  hash: string;
  explorerUrl: string;
}

export interface SwapDetails {
  intentHashes: string[];
  nearTxHashes: string[];
  amountIn?: string;
  amountInFormatted?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  originChainTxHashes: TransactionDetails[];
  destinationChainTxHashes: TransactionDetails[];
}

export type SwapStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface OneClickStatusResponse {
  correlationId: string;
  quoteResponse: OneClickQuoteResponse;
  status: SwapStatus;
  updatedAt: string;
  swapDetails: SwapDetails;
}

/** Token descriptor returned by GET /v0/tokens. */
export interface OneClickToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  contractAddress?: string | null;
}

/** Parameters the caller supplies to `submitSolanaClaim`. */
export interface SolanaClaimParams {
  /** The Starknet transaction hash of the privacy-pool withdrawal that
   *  released the claimed funds to a Starknet address we control. */
  starknetTxHash: string;
  /** Amount to bridge, in the smallest unit of the origin asset (Starknet STRK, 18 decimals). */
  amount: string;
  /** The recipient's Solana wallet address (Base58-encoded Ed25519 public key). */
  solanaRecipient: string;
}

/** Value returned by `submitSolanaClaim` on success. */
export interface SolanaClaimResult {
  /** The Solana transaction signature confirming the destination-chain delivery. */
  solanaTxSignature: string;
  /** Full status response for logging / auditing. */
  statusResponse: OneClickStatusResponse;
}

// ---------------------------------------------------------------------------
// Constants (pinned from live API, 2026-08-23)
// ---------------------------------------------------------------------------

const ONE_CLICK_BASE_URL = "https://1click.chaindefuser.com";

/** Starknet STRK native token on NEAR Intents.
 *  Queried from GET /v0/tokens on 2026-08-23. */
export const STARKNET_STRK_ASSET_ID = "nep141:starknet.omft.near";

/** Solana USDC on NEAR Intents (SPL token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v).
 *  Queried from GET /v0/tokens on 2026-08-23. */
export const SOLANA_USDC_ASSET_ID =
  "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";

/** Solana native SOL on NEAR Intents.
 *  Queried from GET /v0/tokens on 2026-08-23. */
export const SOLANA_SOL_ASSET_ID = "nep141:sol.omft.near";

// Terminal statuses — polling stops when any of these is reached.
const TERMINAL_STATUSES: ReadonlySet<SwapStatus> = new Set([
  "SUCCESS",
  "REFUNDED",
  "FAILED",
]);

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

function getApiKey(): string | undefined {
  return process.env.NEAR_INTENTS_API_KEY;
}

function getSlippageBps(): number {
  const raw = process.env.NEAR_INTENTS_SLIPPAGE_BPS;
  return raw ? parseInt(raw, 10) : 100; // default 1%
}

function getDeadlineMinutes(): number {
  const raw = process.env.NEAR_INTENTS_DEADLINE_MINUTES;
  return raw ? parseInt(raw, 10) : 30;
}

function getRefundAddress(): string {
  const addr = process.env.STARKNET_REFUND_ADDRESS;
  if (!addr) {
    throw new Error(
      "Missing required env var: STARKNET_REFUND_ADDRESS (Starknet address for refunds if the swap fails)",
    );
  }
  return addr;
}

function getDestinationAssetId(): string {
  // Allow override — default to Solana USDC since that has the deepest liquidity.
  return process.env.NEAR_INTENTS_DEST_ASSET ?? SOLANA_USDC_ASSET_ID;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetches the list of supported tokens from the 1-Click API.
 * Useful for verifying that the pinned asset IDs are still live.
 */
export async function queryTokens(): Promise<OneClickToken[]> {
  const res = await fetch(`${ONE_CLICK_BASE_URL}/v0/tokens`, {
    headers: buildHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `GET /v0/tokens failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
  }
  return res.json() as Promise<OneClickToken[]>;
}

/**
 * Requests a swap quote from the 1-Click API.
 *
 * When `dry` is true, the response omits `depositAddress`, `timeWhenInactive`,
 * and `deadline` — useful for validating parameters and previewing pricing
 * without committing to a swap.
 */
export async function requestQuote(
  params: OneClickQuoteRequest,
): Promise<OneClickQuoteResponse> {
  const res = await fetch(`${ONE_CLICK_BASE_URL}/v0/quote`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /v0/quote failed: ${res.status} ${res.statusText} — ${body}`);
  }
  return res.json() as Promise<OneClickQuoteResponse>;
}

/**
 * Optionally notifies the 1-Click service that a deposit has been sent.
 * Speeds up solver detection but is not required for the swap to proceed.
 */
export async function submitDepositNotification(
  depositAddress: string,
  txHash: string,
): Promise<void> {
  const res = await fetch(`${ONE_CLICK_BASE_URL}/v0/deposit/submit`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ depositAddress, txHash }),
  });
  // Best-effort — log but don't throw on failure.
  if (!res.ok) {
    console.warn(
      `POST /v0/deposit/submit non-OK (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Polls the swap status until a terminal state is reached.
 *
 * Uses exponential backoff starting at `initialDelayMs` (default 5 s),
 * capped at `maxDelayMs` (default 30 s), for up to `timeoutMs` total
 * (default 10 minutes).
 */
export async function pollStatus(
  depositAddress: string,
  options?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    timeoutMs?: number;
  },
): Promise<OneClickStatusResponse> {
  const initialDelay = options?.initialDelayMs ?? 5_000;
  const maxDelay = options?.maxDelayMs ?? 30_000;
  const timeout = options?.timeoutMs ?? 10 * 60_000;
  const startTime = Date.now();
  let delay = initialDelay;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeout) {
      throw new Error(
        `pollStatus timed out after ${Math.round(elapsed / 1000)}s — last status was not terminal`,
      );
    }

    const url = new URL(`${ONE_CLICK_BASE_URL}/v0/status`);
    url.searchParams.set("depositAddress", depositAddress);

    const res = await fetch(url.toString(), { headers: buildHeaders() });
    if (!res.ok) {
      // 404 means the deposit address hasn't been indexed yet — retry.
      if (res.status === 404) {
        console.log(
          `pollStatus: deposit address not yet indexed (404), retrying in ${delay}ms...`,
        );
      } else {
        const body = await res.text();
        throw new Error(`GET /v0/status failed: ${res.status} ${res.statusText} — ${body}`);
      }
    } else {
      const status = (await res.json()) as OneClickStatusResponse;
      console.log(
        `pollStatus: status=${status.status} correlationId=${status.correlationId} elapsed=${Math.round(elapsed / 1000)}s`,
      );

      if (TERMINAL_STATUSES.has(status.status)) {
        return status;
      }
    }

    await sleep(delay);
    delay = Math.min(delay * 1.5, maxDelay);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * The function the claim UI calls for Solana recipients.
 *
 * Flow:
 *  1. Request a quote: STRK on Starknet → USDC on Solana (configurable via env).
 *  2. Notify the 1-Click service of the Starknet deposit tx (optional speedup).
 *  3. Poll until terminal status.
 *  4. On SUCCESS, extract the Solana tx signature from `destinationChainTxHashes`.
 *
 * The Starknet-side claim (privacy_invoke → privacy-pool withdrawal) must have
 * already completed before calling this function. The `starknetTxHash` is the
 * hash of that withdrawal transaction, and `amount` is the withdrawal amount
 * in the origin asset's smallest unit (STRK: 18 decimals).
 *
 * @throws if the swap reaches REFUNDED or FAILED, or if polling times out.
 */
export async function submitSolanaClaim(
  params: SolanaClaimParams,
): Promise<SolanaClaimResult> {
  const { starknetTxHash, amount, solanaRecipient } = params;

  // Validate Solana address format: Base58-encoded, typically 32–44 chars.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaRecipient)) {
    throw new Error(
      `Invalid Solana address: "${solanaRecipient}" — expected Base58-encoded Ed25519 public key`,
    );
  }

  const refundTo = getRefundAddress();
  const deadlineDate = new Date(
    Date.now() + getDeadlineMinutes() * 60 * 1000,
  );

  // Step 1: Request a swap quote.
  console.log(
    `submitSolanaClaim: requesting quote — ${amount} of ${STARKNET_STRK_ASSET_ID} → ${getDestinationAssetId()} to ${solanaRecipient}`,
  );

  const quoteResponse = await requestQuote({
    dry: false,
    swapType: "EXACT_INPUT",
    slippageTolerance: getSlippageBps(),
    originAsset: STARKNET_STRK_ASSET_ID,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: getDestinationAssetId(),
    amount,
    recipient: solanaRecipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline: deadlineDate.toISOString(),
  });

  const depositAddress = quoteResponse.quote.depositAddress;
  if (!depositAddress) {
    throw new Error(
      "Quote response missing depositAddress — quote may have been dry-run or invalid",
    );
  }

  console.log(
    `submitSolanaClaim: quote received — depositAddress=${depositAddress} ` +
      `amountOut=${quoteResponse.quote.amountOutFormatted} ` +
      `minAmountOut=${quoteResponse.quote.minAmountOut} ` +
      `timeEstimate=${quoteResponse.quote.timeEstimate}s ` +
      `correlationId=${quoteResponse.correlationId}`,
  );

  // Step 2: Notify the service about the Starknet deposit tx.
  // The Starknet claim tx already moved the funds to a Starknet address
  // from which they need to be bridged. In our flow, the deposit to the
  // 1-Click deposit address is a SEPARATE step the caller must perform
  // after receiving the quote. The starknetTxHash we submit here is the
  // hash of THAT deposit transaction, not the privacy-pool claim.
  await submitDepositNotification(depositAddress, starknetTxHash);

  // Step 3: Poll until terminal.
  console.log("submitSolanaClaim: polling for completion...");
  const statusResponse = await pollStatus(depositAddress);

  // Step 4: Handle result.
  if (statusResponse.status === "SUCCESS") {
    const destTxHashes = statusResponse.swapDetails?.destinationChainTxHashes;
    if (!destTxHashes || destTxHashes.length === 0) {
      throw new Error(
        "Swap succeeded but no destination chain tx hashes were returned — " +
          "cannot extract Solana tx signature",
      );
    }
    const solanaTxSignature = destTxHashes[0].hash;
    console.log(
      `submitSolanaClaim: SUCCESS — solanaTxSignature=${solanaTxSignature} ` +
        `explorerUrl=${destTxHashes[0].explorerUrl} ` +
        `amountOut=${statusResponse.swapDetails.amountOutFormatted ?? statusResponse.swapDetails.amountOut}`,
    );
    return { solanaTxSignature, statusResponse };
  }

  if (statusResponse.status === "REFUNDED") {
    throw new Error(
      `Swap was refunded — correlationId=${statusResponse.correlationId} ` +
        `reason: check swapDetails for refundReason`,
    );
  }

  // FAILED or any other unexpected terminal.
  throw new Error(
    `Swap failed with status=${statusResponse.status} — ` +
      `correlationId=${statusResponse.correlationId}`,
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifies that STRK→Solana USDC liquidity is live by requesting a dry-run
 * quote. Returns the quote response on success, or throws if the pair is
 * not available.
 *
 * Call this at integration time (not at build time) to confirm the route
 * the issue requires us to verify.
 */
export async function verifyLiquidity(): Promise<OneClickQuoteResponse> {
  // Use a small representative amount that meets the minimum bridge requirements: 10 STRK (10^19 smallest units).
  const quote = await requestQuote({
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: STARKNET_STRK_ASSET_ID,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: getDestinationAssetId(),
    amount: "10000000000000000000", // 10 STRK
    recipient: "11111111111111111111111111111111", // Solana system program — placeholder for dry run
    recipientType: "DESTINATION_CHAIN",
    refundTo: "0x0000000000000000000000000000000000000000000000000000000000000001",
    refundType: "ORIGIN_CHAIN",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  });

  console.log(
    `verifyLiquidity: STRK→Solana USDC route is live — ` +
      `1 STRK ≈ ${quote.quote.amountOutFormatted} USDC ($${quote.quote.amountOutUsd})`,
  );
  return quote;
}
