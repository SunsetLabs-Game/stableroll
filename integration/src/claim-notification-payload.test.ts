import { describe, it, expect } from "vitest";
import { buildClaimNotificationPayload } from "./claim-notification-payload.js";

describe("buildClaimNotificationPayload", () => {
  it("emits exactly ClaimNotificationPayload's five fields and no identity extras", () => {
    const payload = buildClaimNotificationPayload({
      runId: 10n,
      commitmentHash: 20n,
      secret: 30n,
      token: "0xabc",
      amount: 100n,
    });
    expect(payload).toEqual({
      runId: "10",
      commitmentHash: "20",
      secret: "30",
      token: "0xabc",
      amount: "100",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["amount", "commitmentHash", "runId", "secret", "token"].sort(),
    );
    expect(payload).not.toHaveProperty("payer");
    expect(payload).not.toHaveProperty("address");
    expect(payload).not.toHaveProperty("recipient");
  });
});
