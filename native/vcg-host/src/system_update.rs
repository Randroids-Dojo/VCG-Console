//! Crash-recoverable metadata for an atomic two-slot system update.
//!
//! This module deliberately owns boot-selection metadata only. A privileged
//! image writer must verify signatures and the bytes written to an inactive
//! read-only slot before producing sealed [`VerifiedSystemImageEvidence`]. A
//! boot coordinator must durably claim a pending attempt before transferring
//! control, and the running candidate must pass every required health check
//! before confirmation. Every committed journal record is additionally bound
//! to exact target/sequence/digest state supplied by a platform-protected
//! monotonic-storage adapter. A mutation returns the next exact state, which
//! must be committed before any later read, boot selection, or mutation.

use std::collections::BTreeSet;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const JOURNAL_SCHEMA_VERSION: u32 = 2;
const RECORDS_DIRECTORY: &str = "records";
const OPERATION_LOCK_FILE: &str = ".vcg-system-update.lock";
const TEMP_RECORD_FILE: &str = ".next-record.tmp";
const MAX_RECORD_BYTES: u64 = 64 * 1_024;
const MAX_RECORDS: usize = 16_384;
const MAX_BOOT_ATTEMPTS: u8 = 10;
pub const MAX_SYSTEM_IMAGE_BYTES: u64 = 64 * 1_024 * 1_024 * 1_024;
const PROTECTED_STATE_SCHEMA_VERSION: u32 = 1;
/// Maximum serialized journal state accepted from the platform adapter.
pub const MAX_PROTECTED_SYSTEM_UPDATE_STATE_BYTES: usize = 1_024;
const REQUIRED_HEALTH_CHECKS: [SystemHealthCheck; 6] = [
    SystemHealthCheck::Launcher,
    SystemHealthCheck::Tracker,
    SystemHealthCheck::Camera,
    SystemHealthCheck::Controller,
    SystemHealthCheck::Network,
    SystemHealthCheck::Storage,
];

/// Exact latest system-update journal identity held outside writable history.
///
/// The JSON form is an adapter boundary. Production must store it in
/// platform-protected monotonic storage with exact compare-and-swap.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedSystemUpdateState {
    schema_version: u32,
    channel: String,
    target: String,
    sequence: u64,
    record_sha256: Option<String>,
}

impl ProtectedSystemUpdateState {
    /// Creates the state for a provisioned target before journal
    /// initialization.
    ///
    /// # Errors
    ///
    /// Rejects an unsafe target identifier.
    pub fn initial(
        channel: impl Into<String>,
        target: impl Into<String>,
    ) -> Result<Self, SystemUpdateError> {
        let state = Self {
            schema_version: PROTECTED_STATE_SCHEMA_VERSION,
            channel: channel.into(),
            target: target.into(),
            sequence: 0,
            record_sha256: None,
        };
        state.validate()?;
        Ok(state)
    }

    /// Parses one bounded closed adapter document.
    ///
    /// # Errors
    ///
    /// Rejects empty, oversized, malformed, unknown-field, unsupported, or
    /// internally inconsistent state.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, SystemUpdateError> {
        if bytes.is_empty() || bytes.len() > MAX_PROTECTED_SYSTEM_UPDATE_STATE_BYTES {
            return Err(SystemUpdateError::InvalidProtectedState(format!(
                "document must be 1..={MAX_PROTECTED_SYSTEM_UPDATE_STATE_BYTES} bytes"
            )));
        }
        let state: Self = serde_json::from_slice(bytes)
            .map_err(|error| SystemUpdateError::InvalidProtectedState(error.to_string()))?;
        state.validate()?;
        Ok(state)
    }

    /// Serializes the exact adapter document returned after journal mutation.
    ///
    /// # Errors
    ///
    /// Returns a validation or serialization error.
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, SystemUpdateError> {
        self.validate()?;
        serde_json::to_vec(self)
            .map_err(|error| SystemUpdateError::InvalidProtectedState(error.to_string()))
    }

    #[must_use]
    pub fn channel(&self) -> &str {
        &self.channel
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    #[must_use]
    pub const fn sequence(&self) -> u64 {
        self.sequence
    }

    #[must_use]
    pub fn record_sha256(&self) -> Option<&str> {
        self.record_sha256.as_deref()
    }

    fn for_record(channel: &str, target: &str, sequence: u64, record_sha256: String) -> Self {
        Self {
            schema_version: PROTECTED_STATE_SCHEMA_VERSION,
            channel: channel.to_owned(),
            target: target.to_owned(),
            sequence,
            record_sha256: Some(record_sha256),
        }
    }

    fn validate(&self) -> Result<(), SystemUpdateError> {
        if self.schema_version != PROTECTED_STATE_SCHEMA_VERSION {
            return Err(SystemUpdateError::InvalidProtectedState(format!(
                "schema {} is unsupported",
                self.schema_version
            )));
        }
        validate_protected_scope("channel", &self.channel)?;
        validate_protected_scope("target", &self.target)?;
        match (self.sequence, self.record_sha256.as_deref()) {
            (0, None) => Ok(()),
            (0, Some(_)) => Err(SystemUpdateError::InvalidProtectedState(
                "sequence zero must not contain a record digest".to_owned(),
            )),
            (_, None) => Err(SystemUpdateError::InvalidProtectedState(
                "a nonzero sequence requires a record digest".to_owned(),
            )),
            (_, Some(digest)) if is_canonical_sha256(digest) => Ok(()),
            (_, Some(_)) => Err(SystemUpdateError::InvalidProtectedState(
                "record digest is not canonical lowercase SHA-256".to_owned(),
            )),
        }
    }
}

/// One journal operation result and the exact state that must be committed
/// before any subsequent journal use.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SystemUpdateTransition<T> {
    pub outcome: T,
    pub protected_state: ProtectedSystemUpdateState,
}

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

/// Persisted journal facts for one verified image already written to a slot.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SystemImage {
    slot: SystemSlot,
    generation: u64,
    release_id: String,
    channel: String,
    target: String,
    image_size_bytes: u64,
    manifest_sha256: String,
    image_sha256: String,
}

impl SystemImage {
    /// Constructs the persisted image facts held inside sealed evidence.
    ///
    /// This validates only their shape. The system-image verifier remains
    /// responsible for signature verification and read-back hashing.
    ///
    /// # Errors
    ///
    /// Rejects zero generations, unsafe identifiers, and noncanonical hashes.
    fn new(
        slot: SystemSlot,
        generation: u64,
        release_id: impl Into<String>,
        channel: impl Into<String>,
        target: impl Into<String>,
        image_size_bytes: u64,
        hashes: (String, String),
    ) -> Result<Self, SystemUpdateError> {
        let image = Self {
            slot,
            generation,
            release_id: release_id.into(),
            channel: channel.into(),
            target: target.into(),
            image_size_bytes,
            manifest_sha256: hashes.0,
            image_sha256: hashes.1,
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
    pub fn channel(&self) -> &str {
        &self.channel
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    #[must_use]
    pub const fn image_size_bytes(&self) -> u64 {
        self.image_size_bytes
    }
}

/// Sealed evidence accepted by journal initialization and staging.
///
/// Unlike [`SystemImage`], this type is not deserializable and cannot be
/// assembled from caller-supplied snapshot JSON.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedSystemImageEvidence {
    image: SystemImage,
}

impl VerifiedSystemImageEvidence {
    pub(crate) fn new(
        slot: SystemSlot,
        generation: u64,
        release_id: impl Into<String>,
        channel: impl Into<String>,
        target: impl Into<String>,
        image_size_bytes: u64,
        hashes: (String, String),
    ) -> Result<Self, SystemUpdateError> {
        Ok(Self {
            image: SystemImage::new(
                slot,
                generation,
                release_id,
                channel,
                target,
                image_size_bytes,
                hashes,
            )?,
        })
    }

    #[must_use]
    pub const fn image(&self) -> &SystemImage {
        &self.image
    }

    fn into_image(self) -> SystemImage {
        self.image
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

struct LoadedJournal {
    sequence: u64,
    record_sha256: String,
    snapshot: SystemUpdateSnapshot,
}

impl LoadedJournal {
    fn protected_state(&self) -> ProtectedSystemUpdateState {
        ProtectedSystemUpdateState::for_record(
            &self.snapshot.active.channel,
            &self.snapshot.active.target,
            self.sequence,
            self.record_sha256.clone(),
        )
    }
}

enum TransitionPosition {
    Exact(Option<LoadedJournal>),
    OneAhead {
        previous: Option<LoadedJournal>,
        latest: Box<LoadedJournal>,
    },
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
    /// The returned exact state must be atomically committed before the
    /// journal can be used. Repeating the exact initialization with the old
    /// state recovers a crash after record publication; different evidence
    /// cannot claim the pending record.
    ///
    /// # Errors
    ///
    /// Rejects invalid image evidence, protected-state mismatch, existing
    /// state, lock contention, or an unsafe/corrupt journal.
    pub fn initialize(
        &self,
        active: VerifiedSystemImageEvidence,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        let active = active.into_image();
        if active.target != protected_state.target {
            return Err(SystemUpdateError::ProtectedTargetMismatch {
                expected: protected_state.target.clone(),
                actual: active.target,
            });
        }
        if active.channel != protected_state.channel {
            return Err(SystemUpdateError::ProtectedChannelMismatch {
                expected: protected_state.channel.clone(),
                actual: active.channel,
            });
        }
        let snapshot = SystemUpdateSnapshot {
            highest_seen_generation: active.generation,
            last_attempt_id: 0,
            active,
            pending: None,
            last_rollback: None,
        };
        validate_snapshot(&snapshot)?;
        let _operation = self.acquire_operation_lock()?;
        match self.transition_position_unlocked(protected_state)? {
            TransitionPosition::Exact(None) => {
                if path_exists(&self.temp_path())? {
                    self.recover_temp_unlocked()?;
                    if !matches!(
                        self.transition_position_unlocked(protected_state)?,
                        TransitionPosition::Exact(None)
                    ) {
                        return Err(SystemUpdateError::RecoveryRequired);
                    }
                }
                let protected_state = self.append_unlocked(&snapshot)?;
                Ok(SystemUpdateTransition {
                    outcome: snapshot,
                    protected_state,
                })
            }
            TransitionPosition::Exact(Some(_)) => Err(SystemUpdateError::AlreadyInitialized),
            TransitionPosition::OneAhead {
                previous: Some(_),
                latest,
            } => Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: protected_state.sequence,
                journal_sequence: latest.sequence,
            }),
            TransitionPosition::OneAhead {
                previous: None,
                latest,
            } => {
                let expected = expected_next_protected_state(None, &snapshot)?;
                if expected != latest.protected_state() {
                    return Err(SystemUpdateError::ProtectionCommitRequired {
                        protected_sequence: protected_state.sequence,
                        journal_sequence: latest.sequence,
                    });
                }
                if path_exists(&self.temp_path())? {
                    self.recover_temp_unlocked()?;
                }
                Ok(SystemUpdateTransition {
                    outcome: snapshot,
                    protected_state: expected,
                })
            }
        }
    }

    /// Loads and validates the complete hash-linked journal against exact
    /// platform-protected state.
    ///
    /// # Errors
    ///
    /// Rejects uninitialized, recovery-pending, rolled-back, substituted,
    /// uncommitted, malformed, gapped, or corrupt journals.
    pub fn snapshot(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
        protected_state.validate()?;
        if path_exists(&self.temp_path())? {
            return Err(SystemUpdateError::RecoveryRequired);
        }
        self.load_protected_unlocked(protected_state)?
            .map(|loaded| loaded.snapshot)
            .ok_or(SystemUpdateError::NotInitialized)
    }

    /// Resolves the one allowed leftover temporary record.
    ///
    /// An unpublished temp record is discarded. If its immutable final link
    /// exists with identical bytes, only the duplicate temp name is removed.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, protected-state mismatch, unsafe paths,
    /// conflicting records, and corrupt journal state. An already-published
    /// record must first be authenticated by retrying the exact operation and
    /// committing its returned state.
    pub fn recover(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<JournalRecovery, SystemUpdateError> {
        let _operation = self.acquire_operation_lock()?;
        self.load_protected_unlocked(protected_state)?;
        let outcome = self.recover_temp_unlocked()?;
        self.load_protected_unlocked(protected_state)?;
        Ok(outcome)
    }

    /// Records an exactly verified image in the inactive slot without changing
    /// boot selection.
    ///
    /// The returned state must be committed before arming or selecting a boot.
    /// An exact sealed-evidence retry can recover publication before that
    /// commit.
    ///
    /// # Errors
    ///
    /// Rejects an occupied pending slot, target/protected-state mismatch,
    /// non-inactive slot, generation rollback, lock contention, or corrupt
    /// state.
    pub fn stage_verified_update(
        &self,
        image: VerifiedSystemImageEvidence,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        self.mutate(protected_state, |snapshot| {
            let image = image.into_image();
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
            if image.channel != snapshot.active.channel {
                return Err(SystemUpdateError::ChannelMismatch {
                    active: snapshot.active.channel.clone(),
                    candidate: image.channel.clone(),
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
    /// The returned state must be committed before claiming an attempt.
    ///
    /// # Errors
    ///
    /// Rejects limits outside `1..=10`, protected-state mismatch, invalid
    /// phases, lock contention, or corrupt state.
    pub fn arm_staged_update(
        &self,
        max_attempts: u8,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        if !(1..=MAX_BOOT_ATTEMPTS).contains(&max_attempts) {
            return Err(SystemUpdateError::InvalidAttemptLimit(max_attempts));
        }
        self.mutate(protected_state, |snapshot| {
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
    /// Rejects recovery-pending, uninitialized, protected-state-mismatched,
    /// malformed, or corrupt state.
    pub fn boot_selection(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemSlot, SystemUpdateError> {
        let snapshot = self.snapshot(protected_state)?;
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
    /// The caller must commit the returned protected state before transferring
    /// control. Repeating the claim with the prior state recovers the same
    /// attempt rather than consuming another one.
    ///
    /// # Errors
    ///
    /// Rejects missing/unarmed candidates, exhausted budgets, protected-state
    /// mismatch, lock contention, or corrupt state.
    pub fn claim_pending_boot(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<PendingBootClaim>, SystemUpdateError> {
        let mut claim = None;
        let transition = self.mutate(protected_state, |snapshot| {
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
        let outcome = claim.ok_or(SystemUpdateError::InvalidState(
            "boot claim was not produced".to_owned(),
        ))?;
        Ok(SystemUpdateTransition {
            outcome,
            protected_state: transition.protected_state,
        })
    }

    /// Converts a boot-in-progress record found after restart into one retry,
    /// or rolls back after the last attempt was consumed.
    ///
    /// The returned state must be committed before the retry or rollback may
    /// guide boot selection.
    ///
    /// # Errors
    ///
    /// Rejects protected-state mismatch, lock contention, recovery ambiguity,
    /// or corrupt state.
    pub fn recover_interrupted_boot(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<InterruptedBootRecovery>, SystemUpdateError> {
        let mut outcome = InterruptedBootRecovery::NoInterruptedBoot;
        let transition = self.mutate_if_changed(protected_state, |snapshot| {
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
        Ok(SystemUpdateTransition {
            outcome,
            protected_state: transition.protected_state,
        })
    }

    /// Persists one passing gate and confirms the candidate only after all six
    /// selected D-050 gates have passed in the same boot attempt.
    ///
    /// The returned state must be committed before another health transition
    /// or confirmed boot selection.
    ///
    /// # Errors
    ///
    /// Rejects missing or stale attempts, protected-state mismatch, invalid
    /// phases, lock contention, or corrupt state.
    pub fn pass_health_check(
        &self,
        attempt_id: u64,
        check: SystemHealthCheck,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<HealthProgress>, SystemUpdateError> {
        let mut progress = None;
        let transition = self.mutate_if_changed(protected_state, |snapshot| {
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
        let outcome = progress.ok_or(SystemUpdateError::InvalidState(
            "health progress was not produced".to_owned(),
        ))?;
        Ok(SystemUpdateTransition {
            outcome,
            protected_state: transition.protected_state,
        })
    }

    /// Rejects the candidate immediately when a required gate fails.
    ///
    /// The returned rollback state must be committed before boot selection.
    ///
    /// # Errors
    ///
    /// Rejects missing or stale attempts, protected-state mismatch, invalid
    /// phases, lock contention, or corrupt state.
    pub fn fail_health_check(
        &self,
        attempt_id: u64,
        check: SystemHealthCheck,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        self.rollback_attempt(
            attempt_id,
            SystemRollbackReason::FailedHealthCheck { check },
            protected_state,
        )
    }

    /// Rejects the candidate when the privileged watchdog's bounded health
    /// window expires.
    ///
    /// The returned rollback state must be committed before boot selection.
    ///
    /// # Errors
    ///
    /// Rejects missing or stale attempts, protected-state mismatch, invalid
    /// phases, lock contention, or corrupt state.
    pub fn expire_health_window(
        &self,
        attempt_id: u64,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        self.rollback_attempt(
            attempt_id,
            SystemRollbackReason::HealthWindowExpired,
            protected_state,
        )
    }

    fn rollback_attempt(
        &self,
        attempt_id: u64,
        reason: SystemRollbackReason,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        self.mutate(protected_state, |snapshot| {
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
        protected_state: &ProtectedSystemUpdateState,
        mutation: impl FnOnce(&mut SystemUpdateSnapshot) -> Result<(), SystemUpdateError>,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        self.mutate_if_changed(protected_state, |snapshot| {
            mutation(snapshot)?;
            Ok(true)
        })
    }

    fn mutate_if_changed(
        &self,
        protected_state: &ProtectedSystemUpdateState,
        mutation: impl FnOnce(&mut SystemUpdateSnapshot) -> Result<bool, SystemUpdateError>,
    ) -> Result<SystemUpdateTransition<SystemUpdateSnapshot>, SystemUpdateError> {
        let _operation = self.acquire_operation_lock()?;
        match self.transition_position_unlocked(protected_state)? {
            TransitionPosition::Exact(Some(mut loaded)) => {
                if path_exists(&self.temp_path())? {
                    self.recover_temp_unlocked()?;
                    loaded = match self.transition_position_unlocked(protected_state)? {
                        TransitionPosition::Exact(Some(loaded)) => loaded,
                        _ => return Err(SystemUpdateError::RecoveryRequired),
                    };
                }
                let mut snapshot = loaded.snapshot;
                let mut next_protected_state = protected_state.clone();
                if mutation(&mut snapshot)? {
                    validate_snapshot(&snapshot)?;
                    next_protected_state = self.append_unlocked(&snapshot)?;
                }
                Ok(SystemUpdateTransition {
                    outcome: snapshot,
                    protected_state: next_protected_state,
                })
            }
            TransitionPosition::OneAhead {
                previous: Some(previous),
                latest,
            } => {
                let mut snapshot = previous.snapshot.clone();
                if !mutation(&mut snapshot)? {
                    return Err(SystemUpdateError::ProtectionCommitRequired {
                        protected_sequence: protected_state.sequence,
                        journal_sequence: latest.sequence,
                    });
                }
                validate_snapshot(&snapshot)?;
                let expected = expected_next_protected_state(Some(&previous), &snapshot)?;
                if expected != latest.protected_state() {
                    return Err(SystemUpdateError::ProtectionCommitRequired {
                        protected_sequence: protected_state.sequence,
                        journal_sequence: latest.sequence,
                    });
                }
                if path_exists(&self.temp_path())? {
                    self.recover_temp_unlocked()?;
                }
                Ok(SystemUpdateTransition {
                    outcome: snapshot,
                    protected_state: expected,
                })
            }
            TransitionPosition::Exact(None) => Err(SystemUpdateError::NotInitialized),
            TransitionPosition::OneAhead {
                previous: None,
                latest,
            } => Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: protected_state.sequence,
                journal_sequence: latest.sequence,
            }),
        }
    }

    fn load_protected_unlocked(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<Option<LoadedJournal>, SystemUpdateError> {
        protected_state.validate()?;
        let loaded = self.load_unlocked()?;
        let Some(loaded) = loaded else {
            return if protected_state.sequence == 0 {
                Ok(None)
            } else {
                Err(SystemUpdateError::ProtectedJournalRollback {
                    protected_sequence: protected_state.sequence,
                    journal_sequence: 0,
                })
            };
        };
        if loaded.snapshot.active.channel != protected_state.channel {
            return Err(SystemUpdateError::ProtectedChannelMismatch {
                expected: protected_state.channel.clone(),
                actual: loaded.snapshot.active.channel.clone(),
            });
        }
        if loaded.snapshot.active.target != protected_state.target {
            return Err(SystemUpdateError::ProtectedTargetMismatch {
                expected: protected_state.target.clone(),
                actual: loaded.snapshot.active.target.clone(),
            });
        }
        if loaded.sequence < protected_state.sequence {
            return Err(SystemUpdateError::ProtectedJournalRollback {
                protected_sequence: protected_state.sequence,
                journal_sequence: loaded.sequence,
            });
        }
        if loaded.sequence > protected_state.sequence {
            return Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: protected_state.sequence,
                journal_sequence: loaded.sequence,
            });
        }
        if protected_state.record_sha256.as_deref() != Some(loaded.record_sha256.as_str()) {
            return Err(SystemUpdateError::ProtectedJournalSubstitution {
                sequence: loaded.sequence,
            });
        }
        Ok(Some(loaded))
    }

    fn transition_position_unlocked(
        &self,
        protected_state: &ProtectedSystemUpdateState,
    ) -> Result<TransitionPosition, SystemUpdateError> {
        protected_state.validate()?;
        let Some(latest) = self.load_unlocked()? else {
            return if protected_state.sequence == 0 {
                Ok(TransitionPosition::Exact(None))
            } else {
                Err(SystemUpdateError::ProtectedJournalRollback {
                    protected_sequence: protected_state.sequence,
                    journal_sequence: 0,
                })
            };
        };
        if latest.snapshot.active.channel != protected_state.channel {
            return Err(SystemUpdateError::ProtectedChannelMismatch {
                expected: protected_state.channel.clone(),
                actual: latest.snapshot.active.channel.clone(),
            });
        }
        if latest.snapshot.active.target != protected_state.target {
            return Err(SystemUpdateError::ProtectedTargetMismatch {
                expected: protected_state.target.clone(),
                actual: latest.snapshot.active.target.clone(),
            });
        }
        if latest.sequence < protected_state.sequence {
            return Err(SystemUpdateError::ProtectedJournalRollback {
                protected_sequence: protected_state.sequence,
                journal_sequence: latest.sequence,
            });
        }
        if latest.sequence == protected_state.sequence {
            if latest.protected_state() != *protected_state {
                return Err(SystemUpdateError::ProtectedJournalSubstitution {
                    sequence: latest.sequence,
                });
            }
            return Ok(TransitionPosition::Exact(Some(latest)));
        }
        if latest.sequence != protected_state.sequence.saturating_add(1) {
            return Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: protected_state.sequence,
                journal_sequence: latest.sequence,
            });
        }
        let previous = if protected_state.sequence == 0 {
            None
        } else {
            let previous = self.read_record_unlocked(protected_state.sequence)?;
            if previous.snapshot.active.channel != protected_state.channel {
                return Err(SystemUpdateError::ProtectedChannelMismatch {
                    expected: protected_state.channel.clone(),
                    actual: previous.snapshot.active.channel.clone(),
                });
            }
            if previous.snapshot.active.target != protected_state.target {
                return Err(SystemUpdateError::ProtectedTargetMismatch {
                    expected: protected_state.target.clone(),
                    actual: previous.snapshot.active.target.clone(),
                });
            }
            if previous.protected_state() != *protected_state {
                return Err(SystemUpdateError::ProtectedJournalSubstitution {
                    sequence: previous.sequence,
                });
            }
            Some(previous)
        };
        Ok(TransitionPosition::OneAhead {
            previous,
            latest: Box::new(latest),
        })
    }

    fn read_record_unlocked(&self, sequence: u64) -> Result<LoadedJournal, SystemUpdateError> {
        let path = self.records.join(format!("{sequence:020}.json"));
        require_regular_file(&path, "system update record")?;
        let bytes = read_bounded(&path)?;
        let record: JournalRecord = serde_json::from_slice(&bytes).map_err(|error| {
            SystemUpdateError::InvalidJournal(format!("record {sequence} is malformed: {error}"))
        })?;
        if record.schema_version != JOURNAL_SCHEMA_VERSION || record.sequence != sequence {
            return Err(SystemUpdateError::InvalidJournal(format!(
                "record {sequence} metadata is invalid"
            )));
        }
        validate_snapshot(&record.snapshot)?;
        Ok(LoadedJournal {
            sequence,
            record_sha256: sha256_bytes(&bytes),
            snapshot: record.snapshot,
        })
    }

    fn load_unlocked(&self) -> Result<Option<LoadedJournal>, SystemUpdateError> {
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
        let record_count = paths.len();

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
        let Some(snapshot) = latest else {
            return Ok(None);
        };
        let sequence = u64::try_from(record_count)
            .map_err(|_| SystemUpdateError::InvalidJournal("record count overflow".to_owned()))?;
        let record_sha256 = previous_hash.ok_or_else(|| {
            SystemUpdateError::InvalidJournal("latest record digest is missing".to_owned())
        })?;
        Ok(Some(LoadedJournal {
            sequence,
            record_sha256,
            snapshot,
        }))
    }

    fn append_unlocked(
        &self,
        snapshot: &SystemUpdateSnapshot,
    ) -> Result<ProtectedSystemUpdateState, SystemUpdateError> {
        let previous = self.load_unlocked()?;
        if let Some(previous) = &previous {
            validate_snapshot_transition(&previous.snapshot, snapshot)?;
        } else {
            validate_initial_snapshot(snapshot)?;
        }
        let (sequence, bytes, protected_state) = next_record_bytes(previous.as_ref(), snapshot)?;
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
        sync_directory(&self.records)?;
        Ok(protected_state)
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
            Ok(()) => Ok(SystemUpdateLock { file }),
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
    file: File,
}

impl Drop for SystemUpdateLock {
    fn drop(&mut self) {
        let _ = fs4::FileExt::unlock(&self.file);
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JournalRecord {
    schema_version: u32,
    sequence: u64,
    previous_record_sha256: Option<String>,
    snapshot: SystemUpdateSnapshot,
}

fn next_record_bytes(
    previous: Option<&LoadedJournal>,
    snapshot: &SystemUpdateSnapshot,
) -> Result<(u64, Vec<u8>, ProtectedSystemUpdateState), SystemUpdateError> {
    let previous_sequence = previous.map_or(0, |loaded| loaded.sequence);
    if previous_sequence
        >= u64::try_from(MAX_RECORDS).expect("bounded system update record count fits in u64")
    {
        return Err(SystemUpdateError::InvalidJournal(format!(
            "journal reached {MAX_RECORDS} records"
        )));
    }
    let sequence = previous_sequence
        .checked_add(1)
        .ok_or_else(|| SystemUpdateError::InvalidJournal("record sequence overflow".to_owned()))?;
    let record = JournalRecord {
        schema_version: JOURNAL_SCHEMA_VERSION,
        sequence,
        previous_record_sha256: previous.map(|loaded| loaded.record_sha256.clone()),
        snapshot: snapshot.clone(),
    };
    let bytes = serde_json::to_vec(&record)
        .map_err(|error| SystemUpdateError::InvalidState(error.to_string()))?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_RECORD_BYTES {
        return Err(SystemUpdateError::InvalidState(
            "serialized state exceeds record limit".to_owned(),
        ));
    }
    let protected_state = ProtectedSystemUpdateState::for_record(
        &snapshot.active.channel,
        &snapshot.active.target,
        sequence,
        sha256_bytes(&bytes),
    );
    Ok((sequence, bytes, protected_state))
}

fn expected_next_protected_state(
    previous: Option<&LoadedJournal>,
    snapshot: &SystemUpdateSnapshot,
) -> Result<ProtectedSystemUpdateState, SystemUpdateError> {
    next_record_bytes(previous, snapshot).map(|(_, _, state)| state)
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
            || pending.image.channel != snapshot.active.channel
            || pending.image.target != snapshot.active.target
            || pending.image.generation != snapshot.highest_seen_generation
            || pending.image.generation <= snapshot.active.generation
        {
            return Err(SystemUpdateError::InvalidState(
                "pending image violates slot, channel, target, or generation invariants".to_owned(),
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
        || current.active.channel != previous.active.channel
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
    if !(1..=MAX_SYSTEM_IMAGE_BYTES).contains(&image.image_size_bytes) {
        return Err(SystemUpdateError::InvalidImage(format!(
            "image size must be within 1..={MAX_SYSTEM_IMAGE_BYTES} bytes"
        )));
    }
    validate_identifier("release ID", &image.release_id, 128)?;
    validate_identifier("channel", &image.channel, 64)?;
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

fn validate_protected_scope(kind: &str, value: &str) -> Result<(), SystemUpdateError> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(SystemUpdateError::InvalidProtectedState(format!(
            "{kind} must be 1..=64 ASCII letters, digits, dot, underscore, or hyphen"
        )));
    }
    Ok(())
}

fn is_canonical_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
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
    InvalidProtectedState(String),
    ProtectedChannelMismatch {
        expected: String,
        actual: String,
    },
    ProtectedTargetMismatch {
        expected: String,
        actual: String,
    },
    ProtectedJournalRollback {
        protected_sequence: u64,
        journal_sequence: u64,
    },
    ProtectedJournalSubstitution {
        sequence: u64,
    },
    ProtectionCommitRequired {
        protected_sequence: u64,
        journal_sequence: u64,
    },
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
    ChannelMismatch {
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

impl SystemUpdateError {
    fn fmt_protection(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidProtectedState(error) => write!(
                formatter,
                "system update protected state is invalid: {error}"
            ),
            Self::ProtectedChannelMismatch { expected, actual } => write!(
                formatter,
                "system update protected channel is {expected}, but journal channel is {actual}"
            ),
            Self::ProtectedTargetMismatch { expected, actual } => write!(
                formatter,
                "system update protected target is {expected}, but journal target is {actual}"
            ),
            Self::ProtectedJournalRollback {
                protected_sequence,
                journal_sequence,
            } => write!(
                formatter,
                "system update journal ends at sequence {journal_sequence}, below protected sequence {protected_sequence}"
            ),
            Self::ProtectedJournalSubstitution { sequence } => write!(
                formatter,
                "system update journal record {sequence} does not match its protected digest"
            ),
            Self::ProtectionCommitRequired {
                protected_sequence,
                journal_sequence,
            } => write!(
                formatter,
                "system update journal sequence {journal_sequence} is ahead of protected sequence {protected_sequence}; an authenticated operation result must be committed"
            ),
            _ => unreachable!("only system-update protection errors use this formatter"),
        }
    }
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
            Self::InvalidProtectedState(_)
            | Self::ProtectedChannelMismatch { .. }
            | Self::ProtectedTargetMismatch { .. }
            | Self::ProtectedJournalRollback { .. }
            | Self::ProtectedJournalSubstitution { .. }
            | Self::ProtectionCommitRequired { .. } => self.fmt_protection(formatter),
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
            Self::ChannelMismatch { active, candidate } => write!(
                formatter,
                "candidate channel {candidate} does not match active channel {active}"
            ),
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
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
        journal: TestJournal,
    }

    struct TestJournal {
        inner: SystemUpdateJournal,
        protected_state: RefCell<ProtectedSystemUpdateState>,
    }

    impl TestJournal {
        fn new(inner: SystemUpdateJournal) -> Self {
            Self {
                inner,
                protected_state: RefCell::new(
                    ProtectedSystemUpdateState::initial("stable", "raspberry-pi-5")
                        .expect("initial protected state"),
                ),
            }
        }

        fn protected_state(&self) -> ProtectedSystemUpdateState {
            self.protected_state.borrow().clone()
        }

        fn set_protected_state(&self, state: ProtectedSystemUpdateState) {
            *self.protected_state.borrow_mut() = state;
        }

        fn commit<T>(&self, transition: SystemUpdateTransition<T>) -> T {
            *self.protected_state.borrow_mut() = transition.protected_state;
            transition.outcome
        }

        fn initialize(
            &self,
            active: VerifiedSystemImageEvidence,
        ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .initialize(active, &state)
                .map(|transition| self.commit(transition))
        }

        fn snapshot(&self) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
            self.inner.snapshot(&self.protected_state())
        }

        fn recover(&self) -> Result<JournalRecovery, SystemUpdateError> {
            self.inner.recover(&self.protected_state())
        }

        fn stage_verified_update(
            &self,
            image: VerifiedSystemImageEvidence,
        ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .stage_verified_update(image, &state)
                .map(|transition| self.commit(transition))
        }

        fn arm_staged_update(
            &self,
            max_attempts: u8,
        ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .arm_staged_update(max_attempts, &state)
                .map(|transition| self.commit(transition))
        }

        fn boot_selection(&self) -> Result<SystemSlot, SystemUpdateError> {
            self.inner.boot_selection(&self.protected_state())
        }

        fn claim_pending_boot(&self) -> Result<PendingBootClaim, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .claim_pending_boot(&state)
                .map(|transition| self.commit(transition))
        }

        fn recover_interrupted_boot(&self) -> Result<InterruptedBootRecovery, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .recover_interrupted_boot(&state)
                .map(|transition| self.commit(transition))
        }

        fn pass_health_check(
            &self,
            attempt_id: u64,
            check: SystemHealthCheck,
        ) -> Result<HealthProgress, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .pass_health_check(attempt_id, check, &state)
                .map(|transition| self.commit(transition))
        }

        fn fail_health_check(
            &self,
            attempt_id: u64,
            check: SystemHealthCheck,
        ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .fail_health_check(attempt_id, check, &state)
                .map(|transition| self.commit(transition))
        }

        fn expire_health_window(
            &self,
            attempt_id: u64,
        ) -> Result<SystemUpdateSnapshot, SystemUpdateError> {
            let state = self.protected_state();
            self.inner
                .expire_health_window(attempt_id, &state)
                .map(|transition| self.commit(transition))
        }
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root =
                std::env::temp_dir().join(format!("vcg-system-update-{}-{id}", std::process::id()));
            fs::create_dir(&root).expect("create fixture root");
            fs::create_dir(root.join(RECORDS_DIRECTORY)).expect("create records");
            File::create(root.join(OPERATION_LOCK_FILE)).expect("create lock");
            let journal = TestJournal::new(SystemUpdateJournal::open(&root).expect("open journal"));
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

    fn image(slot: SystemSlot, generation: u64, release: &str) -> VerifiedSystemImageEvidence {
        VerifiedSystemImageEvidence::new(
            slot,
            generation,
            release,
            "stable",
            "raspberry-pi-5",
            1_024,
            ("1".repeat(64), "2".repeat(64)),
        )
        .expect("valid image")
    }

    fn all_health(journal: &TestJournal, attempt_id: u64) -> HealthProgress {
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
    fn protected_state_is_strict_bounded_and_scope_bound() {
        let initial = ProtectedSystemUpdateState::initial("stable", "raspberry-pi-5")
            .expect("initial protected state");
        assert_eq!(
            ProtectedSystemUpdateState::from_json_bytes(
                &initial.to_json_bytes().expect("state serializes")
            )
            .expect("state parses"),
            initial
        );
        for invalid in [
            r#"{"schemaVersion":2,"channel":"stable","target":"raspberry-pi-5","sequence":0,"recordSha256":null}"#
                .to_owned(),
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"raspberry-pi-5","sequence":0,"recordSha256":"{}"}}"#,
                "00".repeat(32)
            ),
            r#"{"schemaVersion":1,"channel":"stable","target":"raspberry-pi-5","sequence":1,"recordSha256":null}"#
                .to_owned(),
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"raspberry-pi-5","sequence":1,"recordSha256":"{}"}}"#,
                "AA".repeat(32)
            ),
            r#"{"schemaVersion":1,"channel":"stable","target":"raspberry-pi-5","sequence":0,"recordSha256":null,"path":"journal"}"#
                .to_owned(),
        ] {
            assert!(
                ProtectedSystemUpdateState::from_json_bytes(invalid.as_bytes()).is_err(),
                "invalid state unexpectedly parsed: {invalid}"
            );
        }
        assert!(ProtectedSystemUpdateState::from_json_bytes(&[]).is_err());
        assert!(
            ProtectedSystemUpdateState::from_json_bytes(&vec![
                b' ';
                MAX_PROTECTED_SYSTEM_UPDATE_STATE_BYTES
                    + 1
            ])
            .is_err()
        );

        let fixture = Fixture::new();
        let wrong_target =
            ProtectedSystemUpdateState::initial("stable", "other-target").expect("alternate state");
        assert!(matches!(
            fixture
                .journal
                .inner
                .initialize(image(SystemSlot::A, 1, "release-1"), &wrong_target),
            Err(SystemUpdateError::ProtectedTargetMismatch { .. })
        ));
        let wrong_channel = ProtectedSystemUpdateState::initial("recovery", "raspberry-pi-5")
            .expect("alternate channel state");
        assert!(matches!(
            fixture
                .journal
                .inner
                .initialize(image(SystemSlot::A, 1, "release-1"), &wrong_channel),
            Err(SystemUpdateError::ProtectedChannelMismatch { .. })
        ));
        assert_eq!(record_count(&fixture), 0);
    }

    #[test]
    fn initialization_and_staging_require_exact_protected_commits() {
        let fixture = Fixture::new();
        let initial = fixture.journal.protected_state();
        let initialized = fixture
            .journal
            .inner
            .initialize(image(SystemSlot::A, 1, "release-1"), &initial)
            .expect("initialize publishes");
        assert_eq!(initialized.protected_state.sequence(), 1);
        assert!(initialized.protected_state.record_sha256().is_some());
        let initialize_retry = fixture
            .journal
            .inner
            .initialize(image(SystemSlot::A, 1, "release-1"), &initial)
            .expect("exact initialization retry recovers");
        assert_eq!(
            initialize_retry.protected_state,
            initialized.protected_state
        );
        assert!(matches!(
            fixture
                .journal
                .inner
                .initialize(image(SystemSlot::A, 1, "release-other"), &initial),
            Err(SystemUpdateError::ProtectionCommitRequired { .. })
        ));
        assert!(matches!(
            fixture.journal.inner.snapshot(&initial),
            Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: 0,
                journal_sequence: 1,
            })
        ));
        assert!(matches!(
            fixture
                .journal
                .inner
                .stage_verified_update(image(SystemSlot::B, 2, "release-2"), &initial),
            Err(SystemUpdateError::ProtectionCommitRequired { .. })
        ));

        let initialized_state = initialized.protected_state;
        assert_eq!(
            fixture
                .journal
                .inner
                .snapshot(&initialized_state)
                .expect("committed initialization loads")
                .active()
                .slot(),
            SystemSlot::A
        );
        let staged = fixture
            .journal
            .inner
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"), &initialized_state)
            .expect("stage publishes");
        assert_eq!(staged.protected_state.sequence(), 2);
        let stage_retry = fixture
            .journal
            .inner
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"), &initialized_state)
            .expect("exact stage retry recovers");
        assert_eq!(stage_retry.protected_state, staged.protected_state);
        assert!(matches!(
            fixture.journal.inner.stage_verified_update(
                image(SystemSlot::B, 3, "release-other"),
                &initialized_state
            ),
            Err(SystemUpdateError::ProtectionCommitRequired { .. })
        ));
        assert!(matches!(
            fixture.journal.inner.boot_selection(&initialized_state),
            Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: 1,
                journal_sequence: 2,
            })
        ));
        assert_eq!(record_count(&fixture), 2);

        let multi = Fixture::initialized();
        let first_state = multi.journal.protected_state();
        let staged = multi
            .journal
            .inner
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"), &first_state)
            .expect("stage first uncommitted record");
        multi
            .journal
            .inner
            .arm_staged_update(2, &staged.protected_state)
            .expect("publish second uncommitted record");
        assert!(matches!(
            multi
                .journal
                .inner
                .stage_verified_update(image(SystemSlot::B, 2, "release-2"), &first_state),
            Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: 1,
                journal_sequence: 3,
            })
        ));
    }

    #[test]
    fn arming_claim_and_health_require_exact_protected_commits() {
        let fixture = Fixture::initialized();
        let initialized_state = fixture.journal.protected_state();
        let staged_state = fixture
            .journal
            .inner
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"), &initialized_state)
            .expect("stage publishes")
            .protected_state;
        let armed = fixture
            .journal
            .inner
            .arm_staged_update(2, &staged_state)
            .expect("arm publishes");
        assert_eq!(armed.protected_state.sequence(), 3);
        let arm_retry = fixture
            .journal
            .inner
            .arm_staged_update(2, &staged_state)
            .expect("exact arm retry recovers");
        assert_eq!(arm_retry.protected_state, armed.protected_state);
        let armed_state = armed.protected_state;
        let claim = fixture
            .journal
            .inner
            .claim_pending_boot(&armed_state)
            .expect("claim publishes");
        assert_eq!(claim.outcome.attempt_id(), 1);
        assert_eq!(claim.protected_state.sequence(), 4);
        let claim_retry = fixture
            .journal
            .inner
            .claim_pending_boot(&armed_state)
            .expect("exact claim retry recovers");
        assert_eq!(claim_retry, claim);
        let claim_state = claim.protected_state.clone();
        let first_health = fixture
            .journal
            .inner
            .pass_health_check(
                claim.outcome.attempt_id(),
                SystemHealthCheck::Launcher,
                &claim_state,
            )
            .expect("health publishes");
        assert_eq!(first_health.protected_state.sequence(), 5);
        let health_retry = fixture
            .journal
            .inner
            .pass_health_check(
                claim.outcome.attempt_id(),
                SystemHealthCheck::Launcher,
                &claim_state,
            )
            .expect("exact health retry recovers");
        assert_eq!(health_retry, first_health);
        assert!(matches!(
            fixture.journal.inner.pass_health_check(
                claim.outcome.attempt_id(),
                SystemHealthCheck::Tracker,
                &claim_state,
            ),
            Err(SystemUpdateError::ProtectionCommitRequired { .. })
        ));
        let duplicate = fixture
            .journal
            .inner
            .pass_health_check(
                claim.outcome.attempt_id(),
                SystemHealthCheck::Launcher,
                &first_health.protected_state,
            )
            .expect("duplicate is idempotent");
        assert_eq!(duplicate.protected_state, first_health.protected_state);
        assert_eq!(record_count(&fixture), 5);
    }

    #[test]
    fn interrupted_recovery_and_failure_retries_require_exact_commits() {
        let fixture = Fixture::initialized();
        fixture.stage_and_arm(2);
        let armed_state = fixture.journal.protected_state();
        let claim = fixture
            .journal
            .inner
            .claim_pending_boot(&armed_state)
            .expect("claim publishes");
        let first_health = fixture
            .journal
            .inner
            .pass_health_check(
                claim.outcome.attempt_id(),
                SystemHealthCheck::Launcher,
                &claim.protected_state,
            )
            .expect("health publishes");
        let recovered = fixture
            .journal
            .inner
            .recover_interrupted_boot(&first_health.protected_state)
            .expect("interrupted boot recovery publishes");
        assert!(matches!(
            recovered.outcome,
            InterruptedBootRecovery::RetryPending { .. }
        ));
        let recovery_retry = fixture
            .journal
            .inner
            .recover_interrupted_boot(&first_health.protected_state)
            .expect("exact recovery retry recovers");
        assert_eq!(recovery_retry, recovered);
        let second_claim = fixture
            .journal
            .inner
            .claim_pending_boot(&recovered.protected_state)
            .expect("second claim publishes");
        let failed = fixture
            .journal
            .inner
            .fail_health_check(
                second_claim.outcome.attempt_id(),
                SystemHealthCheck::Camera,
                &second_claim.protected_state,
            )
            .expect("health failure publishes");
        let failure_retry = fixture
            .journal
            .inner
            .fail_health_check(
                second_claim.outcome.attempt_id(),
                SystemHealthCheck::Camera,
                &second_claim.protected_state,
            )
            .expect("exact failure retry recovers");
        assert_eq!(failure_retry, failed);
        assert_eq!(record_count(&fixture), 8);

        let timeout = Fixture::initialized();
        timeout.stage_and_arm(1);
        let claim_state = timeout.journal.protected_state();
        let claim = timeout
            .journal
            .inner
            .claim_pending_boot(&claim_state)
            .expect("timeout claim publishes");
        let expired = timeout
            .journal
            .inner
            .expire_health_window(claim.outcome.attempt_id(), &claim.protected_state)
            .expect("timeout publishes");
        let retry = timeout
            .journal
            .inner
            .expire_health_window(claim.outcome.attempt_id(), &claim.protected_state)
            .expect("exact timeout retry recovers");
        assert_eq!(retry, expired);
    }

    #[test]
    fn protected_journal_rejects_deletion_substitution_and_target_drift() {
        let fixture = Fixture::initialized();
        fixture
            .journal
            .stage_verified_update(image(SystemSlot::B, 2, "release-2"))
            .expect("stage");
        let protected = fixture.journal.protected_state();
        let second = fixture.root.join("records/00000000000000000002.json");
        let original = fs::read(&second).expect("read second record");

        fs::remove_file(&second).expect("remove protected record");
        assert!(matches!(
            fixture.journal.inner.snapshot(&protected),
            Err(SystemUpdateError::ProtectedJournalRollback {
                protected_sequence: 2,
                journal_sequence: 1,
            })
        ));

        fs::write(&second, &original).expect("restore protected record");
        let substituted = String::from_utf8(original.clone())
            .expect("record is UTF-8")
            .replace("release-2", "release-x");
        fs::write(&second, substituted).expect("substitute record");
        assert!(matches!(
            fixture.journal.inner.snapshot(&protected),
            Err(SystemUpdateError::ProtectedJournalSubstitution { sequence: 2 })
        ));

        fs::write(&second, original).expect("restore protected record again");
        let mut wrong_channel = protected.clone();
        wrong_channel.channel = "recovery".to_owned();
        assert!(matches!(
            fixture.journal.inner.snapshot(&wrong_channel),
            Err(SystemUpdateError::ProtectedChannelMismatch { .. })
        ));
        let mut wrong_target = protected;
        wrong_target.target = "other-target".to_owned();
        assert!(matches!(
            fixture.journal.inner.snapshot(&wrong_target),
            Err(SystemUpdateError::ProtectedTargetMismatch { .. })
        ));
    }

    #[test]
    fn exact_retry_recovers_published_temp_before_state_commit() {
        let fixture = Fixture::initialized();
        let initial = ProtectedSystemUpdateState::initial("stable", "raspberry-pi-5")
            .expect("initial protected state");
        fixture.journal.set_protected_state(initial.clone());
        fs::hard_link(
            fixture.root.join("records/00000000000000000001.json"),
            fixture.root.join("records").join(TEMP_RECORD_FILE),
        )
        .expect("restore published temp name");

        let retry = fixture
            .journal
            .inner
            .initialize(image(SystemSlot::A, 1, "release-1"), &initial)
            .expect("exact retry authenticates published record");
        assert_eq!(retry.protected_state.sequence(), 1);
        assert!(!fixture.root.join("records").join(TEMP_RECORD_FILE).exists());
        assert_eq!(record_count(&fixture), 1);
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
        let wrong_target = VerifiedSystemImageEvidence::new(
            SystemSlot::B,
            2,
            "release-2",
            "stable",
            "other-target",
            1_024,
            ("1".repeat(64), "2".repeat(64)),
        )
        .expect("valid shape");
        assert!(matches!(
            fixture.journal.stage_verified_update(wrong_target),
            Err(SystemUpdateError::TargetMismatch { .. })
        ));
        let wrong_channel = VerifiedSystemImageEvidence::new(
            SystemSlot::B,
            2,
            "release-2",
            "recovery",
            "raspberry-pi-5",
            1_024,
            ("1".repeat(64), "2".repeat(64)),
        )
        .expect("valid shape");
        assert!(matches!(
            fixture.journal.stage_verified_update(wrong_channel),
            Err(SystemUpdateError::ChannelMismatch { .. })
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

        let fixture = Fixture::initialized();
        let first = fixture.root.join("records/00000000000000000001.json");
        let legacy = String::from_utf8(fs::read(&first).expect("read first record"))
            .expect("record is UTF-8")
            .replace("\"schemaVersion\":2", "\"schemaVersion\":1");
        fs::write(first, legacy).expect("write legacy-version record");
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
            image: image(SystemSlot::B, 2, "release-2").into_image(),
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
        assert!(matches!(
            fixture.journal.recover(),
            Err(SystemUpdateError::ProtectionCommitRequired {
                protected_sequence: 1,
                journal_sequence: 2,
            })
        ));
        assert!(
            fixture
                .root
                .join("records")
                .join(TEMP_RECORD_FILE)
                .is_file()
        );
        fixture
            .journal
            .set_protected_state(ProtectedSystemUpdateState::for_record(
                "stable",
                "raspberry-pi-5",
                2,
                sha256_bytes(&bytes),
            ));
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
            VerifiedSystemImageEvidence::new(
                SystemSlot::A,
                0,
                "release",
                "stable",
                "target",
                1,
                ("1".repeat(64), "2".repeat(64))
            )
            .is_err()
        );
        assert!(
            VerifiedSystemImageEvidence::new(
                SystemSlot::A,
                1,
                "../release",
                "stable",
                "target",
                1,
                ("1".repeat(64), "2".repeat(64))
            )
            .is_err()
        );
        assert!(
            VerifiedSystemImageEvidence::new(
                SystemSlot::A,
                1,
                "release",
                "stable",
                "target",
                1,
                ("A".repeat(64), "2".repeat(64))
            )
            .is_err()
        );
    }
}
