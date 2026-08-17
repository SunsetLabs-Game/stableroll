use payroll::payroll::{
    IPayrollDispatcher, IPayrollDispatcherTrait, PayrollOperation, RunInfo, compute_commitment_hash,
};
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, start_mock_call,
};
use starknet::ContractAddress;

fn deploy_payroll(privacy_contract: ContractAddress) -> IPayrollDispatcher {
    let contract = declare("Payroll").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![privacy_contract.into()];
    let (address, _) = contract.deploy(@calldata).unwrap();
    IPayrollDispatcher { contract_address: address }
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
