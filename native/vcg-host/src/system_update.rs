//! Crash-recoverable metadata for an atomic two-slot system update.
//!
//! This module deliberately owns boot-selection metadata only. A privileged
//! image writer must verify signatures and the bytes written to an inactive
//! read-only slot before constructing [`SystemImage`]. A boot coordinator must
//! durably claim a pending attempt before transferring control, and the
//! running candidate must pass every required health check before confirmation.

use std::collections::BTreeSet;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const JOURNAL_SCHEMA_VERSION: u32 = 1;
const RECORDS_DIRECTORY: &str = "records";
const OPERATION_LOCK_FILE: &str = ".vcg-system-update.lock";
const TEMP_RECORD_FILE: &str = ".next-record.tmp";
const MAX_RECORD_BYTES: u64 = 64 * 1_024;
const MAX_RECORDS: usize = 16_384;
const MAX_BOOT_ATTEMPTS: u8 = 10;
const REQUIRED_HEALTH_CHECKS: [SystemHealthCheck; 6] = [
    SystemHealthCheck::Launcher,
    SystemHealthCheck::Tracker,
    SystemHealthCheck::Camera,
    SystemHealthCheck::Controller,
    SystemHealthCheck::Network,
    SystemHealthCheck::Storage,
];

/// One of the two replaceable, read-only system slots.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SystemSlot {
    A,
    B,
}

impl SystemSlot {
    #[must_use]
    pub const fn other(self) -> Self {
        match self {
            Self::A => Self::B,
            Self::B => Self::A,
        }
    }
}

/// Exact evidence for one signature-verified image already written to a slot.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SystemImage {
    slot: SystemSlot,
    generation: u64,
    release_id: String,
    target: String,
    manifest_sha256: String,
    image_sha256: String,
}

impl SystemImage {
    /// Constructs validated image evidence.
    ///
    /// This validates only the evidence shape. The privileged caller remains
    /// responsible for signature verification and read-back hashing.
    ///
    /// # Errors
    ///
    /// Rejects zero generations, unsafe identifiers, and noncanonical hashes.
    pub fn new(
        slot: SystemSlot,
        generation: u64,
        release_id: impl Into<String>,
        target: impl Into<String>,
        manifest_sha256: impl Into<String>,
        image_sha256: impl Into<String>,
    ) -> Result<Self, SystemUpdateError> {
        let image = Self {
            slot,
            generation,
            release_id: release_id.into(),
            target: target.into(),
            manifest_sha256: manifest_sha256.into(),
            image_sha256: image_sha256.into(),
        };
        validate_image(&image)?;
        Ok(image)
    }

    #[must_use]
    pub const fn slot(&self) -> SystemSlot {
        self.slot
    }

    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub fn release_id(&self) -> &str {
        &self.release_id
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }
}

/// Health gates selected by D-050.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemHealthCheck {
    Launcher,
    Tracker,
    Camera,
    Controller,
    Network,
    Storage,
}

/// Durable phase of an inactive-slot update.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "kind", deny_unknown_fields)]
pub enum PendingPhase {
    /// Verified image bytes exist, but ordinary boot still selects the active
    /// slot.
    Staged,
    /// Boot selection may choose the candidate on the next claim.
    Armed,
    /// The attempt was durably consumed before control transfer.
    Booting {
        attempt_id: u64,
        passed_checks: BTreeSet<SystemHealthCheck>,
    },
}

/// One pending update and its bounded attempt budget.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PendingSystemUpdate {
    image: SystemImage,
    max_attempts: u8,
    attempts_remaining: u8,
    phase: PendingPhase,
}

impl PendingSystemUpdate {
    #[must_use]
    pub fn image(&self) -> &SystemImage {
        &self.image
    }

    #[must_use]
    pub const fn max_attempts(&self) -> u8 {
        self.max_attempts
    }

    #[must_use]
    pub const fn attempts_remaining(&self) -> u8 {
        self.attempts_remaining
    }

    #[must_use]
    pub const fn phase(&self) -> &PendingPhase {
        &self.phase
    }
}

/// Why a candidate returned to the prior healthy slot.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "kind", deny_unknown_fields)]
pub enum SystemRollbackReason {
    FailedHealthCheck { check: SystemHealthCheck },
    HealthWindowExpired,
    InterruptedAttemptsExhausted,
}

/// Last rejected image, retained as bounded diagnostic metadata.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SystemRollback {
    generation: u64,
    release_id: String,
    slot: SystemSlot,
    attempts_used: u8,
    reason: SystemRollbackReason,
}

impl SystemRollback {
    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub const fn reason(&self) -> &SystemRollbackReason {
        &self.reason
    }
}

/// Current trusted system-update state.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SystemUpdateSnapshot {
    active: SystemImage,
    highest_seen_generation: u64,
    last_attempt_id: u64,
    pending: Option<PendingSystemUpdate>,
    last_rollback: Option<SystemRollback>,
}

impl SystemUpdateSnapshot {
    #[must_use]
    pub fn active(&self) -> &SystemImage {
        &self.active
    }

    #[must_use]
    pub const fn highest_seen_generation(&self) -> u64 {
        self.highest_seen_generation
    }

    #[must_use]
    pub const fn last_attempt_id(&self) -> u64 {
        self.last_attempt_id
    }

    #[must_use]
    pub const fn pending(&self) -> Option<&PendingSystemUpdate> {
        self.pending.as_ref()
    }

    #[must_use]
    pub const fn last_rollback(&self) -> Option<&SystemRollback> {
        self.last_rollback.as_ref()
    }
}

/// Durable authorization for exactly one candidate boot attempt.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PendingBootClaim {
    slot: SystemSlot,
    generation: u64,
    attempt_id: u64,
    attempts_remaining: u8,
}

impl PendingBootClaim {
    #[must_use]
    pub const fn slot(self) -> SystemSlot {
        self.slot
    }

    #[must_use]
    pub const fn generation(self) -> u64 {
        self.generation
    }

    #[must_use]
    pub const fn attempt_id(self) -> u64 {
        self.attempt_id
    }

    #[must_use]
    pub const fn attempts_remaining(self) -> u8 {
        self.attempts_remaining
    }
}

/// Result of recovering a boot attempt that restarted before confirmation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InterruptedBootRecovery {
    NoInterruptedBoot,
    RetryPending {
        slot: SystemSlot,
        attempts_remaining: u8,
    },
    RolledBack {
        active_slot: SystemSlot,
        rejected_generation: u64,
    },
}

/// Result after recording one passing candidate health gate.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HealthProgress {
    Pending { remaining: Vec<SystemHealthCheck> },
    Confirmed { active: SystemImage },
}

/// Recovery result for a leftover unpublished or already-published temp file.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JournalRecovery {
    Clean,
    DiscardedUnpublished,
    RemovedPublishedDuplicate,
}

/// Append-only system-update metadata journal.
#[derive(Clone, Debug)]
pub struct SystemUpdateJournal {
    records: PathBuf,
    operation_lock: PathBuf,
}

impl SystemUpdateJournal {
    /// Opens a pre-provisioned metadata root containing `records/` and a
    /// regular `.vcg-system-update.lock` file.
    ///
    /// # Errors
    ///
    /// Rejects relative, missing, linked, or malformed store paths.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, SystemUpdateError> {
        let supplied = root.as_ref();
        if !supplied.is_absolute() {
            return Err(SystemUpdateError::UnsafePath {
                kind: "system update root",
                path: supplied.to_owned(),
            });
        }
        let root = canonical_directory("system update root", supplied)?;
        let records = canonical_child_directory(&root, RECORDS_DIRECTORY)?;
        let operation_lock = canonical_direct_file(
            "system update operation lock",
            &root,
            &root.join(OPERATION_LOCK_FILE),
        )?;
        Ok(Self {
            records,
            operation_lock,
        })
    }

    /// Creates the first healthy-slot record in an empty journal.
    ///
    /// # Errors
    ///
    /// Rejects invalid image evidence, existing state, lock contention, or an
    /// unsafe/corrupt journal.
    pub fn initialize(
        &self,
        active: SystemImage,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        let _operation = self.acquire_operation_lock()?;
        self.recover_temp_unlocked()?;
        if self.load_unlocked()?.is_some() {
            return Err(SystemUpdateError::AlreadyInitialized);
        }
        let snapshot = SystemUpdateSnapshot {
            highest_seen_generation: active.generation,
            last_attempt_id: 0,
            active,
            pending: None,
            last_rollback: None,
        };
        validate_snapshot(&snapshot)?;
        self.append_unlocked(&snapshot)?;
        Ok(snapshot)
    }

    /// Loads and validates the complete hash-linked journal.
    ///
    /// # Errors
    ///
    /// Rejects uninitialized, recovery-pending, malformed, gapped, or corrupt
    /// journals.
    pub fn snapshot(&self) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        if path_exists(&self.temp_path())? {
            return Err(SystemUpdateError::RecoveryRequired);
        }
        self.load_unlocked()?
            .ok_or(SystemUpdateError::NotInitialized)
    }

    /// Resolves the one allowed leftover temporary record.
    ///
    /// An unpublished temp record is discarded. If its immutable final link
    /// exists with identical bytes, only the duplicate temp name is removed.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, unsafe paths, conflicting records, and corrupt
    /// journal state.
    pub fn recover(&self) -> Result<JournalRecovery, SystemUpdateError> {
        let _operation = self.acquire_operation_lock()?;
        self.recover_temp_unlocked()
    }

    /// Records an exactly verified image in the inactive slot without changing
    /// boot selection.
    ///
    /// # Errors
    ///
    /// Rejects an occupied pending slot, target mismatch, non-inactive slot,
    /// generation rollback, lock contention, or corrupt state.
    pub fn stage_verified_update(
        &self,
        image: SystemImage,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        self.mutate(|snapshot| {
            if snapshot.pending.is_some() {
                return Err(SystemUpdateError::PendingUpdateExists);
            }
            if image.slot != snapshot.active.slot.other() {
                return Err(SystemUpdateError::CandidateIsNotInactive);
            }
            if image.target != snapshot.active.target {
                return Err(SystemUpdateError::TargetMismatch {
                    active: snapshot.active.target.clone(),
                    candidate: image.target.clone(),
                });
            }
            if image.generation <= snapshot.highest_seen_generation {
                return Err(SystemUpdateError::GenerationRollback {
                    highest: snapshot.highest_seen_generation,
                    candidate: image.generation,
                });
            }
            snapshot.highest_seen_generation = image.generation;
            snapshot.pending = Some(PendingSystemUpdate {
                image,
                max_attempts: 0,
                attempts_remaining: 0,
                phase: PendingPhase::Staged,
            });
            Ok(())
        })
    }

    /// Arms a staged candidate with a bounded boot-attempt budget.
    ///
    /// # Errors
    ///
    /// Rejects limits outside `1..=10`, invalid phases, lock contention, or
    /// corrupt state.
    pub fn arm_staged_update(
        &self,
        max_attempts: u8,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        if !(1..=MAX_BOOT_ATTEMPTS).contains(&max_attempts) {
            return Err(SystemUpdateError::InvalidAttemptLimit(max_attempts));
        }
        self.mutate(|snapshot| {
            let pending = snapshot
                .pending
                .as_mut()
                .ok_or(SystemUpdateError::NoPendingUpdate)?;
            if pending.phase != PendingPhase::Staged {
                return Err(SystemUpdateError::InvalidTransition(
                    "only a staged update can be armed",
                ));
            }
            pending.max_attempts = max_attempts;
            pending.attempts_remaining = max_attempts;
            pending.phase = PendingPhase::Armed;
            Ok(())
        })
    }

    /// Returns the currently healthy slot without consuming an attempt.
    ///
    /// An armed candidate is intentionally not returned here. The only
    /// authorization to transfer control to it is [`Self::claim_pending_boot`],
    /// which first persists the consumed attempt. A `Booting` record requires
    /// explicit interrupted-attempt recovery before another boot is selected.
    ///
    /// # Errors
    ///
    /// Rejects recovery-pending, uninitialized, malformed, or corrupt state.
    pub fn boot_selection(&self) -> Result<SystemSlot, SystemUpdateError> {
        let snapshot = self.snapshot()?;
        match snapshot.pending {
            Some(PendingSystemUpdate {
                phase: PendingPhase::Booting { .. },
                ..
            }) => Err(SystemUpdateError::InterruptedBootRequiresRecovery),
            _ => Ok(snapshot.active.slot),
        }
    }

    /// Durably consumes one attempt before the bootloader transfers control to
    /// the pending image.
    ///
    /// # Errors
    ///
    /// Rejects missing/unarmed candidates, exhausted budgets, lock contention,
    /// or corrupt state.
    pub fn claim_pending_boot(&self) -> Result<PendingBootClaim, SystemUpdateError> {
        let mut claim = None;
        self.mutate(|snapshot| {
            let pending = snapshot
                .pending
                .as_mut()
                .ok_or(SystemUpdateError::NoPendingUpdate)?;
            if pending.phase != PendingPhase::Armed {
                return Err(SystemUpdateError::InvalidTransition(
                    "only an armed update can claim a boot",
                ));
            }
            if pending.attempts_remaining == 0 {
                return Err(SystemUpdateError::AttemptBudgetExhausted);
            }
            pending.attempts_remaining -= 1;
            let attempt_id = snapshot.last_attempt_id.checked_add(1).ok_or_else(|| {
                SystemUpdateError::InvalidState("boot attempt ID overflow".to_owned())
            })?;
            snapshot.last_attempt_id = attempt_id;
            pending.phase = PendingPhase::Booting {
                attempt_id,
                passed_checks: BTreeSet::new(),
            };
            claim = Some(PendingBootClaim {
                slot: pending.image.slot,
                generation: pending.image.generation,
                attempt_id,
                attempts_remaining: pending.attempts_remaining,
            });
            Ok(())
        })?;
        claim.ok_or(SystemUpdateError::InvalidState(
            "boot claim was not produced".to_owned(),
        ))
    }

    /// Converts a boot-in-progress record found after restart into one retry,
    /// or rolls back after the last attempt was consumed.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, recovery ambiguity, or corrupt state.
    pub fn recover_interrupted_boot(&self) -> Result<InterruptedBootRecovery, SystemUpdateError> {
        let mut outcome = InterruptedBootRecovery::NoInterruptedBoot;
        self.mutate_if_changed(|snapshot| {
            let Some(pending) = snapshot.pending.as_mut() else {
                return Ok(false);
            };
            if !matches!(pending.phase, PendingPhase::Booting { .. }) {
                return Ok(false);
            }
            if pending.attempts_remaining > 0 {
                pending.phase = PendingPhase::Armed;
                outcome = InterruptedBootRecovery::RetryPending {
                    slot: pending.image.slot,
                    attempts_remaining: pending.attempts_remaining,
                };
            } else {
                let rejected_generation = pending.image.generation;
                let active_slot = snapshot.active.slot;
                rollback(snapshot, SystemRollbackReason::InterruptedAttemptsExhausted)?;
                outcome = InterruptedBootRecovery::RolledBack {
                    active_slot,
                    rejected_generation,
                };
            }
            Ok(true)
        })?;
        Ok(outcome)
    }

    /// Persists one passing gate and confirms the candidate only after all six
    /// selected D-050 gates have passed in the same boot attempt.
    ///
    /// # Errors
    ///
    /// Rejects missing or stale attempts, invalid phases, lock contention, or
    /// corrupt state.
    pub fn pass_health_check(
        &self,
        attempt_id: u64,
        check: SystemHealthCheck,
    ) -> Result<HealthProgress, SystemUpdateError> {
        let mut progress = None;
        self.mutate_if_changed(|snapshot| {
            let pending = snapshot
                .pending
                .as_mut()
                .ok_or(SystemUpdateError::NoPendingUpdate)?;
            let PendingPhase::Booting {
                attempt_id: current,
                passed_checks,
            } = &mut pending.phase
            else {
                return Err(SystemUpdateError::InvalidTransition(
                    "health can pass only during a claimed boot",
                ));
            };
            if *current != attempt_id {
                return Err(SystemUpdateError::AttemptMismatch {
                    expected: *current,
                    actual: attempt_id,
                });
            }
            let changed = passed_checks.insert(check);
            let remaining = REQUIRED_HEALTH_CHECKS
                .into_iter()
                .filter(|required| !passed_checks.contains(required))
                .collect::<Vec<_>>();
            if remaining.is_empty() {
                let active = pending.image.clone();
                snapshot.active = active.clone();
                snapshot.pending = None;
                snapshot.last_rollback = None;
                progress = Some(HealthProgress::Confirmed { active });
            } else {
                progress = Some(HealthProgress::Pending { remaining });
            }
            Ok(changed)
        })?;
        progress.ok_or(SystemUpdateError::InvalidState(
            "health progress was not produced".to_owned(),
        ))
    }

    /// Rejects the candidate immediately when a required gate fails.
    ///
    /// # Errors
    ///
    /// Rejects missing or stale attempts, invalid phases, lock contention, or
    /// corrupt state.
    pub fn fail_health_check(
        &self,
        attempt_id: u64,
        check: SystemHealthCheck,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        self.rollback_attempt(
            attempt_id,
            SystemRollbackReason::FailedHealthCheck { check },
        )
    }

    /// Rejects the candidate when the privileged watchdog's bounded health
    /// window expires.
    ///
    /// # Errors
    ///
    /// Rejects missing or stale attempts, invalid phases, lock contention, or
    /// corrupt state.
    pub fn expire_health_window(
        &self,
        attempt_id: u64,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        self.rollback_attempt(attempt_id, SystemRollbackReason::HealthWindowExpired)
    }

    fn rollback_attempt(
        &self,
        attempt_id: u64,
        reason: SystemRollbackReason,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        self.mutate(|snapshot| {
            let pending = snapshot
                .pending
                .as_ref()
                .ok_or(SystemUpdateError::NoPendingUpdate)?;
            let PendingPhase::Booting {
                attempt_id: current,
                ..
            } = pending.phase
            else {
                return Err(SystemUpdateError::InvalidTransition(
                    "rollback requires a claimed boot",
                ));
            };
            if current != attempt_id {
                return Err(SystemUpdateError::AttemptMismatch {
                    expected: current,
                    actual: attempt_id,
                });
            }
            rollback(snapshot, reason)
        })
    }

    fn mutate(
        &self,
        mutation: impl FnOnce(&mut SystemUpdateSnapshot) -> Result<(), SystemUpdateError>,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        self.mutate_if_changed(|snapshot| {
            mutation(snapshot)?;
            Ok(true)
        })
    }

    fn mutate_if_changed(
        &self,
        mutation: impl FnOnce(&mut SystemUpdateSnapshot) -> Result<bool, SystemUpdateError>,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        let _operation = self.acquire_operation_lock()?;
        self.recover_temp_unlocked()?;
        let mut snapshot = self
            .load_unlocked()?
            .ok_or(SystemUpdateError::NotInitialized)?;
        if mutation(&mut snapshot)? {
            validate_snapshot(&snapshot)?;
            self.append_unlocked(&snapshot)?;
        }
        Ok(snapshot)
    }

    fn load_unlocked(&self) -> Result<Option<SystemUpdateSnapshot>, SystemUpdateError> {
        let mut paths = Vec::new();
        for entry in fs::read_dir(&self.records).map_err(|source| SystemUpdateError::Io {
            operation: "list system update records",
            path: self.records.clone(),
            source,
        })? {
            let entry = entry.map_err(|source| SystemUpdateError::Io {
                operation: "read system update record entry",
                path: self.records.clone(),
                source,
            })?;
            let name = entry.file_name().into_string().map_err(|_| {
                SystemUpdateError::InvalidJournal("record name is not UTF-8".to_owned())
            })?;
            if name == TEMP_RECORD_FILE {
                continue;
            }
            let sequence = parse_record_name(&name)?;
            paths.push((sequence, entry.path()));
            if paths.len() > MAX_RECORDS {
                return Err(SystemUpdateError::InvalidJournal(format!(
                    "journal exceeds {MAX_RECORDS} records"
                )));
            }
        }
        paths.sort_by_key(|(sequence, _)| *sequence);

        let mut previous_hash = None;
        let mut latest: Option<SystemUpdateSnapshot> = None;
        for (index, (sequence, path)) in paths.into_iter().enumerate() {
            let expected = u64::try_from(index).map_err(|_| {
                SystemUpdateError::InvalidJournal("record index overflow".to_owned())
            })? + 1;
            if sequence != expected {
                return Err(SystemUpdateError::InvalidJournal(format!(
                    "record sequence {sequence} does not match expected {expected}"
                )));
            }
            require_regular_file(&path, "system update record")?;
            let bytes = read_bounded(&path)?;
            let record: JournalRecord = serde_json::from_slice(&bytes).map_err(|error| {
                SystemUpdateError::InvalidJournal(format!(
                    "record {sequence} is malformed: {error}"
                ))
            })?;
            if record.schema_version != JOURNAL_SCHEMA_VERSION
                || record.sequence != sequence
                || record.previous_record_sha256 != previous_hash
            {
                return Err(SystemUpdateError::InvalidJournal(format!(
                    "record {sequence} metadata or hash link is invalid"
                )));
            }
            validate_snapshot(&record.snapshot)?;
            if let Some(previous) = latest.as_ref() {
                validate_snapshot_transition(previous, &record.snapshot)?;
            } else {
                validate_initial_snapshot(&record.snapshot)?;
            }
            previous_hash = Some(sha256_bytes(&bytes));
            latest = Some(record.snapshot);
        }
        Ok(latest)
    }

    fn append_unlocked(&self, snapshot: &SystemUpdateSnapshot) -> Result<(), SystemUpdateError> {
        if let Some(previous) = self.load_unlocked()? {
            validate_snapshot_transition(&previous, snapshot)?;
        } else {
            validate_initial_snapshot(snapshot)?;
        }
        let paths = record_paths(&self.records)?;
        if paths.len() >= MAX_RECORDS {
            return Err(SystemUpdateError::InvalidJournal(format!(
                "journal reached {MAX_RECORDS} records"
            )));
        }
        let sequence = u64::try_from(paths.len())
            .map_err(|_| SystemUpdateError::InvalidJournal("record index overflow".to_owned()))?
            + 1;
        let previous_record_sha256 = paths
            .last()
            .map(|(_, path)| read_bounded(path).map(|bytes| sha256_bytes(&bytes)))
            .transpose()?;
        let record = JournalRecord {
            schema_version: JOURNAL_SCHEMA_VERSION,
            sequence,
            previous_record_sha256,
            snapshot: snapshot.clone(),
        };
        let bytes = serde_json::to_vec(&record)
            .map_err(|error| SystemUpdateError::InvalidState(error.to_string()))?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_RECORD_BYTES {
            return Err(SystemUpdateError::InvalidState(
                "serialized state exceeds record limit".to_owned(),
            ));
        }
        let temporary = self.temp_path();
        if path_exists(&temporary)? {
            return Err(SystemUpdateError::RecoveryRequired);
        }
        write_new(&temporary, &bytes)?;
        let final_path = self.records.join(format!("{sequence:020}.json"));
        fs::hard_link(&temporary, &final_path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                SystemUpdateError::RecoveryRequired
            } else {
                SystemUpdateError::Io {
                    operation: "publish system update record",
                    path: final_path.clone(),
                    source,
                }
            }
        })?;
        sync_directory(&self.records)?;
        fs::remove_file(&temporary).map_err(|source| SystemUpdateError::Io {
            operation: "remove published system update temp record",
            path: temporary,
            source,
        })?;
        sync_directory(&self.records)
    }

    fn recover_temp_unlocked(&self) -> Result<JournalRecovery, SystemUpdateError> {
        let temporary = self.temp_path();
        if !path_exists(&temporary)? {
            return Ok(JournalRecovery::Clean);
        }
        require_regular_file(&temporary, "system update temp record")?;
        let bytes = read_bounded(&temporary)?;
        let record: JournalRecord = serde_json::from_slice(&bytes).map_err(|error| {
            SystemUpdateError::InvalidJournal(format!("temporary record is malformed: {error}"))
        })?;
        if record.schema_version != JOURNAL_SCHEMA_VERSION || record.sequence == 0 {
            return Err(SystemUpdateError::InvalidJournal(
                "temporary record metadata is invalid".to_owned(),
            ));
        }
        let final_path = self.records.join(format!("{:020}.json", record.sequence));
        let outcome = if path_exists(&final_path)? {
            require_regular_file(&final_path, "system update record")?;
            if read_bounded(&final_path)? != bytes {
                return Err(SystemUpdateError::InvalidJournal(
                    "temporary record conflicts with its published record".to_owned(),
                ));
            }
            JournalRecovery::RemovedPublishedDuplicate
        } else {
            JournalRecovery::DiscardedUnpublished
        };
        fs::remove_file(&temporary).map_err(|source| SystemUpdateError::Io {
            operation: "remove recovered system update temp record",
            path: temporary,
            source,
        })?;
        sync_directory(&self.records)?;
        self.load_unlocked()?;
        Ok(outcome)
    }

    fn temp_path(&self) -> PathBuf {
        self.records.join(TEMP_RECORD_FILE)
    }

    fn acquire_operation_lock(&self) -> Result<SystemUpdateLock, SystemUpdateError> {
        require_regular_file(&self.operation_lock, "system update operation lock")?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&self.operation_lock)
            .map_err(|source| SystemUpdateError::Io {
                operation: "open system update operation lock",
                path: self.operation_lock.clone(),
                source,
            })?;
        match fs4::FileExt::try_lock(&file) {
            Ok(()) => Ok(SystemUpdateLock { _file: file }),
            Err(TryLockError::WouldBlock) => Err(SystemUpdateError::Busy),
            Err(TryLockError::Error(source)) => Err(SystemUpdateError::Io {
                operation: "lock system update journal",
                path: self.operation_lock.clone(),
                source,
            }),
        }
    }
}

struct SystemUpdateLock {
    _file: File,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JournalRecord {
    schema_version: u32,
    sequence: u64,
    previous_record_sha256: Option<String>,
    snapshot: SystemUpdateSnapshot,
}

fn rollback(
    snapshot: &mut SystemUpdateSnapshot,
    reason: SystemRollbackReason,
) -> Result<(), SystemUpdateError> {
    let pending = snapshot
        .pending
        .take()
        .ok_or(SystemUpdateError::NoPendingUpdate)?;
    let attempts_used = pending.max_attempts - pending.attempts_remaining;
    snapshot.last_rollback = Some(SystemRollback {
        generation: pending.image.generation,
        release_id: pending.image.release_id,
        slot: pending.image.slot,
        attempts_used,
        reason,
    });
    Ok(())
}

fn validate_snapshot(snapshot: &SystemUpdateSnapshot) -> Result<(), SystemUpdateError> {
    validate_image(&snapshot.active)?;
    if snapshot.highest_seen_generation < snapshot.active.generation {
        return Err(SystemUpdateError::InvalidState(
            "highest generation is below the active image".to_owned(),
        ));
    }
    if let Some(pending) = &snapshot.pending {
        validate_image(&pending.image)?;
        if pending.image.slot != snapshot.active.slot.other()
            || pending.image.target != snapshot.active.target
            || pending.image.generation != snapshot.highest_seen_generation
            || pending.image.generation <= snapshot.active.generation
        {
            return Err(SystemUpdateError::InvalidState(
                "pending image violates slot, target, or generation invariants".to_owned(),
            ));
        }
        match &pending.phase {
            PendingPhase::Staged
                if pending.max_attempts == 0 && pending.attempts_remaining == 0 => {}
            PendingPhase::Armed
                if (1..=MAX_BOOT_ATTEMPTS).contains(&pending.max_attempts)
                    && pending.attempts_remaining > 0
                    && pending.attempts_remaining <= pending.max_attempts => {}
            PendingPhase::Booting {
                attempt_id,
                passed_checks,
            } if (1..=MAX_BOOT_ATTEMPTS).contains(&pending.max_attempts)
                && pending.attempts_remaining < pending.max_attempts
                && *attempt_id > 0
                && *attempt_id == snapshot.last_attempt_id
                && passed_checks
                    .iter()
                    .all(|check| REQUIRED_HEALTH_CHECKS.contains(check)) => {}
            _ => {
                return Err(SystemUpdateError::InvalidState(
                    "pending phase or attempt counters are invalid".to_owned(),
                ));
            }
        }
    }
    if let Some(rollback) = &snapshot.last_rollback
        && (rollback.generation == 0
            || validate_identifier("rollback release ID", &rollback.release_id, 128).is_err()
            || rollback.attempts_used == 0
            || rollback.attempts_used > MAX_BOOT_ATTEMPTS
            || rollback.generation <= snapshot.active.generation
            || rollback.generation > snapshot.highest_seen_generation
            || rollback.slot != snapshot.active.slot.other())
    {
        return Err(SystemUpdateError::InvalidState(
            "rollback diagnostic is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn validate_initial_snapshot(snapshot: &SystemUpdateSnapshot) -> Result<(), SystemUpdateError> {
    if snapshot.highest_seen_generation != snapshot.active.generation
        || snapshot.last_attempt_id != 0
        || snapshot.pending.is_some()
        || snapshot.last_rollback.is_some()
    {
        return Err(SystemUpdateError::InvalidJournal(
            "first record is not one healthy initialized slot".to_owned(),
        ));
    }
    Ok(())
}

fn validate_snapshot_transition(
    previous: &SystemUpdateSnapshot,
    current: &SystemUpdateSnapshot,
) -> Result<(), SystemUpdateError> {
    let invalid = || {
        SystemUpdateError::InvalidJournal(
            "record contains an impossible system-update transition".to_owned(),
        )
    };
    if current.highest_seen_generation < previous.highest_seen_generation
        || current.active.target != previous.active.target
        || current.last_attempt_id < previous.last_attempt_id
    {
        return Err(invalid());
    }

    match (&previous.pending, &current.pending) {
        (None, Some(candidate)) => {
            if current.active != previous.active
                || current.highest_seen_generation <= previous.highest_seen_generation
                || candidate.image.generation != current.highest_seen_generation
                || candidate.phase != PendingPhase::Staged
                || current.last_rollback != previous.last_rollback
                || current.last_attempt_id != previous.last_attempt_id
            {
                return Err(invalid());
            }
        }
        (Some(before), Some(after)) => {
            if current.active != previous.active
                || current.highest_seen_generation != previous.highest_seen_generation
                || current.last_rollback != previous.last_rollback
                || before.image != after.image
                || !pending_transition_is_valid(previous, current, before, after)
            {
                return Err(invalid());
            }
        }
        (Some(before), None) => {
            if current.highest_seen_generation != previous.highest_seen_generation
                || current.last_attempt_id != previous.last_attempt_id
            {
                return Err(invalid());
            }
            let confirmed = if let PendingPhase::Booting { passed_checks, .. } = &before.phase {
                passed_checks.len() + 1 == REQUIRED_HEALTH_CHECKS.len()
                    && current.active == before.image
                    && current.last_rollback.is_none()
            } else {
                false
            };
            let rolled_back = if let (PendingPhase::Booting { .. }, Some(rollback)) =
                (&before.phase, &current.last_rollback)
            {
                let reason_matches_attempt = !matches!(
                    rollback.reason,
                    SystemRollbackReason::InterruptedAttemptsExhausted
                ) || before.attempts_remaining == 0;
                current.active == previous.active
                    && rollback.generation == before.image.generation
                    && rollback.release_id == before.image.release_id
                    && rollback.slot == before.image.slot
                    && rollback.attempts_used == before.max_attempts - before.attempts_remaining
                    && reason_matches_attempt
            } else {
                false
            };
            if !confirmed && !rolled_back {
                return Err(invalid());
            }
        }
        (None, None) => return Err(invalid()),
    }
    Ok(())
}

fn pending_transition_is_valid(
    previous: &SystemUpdateSnapshot,
    current: &SystemUpdateSnapshot,
    before: &PendingSystemUpdate,
    after: &PendingSystemUpdate,
) -> bool {
    match (&before.phase, &after.phase) {
        (PendingPhase::Staged, PendingPhase::Armed) => {
            before.max_attempts == 0
                && before.attempts_remaining == 0
                && (1..=MAX_BOOT_ATTEMPTS).contains(&after.max_attempts)
                && after.attempts_remaining == after.max_attempts
                && current.last_attempt_id == previous.last_attempt_id
        }
        (
            PendingPhase::Armed,
            PendingPhase::Booting {
                attempt_id,
                passed_checks,
            },
        ) => {
            before.max_attempts == after.max_attempts
                && before.attempts_remaining > 0
                && after.attempts_remaining == before.attempts_remaining - 1
                && previous.last_attempt_id.checked_add(1) == Some(current.last_attempt_id)
                && *attempt_id == current.last_attempt_id
                && passed_checks.is_empty()
        }
        (
            PendingPhase::Booting {
                attempt_id: before_attempt,
                passed_checks: before_checks,
            },
            PendingPhase::Booting {
                attempt_id: after_attempt,
                passed_checks: after_checks,
            },
        ) => {
            before.max_attempts == after.max_attempts
                && before.attempts_remaining == after.attempts_remaining
                && before_attempt == after_attempt
                && current.last_attempt_id == previous.last_attempt_id
                && after_checks.len() == before_checks.len() + 1
                && before_checks.is_subset(after_checks)
        }
        (PendingPhase::Booting { .. }, PendingPhase::Armed) => {
            before.max_attempts == after.max_attempts
                && before.attempts_remaining == after.attempts_remaining
                && after.attempts_remaining > 0
                && current.last_attempt_id == previous.last_attempt_id
        }
        _ => false,
    }
}

fn validate_image(image: &SystemImage) -> Result<(), SystemUpdateError> {
    if image.generation == 0 {
        return Err(SystemUpdateError::InvalidImage(
            "generation must be greater than zero".to_owned(),
        ));
    }
    validate_identifier("release ID", &image.release_id, 128)?;
    validate_identifier("target", &image.target, 64)?;
    validate_sha256("manifest SHA-256", &image.manifest_sha256)?;
    validate_sha256("image SHA-256", &image.image_sha256)
}

fn validate_identifier(kind: &str, value: &str, max_len: usize) -> Result<(), SystemUpdateError> {
    if value.is_empty()
        || value.len() > max_len
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(SystemUpdateError::InvalidImage(format!(
            "{kind} must be 1..={max_len} ASCII letters, digits, dot, underscore, or hyphen"
        )));
    }
    Ok(())
}

fn validate_sha256(kind: &str, value: &str) -> Result<(), SystemUpdateError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SystemUpdateError::InvalidImage(format!(
            "{kind} must be canonical lowercase hexadecimal"
        )));
    }
    Ok(())
}

fn record_paths(records: &Path) -> Result<Vec<(u64, PathBuf)>, SystemUpdateError> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(records).map_err(|source| SystemUpdateError::Io {
        operation: "list system update records",
        path: records.to_owned(),
        source,
    })? {
        let entry = entry.map_err(|source| SystemUpdateError::Io {
            operation: "read system update record entry",
            path: records.to_owned(),
            source,
        })?;
        let name = entry.file_name().into_string().map_err(|_| {
            SystemUpdateError::InvalidJournal("record name is not UTF-8".to_owned())
        })?;
        if name == TEMP_RECORD_FILE {
            continue;
        }
        paths.push((parse_record_name(&name)?, entry.path()));
        if paths.len() > MAX_RECORDS {
            return Err(SystemUpdateError::InvalidJournal(format!(
                "journal exceeds {MAX_RECORDS} records"
            )));
        }
    }
    paths.sort_by_key(|(sequence, _)| *sequence);
    Ok(paths)
}

fn parse_record_name(name: &str) -> Result<u64, SystemUpdateError> {
    let Some(number) = name.strip_suffix(".json") else {
        return Err(SystemUpdateError::InvalidJournal(format!(
            "unexpected record entry {name}"
        )));
    };
    if number.len() != 20 || !number.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(SystemUpdateError::InvalidJournal(format!(
            "record name {name} is not canonical"
        )));
    }
    number
        .parse()
        .map_err(|_| SystemUpdateError::InvalidJournal(format!("invalid record name {name}")))
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, SystemUpdateError> {
    let file = File::open(path).map_err(|source| SystemUpdateError::Io {
        operation: "open system update record",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_RECORD_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| SystemUpdateError::Io {
            operation: "read system update record",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_RECORD_BYTES {
        return Err(SystemUpdateError::InvalidJournal(
            "record exceeds size limit".to_owned(),
        ));
    }
    Ok(bytes)
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), SystemUpdateError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| SystemUpdateError::Io {
            operation: "create system update temp record",
            path: path.to_owned(),
            source,
        })?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| SystemUpdateError::Io {
            operation: "persist system update temp record",
            path: path.to_owned(),
            source,
        })
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(64);
    for byte in digest {
        use fmt::Write as _;
        write!(output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    output
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, SystemUpdateError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| SystemUpdateError::Io {
        operation: "inspect system update directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() {
        return Err(SystemUpdateError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    fs::canonicalize(path).map_err(|source| SystemUpdateError::Io {
        operation: "resolve system update directory",
        path: path.to_owned(),
        source,
    })
}

fn canonical_child_directory(
    root: &Path,
    name: &'static str,
) -> Result<PathBuf, SystemUpdateError> {
    let path = root.join(name);
    let canonical = canonical_directory("system update records", &path)?;
    if canonical.parent() != Some(root) {
        return Err(SystemUpdateError::UnsafePath {
            kind: "system update records",
            path,
        });
    }
    Ok(canonical)
}

fn canonical_direct_file(
    kind: &'static str,
    root: &Path,
    path: &Path,
) -> Result<PathBuf, SystemUpdateError> {
    require_regular_file(path, kind)?;
    let canonical = fs::canonicalize(path).map_err(|source| SystemUpdateError::Io {
        operation: "resolve system update file",
        path: path.to_owned(),
        source,
    })?;
    if canonical.parent() != Some(root) {
        return Err(SystemUpdateError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(canonical)
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), SystemUpdateError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| SystemUpdateError::Io {
        operation: "inspect system update file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(SystemUpdateError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn path_exists(path: &Path) -> Result<bool, SystemUpdateError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(SystemUpdateError::Io {
            operation: "inspect system update path",
            path: path.to_owned(),
            source,
        }),
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), SystemUpdateError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| SystemUpdateError::Io {
            operation: "synchronize system update directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), SystemUpdateError> {
    Ok(())
}

/// System-update state or journal failure.
#[derive(Debug)]
pub enum SystemUpdateError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidImage(String),
    InvalidState(String),
    InvalidJournal(String),
    AlreadyInitialized,
    NotInitialized,
    Busy,
    RecoveryRequired,
    PendingUpdateExists,
    NoPendingUpdate,
    CandidateIsNotInactive,
    TargetMismatch {
        active: String,
        candidate: String,
    },
    GenerationRollback {
        highest: u64,
        candidate: u64,
    },
    InvalidAttemptLimit(u8),
    AttemptBudgetExhausted,
    AttemptMismatch {
        expected: u64,
        actual: u64,
    },
    InvalidTransition(&'static str),
    InterruptedBootRequiresRecovery,
}

impl fmt::Display for SystemUpdateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                operation,
                path,
                source,
            } => write!(
                formatter,
                "{operation} failed for {}: {source}",
                path.display()
            ),
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidImage(error) => {
                write!(formatter, "system image evidence is invalid: {error}")
            }
            Self::InvalidState(error) => {
                write!(formatter, "system update state is invalid: {error}")
            }
            Self::InvalidJournal(error) => {
                write!(formatter, "system update journal is invalid: {error}")
            }
            Self::AlreadyInitialized => {
                formatter.write_str("system update journal is already initialized")
            }
            Self::NotInitialized => formatter.write_str("system update journal is not initialized"),
            Self::Busy => formatter.write_str("system update operation is already in progress"),
            Self::RecoveryRequired => {
                formatter.write_str("system update journal recovery is required")
            }
            Self::PendingUpdateExists => formatter.write_str("a system update is already pending"),
            Self::NoPendingUpdate => formatter.write_str("no system update is pending"),
            Self::CandidateIsNotInactive => {
                formatter.write_str("candidate image is not in the inactive slot")
            }
            Self::TargetMismatch { active, candidate } => {
                write!(
                    formatter,
                    "candidate target {candidate} does not match active target {active}"
                )
            }
            Self::GenerationRollback { highest, candidate } => write!(
                formatter,
                "candidate generation {candidate} does not advance highest seen generation {highest}"
            ),
            Self::InvalidAttemptLimit(limit) => write!(
                formatter,
                "boot attempt limit {limit} is outside 1..={MAX_BOOT_ATTEMPTS}"
            ),
            Self::AttemptBudgetExhausted => {
                formatter.write_str("candidate boot attempt budget is exhausted")
            }
            Self::AttemptMismatch { expected, actual } => {
                write!(
                    formatter,
                    "boot attempt {actual} does not match active attempt {expected}"
                )
            }
            Self::InvalidTransition(error) => {
                write!(formatter, "invalid system update transition: {error}")
            }
            Self::InterruptedBootRequiresRecovery => formatter.write_str(
                "interrupted candidate boot must be recovered before selecting another boot",
            ),
        }
    }
}

impl std::error::Error for SystemUpdateError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
        journal: SystemUpdateJournal,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root =
                std::env::temp_dir().join(format!("vcg-system-update-{}-{id}", std::process::id()));
            fs::create_dir(&root).expect("create fixture root");
            fs::create_dir(root.join(RECORDS_DIRECTORY)).expect("create records");
            File::create(root.join(OPERATION_LOCK_FILE)).expect("create lock");
            let journal = SystemUpdateJournal::open(&root).expect("open journal");
            Self { root, journal }
        }

        fn initialized() -> Self {
            let fixture = Self::new();
            fixture
                .journal
                .initialize(image(SystemSlot::A, 1, "release-1"))
                .expect("initialize journal");
            fixture
        }

        fn stage_and_arm(&self, attempts: u8) {
            self.journal
                .stage_verified_update(image(SystemSlot::B, 2, "release-2"))
                .expect("stage update");
            self.journal
                .arm_staged_update(attempts)
                .expect("arm update");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.root).expect("remove fixture");
        }
    }

    fn image(slot: SystemSlot, generation: u64, release: &str) -> SystemImage {
        SystemImage::new(
            slot,
            generation,
            release,
            "raspberry-pi-5",
            "1".repeat(64),
            "2".repeat(64),
        )
        .expect("valid image")
    }

    fn all_health(journal: &SystemUpdateJournal, attempt_id: u64) -> HealthProgress {
        let mut result = None;
        for check in REQUIRED_HEALTH_CHECKS {
            result = Some(
                journal
                    .pass_health_check(attempt_id, check)
                    .expect("pass health"),
            );
        }
        result.expect("health result")
    }

    fn record_count(fixture: &Fixture) -> usize {
        fs::read_dir(fixture.root.join(RECORDS_DIRECTORY))
            .expect("list records")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|value| value == "json")
            })
            .count()
    }

    #[test]
    fn initializes_and_reloads_hash_linked_state() {
        let fixture = Fixture::new();
        let state = fixture
            .journal
            .initialize(image(SystemSlot::A, 7, "release-7"))
            .expect("initialize");
        assert_eq!(state.active().generation(), 7);
        assert_eq!(fixture.journal.snapshot().expect("reload"), state);
        assert_eq!(
            fixture.journal.boot_selection().expect("selection"),
            SystemSlot::A
        );
    }

    #[test]
    fn stages_inactive_image_without_selecting_it() {
        let fixture = Fixture::initialized();
        let state = fixture
            .journal
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"))
            .expect("stage");
        assert_eq!(
            state.pending().expect("pending").phase(),
            &PendingPhase::Staged
        );
        assert_eq!(
            fixture.journal.boot_selection().expect("selection"),
            SystemSlot::A
        );
    }

    #[test]
    fn rejects_active_slot_target_mismatch_and_generation_rollback() {
        let fixture = Fixture::initialized();
        assert!(matches!(
            fixture
                .journal
                .stage_verified_update(image(SystemSlot::A, 2, "release-2")),
            Err(SystemUpdateError::CandidateIsNotInactive)
        ));
        let wrong_target = SystemImage::new(
            SystemSlot::B,
            2,
            "release-2",
            "other-target",
            "1".repeat(64),
            "2".repeat(64),
        )
        .expect("valid shape");
        assert!(matches!(
            fixture.journal.stage_verified_update(wrong_target),
            Err(SystemUpdateError::TargetMismatch { .. })
        ));
        assert!(matches!(
            fixture
                .journal
                .stage_verified_update(image(SystemSlot::B, 1, "release-old")),
            Err(SystemUpdateError::GenerationRollback { .. })
        ));
    }

    #[test]
    fn arm_and_claim_are_durable_and_bounded() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(2);
        assert_eq!(
            fixture.journal.boot_selection().expect("selection"),
            SystemSlot::A
        );
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        assert_eq!(claim.slot(), SystemSlot::B);
        assert_eq!(claim.generation(), 2);
        assert_eq!(claim.attempt_id(), 1);
        assert_eq!(claim.attempts_remaining(), 1);
        assert!(matches!(
            fixture.journal.boot_selection(),
            Err(SystemUpdateError::InterruptedBootRequiresRecovery)
        ));
    }

    #[test]
    fn interrupted_boot_retries_then_rolls_back_on_exhaustion() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(2);
        fixture.journal.claim_pending_boot().expect("first claim");
        assert_eq!(
            fixture
                .journal
                .recover_interrupted_boot()
                .expect("recover first"),
            InterruptedBootRecovery::RetryPending {
                slot: SystemSlot::B,
                attempts_remaining: 1
            }
        );
        let second = fixture.journal.claim_pending_boot().expect("second claim");
        assert_eq!(second.attempt_id(), 2);
        assert_eq!(
            fixture
                .journal
                .recover_interrupted_boot()
                .expect("recover second"),
            InterruptedBootRecovery::RolledBack {
                active_slot: SystemSlot::A,
                rejected_generation: 2
            }
        );
        let state = fixture.journal.snapshot().expect("state");
        assert_eq!(state.active().slot(), SystemSlot::A);
        assert!(state.pending().is_none());
        assert_eq!(
            state.last_rollback().expect("rollback").reason(),
            &SystemRollbackReason::InterruptedAttemptsExhausted
        );
    }

    #[test]
    fn all_six_health_gates_confirm_candidate() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(3);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        let result = all_health(&fixture.journal, claim.attempt_id());
        let HealthProgress::Confirmed { active } = result else {
            panic!("candidate was not confirmed");
        };
        assert_eq!(active.slot(), SystemSlot::B);
        assert_eq!(
            fixture.journal.boot_selection().expect("selection"),
            SystemSlot::B
        );
    }

    #[test]
    fn one_missing_gate_never_confirms_candidate() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(1);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        for check in REQUIRED_HEALTH_CHECKS
            .into_iter()
            .filter(|check| *check != SystemHealthCheck::Storage)
        {
            let progress = fixture
                .journal
                .pass_health_check(claim.attempt_id(), check)
                .expect("pass");
            assert!(matches!(progress, HealthProgress::Pending { .. }));
        }
        assert_eq!(
            fixture.journal.snapshot().expect("state").active().slot(),
            SystemSlot::A
        );
    }

    #[test]
    fn duplicate_health_pass_is_idempotent_without_growing_the_journal() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(1);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        let first = fixture
            .journal
            .pass_health_check(claim.attempt_id(), SystemHealthCheck::Launcher)
            .expect("first pass");
        let records_after_first = record_count(&fixture);
        let duplicate = fixture
            .journal
            .pass_health_check(claim.attempt_id(), SystemHealthCheck::Launcher)
            .expect("duplicate pass");
        assert_eq!(duplicate, first);
        assert_eq!(record_count(&fixture), records_after_first);
    }

    #[test]
    fn failed_gate_and_timeout_roll_back_immediately() {
        for reason in [SystemHealthCheck::Camera, SystemHealthCheck::Network] {
            let fixture = Fixture::initialized();
            fixture.stage_and_arm(3);
            let claim = fixture.journal.claim_pending_boot().expect("claim");
            let state = fixture
                .journal
                .fail_health_check(claim.attempt_id(), reason)
                .expect("fail");
            assert_eq!(state.active().slot(), SystemSlot::A);
            assert_eq!(
                state.last_rollback().expect("rollback").reason(),
                &SystemRollbackReason::FailedHealthCheck { check: reason }
            );
        }

        let fixture = Fixture::initialized();
        fixture.stage_and_arm(3);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        let state = fixture
            .journal
            .expire_health_window(claim.attempt_id())
            .expect("expire");
        assert_eq!(
            state.last_rollback().expect("rollback").reason(),
            &SystemRollbackReason::HealthWindowExpired
        );
    }

    #[test]
    fn stale_attempt_cannot_report_health_or_force_rollback() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(2);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        assert!(matches!(
            fixture
                .journal
                .pass_health_check(claim.attempt_id() + 1, SystemHealthCheck::Launcher),
            Err(SystemUpdateError::AttemptMismatch { .. })
        ));
        assert!(matches!(
            fixture.journal.expire_health_window(claim.attempt_id() + 1),
            Err(SystemUpdateError::AttemptMismatch { .. })
        ));
    }

    #[test]
    fn health_passes_do_not_cross_interrupted_attempts() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(2);
        let first = fixture.journal.claim_pending_boot().expect("first claim");
        fixture
            .journal
            .pass_health_check(first.attempt_id(), SystemHealthCheck::Launcher)
            .expect("pass first-attempt launcher");
        fixture
            .journal
            .recover_interrupted_boot()
            .expect("recover first attempt");
        let second = fixture.journal.claim_pending_boot().expect("second claim");
        for check in REQUIRED_HEALTH_CHECKS
            .into_iter()
            .filter(|check| *check != SystemHealthCheck::Launcher)
        {
            assert!(matches!(
                fixture
                    .journal
                    .pass_health_check(second.attempt_id(), check)
                    .expect("pass second-attempt gate"),
                HealthProgress::Pending { .. }
            ));
        }
        assert_eq!(
            fixture.journal.snapshot().expect("state").active().slot(),
            SystemSlot::A
        );
    }

    #[test]
    fn failed_generation_cannot_be_replayed() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(1);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        fixture
            .journal
            .expire_health_window(claim.attempt_id())
            .expect("rollback");
        assert!(matches!(
            fixture
                .journal
                .stage_verified_update(image(SystemSlot::B, 2, "release-2-replay")),
            Err(SystemUpdateError::GenerationRollback {
                highest: 2,
                candidate: 2
            })
        ));
        fixture
            .journal
            .stage_verified_update(image(SystemSlot::B, 3, "release-3"))
            .expect("newer generation");
    }

    #[test]
    fn confirmed_update_can_stage_the_other_slot() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(1);
        let claim = fixture.journal.claim_pending_boot().expect("claim");
        assert!(matches!(
            all_health(&fixture.journal, claim.attempt_id()),
            HealthProgress::Confirmed { .. }
        ));
        let state = fixture
            .journal
            .stage_verified_update(image(SystemSlot::A, 3, "release-3"))
            .expect("stage next update");
        assert_eq!(
            state.pending().expect("pending").image().slot(),
            SystemSlot::A
        );
        assert_eq!(state.active().slot(), SystemSlot::B);
        fixture.journal.arm_staged_update(1).expect("arm next");
        let next = fixture.journal.claim_pending_boot().expect("claim next");
        assert_eq!(next.attempt_id(), claim.attempt_id() + 1);
        assert!(matches!(
            fixture
                .journal
                .fail_health_check(claim.attempt_id(), SystemHealthCheck::Launcher),
            Err(SystemUpdateError::AttemptMismatch {
                expected,
                actual
            }) if expected == next.attempt_id() && actual == claim.attempt_id()
        ));
    }

    #[test]
    fn invalid_attempt_limits_and_second_pending_update_are_rejected() {
        let fixture = Fixture::initialized();
        fixture
            .journal
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"))
            .expect("stage");
        assert!(matches!(
            fixture.journal.arm_staged_update(0),
            Err(SystemUpdateError::InvalidAttemptLimit(0))
        ));
        assert!(matches!(
            fixture.journal.arm_staged_update(MAX_BOOT_ATTEMPTS + 1),
            Err(SystemUpdateError::InvalidAttemptLimit(_))
        ));
        assert!(matches!(
            fixture
                .journal
                .stage_verified_update(image(SystemSlot::B, 3, "release-3")),
            Err(SystemUpdateError::PendingUpdateExists)
        ));
    }

    #[test]
    fn malformed_or_gapped_journal_fails_closed() {
        let fixture = Fixture::initialized();
        fs::write(
            fixture.root.join("records/00000000000000000002.json"),
            b"{}",
        )
        .expect("write corrupt record");
        assert!(matches!(
            fixture.journal.snapshot(),
            Err(SystemUpdateError::InvalidJournal(_))
        ));

        let fixture = Fixture::initialized();
        fs::rename(
            fixture.root.join("records/00000000000000000001.json"),
            fixture.root.join("records/00000000000000000002.json"),
        )
        .expect("create gap");
        assert!(matches!(
            fixture.journal.snapshot(),
            Err(SystemUpdateError::InvalidJournal(_))
        ));
    }

    #[test]
    fn changed_history_breaks_the_next_hash_link() {
        let fixture = Fixture::initialized();
        fixture
            .journal
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"))
            .expect("stage");
        let first = fixture.root.join("records/00000000000000000001.json");
        let changed = String::from_utf8(fs::read(&first).expect("read first"))
            .expect("record is UTF-8")
            .replace("release-1", "release-x");
        fs::write(first, changed).expect("tamper first record");
        assert!(matches!(
            fixture.journal.snapshot(),
            Err(SystemUpdateError::InvalidJournal(_))
        ));
    }

    #[test]
    fn rehashed_but_impossible_transition_fails_closed() {
        let fixture = Fixture::initialized();
        let first_path = fixture.root.join("records/00000000000000000001.json");
        let record = JournalRecord {
            schema_version: JOURNAL_SCHEMA_VERSION,
            sequence: 2,
            previous_record_sha256: Some(sha256_bytes(
                &read_bounded(&first_path).expect("read first record"),
            )),
            snapshot: fixture.journal.snapshot().expect("state"),
        };
        fs::write(
            fixture.root.join("records/00000000000000000002.json"),
            serde_json::to_vec(&record).expect("serialize"),
        )
        .expect("write impossible record");
        assert!(matches!(
            fixture.journal.snapshot(),
            Err(SystemUpdateError::InvalidJournal(_))
        ));
    }

    #[test]
    fn unknown_record_entry_fails_closed() {
        let fixture = Fixture::initialized();
        File::create(fixture.root.join("records/surprise")).expect("create entry");
        assert!(matches!(
            fixture.journal.snapshot(),
            Err(SystemUpdateError::InvalidJournal(_))
        ));
    }

    #[test]
    fn unpublished_temp_is_discarded_and_published_duplicate_is_cleaned() {
        let fixture = Fixture::initialized();
        let mut next_snapshot = fixture.journal.snapshot().expect("state");
        next_snapshot.highest_seen_generation = 2;
        next_snapshot.pending = Some(PendingSystemUpdate {
            image: image(SystemSlot::B, 2, "release-2"),
            max_attempts: 0,
            attempts_remaining: 0,
            phase: PendingPhase::Staged,
        });
        let record = JournalRecord {
            schema_version: JOURNAL_SCHEMA_VERSION,
            sequence: 2,
            previous_record_sha256: Some(sha256_bytes(
                &read_bounded(&fixture.root.join("records/00000000000000000001.json"))
                    .expect("read first record"),
            )),
            snapshot: next_snapshot,
        };
        let bytes = serde_json::to_vec(&record).expect("serialize");
        fs::write(fixture.root.join("records").join(TEMP_RECORD_FILE), &bytes).expect("write temp");
        assert!(matches!(
            fixture.journal.snapshot(),
            Err(SystemUpdateError::RecoveryRequired)
        ));
        assert_eq!(
            fixture.journal.recover().expect("recover"),
            JournalRecovery::DiscardedUnpublished
        );

        fs::write(fixture.root.join("records").join(TEMP_RECORD_FILE), &bytes).expect("write temp");
        fs::hard_link(
            fixture.root.join("records").join(TEMP_RECORD_FILE),
            fixture.root.join("records/00000000000000000002.json"),
        )
        .expect("publish duplicate");
        assert_eq!(
            fixture.journal.recover().expect("recover"),
            JournalRecovery::RemovedPublishedDuplicate
        );
        assert_eq!(
            fixture
                .journal
                .snapshot()
                .expect("published")
                .active()
                .slot(),
            SystemSlot::A
        );
    }

    #[test]
    fn malformed_temp_record_fails_closed() {
        let fixture = Fixture::initialized();
        fs::write(
            fixture.root.join("records").join(TEMP_RECORD_FILE),
            b"not-json",
        )
        .expect("write malformed temp");
        assert!(matches!(
            fixture.journal.recover(),
            Err(SystemUpdateError::InvalidJournal(_))
        ));
    }

    #[test]
    fn invalid_image_evidence_is_rejected() {
        assert!(
            SystemImage::new(
                SystemSlot::A,
                0,
                "release",
                "target",
                "1".repeat(64),
                "2".repeat(64)
            )
            .is_err()
        );
        assert!(
            SystemImage::new(
                SystemSlot::A,
                1,
                "../release",
                "target",
                "1".repeat(64),
                "2".repeat(64)
            )
            .is_err()
        );
        assert!(
            SystemImage::new(
                SystemSlot::A,
                1,
                "release",
                "target",
                "A".repeat(64),
                "2".repeat(64)
            )
            .is_err()
        );
    }
}
