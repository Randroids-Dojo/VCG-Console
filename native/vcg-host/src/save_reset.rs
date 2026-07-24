//! Crash-recoverable execution for an explicitly confirmed save reset.
//!
//! This module consumes the exact scope produced by [`SaveStoragePlan`]. It
//! does not choose when to reset, expose a browser endpoint, delete hosted
//! service data, or implement package uninstall policy.

use std::error::Error;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};

use crate::installed_catalog::validate_intent_id;
use crate::save_lifecycle::{SaveOwner, SaveRuntime, SaveStoragePlan};

pub const SAVE_RESET_LOCK_FILE: &str = "save-reset.lock";
const SAVE_RESET_INTENT_FILE: &str = "save-reset.intent.json";
const SAVE_RESET_INTENT_TEMP_FILE: &str = ".save-reset.intent.tmp";
const SAVE_RESET_SCHEMA_VERSION: u32 = 1;
const MAX_SAVE_RESET_INTENT_BYTES: u64 = 4 * 1024;

#[derive(Clone, Debug)]
pub struct SaveResetConfig {
    pub transaction_root: PathBuf,
    pub data_root: PathBuf,
    pub cache_root: PathBuf,
}

/// Trusted executor for one globally serialized save reset.
#[derive(Clone, Debug)]
pub struct SaveResetExecutor {
    transaction_root: PathBuf,
    operation_lock: PathBuf,
    data_root: PathBuf,
    canonical_data_root: PathBuf,
    cache_root: PathBuf,
    canonical_cache_root: PathBuf,
}

impl SaveResetExecutor {
    /// Opens preprovisioned, mutually disjoint transaction/data/cache roots.
    ///
    /// # Errors
    ///
    /// Rejects relative, missing, non-directory, symlinked, overlapping roots
    /// or a missing/non-regular operation lock.
    pub fn open(config: SaveResetConfig) -> Result<Self, SaveResetError> {
        let transaction_root =
            canonical_directory("save reset transaction root", &config.transaction_root)?;
        let canonical_data_root = canonical_directory("save data root", &config.data_root)?;
        let canonical_cache_root = canonical_directory("save cache root", &config.cache_root)?;
        ensure_disjoint_roots(
            &transaction_root,
            &canonical_data_root,
            &canonical_cache_root,
        )?;
        let operation_lock = canonical_direct_file(
            "save reset operation lock",
            &transaction_root,
            &transaction_root.join(SAVE_RESET_LOCK_FILE),
        )?;
        Ok(Self {
            transaction_root,
            operation_lock,
            data_root: config.data_root,
            canonical_data_root,
            cache_root: config.cache_root,
            canonical_cache_root,
        })
    }

    /// Deletes exactly one confirmed console-managed save and cache scope.
    ///
    /// A durable, path-free intent is published before either target is
    /// removed. Any existing intent or unpublished temporary record requires
    /// recovery before a new reset can start.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, an untrusted/mismatched plan, pending recovery,
    /// unsafe target paths, malformed state, or I/O failure.
    pub fn reset(&self, plan: &SaveStoragePlan) -> Result<SaveResetOutcome, SaveResetError> {
        let _operation = self.acquire_operation_lock()?;
        if self.state_present()? {
            return Err(SaveResetError::RecoveryRequired);
        }
        let intent = self.intent_from_plan(plan)?;
        self.publish_intent(&intent)?;
        let durable = self
            .read_intent_if_present()?
            .ok_or(SaveResetError::IntentDisappeared)?;
        if durable != intent {
            return Err(SaveResetError::IntentChanged);
        }
        self.apply_intent(&durable)
    }

    /// Recovers an interrupted reset or discards an unpublished temporary.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, malformed/unsafe state, changed targets, or
    /// I/O failure. An authoritative intent remains present until both target
    /// removals and directory synchronization complete.
    pub fn recover(&self) -> Result<SaveResetRecovery, SaveResetError> {
        let _operation = self.acquire_operation_lock()?;
        let Some(intent) = self.read_intent_if_present()? else {
            if self.remove_unpublished_temp_if_present()? {
                return Ok(SaveResetRecovery::DiscardedUnpublished);
            }
            return Ok(SaveResetRecovery::Clean);
        };
        let outcome = self.apply_intent(&intent)?;
        Ok(SaveResetRecovery::Completed(outcome))
    }

    /// Reports whether authoritative or unpublished reset state is present.
    ///
    /// # Errors
    ///
    /// Rejects lock contention or unsafe filesystem entries.
    pub fn recovery_required(&self) -> Result<bool, SaveResetError> {
        let _operation = self.acquire_operation_lock()?;
        self.state_present()
    }

    fn intent_from_plan(&self, plan: &SaveStoragePlan) -> Result<SaveResetIntent, SaveResetError> {
        let (owner_kind, owner_id) = owner_identity(plan.owner())?;
        let intent = SaveResetIntent {
            schema_version: SAVE_RESET_SCHEMA_VERSION,
            game_id: plan.game_id().to_owned(),
            owner_kind,
            owner_id,
            runtime: ResetRuntime::from(plan.runtime()),
        };
        self.validate_intent(&intent)?;
        let targets = self.targets(&intent);
        if plan.save_root() != targets.save || plan.cache_root() != targets.cache {
            return Err(SaveResetError::PlanOutsideConfiguredRoots);
        }
        Ok(intent)
    }

    fn publish_intent(&self, intent: &SaveResetIntent) -> Result<(), SaveResetError> {
        let temporary = self.transaction_root.join(SAVE_RESET_INTENT_TEMP_FILE);
        let path = self.transaction_root.join(SAVE_RESET_INTENT_FILE);
        let bytes = serde_json::to_vec(intent)
            .map_err(|error| SaveResetError::InvalidIntent(error.to_string()))?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_SAVE_RESET_INTENT_BYTES {
            return Err(SaveResetError::InvalidIntent(
                "save reset intent exceeds size limit".to_owned(),
            ));
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|source| {
                if source.kind() == io::ErrorKind::AlreadyExists {
                    SaveResetError::RecoveryRequired
                } else {
                    SaveResetError::Io {
                        operation: "create temporary save reset intent",
                        path: temporary.clone(),
                        source,
                    }
                }
            })?;
        file.write_all(&bytes)
            .and_then(|()| file.sync_all())
            .map_err(|source| SaveResetError::Io {
                operation: "persist temporary save reset intent",
                path: temporary.clone(),
                source,
            })?;
        drop(file);
        fs::hard_link(&temporary, &path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                SaveResetError::RecoveryRequired
            } else {
                SaveResetError::Io {
                    operation: "publish save reset intent",
                    path: path.clone(),
                    source,
                }
            }
        })?;
        sync_directory(&self.transaction_root)?;
        fs::remove_file(&temporary).map_err(|source| SaveResetError::Io {
            operation: "remove published temporary save reset intent",
            path: temporary,
            source,
        })?;
        sync_directory(&self.transaction_root)
    }

    fn apply_intent(&self, intent: &SaveResetIntent) -> Result<SaveResetOutcome, SaveResetError> {
        self.validate_intent(intent)?;
        self.remove_unpublished_temp_if_present()?;
        let targets = self.targets(intent);
        let save_was_present = Self::remove_target_if_present(
            &targets.save,
            &self.data_root,
            &self.canonical_data_root,
        )?;
        let cache_was_present = Self::remove_target_if_present(
            &targets.cache,
            &self.cache_root,
            &self.canonical_cache_root,
        )?;
        let intent_path = self.transaction_root.join(SAVE_RESET_INTENT_FILE);
        require_regular_file(&intent_path, "save reset intent")?;
        fs::remove_file(&intent_path).map_err(|source| SaveResetError::Io {
            operation: "remove completed save reset intent",
            path: intent_path,
            source,
        })?;
        sync_directory(&self.transaction_root)?;
        Ok(SaveResetOutcome {
            game_id: intent.game_id.clone(),
            save_was_present,
            cache_was_present,
            hosted_service_data_affected: false,
        })
    }

    fn remove_target_if_present(
        target: &Path,
        configured_root: &Path,
        canonical_root: &Path,
    ) -> Result<bool, SaveResetError> {
        if !path_exists(target)? {
            return Ok(false);
        }
        let metadata = fs::symlink_metadata(target).map_err(|source| SaveResetError::Io {
            operation: "inspect save reset target",
            path: target.to_owned(),
            source,
        })?;
        if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
            return Err(SaveResetError::UnsafeTarget(target.to_owned()));
        }
        let canonical = fs::canonicalize(target).map_err(|source| SaveResetError::Io {
            operation: "canonicalize save reset target",
            path: target.to_owned(),
            source,
        })?;
        let relative = target
            .strip_prefix(configured_root)
            .map_err(|_| SaveResetError::UnsafeTarget(target.to_owned()))?;
        let expected_canonical = canonical_root.join(relative);
        if canonical != expected_canonical || !canonical.starts_with(canonical_root) {
            return Err(SaveResetError::UnsafeTarget(target.to_owned()));
        }
        fs::remove_dir_all(&canonical).map_err(|source| SaveResetError::Io {
            operation: "remove save reset target",
            path: canonical.clone(),
            source,
        })?;
        let parent = canonical
            .parent()
            .ok_or_else(|| SaveResetError::UnsafeTarget(canonical.clone()))?;
        sync_directory(parent)?;
        Ok(true)
    }

    fn read_intent_if_present(&self) -> Result<Option<SaveResetIntent>, SaveResetError> {
        let path = self.transaction_root.join(SAVE_RESET_INTENT_FILE);
        if !path_exists(&path)? {
            return Ok(None);
        }
        require_regular_file(&path, "save reset intent")?;
        let file = File::open(&path).map_err(|source| SaveResetError::Io {
            operation: "open save reset intent",
            path: path.clone(),
            source,
        })?;
        let mut bytes = Vec::new();
        file.take(MAX_SAVE_RESET_INTENT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|source| SaveResetError::Io {
                operation: "read save reset intent",
                path: path.clone(),
                source,
            })?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_SAVE_RESET_INTENT_BYTES {
            return Err(SaveResetError::InvalidIntent(
                "save reset intent exceeds size limit".to_owned(),
            ));
        }
        let intent: SaveResetIntent = serde_json::from_slice(&bytes)
            .map_err(|error| SaveResetError::InvalidIntent(error.to_string()))?;
        self.validate_intent(&intent)?;
        Ok(Some(intent))
    }

    fn validate_intent(&self, intent: &SaveResetIntent) -> Result<(), SaveResetError> {
        if intent.schema_version != SAVE_RESET_SCHEMA_VERSION {
            return Err(SaveResetError::InvalidIntent(format!(
                "unsupported save reset schema {}",
                intent.schema_version
            )));
        }
        validate_intent_id("game", &intent.game_id)
            .map_err(|_| SaveResetError::InvalidIntent("invalid game ID".to_owned()))?;
        match intent.owner_kind {
            ResetOwnerKind::Profile => validate_intent_id("profile", &intent.owner_id)
                .map_err(|_| SaveResetError::InvalidIntent("invalid profile ID".to_owned()))?,
            ResetOwnerKind::Unassigned if !valid_opaque_id(&intent.owner_id) => {
                return Err(SaveResetError::InvalidIntent(
                    "invalid unassigned owner ID".to_owned(),
                ));
            }
            ResetOwnerKind::Unassigned => {}
        }
        let targets = self.targets(intent);
        validate_lexical_target(&targets.save, &self.data_root)?;
        validate_lexical_target(&targets.cache, &self.cache_root)
    }

    fn targets(&self, intent: &SaveResetIntent) -> SaveResetTargets {
        let owner_kind = match intent.owner_kind {
            ResetOwnerKind::Profile => "profiles",
            ResetOwnerKind::Unassigned => "unassigned",
        };
        let relative = Path::new("games")
            .join(&intent.game_id)
            .join(owner_kind)
            .join(&intent.owner_id)
            .join(intent.runtime.path_segment());
        SaveResetTargets {
            save: self.data_root.join(&relative).join("saves"),
            cache: self.cache_root.join(relative).join("cache"),
        }
    }

    fn state_present(&self) -> Result<bool, SaveResetError> {
        let mut present = false;
        for (path, kind) in [
            (
                self.transaction_root.join(SAVE_RESET_INTENT_FILE),
                "save reset intent",
            ),
            (
                self.transaction_root.join(SAVE_RESET_INTENT_TEMP_FILE),
                "temporary save reset intent",
            ),
        ] {
            if path_exists(&path)? {
                require_regular_file(&path, kind)?;
                present = true;
            }
        }
        Ok(present)
    }

    fn remove_unpublished_temp_if_present(&self) -> Result<bool, SaveResetError> {
        let path = self.transaction_root.join(SAVE_RESET_INTENT_TEMP_FILE);
        if !path_exists(&path)? {
            return Ok(false);
        }
        require_regular_file(&path, "temporary save reset intent")?;
        fs::remove_file(&path).map_err(|source| SaveResetError::Io {
            operation: "remove unpublished temporary save reset intent",
            path,
            source,
        })?;
        sync_directory(&self.transaction_root)?;
        Ok(true)
    }

    fn acquire_operation_lock(&self) -> Result<SaveResetOperationLock, SaveResetError> {
        let path = canonical_direct_file(
            "save reset operation lock",
            &self.transaction_root,
            &self.operation_lock,
        )?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|source| SaveResetError::Io {
                operation: "open save reset operation lock",
                path: path.clone(),
                source,
            })?;
        match fs4::FileExt::try_lock(&file) {
            Ok(()) => Ok(SaveResetOperationLock { file }),
            Err(TryLockError::WouldBlock) => Err(SaveResetError::Busy),
            Err(TryLockError::Error(source)) => Err(SaveResetError::Io {
                operation: "lock save reset operation",
                path,
                source,
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaveResetOutcome {
    game_id: String,
    save_was_present: bool,
    cache_was_present: bool,
    hosted_service_data_affected: bool,
}

impl SaveResetOutcome {
    #[must_use]
    pub fn game_id(&self) -> &str {
        &self.game_id
    }

    #[must_use]
    pub fn save_was_present(&self) -> bool {
        self.save_was_present
    }

    #[must_use]
    pub fn cache_was_present(&self) -> bool {
        self.cache_was_present
    }

    #[must_use]
    pub fn hosted_service_data_affected(&self) -> bool {
        self.hosted_service_data_affected
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SaveResetRecovery {
    Clean,
    DiscardedUnpublished,
    Completed(SaveResetOutcome),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveResetIntent {
    schema_version: u32,
    game_id: String,
    owner_kind: ResetOwnerKind,
    owner_id: String,
    runtime: ResetRuntime,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ResetOwnerKind {
    Profile,
    Unassigned,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ResetRuntime {
    RemoteWeb,
    LocalWeb,
    Native,
    Libretro,
}

impl ResetRuntime {
    const fn path_segment(self) -> &'static str {
        match self {
            Self::RemoteWeb => "remote-web",
            Self::LocalWeb => "local-web",
            Self::Native => "native",
            Self::Libretro => "libretro",
        }
    }
}

impl From<SaveRuntime> for ResetRuntime {
    fn from(value: SaveRuntime) -> Self {
        match value {
            SaveRuntime::RemoteWeb => Self::RemoteWeb,
            SaveRuntime::LocalWeb => Self::LocalWeb,
            SaveRuntime::Native => Self::Native,
            SaveRuntime::Libretro => Self::Libretro,
        }
    }
}

struct SaveResetTargets {
    save: PathBuf,
    cache: PathBuf,
}

struct SaveResetOperationLock {
    file: File,
}

impl Drop for SaveResetOperationLock {
    fn drop(&mut self) {
        let _ = fs4::FileExt::unlock(&self.file);
    }
}

fn owner_identity(owner: &SaveOwner) -> Result<(ResetOwnerKind, String), SaveResetError> {
    match owner {
        SaveOwner::Profile(profile_id) => {
            validate_intent_id("profile", profile_id)
                .map_err(|_| SaveResetError::PlanOutsideConfiguredRoots)?;
            Ok((ResetOwnerKind::Profile, profile_id.clone()))
        }
        SaveOwner::Unassigned(owner_id) if valid_opaque_id(owner_id) => {
            Ok((ResetOwnerKind::Unassigned, owner_id.clone()))
        }
        SaveOwner::Unassigned(_) => Err(SaveResetError::PlanOutsideConfiguredRoots),
    }
}

fn valid_opaque_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_lexical_target(target: &Path, root: &Path) -> Result<(), SaveResetError> {
    if target == root || !target.starts_with(root) {
        return Err(SaveResetError::UnsafeTarget(target.to_owned()));
    }
    Ok(())
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, SaveResetError> {
    if !path.is_absolute() {
        return Err(SaveResetError::InvalidRoot(kind));
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| SaveResetError::Io {
        operation: "inspect configured save reset directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err(SaveResetError::InvalidRoot(kind));
    }
    fs::canonicalize(path).map_err(|source| SaveResetError::Io {
        operation: "canonicalize configured save reset directory",
        path: path.to_owned(),
        source,
    })
}

fn canonical_direct_file(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, SaveResetError> {
    require_regular_file(path, kind)?;
    let canonical = fs::canonicalize(path).map_err(|source| SaveResetError::Io {
        operation: "canonicalize configured save reset file",
        path: path.to_owned(),
        source,
    })?;
    if canonical.parent() != Some(parent) {
        return Err(SaveResetError::InvalidRoot(kind));
    }
    Ok(canonical)
}

fn ensure_disjoint_roots(
    transaction_root: &Path,
    data_root: &Path,
    cache_root: &Path,
) -> Result<(), SaveResetError> {
    for (left, right) in [
        (transaction_root, data_root),
        (transaction_root, cache_root),
        (data_root, cache_root),
    ] {
        if left.starts_with(right) || right.starts_with(left) {
            return Err(SaveResetError::OverlappingRoots);
        }
    }
    Ok(())
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), SaveResetError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| SaveResetError::Io {
        operation: "inspect save reset file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(SaveResetError::UnsafeFile {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool, SaveResetError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(SaveResetError::Io {
            operation: "inspect save reset path",
            path: path.to_owned(),
            source,
        }),
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), SaveResetError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| SaveResetError::Io {
            operation: "synchronize save reset directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
// Rust exposes no portable directory-fsync operation. Linux uses the
// implementation above; non-Unix builds exercise logical recovery ordering.
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), SaveResetError> {
    Ok(())
}

#[derive(Debug)]
pub enum SaveResetError {
    InvalidRoot(&'static str),
    OverlappingRoots,
    PlanOutsideConfiguredRoots,
    RecoveryRequired,
    Busy,
    IntentDisappeared,
    IntentChanged,
    InvalidIntent(String),
    UnsafeTarget(PathBuf),
    UnsafeFile {
        kind: &'static str,
        path: PathBuf,
    },
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for SaveResetError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRoot(kind) => write!(formatter, "{kind} is not a safe absolute directory"),
            Self::OverlappingRoots => {
                formatter.write_str("save reset transaction, data, and cache roots overlap")
            }
            Self::PlanOutsideConfiguredRoots => {
                formatter.write_str("save reset plan is outside the configured roots")
            }
            Self::RecoveryRequired => {
                formatter.write_str("save reset recovery is required before another reset")
            }
            Self::Busy => formatter.write_str("another save reset operation is in progress"),
            Self::IntentDisappeared => {
                formatter.write_str("published save reset intent disappeared")
            }
            Self::IntentChanged => formatter.write_str("published save reset intent changed"),
            Self::InvalidIntent(detail) => write!(formatter, "invalid save reset intent: {detail}"),
            Self::UnsafeTarget(path) => {
                write!(formatter, "unsafe save reset target: {}", path.display())
            }
            Self::UnsafeFile { kind, path } => {
                write!(
                    formatter,
                    "{kind} is not a regular file: {}",
                    path.display()
                )
            }
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} at {}: {source}", path.display()),
        }
    }
}

impl Error for SaveResetError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;
    use crate::save_lifecycle::{SaveSlotKey, SaveStoragePolicy};

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        root: PathBuf,
        transaction: PathBuf,
        data: PathBuf,
        cache: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-save-reset-test-{}-{sequence}",
                std::process::id()
            ));
            let transaction = root.join("transactions");
            let data = root.join("data");
            let cache = root.join("cache");
            for directory in [&transaction, &data, &cache] {
                fs::create_dir_all(directory).expect("fixture directory creates");
            }
            File::create(transaction.join(SAVE_RESET_LOCK_FILE)).expect("operation lock creates");
            Self {
                root,
                transaction,
                data,
                cache,
            }
        }

        fn executor(&self) -> SaveResetExecutor {
            SaveResetExecutor::open(SaveResetConfig {
                transaction_root: self.transaction.clone(),
                data_root: self.data.clone(),
                cache_root: self.cache.clone(),
            })
            .expect("executor opens")
        }

        fn plan(&self, game_id: &str, owner: SaveOwner) -> SaveStoragePlan {
            SaveStoragePlan::new(
                &self.data,
                &self.cache,
                game_id,
                SaveRuntime::Native,
                owner,
                SaveStoragePolicy::new(1024, 1024).expect("policy creates"),
            )
            .expect("plan creates")
        }

        fn populate(plan: &SaveStoragePlan) {
            fs::create_dir_all(plan.save_root()).expect("save root creates");
            fs::create_dir_all(plan.cache_root()).expect("cache root creates");
            fs::write(plan.save_root().join("progress.bin"), b"progress").expect("save writes");
            fs::write(plan.cache_root().join("compiled.bin"), b"cache").expect("cache writes");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn reset_removes_only_the_exact_confirmed_scope() {
        let fixture = Fixture::new();
        let target = fixture.plan("native-game", SaveOwner::Profile("player-one".to_owned()));
        let other_owner = fixture.plan("native-game", SaveOwner::Profile("player-two".to_owned()));
        let other_game = fixture.plan("other-game", SaveOwner::Profile("player-one".to_owned()));
        for plan in [&target, &other_owner, &other_game] {
            Fixture::populate(plan);
        }
        let unrelated = fixture.root.join("packages/native-game");
        fs::create_dir_all(&unrelated).expect("unrelated package creates");
        fs::write(unrelated.join("artifact"), b"package").expect("unrelated package writes");

        let outcome = fixture
            .executor()
            .reset(&target)
            .expect("explicit reset completes");

        assert_eq!(outcome.game_id(), "native-game");
        assert!(outcome.save_was_present());
        assert!(outcome.cache_was_present());
        assert!(!outcome.hosted_service_data_affected());
        assert!(!target.save_root().exists());
        assert!(!target.cache_root().exists());
        assert!(other_owner.save_root().is_dir());
        assert!(other_owner.cache_root().is_dir());
        assert!(other_game.save_root().is_dir());
        assert!(other_game.cache_root().is_dir());
        assert_eq!(
            fs::read(unrelated.join("artifact")).expect("unrelated package reads"),
            b"package"
        );
        assert_eq!(
            fixture
                .executor()
                .recover()
                .expect("completed reset is clean"),
            SaveResetRecovery::Clean
        );
    }

    #[test]
    fn recovery_finishes_after_one_target_was_already_removed() {
        let fixture = Fixture::new();
        let plan = fixture.plan(
            "native-game",
            SaveOwner::Unassigned("0123456789abcdef0123456789abcdef".to_owned()),
        );
        Fixture::populate(&plan);
        let executor = fixture.executor();
        let intent = executor.intent_from_plan(&plan).expect("intent derives");
        executor.publish_intent(&intent).expect("intent publishes");
        fs::remove_dir_all(plan.save_root()).expect("interruption removes save first");

        let SaveResetRecovery::Completed(outcome) =
            executor.recover().expect("interrupted reset recovers")
        else {
            panic!("authoritative intent must complete");
        };
        assert!(!outcome.save_was_present());
        assert!(outcome.cache_was_present());
        assert!(!plan.cache_root().exists());
        assert_eq!(
            executor.recover().expect("second recovery is clean"),
            SaveResetRecovery::Clean
        );
    }

    #[test]
    fn unpublished_temporary_is_discarded_without_deleting_data() {
        let fixture = Fixture::new();
        let plan = fixture.plan("native-game", SaveOwner::Profile("player-one".to_owned()));
        Fixture::populate(&plan);
        fs::write(
            fixture.transaction.join(SAVE_RESET_INTENT_TEMP_FILE),
            b"incomplete unpublished bytes",
        )
        .expect("temporary writes");

        assert_eq!(
            fixture
                .executor()
                .recover()
                .expect("temporary recovery succeeds"),
            SaveResetRecovery::DiscardedUnpublished
        );
        assert!(plan.save_root().is_dir());
        assert!(plan.cache_root().is_dir());
    }

    #[test]
    fn malformed_or_changed_authoritative_intent_fails_closed() {
        let fixture = Fixture::new();
        let plan = fixture.plan("native-game", SaveOwner::Profile("player-one".to_owned()));
        Fixture::populate(&plan);
        let path = fixture.transaction.join(SAVE_RESET_INTENT_FILE);
        fs::write(
            &path,
            br#"{"schemaVersion":1,"gameId":"native-game","ownerKind":"profile","ownerId":"player-one","runtime":"native","extra":true}"#,
        )
        .expect("malformed intent writes");

        assert!(matches!(
            fixture.executor().recover(),
            Err(SaveResetError::InvalidIntent(_))
        ));
        assert!(path.is_file());
        assert!(plan.save_root().is_dir());
        assert!(plan.cache_root().is_dir());
    }

    #[test]
    fn oversized_authoritative_intent_is_bounded_before_json_parsing() {
        let fixture = Fixture::new();
        let path = fixture.transaction.join(SAVE_RESET_INTENT_FILE);
        fs::write(
            &path,
            vec![b' '; usize::try_from(MAX_SAVE_RESET_INTENT_BYTES + 1).expect("bound converts")],
        )
        .expect("oversized intent writes");

        assert!(matches!(
            fixture.executor().recover(),
            Err(SaveResetError::InvalidIntent(detail)) if detail.contains("size limit")
        ));
        assert_eq!(
            fs::metadata(path).expect("intent remains").len(),
            MAX_SAVE_RESET_INTENT_BYTES + 1
        );
    }

    #[test]
    fn plans_from_other_roots_and_non_directory_targets_are_rejected() {
        let fixture = Fixture::new();
        let other_data = fixture.root.join("other-data");
        let other_cache = fixture.root.join("other-cache");
        fs::create_dir_all(&other_data).expect("other data creates");
        fs::create_dir_all(&other_cache).expect("other cache creates");
        let foreign = SaveStoragePlan::new(
            &other_data,
            &other_cache,
            "native-game",
            SaveRuntime::Native,
            SaveOwner::Profile("player-one".to_owned()),
            SaveStoragePolicy::new(1024, 1024).expect("policy creates"),
        )
        .expect("foreign plan creates");
        assert!(matches!(
            fixture.executor().reset(&foreign),
            Err(SaveResetError::PlanOutsideConfiguredRoots)
        ));

        let local = fixture.plan("native-game", SaveOwner::Profile("player-one".to_owned()));
        fs::create_dir_all(local.save_root().parent().expect("save root has a parent"))
            .expect("save parent creates");
        fs::write(local.save_root(), b"not a directory").expect("unsafe target writes");
        fs::create_dir_all(local.cache_root()).expect("cache target creates");
        fs::write(local.cache_root().join("cache.bin"), b"cache").expect("cache target writes");
        assert!(matches!(
            fixture.executor().reset(&local),
            Err(SaveResetError::UnsafeTarget(path)) if path == local.save_root()
        ));
        assert!(local.save_root().is_file());
        assert!(
            fixture.transaction.join(SAVE_RESET_INTENT_FILE).is_file(),
            "authoritative recovery evidence remains"
        );
        assert_eq!(
            fs::read(local.cache_root().join("cache.bin")).expect("cache target remains"),
            b"cache"
        );
    }

    #[test]
    fn operation_lock_is_nonblocking_and_state_requires_recovery() {
        let fixture = Fixture::new();
        let plan = fixture.plan("native-game", SaveOwner::Profile("player-one".to_owned()));
        let executor = fixture.executor();
        let operation = executor
            .acquire_operation_lock()
            .expect("first operation acquires");
        assert!(matches!(executor.reset(&plan), Err(SaveResetError::Busy)));
        drop(operation);

        fs::write(
            fixture.transaction.join(SAVE_RESET_INTENT_TEMP_FILE),
            b"pending",
        )
        .expect("pending temporary writes");
        assert!(executor.recovery_required().expect("state inspects"));
        assert!(matches!(
            executor.reset(&plan),
            Err(SaveResetError::RecoveryRequired)
        ));
    }

    #[test]
    fn roots_and_operation_lock_must_be_preprovisioned_and_disjoint() {
        let fixture = Fixture::new();
        fs::remove_file(fixture.transaction.join(SAVE_RESET_LOCK_FILE)).expect("lock removes");
        assert!(
            SaveResetExecutor::open(SaveResetConfig {
                transaction_root: fixture.transaction.clone(),
                data_root: fixture.data.clone(),
                cache_root: fixture.cache.clone(),
            })
            .is_err()
        );

        File::create(fixture.transaction.join(SAVE_RESET_LOCK_FILE)).expect("lock recreates");
        fs::create_dir(fixture.data.join("nested")).expect("nested cache root creates");
        assert!(matches!(
            SaveResetExecutor::open(SaveResetConfig {
                transaction_root: fixture.transaction.clone(),
                data_root: fixture.data.clone(),
                cache_root: fixture.data.join("nested"),
            }),
            Err(SaveResetError::OverlappingRoots)
        ));
    }

    #[test]
    fn reset_identity_has_no_export_or_profile_claim_authority() {
        let fixture = Fixture::new();
        let plan = fixture.plan("native-game", SaveOwner::Profile("player-one".to_owned()));
        let intent = fixture
            .executor()
            .intent_from_plan(&plan)
            .expect("intent derives");
        let bytes = serde_json::to_vec(&intent).expect("intent serializes");
        let text = String::from_utf8(bytes).expect("intent is UTF-8");
        for forbidden in [
            fixture.data.to_string_lossy().as_ref(),
            fixture.cache.to_string_lossy().as_ref(),
            "export",
            "network",
            "portrait",
            "calibration",
            "payload",
        ] {
            assert!(!text.contains(forbidden));
        }

        let target_slots = BTreeSet::<SaveSlotKey>::new();
        assert!(
            target_slots.is_empty(),
            "reset carries no profile claim set"
        );
    }
}
