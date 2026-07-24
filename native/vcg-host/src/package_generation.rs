//! Crash-recoverable activation of fully verified signed package generations.

use std::collections::BTreeSet;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::installed_catalog::{
    CatalogError, CatalogRoots, ResolvedPackage, TrustedPackageCatalog,
};
use crate::package_health::{CandidateHealthChecker, CandidateHealthError, CandidateHealthRequest};
use crate::package_intake::{
    CapacityAdmission, PackageIntakeError, PackageIntakeStats, VerifiedPackageRelease,
};
use crate::package_transfer::{
    PackageArchiveTransfer, PackageReleaseIdentity, PackageTransferCleanup, PackageTransferError,
};
use crate::retroarch::plan as plan_retroarch;

const ACTIVATION_SCHEMA_VERSION: u32 = 1;
const MAX_MARKER_BYTES: u64 = 1_024;
const INTENT_FILE: &str = "promotion.intent";
const STAGED_INTENT_FILE: &str = ".vcg-promotion-intent";
const STAGED_TRANSFER_RECEIPT_FILE: &str = ".vcg-transfer-receipt.json";
const STAGED_TRANSFER_RECEIPT_SCHEMA_VERSION: u32 = 1;
const CATALOG_FILE: &str = "installed-catalog.json";
const CATALOG_SIGNATURE_FILE: &str = "installed-catalog.sig";
const INSTALL_DIRECTORY: &str = "install";
const MAX_GENERATION_ENTRIES: usize = 4_096;
const MIN_RETAINED_GENERATIONS: usize = 2;

/// Host-owned paths for a package generation store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackageGenerationConfig {
    pub store_root: PathBuf,
    pub public_key_path: PathBuf,
    pub content_root: Option<PathBuf>,
    pub runtime_root: PathBuf,
    pub data_root: PathBuf,
}

/// One active, signature-verified package snapshot.
#[derive(Clone, Debug)]
pub struct ActiveGeneration {
    pub generation: u64,
    pub release_root: PathBuf,
    pub catalog: TrustedPackageCatalog,
}

/// Result of resuming a previously durable promotion intent.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecoveryOutcome {
    Clean,
    Activated { generation: u64 },
}

/// Result of atomically making a staged generation active.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PromotionOutcome {
    pub previous_generation: Option<u64>,
    pub active_generation: u64,
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

/// Host-owned signed package generation storage.
#[derive(Clone, Debug)]
pub struct PackageGenerationStore {
    root: PathBuf,
    staging: PathBuf,
    generations: PathBuf,
    activations: PathBuf,
    public_key_path: PathBuf,
    content_root: Option<PathBuf>,
    runtime_root: PathBuf,
    data_root: PathBuf,
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
        validate_absolute("catalog public key", &config.public_key_path)?;
        if let Some(content_root) = &config.content_root {
            validate_absolute("managed content root", content_root)?;
        }
        validate_absolute("runtime root", &config.runtime_root)?;
        validate_absolute("data root", &config.data_root)?;

        let root = canonical_directory("store root", &config.store_root)?;
        let staging = canonical_child_directory(&root, "staging")?;
        let generations = canonical_child_directory(&root, "generations")?;
        let activations = canonical_child_directory(&root, "activations")?;
        let public_key_path = canonical_file("catalog public key", &config.public_key_path)?;
        let content_root = config
            .content_root
            .as_deref()
            .map(|path| canonical_directory("managed content root", path))
            .transpose()?;

        Ok(Self {
            root,
            staging,
            generations,
            activations,
            public_key_path,
            content_root,
            runtime_root: config.runtime_root,
            data_root: config.data_root,
        })
    }

    /// Loads and re-verifies the highest committed generation.
    ///
    /// A malformed activation marker fails closed rather than silently falling
    /// back to an older generation.
    ///
    /// # Errors
    ///
    /// Rejects malformed markers and any changed signed catalog or artifact.
    pub fn load_active(&self) -> Result<Option<ActiveGeneration>, GenerationError> {
        self.activation_generations()?
            .last()
            .copied()
            .map(|generation| self.load_committed_generation(generation))
            .transpose()
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
    /// Rejects retention counts outside `2..=4096`, recovery-required state,
    /// malformed history, and unsafe generation directories.
    pub fn plan_cleanup(
        &self,
        retain_count: usize,
    ) -> Result<GenerationCleanupPlan, GenerationError> {
        self.plan_cleanup_with_protected_generations(retain_count, &[])
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
    pub fn plan_cleanup_with_protected_generations(
        &self,
        retain_count: usize,
        protected_generations: &[u64],
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
        if self.recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
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

        let active_generation = activated.last().copied();
        if let Some(active) = active_generation {
            self.load_committed_generation(active)?;
        }
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
        validate_transaction_id(transaction_id)?;
        if self.recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        let release = VerifiedPackageRelease::load(
            descriptor_path,
            descriptor_signature_path,
            &self.public_key_path,
        )?;
        self.stage_verified_package_tar(transaction_id, archive_path, reserve_bytes, &release)
    }

    /// Admits a finalized archive directly from its still-locked durable
    /// transfer into one inert staging transaction.
    ///
    /// The descriptor is independently verified with the generation store's
    /// configured key. The transfer binding must match that exact release, and
    /// the ready archive is re-hashed before extraction. Successful staging
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
        let transaction_id = transfer.transaction_id();
        validate_transaction_id(transaction_id)?;
        if self.recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        let release = VerifiedPackageRelease::load(
            descriptor_path,
            descriptor_signature_path,
            &self.public_key_path,
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
        let transaction_id = transfer.transaction_id();
        validate_transaction_id(transaction_id)?;
        if self.recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
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
        if self.recovery_required()? {
            return Err(GenerationError::RecoveryRequired);
        }
        let stage = self.canonical_stage(transaction_id)?;
        let candidate = self.load_release(&stage)?;
        let expected_catalog_sha256 = candidate.catalog_sha256.clone();
        for package in candidate.catalog.package_health_policies()? {
            let ResolvedPackage::Libretro(mut request) = candidate
                .catalog
                .resolve(&package.game_id, "package-health")?;
            let health_root = self
                .runtime_root
                .join("package-health")
                .join(transaction_id)
                .join(&package.game_id);
            request.runtime_root = health_root.join("runtime");
            request.data_root = health_root.join("data");
            let plan = plan_retroarch(&request).map_err(CandidateHealthError::Prepare)?;
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
    /// into a versioned generation directory and becomes active through one
    /// no-replace activation entry. Read-only mount enforcement remains an
    /// operating system integration requirement. A crash after intent
    /// publication is resumed by [`Self::recover`].
    ///
    /// # Errors
    ///
    /// Rejects invalid transaction IDs, pending recovery, downgrade/equal
    /// generations, signature or artifact failures, and unsafe layouts.
    fn activate_verified(
        &self,
        transaction_id: &str,
        expected_catalog_sha256: Option<&str>,
    ) -> Result<PromotionOutcome, GenerationError> {
        validate_transaction_id(transaction_id)?;
        let global_intent = self.root.join(INTENT_FILE);
        if global_intent.exists() {
            return Err(GenerationError::RecoveryRequired);
        }

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
        Ok(PromotionOutcome {
            previous_generation,
            active_generation: generation,
        })
    }

    #[cfg(test)]
    fn promote_without_health(
        &self,
        transaction_id: &str,
    ) -> Result<PromotionOutcome, GenerationError> {
        self.activate_verified(transaction_id, None)
    }

    /// Completes an interrupted promotion after its durable intent exists.
    ///
    /// Incomplete staging directories without a durable intent are never made
    /// active. They remain available for an explicit retry or later bounded
    /// garbage collection.
    ///
    /// # Errors
    ///
    /// Rejects inconsistent or changed candidate state and downgrades.
    pub fn recover(&self) -> Result<RecoveryOutcome, GenerationError> {
        let intent_path = self.root.join(INTENT_FILE);
        if !intent_path.exists() {
            return Ok(RecoveryOutcome::Clean);
        }
        let marker = read_marker(&intent_path)?;
        validate_marker(&marker, marker.generation)?;
        let current = self.load_active()?.map(|active| active.generation);
        if let Some(current) = current {
            if marker.generation == current {
                let activation = read_marker(&self.activation_path(current))?;
                if activation != marker {
                    return Err(GenerationError::MarkerMismatch(
                        "committed activation differs from the remaining intent".to_owned(),
                    ));
                }
                fs::remove_file(&intent_path).map_err(|source| GenerationError::Io {
                    operation: "remove completed package promotion intent",
                    path: intent_path,
                    source,
                })?;
                sync_directory(&self.root)?;
                return Ok(RecoveryOutcome::Activated {
                    generation: current,
                });
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
        Ok(RecoveryOutcome::Activated {
            generation: marker.generation,
        })
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
        let catalog_sha256 = sha256_file(&catalog_path)?;
        let catalog = TrustedPackageCatalog::load(
            &catalog_path,
            &signature_path,
            &self.public_key_path,
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
    if marker.catalog_sha256.len() != 64
        || !marker
            .catalog_sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
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
    Health(CandidateHealthError),
    Intake(PackageIntakeError),
    Transfer(PackageTransferError),
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidLayout(String),
    InvalidRetentionCount(usize),
    InvalidCleanupProtection(String),
    InvalidTransactionId(String),
    StagingTransactionExists(String),
    StagedTransferReceiptMismatch(String),
    IntakeDescriptorMismatch(String),
    MarkerMismatch(String),
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
            Self::Health(error) => write!(formatter, "{error}"),
            Self::Intake(error) => write!(formatter, "{error}"),
            Self::Transfer(error) => write!(formatter, "{error}"),
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidLayout(error) => write!(formatter, "package store is invalid: {error}"),
            Self::InvalidRetentionCount(count) => write!(
                formatter,
                "package retention count {count} is outside {MIN_RETAINED_GENERATIONS}..={MAX_GENERATION_ENTRIES}"
            ),
            Self::InvalidCleanupProtection(error) => {
                write!(formatter, "package cleanup protection is invalid: {error}")
            }
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
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use tar::Builder;

    use super::{
        ACTIVATION_SCHEMA_VERSION, ActivationMarker, CATALOG_FILE, GenerationError, INTENT_FILE,
        PackageGenerationConfig, PackageGenerationStore, PromotionOutcome, RecoveryOutcome,
        STAGED_INTENT_FILE, STAGED_TRANSFER_RECEIPT_FILE, prepare_staged_marker, publish_intent,
        read_marker,
    };
    use crate::installed_catalog::PackageHealthCheck;
    use crate::package_health::CandidateHealthChecker;
    use crate::package_intake::{PackageIntakeError, VerifiedPackageRelease};
    use crate::package_transfer::{
        PackageArchiveTransfer, PackageTransferCleanup, PackageTransferCleanupKind,
        PackageTransferError,
    };

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-INSTALLED-CATALOG-V1\0";
    const RELEASE_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-PACKAGE-RELEASE-V1\0";

    struct Fixture {
        root: PathBuf,
        content: PathBuf,
        runtime: PathBuf,
        data: PathBuf,
        public_key: PathBuf,
        signing_key: SigningKey,
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
            let signing_key = SigningKey::from_bytes(&[23_u8; 32]);
            let public_key = root.join("catalog-public-key.hex");
            fs::write(&public_key, hex(signing_key.verifying_key().as_bytes()))
                .expect("public key writes");
            Self {
                root,
                content,
                runtime,
                data,
                public_key,
                signing_key,
            }
        }

        fn store(&self) -> PackageGenerationStore {
            PackageGenerationStore::open(PackageGenerationConfig {
                store_root: self.root.clone(),
                public_key_path: self.public_key.clone(),
                content_root: Some(self.content.clone()),
                runtime_root: self.runtime.clone(),
                data_root: self.data.clone(),
            })
            .expect("package generation store opens")
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
            let signature = self.signing_key.sign(&message);
            fs::write(
                release.join("installed-catalog.sig"),
                hex(&signature.to_bytes()),
            )
            .expect("catalog signature writes");
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
            fs::write(signature, hex(&self.signing_key.sign(&message).to_bytes()))
                .expect("release descriptor signature writes");
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
    fn stages_then_explicitly_cleans_only_the_matching_durable_transfer_receipt() {
        let fixture = Fixture::new();
        let (descriptor, signature, archive, expanded_bytes, file_count) =
            fixture.package_tar(7, "1.0.0");
        let release = VerifiedPackageRelease::load(&descriptor, &signature, &fixture.public_key)
            .expect("release verifies");
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
        let release = VerifiedPackageRelease::load(&descriptor, &signature, &fixture.public_key)
            .expect("release verifies");
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
        let other_release =
            VerifiedPackageRelease::load(&other_descriptor, &other_signature, &fixture.public_key)
                .expect("other release verifies");
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

        assert_eq!(
            store
                .promote_without_health("install-seven")
                .expect("generation promotes"),
            PromotionOutcome {
                previous_generation: None,
                active_generation: 7,
            }
        );
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
        assert_eq!(
            store
                .promote_without_health("update-eight")
                .expect("update promotes"),
            PromotionOutcome {
                previous_generation: Some(7),
                active_generation: 8,
            }
        );
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
                assert!(
                    request
                        .plan
                        .storage()
                        .saves
                        .starts_with(fixture.runtime.join("package-health/health-seven"))
                );
                assert!(
                    !request.plan.storage().saves.starts_with(&fixture.data),
                    "candidate health must not use player save storage"
                );
                Ok(())
            })
            .expect("successful signed health gate promotes");

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
                let signature = fixture.signing_key.sign(&message);
                fs::write(
                    stage.join("installed-catalog.sig"),
                    hex(&signature.to_bytes()),
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

            assert_eq!(
                store.recover().expect("promotion recovers"),
                RecoveryOutcome::Activated { generation: 7 }
            );
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

        assert_eq!(
            store.recover().expect("completed activation recovers"),
            RecoveryOutcome::Activated { generation: 7 }
        );
        assert!(!fixture.root.join(INTENT_FILE).exists());
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
        let store = fixture.store();
        for (transaction, generation, version) in [
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ] {
            fixture.stage(transaction, generation, version);
            store
                .promote_without_health(transaction)
                .expect("generation promotes");
        }
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
        let store = fixture.store();
        for (transaction, generation, version) in [
            ("install-seven", 7, "1.0.0"),
            ("update-eight", 8, "1.1.0"),
            ("update-nine", 9, "1.2.0"),
        ] {
            fixture.stage(transaction, generation, version);
            store
                .promote_without_health(transaction)
                .expect("generation promotes");
        }

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
}
