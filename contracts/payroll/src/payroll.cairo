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
    pub expected_total: u128,
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

pub const PAYROLL_COMMITMENT_TAG: felt252 = 'PAYROLL_COMMITMENT_TAG:V1';

pub fn compute_commitment_hash(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([PAYROLL_COMMITMENT_TAG, secret].span())
}

pub mod errors {
    pub const CALLER_NOT_PRIVACY: felt252 = 'CALLER_NOT_PRIVACY';
    pub const RUN_EXISTS: felt252 = 'RUN_EXISTS';
    pub const RUN_NOT_FOUND: felt252 = 'RUN_NOT_FOUND';
    pub const RUN_CLOSED: felt252 = 'RUN_CLOSED';
    pub const ZERO_COMMITMENT_HASH: felt252 = 'ZERO_COMMITMENT_HASH';
    pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
    pub const ZERO_EXPECTED_COUNT: felt252 = 'ZERO_EXPECTED_COUNT';
    pub const ZERO_EXPECTED_TOTAL: felt252 = 'ZERO_EXPECTED_TOTAL';
    pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
    pub const TOKEN_MISMATCH: felt252 = 'TOKEN_MISMATCH';
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
                    // A run is "absent" iff expected_count == 0, so a run may
                    // never be opened with expected_count == 0 — it would be
                    // indistinguishable from a run that was never opened, and
                    // every later FundCommitment would revert RUN_NOT_FOUND.
                    let existing = self.runs.read(run_id);
                    assert(existing.expected_count.is_zero(), errors::RUN_EXISTS);
                    assert(expected_count.is_non_zero(), errors::ZERO_EXPECTED_COUNT);
                    // `amount` doubles as expected_total for OpenRun (documented
                    // dual use, to avoid a 10th privacy_invoke parameter).
                    // Zero would make every FundCommitment revert OVER_COMMITTED.
                    assert(amount.is_non_zero(), errors::ZERO_EXPECTED_TOTAL);
                    assert(token.is_non_zero(), errors::ZERO_TOKEN);
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
                                expected_total: amount, // `amount` doubles as expected_total for OpenRun
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
                    // Without this, a run's aggregate totals would silently sum
                    // amounts denominated in different tokens.
                    assert(token == run.token, errors::TOKEN_MISMATCH);

                    let existing = self.commitments.read(commitment_hash);
                    assert(existing.token.is_zero(), errors::COMMITMENT_EXISTS);

                    run.total_committed += amount;
                    assert(run.total_committed <= run.expected_total, errors::OVER_COMMITTED);
                    self.runs.write(run_id, run);

                    self
                        .commitments
                        .write(
                            commitment_hash, CommitmentEntry { run_id, token, amount, claimed: false },
                        );

                    [].span()
                },
                PayrollOperation::Claim => {
                    let commitment_hash = super::compute_commitment_hash(secret);
                    let entry = self.commitments.read(commitment_hash);
                    assert(entry.token.is_non_zero(), errors::COMMITMENT_NOT_FOUND);
                    assert(!entry.claimed, errors::ALREADY_CLAIMED);

                    self.commitments.write(commitment_hash, CommitmentEntry { claimed: true, ..entry });

                    let mut run = self.runs.read(entry.run_id);
                    run.paid_count += 1;
                    run.total_paid += entry.amount;
                    self.runs.write(entry.run_id, run);

                    IERC20Dispatcher { contract_address: entry.token }
                        .approve(spender: privacy_addr, amount: entry.amount.into());

                    [OpenNoteDeposit { note_id, token: entry.token, amount: entry.amount }].span()
                },
            }
        }
    }
}
