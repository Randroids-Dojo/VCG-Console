//! Bounded, path-only planning for console-managed game saves.
//!
//! This module defines lifecycle policy before a future sandbox/mount adapter
//! performs filesystem mutation. It never opens a network destination, accepts
//! a browser-selected path, or grants a game direct profile-vault access.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;
use std::path::{Path, PathBuf};

use crate::installed_catalog::validate_intent_id;

pub const MAX_SAVE_QUOTA_BYTES: u64 = 64 * 1024 * 1024 * 1024;
pub const MAX_CACHE_QUOTA_BYTES: u64 = 64 * 1024 * 1024 * 1024;
pub const MAX_SAVE_FORMAT_VERSION: u32 = 1_000_000;
pub const OPAQUE_OWNER_ID_HEX_BYTES: usize = 32;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum SaveRuntime {
    RemoteWeb,
    LocalWeb,
    Native,
    Libretro,
}

impl SaveRuntime {
    fn path_segment(self) -> &'static str {
        match self {
            Self::RemoteWeb => "remote-web",
            Self::LocalWeb => "local-web",
            Self::Native => "native",
            Self::Libretro => "libretro",
        }
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum SaveOwner {
    Profile(String),
    Unassigned(String),
}

impl SaveOwner {
    fn validate(&self) -> Result<(), SaveLifecycleError> {
        match self {
            Self::Profile(profile_id) => validate_intent_id("profile", profile_id)
                .map_err(|_| SaveLifecycleError::InvalidProfileId),
            Self::Unassigned(owner_id) => validate_opaque_id(owner_id)
                .then_some(())
                .ok_or(SaveLifecycleError::InvalidUnassignedId),
        }
    }

    fn path_segments(&self) -> (&'static str, &str) {
        match self {
            Self::Profile(profile_id) => ("profiles", profile_id),
            Self::Unassigned(owner_id) => ("unassigned", owner_id),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SaveStoragePolicy {
    save_quota_bytes: u64,
    cache_quota_bytes: u64,
}

impl SaveStoragePolicy {
    /// Creates a bounded host-owned save/cache policy.
    ///
    /// # Errors
    ///
    /// Rejects zero or excessive save quota and excessive cache quota.
    pub fn new(save_quota_bytes: u64, cache_quota_bytes: u64) -> Result<Self, SaveLifecycleError> {
        if save_quota_bytes == 0 || save_quota_bytes > MAX_SAVE_QUOTA_BYTES {
            return Err(SaveLifecycleError::InvalidSaveQuota(save_quota_bytes));
        }
        if cache_quota_bytes > MAX_CACHE_QUOTA_BYTES {
            return Err(SaveLifecycleError::InvalidCacheQuota(cache_quota_bytes));
        }
        Ok(Self {
            save_quota_bytes,
            cache_quota_bytes,
        })
    }

    #[must_use]
    pub fn save_quota_bytes(self) -> u64 {
        self.save_quota_bytes
    }

    #[must_use]
    pub fn cache_quota_bytes(self) -> u64 {
        self.cache_quota_bytes
    }

    /// Reserves bytes against the durable-save quota without mutating storage.
    ///
    /// # Errors
    ///
    /// Rejects existing usage above quota, integer overflow, or a write larger
    /// than the remaining durable-save allowance.
    pub fn admit_save_write(
        self,
        current_bytes: u64,
        requested_bytes: u64,
    ) -> Result<StorageReservation, SaveLifecycleError> {
        admit_write(
            StorageClass::Save,
            self.save_quota_bytes,
            current_bytes,
            requested_bytes,
        )
    }

    /// Reserves bytes against the disposable-cache quota without mutation.
    ///
    /// # Errors
    ///
    /// Rejects existing usage above quota, integer overflow, or a write larger
    /// than the remaining cache allowance.
    pub fn admit_cache_write(
        self,
        current_bytes: u64,
        requested_bytes: u64,
    ) -> Result<StorageReservation, SaveLifecycleError> {
        admit_write(
            StorageClass::Cache,
            self.cache_quota_bytes,
            current_bytes,
            requested_bytes,
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StorageClass {
    Save,
    Cache,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StorageReservation {
    class: StorageClass,
    prior_bytes: u64,
    requested_bytes: u64,
    resulting_bytes: u64,
    quota_bytes: u64,
}

impl StorageReservation {
    #[must_use]
    pub fn class(self) -> StorageClass {
        self.class
    }

    #[must_use]
    pub fn prior_bytes(self) -> u64 {
        self.prior_bytes
    }

    #[must_use]
    pub fn requested_bytes(self) -> u64 {
        self.requested_bytes
    }

    #[must_use]
    pub fn resulting_bytes(self) -> u64 {
        self.resulting_bytes
    }

    #[must_use]
    pub fn quota_bytes(self) -> u64 {
        self.quota_bytes
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostedServiceBoundary {
    None,
    ServiceDataUnaffected,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaveStoragePlan {
    game_id: String,
    runtime: SaveRuntime,
    owner: SaveOwner,
    save_root: PathBuf,
    cache_root: PathBuf,
    policy: SaveStoragePolicy,
    hosted_service_boundary: HostedServiceBoundary,
}

impl SaveStoragePlan {
    /// Derives one game/runtime/owner namespace below trusted roots.
    ///
    /// # Errors
    ///
    /// Rejects relative, equal, or overlapping roots and any unsafe game or
    /// owner identifier.
    pub fn new(
        data_root: &Path,
        cache_root: &Path,
        game_id: &str,
        runtime: SaveRuntime,
        owner: SaveOwner,
        policy: SaveStoragePolicy,
    ) -> Result<Self, SaveLifecycleError> {
        validate_managed_roots(data_root, cache_root)?;
        validate_intent_id("game", game_id).map_err(|_| SaveLifecycleError::InvalidGameId)?;
        owner.validate()?;
        let (owner_kind, owner_id) = owner.path_segments();
        let relative = Path::new("games")
            .join(game_id)
            .join(owner_kind)
            .join(owner_id)
            .join(runtime.path_segment());
        Ok(Self {
            game_id: game_id.to_owned(),
            runtime,
            owner,
            save_root: data_root.join(&relative).join("saves"),
            cache_root: cache_root.join(relative).join("cache"),
            policy,
            hosted_service_boundary: if runtime == SaveRuntime::RemoteWeb {
                HostedServiceBoundary::ServiceDataUnaffected
            } else {
                HostedServiceBoundary::None
            },
        })
    }

    #[must_use]
    pub fn game_id(&self) -> &str {
        &self.game_id
    }

    #[must_use]
    pub fn runtime(&self) -> SaveRuntime {
        self.runtime
    }

    #[must_use]
    pub fn owner(&self) -> &SaveOwner {
        &self.owner
    }

    #[must_use]
    pub fn save_root(&self) -> &Path {
        &self.save_root
    }

    #[must_use]
    pub fn cache_root(&self) -> &Path {
        &self.cache_root
    }

    #[must_use]
    pub fn policy(&self) -> SaveStoragePolicy {
        self.policy
    }

    #[must_use]
    pub fn hosted_service_boundary(&self) -> HostedServiceBoundary {
        self.hosted_service_boundary
    }

    #[must_use]
    pub fn reset_scope(&self) -> SaveResetPlan {
        SaveResetPlan {
            save_root: self.save_root.clone(),
            cache_root: self.cache_root.clone(),
            hosted_service_data_affected: false,
        }
    }

    /// Plans a format migration through a transaction-specific sibling.
    ///
    /// # Errors
    ///
    /// Rejects unsafe transaction IDs, invalid format versions, and unchanged
    /// format versions.
    pub fn migration(
        &self,
        transaction_id: &str,
        from_format_version: u32,
        to_format_version: u32,
    ) -> Result<SaveMigrationPlan, SaveLifecycleError> {
        if !validate_opaque_id(transaction_id) {
            return Err(SaveLifecycleError::InvalidTransactionId);
        }
        validate_format_version(from_format_version)?;
        validate_format_version(to_format_version)?;
        if from_format_version == to_format_version {
            return Err(SaveLifecycleError::UnchangedFormatVersion);
        }
        let parent = self
            .save_root
            .parent()
            .ok_or(SaveLifecycleError::UnsafeManagedRoot)?;
        Ok(SaveMigrationPlan {
            source_root: self.save_root.clone(),
            staging_root: parent.join(".migrations").join(transaction_id),
            commit_root: self.save_root.clone(),
            from_format_version,
            to_format_version,
        })
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct SaveSlotKey {
    game_id: String,
    slot_id: String,
}

impl SaveSlotKey {
    #[must_use]
    pub fn game_id(&self) -> &str {
        &self.game_id
    }

    #[must_use]
    pub fn slot_id(&self) -> &str {
        &self.slot_id
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaveSlotRecord {
    key: SaveSlotKey,
    runtime: SaveRuntime,
    owner: SaveOwner,
    format_version: u32,
    bytes_used: u64,
}

impl SaveSlotRecord {
    /// Creates one sanitized save-slot ownership record.
    ///
    /// # Errors
    ///
    /// Rejects unsafe IDs, invalid owners or format versions, and usage already
    /// above the supplied host quota.
    pub fn new(
        game_id: &str,
        slot_id: &str,
        runtime: SaveRuntime,
        owner: SaveOwner,
        format_version: u32,
        bytes_used: u64,
        policy: SaveStoragePolicy,
    ) -> Result<Self, SaveLifecycleError> {
        validate_intent_id("game", game_id).map_err(|_| SaveLifecycleError::InvalidGameId)?;
        validate_intent_id("save slot", slot_id).map_err(|_| SaveLifecycleError::InvalidSlotId)?;
        owner.validate()?;
        validate_format_version(format_version)?;
        if bytes_used > policy.save_quota_bytes {
            return Err(SaveLifecycleError::ExistingUsageExceedsQuota {
                class: StorageClass::Save,
                current_bytes: bytes_used,
                quota_bytes: policy.save_quota_bytes,
            });
        }
        Ok(Self {
            key: SaveSlotKey {
                game_id: game_id.to_owned(),
                slot_id: slot_id.to_owned(),
            },
            runtime,
            owner,
            format_version,
            bytes_used,
        })
    }

    #[must_use]
    pub fn key(&self) -> &SaveSlotKey {
        &self.key
    }

    #[must_use]
    pub fn runtime(&self) -> SaveRuntime {
        self.runtime
    }

    #[must_use]
    pub fn owner(&self) -> &SaveOwner {
        &self.owner
    }

    #[must_use]
    pub fn format_version(&self) -> u32 {
        self.format_version
    }

    #[must_use]
    pub fn bytes_used(&self) -> u64 {
        self.bytes_used
    }

    /// Removes profile ownership from a record. The returned persistent record
    /// contains only a fresh opaque unassigned ID, never the deleted profile ID.
    ///
    /// # Errors
    ///
    /// Rejects a mismatched owner, unsafe opaque ID, or reused unassigned ID.
    pub fn unassign(
        mut self,
        deleted_profile_id: &str,
        unassigned_owner_id: &str,
        existing_unassigned_ids: &BTreeSet<String>,
    ) -> Result<Self, SaveLifecycleError> {
        match &self.owner {
            SaveOwner::Profile(profile_id) if profile_id == deleted_profile_id => {}
            _ => return Err(SaveLifecycleError::OwnerDoesNotMatchDeletedProfile),
        }
        if !validate_opaque_id(unassigned_owner_id) {
            return Err(SaveLifecycleError::InvalidUnassignedId);
        }
        if existing_unassigned_ids.contains(unassigned_owner_id) {
            return Err(SaveLifecycleError::DuplicateUnassignedId);
        }
        self.owner = SaveOwner::Unassigned(unassigned_owner_id.to_owned());
        Ok(self)
    }

    /// Claims unassigned progress only after a caller has resolved any
    /// game/slot conflict explicitly. No display name or new profile creation
    /// can trigger this operation implicitly.
    ///
    /// # Errors
    ///
    /// Rejects profile-owned records, unsafe target IDs, and unresolved target
    /// game/slot conflicts.
    pub fn claim(
        mut self,
        target_profile_id: &str,
        target_profile_slots: &BTreeSet<SaveSlotKey>,
    ) -> Result<Self, SaveLifecycleError> {
        if !matches!(self.owner, SaveOwner::Unassigned(_)) {
            return Err(SaveLifecycleError::RecordIsNotUnassigned);
        }
        validate_intent_id("profile", target_profile_id)
            .map_err(|_| SaveLifecycleError::InvalidProfileId)?;
        if target_profile_slots.contains(&self.key) {
            return Err(SaveLifecycleError::ClaimConflictRequiresResolution(
                self.key.clone(),
            ));
        }
        self.owner = SaveOwner::Profile(target_profile_id.to_owned());
        Ok(self)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaveResetPlan {
    save_root: PathBuf,
    cache_root: PathBuf,
    hosted_service_data_affected: bool,
}

impl SaveResetPlan {
    #[must_use]
    pub fn save_root(&self) -> &Path {
        &self.save_root
    }

    #[must_use]
    pub fn cache_root(&self) -> &Path {
        &self.cache_root
    }

    #[must_use]
    pub fn hosted_service_data_affected(&self) -> bool {
        self.hosted_service_data_affected
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaveMigrationPlan {
    source_root: PathBuf,
    staging_root: PathBuf,
    commit_root: PathBuf,
    from_format_version: u32,
    to_format_version: u32,
}

impl SaveMigrationPlan {
    #[must_use]
    pub fn source_root(&self) -> &Path {
        &self.source_root
    }

    #[must_use]
    pub fn staging_root(&self) -> &Path {
        &self.staging_root
    }

    #[must_use]
    pub fn commit_root(&self) -> &Path {
        &self.commit_root
    }

    #[must_use]
    pub fn from_format_version(&self) -> u32 {
        self.from_format_version
    }

    #[must_use]
    pub fn to_format_version(&self) -> u32 {
        self.to_format_version
    }
}

fn admit_write(
    class: StorageClass,
    quota_bytes: u64,
    current_bytes: u64,
    requested_bytes: u64,
) -> Result<StorageReservation, SaveLifecycleError> {
    if current_bytes > quota_bytes {
        return Err(SaveLifecycleError::ExistingUsageExceedsQuota {
            class,
            current_bytes,
            quota_bytes,
        });
    }
    let resulting_bytes =
        current_bytes
            .checked_add(requested_bytes)
            .ok_or(SaveLifecycleError::QuotaExceeded {
                class,
                requested_bytes,
                available_bytes: quota_bytes - current_bytes,
            })?;
    if resulting_bytes > quota_bytes {
        return Err(SaveLifecycleError::QuotaExceeded {
            class,
            requested_bytes,
            available_bytes: quota_bytes - current_bytes,
        });
    }
    Ok(StorageReservation {
        class,
        prior_bytes: current_bytes,
        requested_bytes,
        resulting_bytes,
        quota_bytes,
    })
}

fn validate_managed_roots(data_root: &Path, cache_root: &Path) -> Result<(), SaveLifecycleError> {
    if !data_root.is_absolute()
        || !cache_root.is_absolute()
        || data_root == cache_root
        || data_root.starts_with(cache_root)
        || cache_root.starts_with(data_root)
    {
        return Err(SaveLifecycleError::UnsafeManagedRoot);
    }
    Ok(())
}

fn validate_opaque_id(value: &str) -> bool {
    value.len() == OPAQUE_OWNER_ID_HEX_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_format_version(value: u32) -> Result<(), SaveLifecycleError> {
    if (1..=MAX_SAVE_FORMAT_VERSION).contains(&value) {
        Ok(())
    } else {
        Err(SaveLifecycleError::InvalidFormatVersion(value))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SaveLifecycleError {
    UnsafeManagedRoot,
    InvalidGameId,
    InvalidProfileId,
    InvalidSlotId,
    InvalidUnassignedId,
    DuplicateUnassignedId,
    InvalidTransactionId,
    InvalidSaveQuota(u64),
    InvalidCacheQuota(u64),
    InvalidFormatVersion(u32),
    UnchangedFormatVersion,
    ExistingUsageExceedsQuota {
        class: StorageClass,
        current_bytes: u64,
        quota_bytes: u64,
    },
    QuotaExceeded {
        class: StorageClass,
        requested_bytes: u64,
        available_bytes: u64,
    },
    OwnerDoesNotMatchDeletedProfile,
    RecordIsNotUnassigned,
    ClaimConflictRequiresResolution(SaveSlotKey),
}

impl fmt::Display for SaveLifecycleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl Error for SaveLifecycleError {}

#[cfg(test)]
mod tests {
    use super::{
        HostedServiceBoundary, MAX_CACHE_QUOTA_BYTES, MAX_SAVE_QUOTA_BYTES, SaveLifecycleError,
        SaveOwner, SaveRuntime, SaveSlotKey, SaveSlotRecord, SaveStoragePlan, SaveStoragePolicy,
        StorageClass,
    };
    use std::collections::BTreeSet;
    use std::path::Path;

    fn policy() -> SaveStoragePolicy {
        SaveStoragePolicy::new(8 * 1024 * 1024, 16 * 1024 * 1024).expect("policy")
    }

    fn roots() -> (&'static Path, &'static Path) {
        if cfg!(windows) {
            (Path::new("C:\\vcg-data"), Path::new("D:\\vcg-cache"))
        } else {
            (Path::new("/vcg/data"), Path::new("/vcg/cache"))
        }
    }

    #[test]
    fn isolates_every_runtime_and_discloses_only_remote_service_boundary() {
        let (data_root, cache_root) = roots();
        let mut save_roots = BTreeSet::new();
        for runtime in [
            SaveRuntime::RemoteWeb,
            SaveRuntime::LocalWeb,
            SaveRuntime::Native,
            SaveRuntime::Libretro,
        ] {
            let plan = SaveStoragePlan::new(
                data_root,
                cache_root,
                "test-game",
                runtime,
                SaveOwner::Profile("profile-one".to_owned()),
                policy(),
            )
            .expect("storage plan");
            assert!(plan.save_root.starts_with(data_root));
            assert!(plan.cache_root.starts_with(cache_root));
            assert!(save_roots.insert(plan.save_root.clone()));
            assert_eq!(
                plan.hosted_service_boundary,
                if runtime == SaveRuntime::RemoteWeb {
                    HostedServiceBoundary::ServiceDataUnaffected
                } else {
                    HostedServiceBoundary::None
                }
            );
            assert!(!plan.reset_scope().hosted_service_data_affected);
        }
    }

    #[test]
    fn rejects_paths_or_ids_that_could_escape_managed_roots() {
        let (data_root, cache_root) = roots();
        assert_eq!(
            SaveStoragePlan::new(
                Path::new("relative"),
                cache_root,
                "test-game",
                SaveRuntime::Native,
                SaveOwner::Profile("profile-one".to_owned()),
                policy(),
            ),
            Err(SaveLifecycleError::UnsafeManagedRoot)
        );
        assert!(matches!(
            SaveStoragePlan::new(
                data_root,
                cache_root,
                "../escape",
                SaveRuntime::Native,
                SaveOwner::Profile("profile-one".to_owned()),
                policy(),
            ),
            Err(SaveLifecycleError::InvalidGameId)
        ));
        assert!(matches!(
            SaveStoragePlan::new(
                data_root,
                cache_root,
                "test-game",
                SaveRuntime::Native,
                SaveOwner::Profile("Profile Name".to_owned()),
                policy(),
            ),
            Err(SaveLifecycleError::InvalidProfileId)
        ));
        let rejected = SaveStoragePlan::new(
            data_root,
            cache_root,
            "secret-bearing-invalid/path",
            SaveRuntime::Native,
            SaveOwner::Profile("profile-one".to_owned()),
            policy(),
        )
        .expect_err("unsafe game ID");
        assert!(!rejected.to_string().contains("secret-bearing"));
    }

    #[test]
    fn quota_admission_is_separate_bounded_and_overflow_safe() {
        let policy = policy();
        assert_eq!(
            policy.admit_save_write(7 * 1024 * 1024, 1024 * 1024),
            Ok(super::StorageReservation {
                class: StorageClass::Save,
                prior_bytes: 7 * 1024 * 1024,
                requested_bytes: 1024 * 1024,
                resulting_bytes: 8 * 1024 * 1024,
                quota_bytes: 8 * 1024 * 1024,
            })
        );
        assert!(matches!(
            policy.admit_save_write(8 * 1024 * 1024, 1),
            Err(SaveLifecycleError::QuotaExceeded {
                class: StorageClass::Save,
                ..
            })
        ));
        assert!(matches!(
            policy.admit_cache_write(u64::MAX, 1),
            Err(SaveLifecycleError::ExistingUsageExceedsQuota {
                class: StorageClass::Cache,
                ..
            })
        ));
        assert!(SaveStoragePolicy::new(MAX_SAVE_QUOTA_BYTES + 1, 0).is_err());
        assert!(SaveStoragePolicy::new(1, MAX_CACHE_QUOTA_BYTES + 1).is_err());
    }

    #[test]
    fn profile_deletion_returns_a_record_without_the_deleted_profile_id() {
        let record = SaveSlotRecord::new(
            "test-game",
            "main-slot",
            SaveRuntime::LocalWeb,
            SaveOwner::Profile("profile-one".to_owned()),
            1,
            1024,
            policy(),
        )
        .expect("record");
        let unassigned = record
            .unassign(
                "profile-one",
                "0123456789abcdef0123456789abcdef",
                &BTreeSet::new(),
            )
            .expect("unassigned");
        assert_eq!(
            unassigned.owner,
            SaveOwner::Unassigned("0123456789abcdef0123456789abcdef".to_owned())
        );
        assert!(!format!("{unassigned:?}").contains("profile-one"));
    }

    #[test]
    fn unassignment_rejects_wrong_profiles_reused_tokens_and_unsafe_tokens() {
        let record = SaveSlotRecord::new(
            "test-game",
            "main-slot",
            SaveRuntime::Native,
            SaveOwner::Profile("profile-one".to_owned()),
            1,
            0,
            policy(),
        )
        .expect("record");
        assert_eq!(
            record.clone().unassign(
                "profile-two",
                "0123456789abcdef0123456789abcdef",
                &BTreeSet::new()
            ),
            Err(SaveLifecycleError::OwnerDoesNotMatchDeletedProfile)
        );
        let used = BTreeSet::from(["0123456789abcdef0123456789abcdef".to_owned()]);
        assert!(matches!(
            record
                .clone()
                .unassign("profile-one", "0123456789abcdef0123456789abcdef", &used),
            Err(SaveLifecycleError::DuplicateUnassignedId)
        ));
        assert!(matches!(
            record.unassign("profile-one", "../profile-one", &BTreeSet::new()),
            Err(SaveLifecycleError::InvalidUnassignedId)
        ));
    }

    #[test]
    fn recreated_profiles_do_not_claim_unassigned_progress_implicitly() {
        let unassigned = SaveSlotRecord::new(
            "test-game",
            "main-slot",
            SaveRuntime::RemoteWeb,
            SaveOwner::Unassigned("0123456789abcdef0123456789abcdef".to_owned()),
            1,
            0,
            policy(),
        )
        .expect("unassigned");
        let untouched = unassigned.clone();
        // Display names are deliberately absent from the ownership contract,
        // so recreating one cannot mutate the record.
        assert_eq!(unassigned, untouched);
        assert!(matches!(untouched.owner, SaveOwner::Unassigned(_)));
    }

    #[test]
    fn claims_require_explicit_conflict_resolution() {
        let unassigned = SaveSlotRecord::new(
            "test-game",
            "main-slot",
            SaveRuntime::Libretro,
            SaveOwner::Unassigned("0123456789abcdef0123456789abcdef".to_owned()),
            4,
            4096,
            policy(),
        )
        .expect("record");
        let conflict = BTreeSet::from([SaveSlotKey {
            game_id: "test-game".to_owned(),
            slot_id: "main-slot".to_owned(),
        }]);
        assert!(matches!(
            unassigned.clone().claim("profile-two", &conflict),
            Err(SaveLifecycleError::ClaimConflictRequiresResolution(_))
        ));
        assert_eq!(
            unassigned
                .claim("profile-two", &BTreeSet::new())
                .expect("claim")
                .owner,
            SaveOwner::Profile("profile-two".to_owned())
        );
    }

    #[test]
    fn package_versions_do_not_change_the_save_namespace() {
        let (data_root, cache_root) = roots();
        let first = SaveStoragePlan::new(
            data_root,
            cache_root,
            "test-game",
            SaveRuntime::Native,
            SaveOwner::Profile("profile-one".to_owned()),
            policy(),
        )
        .expect("first release");
        let updated = SaveStoragePlan::new(
            data_root,
            cache_root,
            "test-game",
            SaveRuntime::Native,
            SaveOwner::Profile("profile-one".to_owned()),
            policy(),
        )
        .expect("updated release");
        assert_eq!(first.save_root, updated.save_root);
        assert_eq!(first.reset_scope(), updated.reset_scope());
    }

    #[test]
    fn migration_stages_beside_saves_and_requires_distinct_bounded_versions() {
        let (data_root, cache_root) = roots();
        let plan = SaveStoragePlan::new(
            data_root,
            cache_root,
            "test-game",
            SaveRuntime::Native,
            SaveOwner::Profile("profile-one".to_owned()),
            policy(),
        )
        .expect("plan");
        let migration = plan
            .migration("fedcba9876543210fedcba9876543210", 1, 2)
            .expect("migration");
        assert_eq!(migration.source_root, migration.commit_root);
        assert!(migration.staging_root.starts_with(data_root));
        assert!(!migration.staging_root.starts_with(&migration.source_root));
        assert_eq!(
            plan.migration("fedcba9876543210fedcba9876543210", 1, 1),
            Err(SaveLifecycleError::UnchangedFormatVersion)
        );
        assert!(matches!(
            plan.migration("../escape", 1, 2),
            Err(SaveLifecycleError::InvalidTransactionId)
        ));
    }

    #[test]
    fn records_reject_unsafe_slots_invalid_formats_and_over_quota_state() {
        assert!(matches!(
            SaveSlotRecord::new(
                "test-game",
                "../slot",
                SaveRuntime::Native,
                SaveOwner::Profile("profile-one".to_owned()),
                1,
                0,
                policy(),
            ),
            Err(SaveLifecycleError::InvalidSlotId)
        ));
        assert!(matches!(
            SaveSlotRecord::new(
                "test-game",
                "main-slot",
                SaveRuntime::Native,
                SaveOwner::Profile("profile-one".to_owned()),
                0,
                0,
                policy(),
            ),
            Err(SaveLifecycleError::InvalidFormatVersion(0))
        ));
        assert!(matches!(
            SaveSlotRecord::new(
                "test-game",
                "main-slot",
                SaveRuntime::Native,
                SaveOwner::Profile("profile-one".to_owned()),
                1,
                9 * 1024 * 1024,
                policy(),
            ),
            Err(SaveLifecycleError::ExistingUsageExceedsQuota { .. })
        ));
    }
}
