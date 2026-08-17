use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct RunInfo {
    pub payer: ContractAddress,
    pub token: ContractAddress,
    pub expected_count: u32,
    pub paid_count: u32,
    pub total_committed: u128,
    pub total_paid: u128,
    pub closed: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct CommitmentEntry {
    pub run_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
    pub claimed: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum PayrollOperation {
    OpenRun,
    FundCommitment,
    Claim,
}

#[starknet::interface]
pub trait IPayroll<T> {
    fn get_run(self: @T, run_id: felt252) -> RunInfo;
    fn get_commitment(self: @T, commitment_hash: felt252) -> CommitmentEntry;
    fn is_complete(self: @T, run_id: felt252) -> bool;
    fn privacy_invoke(
        ref self: T,
        operation: PayrollOperation,
        run_id: felt252,
        commitment_hash: felt252,
        token: ContractAddress,
        amount: u128,
        expected_count: u32,
        secret: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
}

pub mod errors {
    pub const CALLER_NOT_PRIVACY: felt252 = 'CALLER_NOT_PRIVACY';
    pub const RUN_EXISTS: felt252 = 'RUN_EXISTS';
    pub const RUN_NOT_FOUND: felt252 = 'RUN_NOT_FOUND';
    pub const RUN_CLOSED: felt252 = 'RUN_CLOSED';
    pub const ZERO_COMMITMENT_HASH: felt252 = 'ZERO_COMMITMENT_HASH';
    pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
    pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
    pub const COMMITMENT_NOT_FOUND: felt252 = 'COMMITMENT_NOT_FOUND';
    pub const ALREADY_CLAIMED: felt252 = 'ALREADY_CLAIMED';
    pub const OVER_COMMITTED: felt252 = 'OVER_COMMITTED';
}

#[starknet::contract]
pub mod Payroll {
    use core::num::traits::Zero;
    use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use privacy::objects::OpenNoteDeposit;
    use starknet::storage::{
        StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::{CommitmentEntry, IPayroll, PayrollOperation, RunInfo, errors};

    #[storage]
    struct Storage {
        privacy_contract: ContractAddress,
        runs: starknet::storage::Map<felt252, RunInfo>,
        commitments: starknet::storage::Map<felt252, CommitmentEntry>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_contract: ContractAddress) {
        self.privacy_contract.write(privacy_contract);
    }

    #[abi(embed_v0)]
    pub impl PayrollImpl of IPayroll<ContractState> {
        fn get_run(self: @ContractState, run_id: felt252) -> RunInfo {
            self.runs.read(run_id)
        }

        fn get_commitment(self: @ContractState, commitment_hash: felt252) -> CommitmentEntry {
            self.commitments.read(commitment_hash)
        }

        fn is_complete(self: @ContractState, run_id: felt252) -> bool {
            let run = self.runs.read(run_id);
            run.expected_count.is_non_zero()
                && run.paid_count == run.expected_count
                && run.total_paid == run.total_committed
        }

        fn privacy_invoke(
            ref self: ContractState,
            operation: PayrollOperation,
            run_id: felt252,
            commitment_hash: felt252,
            token: ContractAddress,
            amount: u128,
            expected_count: u32,
            secret: felt252,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let privacy_addr = self.privacy_contract.read();
            assert(get_caller_address() == privacy_addr, errors::CALLER_NOT_PRIVACY);

            match operation {
                PayrollOperation::OpenRun => {
                    let existing = self.runs.read(run_id);
                    assert(existing.expected_count.is_zero(), errors::RUN_EXISTS);
                    self
                        .runs
                        .write(
                            run_id,
                            RunInfo {
                                payer: get_caller_address(),
                                token,
                                expected_count,
                                paid_count: 0,
                                total_committed: 0,
                                total_paid: 0,
                                closed: false,
                            },
                        );
                    [].span()
                },
                PayrollOperation::FundCommitment => {
                    let mut run = self.runs.read(run_id);
                    assert(run.expected_count.is_non_zero(), errors::RUN_NOT_FOUND);
                    assert(!run.closed, errors::RUN_CLOSED);
                    assert(commitment_hash.is_non_zero(), errors::ZERO_COMMITMENT_HASH);
                    assert(amount.is_non_zero(), errors::ZERO_AMOUNT);

                    let existing = self.commitments.read(commitment_hash);
                    assert(existing.token.is_zero(), errors::COMMITMENT_EXISTS);

                    run.total_committed += amount;
                    assert(run.total_committed <= run.total_committed, errors::OVER_COMMITTED);
                    self.runs.write(run_id, run);

                    self
                        .commitments
                        .write(
                            commitment_hash, CommitmentEntry { run_id, token, amount, claimed: false },
                        );

                    [].span()
                },
                PayrollOperation::Claim => {
                    // Implemented in Task 3.
                    [].span()
                },
            }
        }
    }
}
