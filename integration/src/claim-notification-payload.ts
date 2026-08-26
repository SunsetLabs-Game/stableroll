/**
 * Payload shape sent over Waku after FundCommitment. Kept SDK-free and
 * notify-import-free so the tokenless suite can pin it. Structurally
 * identical to notify/src/send-claim-notification.ts ClaimNotificationPayload.
 */
export function buildClaimNotificationPayload(params: {
  runId: bigint;
  commitmentHash: bigint;
  secret: bigint;
  token: string;
  amount: bigint;
}): {
  runId: string;
  commitmentHash: string;
  secret: string;
  token: string;
  amount: string;
} {
  return {
    runId: params.runId.toString(),
    commitmentHash: params.commitmentHash.toString(),
    secret: params.secret.toString(),
    token: params.token,
    amount: params.amount.toString(),
  };
}
