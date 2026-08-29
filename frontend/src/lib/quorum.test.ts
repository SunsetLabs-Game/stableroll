import { describe, it, expect } from "vitest";
import {
  REQUIRED_APPROVALS,
  addApproval,
  approvalMessage,
  distinctApprovers,
  fundingBlockedReason,
  hasQuorum,
  isValidApproval,
  normalizeAddress,
  type Approval,
} from "./quorum.js";

const RUN = "0x2a";
const OTHER_RUN = "0x2b";
const ALICE = "0x0153d52526e9a100367dbfa9f71f404424a8212a2ba74a2b82df93943bd58381";
const BOB = "0x044b5d46090d34321729e253aea555b10de5f0ae81ff38fce0081048902110b9";

function approval(approver: string, runId = RUN, overrides: Partial<Approval> = {}): Approval {
  return {
    approver,
    message: approvalMessage(runId),
    signature: "0xsig",
    signedAt: 1,
    ...overrides,
  };
}

describe("acceptance: the same approver approving twice does not reach quorum", () => {
  it("counts one identity when the same address approves twice", () => {
    const approvals = [approval(ALICE), approval(ALICE, RUN, { signedAt: 2 })];
    expect(distinctApprovers(approvals, RUN)).toEqual([normalizeAddress(ALICE)]);
    expect(hasQuorum(approvals, RUN)).toBe(false);
  });

  it("is not fooled by re-padding the same address", () => {
    // The attack this guards: 0x0153… and 0x153… are the same account, and a
    // string comparison would count them as two approvers.
    const unpadded = "0x" + BigInt(ALICE).toString(16);
    expect(unpadded).not.toBe(ALICE);
    const approvals = [approval(ALICE), approval(unpadded)];
    expect(distinctApprovers(approvals, RUN)).toHaveLength(1);
    expect(hasQuorum(approvals, RUN)).toBe(false);
  });

  it("says explicitly that repeats were discarded", () => {
    const reason = fundingBlockedReason([approval(ALICE), approval(ALICE)], RUN);
    expect(reason).toContain("1 of 2");
    expect(reason).toContain("repeats by the same approver do not count");
  });

  it("keeps the list a set even when the caller re-adds an approver", () => {
    let approvals: Approval[] = [];
    approvals = addApproval(approvals, approval(ALICE));
    approvals = addApproval(approvals, approval(ALICE, RUN, { signedAt: 99 }));
    expect(approvals).toHaveLength(1);
    expect(approvals[0].signedAt).toBe(99);
    expect(hasQuorum(approvals, RUN)).toBe(false);
  });
});

describe("acceptance: funding is impossible until quorum is reached", () => {
  it("blocks with zero approvals", () => {
    expect(fundingBlockedReason([], RUN)).toContain("0 of 2");
    expect(hasQuorum([], RUN)).toBe(false);
  });

  it("blocks with one approver", () => {
    expect(fundingBlockedReason([approval(ALICE)], RUN)).toContain("1 of 2");
  });

  it("permits only once two distinct approvers have signed", () => {
    const approvals = [approval(ALICE), approval(BOB)];
    expect(distinctApprovers(approvals, RUN)).toHaveLength(2);
    expect(hasQuorum(approvals, RUN)).toBe(true);
    expect(fundingBlockedReason(approvals, RUN)).toBeNull();
  });

  it("requires exactly the number of approvers the gate advertises", () => {
    expect(REQUIRED_APPROVALS).toBe(2);
  });
});

describe("approvals are bound to one run", () => {
  it("rejects an approval signed for a different run", () => {
    // Without this, two approvals gathered for a cheap run could be replayed to
    // fund an expensive one.
    const replayed = approval(BOB, OTHER_RUN);
    expect(isValidApproval(replayed, RUN)).toBe(false);
    expect(hasQuorum([approval(ALICE), replayed], RUN)).toBe(false);
  });

  it("names the run in the signed message", () => {
    expect(approvalMessage(RUN)).toContain("0x2a");
    expect(approvalMessage(RUN)).not.toBe(approvalMessage(OTHER_RUN));
  });

  it("treats differently formatted run ids as the same run", () => {
    expect(approvalMessage("0x2a")).toBe(approvalMessage("0x02a"));
  });
});

describe("malformed approvals are discarded, not counted", () => {
  it("rejects an approval with no signature", () => {
    expect(isValidApproval(approval(ALICE, RUN, { signature: "" }), RUN)).toBe(false);
    expect(hasQuorum([approval(ALICE, RUN, { signature: "" }), approval(BOB)], RUN)).toBe(false);
  });

  it("rejects an approval with no approver address", () => {
    expect(isValidApproval(approval("", RUN), RUN)).toBe(false);
  });

  it("rejects a tampered message", () => {
    const tampered = approval(BOB, RUN, { message: "StableRoll: approve everything" });
    expect(isValidApproval(tampered, RUN)).toBe(false);
    expect(hasQuorum([approval(ALICE), tampered], RUN)).toBe(false);
  });

  it("collapses non-felt approver strings to one identity rather than counting twice", () => {
    const approvals = [approval("  Alice  "), approval("alice")];
    expect(distinctApprovers(approvals, RUN)).toHaveLength(1);
  });
});
