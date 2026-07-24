//! Crash-recoverable activation of fully verified signed package generations.
//!
//! Launchable history is additionally bound to exact generation and catalog
//! digest state supplied by a platform-protected monotonic-storage adapter.

use std::collections::BTreeSet;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::installed_catalog::{
    CatalogError, CatalogRoots, ResolvedPackage, TrustedPackageCatalog,
};
use crate::native_launch::{NativeLaunchError, NativeLaunchService};
use crate::package_health::{CandidateHealthChecker, CandidateHealthError, CandidateHealthRequest};
use crate::package_intake::{
    CapacityAdmission, PackageIntakeError, PackageIntakeStats, VerifiedPackageRelease,
};
use crate::package_launch::plan as plan_package;
use crate::package_transfer::{
    PackageArchiveTransfer, PackageReleaseIdentity, PackageTransferCleanup, PackageTransferError,
};
use crate::update_trust::{
    DetachedUpdateSignatures, MAX_UPDATE_SIGNATURE_BUNDLE_BYTES, TrustedUpdatePolicy,
};

const ACTIVATION_SCHEMA_VERSION: u32 = 1;
const PROTECTED_GENERATION_SCHEMA_VERSION: u32 = 1;
const CLEANUP_INTENT_SCHEMA_VERSION: u32 = 1;
const CLEANUP_INTENT_FILE: &str = "generation-cleanup.intent";
const CLEANUP_INTENT_TEMP_FILE: &str = "generation-cleanup.intent.tmp";
const MAX_CLEANUP_INTENT_BYTES: u64 = 2 * 1_024 * 1_024;
const MAX_MARKER_BYTES: u64 = 1_024;
const INTENT_FILE: &str = "promotion.intent";
const OPERATION_LOCK_FILE: &str = ".vcg-package-store.lock";
const STAGED_INTENT_FILE: &str = ".vcg-promotion-intent";
const STAGED_TRANSFER_RECEIPT_FILE: &str = ".vcg-transfer-receipt.json";
const STAGED_TRANSFER_RECEIPT_SCHEMA_VERSION: u32 = 1;
const CATALOG_FILE: &str = "installed-catalog.json";
const CATALOG_SIGNATURE_FILE: &str = "installed-catalog.sig";
const INSTALL_DIRECTORY: &str = "install";
const MAX_GENERATION_ENTRIES: usize = 4_096;
const MIN_RETAINED_GENERATIONS: usize = 2;
/// Maximum serialized package-generation protected state accepted from the
/// platform adapter.
pub const MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES: usize = 1_024;

/// Host-owned paths for a package generation store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackageGenerationConfig {
    pub store_root: PathBuf,
    pub update_policy: TrustedUpdatePolicy,
    pub protected_state: ProtectedPackageGenerationState,
    pub content_root: Option<PathBuf>,
    pub runtime_root: PathBuf,
    pub data_root: PathBuf,
}

/// Exact package activation state held outside the writable generation store.
///
/// The JSON form is an adapter boundary: production deployments must persist
/// these bytes in platform-protected monotonic storage. Keeping the document
/// in the package store does not provide rollback protection.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedPackageGenerationState {
    schema_version: u32,
    channel: String,
    target: String,
    generation: u64,
    catalog_sha256: Option<String>,
}

impl ProtectedPackageGenerationState {
    /// Parses and validates one strict bounded protected-state document.
    ///
    /// # Errors
    ///
    /// Rejects oversized or malformed JSON, unsupported schemas, unsafe scope
    /// identifiers, and inconsistent generation/digest pairs.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, GenerationError> {
        if bytes.is_empty() || bytes.len() > MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES {
            return Err(GenerationError::ProtectedState(format!(
                "document must be 1..={MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES} bytes"
            )));
        }
        let state: Self = serde_json::from_slice(bytes)
            .map_err(|error| GenerationError::ProtectedState(error.to_string()))?;
        state.validate()?;
        Ok(state)
    }

    /// Creates the initial state for one exact update channel and target.
    ///
    /// # Errors
    ///
    /// Rejects unsafe channel or target identifiers.
    pub fn initial(
        channel: impl Into<String>,
        target: impl Into<String>,
    ) -> Result<Self, GenerationError> {
        let state = Self {
            schema_version: PROTECTED_GENERATION_SCHEMA_VERSION,
            channel: channel.into(),
            target: target.into(),
            generation: 0,
            catalog_sha256: None,
        };
        state.validate()?;
        Ok(state)
    }

    /// Serializes the canonical adapter document to commit after promotion.
    ///
    /// # Errors
    ///
    /// Returns a protected-state validation or serialization failure.
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, GenerationError> {
        self.validate()?;
        serde_json::to_vec(self).map_err(|error| GenerationError::ProtectedState(error.to_string()))
    }

    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub fn catalog_sha256(&self) -> Option<&str> {
        self.catalog_sha256.as_deref()
    }

    #[must_use]
    pub fn channel(&self) -> &str {
        &self.channel
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    /// Requires this document to belong to one exact update scope.
    ///
    /// # Errors
    ///
    /// Rejects a channel or target mismatch.
    pub fn validate_scope(
        &self,
        expected_channel: &str,
        expected_target: &str,
    ) -> Result<(), GenerationError> {
        if self.channel == expected_channel && self.target == expected_target {
            Ok(())
        } else {
            Err(GenerationError::ProtectedStateScope {
                expected_channel: expected_channel.to_owned(),
                actual_channel: self.channel.clone(),
                expected_target: expected_target.to_owned(),
                actual_target: self.target.clone(),
            })
        }
    }

    fn for_marker(channel: &str, target: &str, marker: &ActivationMarker) -> Self {
        Self {
            schema_version: PROTECTED_GENERATION_SCHEMA_VERSION,
            channel: channel.to_owned(),
            target: target.to_owned(),
            generation: marker.generation,
            catalog_sha256: Some(marker.catalog_sha256.clone()),
        }
    }

    fn validate(&self) -> Result<(), GenerationError> {
        if self.schema_version != PROTECTED_GENERATION_SCHEMA_VERSION {
            return Err(GenerationError::ProtectedState(format!(
                "schema {} is unsupported",
                self.schema_version
            )));
        }
        validate_protected_scope("channel", &self.channel, 64)?;
        validate_protected_scope("target", &self.target, 128)?;
        match (self.generation, self.catalog_sha256.as_deref()) {
            (0, None) => Ok(()),
            (0, Some(_)) => Err(GenerationError::ProtectedState(
                "generation zero must not contain a catalog digest".to_owned(),
            )),
            (_, None) => Err(GenerationError::ProtectedState(
                "a nonzero generation requires a catalog digest".to_owned(),
            )),
            (_, Some(digest)) if is_canonical_sha256(digest) => Ok(()),
            (_, Some(_)) => Err(GenerationError::ProtectedState(
                "catalog digest is not canonical lowercase SHA-256".to_owned(),
            )),
        }
    }
}

/// One active, signature-verified package snapshot.
#[derive(Clone, Debug)]
pub struct ActiveGeneration {
    pub generation: u64,
    pub release_root: PathBuf,
    pub catalog: TrustedPackageCatalog,
}

/// Result of resuming a previously durable promotion intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecoveryOutcome {
    Clean,
    ProtectionCommitRequired {
        state: ProtectedPackageGenerationState,
    },
}

/// Result of atomically making a staged generation active.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PromotionOutcome {
    pub previous_generation: Option<u64>,
    pub active_generation: u64,
    /// Exact state the platform adapter must commit before this generation may
    /// be loaded or another promotion may begin.
    pub protected_state: ProtectedPackageGenerationState,
}

/// Result of signature-first extraction into one inert staging transaction.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StagedPackageGeneration {
    pub generation: u64,
    pub intake: PackageIntakeStats,
    pub capacity: CapacityAdmission,
}

/// Read-only classification of package generations for a future cleanup
/// coordinator.
///
/// Generation numbers are safe host metadata. Paths remain private to the
/// store, and producing this plan never removes or rewrites package state.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationCleanupPlan {
    pub active_generation: Option<u64>,
    pub protected_generations: Vec<u64>,
    pub retained_generations: Vec<u64>,
    pub retired_generations: Vec<u64>,
    pub orphan_generations: Vec<u64>,
}

/// Result of one explicit bounded generation-cleanup transaction.
///
/// The remover never selects policy itself. The caller supplies the retention
/// floor and per-transaction bound, while the returned plan shows any
/// remaining eligible history after the durable transaction completes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationCleanupOutcome {
    pub removed_retired_generations: Vec<u64>,
    pub removed_orphan_generations: Vec<u64>,
    pub remaining_plan: GenerationCleanupPlan,
}

/// Host-owned signed package generation storage.
#[derive(Clone, Debug)]
pub struct PackageGenerationStore {
    root: PathBuf,
    operation_lock: PathBuf,
    staging: PathBuf,
    generations: PathBuf,
    activations: PathBuf,
    update_policy: TrustedUpdatePolicy,
    protected_state: ProtectedPackageGenerationState,
    target: String,
    content_root: Option<PathBuf>,
    runtime_root: PathBuf,
    data_root: PathBuf,
}

enum ProtectionStatus {
    Exact(Option<ActivationMarker>),
    CommitRequired(ProtectedPackageGenerationState),
}

impl PackageGenerationStore {
    /// Opens an already provisioned generation-store layout.
    ///
    /// The root must contain real `staging`, `generations`, and `activations`
    /// directories. Symlinks or reparse points that escape the store are
    /// rejected.
    ///
    /// # Errors
    ///
    /// Rejects relative, missing, non-directory, or root-escaping paths.
    pub fn open(config: PackageGenerationConfig) -> Result<Self, GenerationError> {
        validate_absolute("store root", &config.store_root)?;
        if let Some(content_root) = &config.content_root {
            validate_absolute("managed content root", content_root)?;
        }
        validate_absolute("runtime root", &config.runtime_root)?;
        validate_absolute("data root", &config.data_root)?;

        let root = canonical_directory("store root", &config.store_root)?;
        let operation_lock = canonical_direct_file(
            "package store operation lock",
            &root,
            &root.join(OPERATION_LOCK_FILE),
        )?;
        let staging = canonical_child_directory(&root, "staging")?;
        let generations = canonical_child_directory(&root, "generations")?;
        let activations = canonical_child_directory(&root, "activations")?;
        let content_root = config
            .content_root
            .as_deref()
            .map(|path| canonical_directory("managed content root", path))
            .transpose()?;

        config.protected_state.validate()?;
        let target = current_target();
        config
            .protected_state
            .validate_scope(config.update_policy.channel(), &target)?;
        let target = config.protected_state.target().to_owned();

        Ok(Self {
            root,
            operation_lock,
            staging,
            generations,
            activations,
            update_policy: config.update_policy,
            protected_state: config.protected_state,
            target,
            content_root,
            runtime_root: config.runtime_root,
            data_root: config.data_root,
        })
    }

    /// Loads and re-verifies the exactly protected committed generation.
    ///
    /// A malformed activation marker fails closed rather than silently falling
    /// back to an older generation.
    ///
    /// # Errors
    ///
    /// Rejects malformed markers, writable history that differs from protected
    /// state, and any changed signed catalog or artifact.
    pub fn load_active(&self) -> Result<Option<ActiveGeneration>, GenerationError> {
        match self.protection_status()? {
            ProtectionStatus::Exact(marker) => marker
                .map(|marker| self.load_committed_generation(marker.generation))
                .transpose(),
            ProtectionStatus::CommitRequired(state) => {
                Err(GenerationError::ProtectionCommitRequired(state))
            }
        }
    }

    fn protection_status(&self) -> Result<ProtectionStatus, GenerationError> {
        let marker = self
            .activation_generations()?
            .last()
            .copied()
            .map(|generation| {
                let marker = read_marker(&self.activation_path(generation))?;
                validate_marker(&marker, generation)?;
                Ok::<ActivationMarker, GenerationError>(marker)
            })
            .transpose()?;

        match (self.protected_state.generation, marker) {
            (0, None) => Ok(ProtectionStatus::Exact(None)),
            (0, Some(marker)) => Ok(ProtectionStatus::CommitRequired(
                self.protected_state_for_verified_marker(&marker)?,
            )),
            (protected_generation, None) => Err(GenerationError::ProtectedHistoryRollback {
                protected_generation,
                active_generation: None,
            }),
            (protected_generation, Some(marker)) if marker.generation < protected_generation => {
                Err(GenerationError::ProtectedHistoryRollback {
                    protected_generation,
                    active_generation: Some(marker.generation),
                })
            }
            (protected_generation, Some(marker)) if marker.generation > protected_generation => {
                Ok(ProtectionStatus::CommitRequired(
                    self.protected_state_for_verified_marker(&marker)?,
                ))
            }
            (_, Some(marker))
                if self.protected_state.catalog_sha256.as_deref()
                    != Some(marker.catalog_sha256.as_str()) =>
            {
                Err(GenerationError::ProtectedCatalogSubstitution {
                    generation: marker.generation,
                })
            }
            (_, Some(marker)) => Ok(ProtectionStatus::Exact(Some(marker))),
        }
    }

    fn protected_state_for_verified_marker(
        &self,
        marker: &ActivationMarker,
    ) -> Result<ProtectedPackageGenerationState, GenerationError> {
        let release_path = self.generation_path(marker.generation);
        let release =
            canonical_direct_child("package generation", &self.generations, &release_path)?;
        self.verify_marker_release(&release, marker)?;
        Ok(ProtectedPackageGenerationState::for_marker(
            self.update_policy.channel(),
            &self.target,
            marker,
        ))
    }

    /// Classifies retained, retired, and unreferenced package generations
    /// without changing the store.
    ///
    /// At least two newest activated generations must be retained so cleanup
    /// planning cannot discard the immediate local rollback source by default.
    /// A durable promotion intent blocks planning. Unexpected entries, missing
    /// activated snapshots, or invalid markers fail closed.
    ///
    /// # Errors
    ///
    /// Rejects retention counts outside `2..=4096`, recovery-required or
    /// protected-state-mismatched history, and unsafe generation directories.
    pub fn plan_cleanup(
        &self,
        retain_count: usize,
    ) -> Result<GenerationCleanupPlan, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        self.plan_cleanup_unlocked(retain_count, &[])
    }

    /// Classifies package generations while retaining exact generations that
    /// trusted native launch coordination reports as still in use.
    ///
    /// Protection values are host-owned metadata, not browser input. Every
    /// protected generation must be nonzero, unique, activated, and installed.
    /// The list is bounded to the same maximum as the generation store.
    ///
    /// # Errors
    ///
    /// Rejects invalid protection values in addition to the errors returned by
    /// [`Self::plan_cleanup`].
    #[cfg(test)]
    fn plan_cleanup_with_protected_generations(
        &self,
        retain_count: usize,
        protected_generations: &[u64],
    ) -> Result<GenerationCleanupPlan, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        self.plan_cleanup_unlocked(retain_count, protected_generations)
    }

    /// Derives a cleanup plan while fresh native launch admission and every
    /// cooperating package-store mutation are both frozen.
    ///
    /// Lock order is launch maintenance first, then package store. The plan is
    /// still read-only and grants no deletion authority; this operation merely
    /// closes the race between obtaining native generation protection and
    /// validating package history.
    ///
    /// # Errors
    ///
    /// Rejects unavailable launch protection, package-store lock contention,
    /// invalid retention/protection, recovery-required or protected-state-
    /// mismatched history, or malformed package history.
    pub fn plan_cleanup_for_launch_service(
        &self,
        retain_count: usize,
        launch_service: &NativeLaunchService,
    ) -> Result<GenerationCleanupPlan, GenerationError> {
        let launch_maintenance = launch_service.acquire_maintenance()?;
        let _operation = self.acquire_operation_lock()?;
        let protected = launch_maintenance.protected_catalog_generations()?;
        self.plan_cleanup_unlocked(retain_count, &protected)
    }

    /// Removes a bounded set of unprotected retired/orphan generations while
    /// fresh native launches and cooperating package-store mutations remain
    /// frozen.
    ///
    /// Orphans are selected before the oldest retired activation history. A
    /// durable intent is synchronized before the first marker or generation
    /// directory is removed. The transaction removes an activated marker
    /// before its directory, so every interruption is either the original
    /// valid history or an inert orphan that
    /// [`Self::recover_cleanup_for_launch_service`] can resume.
    ///
    /// This is an explicit host primitive, not an automatic cleanup policy.
    /// It never removes the data/save root, managed content, staging,
    /// promotion state, active generation, rollback floor, or a generation
    /// protected by an active/restart-ambiguous native launch.
    ///
    /// # Errors
    ///
    /// Rejects a zero/excessive transaction bound, promotion or cleanup
    /// recovery, unavailable launch protection, lock contention, malformed
    /// history, or any target that changes before durable removal.
    pub fn cleanup_for_launch_service(
        &self,
        retain_count: usize,
        max_removals: usize,
        launch_service: &NativeLaunchService,
    ) -> Result<GenerationCleanupOutcome, GenerationError> {
        if !(1..=MAX_GENERATION_ENTRIES).contains(&max_removals) {
            return Err(GenerationError::InvalidCleanupLimit(max_removals));
        }
        let launch_maintenance = launch_service.acquire_maintenance()?;
        let _operation = self.acquire_operation_lock()?;
        if self.promotion_recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        if self.cleanup_recovery_required()? {
            return Err(GenerationError::CleanupRecoveryRequired);
        }
        let protected = launch_maintenance.protected_catalog_generations()?;
        let plan = self.plan_cleanup_unlocked_inner(retain_count, &protected, true)?;
        if plan.retired_generations.is_empty() && plan.orphan_generations.is_empty() {
            return Ok(GenerationCleanupOutcome {
                removed_retired_generations: Vec::new(),
                removed_orphan_generations: Vec::new(),
                remaining_plan: plan,
            });
        }
        let intent = self.create_cleanup_intent(&plan, retain_count, max_removals)?;
        self.write_cleanup_intent(&intent)?;
        let durable = self.read_cleanup_intent_if_present()?.ok_or_else(|| {
            GenerationError::CleanupIntentInvalid(
                "published cleanup intent disappeared before mutation".to_owned(),
            )
        })?;
        if durable != intent {
            return Err(GenerationError::CleanupIntentInvalid(
                "published cleanup intent changed before mutation".to_owned(),
            ));
        }
        self.apply_cleanup_intent_unlocked(&durable, &protected)
    }

    /// Resumes an interrupted generation cleanup under fresh launch
    /// protection and the same package-store operation lock.
    ///
    /// A missing intent returns `Ok(None)`. A present intent is fully
    /// validated before any remaining mutation. A target that has become
    /// protected or retained fails closed and leaves the intent for trusted
    /// recovery rather than deleting through ambiguity.
    ///
    /// # Errors
    ///
    /// Rejects simultaneous promotion recovery, malformed/unsafe intent,
    /// unavailable protection, lock contention, changed history, or I/O
    /// failure.
    pub fn recover_cleanup_for_launch_service(
        &self,
        launch_service: &NativeLaunchService,
    ) -> Result<Option<GenerationCleanupOutcome>, GenerationError> {
        let launch_maintenance = launch_service.acquire_maintenance()?;
        let _operation = self.acquire_operation_lock()?;
        if self.promotion_recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        let Some(intent) = self.read_cleanup_intent_if_present()? else {
            return Ok(None);
        };
        let protected = launch_maintenance.protected_catalog_generations()?;
        self.apply_cleanup_intent_unlocked(&intent, &protected)
            .map(Some)
    }

    fn plan_cleanup_unlocked(
        &self,
        retain_count: usize,
        protected_generations: &[u64],
    ) -> Result<GenerationCleanupPlan, GenerationError> {
        self.plan_cleanup_unlocked_inner(retain_count, protected_generations, false)
    }

    fn plan_cleanup_unlocked_inner(
        &self,
        retain_count: usize,
        protected_generations: &[u64],
        allow_cleanup_recovery: bool,
    ) -> Result<GenerationCleanupPlan, GenerationError> {
        if !(MIN_RETAINED_GENERATIONS..=MAX_GENERATION_ENTRIES).contains(&retain_count) {
            return Err(GenerationError::InvalidRetentionCount(retain_count));
        }
        if protected_generations.len() > MAX_GENERATION_ENTRIES {
            return Err(GenerationError::InvalidCleanupProtection(format!(
                "protected generation count exceeds {MAX_GENERATION_ENTRIES}"
            )));
        }
        let protected = protected_generations.iter().copied().try_fold(
            BTreeSet::new(),
            |mut generations, generation| {
                if generation == 0 {
                    return Err(GenerationError::InvalidCleanupProtection(
                        "protected generation must be nonzero".to_owned(),
                    ));
                }
                if !generations.insert(generation) {
                    return Err(GenerationError::InvalidCleanupProtection(format!(
                        "protected generation {generation} is duplicated"
                    )));
                }
                Ok(generations)
            },
        )?;
        if self.promotion_recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        if !allow_cleanup_recovery && self.cleanup_recovery_required()? {
            return Err(GenerationError::CleanupRecoveryRequired);
        }

        let activated = self.activation_generations()?;
        let installed = self.generation_directories()?;
        for generation in &activated {
            if installed.binary_search(generation).is_err() {
                return Err(GenerationError::InvalidLayout(format!(
                    "activation marker {generation} has no generation directory"
                )));
            }
        }
        for generation in &protected {
            if activated.binary_search(generation).is_err() {
                return Err(GenerationError::InvalidCleanupProtection(format!(
                    "protected generation {generation} is not activated"
                )));
            }
        }

        let active_generation = self.load_active()?.map(|active| active.generation);
        let retained_start = activated.len().saturating_sub(retain_count);
        let mut retained: BTreeSet<_> = activated[retained_start..].iter().copied().collect();
        retained.extend(protected.iter().copied());
        let retained_generations = retained.iter().copied().collect();
        let retired_generations = activated
            .iter()
            .copied()
            .filter(|generation| !retained.contains(generation))
            .collect();
        let orphan_generations = installed
            .into_iter()
            .filter(|generation| activated.binary_search(generation).is_err())
            .collect();

        Ok(GenerationCleanupPlan {
            active_generation,
            protected_generations: protected.into_iter().collect(),
            retained_generations,
            retired_generations,
            orphan_generations,
        })
    }

    fn create_cleanup_intent(
        &self,
        plan: &GenerationCleanupPlan,
        retain_count: usize,
        max_removals: usize,
    ) -> Result<GenerationCleanupIntent, GenerationError> {
        let orphan_generations: Vec<_> = plan
            .orphan_generations
            .iter()
            .copied()
            .take(max_removals)
            .collect();
        let remaining = max_removals.saturating_sub(orphan_generations.len());
        let retired_generations = plan
            .retired_generations
            .iter()
            .copied()
            .take(remaining)
            .map(|generation| {
                let marker = read_marker(&self.activation_path(generation))?;
                validate_marker(&marker, generation)?;
                Ok(marker)
            })
            .collect::<Result<Vec<_>, GenerationError>>()?;
        let intent = GenerationCleanupIntent {
            schema_version: CLEANUP_INTENT_SCHEMA_VERSION,
            retain_count: u32::try_from(retain_count)
                .expect("validated cleanup retention count fits u32"),
            retired_generations,
            orphan_generations,
        };
        validate_cleanup_intent(&intent)?;
        Ok(intent)
    }

    fn write_cleanup_intent(
        &self,
        intent: &GenerationCleanupIntent,
    ) -> Result<(), GenerationError> {
        validate_cleanup_intent(intent)?;
        let path = self.root.join(CLEANUP_INTENT_FILE);
        let temporary = self.root.join(CLEANUP_INTENT_TEMP_FILE);
        if path_exists(&path)? {
            return Err(GenerationError::CleanupRecoveryRequired);
        }
        if path_exists(&temporary)? {
            require_regular_file(&temporary, "temporary package generation cleanup intent")?;
            fs::remove_file(&temporary).map_err(|source| GenerationError::Io {
                operation: "remove unpublished package generation cleanup intent",
                path: temporary.clone(),
                source,
            })?;
            sync_directory(&self.root)?;
        }
        let bytes = serde_json::to_vec(intent)
            .map_err(|error| GenerationError::CleanupIntentInvalid(error.to_string()))?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_CLEANUP_INTENT_BYTES {
            return Err(GenerationError::CleanupIntentInvalid(
                "serialized cleanup intent exceeds size limit".to_owned(),
            ));
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|source| GenerationError::Io {
                operation: "create temporary package generation cleanup intent",
                path: temporary.clone(),
                source,
            })?;
        file.write_all(&bytes)
            .and_then(|()| file.sync_all())
            .map_err(|source| GenerationError::Io {
                operation: "persist temporary package generation cleanup intent",
                path: temporary.clone(),
                source,
            })?;
        drop(file);
        fs::hard_link(&temporary, &path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                GenerationError::CleanupRecoveryRequired
            } else {
                GenerationError::Io {
                    operation: "publish package generation cleanup intent",
                    path: path.clone(),
                    source,
                }
            }
        })?;
        fs::remove_file(&temporary).map_err(|source| GenerationError::Io {
            operation: "remove published temporary generation cleanup intent",
            path: temporary,
            source,
        })?;
        sync_directory(&self.root)
    }

    fn apply_cleanup_intent_unlocked(
        &self,
        intent: &GenerationCleanupIntent,
        protected_generations: &[u64],
    ) -> Result<GenerationCleanupOutcome, GenerationError> {
        validate_cleanup_intent(intent)?;
        let retain_count = usize::try_from(intent.retain_count).map_err(|_| {
            GenerationError::CleanupIntentInvalid(
                "cleanup retention count cannot be represented".to_owned(),
            )
        })?;
        let plan = self.plan_cleanup_unlocked_inner(retain_count, protected_generations, true)?;
        self.validate_cleanup_targets(intent, &plan)?;

        for marker in &intent.retired_generations {
            let activation = self.activation_path(marker.generation);
            if path_exists(&activation)? {
                let current = read_marker(&activation)?;
                validate_marker(&current, marker.generation)?;
                if current != *marker {
                    return Err(GenerationError::CleanupTargetChanged(marker.generation));
                }
                fs::remove_file(&activation).map_err(|source| GenerationError::Io {
                    operation: "remove retired package activation marker",
                    path: activation,
                    source,
                })?;
                sync_directory(&self.activations)?;
            }
            self.remove_generation_directory_if_present(marker.generation)?;
        }
        for generation in &intent.orphan_generations {
            self.remove_generation_directory_if_present(*generation)?;
        }

        let intent_path = self.root.join(CLEANUP_INTENT_FILE);
        fs::remove_file(&intent_path).map_err(|source| GenerationError::Io {
            operation: "remove completed package generation cleanup intent",
            path: intent_path,
            source,
        })?;
        let temporary = self.root.join(CLEANUP_INTENT_TEMP_FILE);
        if path_exists(&temporary)? {
            require_regular_file(&temporary, "temporary package generation cleanup intent")?;
            fs::remove_file(&temporary).map_err(|source| GenerationError::Io {
                operation: "remove recovered temporary generation cleanup intent",
                path: temporary,
                source,
            })?;
        }
        sync_directory(&self.root)?;

        let remaining_plan =
            self.plan_cleanup_unlocked_inner(retain_count, protected_generations, false)?;
        Ok(GenerationCleanupOutcome {
            removed_retired_generations: intent
                .retired_generations
                .iter()
                .map(|marker| marker.generation)
                .collect(),
            removed_orphan_generations: intent.orphan_generations.clone(),
            remaining_plan,
        })
    }

    fn validate_cleanup_targets(
        &self,
        intent: &GenerationCleanupIntent,
        plan: &GenerationCleanupPlan,
    ) -> Result<(), GenerationError> {
        for marker in &intent.retired_generations {
            let generation = marker.generation;
            if plan
                .protected_generations
                .binary_search(&generation)
                .is_ok()
                || plan.retained_generations.binary_search(&generation).is_ok()
            {
                return Err(GenerationError::CleanupTargetProtected(generation));
            }
            let activation = self.activation_path(generation);
            if path_exists(&activation)? {
                if plan.retired_generations.binary_search(&generation).is_err() {
                    return Err(GenerationError::CleanupTargetChanged(generation));
                }
                let current = read_marker(&activation)?;
                validate_marker(&current, generation)?;
                if current != *marker {
                    return Err(GenerationError::CleanupTargetChanged(generation));
                }
            } else {
                let directory = self.generation_path(generation);
                if path_exists(&directory)?
                    && plan.orphan_generations.binary_search(&generation).is_err()
                {
                    return Err(GenerationError::CleanupTargetChanged(generation));
                }
            }
        }
        for generation in &intent.orphan_generations {
            if path_exists(&self.activation_path(*generation))? {
                return Err(GenerationError::CleanupTargetChanged(*generation));
            }
            let directory = self.generation_path(*generation);
            if path_exists(&directory)?
                && plan.orphan_generations.binary_search(generation).is_err()
            {
                return Err(GenerationError::CleanupTargetChanged(*generation));
            }
        }
        Ok(())
    }

    fn remove_generation_directory_if_present(
        &self,
        generation: u64,
    ) -> Result<(), GenerationError> {
        let path = self.generation_path(generation);
        if !path_exists(&path)? {
            return Ok(());
        }
        let canonical = canonical_direct_child(
            "package generation cleanup target",
            &self.generations,
            &path,
        )?;
        fs::remove_dir_all(&canonical).map_err(|source| GenerationError::Io {
            operation: "remove package generation directory",
            path: canonical,
            source,
        })?;
        sync_directory(&self.generations)
    }

    /// Admits and publishes one signed uncompressed-TAR release as an inert
    /// staging transaction.
    ///
    /// The small release descriptor is signature-verified before archive use.
    /// Its exact archive hash/size, expanded file count/bytes, catalog
    /// hash/size, target, and generation bind extraction. Extraction occurs in
    /// a private `.incoming-<transaction-id>` directory and is renamed to the
    /// public staging name only after the installed catalog and every
    /// referenced artifact verify. No promotion intent or active state changes.
    ///
    /// # Errors
    ///
    /// Rejects invalid inputs, pending recovery, an existing transaction,
    /// insufficient extraction headroom, unsafe or excessive archive entries,
    /// descriptor/catalog disagreement, signature or artifact failures, and
    /// non-advancing generations.
    pub fn stage_package_tar(
        &self,
        transaction_id: &str,
        descriptor_path: &Path,
        descriptor_signature_path: &Path,
        archive_path: &Path,
        reserve_bytes: u64,
    ) -> Result<StagedPackageGeneration, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        validate_transaction_id(transaction_id)?;
        self.ensure_no_recovery_required()?;
        let signatures = read_update_signatures(
            descriptor_signature_path,
            "release descriptor signature bundle",
        )?;
        let release = VerifiedPackageRelease::load_with_update_role(
            descriptor_path,
            &signatures,
            &self.update_policy,
            &current_target(),
        )?;
        self.stage_verified_package_tar(transaction_id, archive_path, reserve_bytes, &release)
    }

    /// Admits a finalized archive directly from its still-locked durable
    /// transfer into one inert staging transaction.
    ///
    /// The descriptor is independently verified with the generation store's
    /// delegated update policy. The transfer binding must match that exact
    /// release, and the ready archive is re-hashed before extraction. Successful staging
    /// deliberately retains the ready archive and immutable binding as a
    /// durable receipt; cleanup policy is separate.
    ///
    /// # Errors
    ///
    /// Rejects pending recovery, descriptor/signature failure, a transfer
    /// bound to another release, an incomplete/unpublished transfer, changed
    /// archive bytes, or any normal staging failure.
    pub fn stage_ready_transfer(
        &self,
        transfer: &PackageArchiveTransfer,
        descriptor_path: &Path,
        descriptor_signature_path: &Path,
        reserve_bytes: u64,
    ) -> Result<StagedPackageGeneration, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        let transaction_id = transfer.transaction_id();
        validate_transaction_id(transaction_id)?;
        self.ensure_no_recovery_required()?;
        let signatures = read_update_signatures(
            descriptor_signature_path,
            "release descriptor signature bundle",
        )?;
        let release = VerifiedPackageRelease::load_with_update_role(
            descriptor_path,
            &signatures,
            &self.update_policy,
            &current_target(),
        )?;
        let archive_path = transfer.ready_archive_for(&release)?;
        self.stage_verified_package_tar(transaction_id, &archive_path, reserve_bytes, &release)
    }

    /// Removes a ready transfer archive and its binding only after the exact
    /// signed release is present as a verified inert staging transaction.
    ///
    /// The transfer keeps its exclusive lock for the complete operation.
    /// Cleanup uses a durable intent, so a later transfer open completes an
    /// interrupted removal before accepting any new bytes. This operation
    /// does not choose retention age or scheduling policy.
    ///
    /// # Errors
    ///
    /// Rejects pending promotion recovery, absent/changed staging state,
    /// release mismatch, unsafe transfer files, or persistence failures.
    pub fn cleanup_staged_transfer_receipt(
        &self,
        transfer: PackageArchiveTransfer,
    ) -> Result<PackageTransferCleanup, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        let transaction_id = transfer.transaction_id();
        validate_transaction_id(transaction_id)?;
        self.ensure_no_recovery_required()?;
        let stage = self.canonical_stage(transaction_id)?;
        let receipt_path = canonical_direct_file(
            "staged transfer receipt",
            &stage,
            &stage.join(STAGED_TRANSFER_RECEIPT_FILE),
        )?;
        let receipt = read_staged_transfer_receipt(&receipt_path)?;
        if receipt.transaction_id != transaction_id
            || receipt.release != transfer.release_identity()
        {
            return Err(GenerationError::StagedTransferReceiptMismatch(
                transaction_id.to_owned(),
            ));
        }
        let candidate = self.load_release(&stage)?;
        if candidate.generation != receipt.release.generation()
            || candidate.catalog_sha256 != receipt.release.catalog_sha256()
        {
            return Err(GenerationError::StagedTransferReceiptMismatch(
                transaction_id.to_owned(),
            ));
        }
        transfer.remove_consumed_ready().map_err(Into::into)
    }

    fn stage_verified_package_tar(
        &self,
        transaction_id: &str,
        archive_path: &Path,
        reserve_bytes: u64,
        release: &VerifiedPackageRelease,
    ) -> Result<StagedPackageGeneration, GenerationError> {
        release.verify_archive(archive_path)?;
        let capacity = release.admit_extraction_capacity_at(&self.staging, reserve_bytes)?;
        let limits = release.extraction_limits()?;

        let stage = self.staging.join(transaction_id);
        let incoming = self.staging.join(format!(".incoming-{transaction_id}"));
        if path_exists(&stage)? || path_exists(&incoming)? {
            return Err(GenerationError::StagingTransactionExists(
                transaction_id.to_owned(),
            ));
        }
        fs::create_dir(&incoming).map_err(|source| GenerationError::Io {
            operation: "create package intake directory",
            path: incoming.clone(),
            source,
        })?;
        if let Err(error) = sync_directory(&self.staging) {
            return self.finish_intake(&incoming, Err(error));
        }

        let result = (|| {
            let intake = release.extract_verified(archive_path, &incoming, limits)?;
            release.verify_archive(archive_path)?;
            let candidate = self.load_release(&incoming)?;
            if candidate.generation != release.generation() {
                return Err(GenerationError::IntakeDescriptorMismatch(format!(
                    "descriptor generation {} does not match catalog generation {}",
                    release.generation(),
                    candidate.generation
                )));
            }
            if let Some(active) = self.load_active()?
                && candidate.generation <= active.generation
            {
                return Err(GenerationError::RollbackRejected {
                    current: active.generation,
                    candidate: candidate.generation,
                });
            }
            write_staged_transfer_receipt(
                &incoming.join(STAGED_TRANSFER_RECEIPT_FILE),
                transaction_id,
                release,
            )?;
            sync_directory(&incoming)?;
            fs::rename(&incoming, &stage).map_err(|source| GenerationError::Io {
                operation: "publish verified package staging transaction",
                path: stage.clone(),
                source,
            })?;
            sync_directory(&self.staging)?;
            Ok(StagedPackageGeneration {
                generation: candidate.generation,
                intake,
                capacity,
            })
        })();
        self.finish_intake(&incoming, result)
    }

    fn finish_intake<T>(
        &self,
        incoming: &Path,
        result: Result<T, GenerationError>,
    ) -> Result<T, GenerationError> {
        let primary = match result {
            Ok(value) => return Ok(value),
            Err(error) => error,
        };
        let canonical = match fs::symlink_metadata(incoming) {
            Err(source) if source.kind() == io::ErrorKind::NotFound => return Err(primary),
            Err(source) => {
                return Err(GenerationError::IntakeCleanup {
                    path: incoming.to_owned(),
                    primary: Box::new(primary),
                    source,
                });
            }
            Ok(_) => {
                match canonical_direct_child("incomplete package intake", &self.staging, incoming) {
                    Ok(canonical) => canonical,
                    Err(cleanup_error) => {
                        return Err(GenerationError::IntakeCleanupValidation {
                            path: incoming.to_owned(),
                            primary: Box::new(primary),
                            cleanup_error: Box::new(cleanup_error),
                        });
                    }
                }
            }
        };
        match fs::remove_dir_all(&canonical) {
            Ok(()) => {
                sync_directory(&self.staging)?;
                Err(primary)
            }
            Err(source) => Err(GenerationError::IntakeCleanup {
                path: canonical,
                primary: Box::new(primary),
                source,
            }),
        }
    }

    fn activation_generations(&self) -> Result<Vec<u64>, GenerationError> {
        let mut generations = Vec::new();
        for entry in fs::read_dir(&self.activations).map_err(|source| GenerationError::Io {
            operation: "read activation directory",
            path: self.activations.clone(),
            source,
        })? {
            if generations.len() >= MAX_GENERATION_ENTRIES {
                return Err(GenerationError::InvalidLayout(
                    "activation marker limit exceeded".to_owned(),
                ));
            }
            let entry = entry.map_err(|source| GenerationError::Io {
                operation: "read activation entry",
                path: self.activations.clone(),
                source,
            })?;
            let path = entry.path();
            if !entry
                .file_type()
                .map_err(|source| GenerationError::Io {
                    operation: "inspect activation entry",
                    path: path.clone(),
                    source,
                })?
                .is_file()
            {
                return Err(GenerationError::InvalidLayout(format!(
                    "activation entry is not a file: {}",
                    path.display()
                )));
            }
            let generation = generation_from_marker_name(&entry.file_name())?;
            let marker = read_marker(&path)?;
            validate_marker(&marker, generation)?;
            generations.push(generation);
        }
        generations.sort_unstable();
        Ok(generations)
    }

    fn generation_directories(&self) -> Result<Vec<u64>, GenerationError> {
        let mut generations = Vec::new();
        for entry in fs::read_dir(&self.generations).map_err(|source| GenerationError::Io {
            operation: "read generation directory",
            path: self.generations.clone(),
            source,
        })? {
            if generations.len() >= MAX_GENERATION_ENTRIES {
                return Err(GenerationError::InvalidLayout(
                    "generation directory limit exceeded".to_owned(),
                ));
            }
            let entry = entry.map_err(|source| GenerationError::Io {
                operation: "read generation entry",
                path: self.generations.clone(),
                source,
            })?;
            let path = entry.path();
            if !entry
                .file_type()
                .map_err(|source| GenerationError::Io {
                    operation: "inspect generation entry",
                    path: path.clone(),
                    source,
                })?
                .is_dir()
            {
                return Err(GenerationError::InvalidLayout(format!(
                    "generation entry is not a directory: {}",
                    path.display()
                )));
            }
            let generation = generation_from_directory_name(&entry.file_name())?;
            canonical_direct_child("package generation", &self.generations, &path)?;
            generations.push(generation);
        }
        generations.sort_unstable();
        Ok(generations)
    }

    /// Reports whether a valid durable promotion intent requires recovery.
    ///
    /// This read-only check exists so dry-run service validation never mutates
    /// package state. A malformed or non-regular intent fails closed.
    ///
    /// # Errors
    ///
    /// Rejects malformed, oversized, symlinked, or otherwise unsafe intent
    /// state.
    pub fn recovery_required(&self) -> Result<bool, GenerationError> {
        self.promotion_recovery_required()
    }

    fn promotion_recovery_required(&self) -> Result<bool, GenerationError> {
        let intent_path = self.root.join(INTENT_FILE);
        match fs::symlink_metadata(&intent_path) {
            Ok(_) => {
                let marker = read_marker(&intent_path)?;
                validate_marker(&marker, marker.generation)?;
                Ok(true)
            }
            Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(source) => Err(GenerationError::Io {
                operation: "inspect package promotion intent",
                path: intent_path,
                source,
            }),
        }
    }

    /// Reports whether a valid durable generation-cleanup intent requires
    /// recovery.
    ///
    /// The check is read-only and validates the complete bounded intent. A
    /// malformed or non-regular file fails closed.
    ///
    /// # Errors
    ///
    /// Rejects malformed, oversized, symlinked, or otherwise unsafe cleanup
    /// state.
    pub fn cleanup_recovery_required(&self) -> Result<bool, GenerationError> {
        self.read_cleanup_intent_if_present()
            .map(|intent| intent.is_some())
    }

    fn read_cleanup_intent_if_present(
        &self,
    ) -> Result<Option<GenerationCleanupIntent>, GenerationError> {
        let path = self.root.join(CLEANUP_INTENT_FILE);
        match fs::symlink_metadata(&path) {
            Ok(_) => read_cleanup_intent(&path).map(Some),
            Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(source) => Err(GenerationError::Io {
                operation: "inspect package generation cleanup intent",
                path,
                source,
            }),
        }
    }

    fn ensure_no_recovery_required(&self) -> Result<(), GenerationError> {
        if self.promotion_recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        if self.cleanup_recovery_required()? {
            return Err(GenerationError::CleanupRecoveryRequired);
        }
        Ok(())
    }

    /// Health-checks and promotes one fully populated
    /// `staging/<transaction-id>` snapshot.
    ///
    /// Every package runs under the health mechanism and timeout bound by its
    /// verified signed manifest. Runtime and data roots are redirected beneath
    /// the host's ephemeral runtime root so a candidate cannot mutate player
    /// saves during qualification. The exact catalog digest checked by health
    /// must still match when durable promotion begins.
    ///
    /// # Errors
    ///
    /// Rejects invalid candidate state, unsupported health policy, plan or
    /// health execution failure, or any later promotion failure.
    pub fn promote_health_checked(
        &self,
        transaction_id: &str,
        checker: &CandidateHealthChecker,
    ) -> Result<PromotionOutcome, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        self.promote_health_checked_with(transaction_id, |request| checker.check(request))
    }

    fn promote_health_checked_with<F>(
        &self,
        transaction_id: &str,
        mut check: F,
    ) -> Result<PromotionOutcome, GenerationError>
    where
        F: FnMut(&CandidateHealthRequest) -> Result<(), CandidateHealthError>,
    {
        validate_transaction_id(transaction_id)?;
        self.ensure_no_recovery_required()?;
        // Candidate execution must not begin while writable activation
        // history is ahead of, behind, or substituted against protected
        // state.
        self.load_active()?;
        let stage = self.canonical_stage(transaction_id)?;
        let candidate = self.load_release(&stage)?;
        let expected_catalog_sha256 = candidate.catalog_sha256.clone();
        for package in candidate.catalog.package_health_policies()? {
            let health_root = self
                .runtime_root
                .join("package-health")
                .join(transaction_id)
                .join(&package.game_id);
            let mut resolved = candidate
                .catalog
                .resolve(&package.game_id, "package-health")?;
            match &mut resolved {
                ResolvedPackage::Libretro(request) => {
                    request.runtime_root = health_root.join("runtime");
                    request.data_root = health_root.join("data");
                }
                ResolvedPackage::Native(request) => {
                    request.runtime_root = health_root.join("runtime");
                    request.data_root = health_root.join("data");
                }
            }
            let plan = plan_package(&resolved).map_err(CandidateHealthError::Prepare)?;
            check(&CandidateHealthRequest {
                game_id: package.game_id,
                policy: package.policy,
                plan,
            })?;
        }
        self.activate_verified(transaction_id, Some(&expected_catalog_sha256))
    }

    /// Promotes one fully populated `staging/<transaction-id>` snapshot after
    /// any required candidate health checks have succeeded.
    ///
    /// The candidate catalog signature and every referenced artifact are
    /// verified before a durable intent is published. The candidate then moves
    /// into a versioned generation directory and becomes pending through one
    /// no-replace activation entry. The returned protected state must be
    /// atomically committed by the platform adapter before the generation is
    /// launchable. Read-only mount enforcement remains an operating system
    /// integration requirement. A crash after intent publication is resumed
    /// by [`Self::recover`].
    ///
    /// # Errors
    ///
    /// Rejects invalid transaction IDs, pending recovery or protected-state
    /// commit, downgrade/equal generations, signature or artifact failures,
    /// and unsafe layouts.
    fn activate_verified(
        &self,
        transaction_id: &str,
        expected_catalog_sha256: Option<&str>,
    ) -> Result<PromotionOutcome, GenerationError> {
        validate_transaction_id(transaction_id)?;
        self.ensure_no_recovery_required()?;
        // Fail before publishing an intent when a prior generation is still
        // waiting for its external protected-state commit.
        self.load_active()?;
        let global_intent = self.root.join(INTENT_FILE);

        let stage = self.canonical_stage(transaction_id)?;
        let candidate = self.load_release(&stage)?;
        if expected_catalog_sha256.is_some_and(|expected| expected != candidate.catalog_sha256) {
            return Err(GenerationError::CandidateChangedAfterHealth);
        }
        let generation = candidate.generation;
        let marker = ActivationMarker {
            schema_version: ACTIVATION_SCHEMA_VERSION,
            generation,
            transaction_id: transaction_id.to_owned(),
            catalog_sha256: candidate.catalog_sha256,
        };
        let staged_intent = stage.join(STAGED_INTENT_FILE);
        prepare_staged_marker(&staged_intent, &marker)?;
        publish_intent(&staged_intent, &global_intent)?;
        sync_directory(&self.root)?;

        // Publishing the no-replace intent serializes this check with every
        // other promoter. Checking only before intent acquisition would allow
        // a slower, lower generation to commit after a faster higher one.
        let previous_generation = match self.load_active() {
            Ok(active) => active.map(|active| active.generation),
            Err(error) => {
                self.abandon_unmoved_intent(&global_intent)?;
                return Err(error);
            }
        };
        if let Some(current) = previous_generation
            && generation <= current
        {
            self.abandon_unmoved_intent(&global_intent)?;
            return Err(GenerationError::RollbackRejected {
                current,
                candidate: generation,
            });
        }

        let destination = self.generation_path(generation);
        let activation = self.activation_path(generation);
        if destination.exists() || activation.exists() {
            self.abandon_unmoved_intent(&global_intent)?;
            return Err(GenerationError::GenerationExists(generation));
        }

        fs::rename(&stage, &destination).map_err(|source| GenerationError::Io {
            operation: "move verified package generation",
            path: destination.clone(),
            source,
        })?;
        sync_directory(&self.staging)?;
        sync_directory(&self.generations)?;

        let release =
            canonical_direct_child("package generation", &self.generations, &destination)?;
        self.verify_marker_release(&release, &marker)?;
        self.commit_intent(&marker)?;
        let protected_state = ProtectedPackageGenerationState::for_marker(
            self.update_policy.channel(),
            &self.target,
            &marker,
        );
        Ok(PromotionOutcome {
            previous_generation,
            active_generation: generation,
            protected_state,
        })
    }

    #[cfg(test)]
    fn promote_without_health(
        &self,
        transaction_id: &str,
    ) -> Result<PromotionOutcome, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        self.activate_verified(transaction_id, None)
    }

    /// Completes an interrupted promotion after its durable intent exists.
    ///
    /// Incomplete staging directories without a durable intent are never made
    /// active. They remain available for an explicit retry or later bounded
    /// garbage collection.
    ///
    /// Returns the exact state a trusted coordinator must commit when writable
    /// activation is ahead of protected state. This method never advances
    /// protected state itself.
    ///
    /// # Errors
    ///
    /// Rejects inconsistent or changed candidate state and downgrades.
    pub fn recover(&self) -> Result<RecoveryOutcome, GenerationError> {
        let _operation = self.acquire_operation_lock()?;
        if self.cleanup_recovery_required()? {
            return Err(GenerationError::CleanupRecoveryRequired);
        }
        let intent_path = self.root.join(INTENT_FILE);
        if !intent_path.exists() {
            return match self.protection_status()? {
                ProtectionStatus::Exact(_) => Ok(RecoveryOutcome::Clean),
                ProtectionStatus::CommitRequired(state) => {
                    Ok(RecoveryOutcome::ProtectionCommitRequired { state })
                }
            };
        }
        let marker = read_marker(&intent_path)?;
        validate_marker(&marker, marker.generation)?;
        let current = match self.protection_status()? {
            ProtectionStatus::Exact(marker) => marker.map(|marker| marker.generation),
            ProtectionStatus::CommitRequired(state) => {
                if state.generation != marker.generation
                    || state.catalog_sha256.as_deref() != Some(marker.catalog_sha256.as_str())
                {
                    return Err(GenerationError::MarkerMismatch(
                        "unprotected activation differs from the remaining intent".to_owned(),
                    ));
                }
                let activation = read_marker(&self.activation_path(marker.generation))?;
                if activation != marker {
                    return Err(GenerationError::MarkerMismatch(
                        "committed activation differs from the remaining intent".to_owned(),
                    ));
                }
                self.remove_completed_promotion_intent(&intent_path)?;
                return Ok(RecoveryOutcome::ProtectionCommitRequired { state });
            }
        };
        if let Some(current) = current {
            if marker.generation == current {
                let activation = read_marker(&self.activation_path(current))?;
                if activation != marker {
                    return Err(GenerationError::MarkerMismatch(
                        "committed activation differs from the remaining intent".to_owned(),
                    ));
                }
                self.remove_completed_promotion_intent(&intent_path)?;
                return Ok(RecoveryOutcome::Clean);
            }
            if marker.generation < current {
                return Err(GenerationError::RollbackRejected {
                    current,
                    candidate: marker.generation,
                });
            }
        }

        let stage_path = self.staging.join(&marker.transaction_id);
        let generation_path = self.generation_path(marker.generation);
        match (stage_path.exists(), generation_path.exists()) {
            (true, false) => {
                let stage = self.canonical_stage(&marker.transaction_id)?;
                self.verify_marker_release(&stage, &marker)?;
                fs::rename(&stage, &generation_path).map_err(|source| GenerationError::Io {
                    operation: "recover verified package generation move",
                    path: generation_path.clone(),
                    source,
                })?;
                sync_directory(&self.staging)?;
                sync_directory(&self.generations)?;
            }
            (false, true) => {
                let release = canonical_direct_child(
                    "package generation",
                    &self.generations,
                    &generation_path,
                )?;
                self.verify_marker_release(&release, &marker)?;
            }
            (true, true) => {
                return Err(GenerationError::InvalidLayout(format!(
                    "both staged and generation directories exist for {}",
                    marker.generation
                )));
            }
            (false, false) => {
                return Err(GenerationError::InvalidLayout(format!(
                    "promotion intent {} has no candidate directory",
                    marker.transaction_id
                )));
            }
        }

        self.commit_intent(&marker)?;
        Ok(RecoveryOutcome::ProtectionCommitRequired {
            state: ProtectedPackageGenerationState::for_marker(
                self.update_policy.channel(),
                &self.target,
                &marker,
            ),
        })
    }

    fn remove_completed_promotion_intent(&self, intent_path: &Path) -> Result<(), GenerationError> {
        fs::remove_file(intent_path).map_err(|source| GenerationError::Io {
            operation: "remove completed package promotion intent",
            path: intent_path.to_owned(),
            source,
        })?;
        sync_directory(&self.root)
    }

    fn commit_intent(&self, marker: &ActivationMarker) -> Result<(), GenerationError> {
        let intent_path = self.root.join(INTENT_FILE);
        let activation_path = self.activation_path(marker.generation);
        fs::hard_link(&intent_path, &activation_path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                GenerationError::GenerationExists(marker.generation)
            } else {
                GenerationError::Io {
                    operation: "commit active package generation",
                    path: activation_path,
                    source,
                }
            }
        })?;
        sync_directory(&self.activations)?;
        fs::remove_file(&intent_path).map_err(|source| GenerationError::Io {
            operation: "remove committed package promotion intent",
            path: intent_path,
            source,
        })?;
        sync_directory(&self.root)
    }

    fn abandon_unmoved_intent(&self, intent_path: &Path) -> Result<(), GenerationError> {
        fs::remove_file(intent_path).map_err(|source| GenerationError::Io {
            operation: "abandon rejected package promotion intent",
            path: intent_path.to_owned(),
            source,
        })?;
        sync_directory(&self.root)
    }

    fn load_committed_generation(
        &self,
        generation: u64,
    ) -> Result<ActiveGeneration, GenerationError> {
        let marker_path = self.activation_path(generation);
        let marker = read_marker(&marker_path)?;
        validate_marker(&marker, generation)?;
        let release_path = self.generation_path(generation);
        let release =
            canonical_direct_child("package generation", &self.generations, &release_path)?;
        let verified = self.verify_marker_release(&release, &marker)?;
        Ok(ActiveGeneration {
            generation,
            release_root: release,
            catalog: verified.catalog,
        })
    }

    fn verify_marker_release(
        &self,
        release: &Path,
        marker: &ActivationMarker,
    ) -> Result<VerifiedRelease, GenerationError> {
        let verified = self.load_release(release)?;
        if verified.generation != marker.generation {
            return Err(GenerationError::MarkerMismatch(format!(
                "marker generation {} does not match catalog generation {}",
                marker.generation, verified.generation
            )));
        }
        if verified.catalog_sha256 != marker.catalog_sha256 {
            return Err(GenerationError::MarkerMismatch(
                "catalog digest does not match durable promotion intent".to_owned(),
            ));
        }
        Ok(verified)
    }

    fn load_release(&self, release: &Path) -> Result<VerifiedRelease, GenerationError> {
        let install_root = canonical_child_directory(release, INSTALL_DIRECTORY)?;
        let catalog_path =
            canonical_direct_file("installed catalog", release, &release.join(CATALOG_FILE))?;
        let signature_path = canonical_direct_file(
            "installed catalog signature",
            release,
            &release.join(CATALOG_SIGNATURE_FILE),
        )?;
        let signatures =
            read_update_signatures(&signature_path, "installed catalog signature bundle")?;
        let catalog_sha256 = sha256_file(&catalog_path)?;
        let catalog = TrustedPackageCatalog::load_with_update_role(
            &catalog_path,
            &signatures,
            &self.update_policy,
            &self.target,
            CatalogRoots {
                install_root,
                content_root: self.content_root.clone(),
                runtime_root: self.runtime_root.clone(),
                data_root: self.data_root.clone(),
            },
        )?;
        catalog.verify_all_artifacts()?;
        Ok(VerifiedRelease {
            generation: catalog.generation(),
            catalog_sha256,
            catalog,
        })
    }

    fn canonical_stage(&self, transaction_id: &str) -> Result<PathBuf, GenerationError> {
        canonical_direct_child(
            "staged package generation",
            &self.staging,
            &self.staging.join(transaction_id),
        )
    }

    fn generation_path(&self, generation: u64) -> PathBuf {
        self.generations.join(format!("{generation:020}"))
    }

    fn activation_path(&self, generation: u64) -> PathBuf {
        self.activations.join(format!("{generation:020}.json"))
    }

    fn acquire_operation_lock(&self) -> Result<PackageStoreOperationLock, GenerationError> {
        let path = self.operation_lock.clone();
        require_regular_file(&path, "package store operation lock")?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|source| GenerationError::Io {
                operation: "open package store operation lock",
                path: path.clone(),
                source,
            })?;
        let metadata = file.metadata().map_err(|source| GenerationError::Io {
            operation: "inspect package store operation lock",
            path: path.clone(),
            source,
        })?;
        if !metadata.file_type().is_file() {
            return Err(GenerationError::UnsafePath {
                kind: "package store operation lock",
                path,
            });
        }
        match fs4::FileExt::try_lock(&file) {
            Ok(()) => Ok(PackageStoreOperationLock { _file: file }),
            Err(TryLockError::WouldBlock) => Err(GenerationError::Busy),
            Err(TryLockError::Error(source)) => Err(GenerationError::Io {
                operation: "lock package store operation",
                path,
                source,
            }),
        }
    }
}

struct PackageStoreOperationLock {
    _file: File,
}

struct VerifiedRelease {
    generation: u64,
    catalog_sha256: String,
    catalog: TrustedPackageCatalog,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActivationMarker {
    schema_version: u32,
    generation: u64,
    transaction_id: String,
    catalog_sha256: String,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GenerationCleanupIntent {
    schema_version: u32,
    retain_count: u32,
    retired_generations: Vec<ActivationMarker>,
    orphan_generations: Vec<u64>,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedTransferReceipt {
    schema_version: u32,
    transaction_id: String,
    release: PackageReleaseIdentity,
}

fn write_staged_transfer_receipt(
    path: &Path,
    transaction_id: &str,
    release: &VerifiedPackageRelease,
) -> Result<(), GenerationError> {
    let receipt = StagedTransferReceipt {
        schema_version: STAGED_TRANSFER_RECEIPT_SCHEMA_VERSION,
        transaction_id: transaction_id.to_owned(),
        release: PackageReleaseIdentity::for_release(release),
    };
    let bytes = serde_json::to_vec(&receipt)
        .map_err(|error| GenerationError::StagedTransferReceiptMismatch(error.to_string()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| GenerationError::Io {
            operation: "create staged transfer receipt",
            path: path.to_owned(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| GenerationError::Io {
            operation: "persist staged transfer receipt",
            path: path.to_owned(),
            source,
        })
}

fn read_staged_transfer_receipt(path: &Path) -> Result<StagedTransferReceipt, GenerationError> {
    require_regular_file(path, "staged transfer receipt")?;
    let file = File::open(path).map_err(|source| GenerationError::Io {
        operation: "open staged transfer receipt",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_MARKER_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| GenerationError::Io {
            operation: "read staged transfer receipt",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_MARKER_BYTES {
        return Err(GenerationError::StagedTransferReceiptMismatch(
            "receipt exceeds size limit".to_owned(),
        ));
    }
    let receipt: StagedTransferReceipt = serde_json::from_slice(&bytes)
        .map_err(|error| GenerationError::StagedTransferReceiptMismatch(error.to_string()))?;
    if receipt.schema_version != STAGED_TRANSFER_RECEIPT_SCHEMA_VERSION {
        return Err(GenerationError::StagedTransferReceiptMismatch(format!(
            "unsupported receipt schema {}",
            receipt.schema_version
        )));
    }
    validate_transaction_id(&receipt.transaction_id)?;
    Ok(receipt)
}

fn validate_marker(
    marker: &ActivationMarker,
    expected_generation: u64,
) -> Result<(), GenerationError> {
    if marker.schema_version != ACTIVATION_SCHEMA_VERSION {
        return Err(GenerationError::MarkerMismatch(format!(
            "unsupported activation marker schema {}",
            marker.schema_version
        )));
    }
    if marker.generation == 0 || marker.generation != expected_generation {
        return Err(GenerationError::MarkerMismatch(format!(
            "activation marker generation {} does not match {expected_generation}",
            marker.generation
        )));
    }
    validate_transaction_id(&marker.transaction_id)?;
    if !is_canonical_sha256(&marker.catalog_sha256) {
        return Err(GenerationError::MarkerMismatch(
            "activation catalog digest is not canonical lowercase SHA-256".to_owned(),
        ));
    }
    Ok(())
}

fn write_marker(path: &Path, marker: &ActivationMarker) -> Result<(), GenerationError> {
    let bytes = serde_json::to_vec(marker)
        .map_err(|error| GenerationError::MarkerMismatch(error.to_string()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| GenerationError::Io {
            operation: "create package promotion marker",
            path: path.to_owned(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| GenerationError::Io {
            operation: "persist package promotion marker",
            path: path.to_owned(),
            source,
        })
}

fn prepare_staged_marker(path: &Path, marker: &ActivationMarker) -> Result<(), GenerationError> {
    if path.exists() {
        require_regular_file(path, "staged package promotion marker")?;
        let existing = read_marker(path)?;
        if existing == *marker {
            return Ok(());
        }
        return Err(GenerationError::MarkerMismatch(
            "staged promotion intent conflicts with the verified candidate".to_owned(),
        ));
    }

    let temporary = path.with_extension("intent.tmp");
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|source| GenerationError::Io {
            operation: "remove incomplete package promotion marker",
            path: temporary.clone(),
            source,
        })?;
    }
    write_marker(&temporary, marker)?;
    fs::rename(&temporary, path).map_err(|source| GenerationError::Io {
        operation: "publish staged package promotion marker",
        path: path.to_owned(),
        source,
    })
}

fn publish_intent(staged: &Path, global: &Path) -> Result<(), GenerationError> {
    fs::hard_link(staged, global).map_err(|source| {
        if source.kind() == io::ErrorKind::AlreadyExists {
            GenerationError::RecoveryRequired
        } else {
            GenerationError::Io {
                operation: "publish package promotion intent",
                path: global.to_owned(),
                source,
            }
        }
    })?;
    fs::remove_file(staged).map_err(|source| GenerationError::Io {
        operation: "remove staged package promotion marker",
        path: staged.to_owned(),
        source,
    })
}

fn read_marker(path: &Path) -> Result<ActivationMarker, GenerationError> {
    require_regular_file(path, "package activation marker")?;
    let file = File::open(path).map_err(|source| GenerationError::Io {
        operation: "open package activation marker",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_MARKER_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| GenerationError::Io {
            operation: "read package activation marker",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).is_err()
        || u64::try_from(bytes.len()).expect("checked conversion") > MAX_MARKER_BYTES
    {
        return Err(GenerationError::MarkerMismatch(
            "activation marker exceeds size limit".to_owned(),
        ));
    }
    serde_json::from_slice(&bytes)
        .map_err(|error| GenerationError::MarkerMismatch(error.to_string()))
}

fn read_cleanup_intent(path: &Path) -> Result<GenerationCleanupIntent, GenerationError> {
    require_regular_file(path, "package generation cleanup intent")?;
    let file = File::open(path).map_err(|source| GenerationError::Io {
        operation: "open package generation cleanup intent",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_CLEANUP_INTENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| GenerationError::Io {
            operation: "read package generation cleanup intent",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_CLEANUP_INTENT_BYTES {
        return Err(GenerationError::CleanupIntentInvalid(
            "cleanup intent exceeds size limit".to_owned(),
        ));
    }
    let intent: GenerationCleanupIntent = serde_json::from_slice(&bytes)
        .map_err(|error| GenerationError::CleanupIntentInvalid(error.to_string()))?;
    validate_cleanup_intent(&intent)?;
    Ok(intent)
}

fn validate_cleanup_intent(intent: &GenerationCleanupIntent) -> Result<(), GenerationError> {
    if intent.schema_version != CLEANUP_INTENT_SCHEMA_VERSION {
        return Err(GenerationError::CleanupIntentInvalid(format!(
            "unsupported cleanup intent schema {}",
            intent.schema_version
        )));
    }
    let retain_count = usize::try_from(intent.retain_count).map_err(|_| {
        GenerationError::CleanupIntentInvalid(
            "cleanup retention count cannot be represented".to_owned(),
        )
    })?;
    if !(MIN_RETAINED_GENERATIONS..=MAX_GENERATION_ENTRIES).contains(&retain_count) {
        return Err(GenerationError::CleanupIntentInvalid(format!(
            "cleanup retention count {} is invalid",
            intent.retain_count
        )));
    }
    let target_count = intent
        .retired_generations
        .len()
        .checked_add(intent.orphan_generations.len())
        .ok_or_else(|| {
            GenerationError::CleanupIntentInvalid("cleanup target count overflow".to_owned())
        })?;
    if !(1..=MAX_GENERATION_ENTRIES).contains(&target_count) {
        return Err(GenerationError::CleanupIntentInvalid(format!(
            "cleanup target count {target_count} is invalid"
        )));
    }

    let mut previous = None;
    let mut retired = BTreeSet::new();
    for marker in &intent.retired_generations {
        validate_marker(marker, marker.generation)
            .map_err(|error| GenerationError::CleanupIntentInvalid(error.to_string()))?;
        if previous.is_some_and(|generation| marker.generation <= generation) {
            return Err(GenerationError::CleanupIntentInvalid(
                "retired cleanup targets are not strictly increasing".to_owned(),
            ));
        }
        previous = Some(marker.generation);
        retired.insert(marker.generation);
    }

    previous = None;
    for generation in &intent.orphan_generations {
        if *generation == 0 || previous.is_some_and(|prior| *generation <= prior) {
            return Err(GenerationError::CleanupIntentInvalid(
                "orphan cleanup targets must be nonzero and strictly increasing".to_owned(),
            ));
        }
        if retired.contains(generation) {
            return Err(GenerationError::CleanupIntentInvalid(format!(
                "cleanup generation {generation} appears in both target classes"
            )));
        }
        previous = Some(*generation);
    }
    Ok(())
}

fn generation_from_marker_name(name: &std::ffi::OsStr) -> Result<u64, GenerationError> {
    let text = name.to_str().ok_or_else(|| {
        GenerationError::InvalidLayout("activation marker name is not UTF-8".to_owned())
    })?;
    let digits = text.strip_suffix(".json").ok_or_else(|| {
        GenerationError::InvalidLayout(format!("unexpected activation marker: {text}"))
    })?;
    if digits.len() != 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(GenerationError::InvalidLayout(format!(
            "unexpected activation marker: {text}"
        )));
    }
    digits
        .parse()
        .map_err(|_| GenerationError::InvalidLayout(format!("invalid generation marker: {text}")))
}

fn generation_from_directory_name(name: &std::ffi::OsStr) -> Result<u64, GenerationError> {
    let text = name.to_str().ok_or_else(|| {
        GenerationError::InvalidLayout("generation directory name is not UTF-8".to_owned())
    })?;
    if text.len() != 20 || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(GenerationError::InvalidLayout(format!(
            "unexpected generation directory: {text}"
        )));
    }
    text.parse().map_err(|_| {
        GenerationError::InvalidLayout(format!("invalid generation directory: {text}"))
    })
}

fn current_target() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}

fn read_update_signatures(
    path: &Path,
    kind: &'static str,
) -> Result<DetachedUpdateSignatures, GenerationError> {
    validate_absolute(kind, path)?;
    require_regular_file(path, kind)?;
    let path = canonical_file(kind, path)?;
    let metadata = fs::metadata(&path).map_err(|source| GenerationError::Io {
        operation: "inspect update signature bundle",
        path: path.clone(),
        source,
    })?;
    let maximum_bytes =
        u64::try_from(MAX_UPDATE_SIGNATURE_BUNDLE_BYTES).expect("signature bound fits u64");
    if metadata.len() == 0 || metadata.len() > maximum_bytes {
        return Err(GenerationError::UpdateTrust(format!(
            "{kind} must be 1..={MAX_UPDATE_SIGNATURE_BUNDLE_BYTES} bytes"
        )));
    }
    let mut bytes =
        Vec::with_capacity(usize::try_from(metadata.len()).expect("bounded length fits usize"));
    File::open(&path)
        .and_then(|file| file.take(maximum_bytes + 1).read_to_end(&mut bytes))
        .map_err(|source| GenerationError::Io {
            operation: "read update signature bundle",
            path: path.clone(),
            source,
        })?;
    if bytes.len() > MAX_UPDATE_SIGNATURE_BUNDLE_BYTES {
        return Err(GenerationError::UpdateTrust(format!(
            "{kind} must be 1..={MAX_UPDATE_SIGNATURE_BUNDLE_BYTES} bytes"
        )));
    }
    DetachedUpdateSignatures::from_json_bytes(&bytes)
        .map_err(|error| GenerationError::UpdateTrust(error.to_string()))
}

fn validate_transaction_id(value: &str) -> Result<(), GenerationError> {
    let valid = !value.is_empty()
        && value.len() <= 80
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || (byte == b'-' && index > 0)
        })
        && !value.ends_with('-')
        && !value.contains("--");
    if valid {
        Ok(())
    } else {
        Err(GenerationError::InvalidTransactionId(value.to_owned()))
    }
}

fn validate_protected_scope(
    kind: &'static str,
    value: &str,
    maximum: usize,
) -> Result<(), GenerationError> {
    let valid = !value.is_empty()
        && value.len() <= maximum
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_' | b'.')
        });
    if valid {
        Ok(())
    } else {
        Err(GenerationError::ProtectedState(format!(
            "{kind} is not a safe lowercase identifier"
        )))
    }
}

fn is_canonical_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_absolute(kind: &'static str, path: &Path) -> Result<(), GenerationError> {
    if path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        Ok(())
    } else {
        Err(GenerationError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, GenerationError> {
    let canonical = fs::canonicalize(path).map_err(|source| GenerationError::Io {
        operation: "resolve directory",
        path: path.to_owned(),
        source,
    })?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(GenerationError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn canonical_child_directory(
    parent: &Path,
    name: &'static str,
) -> Result<PathBuf, GenerationError> {
    canonical_direct_child(name, parent, &parent.join(name))
}

fn canonical_direct_child(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, GenerationError> {
    let canonical = canonical_directory(kind, path)?;
    if canonical.parent() == Some(parent) && canonical.file_name() == path.file_name() {
        Ok(canonical)
    } else {
        Err(GenerationError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn canonical_direct_file(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, GenerationError> {
    let canonical = canonical_file(kind, path)?;
    if canonical.parent() == Some(parent) && canonical.file_name() == path.file_name() {
        Ok(canonical)
    } else {
        Err(GenerationError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn canonical_file(kind: &'static str, path: &Path) -> Result<PathBuf, GenerationError> {
    let canonical = fs::canonicalize(path).map_err(|source| GenerationError::Io {
        operation: "resolve file",
        path: path.to_owned(),
        source,
    })?;
    if canonical.is_file() {
        Ok(canonical)
    } else {
        Err(GenerationError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), GenerationError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| GenerationError::Io {
        operation: "inspect file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(GenerationError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn sha256_file(path: &Path) -> Result<String, GenerationError> {
    let mut file = File::open(path).map_err(|source| GenerationError::Io {
        operation: "open catalog for activation digest",
        path: path.to_owned(),
        source,
    })?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 8 * 1_024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|source| GenerationError::Io {
                operation: "read catalog for activation digest",
                path: path.to_owned(),
                source,
            })?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    let bytes = digest.finalize();
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        write!(output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(output)
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), GenerationError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| GenerationError::Io {
            operation: "synchronize package store directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
// Rust does not expose a portable directory-fsync operation. The Linux target
// uses the implementation above; non-Unix builds exercise logical recovery.
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), GenerationError> {
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool, GenerationError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(GenerationError::Io {
            operation: "inspect package store path",
            path: path.to_owned(),
            source,
        }),
    }
}

/// Signed generation activation failure.
#[derive(Debug)]
pub enum GenerationError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    Catalog(CatalogError),
    Launch(NativeLaunchError),
    Health(CandidateHealthError),
    Intake(PackageIntakeError),
    Transfer(PackageTransferError),
    UpdateTrust(String),
    ProtectedState(String),
    ProtectedStateScope {
        expected_channel: String,
        actual_channel: String,
        expected_target: String,
        actual_target: String,
    },
    ProtectionCommitRequired(ProtectedPackageGenerationState),
    ProtectedHistoryRollback {
        protected_generation: u64,
        active_generation: Option<u64>,
    },
    ProtectedCatalogSubstitution {
        generation: u64,
    },
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidLayout(String),
    InvalidRetentionCount(usize),
    InvalidCleanupLimit(usize),
    InvalidCleanupProtection(String),
    CleanupRecoveryRequired,
    CleanupIntentInvalid(String),
    CleanupTargetProtected(u64),
    CleanupTargetChanged(u64),
    InvalidTransactionId(String),
    StagingTransactionExists(String),
    StagedTransferReceiptMismatch(String),
    IntakeDescriptorMismatch(String),
    MarkerMismatch(String),
    Busy,
    RecoveryRequired,
    RollbackRejected {
        current: u64,
        candidate: u64,
    },
    GenerationExists(u64),
    CandidateChangedAfterHealth,
    IntakeCleanup {
        path: PathBuf,
        primary: Box<GenerationError>,
        source: io::Error,
    },
    IntakeCleanupValidation {
        path: PathBuf,
        primary: Box<GenerationError>,
        cleanup_error: Box<GenerationError>,
    },
}

impl GenerationError {
    fn fmt_protection(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ProtectedState(error) => {
                write!(formatter, "package protected state is invalid: {error}")
            }
            Self::ProtectedStateScope {
                expected_channel,
                actual_channel,
                expected_target,
                actual_target,
            } => write!(
                formatter,
                "package protected state scope is {actual_channel}/{actual_target}, expected {expected_channel}/{expected_target}"
            ),
            Self::ProtectionCommitRequired(state) => write!(
                formatter,
                "package generation {} is published but requires an exact protected-state commit",
                state.generation()
            ),
            Self::ProtectedHistoryRollback {
                protected_generation,
                active_generation,
            } => match active_generation {
                Some(active_generation) => write!(
                    formatter,
                    "package activation history ends at generation {active_generation}, below protected generation {protected_generation}"
                ),
                None => write!(
                    formatter,
                    "package activation history is empty, below protected generation {protected_generation}"
                ),
            },
            Self::ProtectedCatalogSubstitution { generation } => write!(
                formatter,
                "package activation generation {generation} does not match its protected catalog digest"
            ),
            _ => unreachable!("only package protection errors use this formatter"),
        }
    }

    fn fmt_cleanup(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRetentionCount(count) => write!(
                formatter,
                "package retention count {count} is outside {MIN_RETAINED_GENERATIONS}..={MAX_GENERATION_ENTRIES}"
            ),
            Self::InvalidCleanupLimit(limit) => write!(
                formatter,
                "package cleanup limit {limit} is outside 1..={MAX_GENERATION_ENTRIES}"
            ),
            Self::InvalidCleanupProtection(error) => {
                write!(formatter, "package cleanup protection is invalid: {error}")
            }
            Self::CleanupRecoveryRequired => {
                formatter.write_str("package generation cleanup recovery is required")
            }
            Self::CleanupIntentInvalid(error) => write!(
                formatter,
                "package generation cleanup intent is invalid: {error}"
            ),
            Self::CleanupTargetProtected(generation) => write!(
                formatter,
                "package cleanup generation {generation} is now retained or launch-protected"
            ),
            Self::CleanupTargetChanged(generation) => write!(
                formatter,
                "package cleanup generation {generation} changed after intent publication"
            ),
            _ => unreachable!("only package cleanup errors use this formatter"),
        }
    }
}

impl fmt::Display for GenerationError {
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
            Self::Catalog(error) => write!(formatter, "{error}"),
            Self::Launch(error) => write!(formatter, "{error}"),
            Self::Health(error) => write!(formatter, "{error}"),
            Self::Intake(error) => write!(formatter, "{error}"),
            Self::Transfer(error) => write!(formatter, "{error}"),
            Self::UpdateTrust(error) => write!(formatter, "package update trust rejected: {error}"),
            Self::ProtectedState(_)
            | Self::ProtectedStateScope { .. }
            | Self::ProtectionCommitRequired(_)
            | Self::ProtectedHistoryRollback { .. }
            | Self::ProtectedCatalogSubstitution { .. } => self.fmt_protection(formatter),
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidLayout(error) => write!(formatter, "package store is invalid: {error}"),
            Self::InvalidRetentionCount(_)
            | Self::InvalidCleanupLimit(_)
            | Self::InvalidCleanupProtection(_)
            | Self::CleanupRecoveryRequired
            | Self::CleanupIntentInvalid(_)
            | Self::CleanupTargetProtected(_)
            | Self::CleanupTargetChanged(_) => self.fmt_cleanup(formatter),
            Self::InvalidTransactionId(value) => {
                write!(formatter, "package transaction id is invalid: {value}")
            }
            Self::StagingTransactionExists(value) => {
                write!(
                    formatter,
                    "package staging transaction already exists: {value}"
                )
            }
            Self::StagedTransferReceiptMismatch(value) => write!(
                formatter,
                "staged package transaction does not match transfer receipt: {value}"
            ),
            Self::IntakeDescriptorMismatch(error) => {
                write!(formatter, "package intake descriptor mismatch: {error}")
            }
            Self::MarkerMismatch(error) => {
                write!(formatter, "package activation marker is invalid: {error}")
            }
            Self::Busy => formatter.write_str("package store operation is already in progress"),
            Self::RecoveryRequired => formatter.write_str("package promotion recovery is required"),
            Self::RollbackRejected { current, candidate } => write!(
                formatter,
                "package generation {candidate} does not advance active generation {current}"
            ),
            Self::GenerationExists(generation) => {
                write!(formatter, "package generation {generation} already exists")
            }
            Self::CandidateChangedAfterHealth => {
                formatter.write_str("candidate catalog changed after health verification")
            }
            Self::IntakeCleanup {
                path,
                primary,
                source,
            } => write!(
                formatter,
                "package intake failed ({primary}) and cleanup failed for {}: {source}",
                path.display()
            ),
            Self::IntakeCleanupValidation {
                path,
                primary,
                cleanup_error,
            } => write!(
                formatter,
                "package intake failed ({primary}) and cleanup validation failed for {}: {cleanup_error}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for GenerationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } | Self::IntakeCleanup { source, .. } => Some(source),
            Self::Catalog(error) => Some(error),
            Self::Launch(error) => Some(error),
            Self::Health(error) => Some(error),
            Self::Intake(error) => Some(error),
            Self::Transfer(error) => Some(error),
            Self::IntakeCleanupValidation { cleanup_error, .. } => Some(cleanup_error),
            _ => None,
        }
    }
}

impl From<CatalogError> for GenerationError {
    fn from(error: CatalogError) -> Self {
        Self::Catalog(error)
    }
}

impl From<NativeLaunchError> for GenerationError {
    fn from(error: NativeLaunchError) -> Self {
        Self::Launch(error)
    }
}

impl From<CandidateHealthError> for GenerationError {
    fn from(error: CandidateHealthError) -> Self {
        Self::Health(error)
    }
}

impl From<PackageIntakeError> for GenerationError {
    fn from(error: PackageIntakeError) -> Self {
        Self::Intake(error)
    }
}

impl From<PackageTransferError> for GenerationError {
    fn from(error: PackageTransferError) -> Self {
        Self::Transfer(error)
    }
}

#[cfg(test)]
mod tests {
    use std::fs::{self, File};
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use tar::Builder;

    use super::{
        ACTIVATION_SCHEMA_VERSION, ActivationMarker, CATALOG_FILE, CLEANUP_INTENT_FILE,
        CLEANUP_INTENT_TEMP_FILE, GenerationError, INTENT_FILE,
        MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES, OPERATION_LOCK_FILE, PackageGenerationConfig,
        PackageGenerationStore, ProtectedPackageGenerationState, RecoveryOutcome,
        STAGED_INTENT_FILE, STAGED_TRANSFER_RECEIPT_FILE, current_target, prepare_staged_marker,
        publish_intent, read_marker,
    };
    use crate::installed_catalog::{CatalogError, PackageHealthCheck};
    use crate::native_launch::NativeLaunchService;
    use crate::package_health::CandidateHealthChecker;
    use crate::package_intake::{PackageIntakeError, VerifiedPackageRelease};
    use crate::package_transfer::{
        PackageArchiveTransfer, PackageTransferCleanup, PackageTransferCleanupKind,
        PackageTransferError,
    };
    use crate::update_trust::{
        DetachedUpdateSignature, DetachedUpdateSignatures, RootTrustAnchor, RootTrustAnchorSet,
        TrustedUpdatePolicy, TrustedUpdateRoot,
    };

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-INSTALLED-CATALOG-V1\0";
    const RELEASE_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-PACKAGE-RELEASE-V1\0";
    const ROOT_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-UPDATE-TRUST-ROOT-V1\0";
    const TRUSTED_TIME: u64 = 2_000_000_000;

    struct Fixture {
        root: PathBuf,
        content: PathBuf,
        runtime: PathBuf,
        data: PathBuf,
        catalog_signing_key: SigningKey,
        release_signing_key: SigningKey,
        update_policy: TrustedUpdatePolicy,
    }

    impl Fixture {
        fn new() -> Self {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-package-generation-test-{}-{sequence}",
                std::process::id()
            ));
            let content = root.join("content");
            let runtime = root.join("runtime");
            let data = root.join("data");
            for directory in [
                root.join("staging"),
                root.join("generations"),
                root.join("activations"),
                content.clone(),
                runtime.clone(),
                data.clone(),
            ] {
                fs::create_dir_all(directory).expect("fixture directory creates");
            }
            File::create(root.join(OPERATION_LOCK_FILE))
                .expect("package store operation lock creates");
            let root_signing_key = SigningKey::from_bytes(&[22_u8; 32]);
            let catalog_signing_key = SigningKey::from_bytes(&[23_u8; 32]);
            let release_signing_key = SigningKey::from_bytes(&[24_u8; 32]);
            let target = format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS);
            let root_document = serde_json::to_vec(&json!({
                "schemaVersion": 1,
                "generation": 1,
                "expiresUnixSeconds": TRUSTED_TIME + 10_000,
                "rootThreshold": 1,
                "rootKeys": [{
                    "keyId": "root-one",
                    "publicKey": hex(root_signing_key.verifying_key().as_bytes()),
                }],
                "roles": [{
                    "channel": "stable",
                    "artifact": "installed-catalog",
                    "target": target,
                    "threshold": 1,
                    "keys": [{
                        "keyId": "catalog-one",
                        "publicKey": hex(catalog_signing_key.verifying_key().as_bytes()),
                    }],
                }, {
                    "channel": "stable",
                    "artifact": "package-release",
                    "target": target,
                    "threshold": 1,
                    "keys": [{
                        "keyId": "release-one",
                        "publicKey": hex(release_signing_key.verifying_key().as_bytes()),
                    }],
                }],
            }))
            .expect("root document serializes");
            let mut root_message = Vec::from(ROOT_SIGNED_MESSAGE_PREFIX);
            root_message.extend_from_slice(&root_document);
            let root_signatures =
                DetachedUpdateSignatures::new([DetachedUpdateSignature::from_hex(
                    "root-one",
                    &hex(&root_signing_key.sign(&root_message).to_bytes()),
                )
                .expect("root signature decodes")])
                .expect("root signature set creates");
            let anchors = RootTrustAnchorSet::new(
                1,
                [
                    RootTrustAnchor::new("root-one", root_signing_key.verifying_key().to_bytes())
                        .expect("root anchor creates"),
                ],
            )
            .expect("root anchor set creates");
            let trusted_root = TrustedUpdateRoot::bootstrap(
                &root_document,
                &root_signatures,
                &anchors,
                1,
                TRUSTED_TIME,
            )
            .expect("root bootstraps");
            let update_policy = TrustedUpdatePolicy::new(trusted_root, "stable", TRUSTED_TIME)
                .expect("update policy creates");
            Self {
                root,
                content,
                runtime,
                data,
                catalog_signing_key,
                release_signing_key,
                update_policy,
            }
        }

        fn store(&self) -> PackageGenerationStore {
            self.store_with_protected_state(
                ProtectedPackageGenerationState::initial("stable", current_target())
                    .expect("initial protected state creates"),
            )
        }

        fn store_with_protected_state(
            &self,
            protected_state: ProtectedPackageGenerationState,
        ) -> PackageGenerationStore {
            PackageGenerationStore::open(PackageGenerationConfig {
                store_root: self.root.clone(),
                update_policy: self.update_policy.clone(),
                protected_state,
                content_root: Some(self.content.clone()),
                runtime_root: self.runtime.clone(),
                data_root: self.data.clone(),
            })
            .expect("package generation store opens")
        }

        fn promote_generations(&self, generations: &[(&str, u64, &str)]) -> PackageGenerationStore {
            let mut store = self.store();
            for &(transaction, generation, version) in generations {
                self.stage(transaction, generation, version);
                let outcome = store
                    .promote_without_health(transaction)
                    .expect("generation publishes");
                store = self.store_with_protected_state(outcome.protected_state);
            }
            store
        }

        fn stage(&self, transaction: &str, generation: u64, version: &str) -> PathBuf {
            let release = self.root.join("staging").join(transaction);
            let install = release.join("install");
            let package = install.join("packages").join("retro-2048");
            let runtime = install.join("retroarch");
            let cores = install.join("cores");
            for directory in [&package, &runtime, &cores] {
                fs::create_dir_all(directory).expect("release directory creates");
            }

            let manifest = package.join("vcg-game.json");
            let frontend = runtime.join("retroarch");
            let core = cores.join("2048_libretro.so");
            let base_config = runtime.join("vcg-base.cfg");
            fs::write(
                &manifest,
                format!(
                    "{{\"schemaVersion\":1,\"id\":\"retro-2048\",\"version\":\"{version}\",\
                     \"runtime\":\"libretro\",\"compatibilityStatus\":\"qualified\",\
                     \"launch\":{{\"timeoutMs\":15000,\"healthCheck\":{{\"type\":\"process\"}}}}}}"
                ),
            )
            .expect("manifest writes");
            fs::write(&frontend, b"frontend").expect("frontend writes");
            fs::write(&core, b"core").expect("core writes");
            fs::write(&base_config, b"config_save_on_exit = \"false\"\n")
                .expect("base configuration writes");

            let document = json!({
                "schemaVersion": 1,
                "generation": generation,
                "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                "packages": [{
                    "id": "retro-2048",
                    "version": version,
                    "qualification": "qualified",
                    "runtime": "libretro",
                    "manifest": {
                        "path": "packages/retro-2048/vcg-game.json",
                        "sha256": digest(&manifest),
                    },
                    "libretro": {
                        "frontend": {
                            "path": "retroarch/retroarch",
                            "sha256": digest(&frontend),
                        },
                        "core": {
                            "path": "cores/2048_libretro.so",
                            "sha256": digest(&core),
                        },
                        "baseConfig": {
                            "path": "retroarch/vcg-base.cfg",
                            "sha256": digest(&base_config),
                        },
                        "content": { "mode": "none" },
                    },
                }],
            });
            let catalog = serde_json::to_vec(&document).expect("catalog document serializes");
            let catalog_path = release.join("installed-catalog.json");
            fs::write(&catalog_path, &catalog).expect("catalog writes");
            let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(&catalog);
            let signature = self.catalog_signing_key.sign(&message);
            fs::write(
                release.join("installed-catalog.sig"),
                signature_bundle("catalog-one", &signature.to_bytes()),
            )
            .expect("catalog signature writes");
            release
        }

        fn stage_native(&self, transaction: &str, generation: u64, version: &str) -> PathBuf {
            let release = self.root.join("staging").join(transaction);
            let install = release.join("install");
            let package = install.join("packages").join("native-game");
            fs::create_dir_all(&package).expect("native package directory creates");

            let manifest = package.join("vcg-game.json");
            let executable = package.join(format!("game{}", std::env::consts::EXE_SUFFIX));
            fs::write(
                &manifest,
                format!(
                    "{{\"schemaVersion\":1,\"id\":\"native-game\",\"version\":\"{version}\",\
                     \"runtime\":\"native\",\"compatibilityStatus\":\"qualified\",\
                     \"launch\":{{\"timeoutMs\":15000,\"healthCheck\":{{\"type\":\"process\"}}}}}}"
                ),
            )
            .expect("native manifest writes");
            fs::write(&executable, b"native executable").expect("native executable writes");

            let executable_path =
                format!("packages/native-game/game{}", std::env::consts::EXE_SUFFIX);
            let document = json!({
                "schemaVersion": 1,
                "generation": generation,
                "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                "packages": [{
                    "id": "native-game",
                    "version": version,
                    "qualification": "qualified",
                    "runtime": "native",
                    "manifest": {
                        "path": "packages/native-game/vcg-game.json",
                        "sha256": digest(&manifest),
                    },
                    "native": {
                        "executable": {
                            "path": executable_path,
                            "sha256": digest(&executable),
                        },
                    },
                }],
            });
            let catalog = serde_json::to_vec(&document).expect("native catalog serializes");
            fs::write(release.join("installed-catalog.json"), &catalog)
                .expect("native catalog writes");
            let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(&catalog);
            let signature = self.catalog_signing_key.sign(&message);
            fs::write(
                release.join("installed-catalog.sig"),
                signature_bundle("catalog-one", &signature.to_bytes()),
            )
            .expect("native catalog signature writes");
            release
        }

        fn package_tar(
            &self,
            generation: u64,
            version: &str,
        ) -> (PathBuf, PathBuf, PathBuf, u64, u64) {
            let source = self.stage("archive-source", generation, version);
            let archive = self.root.join(format!("release-{generation}.tar"));
            let descriptor = self.root.join(format!("release-{generation}.json"));
            let descriptor_signature = self.root.join(format!("release-{generation}.sig"));
            let relative_files = [
                "installed-catalog.json",
                "installed-catalog.sig",
                "install/packages/retro-2048/vcg-game.json",
                "install/retroarch/retroarch",
                "install/cores/2048_libretro.so",
                "install/retroarch/vcg-base.cfg",
            ];
            let mut expanded_bytes = 0_u64;
            let mut builder =
                Builder::new(File::create(&archive).expect("package archive creates"));
            for relative in relative_files {
                let path = source.join(relative);
                expanded_bytes += fs::metadata(&path).expect("artifact inspects").len();
                builder
                    .append_path_with_name(&path, relative)
                    .expect("artifact appends");
            }
            builder.finish().expect("package archive finishes");
            drop(builder);

            let catalog = source.join(CATALOG_FILE);
            let document = json!({
                "schemaVersion": 1,
                "generation": generation,
                "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                "archive": {
                    "format": "tar",
                    "sha256": digest(&archive),
                    "sizeBytes": fs::metadata(&archive).expect("archive inspects").len(),
                },
                "expanded": {
                    "sizeBytes": expanded_bytes,
                    "fileCount": relative_files.len(),
                },
                "catalog": {
                    "sha256": digest(&catalog),
                    "sizeBytes": fs::metadata(&catalog).expect("catalog inspects").len(),
                },
            });
            fs::write(
                &descriptor,
                serde_json::to_vec(&document).expect("release descriptor serializes"),
            )
            .expect("release descriptor writes");
            self.sign_release_descriptor(&descriptor, &descriptor_signature);
            fs::remove_dir_all(source).expect("archive source removes");
            (
                descriptor,
                descriptor_signature,
                archive,
                expanded_bytes,
                u64::try_from(relative_files.len()).expect("file count converts"),
            )
        }

        fn sign_release_descriptor(&self, descriptor: &Path, signature: &Path) {
            let descriptor_bytes = fs::read(descriptor).expect("release descriptor reads");
            let mut message = Vec::from(RELEASE_SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(&descriptor_bytes);
            fs::write(
                signature,
                signature_bundle(
                    "release-one",
                    &self.release_signing_key.sign(&message).to_bytes(),
                ),
            )
            .expect("release descriptor signature writes");
        }

        fn load_release_descriptor(
            &self,
            descriptor: &Path,
            signature: &Path,
        ) -> VerifiedPackageRelease {
            let signatures = DetachedUpdateSignatures::from_json_bytes(
                &fs::read(signature).expect("signature bundle reads"),
            )
            .expect("signature bundle parses");
            VerifiedPackageRelease::load_with_update_role(
                descriptor,
                &signatures,
                &self.update_policy,
                &format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
            )
            .expect("release verifies")
        }

        fn publish_intent(
            &self,
            store: &PackageGenerationStore,
            transaction: &str,
        ) -> ActivationMarker {
            let stage = store
                .canonical_stage(transaction)
                .expect("stage canonicalizes");
            let verified = store.load_release(&stage).expect("release verifies");
            let marker = ActivationMarker {
                schema_version: ACTIVATION_SCHEMA_VERSION,
                generation: verified.generation,
                transaction_id: transaction.to_owned(),
                catalog_sha256: verified.catalog_sha256,
            };
            let staged = stage.join(STAGED_INTENT_FILE);
            prepare_staged_marker(&staged, &marker).expect("staged intent persists");
            publish_intent(&staged, &self.root.join(INTENT_FILE)).expect("global intent publishes");
            marker
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn stages_only_a_signed_capacity_admitted_exact_tar_release() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, expanded_bytes, file_count) =
            fixture.package_tar(7, "1.0.0");
        let store = fixture.store();

        let staged = store
            .stage_package_tar("intake-seven", &descriptor, &signature, &archive, 1)
            .expect("signed release stages");
        assert_eq!(staged.generation, 7);
        assert_eq!(staged.intake.file_count, file_count);
        assert_eq!(staged.intake.expanded_bytes, expanded_bytes);
        assert_eq!(staged.capacity.archive_bytes, 0);
        assert_eq!(staged.capacity.reserve_bytes, 1);
        assert!(fixture.root.join("staging/intake-seven").is_dir());
        assert!(!fixture.root.join("staging/.incoming-intake-seven").exists());
        assert_eq!(
            store
                .load_release(
                    &store
                        .canonical_stage("intake-seven")
                        .expect("stage canonicalizes"),
                )
                .expect("staged release re-verifies")
                .generation,
            7
        );
        assert!(store.load_active().expect("active lookup works").is_none());
    }

    #[test]
    fn delegated_generation_roles_reject_changed_bytes_and_cross_role_signers() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, _, _) = fixture.package_tar(7, "1.0.0");
        let mut changed_descriptor =
            fs::read(&descriptor).expect("release descriptor reads before change");
        changed_descriptor.push(b' ');
        fs::write(&descriptor, changed_descriptor).expect("changed descriptor writes");
        let store = fixture.store();
        assert!(matches!(
            store.stage_package_tar("changed-release", &descriptor, &signature, &archive, 1),
            Err(GenerationError::Intake(
                PackageIntakeError::UpdateAuthority(_)
            ))
        ));

        fixture.stage("cross-role-catalog", 8, "2.0.0");
        let staged_release = store
            .canonical_stage("cross-role-catalog")
            .expect("stage canonicalizes");
        let catalog_path = staged_release.join(CATALOG_FILE);
        let catalog = fs::read(&catalog_path).expect("catalog reads");
        let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
        message.extend_from_slice(&catalog);
        let cross_role_signature = fixture.release_signing_key.sign(&message);
        fs::write(
            staged_release.join("installed-catalog.sig"),
            signature_bundle("release-one", &cross_role_signature.to_bytes()),
        )
        .expect("cross-role catalog signature writes");
        let staged_release = store
            .canonical_stage("cross-role-catalog")
            .expect("cross-role stage canonicalizes");
        match store.load_release(&staged_release) {
            Err(GenerationError::Catalog(CatalogError::UpdateAuthority(_))) => {}
            Err(error) => panic!("unexpected cross-role result: {error:?}"),
            Ok(_) => panic!("cross-role catalog unexpectedly verified"),
        }
    }

    #[test]
    fn stages_then_explicitly_cleans_only_the_matching_durable_transfer_receipt() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, expanded_bytes, file_count) =
            fixture.package_tar(7, "1.0.0");
        let release = fixture.load_release_descriptor(&descriptor, &signature);
        let transfer_root = fixture.root.join("transfers");
        fs::create_dir(&transfer_root).expect("transfer root creates");
        let transfer =
            PackageArchiveTransfer::open_or_begin(&transfer_root, "ready-seven", &release, 1)
                .expect("transfer opens");
        let archive_bytes = fs::read(&archive).expect("archive reads");
        let split = archive_bytes.len() / 2;
        transfer
            .append(0, &archive_bytes[..split])
            .expect("first chunk appends");
        transfer
            .append(split as u64, &archive_bytes[split..])
            .expect("second chunk appends");
        let store = fixture.store();

        assert!(matches!(
            store.stage_ready_transfer(&transfer, &descriptor, &signature, 1),
            Err(GenerationError::Transfer(PackageTransferError::NotReady))
        ));
        assert!(!fixture.root.join("staging/ready-seven").exists());

        let ready = transfer.finalize().expect("transfer finalizes");
        assert!(matches!(
            store.stage_ready_transfer(&transfer, &descriptor, &signature, 0),
            Err(GenerationError::Intake(PackageIntakeError::InvalidReserve))
        ));
        assert!(ready.is_file());
        let staged = store
            .stage_ready_transfer(&transfer, &descriptor, &signature, 1)
            .expect("ready transfer stages");
        assert_eq!(staged.generation, 7);
        assert_eq!(staged.intake.file_count, file_count);
        assert_eq!(staged.intake.expanded_bytes, expanded_bytes);
        assert!(fixture.root.join("staging/ready-seven").is_dir());
        assert!(ready.is_file());
        assert!(transfer_root.join(".transfer-ready-seven.json").is_file());
        assert!(matches!(
            store.stage_ready_transfer(&transfer, &descriptor, &signature, 1),
            Err(GenerationError::StagingTransactionExists(value)) if value == "ready-seven"
        ));
        let receipt_path = fixture
            .root
            .join("staging/ready-seven")
            .join(STAGED_TRANSFER_RECEIPT_FILE);
        let receipt_bytes = fs::read(&receipt_path).expect("receipt reads");
        fs::write(&receipt_path, b"{}").expect("receipt tampers");
        assert!(matches!(
            store.cleanup_staged_transfer_receipt(transfer),
            Err(GenerationError::StagedTransferReceiptMismatch(_))
        ));
        assert!(ready.is_file());
        assert!(transfer_root.join(".transfer-ready-seven.json").is_file());
        fs::write(&receipt_path, receipt_bytes).expect("receipt restores");
        let transfer =
            PackageArchiveTransfer::open_or_begin(&transfer_root, "ready-seven", &release, 1)
                .expect("transfer reopens");
        assert_eq!(
            store
                .cleanup_staged_transfer_receipt(transfer)
                .expect("staged receipt cleans"),
            PackageTransferCleanup {
                kind: PackageTransferCleanupKind::ConsumedReady,
            }
        );
        assert!(fixture.root.join("staging/ready-seven").is_dir());
        assert!(!ready.exists());
        assert!(!transfer_root.join(".transfer-ready-seven.json").exists());
        assert!(
            !transfer_root
                .join(".transfer-ready-seven.cleanup.json")
                .exists()
        );
    }

    #[test]
    fn ready_transfer_handoff_rejects_another_signed_release_binding() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, _, _) = fixture.package_tar(7, "1.0.0");
        let release = fixture.load_release_descriptor(&descriptor, &signature);
        let transfer_root = fixture.root.join("transfers");
        fs::create_dir(&transfer_root).expect("transfer root creates");
        let transfer =
            PackageArchiveTransfer::open_or_begin(&transfer_root, "bound-seven", &release, 1)
                .expect("transfer opens");
        let archive_bytes = fs::read(&archive).expect("archive reads");
        transfer.append(0, &archive_bytes).expect("archive appends");
        let ready = transfer.finalize().expect("transfer finalizes");
        let (other_descriptor, other_signature, _, _, _) = fixture.package_tar(8, "2.0.0");
        let store = fixture.store();

        assert!(matches!(
            store.stage_ready_transfer(&transfer, &other_descriptor, &other_signature, 1),
            Err(GenerationError::Transfer(
                PackageTransferError::BindingMismatch
            ))
        ));
        assert!(!fixture.root.join("staging/bound-seven").exists());
        assert!(ready.is_file());
        assert!(transfer_root.join(".transfer-bound-seven.json").is_file());
    }

    #[test]
    fn consumed_cleanup_rejects_a_different_staged_release() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, _, _) = fixture.package_tar(7, "1.0.0");
        let store = fixture.store();
        store
            .stage_package_tar("receipt-mismatch", &descriptor, &signature, &archive, 1)
            .expect("first release stages");

        let (other_descriptor, other_signature, other_archive, _, _) =
            fixture.package_tar(8, "2.0.0");
        let other_release = fixture.load_release_descriptor(&other_descriptor, &other_signature);
        let transfer_root = fixture.root.join("other-transfers");
        fs::create_dir(&transfer_root).expect("other transfer root creates");
        let transfer = PackageArchiveTransfer::open_or_begin(
            &transfer_root,
            "receipt-mismatch",
            &other_release,
            1,
        )
        .expect("other transfer opens");
        let archive_bytes = fs::read(&other_archive).expect("other archive reads");
        transfer
            .append(0, &archive_bytes)
            .expect("other archive appends");
        let ready = transfer.finalize().expect("other archive finalizes");

        assert!(matches!(
            store.cleanup_staged_transfer_receipt(transfer),
            Err(GenerationError::StagedTransferReceiptMismatch(value))
                if value == "receipt-mismatch"
        ));
        assert!(fixture.root.join("staging/receipt-mismatch").is_dir());
        assert!(ready.is_file());
        assert!(
            transfer_root
                .join(".transfer-receipt-mismatch.json")
                .is_file()
        );
    }

    #[test]
    fn failed_signed_intake_removes_partial_state_without_activation() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, _, _) = fixture.package_tar(7, "1.0.0");
        let mut document: serde_json::Value =
            serde_json::from_slice(&fs::read(&descriptor).expect("descriptor reads"))
                .expect("descriptor parses");
        document["expanded"]["fileCount"] = json!(7);
        fs::write(
            &descriptor,
            serde_json::to_vec(&document).expect("descriptor serializes"),
        )
        .expect("descriptor rewrites");
        fixture.sign_release_descriptor(&descriptor, &signature);
        let store = fixture.store();

        let error = store
            .stage_package_tar("bad-intake", &descriptor, &signature, &archive, 1)
            .expect_err("mismatched intake fails");
        assert!(
            matches!(
                error,
                GenerationError::Intake(PackageIntakeError::ExpandedFactsMismatch { .. })
            ),
            "unexpected intake error: {error:?}"
        );
        assert!(!fixture.root.join("staging/bad-intake").exists());
        assert!(!fixture.root.join("staging/.incoming-bad-intake").exists());
        assert!(!fixture.root.join(INTENT_FILE).exists());
        assert!(store.load_active().expect("active lookup works").is_none());
    }

    #[test]
    fn promotes_verified_generations_without_touching_save_data() {
        let fixture = Fixture::new();
        let save = fixture
            .data
            .join("profiles/player-one/games/retro-2048/save");
        fs::create_dir_all(save.parent().expect("save has parent"))
            .expect("save directory creates");
        fs::write(&save, b"committed progress").expect("save writes");
        fixture.stage("install-seven", 7, "1.0.0");
        let store = fixture.store();

        let first = store
            .promote_without_health("install-seven")
            .expect("generation publishes");
        assert_eq!(first.previous_generation, None);
        assert_eq!(first.active_generation, 7);
        assert_eq!(first.protected_state.generation(), 7);
        assert!(matches!(
            store.load_active(),
            Err(GenerationError::ProtectionCommitRequired(state))
                if state == first.protected_state
        ));
        let store = fixture.store_with_protected_state(first.protected_state);
        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        assert_eq!(active.generation, 7);
        assert_eq!(
            active
                .catalog
                .package_summary("retro-2048")
                .expect("package summary")
                .version,
            "1.0.0"
        );
        assert_eq!(
            fs::read(&save).expect("save remains readable"),
            b"committed progress"
        );

        fixture.stage("update-eight", 8, "1.1.0");
        let second = store
            .promote_without_health("update-eight")
            .expect("update publishes");
        assert_eq!(second.previous_generation, Some(7));
        assert_eq!(second.active_generation, 8);
        assert_eq!(second.protected_state.generation(), 8);
        let store = fixture.store_with_protected_state(second.protected_state);
        assert!(
            fixture
                .root
                .join("activations/00000000000000000007.json")
                .is_file()
        );
        assert!(
            fixture
                .root
                .join("activations/00000000000000000008.json")
                .is_file()
        );

        fixture.stage("repeat-eight", 8, "1.1.1");
        assert!(matches!(
            store.promote_without_health("repeat-eight"),
            Err(GenerationError::RollbackRejected {
                current: 8,
                candidate: 8
            })
        ));
    }

    #[test]
    fn protected_state_is_strict_bounded_and_scope_bound() {
        let target = current_target();
        let initial = ProtectedPackageGenerationState::initial("stable", &target)
            .expect("initial state creates");
        assert_eq!(
            ProtectedPackageGenerationState::from_json_bytes(
                &initial.to_json_bytes().expect("initial state serializes")
            )
            .expect("initial state parses"),
            initial
        );

        for invalid in [
            format!(
                r#"{{"schemaVersion":2,"channel":"stable","target":"{target}","generation":0,"catalogSha256":null}}"#
            ),
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"{target}","generation":0,"catalogSha256":"{}"}}"#,
                "00".repeat(32)
            ),
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"{target}","generation":7,"catalogSha256":null}}"#
            ),
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"{target}","generation":7,"catalogSha256":"{}"}}"#,
                "AA".repeat(32)
            ),
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"{target}","generation":0,"catalogSha256":null,"path":"writable.json"}}"#
            ),
        ] {
            assert!(
                ProtectedPackageGenerationState::from_json_bytes(invalid.as_bytes()).is_err(),
                "invalid protected state unexpectedly parsed: {invalid}"
            );
        }
        assert!(ProtectedPackageGenerationState::from_json_bytes(&[]).is_err());
        assert!(
            ProtectedPackageGenerationState::from_json_bytes(&vec![
                b' ';
                MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES
                    + 1
            ])
            .is_err()
        );

        let fixture = Fixture::new();
        for wrong_scope in [
            ProtectedPackageGenerationState::initial("recovery", &target)
                .expect("alternate channel creates"),
            ProtectedPackageGenerationState::initial("stable", "aarch64-linux")
                .expect("alternate target creates"),
        ] {
            assert!(matches!(
                PackageGenerationStore::open(PackageGenerationConfig {
                    store_root: fixture.root.clone(),
                    update_policy: fixture.update_policy.clone(),
                    protected_state: wrong_scope,
                    content_root: Some(fixture.content.clone()),
                    runtime_root: fixture.runtime.clone(),
                    data_root: fixture.data.clone(),
                }),
                Err(GenerationError::ProtectedStateScope { .. })
            ));
        }
    }

    #[test]
    fn pending_protection_blocks_launch_health_and_further_promotion() {
        let fixture = Fixture::new();
        fixture.stage("install-seven", 7, "1.0.0");
        let store = fixture.store();
        let first = store
            .promote_without_health("install-seven")
            .expect("first generation publishes");
        fixture.stage("update-eight", 8, "1.1.0");

        assert!(matches!(
            store.load_active(),
            Err(GenerationError::ProtectionCommitRequired(state))
                if state == first.protected_state
        ));
        assert!(matches!(
            store.promote_without_health("install-seven"),
            Err(GenerationError::ProtectionCommitRequired(state))
                if state == first.protected_state
        ));
        assert!(matches!(
            store.promote_without_health("update-eight"),
            Err(GenerationError::ProtectionCommitRequired(state))
                if state == first.protected_state
        ));
        assert!(matches!(
            store.plan_cleanup(2),
            Err(GenerationError::ProtectionCommitRequired(state))
                if state == first.protected_state
        ));
        let mut health_ran = false;
        assert!(matches!(
            store.promote_health_checked_with("update-eight", |_| {
                health_ran = true;
                Ok(())
            }),
            Err(GenerationError::ProtectionCommitRequired(state))
                if state == first.protected_state
        ));
        assert!(
            !health_ran,
            "pending protection must block candidate execution"
        );
        assert!(!fixture.root.join(INTENT_FILE).exists());
        assert!(fixture.root.join("staging/update-eight").is_dir());
        assert!(
            !fixture
                .root
                .join("activations/00000000000000000008.json")
                .exists()
        );

        let committed = fixture.store_with_protected_state(first.protected_state);
        assert_eq!(
            committed
                .load_active()
                .expect("committed generation loads")
                .expect("generation exists")
                .generation,
            7
        );
        assert_eq!(
            committed
                .promote_without_health("update-eight")
                .expect("next generation publishes")
                .active_generation,
            8
        );
    }

    #[test]
    fn pending_protected_state_is_derived_only_from_a_reverified_release() {
        let fixture = Fixture::new();
        fixture.stage("install-seven", 7, "1.0.0");
        let store = fixture.store();
        store
            .promote_without_health("install-seven")
            .expect("generation publishes");
        fs::write(
            fixture
                .root
                .join("generations/00000000000000000007/install/cores/2048_libretro.so"),
            b"changed after activation",
        )
        .expect("active artifact changes");

        assert!(matches!(
            store.load_active(),
            Err(GenerationError::Catalog(_))
        ));
        assert!(matches!(store.recover(), Err(GenerationError::Catalog(_))));
    }

    #[test]
    fn protected_history_rejects_deletion_and_same_generation_substitution() {
        let fixture = Fixture::new();
        let store = fixture
            .promote_generations(&[("install-seven", 7, "1.0.0"), ("update-eight", 8, "1.1.0")]);
        let protected = store.protected_state.clone();
        let marker_path = fixture.root.join("activations/00000000000000000008.json");
        let original = fs::read(&marker_path).expect("activation marker reads");

        fs::remove_file(&marker_path).expect("activation marker removes");
        assert!(matches!(
            fixture
                .store_with_protected_state(protected.clone())
                .load_active(),
            Err(GenerationError::ProtectedHistoryRollback {
                protected_generation: 8,
                active_generation: Some(7),
            })
        ));

        fs::write(&marker_path, &original).expect("activation marker restores");
        let mut substituted: serde_json::Value =
            serde_json::from_slice(&original).expect("activation marker parses");
        substituted["catalogSha256"] = json!("00".repeat(32));
        fs::write(
            &marker_path,
            serde_json::to_vec(&substituted).expect("substituted marker serializes"),
        )
        .expect("activation marker substitutes");
        assert!(matches!(
            fixture.store_with_protected_state(protected).load_active(),
            Err(GenerationError::ProtectedCatalogSubstitution { generation: 8 })
        ));
    }

    #[test]
    fn rejects_changed_artifacts_before_publishing_durable_intent() {
        let fixture = Fixture::new();
        let stage = fixture.stage("tampered-seven", 7, "1.0.0");
        fs::write(stage.join("install/cores/2048_libretro.so"), b"changed")
            .expect("artifact tamper writes");
        let store = fixture.store();

        assert!(matches!(
            store.promote_without_health("tampered-seven"),
            Err(GenerationError::Catalog(_))
        ));
        assert!(!fixture.root.join(INTENT_FILE).exists());
        assert!(
            !fixture
                .root
                .join("activations/00000000000000000007.json")
                .exists()
        );
        assert!(stage.is_dir());
    }

    #[test]
    fn health_gate_uses_signed_policy_and_ephemeral_candidate_storage() {
        let fixture = Fixture::new();
        fixture.stage("health-seven", 7, "1.0.0");
        let store = fixture.store();
        let mut checks = 0;

        let outcome = store
            .promote_health_checked_with("health-seven", |request| {
                checks += 1;
                assert_eq!(request.game_id, "retro-2048");
                assert_eq!(request.policy.check, PackageHealthCheck::Process);
                let crate::package_launch::PackageLaunchPlan::Libretro(plan) = &request.plan else {
                    panic!("fixture must resolve as libretro");
                };
                assert!(
                    plan.storage()
                        .saves
                        .starts_with(fixture.runtime.join("package-health/health-seven"))
                );
                assert!(
                    !plan.storage().saves.starts_with(&fixture.data),
                    "candidate health must not use player save storage"
                );
                Ok(())
            })
            .expect("successful signed health gate promotes");

        assert_eq!(checks, 1);
        assert_eq!(outcome.active_generation, 7);
    }

    #[test]
    fn health_gate_dispatches_native_packages_with_ephemeral_storage() {
        let fixture = Fixture::new();
        fixture.stage_native("native-health-seven", 7, "1.0.0");
        let store = fixture.store();
        let mut checks = 0;

        let outcome = store
            .promote_health_checked_with("native-health-seven", |request| {
                checks += 1;
                assert_eq!(request.game_id, "native-game");
                assert_eq!(request.policy.check, PackageHealthCheck::Process);
                let crate::package_launch::PackageLaunchPlan::Native(plan) = &request.plan else {
                    panic!("native fixture must use the native planner");
                };
                let health_root = fixture
                    .runtime
                    .join("package-health/native-health-seven/native-game");
                assert!(
                    plan.storage()
                        .session
                        .starts_with(health_root.join("runtime"))
                );
                assert!(plan.storage().data.starts_with(health_root.join("data")));
                assert!(
                    !plan.storage().data.starts_with(&fixture.data),
                    "candidate health must not use player data storage"
                );
                assert_eq!(plan.launch().arguments().count(), 0);
                Ok(())
            })
            .expect("successful native health gate promotes");

        assert_eq!(checks, 1);
        assert_eq!(outcome.active_generation, 7);
    }

    #[test]
    fn health_gate_rejects_a_resigned_catalog_changed_after_checks() {
        let fixture = Fixture::new();
        let stage = fixture.stage("health-seven", 7, "1.0.0");
        let store = fixture.store();

        assert!(matches!(
            store.promote_health_checked_with("health-seven", |_| {
                let catalog_path = stage.join("installed-catalog.json");
                let mut document: serde_json::Value = serde_json::from_slice(
                    &fs::read(&catalog_path).expect("candidate catalog reads"),
                )
                .expect("candidate catalog parses");
                document["generation"] = json!(8);
                let catalog =
                    serde_json::to_vec(&document).expect("changed candidate catalog serializes");
                fs::write(&catalog_path, &catalog).expect("changed candidate catalog writes");
                let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
                message.extend_from_slice(&catalog);
                let signature = fixture.catalog_signing_key.sign(&message);
                fs::write(
                    stage.join("installed-catalog.sig"),
                    signature_bundle("catalog-one", &signature.to_bytes()),
                )
                .expect("changed candidate signature writes");
                Ok(())
            }),
            Err(GenerationError::CandidateChangedAfterHealth)
        ));
        assert!(!fixture.root.join(INTENT_FILE).exists());
        assert!(stage.is_dir());
    }

    #[test]
    fn failed_candidate_health_never_publishes_or_touches_saves() {
        let fixture = Fixture::new();
        let stage = fixture.stage("health-seven", 7, "1.0.0");
        let save = fixture
            .data
            .join("profiles/player-one/games/retro-2048/save");
        fs::create_dir_all(save.parent().expect("save has parent"))
            .expect("save directory creates");
        fs::write(&save, b"existing progress").expect("save writes");
        let store = fixture.store();

        assert!(matches!(
            store.promote_health_checked(
                "health-seven",
                &CandidateHealthChecker::new(std::time::Duration::from_millis(5))
                    .expect("health checker creates")
            ),
            Err(GenerationError::Health(_))
        ));
        assert!(!fixture.root.join(INTENT_FILE).exists());
        assert!(
            !fixture
                .root
                .join("activations/00000000000000000007.json")
                .exists()
        );
        assert!(stage.is_dir());
        assert_eq!(
            fs::read(save).expect("save remains readable"),
            b"existing progress"
        );
    }

    #[test]
    fn health_evidence_is_bound_to_the_exact_candidate_catalog() {
        let fixture = Fixture::new();
        fixture.stage("health-seven", 7, "1.0.0");
        let store = fixture.store();

        assert!(matches!(
            store.activate_verified("health-seven", Some(&"00".repeat(32))),
            Err(GenerationError::CandidateChangedAfterHealth)
        ));
        assert!(!fixture.root.join(INTENT_FILE).exists());
        assert!(
            !fixture
                .root
                .join("activations/00000000000000000007.json")
                .exists()
        );
    }

    #[test]
    fn resumes_interruption_before_and_after_generation_move() {
        for move_before_recovery in [false, true] {
            let fixture = Fixture::new();
            let stage = fixture.stage("recover-seven", 7, "1.0.0");
            let store = fixture.store();
            assert!(
                !store
                    .recovery_required()
                    .expect("clean store inspection succeeds")
            );
            let marker = fixture.publish_intent(&store, "recover-seven");
            assert!(
                store
                    .recovery_required()
                    .expect("durable intent is detected")
            );
            if move_before_recovery {
                fs::rename(
                    &stage,
                    fixture.root.join("generations/00000000000000000007"),
                )
                .expect("simulate completed generation move");
            }

            let recovery = store.recover().expect("promotion recovers");
            let RecoveryOutcome::ProtectionCommitRequired { state } = recovery else {
                panic!("recovered activation must require protected-state commit");
            };
            assert_eq!(state.generation(), 7);
            assert!(matches!(
                store.load_active(),
                Err(GenerationError::ProtectionCommitRequired(pending))
                    if pending == state
            ));
            let store = fixture.store_with_protected_state(state);
            assert_eq!(
                store
                    .load_active()
                    .expect("active loads")
                    .expect("active exists")
                    .generation,
                marker.generation
            );
            assert_eq!(
                store.recover().expect("second recovery is clean"),
                RecoveryOutcome::Clean
            );
            assert!(
                !store
                    .recovery_required()
                    .expect("completed store inspection succeeds")
            );
        }
    }

    #[test]
    fn intent_publication_is_no_replace_across_competing_transactions() {
        let fixture = Fixture::new();
        fixture.stage("install-seven", 7, "1.0.0");
        fixture.stage("install-eight", 8, "1.1.0");
        let store = fixture.store();
        let first = fixture.publish_intent(&store, "install-seven");

        let second_stage = store
            .canonical_stage("install-eight")
            .expect("second stage canonicalizes");
        let second_release = store
            .load_release(&second_stage)
            .expect("second release verifies");
        let second = ActivationMarker {
            schema_version: ACTIVATION_SCHEMA_VERSION,
            generation: second_release.generation,
            transaction_id: "install-eight".to_owned(),
            catalog_sha256: second_release.catalog_sha256,
        };
        let second_staged_intent = second_stage.join(STAGED_INTENT_FILE);
        prepare_staged_marker(&second_staged_intent, &second)
            .expect("second staged intent persists");

        assert!(matches!(
            publish_intent(&second_staged_intent, &fixture.root.join(INTENT_FILE)),
            Err(GenerationError::RecoveryRequired)
        ));
        assert_eq!(
            read_marker(&fixture.root.join(INTENT_FILE)).expect("first intent remains"),
            first
        );
    }

    #[test]
    fn recovers_after_activation_commit_before_intent_unlink() {
        let fixture = Fixture::new();
        let stage = fixture.stage("recover-seven", 7, "1.0.0");
        let store = fixture.store();
        fixture.publish_intent(&store, "recover-seven");
        fs::rename(stage, fixture.root.join("generations/00000000000000000007"))
            .expect("simulate completed generation move");
        fs::hard_link(
            fixture.root.join(INTENT_FILE),
            fixture.root.join("activations/00000000000000000007.json"),
        )
        .expect("simulate committed activation before intent unlink");

        let recovery = store.recover().expect("completed activation recovers");
        let RecoveryOutcome::ProtectionCommitRequired { state } = recovery else {
            panic!("completed activation must require protected-state commit");
        };
        assert_eq!(state.generation(), 7);
        assert!(!fixture.root.join(INTENT_FILE).exists());
        let store = fixture.store_with_protected_state(state);
        assert_eq!(
            store
                .load_active()
                .expect("active loads")
                .expect("active exists")
                .generation,
            7
        );
    }

    #[test]
    fn refuses_to_activate_an_artifact_changed_after_the_generation_move() {
        let fixture = Fixture::new();
        let stage = fixture.stage("recover-seven", 7, "1.0.0");
        let store = fixture.store();
        fixture.publish_intent(&store, "recover-seven");
        let generation = fixture.root.join("generations/00000000000000000007");
        fs::rename(stage, &generation).expect("simulate completed generation move");
        fs::write(
            generation.join("install/cores/2048_libretro.so"),
            b"changed",
        )
        .expect("post-move artifact tamper writes");

        assert!(matches!(store.recover(), Err(GenerationError::Catalog(_))));
        assert!(fixture.root.join(INTENT_FILE).is_file());
        assert!(
            !fixture
                .root
                .join("activations/00000000000000000007.json")
                .exists()
        );
    }

    #[test]
    fn cleanup_plan_retains_two_newest_and_classifies_only_inert_history() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ]);
        fs::create_dir(fixture.root.join("generations/00000000000000000010"))
            .expect("orphan generation directory creates");

        assert_eq!(
            store.plan_cleanup(2).expect("cleanup plan classifies"),
            super::GenerationCleanupPlan {
                active_generation: Some(9),
                protected_generations: Vec::new(),
                retained_generations: vec![8, 9],
                retired_generations: vec![7],
                orphan_generations: vec![10],
            }
        );
        assert!(
            fixture
                .root
                .join("generations/00000000000000000007")
                .is_dir(),
            "planning must not remove retired data"
        );
        assert!(
            fixture
                .root
                .join("generations/00000000000000000010")
                .is_dir(),
            "planning must not remove orphan data"
        );
    }

    #[test]
    fn cleanup_plan_unions_trusted_launch_protection_with_rollback_retention() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ]);

        assert_eq!(
            store
                .plan_cleanup_with_protected_generations(2, &[7])
                .expect("live launch generation remains retained"),
            super::GenerationCleanupPlan {
                active_generation: Some(9),
                protected_generations: vec![7],
                retained_generations: vec![7, 8, 9],
                retired_generations: Vec::new(),
                orphan_generations: Vec::new(),
            }
        );
    }

    #[test]
    fn explicit_cleanup_is_bounded_preserves_rollback_and_never_touches_saves() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
            ("update-ten", 10, "1.3.0"),
        ]);
        fs::create_dir(fixture.root.join("generations/00000000000000000011"))
            .expect("orphan generation directory creates");
        let save = fixture.data.join("local-player/retro-2048/save.srm");
        fs::create_dir_all(save.parent().expect("save has parent")).expect("save parent creates");
        fs::write(&save, b"player progress").expect("save writes");
        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        let service =
            NativeLaunchService::new(Arc::new(active.catalog), vec!["local-player".to_owned()])
                .expect("launch service configures");
        fs::write(
            fixture.root.join(CLEANUP_INTENT_TEMP_FILE),
            b"interrupted before authoritative publication",
        )
        .expect("stale unpublished intent writes");

        let outcome = store
            .cleanup_for_launch_service(2, 2, &service)
            .expect("bounded cleanup completes");
        assert_eq!(outcome.removed_orphan_generations, vec![11]);
        assert_eq!(outcome.removed_retired_generations, vec![7]);
        assert_eq!(
            outcome.remaining_plan,
            super::GenerationCleanupPlan {
                active_generation: Some(10),
                protected_generations: Vec::new(),
                retained_generations: vec![9, 10],
                retired_generations: vec![8],
                orphan_generations: Vec::new(),
            }
        );
        assert!(!fixture.root.join(CLEANUP_INTENT_FILE).exists());
        assert!(!fixture.root.join(CLEANUP_INTENT_TEMP_FILE).exists());
        assert!(
            !fixture
                .root
                .join("activations/00000000000000000007.json")
                .exists()
        );
        assert!(
            !fixture
                .root
                .join("generations/00000000000000000007")
                .exists()
        );
        assert!(
            fixture
                .root
                .join("activations/00000000000000000008.json")
                .is_file(),
            "bounded cleanup leaves the next retired generation"
        );
        assert_eq!(
            fs::read(save).expect("save survives generation cleanup"),
            b"player progress"
        );
    }

    #[test]
    fn cleanup_recovery_resumes_after_marker_removal_and_blocks_other_mutations() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ]);
        let plan = store.plan_cleanup(2).expect("cleanup plan derives");
        let intent = store
            .create_cleanup_intent(&plan, 2, 1)
            .expect("cleanup intent derives");
        store
            .write_cleanup_intent(&intent)
            .expect("cleanup intent persists");
        fs::hard_link(
            fixture.root.join(CLEANUP_INTENT_FILE),
            fixture.root.join(CLEANUP_INTENT_TEMP_FILE),
        )
        .expect("simulated interruption retains published temporary link");
        fs::remove_file(fixture.root.join("activations/00000000000000000007.json"))
            .expect("simulated interruption removes marker");

        assert!(
            store
                .cleanup_recovery_required()
                .expect("cleanup recovery state validates")
        );
        assert!(matches!(
            store.plan_cleanup(2),
            Err(GenerationError::CleanupRecoveryRequired)
        ));
        fixture.stage("blocked-ten", 10, "2.0.0");
        assert!(matches!(
            store.promote_without_health("blocked-ten"),
            Err(GenerationError::CleanupRecoveryRequired)
        ));
        assert!(matches!(
            store.recover(),
            Err(GenerationError::CleanupRecoveryRequired)
        ));

        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        let service =
            NativeLaunchService::new(Arc::new(active.catalog), vec!["local-player".to_owned()])
                .expect("launch service configures");
        let outcome = store
            .recover_cleanup_for_launch_service(&service)
            .expect("cleanup recovery succeeds")
            .expect("cleanup intent was present");
        assert_eq!(outcome.removed_retired_generations, vec![7]);
        assert!(
            !fixture
                .root
                .join("generations/00000000000000000007")
                .exists()
        );
        assert!(!fixture.root.join(CLEANUP_INTENT_FILE).exists());
        assert!(!fixture.root.join(CLEANUP_INTENT_TEMP_FILE).exists());
        assert!(
            !store
                .cleanup_recovery_required()
                .expect("cleanup recovery clears")
        );
    }

    #[test]
    fn cleanup_recovery_is_idempotent_after_target_bytes_are_already_absent() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ]);
        let plan = store.plan_cleanup(2).expect("cleanup plan derives");
        let intent = store
            .create_cleanup_intent(&plan, 2, 1)
            .expect("cleanup intent derives");
        store
            .write_cleanup_intent(&intent)
            .expect("cleanup intent persists");
        fs::remove_file(fixture.root.join("activations/00000000000000000007.json"))
            .expect("simulated interruption removes marker");
        fs::remove_dir_all(fixture.root.join("generations/00000000000000000007"))
            .expect("simulated interruption removes generation");

        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        let service =
            NativeLaunchService::new(Arc::new(active.catalog), vec!["local-player".to_owned()])
                .expect("launch service configures");
        assert_eq!(
            store
                .recover_cleanup_for_launch_service(&service)
                .expect("completed mutation recovers")
                .expect("cleanup intent exists")
                .removed_retired_generations,
            vec![7]
        );
        assert!(
            store
                .recover_cleanup_for_launch_service(&service)
                .expect("second recovery is clean")
                .is_none()
        );
    }

    #[test]
    fn cleanup_noop_and_interrupted_orphan_removal_are_deterministic() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[("install-seven", 7, "1.0.0")]);
        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        let service =
            NativeLaunchService::new(Arc::new(active.catalog), vec!["local-player".to_owned()])
                .expect("launch service configures");

        let noop = store
            .cleanup_for_launch_service(2, 1, &service)
            .expect("clean history is a no-op");
        assert!(noop.removed_retired_generations.is_empty());
        assert!(noop.removed_orphan_generations.is_empty());
        assert!(!fixture.root.join(CLEANUP_INTENT_FILE).exists());

        let orphan = fixture.root.join("generations/00000000000000000008");
        fs::create_dir(&orphan).expect("orphan directory creates");
        let plan = store.plan_cleanup(2).expect("orphan plan derives");
        let intent = store
            .create_cleanup_intent(&plan, 2, 1)
            .expect("orphan intent derives");
        store
            .write_cleanup_intent(&intent)
            .expect("orphan intent persists");
        fs::remove_dir(&orphan).expect("simulated interruption removes empty orphan");

        let recovered = store
            .recover_cleanup_for_launch_service(&service)
            .expect("orphan cleanup recovers")
            .expect("orphan cleanup intent exists");
        assert_eq!(recovered.removed_orphan_generations, vec![8]);
        assert!(recovered.removed_retired_generations.is_empty());
        assert!(!fixture.root.join(CLEANUP_INTENT_FILE).exists());
    }

    #[test]
    fn cleanup_recovery_refuses_new_protection_or_changed_target_identity() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ]);
        let plan = store.plan_cleanup(2).expect("cleanup plan derives");
        let intent = store
            .create_cleanup_intent(&plan, 2, 1)
            .expect("cleanup intent derives");
        store
            .write_cleanup_intent(&intent)
            .expect("cleanup intent persists");

        assert!(matches!(
            store.apply_cleanup_intent_unlocked(&intent, &[7]),
            Err(GenerationError::CleanupTargetProtected(7))
        ));
        assert!(fixture.root.join(CLEANUP_INTENT_FILE).is_file());

        let activation = fixture.root.join("activations/00000000000000000007.json");
        let mut changed = read_marker(&activation).expect("target marker reads");
        changed.transaction_id = "different-seven".to_owned();
        fs::write(
            &activation,
            serde_json::to_vec(&changed).expect("changed marker serializes"),
        )
        .expect("target marker changes");
        assert!(matches!(
            store.apply_cleanup_intent_unlocked(&intent, &[]),
            Err(GenerationError::CleanupTargetChanged(7))
        ));
        assert!(fixture.root.join(CLEANUP_INTENT_FILE).is_file());
        assert!(
            fixture
                .root
                .join("generations/00000000000000000007")
                .is_dir()
        );
    }

    #[test]
    fn cleanup_rejects_invalid_bounds_and_malformed_intent() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[("install-seven", 7, "1.0.0")]);
        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        let service =
            NativeLaunchService::new(Arc::new(active.catalog), vec!["local-player".to_owned()])
                .expect("launch service configures");

        for limit in [0, super::MAX_GENERATION_ENTRIES + 1] {
            assert!(matches!(
                store.cleanup_for_launch_service(2, limit, &service),
                Err(GenerationError::InvalidCleanupLimit(value)) if value == limit
            ));
        }
        fs::write(fixture.root.join(CLEANUP_INTENT_FILE), b"not an intent")
            .expect("malformed cleanup intent writes");
        assert!(matches!(
            store.cleanup_recovery_required(),
            Err(GenerationError::CleanupIntentInvalid(_))
        ));
        assert!(matches!(
            store.recover_cleanup_for_launch_service(&service),
            Err(GenerationError::CleanupIntentInvalid(_))
        ));
    }

    #[test]
    fn cleanup_planning_composes_launch_maintenance_with_store_serialization() {
        let fixture = Fixture::new();
        let store = fixture.promote_generations(&[("install-seven", 7, "1.0.0")]);
        let active = store
            .load_active()
            .expect("active generation loads")
            .expect("active generation exists");
        let service =
            NativeLaunchService::new(Arc::new(active.catalog), vec!["local-player".to_owned()])
                .expect("launch service configures");

        assert_eq!(
            store
                .plan_cleanup_for_launch_service(2, &service)
                .expect("coordinated cleanup plan derives"),
            super::GenerationCleanupPlan {
                active_generation: Some(7),
                protected_generations: Vec::new(),
                retained_generations: vec![7],
                retired_generations: Vec::new(),
                orphan_generations: Vec::new(),
            }
        );
    }

    #[test]
    fn package_store_operation_lock_fails_closed_across_open_handles() {
        let fixture = Fixture::new();
        let first = fixture.store();
        let second = fixture.store();
        let operation = first
            .acquire_operation_lock()
            .expect("first operation lock acquires");

        assert!(matches!(second.plan_cleanup(2), Err(GenerationError::Busy)));
        assert!(matches!(second.recover(), Err(GenerationError::Busy)));

        drop(operation);
        assert_eq!(
            second
                .plan_cleanup(2)
                .expect("planning resumes after operation"),
            super::GenerationCleanupPlan {
                active_generation: None,
                protected_generations: Vec::new(),
                retained_generations: Vec::new(),
                retired_generations: Vec::new(),
                orphan_generations: Vec::new(),
            }
        );
    }

    #[test]
    fn package_store_operation_lock_must_remain_a_regular_inert_file() {
        let fixture = Fixture::new();
        let store = fixture.store();
        let lock_path = fixture.root.join(OPERATION_LOCK_FILE);
        assert_eq!(
            fs::read(&lock_path).expect("operation lock reads"),
            Vec::<u8>::new(),
            "the lock must contain no authority or progress"
        );

        fs::remove_file(&lock_path).expect("test lock file removes");
        fs::create_dir(&lock_path).expect("test lock directory creates");
        assert!(matches!(
            store.plan_cleanup(2),
            Err(GenerationError::UnsafePath {
                kind: "package store operation lock",
                ..
            })
        ));
    }

    #[test]
    fn package_store_requires_a_preprovisioned_operation_lock() {
        let fixture = Fixture::new();
        fs::remove_file(fixture.root.join(OPERATION_LOCK_FILE))
            .expect("test operation lock removes");

        assert!(matches!(
            PackageGenerationStore::open(PackageGenerationConfig {
                store_root: fixture.root.clone(),
                update_policy: fixture.update_policy.clone(),
                protected_state: ProtectedPackageGenerationState::initial(
                    "stable",
                    current_target(),
                )
                .expect("initial protected state creates"),
                content_root: Some(fixture.content.clone()),
                runtime_root: fixture.runtime.clone(),
                data_root: fixture.data.clone(),
            }),
            Err(GenerationError::Io {
                operation: "resolve file",
                ..
            })
        ));
    }

    #[test]
    fn cleanup_plan_rejects_untrusted_or_ambiguous_protection_values() {
        let fixture = Fixture::new();
        let store = fixture.store();
        fixture.stage("install-seven", 7, "1.0.0");
        store
            .promote_without_health("install-seven")
            .expect("generation promotes");
        fs::create_dir(fixture.root.join("generations/00000000000000000008"))
            .expect("orphan generation directory creates");

        for protected in [&[0][..], &[7, 7][..], &[8][..], &[9][..]] {
            assert!(matches!(
                store.plan_cleanup_with_protected_generations(2, protected),
                Err(GenerationError::InvalidCleanupProtection(_))
            ));
        }
    }

    #[test]
    fn cleanup_plan_fails_closed_on_recovery_and_inconsistent_history() {
        let fixture = Fixture::new();
        let stage = fixture.stage("install-seven", 7, "1.0.0");
        let store = fixture.store();
        fixture.publish_intent(&store, "install-seven");
        assert!(matches!(
            store.plan_cleanup(2),
            Err(GenerationError::RecoveryRequired)
        ));
        fs::remove_file(fixture.root.join(INTENT_FILE)).expect("test intent removes");
        fs::remove_dir_all(stage).expect("test stage removes");

        assert!(matches!(
            store.plan_cleanup(1),
            Err(GenerationError::InvalidRetentionCount(1))
        ));

        fixture.stage("install-eight", 8, "1.1.0");
        store
            .promote_without_health("install-eight")
            .expect("generation promotes");
        fs::remove_dir_all(fixture.root.join("generations/00000000000000000008"))
            .expect("test generation removes");
        assert!(matches!(
            store.plan_cleanup(2),
            Err(GenerationError::InvalidLayout(_))
        ));
    }

    #[test]
    fn malformed_newest_marker_fails_closed_instead_of_falling_back() {
        let fixture = Fixture::new();
        fixture.stage("install-seven", 7, "1.0.0");
        let store = fixture.store();
        store
            .promote_without_health("install-seven")
            .expect("generation promotes");
        fs::write(
            fixture.root.join("activations/00000000000000000008.json"),
            b"not a valid marker",
        )
        .expect("malformed marker writes");

        assert!(matches!(
            store.load_active(),
            Err(GenerationError::MarkerMismatch(_))
        ));
    }

    fn digest(path: &Path) -> String {
        hex(&Sha256::digest(fs::read(path).expect("fixture file reads")))
    }

    fn hex(bytes: &[u8]) -> String {
        let mut output = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            use std::fmt::Write as _;
            write!(output, "{byte:02x}").expect("writing to a String cannot fail");
        }
        output
    }

    fn signature_bundle(key_id: &str, signature: &[u8; 64]) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "schemaVersion": 1,
            "signatures": [{
                "keyId": key_id,
                "signature": hex(signature),
            }],
        }))
        .expect("signature bundle serializes")
    }
}
