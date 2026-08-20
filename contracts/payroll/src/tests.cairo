use payroll::payroll::{
    IPayrollDispatcher, IPayrollDispatcherTrait, PayrollOperation, RunInfo, compute_commitment_hash,
};
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, start_mock_call,
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

#[test]
fn test_fund_commitment_increments_run_totals() {
    let privacy_addr: ContractAddress = 0x123.try_into().unwrap();
    let token: ContractAddress = 0x456.try_into().unwrap();
    let dispatcher = deploy_payroll(privacy_addr);

    let run_id: felt252 = 'RUN-1';
    start_cheat_caller_address(dispatcher.contract_address, privacy_addr);

    dispatcher
        .privacy_invoke(
            PayrollOperation::OpenRun,
            run_id,
            0,
            token,
            100_u128, // amount doubles as expected_total for OpenRun
            2, // expected_count
            0,
            0,
        );

    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            'COMMIT-A',
            token,
            100_u128,
            0,
            0,
            0,
        );

    let run: RunInfo = dispatcher.get_run(run_id);
    assert(run.expected_count == 2, 'expected_count');
    assert(run.paid_count == 0, 'paid_count');
    assert(run.total_committed == 100_u128, 'total_committed');
    assert(run.total_paid == 0_u128, 'total_paid');
    assert(run.expected_total == 100_u128, 'expected_total');
}

#[test]
fn test_run_incomplete_until_all_commitments_claimed() {
    let privacy_addr: ContractAddress = 0x123.try_into().unwrap();
    let token: ContractAddress = 0x456.try_into().unwrap();
    let dispatcher = deploy_payroll(privacy_addr);
    let run_id: felt252 = 'RUN-2';

    start_cheat_caller_address(dispatcher.contract_address, privacy_addr);
    // `token` (0x456) has no real ERC20 deployed at it in this unit test; mock its `approve`
    // entrypoint so Claim's IERC20Dispatcher.approve call succeeds without a live contract.
    start_mock_call(token, selector!("approve"), true);

    dispatcher
        .privacy_invoke(PayrollOperation::OpenRun, run_id, 0, token, 150_u128, 2, 0, 0);

    // FundCommitment's commitment_hash must equal compute_commitment_hash(secret): the payer
    // computes the hash off-chain from a secret it will later share with the recipient, and
    // Claim recomputes the same hash from the revealed secret to look up the entry.
    let hash_a = compute_commitment_hash('SECRET-A');
    let hash_b = compute_commitment_hash('SECRET-B');

    dispatcher
        .privacy_invoke(PayrollOperation::FundCommitment, run_id, hash_a, token, 100_u128, 0, 0, 0);
    dispatcher
        .privacy_invoke(PayrollOperation::FundCommitment, run_id, hash_b, token, 50_u128, 0, 0, 0);

    assert(!dispatcher.is_complete(run_id), 'should be incomplete: 0 claims');

    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-A', 'NOTE-A');

    assert(!dispatcher.is_complete(run_id), 'should be incomplete: 1 of 2');

    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-B', 'NOTE-B');

    assert(dispatcher.is_complete(run_id), 'should be complete: 2 of 2');
}

#[test]
#[should_panic(expected: 'ALREADY_CLAIMED')]
fn test_double_claim_reverts() {
    let privacy_addr: ContractAddress = 0x123.try_into().unwrap();
    let token: ContractAddress = 0x456.try_into().unwrap();
    let dispatcher = deploy_payroll(privacy_addr);
    let run_id: felt252 = 'RUN-3';

    start_cheat_caller_address(dispatcher.contract_address, privacy_addr);
    start_mock_call(token, selector!("approve"), true);
    dispatcher.privacy_invoke(PayrollOperation::OpenRun, run_id, 0, token, 100_u128, 1, 0, 0);

    let hash_c = compute_commitment_hash('SECRET-C');
    dispatcher
        .privacy_invoke(PayrollOperation::FundCommitment, run_id, hash_c, token, 100_u128, 0, 0, 0);
    dispatcher.privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-C', 'NOTE-C');
    dispatcher
        .privacy_invoke(PayrollOperation::Claim, run_id, 0, token, 0, 0, 'SECRET-C', 'NOTE-C2');
}

#[test]
#[should_panic(expected: 'ZERO_EXPECTED_COUNT')]
fn test_open_run_rejects_zero_expected_count() {
    let (dispatcher, token) = setup();
    // expected_count == 0 is how "run does not exist" is encoded, so a run
    // opened with 0 would be silently unusable rather than loudly rejected.
    dispatcher.privacy_invoke(PayrollOperation::OpenRun, 'RUN-Z1', 0, token, 150_u128, 0, 0, 0);
}

#[test]
#[should_panic(expected: 'ZERO_EXPECTED_TOTAL')]
fn test_open_run_rejects_zero_expected_total() {
    let (dispatcher, token) = setup();
    dispatcher.privacy_invoke(PayrollOperation::OpenRun, 'RUN-Z2', 0, token, 0_u128, 2, 0, 0);
}

#[test]
#[should_panic(expected: 'TOKEN_MISMATCH')]
fn test_commitment_token_must_match_the_run() {
    let (dispatcher, token) = setup();
    let other: ContractAddress = OTHER_TOKEN.try_into().unwrap();
    let run_id: felt252 = 'RUN-TOK';

    dispatcher.privacy_invoke(PayrollOperation::OpenRun, run_id, 0, token, 150_u128, 2, 0, 0);
    // Would otherwise sum two different tokens' amounts into one total.
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-A'),
            other,
            100_u128,
            0,
            0,
            0,
        );
}

#[test]
#[should_panic(expected: 'COMMITMENT_NOT_FOUND')]
fn test_claim_with_unknown_secret_reverts() {
    let (dispatcher, token) = setup();
    let run_id: felt252 = 'RUN-4';

    dispatcher.privacy_invoke(PayrollOperation::OpenRun, run_id, 0, token, 100_u128, 1, 0, 0);
    dispatcher
        .privacy_invoke(
            PayrollOperation::FundCommitment,
            run_id,
            compute_commitment_hash('SECRET-D'),
            token,
            100_u128,
            0,
            0,
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
