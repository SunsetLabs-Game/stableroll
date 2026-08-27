import { describe, it, expect } from "vitest";
import {
  MAINNET_POOL_ADDRESS,
  REQUIRED_TRANSACTION_COUNT,
  countUsableTransactions,
  feltEquals,
  isWellFormedTxHash,
  loadManifest,
  meetsTransactionFloor,
  validateManifestShape,
  voyagerTxUrl,
  type Strk20Manifest,
} from "./mainnet-eligibility.js";

const VALID_A = "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809";
const VALID_B = "0x0bcd00112233445566778899aabbccddeeff00112233445566778899aabbccdd";
const VALID_C = "0xdeadbeef";

function manifest(overrides: Partial<Strk20Manifest> = {}): Strk20Manifest {
  return {
    transactions: [],
    contracts: [],
    demo_video: "",
    demo_url: "",
    ...overrides,
  };
}

describe("tx hash well-formedness", () => {
  it("accepts felt-shaped non-zero hex", () => {
    expect(isWellFormedTxHash(VALID_A)).toBe(true);
    expect(isWellFormedTxHash(VALID_C)).toBe(true);
  });

  it("rejects the shapes a copy-paste mistake actually produces", () => {
    expect(isWellFormedTxHash("")).toBe(false);
    expect(isWellFormedTxHash("0x")).toBe(false);
    // Zero is what an unfilled placeholder looks like — it must not count.
    expect(isWellFormedTxHash("0x0")).toBe(false);
    // Missing 0x prefix.
    expect(isWellFormedTxHash("deadbeef")).toBe(false);
    // Non-hex characters (a truncated Voyager URL pasted by mistake).
    expect(isWellFormedTxHash("0xzzzz")).toBe(false);
    // Longer than a felt252.
    expect(isWellFormedTxHash("0x" + "1".repeat(65))).toBe(false);
    expect(isWellFormedTxHash(null)).toBe(false);
    expect(isWellFormedTxHash(42)).toBe(false);
  });
});

describe("felt comparison ignores zero-padding", () => {
  it("treats differently padded forms of one address as equal", () => {
    expect(feltEquals("0x040337b1", "0x40337b1")).toBe(true);
    expect(feltEquals(MAINNET_POOL_ADDRESS, MAINNET_POOL_ADDRESS.replace("0x0", "0x"))).toBe(true);
  });

  it("still separates genuinely different addresses", () => {
    expect(feltEquals("0x1", "0x2")).toBe(false);
  });

  it("returns false rather than throwing on garbage", () => {
    expect(feltEquals("not-a-felt", "0x1")).toBe(false);
  });
});

describe("manifest shape validation", () => {
  it("passes a well-formed manifest", () => {
    expect(validateManifestShape(manifest({ transactions: [VALID_A, VALID_B] }))).toEqual([]);
  });

  it("flags a malformed hash, naming the index", () => {
    const problems = validateManifestShape(manifest({ transactions: [VALID_A, "0x0"] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].field).toBe("transactions[1]");
  });

  it("flags a duplicate hash even when padded differently", () => {
    // This is the gate's whole point: three entries, but only one real
    // interaction with the pool. Without the numeric comparison the padded
    // form would slip through as a distinct transaction.
    const problems = validateManifestShape(
      manifest({ transactions: [VALID_C, "0x0deadbeef", VALID_A] }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].field).toBe("transactions[1]");
    expect(problems[0].message).toContain("duplicate");
  });

  it("flags missing top-level fields", () => {
    const fields = validateManifestShape({ transactions: [] }).map((p) => p.field);
    expect(fields).toContain("contracts");
    expect(fields).toContain("demo_video");
    expect(fields).toContain("demo_url");
  });

  it("does not throw on a non-object", () => {
    expect(validateManifestShape(null)[0].field).toBe("<root>");
    expect(validateManifestShape("nope")[0].field).toBe("<root>");
  });
});

describe("the eligibility floor", () => {
  it("counts distinct usable hashes, not array length", () => {
    expect(countUsableTransactions(manifest({ transactions: [] }))).toBe(0);
    expect(countUsableTransactions(manifest({ transactions: [VALID_A, "0x0"] }))).toBe(1);
    expect(
      countUsableTransactions(manifest({ transactions: [VALID_C, "0x0deadbeef"] })),
    ).toBe(1);
  });

  it("is not met by padding one transaction out to three entries", () => {
    expect(
      meetsTransactionFloor(
        manifest({ transactions: [VALID_C, "0x0deadbeef", "0x00deadbeef"] }),
      ),
    ).toBe(false);
  });

  it("is met by three genuinely distinct hashes", () => {
    expect(meetsTransactionFloor(manifest({ transactions: [VALID_A, VALID_B, VALID_C] }))).toBe(
      true,
    );
  });

  it("requires exactly the count the sprint asks for", () => {
    expect(REQUIRED_TRANSACTION_COUNT).toBe(3);
  });
});

describe("voyager links", () => {
  it("builds a mainnet tx url", () => {
    expect(voyagerTxUrl(VALID_C)).toBe(`https://voyager.online/tx/${VALID_C}`);
  });
});

describe("the repo's committed strk20.json", () => {
  // Deliberately NOT asserting the eligibility floor here: CLAUDE.md §4 rule 8
  // requires the tokenless suite to stay green on a clean checkout, and the
  // floor is legitimately unmet until the mainnet transactions are banked.
  // `npm run verify:eligibility` is the gate that goes red for that; this test
  // only guarantees that whatever IS recorded is well-formed, so a typo in a
  // hash is caught the moment it lands rather than at submission time.
  it("is structurally valid", () => {
    expect(validateManifestShape(loadManifest())).toEqual([]);
  });
});
