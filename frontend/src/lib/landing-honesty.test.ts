import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CLAUDE.md §4 rule 6: do not overclaim what works.
 *
 * A landing page is where overclaiming is cheapest and most tempting — it is
 * marketing copy next to two buttons that look like they do the thing. The
 * riskiest edit is not adding a false claim but *deleting* the caveat, which no
 * other test would notice.
 *
 * So the disclosure is pinned. If submission becomes real, this test should be
 * deleted in the same commit that wires it — that is the point: removing the
 * caveat has to be a deliberate act, not a tidy-up.
 */
const appDir = join(import.meta.dirname, "..", "app");
const landing = readFileSync(join(appDir, "page.tsx"), "utf8");

describe("the landing page states what is not wired", () => {
  it("says a run cannot be submitted from the site", () => {
    expect(landing).toMatch(/cannot submit a run from this site/i);
  });

  it("names the actual reason rather than calling it 'coming soon'", () => {
    expect(landing).toMatch(/privacy_invoke/);
    expect(landing).toMatch(/proving service/i);
    expect(landing).not.toMatch(/coming soon|launching soon/i);
  });

  it("does not claim the cross-chain legs are exercised end to end", () => {
    expect(landing).toMatch(/not yet exercised end to end/i);
  });

  /**
   * The four "what the chain can prove" claims are the ones a reader will trust
   * most, so each must correspond to a Cairo test that goes red without it.
   * Named here so that deleting a contract invariant and leaving the copy up
   * shows as a broken reference rather than a quiet lie.
   */
  it("only claims properties the contract suite actually proves", () => {
    const cairoTests = readFileSync(
      join(import.meta.dirname, "..", "..", "..", "contracts", "payroll", "src", "tests.cairo"),
      "utf8",
    );
    for (const test of [
      "test_underfunding_the_last_commitment_reverts",
      "test_omitted_recipient_can_never_be_marked_complete",
      "test_same_approver_twice_does_not_satisfy_quorum",
      "test_two_distinct_approvers_unlock_funding",
    ]) {
      expect(cairoTests).toContain(test);
    }
  });
});
