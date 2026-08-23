use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

/// Aggregate, publicly-readable accounting for one payroll run.
///
/// Deliberately contains NO payer address. `privacy_invoke` is only ever called
/// by the privacy pool (see `CALLER_NOT_PRIVACY`), so `get_caller_address()` is
/// always the pool — a stored "payer" could only ever be the pool's address.
/// Storing the *real* payer would also defeat the purpose of routing through the
/// pool at all: it would publish the very link the pool exists to hide.
///
/// Run ownership (see `docs/adr-run-ownership.md`) is instead proven with a
/// secret, never an address: `run_id` must equal `compute_run_id(owner_secret)`
/// at `OpenRun`, which makes a target `run_id` infeasible to squat without
/// knowing the payer's secret, and `owner_commitment` gates every later
/// `FundCommitment` on knowledge of that same secret.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct RunInfo {
    pub token: ContractAddress,
    /// How many recipients this run promises to pay. Fixed at `OpenRun`.
    pub expected_count: u32,
    /// How many commitments have actually been funded so far.
    pub funded_count: u32,
    /// How many funded commitments have been claimed so far.
    pub paid_count: u32,
    /// The full budget this run promises to disburse. Fixed at `OpenRun`.
    pub expected_total: u128,
    pub total_committed: u128,
    pub total_paid: u128,
    /// Set once the run is fully funded: `funded_count == expected_count` AND
    /// `total_committed == expected_total`. Until then the run cannot be
    /// complete, which is what makes underfunding detectable.
    pub closed: bool,
    /// `compute_run_owner_commitment(owner_secret)`, fixed at `OpenRun`. Every
    /// `FundCommitment` must reveal the same `owner_secret` to prove it comes
    /// from whoever opened the run.
    pub owner_commitment: felt252,
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
    /// The completeness proof. True only when the run was funded for exactly the
    /// budget and headcount it promised, and every one of those commitments has
    /// been claimed. A payer cannot reach `true` by omitting a recipient
    /// (`funded_count` never reaches `expected_count`, so `closed` stays false)
    /// or by underpaying (the final `FundCommitment` reverts `UNDER_COMMITTED`).
    fn is_complete(self: @T, run_id: felt252) -> bool;
    /// `secret` is overloaded by operation (see `docs/adr-run-ownership.md`):
    /// for `OpenRun` it is the run's `owner_secret` (`run_id` must equal
    /// `compute_run_id(secret)`); for `FundCommitment` it must be that same
    /// run's `owner_secret`, proving the caller is the run's opener; for
    /// `Claim` it is the commitment secret, as before.
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
pub const PAYROLL_RUN_ID_TAG: felt252 = 'PAYROLL_RUN_ID_TAG:V1';
pub const PAYROLL_RUN_OWNER_TAG: felt252 = 'PAYROLL_RUN_OWNER_TAG:V1';

/// Mirrored byte-for-byte by `computeCommitmentHash` in
/// `integration/src/config.ts`. Both operands are raw felt252 values — neither
/// is pre-hashed. If you change this, change that, or every funded commitment
/// becomes permanently unclaimable.
pub fn compute_commitment_hash(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([PAYROLL_COMMITMENT_TAG, secret].span())
}

/// `run_id` must equal this for the `OpenRun` caller's own `owner_secret`, so a
/// squatter who does not know that secret cannot produce a valid `OpenRun` call
/// for a `run_id` the legitimate payer intends to use — see
/// `docs/adr-run-ownership.md`.
pub fn compute_run_id(owner_secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([PAYROLL_RUN_ID_TAG, owner_secret].span())
}

/// Stored on `RunInfo` at `OpenRun`. A different domain tag from
/// `compute_run_id` so that `run_id` being public never leaks this value —
/// Poseidon is one-way, but keeping the two derivations in separate domains
/// avoids relying on that alone.
pub fn compute_run_owner_commitment(owner_secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([PAYROLL_RUN_OWNER_TAG, owner_secret].span())
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
    pub const ZERO_OWNER_SECRET: felt252 = 'ZERO_OWNER_SECRET';
    pub const RUN_ID_MISMATCH: felt252 = 'RUN_ID_MISMATCH';
    pub const NOT_RUN_OWNER: felt252 = 'NOT_RUN_OWNER';
    pub const TOKEN_MISMATCH: felt252 = 'TOKEN_MISMATCH';
    pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
    pub const COMMITMENT_NOT_FOUND: felt252 = 'COMMITMENT_NOT_FOUND';
    pub const ALREADY_CLAIMED: felt252 = 'ALREADY_CLAIMED';
    pub const OVER_COMMITTED: felt252 = 'OVER_COMMITTED';
    pub const UNDER_COMMITTED: felt252 = 'UNDER_COMMITTED';
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
            // `closed` already implies funded_count == expected_count and
            // total_committed == expected_total, so this is the full property:
            // fully funded, for the promised budget, and entirely claimed.
            run.closed
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
                    // `secret` here is the run's owner_secret (see
                    // docs/adr-run-ownership.md). Requiring run_id to equal its
                    // derived hash makes a chosen run_id infeasible to squat
                    // without knowing the secret behind it.
                    assert(secret.is_non_zero(), errors::ZERO_OWNER_SECRET);
                    assert(run_id == super::compute_run_id(secret), errors::RUN_ID_MISMATCH);
                    let owner_commitment = super::compute_run_owner_commitment(secret);
                    self
                        .runs
                        .write(
                            run_id,
                            RunInfo {
                                token,
                                expected_count,
                                funded_count: 0,
                                paid_count: 0,
                                expected_total: amount,
                                total_committed: 0,
                                total_paid: 0,
                                closed: false,
                                owner_commitment,
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
                    // Only whoever opened the run knows owner_secret; this is
                    // what stops a third party from funding into someone
                    // else's run (see docs/adr-run-ownership.md).
                    assert(
                        super::compute_run_owner_commitment(secret) == run.owner_commitment,
                        errors::NOT_RUN_OWNER,
                    );

                    let existing = self.commitments.read(commitment_hash);
                    assert(existing.token.is_zero(), errors::COMMITMENT_EXISTS);

                    // Invariant: funded_count can never exceed expected_count,
                    // because the run is closed below the moment they are equal
                    // and a closed run rejects further commitments above.
                    run.funded_count += 1;
                    run.total_committed += amount;
                    assert(run.total_committed <= run.expected_total, errors::OVER_COMMITTED);

                    // The last commitment must land the run exactly on its
                    // promised budget. This is what makes underpayment
                    // impossible to hide: a payer who shorts a recipient cannot
                    // fund the final commitment at all.
                    if run.funded_count == run.expected_count {
                        assert(run.total_committed == run.expected_total, errors::UNDER_COMMITTED);
                        run.closed = true;
                    }
                    self.runs.write(run_id, run);

                    self
                        .commitments
                        .write(
                            commitment_hash,
                            CommitmentEntry { run_id, token, amount, claimed: false },
                        );

                    [].span()
                },
                PayrollOperation::Claim => {
                    // The caller never passes commitment_hash on claim: it is
                    // recomputed from the revealed secret preimage, so only a
                    // holder of the secret can address a commitment.
                    let commitment_hash = super::compute_commitment_hash(secret);
                    let entry = self.commitments.read(commitment_hash);
                    assert(entry.token.is_non_zero(), errors::COMMITMENT_NOT_FOUND);
                    assert(!entry.claimed, errors::ALREADY_CLAIMED);

                    self
                        .commitments
                        .write(commitment_hash, CommitmentEntry { claimed: true, ..entry });

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
