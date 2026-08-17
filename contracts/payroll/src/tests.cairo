use payroll::payroll::{IPayrollDispatcher, IPayrollDispatcherTrait, PayrollOperation, RunInfo};
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address};
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
            0,
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
}
