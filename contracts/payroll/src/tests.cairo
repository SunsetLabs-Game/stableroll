use payroll::payroll::{
    IPayrollDispatcher, IPayrollDispatcherTrait, IPayrollSafeDispatcher,
    IPayrollSafeDispatcherTrait, Payroll, PayrollOperation, RunInfo, compute_approver_commitment,
    compute_commitment_hash, compute_run_id, compute_run_owner_commitment,
};
use privacy::objects::OpenNoteDeposit;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, EventSpyTrait, declare,
    spy_events, start_cheat_caller_address, start_mock_call,
};
use starknet::ContractAddress;

const PRIVACY: felt252 = 0x123;
const TOKEN: felt252 = 0x456;
const OTHER_TOKEN: felt252 = 0x789;

fn deploy_payroll(privacy_contract: ContractAddress) -> IPayrollDispatcher {
    let contract = declare("Payroll").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![privacy_contract.into()];
    let (address, _) = contract.deploy(@calldata).unwrap();
    IPayrollDispatcher { contract_address: address }
}

/// Deploys, impersonates the privacy pool (the only permitted caller), and
/// mocks the token's `approve` so Claim's IERC20 call succeeds without a live
/// ERC20 deployed at the test token address.
fn setup() -> (IPayrollDispatcher, ContractAddress) {
    let privacy_addr: ContractAddress = PRIVACY.try_into().unwrap();
    let token: ContractAddress = TOKEN.try_into().unwrap();
    let dispatcher = deploy_payroll(privacy_addr);
    start_cheat_caller_address(dispatcher.contract_address, privacy_addr);
    start_mock_call(token, selector!("approve"), true);
    (dispatcher, token)
}

/// The suite's standard approver pair. Distinct short strings, so their
/// commitments are distinct too — which is what `OpenRun` requires.
const APPROVER_A: felt252 = 'APPROVER-A';
const APPROVER_B: felt252 = 'APPROVER-B';

/// One approver revealing their secret. `ApproveRun` reads only `run_id` and
/// `secret`; the other parameters are passed for calldata-shape parity with the
/// other operations.
fn approve(
    dispatcher: IPayrollDispatcher,
    token: ContractAddress,
    run_id: felt252,
    approver_secret: felt252,
) {
    dispatcher
        .privacy_invoke(PayrollOperation::ApproveRun, run_id, 0, token, 0, 0, approver_secret, 0);
}

/// Opens a run with the standard approver pair and collects both approvals, so
/// the run is immediately fundable.
///
/// Since issue #31 a fundable run takes three calls rather than one. Inlining
/// that at every call site would bury what each test is actually asserting, so
/// the tests that merely *need* a working run call this, and the tests that are
/// about `OpenRun` or the quorum itself still spell the calls out.
fn open_approved_run(
    dispatcher: IPayrollDispatcher,
    token: ContractAddress,
    owner_secret: felt252,
    expected_total: u128,
    expected_count: u32,
) {
    let run_id = compute_run_id(owner_secret);
    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            expected_total,
            expected_count,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );
    approve(dispatcher, token, run_id, APPROVER_A);
    approve(dispatcher, token, run_id, APPROVER_B);
}

#[test]
fn test_fund_commitment_increments_run_totals() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-1';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-A'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );

    let run: RunInfo = dispatcher.get_run(run_id);
    assert(run.expected_count == 2, 'expected_count');
    assert(run.funded_count == 1, 'funded_count');
    assert(run.paid_count == 0, 'paid_count');
    assert(run.total_committed == 100_u128, 'total_committed');
    assert(run.total_paid == 0_u128, 'total_paid');
    assert(run.expected_total == 150_u128, 'expected_total');
    assert(!run.closed, 'not closed while underfunded');
}

#[test]
fn test_run_incomplete_until_all_commitments_claimed() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-2';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);

    // FundCommitment's commitment_hash must equal compute_commitment_hash(secret): the payer
    // computes the hash off-chain from a secret it will later share with the recipient, and
    // Claim recomputes the same hash from the revealed secret to look up the entry.
    let hash_a = compute_commitment_hash('SECRET-A');
    let hash_b = compute_commitment_hash('SECRET-B');

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_a, token, 100_u128, 0, owner_secret, 0,
        );
    assert(!dispatcher.is_complete(run_id), 'incomplete: partially funded');

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_b, token, 50_u128, 0, owner_secret, 0,
        );
    assert(dispatcher.get_run(run_id).closed, 'closed once fully funded');
    assert(!dispatcher.is_complete(run_id), 'incomplete: 0 claims');

    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-A', 'NOTE-A');
    assert(!dispatcher.is_complete(run_id), 'incomplete: 1 of 2');

    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-B', 'NOTE-B');
    assert(dispatcher.is_complete(run_id), 'complete: 2 of 2');
}

/// The completeness property the design spec exists to prove: a payer who
/// simply never funds one of the recipients they promised can NEVER get
/// is_complete to return true, even after every commitment they *did* fund is
/// claimed. Without this, "cryptographic proof of completeness" is a README
/// claim rather than a tested property.
#[test]
fn test_omitted_recipient_can_never_be_marked_complete() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-OMIT';
    let run_id = compute_run_id(owner_secret);

    // Promises 2 recipients / 150 total, but only ever funds one of them.
    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-ONLY'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );

    // The one funded recipient claims in full.
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-ONLY', 'NOTE-1');

    let run = dispatcher.get_run(run_id);
    assert(run.paid_count == 1, 'one paid');
    assert(run.total_paid == run.total_committed, 'all committed funds claimed');
    // Every *funded* commitment is claimed, yet the run is still provably
    // incomplete, because the second promised recipient was never funded.
    assert(!run.closed, 'run never closed');
    assert(!dispatcher.is_complete(run_id), 'omission must stay incomplete');
}

/// The other half of the property: a payer cannot short a recipient. The final
/// commitment must land the run exactly on the budget it promised at OpenRun.
#[test]
#[should_panic(expected: 'UNDER_COMMITTED')]
fn test_underfunding_the_last_commitment_reverts() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-SHORT';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-A'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
    // Promised 150 across 2 recipients; this pays the second only 40.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-B'),
            token,
            40_u128,
            0,
            owner_secret,
            0,
        );
}

/// Once a run is fully funded it closes, and no extra recipient can be
/// appended to it — the promised headcount is fixed at OpenRun.
#[test]
#[should_panic(expected: 'RUN_CLOSED')]
fn test_cannot_fund_more_recipients_than_promised() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-EXTRA';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 150_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-A'),
            token,
            150_u128,
            0,
            owner_secret,
            0,
        );
    // Run is now closed at 1/1; a second commitment must not slip in.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-B'),
            token,
            1_u128,
            0,
            owner_secret,
            0,
        );
}

#[test]
#[should_panic(expected: 'TOKEN_MISMATCH')]
fn test_commitment_token_must_match_the_run() {
    let (dispatcher, token) = setup();
    let other: ContractAddress = OTHER_TOKEN.try_into().unwrap();
    let owner_secret: felt252 = 'OWNER-TOK';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);
    // Would otherwise sum two different tokens' amounts into one total.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-A'),
            other,
            100_u128,
            0,
            owner_secret,
            0,
        );
}

#[test]
#[should_panic(expected: 'ZERO_EXPECTED_COUNT')]
fn test_open_run_rejects_zero_expected_count() {
    let (dispatcher, token) = setup();
    // expected_count == 0 is how "run does not exist" is encoded, so a run
    // opened with 0 would be silently unusable rather than loudly rejected.
    dispatcher
        .privacy_invoke(PayrollOperation::OpenRun, 'RUN-Z1', 0, token, 150_u128, 0, 'OWNER-Z1', 0);
}

#[test]
#[should_panic(expected: 'ZERO_EXPECTED_TOTAL')]
fn test_open_run_rejects_zero_expected_total() {
    let (dispatcher, token) = setup();
    dispatcher
        .privacy_invoke(PayrollOperation::OpenRun, 'RUN-Z2', 0, token, 0_u128, 2, 'OWNER-Z2', 0);
}

/// Attack 1 from the tracker issue: an attacker who guesses/learns a run_id
/// the payer intends to use cannot pre-open it, because OpenRun requires
/// run_id == compute_run_id(secret) — producing a valid call for a *chosen*
/// run_id requires knowing a secret that hashes to it, which the attacker does
/// not have.
#[test]
#[should_panic(expected: 'RUN_ID_MISMATCH')]
fn test_open_run_rejects_run_id_not_derived_from_secret() {
    let (dispatcher, token) = setup();
    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun, 'SQUATTED-RUN', 0, token, 100_u128, 1, 'ANY-SECRET', 0,
        );
}

#[test]
#[should_panic(expected: 'ZERO_OWNER_SECRET')]
fn test_open_run_rejects_zero_owner_secret() {
    let (dispatcher, token) = setup();
    dispatcher.privacy_invoke(PayrollOperation::OpenRun, 'RUN-Z3', 0, token, 100_u128, 1, 0, 0);
}

/// Attack 2 from the tracker issue: a third party who does not know the run's
/// owner_secret cannot fund into an existing run, even with a commitment only
/// they know the secret to.
#[test]
#[should_panic(expected: 'NOT_RUN_OWNER')]
fn test_fund_commitment_rejects_third_party_without_owner_secret() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-GRIEF';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    // The griefer knows the secret behind their own commitment_hash, but not
    // the run's owner_secret.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('GRIEFER-SECRET'),
            token,
            100_u128,
            0,
            'WRONG-OWNER-SECRET',
            0,
        );
}

#[test]
#[should_panic(expected: 'ALREADY_CLAIMED')]
fn test_double_claim_reverts() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-3';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);

    let hash_c = compute_commitment_hash('SECRET-C');
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_c, token, 100_u128, 0, owner_secret, 0,
        );
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-C', 'NOTE-C');
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-C', 'NOTE-C2');
}

#[test]
#[should_panic(expected: 'COMMITMENT_NOT_FOUND')]
fn test_claim_with_unknown_secret_reverts() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-4';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-D'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
    dispatcher.privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'WRONG', 'NOTE-D');
}

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn test_direct_caller_is_rejected() {
    let privacy_addr: ContractAddress = PRIVACY.try_into().unwrap();
    let token: ContractAddress = TOKEN.try_into().unwrap();
    let dispatcher = deploy_payroll(privacy_addr);
    // No caller cheat: the test account, not the pool, is the caller. Only the
    // privacy pool may drive privacy_invoke.
    dispatcher.privacy_invoke(PayrollOperation::OpenRun, 'RUN-5', 0, token, 100_u128, 1, 0, 0);
}

/// Pins the exact felt252 `compute_commitment_hash` produces for a fixed
/// secret. `integration/src/config.ts`'s `computeCommitmentHash` asserts the
/// SAME literal in `integration/src/commitment-parity.test.ts`. If either side's
/// domain tag, operand encoding, or hash function drifts, one of the two tests
/// fails loudly — instead of the drift surfacing as commitments that are funded
/// on-chain but permanently unclaimable (Claim reverting COMMITMENT_NOT_FOUND).
#[test]
fn test_commitment_hash_matches_typescript() {
    let expected: felt252 =
        2916571549562949959572444329737062239145273904095529778681389446543678977274;
    assert(compute_commitment_hash('SECRET-A') == expected, 'TS/Cairo hash drift');
}

/// Same pairing as `test_commitment_hash_matches_typescript`, for the two
/// run-ownership hashes. The TypeScript suite asserts the same OWNER-1
/// literals in `integration/src/commitment-parity.test.ts`. Drift here makes
/// OpenRun revert RUN_ID_MISMATCH or FundCommitment revert NOT_RUN_OWNER.
#[test]
fn test_run_id_hash_matches_typescript() {
    let expected: felt252 =
        1155664066368691955274112831219001117446171185908481296176988237071824193606;
    assert(compute_run_id('OWNER-1') == expected, 'TS/Cairo run_id drift');
}

#[test]
fn test_run_owner_commitment_hash_matches_typescript() {
    let expected: felt252 =
        1457531891617558283633604771381914416639085145906137038567439060842776331852;
    assert(
        compute_run_owner_commitment('OWNER-1') == expected, 'TS/Cairo owner hash drift',
    );
}

#[test]
#[should_panic(expected: 'RUN_EXISTS')]
fn test_open_run_rejects_run_id_opened_twice() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-DUPRUN';

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    // Same run_id, same owner_secret: expected_count is already non-zero, so
    // this must be rejected rather than silently overwriting the run.
    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
}

#[test]
#[should_panic(expected: 'RUN_NOT_FOUND')]
fn test_fund_commitment_rejects_run_that_was_never_opened() {
    let (dispatcher, token) = setup();
    // No OpenRun for this run_id: expected_count reads back 0.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            'NEVER-OPENED',
            compute_commitment_hash('SECRET-NOPE'),
            token,
            100_u128,
            0,
            'ANY-SECRET',
            0,
        );
}

#[test]
#[should_panic(expected: 'COMMITMENT_EXISTS')]
fn test_fund_commitment_rejects_the_same_hash_twice() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-DUPHASH';
    let run_id = compute_run_id(owner_secret);
    let hash_a = compute_commitment_hash('SECRET-DUPHASH');

    open_approved_run(dispatcher, token, owner_secret, 200_u128, 2);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_a, token, 100_u128, 0, owner_secret, 0,
        );
    // Same commitment_hash again: the entry already has a non-zero token, so a
    // second funding of it must not be allowed to double the recipient's payout.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_a, token, 50_u128, 0, owner_secret, 0,
        );
}

#[test]
#[should_panic(expected: 'OVER_COMMITTED')]
fn test_fund_commitment_rejects_amount_over_expected_total() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-OVER';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    // Promised 100 total; this single commitment alone claims 150.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-OVER'),
            token,
            150_u128,
            0,
            owner_secret,
            0,
        );
}

#[test]
#[should_panic(expected: 'ZERO_TOKEN')]
fn test_open_run_rejects_zero_token() {
    let (dispatcher, _token) = setup();
    let owner_secret: felt252 = 'OWNER-ZTOK';
    let run_id = compute_run_id(owner_secret);
    let zero_token: ContractAddress = 0.try_into().unwrap();

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun, run_id, 0, zero_token, 100_u128, 1, owner_secret, 0,
        );
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn test_fund_commitment_rejects_zero_amount() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-ZAMT';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-ZAMT'),
            token,
            0_u128,
            0,
            owner_secret,
            0,
        );
}

#[test]
#[should_panic(expected: 'ZERO_COMMITMENT_HASH')]
fn test_fund_commitment_rejects_zero_commitment_hash() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-ZHASH';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, 0, token, 100_u128, 0, owner_secret, 0,
        );
}

/// Guards against the silent-failure shape in CLAUDE.md §3: if Claim ever
/// returned the wrong note_id, token, or amount, the recipient's note would be
/// minted with the wrong value and every other test would stay green. This
/// pins the full returned struct, so mutating any one field (e.g. returning
/// `entry.amount` as 0) turns this test red.
#[test]
fn test_claim_returns_the_commitments_real_deposit() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-RETVAL';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-RETVAL'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
    let deposits = dispatcher
        .privacy_invoke(
            PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-RETVAL', 'NOTE-RETVAL',
        );

    assert(deposits.len() == 1, 'exactly one deposit');
    assert(
        *deposits.at(0) == OpenNoteDeposit { note_id: 'NOTE-RETVAL', token, amount: 100_u128 },
        'deposit must match commitment',
    );
}

// ---------------------------------------------------------------------------
// Dual-approval quorum (issue #31)
//
// `frontend/src/lib/quorum.ts` binds the UI; these bind the chain. Every test
// below goes red if the quorum is removed from `Payroll`, which is the point of
// moving it here.
// ---------------------------------------------------------------------------

/// Parity pin, same pattern as the commitment and run-ownership hashes.
/// `integration/src/commitment-parity.test.ts` asserts this identical literal
/// for `computeApproverCommitment("APPROVER-1")`. Drift makes `ApproveRun`
/// revert NOT_APPROVER for an approver who is in fact registered.
#[test]
fn test_approver_commitment_hash_matches_typescript() {
    let expected: felt252 =
        2727062285932658029016924568603133935256695660341735614525950280572049281991;
    assert(compute_approver_commitment('APPROVER-1') == expected, 'TS/Cairo approver drift');
}

/// Each role gets its own domain tag, so one secret reused across roles produces
/// four unrelated values. Without this, an approver commitment could be
/// satisfied by a value already public on-chain as a run_id.
#[test]
fn test_approver_commitment_has_its_own_domain() {
    let s: felt252 = 'APPROVER-1';
    assert(compute_approver_commitment(s) != compute_run_id(s), 'collides with run_id');
    assert(compute_approver_commitment(s) != compute_run_owner_commitment(s), 'collides w/ owner');
    assert(compute_approver_commitment(s) != compute_commitment_hash(s), 'collides w/ commitment');
}

/// The gate itself: an unapproved run cannot be funded, however legitimate the
/// payer. This is the test that goes red if the quorum is deleted.
#[test]
#[should_panic(expected: 'QUORUM_NOT_MET')]
fn test_fund_commitment_requires_approvals() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q1';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    // The payer proves run ownership correctly and is still refused: owning a
    // run is not approving it.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-Q1'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
}

/// One approver is not a quorum.
#[test]
#[should_panic(expected: 'QUORUM_NOT_MET')]
fn test_fund_commitment_requires_the_second_approver() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q2';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );
    approve(dispatcher, token, run_id, APPROVER_A);

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-Q2'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
}

/// The acceptance criterion named in issue #31: one approver revealing the same
/// secret twice must not pass the gate. It cannot, structurally — `ApproveRun`
/// advances at most one flag per call, and a given secret always matches the
/// same slot, so re-revealing it only rewrites the flag it already set.
#[test]
#[should_panic(expected: 'QUORUM_NOT_MET')]
fn test_same_approver_twice_does_not_satisfy_quorum() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q3';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    // Both calls succeed — approving is idempotent — but they are one identity
    // and must count once.
    approve(dispatcher, token, run_id, APPROVER_A);
    approve(dispatcher, token, run_id, APPROVER_A);

    let run: RunInfo = dispatcher.get_run(run_id);
    assert(run.approved_a, 'A recorded');
    assert(!run.approved_b, 'B still missing');

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-Q3'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
}

/// The positive half: two distinct approvers unlock funding, and what the run
/// stores is a commitment hash — never an address (CLAUDE.md §6).
#[test]
fn test_two_distinct_approvers_unlock_funding() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q4';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    let opened: RunInfo = dispatcher.get_run(run_id);
    assert(!opened.approved_a, 'A unapproved at OpenRun');
    assert(!opened.approved_b, 'B unapproved at OpenRun');
    assert(opened.approver_a_commitment == compute_approver_commitment(APPROVER_A), 'A commitment');
    assert(opened.approver_b_commitment == compute_approver_commitment(APPROVER_B), 'B commitment');

    approve(dispatcher, token, run_id, APPROVER_A);
    approve(dispatcher, token, run_id, APPROVER_B);

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-Q4'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );

    let run: RunInfo = dispatcher.get_run(run_id);
    assert(run.approved_a && run.approved_b, 'quorum recorded');
    assert(run.funded_count == 1, 'funded after quorum');
    assert(run.closed, 'closed on final commitment');
}

/// Acceptance criterion: a run missing its second approver can never reach
/// `is_complete`. It cannot even be funded, so `funded_count` never leaves zero
/// and `closed` never becomes true — asserted here after the revert rather than
/// inferred from it.
#[test]
#[feature("safe_dispatcher")]
fn test_run_without_second_approver_can_never_be_complete() {
    let (dispatcher, token) = setup();
    let safe = IPayrollSafeDispatcher { contract_address: dispatcher.contract_address };
    let owner_secret: felt252 = 'OWNER-Q5';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );
    approve(dispatcher, token, run_id, APPROVER_A);

    match safe
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-Q5'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        ) {
        Result::Ok(_) => assert(false, 'must not fund on 1 approval'),
        Result::Err(reason) => assert(*reason.at(0) == 'QUORUM_NOT_MET', 'wrong revert reason'),
    }

    let run: RunInfo = dispatcher.get_run(run_id);
    assert(run.funded_count == 0, 'nothing funded');
    assert(run.total_committed == 0_u128, 'nothing committed');
    assert(!run.closed, 'run never closed');
    assert(!dispatcher.is_complete(run_id), 'never complete');
}

/// Two identical approver commitments are one approver written twice. Allowing
/// them would let a payer satisfy the quorum alone with a single secret.
#[test]
#[should_panic(expected: 'APPROVERS_NOT_DISTINCT')]
fn test_open_run_rejects_identical_approver_commitments() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q6';
    let same = compute_approver_commitment(APPROVER_A);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            compute_run_id(owner_secret),
            same,
            token,
            100_u128,
            1,
            owner_secret,
            same,
        );
}

#[test]
#[should_panic(expected: 'ZERO_APPROVER_COMMITMENT')]
fn test_open_run_rejects_missing_first_approver() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q7';

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            compute_run_id(owner_secret),
            0,
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );
}

#[test]
#[should_panic(expected: 'ZERO_APPROVER_COMMITMENT')]
fn test_open_run_rejects_missing_second_approver() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q8';

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            compute_run_id(owner_secret),
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            0,
        );
}

/// Anyone may call `ApproveRun`, but only a registered approver's secret
/// advances the quorum.
#[test]
#[should_panic(expected: 'NOT_APPROVER')]
fn test_approve_run_rejects_an_unregistered_approver() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q9';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    approve(dispatcher, token, run_id, 'APPROVER-INTRUDER');
}

/// The run's own owner_secret is not an approval: it hashes into a different
/// domain, so the payer cannot stand in for one of their own approvers.
#[test]
#[should_panic(expected: 'NOT_APPROVER')]
fn test_owner_secret_is_not_an_approval() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q10';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    approve(dispatcher, token, run_id, owner_secret);
}

#[test]
#[should_panic(expected: 'ZERO_APPROVER_SECRET')]
fn test_approve_run_rejects_zero_secret() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q11';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    approve(dispatcher, token, run_id, 0);
}

#[test]
#[should_panic(expected: 'RUN_NOT_FOUND')]
fn test_approve_run_rejects_a_run_that_was_never_opened() {
    let (dispatcher, token) = setup();
    approve(dispatcher, token, compute_run_id('OWNER-Q12'), APPROVER_A);
}

/// A closed run is already fully funded; approving it would record consent
/// after the fact.
#[test]
#[should_panic(expected: 'RUN_CLOSED')]
fn test_approve_run_rejects_a_closed_run() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-Q13';
    let run_id = compute_run_id(owner_secret);

    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-Q13'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );
    assert(dispatcher.get_run(run_id).closed, 'run is closed');

    approve(dispatcher, token, run_id, APPROVER_A);
}

// ---------------------------------------------------------------------------
// Events (issue #33)
//
// Before these, everything off-chain had to poll storage: notify/ fired the
// Waku message from the TypeScript caller rather than from anything the chain
// announced, so a commitment funded by any other path notified nobody.
//
// The privacy bar is that no event field exposes anything `get_run` /
// `get_commitment` does not already expose. `test_claim_event_carries_no_note_id`
// pins the one place that could regress.
// ---------------------------------------------------------------------------

#[test]
fn test_open_run_emits_run_opened() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E1';
    let run_id = compute_run_id(owner_secret);
    let mut spy = spy_events();

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            150_u128,
            2,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    spy
        .assert_emitted(
            @array![
                (
                    dispatcher.contract_address,
                    Payroll::Event::RunOpened(
                        Payroll::RunOpened {
                            run_id, token, expected_count: 2, expected_total: 150_u128,
                        },
                    ),
                ),
            ],
        );
}

/// Each approval announces the quorum's progress, so an off-chain watcher knows
/// funding is unblocked without reading `RunInfo`.
#[test]
fn test_approve_run_emits_the_quorum_progressing() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E2';
    let run_id = compute_run_id(owner_secret);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            compute_approver_commitment(APPROVER_A),
            token,
            100_u128,
            1,
            owner_secret,
            compute_approver_commitment(APPROVER_B),
        );

    let mut spy = spy_events();
    approve(dispatcher, token, run_id, APPROVER_A);
    approve(dispatcher, token, run_id, APPROVER_B);

    spy
        .assert_emitted(
            @array![
                (
                    dispatcher.contract_address,
                    Payroll::Event::RunApproved(
                        Payroll::RunApproved {
                            run_id,
                            approver_commitment: compute_approver_commitment(APPROVER_A),
                            approved_a: true,
                            approved_b: false,
                        },
                    ),
                ),
                (
                    dispatcher.contract_address,
                    Payroll::Event::RunApproved(
                        Payroll::RunApproved {
                            run_id,
                            approver_commitment: compute_approver_commitment(APPROVER_B),
                            approved_a: true,
                            approved_b: true,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn test_fund_commitment_emits_running_totals() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E3';
    let run_id = compute_run_id(owner_secret);
    let hash_a = compute_commitment_hash('SECRET-E3A');
    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);

    let mut spy = spy_events();
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_a, token, 100_u128, 0, owner_secret, 0,
        );

    spy
        .assert_emitted(
            @array![
                (
                    dispatcher.contract_address,
                    Payroll::Event::CommitmentFunded(
                        Payroll::CommitmentFunded {
                            run_id,
                            commitment_hash: hash_a,
                            amount: 100_u128,
                            funded_count: 1,
                            total_committed: 100_u128,
                        },
                    ),
                ),
            ],
        );
    // Not closed yet: one of two commitments, and short of the budget.
    spy
        .assert_not_emitted(
            @array![
                (dispatcher.contract_address, Payroll::Event::RunClosed(Payroll::RunClosed { run_id })),
            ],
        );
}

#[test]
fn test_final_commitment_emits_run_closed() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E4';
    let run_id = compute_run_id(owner_secret);
    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-E4A'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );

    let mut spy = spy_events();
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-E4B'),
            token,
            50_u128,
            0,
            owner_secret,
            0,
        );

    spy
        .assert_emitted(
            @array![
                (dispatcher.contract_address, Payroll::Event::RunClosed(Payroll::RunClosed { run_id })),
            ],
        );
}

/// The absence of `RunClosed` is itself the signal. A payer who omits a
/// recipient never emits it, so an auditor reading only the log can tell the
/// run was never fully funded — the same property `is_complete` encodes, now
/// visible without reading storage.
#[test]
fn test_run_missing_a_recipient_never_emits_run_closed() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E5';
    let run_id = compute_run_id(owner_secret);
    let mut spy = spy_events();

    // Promises two recipients, funds one, then stops.
    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-E5A'),
            token,
            100_u128,
            0,
            owner_secret,
            0,
        );

    spy
        .assert_not_emitted(
            @array![
                (dispatcher.contract_address, Payroll::Event::RunClosed(Payroll::RunClosed { run_id })),
            ],
        );
    assert(!dispatcher.is_complete(run_id), 'and is_complete agrees');
}

#[test]
fn test_claim_emits_commitment_claimed() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E6';
    let run_id = compute_run_id(owner_secret);
    let hash = compute_commitment_hash('SECRET-E6');
    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash, token, 100_u128, 0, owner_secret, 0,
        );

    let mut spy = spy_events();
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-E6', 'NOTE-E6');

    spy
        .assert_emitted(
            @array![
                (
                    dispatcher.contract_address,
                    Payroll::Event::CommitmentClaimed(
                        Payroll::CommitmentClaimed {
                            run_id,
                            commitment_hash: hash,
                            amount: 100_u128,
                            paid_count: 1,
                            total_paid: 100_u128,
                        },
                    ),
                ),
            ],
        );
}

/// The privacy constraint from issue #33, pinned. `note_id` is the one value in
/// `Claim`'s arguments that storage does not already expose, and emitting it
/// would tie a claimed commitment to a specific note inside the pool.
///
/// `assert_emitted` matches the *whole* serialized payload, so this pins the
/// event to exactly these five fields. The guard is stronger than a failing
/// assertion: adding `note_id` to `CommitmentClaimed` does not compile, because
/// this test and the lifecycle test construct the struct literally
/// (`error[E0003]: Missing member "note_id"`). The leak cannot be introduced
/// without editing the test that forbids it.
#[test]
fn test_claim_event_carries_no_note_id() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E7';
    let run_id = compute_run_id(owner_secret);
    let hash = compute_commitment_hash('SECRET-E7');
    open_approved_run(dispatcher, token, owner_secret, 100_u128, 1);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash, token, 100_u128, 0, owner_secret, 0,
        );

    let mut spy = spy_events();
    // A note_id no other value in this test could collide with.
    dispatcher
        .privacy_invoke(
            PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-E7', 'DISTINCTIVE-NOTE',
        );

    spy
        .assert_emitted(
            @array![
                (
                    dispatcher.contract_address,
                    Payroll::Event::CommitmentClaimed(
                        Payroll::CommitmentClaimed {
                            run_id,
                            commitment_hash: hash,
                            amount: 100_u128,
                            paid_count: 1,
                            total_paid: 100_u128,
                        },
                    ),
                ),
            ],
        );
}

/// The acceptance criterion: a reviewer can reconstruct a run's whole lifecycle
/// from events alone. One two-recipient run, opened through to fully claimed,
/// with every state transition present in the log and nothing read from storage.
#[test]
fn test_full_run_lifecycle_is_reconstructible_from_events() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E8';
    let run_id = compute_run_id(owner_secret);
    let hash_a = compute_commitment_hash('SECRET-E8A');
    let hash_b = compute_commitment_hash('SECRET-E8B');
    let addr = dispatcher.contract_address;
    let mut spy = spy_events();

    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_a, token, 100_u128, 0, owner_secret, 0,
        );
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash_b, token, 50_u128, 0, owner_secret, 0,
        );
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-E8A', 'NOTE-A');
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-E8B', 'NOTE-B');

    spy
        .assert_emitted(
            @array![
                (
                    addr,
                    Payroll::Event::RunOpened(
                        Payroll::RunOpened {
                            run_id, token, expected_count: 2, expected_total: 150_u128,
                        },
                    ),
                ),
                (
                    addr,
                    Payroll::Event::RunApproved(
                        Payroll::RunApproved {
                            run_id,
                            approver_commitment: compute_approver_commitment(APPROVER_A),
                            approved_a: true,
                            approved_b: false,
                        },
                    ),
                ),
                (
                    addr,
                    Payroll::Event::RunApproved(
                        Payroll::RunApproved {
                            run_id,
                            approver_commitment: compute_approver_commitment(APPROVER_B),
                            approved_a: true,
                            approved_b: true,
                        },
                    ),
                ),
                (
                    addr,
                    Payroll::Event::CommitmentFunded(
                        Payroll::CommitmentFunded {
                            run_id,
                            commitment_hash: hash_a,
                            amount: 100_u128,
                            funded_count: 1,
                            total_committed: 100_u128,
                        },
                    ),
                ),
                (
                    addr,
                    Payroll::Event::CommitmentFunded(
                        Payroll::CommitmentFunded {
                            run_id,
                            commitment_hash: hash_b,
                            amount: 50_u128,
                            funded_count: 2,
                            total_committed: 150_u128,
                        },
                    ),
                ),
                (addr, Payroll::Event::RunClosed(Payroll::RunClosed { run_id })),
                (
                    addr,
                    Payroll::Event::CommitmentClaimed(
                        Payroll::CommitmentClaimed {
                            run_id,
                            commitment_hash: hash_a,
                            amount: 100_u128,
                            paid_count: 1,
                            total_paid: 100_u128,
                        },
                    ),
                ),
                (
                    addr,
                    Payroll::Event::CommitmentClaimed(
                        Payroll::CommitmentClaimed {
                            run_id,
                            commitment_hash: hash_b,
                            amount: 50_u128,
                            paid_count: 2,
                            total_paid: 150_u128,
                        },
                    ),
                ),
            ],
        );
}

/// Pins the **raw wire layout** of `CommitmentFunded`, because
/// `integration/src/payroll-events.ts` decodes it from a transaction receipt by
/// position. `assert_emitted` above compares deserialized structs and would
/// happily pass while the felt layout changed underneath it.
///
/// This is the same parity-pair idea as the commitment hash: Cairo pins the
/// layout here, TypeScript pins the identical fixture in
/// `integration/src/payroll-events.test.ts`. Drift makes the claim
/// notification read the wrong felt as the amount.
#[test]
fn test_commitment_funded_wire_layout_matches_typescript() {
    let (dispatcher, token) = setup();
    let owner_secret: felt252 = 'OWNER-E9';
    let run_id = compute_run_id(owner_secret);
    let hash = compute_commitment_hash('SECRET-E9');
    open_approved_run(dispatcher, token, owner_secret, 150_u128, 2);

    let mut spy = spy_events();
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment, run_id, hash, token, 100_u128, 0, owner_secret, 0,
        );

    let events = spy.get_events();
    let (emitter, raw) = events.events.span().at(0);
    assert(*emitter == dispatcher.contract_address, 'emitted by Payroll');

    // `.span()` disambiguates ArrayTrait::at from SpanTrait::at.
    let keys = raw.keys.span();
    let data = raw.data.span();

    // keys[0] is the variant selector, then the two #[key] fields in order.
    assert(keys.len() == 3, 'three keys');
    assert(*keys.at(0) == selector!("CommitmentFunded"), 'keys[0] = selector');
    // The same literal `integration/src/payroll-events.ts` pins for
    // hash.getSelectorFromName("CommitmentFunded"). Note this IS the right use
    // of starknet_keccak — event keys are selectors. It is not the mistake
    // CLAUDE.md §3 warns about, which is using it for a *commitment* hash.
    assert(
        selector!("CommitmentFunded") == 210239575222622801988925347656546139608989566980615942258882279379756782329,
        'TS/Cairo selector drift',
    );
    assert(*keys.at(1) == run_id, 'keys[1] = run_id');
    assert(*keys.at(2) == hash, 'keys[2] = commitment_hash');

    // Unkeyed fields, in declaration order. u128 and u32 are one felt each.
    assert(data.len() == 3, 'three data felts');
    assert(*data.at(0) == 100, 'data[0] = amount');
    assert(*data.at(1) == 1, 'data[1] = funded_count');
    assert(*data.at(2) == 100, 'data[2] = total_committed');
}
