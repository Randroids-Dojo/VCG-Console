//! Crash-recoverable local history for accepted update roots.
//!
//! The store is an append-only chain of exact signed root bytes. A generation
//! directory becomes committed only when a fully synchronized private
//! `.incoming-*` directory is atomically renamed into place. This provides
//! crash-monotonic local evidence, not tamper-resistant rollback protection:
//! callers must still supply an out-of-band anchor set and protected minimum
//! generation on every load.

use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;

use crate::update_trust::{
    DetachedUpdateSignatures, MAX_UPDATE_ROOT_METADATA_BYTES, MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
    RootTrustAnchorSet, TrustedUpdateRoot, UpdateTrustError,
};

const GENERATIONS_DIRECTORY: &str = "generations";
const OPERATION_LOCK_FILE: &str = ".vcg-update-root-store.lock";
const ROOT_FILE: &str = "root.json";
const SIGNATURE_FILE: &str = "signatures.json";
const INCOMING_PREFIX: &str = ".incoming-";
const MAX_GENERATIONS: usize = 4_096;

/// Host-provisioned paths for accepted update-root history.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpdateRootStoreConfig {
    pub store_root: PathBuf,
}

/// An append-only, crash-recoverable accepted-root store.
#[derive(Clone, Debug)]
pub struct UpdateRootStore {
    root: PathBuf,
    generations: PathBuf,
    operation_lock: PathBuf,
}

impl UpdateRootStore {
    /// Opens an already provisioned store.
    ///
    /// The root must contain a real `generations` directory and a regular
    /// `.vcg-update-root-store.lock` file. Symlinks, reparse points, relative
    /// paths, and paths escaping the root are rejected.
    ///
    /// # Errors
    ///
    /// Returns an I/O or unsafe-layout error when the provisioned boundary is
    /// absent or does not resolve to direct children of the store.
    pub fn open(config: UpdateRootStoreConfig) -> Result<Self, UpdateRootStoreError> {
        let UpdateRootStoreConfig { store_root } = config;
        validate_absolute(&store_root)?;
        let root = canonical_directory("update root store", &store_root)?;
        let generations = canonical_direct_directory(
            "update root generations",
            &root,
            &root.join(GENERATIONS_DIRECTORY),
        )?;
        let operation_lock = canonical_direct_file(
            "update root operation lock",
            &root,
            &root.join(OPERATION_LOCK_FILE),
        )?;
        Ok(Self {
            root,
            generations,
            operation_lock,
        })
    }

    /// Accepts and durably publishes the first signed root.
    ///
    /// The store must be empty and free of interrupted publication state.
    ///
    /// # Errors
    ///
    /// Rejects invalid trust metadata, rollback below the protected floor,
    /// expired roots, non-empty stores, lock contention, or unsafe state.
    pub fn bootstrap(
        &self,
        root_bytes: &[u8],
        signature_bytes: &[u8],
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
        trusted_unix_seconds: u64,
    ) -> Result<TrustedUpdateRoot, UpdateRootStoreError> {
        let _operation = self.acquire_operation_lock()?;
        let entries = self.committed_generations()?;
        if !entries.is_empty() {
            return Err(UpdateRootStoreError::AlreadyBootstrapped);
        }
        let signatures = parse_signatures(signature_bytes)?;
        let root = TrustedUpdateRoot::bootstrap(
            root_bytes,
            &signatures,
            anchors,
            minimum_generation,
            trusted_unix_seconds,
        )?;
        self.publish(root.generation(), root_bytes, signature_bytes)?;
        Ok(root)
    }

    /// Verifies, accepts, and durably publishes the exact next root.
    ///
    /// # Errors
    ///
    /// Rejects interrupted state, invalid stored history, non-consecutive or
    /// incorrectly signed candidates, rollback below the protected floor,
    /// expiry, lock contention, or publication failure.
    pub fn rotate(
        &self,
        candidate_bytes: &[u8],
        signature_bytes: &[u8],
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
        trusted_unix_seconds: u64,
    ) -> Result<TrustedUpdateRoot, UpdateRootStoreError> {
        let _operation = self.acquire_operation_lock()?;
        if self.committed_generations()?.len() >= MAX_GENERATIONS {
            return Err(UpdateRootStoreError::TooManyGenerations {
                maximum: MAX_GENERATIONS,
            });
        }
        // An expired current root must still be able to authenticate its exact
        // successor. Only the candidate is required to be current here.
        let current = self.replay_unlocked(anchors, minimum_generation)?;
        let signatures = parse_signatures(signature_bytes)?;
        let candidate = current.rotate(candidate_bytes, &signatures, trusted_unix_seconds)?;
        self.publish(candidate.generation(), candidate_bytes, signature_bytes)?;
        Ok(candidate)
    }

    /// Replays all committed exact bytes and returns the current trusted root.
    ///
    /// Historical roots may be expired; their signatures, structure, and
    /// exact-generation links are still checked. The final root must satisfy
    /// the trusted time and protected generation floor.
    ///
    /// # Errors
    ///
    /// Rejects an empty store, interrupted state, malformed or gapped history,
    /// changed bytes, rollback, expiry, or lock contention.
    pub fn load_current(
        &self,
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
        trusted_unix_seconds: u64,
    ) -> Result<TrustedUpdateRoot, UpdateRootStoreError> {
        let _operation = self.acquire_operation_lock()?;
        self.load_current_unlocked(anchors, minimum_generation, trusted_unix_seconds)
    }

    /// Removes only canonical unpublished `.incoming-*` directories.
    ///
    /// Committed generation directories are never modified. Recovery does not
    /// make stored roots trusted; callers must subsequently replay the chain.
    ///
    /// # Errors
    ///
    /// Rejects unexpected entries, unsafe paths, lock contention, or removal
    /// failures.
    pub fn recover(&self) -> Result<usize, UpdateRootStoreError> {
        let _operation = self.acquire_operation_lock()?;
        let mut incoming = Vec::new();
        for entry in read_entries(&self.generations, MAX_GENERATIONS)? {
            let name = entry_name(&entry)?;
            if name.starts_with(INCOMING_PREFIX) {
                parse_incoming_name(&name)?;
                let canonical = canonical_direct_directory(
                    "incoming update root generation",
                    &self.generations,
                    &entry.path(),
                )?;
                incoming.push(canonical);
            } else {
                parse_generation_name(&name)?;
            }
        }
        for path in &incoming {
            fs::remove_dir_all(path).map_err(|source| UpdateRootStoreError::Io {
                operation: "remove unpublished update root generation",
                path: path.clone(),
                source,
            })?;
        }
        if !incoming.is_empty() {
            sync_directory(&self.generations)?;
        }
        Ok(incoming.len())
    }

    fn load_current_unlocked(
        &self,
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
        trusted_unix_seconds: u64,
    ) -> Result<TrustedUpdateRoot, UpdateRootStoreError> {
        let trusted = self.replay_unlocked(anchors, minimum_generation)?;
        trusted.require_current(trusted_unix_seconds)?;
        Ok(trusted)
    }

    fn replay_unlocked(
        &self,
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
    ) -> Result<TrustedUpdateRoot, UpdateRootStoreError> {
        let generations = self.committed_generations()?;
        let first = generations
            .first()
            .copied()
            .ok_or(UpdateRootStoreError::NotBootstrapped)?;
        let (root_bytes, signature_bytes) = self.read_generation(first)?;
        let signatures = parse_signatures(&signature_bytes)?;
        let mut trusted =
            TrustedUpdateRoot::bootstrap_stored(&root_bytes, &signatures, anchors, 0)?;
        if trusted.generation() != first {
            return Err(UpdateRootStoreError::GenerationMismatch {
                directory: first,
                metadata: trusted.generation(),
            });
        }
        for generation in generations.iter().copied().skip(1) {
            let expected = trusted
                .generation()
                .checked_add(1)
                .ok_or(UpdateRootStoreError::GenerationOverflow)?;
            if generation != expected {
                return Err(UpdateRootStoreError::HistoryGap {
                    expected,
                    actual: generation,
                });
            }
            let (root_bytes, signature_bytes) = self.read_generation(generation)?;
            let signatures = parse_signatures(&signature_bytes)?;
            trusted = trusted.rotate_stored(&root_bytes, &signatures)?;
        }
        if trusted.generation() < minimum_generation {
            return Err(UpdateRootStoreError::Rollback {
                minimum_generation,
                actual_generation: trusted.generation(),
            });
        }
        Ok(trusted)
    }

    fn committed_generations(&self) -> Result<Vec<u64>, UpdateRootStoreError> {
        let mut generations = Vec::new();
        for entry in read_entries(&self.generations, MAX_GENERATIONS)? {
            let name = entry_name(&entry)?;
            if name.starts_with(INCOMING_PREFIX) {
                parse_incoming_name(&name)?;
                return Err(UpdateRootStoreError::RecoveryRequired);
            }
            generations.push(parse_generation_name(&name)?);
            if generations.len() > MAX_GENERATIONS {
                return Err(UpdateRootStoreError::TooManyGenerations {
                    maximum: MAX_GENERATIONS,
                });
            }
        }
        generations.sort_unstable();
        if generations.windows(2).any(|pair| pair[0] == pair[1]) {
            return Err(UpdateRootStoreError::InvalidLayout(
                "duplicate generation directory".to_owned(),
            ));
        }
        Ok(generations)
    }

    fn read_generation(&self, generation: u64) -> Result<(Vec<u8>, Vec<u8>), UpdateRootStoreError> {
        let path = self.generations.join(format!("{generation:020}"));
        let path = canonical_direct_directory(
            "committed update root generation",
            &self.generations,
            &path,
        )?;
        let mut file_names = Vec::new();
        for entry in read_entries(&path, 3)? {
            file_names.push(entry_name(&entry)?);
        }
        file_names.sort();
        if file_names != [ROOT_FILE, SIGNATURE_FILE] {
            return Err(UpdateRootStoreError::InvalidLayout(format!(
                "generation {generation} must contain only {ROOT_FILE} and {SIGNATURE_FILE}"
            )));
        }
        let root_path = canonical_direct_file("stored update root", &path, &path.join(ROOT_FILE))?;
        let signature_path = canonical_direct_file(
            "stored update root signatures",
            &path,
            &path.join(SIGNATURE_FILE),
        )?;
        Ok((
            read_bounded(
                &root_path,
                MAX_UPDATE_ROOT_METADATA_BYTES,
                "stored update root",
            )?,
            read_bounded(
                &signature_path,
                MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
                "stored update root signatures",
            )?,
        ))
    }

    fn publish(
        &self,
        generation: u64,
        root_bytes: &[u8],
        signature_bytes: &[u8],
    ) -> Result<(), UpdateRootStoreError> {
        require_payload(root_bytes, MAX_UPDATE_ROOT_METADATA_BYTES, "update root")?;
        require_payload(
            signature_bytes,
            MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
            "update root signatures",
        )?;
        if generation == 0 {
            return Err(UpdateRootStoreError::InvalidLayout(
                "generation zero cannot be published".to_owned(),
            ));
        }
        let destination = self.generations.join(format!("{generation:020}"));
        if path_exists(&destination)? {
            return Err(UpdateRootStoreError::GenerationExists(generation));
        }
        let incoming = self
            .generations
            .join(format!("{INCOMING_PREFIX}{generation:020}"));
        if path_exists(&incoming)? {
            return Err(UpdateRootStoreError::RecoveryRequired);
        }
        fs::create_dir(&incoming).map_err(|source| UpdateRootStoreError::Io {
            operation: "create incoming update root generation",
            path: incoming.clone(),
            source,
        })?;
        sync_directory(&self.generations)?;
        write_new(&incoming.join(ROOT_FILE), root_bytes, "persist update root")?;
        write_new(
            &incoming.join(SIGNATURE_FILE),
            signature_bytes,
            "persist update root signatures",
        )?;
        sync_directory(&incoming)?;
        fs::rename(&incoming, &destination).map_err(|source| UpdateRootStoreError::Io {
            operation: "commit update root generation",
            path: destination,
            source,
        })?;
        sync_directory(&self.generations)
    }

    fn acquire_operation_lock(&self) -> Result<UpdateRootOperationLock, UpdateRootStoreError> {
        let path = canonical_direct_file(
            "update root operation lock",
            &self.root,
            &self.operation_lock,
        )?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|source| UpdateRootStoreError::Io {
                operation: "open update root operation lock",
                path: path.clone(),
                source,
            })?;
        match fs4::FileExt::try_lock(&file) {
            Ok(()) => Ok(UpdateRootOperationLock { _file: file }),
            Err(TryLockError::WouldBlock) => Err(UpdateRootStoreError::Busy),
            Err(TryLockError::Error(source)) => Err(UpdateRootStoreError::Io {
                operation: "lock update root store",
                path,
                source,
            }),
        }
    }
}

struct UpdateRootOperationLock {
    _file: File,
}

fn parse_signatures(bytes: &[u8]) -> Result<DetachedUpdateSignatures, UpdateRootStoreError> {
    require_payload(
        bytes,
        MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
        "update root signatures",
    )?;
    DetachedUpdateSignatures::from_json_bytes(bytes).map_err(UpdateRootStoreError::Trust)
}

fn read_entries(path: &Path, maximum: usize) -> Result<Vec<fs::DirEntry>, UpdateRootStoreError> {
    let directory = fs::read_dir(path).map_err(|source| UpdateRootStoreError::Io {
        operation: "read update root directory",
        path: path.to_owned(),
        source,
    })?;
    let mut entries = Vec::new();
    for entry in directory {
        if entries.len() >= maximum {
            return Err(UpdateRootStoreError::InvalidLayout(format!(
                "directory exceeds {maximum} entries"
            )));
        }
        entries.push(entry.map_err(|source| UpdateRootStoreError::Io {
            operation: "read update root directory entry",
            path: path.to_owned(),
            source,
        })?);
    }
    Ok(entries)
}

fn entry_name(entry: &fs::DirEntry) -> Result<String, UpdateRootStoreError> {
    entry
        .file_name()
        .into_string()
        .map_err(|_| UpdateRootStoreError::InvalidLayout("non-UTF-8 directory entry".to_owned()))
}

fn parse_generation_name(name: &str) -> Result<u64, UpdateRootStoreError> {
    if name.len() != 20 || !name.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(UpdateRootStoreError::InvalidLayout(format!(
            "unexpected generation entry: {name}"
        )));
    }
    let generation = name.parse::<u64>().map_err(|_| {
        UpdateRootStoreError::InvalidLayout(format!("invalid generation entry: {name}"))
    })?;
    if generation == 0 {
        return Err(UpdateRootStoreError::InvalidLayout(
            "generation zero is invalid".to_owned(),
        ));
    }
    Ok(generation)
}

fn parse_incoming_name(name: &str) -> Result<u64, UpdateRootStoreError> {
    let suffix = name.strip_prefix(INCOMING_PREFIX).ok_or_else(|| {
        UpdateRootStoreError::InvalidLayout(format!("invalid incoming entry: {name}"))
    })?;
    parse_generation_name(suffix)
}

fn validate_absolute(path: &Path) -> Result<(), UpdateRootStoreError> {
    if path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        Ok(())
    } else {
        Err(UpdateRootStoreError::UnsafePath {
            kind: "update root store",
            path: path.to_owned(),
        })
    }
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, UpdateRootStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| UpdateRootStoreError::Io {
        operation: "inspect update root directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() {
        return Err(UpdateRootStoreError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    fs::canonicalize(path).map_err(|source| UpdateRootStoreError::Io {
        operation: "resolve update root directory",
        path: path.to_owned(),
        source,
    })
}

fn canonical_direct_directory(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, UpdateRootStoreError> {
    let canonical = canonical_directory(kind, path)?;
    if canonical.parent() == Some(parent) && canonical.file_name() == path.file_name() {
        Ok(canonical)
    } else {
        Err(UpdateRootStoreError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn canonical_direct_file(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, UpdateRootStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| UpdateRootStoreError::Io {
        operation: "inspect update root file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() {
        return Err(UpdateRootStoreError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    let canonical = fs::canonicalize(path).map_err(|source| UpdateRootStoreError::Io {
        operation: "resolve update root file",
        path: path.to_owned(),
        source,
    })?;
    if canonical.parent() == Some(parent) && canonical.file_name() == path.file_name() {
        Ok(canonical)
    } else {
        Err(UpdateRootStoreError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn read_bounded(
    path: &Path,
    maximum: usize,
    kind: &'static str,
) -> Result<Vec<u8>, UpdateRootStoreError> {
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|file| {
            file.take(u64::try_from(maximum).expect("payload bound fits u64") + 1)
                .read_to_end(&mut bytes)
        })
        .map_err(|source| UpdateRootStoreError::Io {
            operation: "read update root payload",
            path: path.to_owned(),
            source,
        })?;
    require_payload(&bytes, maximum, kind)?;
    Ok(bytes)
}

fn require_payload(
    bytes: &[u8],
    maximum: usize,
    kind: &'static str,
) -> Result<(), UpdateRootStoreError> {
    if bytes.is_empty() || bytes.len() > maximum {
        Err(UpdateRootStoreError::PayloadSize { kind, maximum })
    } else {
        Ok(())
    }
}

fn write_new(
    path: &Path,
    bytes: &[u8],
    operation: &'static str,
) -> Result<(), UpdateRootStoreError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| UpdateRootStoreError::Io {
            operation,
            path: path.to_owned(),
            source,
        })?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| UpdateRootStoreError::Io {
            operation,
            path: path.to_owned(),
            source,
        })
}

fn path_exists(path: &Path) -> Result<bool, UpdateRootStoreError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(UpdateRootStoreError::Io {
            operation: "inspect update root path",
            path: path.to_owned(),
            source,
        }),
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), UpdateRootStoreError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| UpdateRootStoreError::Io {
            operation: "synchronize update root directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), UpdateRootStoreError> {
    Ok(())
}

/// Accepted-root history failure.
#[derive(Debug)]
pub enum UpdateRootStoreError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    Trust(UpdateTrustError),
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidLayout(String),
    PayloadSize {
        kind: &'static str,
        maximum: usize,
    },
    TooManyGenerations {
        maximum: usize,
    },
    GenerationMismatch {
        directory: u64,
        metadata: u64,
    },
    HistoryGap {
        expected: u64,
        actual: u64,
    },
    Rollback {
        minimum_generation: u64,
        actual_generation: u64,
    },
    GenerationExists(u64),
    GenerationOverflow,
    AlreadyBootstrapped,
    NotBootstrapped,
    RecoveryRequired,
    Busy,
}

impl fmt::Display for UpdateRootStoreError {
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
            Self::Trust(error) => write!(formatter, "update root trust rejected: {error}"),
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidLayout(error) => {
                write!(formatter, "update root store layout is invalid: {error}")
            }
            Self::PayloadSize { kind, maximum } => {
                write!(formatter, "{kind} must be 1..={maximum} bytes")
            }
            Self::TooManyGenerations { maximum } => {
                write!(
                    formatter,
                    "update root store has reached its {maximum}-generation limit"
                )
            }
            Self::GenerationMismatch {
                directory,
                metadata,
            } => write!(
                formatter,
                "update root generation directory {directory} contains metadata generation {metadata}"
            ),
            Self::HistoryGap { expected, actual } => write!(
                formatter,
                "update root history expected generation {expected} but found {actual}"
            ),
            Self::Rollback {
                minimum_generation,
                actual_generation,
            } => write!(
                formatter,
                "update root generation {actual_generation} is below protected floor {minimum_generation}"
            ),
            Self::GenerationExists(generation) => {
                write!(
                    formatter,
                    "update root generation {generation} already exists"
                )
            }
            Self::GenerationOverflow => formatter.write_str("update root generation overflow"),
            Self::AlreadyBootstrapped => formatter.write_str("update root store is not empty"),
            Self::NotBootstrapped => formatter.write_str("update root store is empty"),
            Self::RecoveryRequired => {
                formatter.write_str("update root publication recovery is required")
            }
            Self::Busy => formatter.write_str("update root store operation is already in progress"),
        }
    }
}

impl std::error::Error for UpdateRootStoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Trust(error) => Some(error),
            _ => None,
        }
    }
}

impl From<UpdateTrustError> for UpdateRootStoreError {
    fn from(error: UpdateTrustError) -> Self {
        Self::Trust(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};

    use crate::update_trust::RootTrustAnchor;

    const NOW: u64 = 2_000_000_000;
    const ROOT_DOMAIN: &[u8] = b"VCG-UPDATE-TRUST-ROOT-V1\0";
    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
        store: UpdateRootStore,
        root_a: SigningKey,
        root_b: SigningKey,
        root_c: SigningKey,
        root_d: SigningKey,
        role: SigningKey,
    }

    impl Fixture {
        fn new() -> Self {
            let unique = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-update-root-store-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("fixture root");
            fs::create_dir(root.join(GENERATIONS_DIRECTORY)).expect("generations");
            File::create(root.join(OPERATION_LOCK_FILE)).expect("operation lock");
            let store = UpdateRootStore::open(UpdateRootStoreConfig {
                store_root: root.clone(),
            })
            .expect("open store");
            Self {
                root,
                store,
                root_a: key(1),
                root_b: key(2),
                root_c: key(3),
                root_d: key(4),
                role: key(5),
            }
        }

        fn anchors(&self) -> RootTrustAnchorSet {
            RootTrustAnchorSet::new(
                2,
                [
                    RootTrustAnchor::new("root-a", *self.root_a.verifying_key().as_bytes())
                        .expect("root a"),
                    RootTrustAnchor::new("root-b", *self.root_b.verifying_key().as_bytes())
                        .expect("root b"),
                ],
            )
            .expect("anchors")
        }

        fn first(&self, expires: u64) -> (Vec<u8>, Vec<u8>) {
            let document = root_document(
                7,
                expires,
                &[("root-a", &self.root_a), ("root-b", &self.root_b)],
                &self.role,
            );
            let signatures = signature_document(&[
                ("root-a", &self.root_a, &document),
                ("root-b", &self.root_b, &document),
            ]);
            (document, signatures)
        }

        fn second(&self, expires: u64) -> (Vec<u8>, Vec<u8>) {
            let document = root_document(
                8,
                expires,
                &[("root-c", &self.root_c), ("root-d", &self.root_d)],
                &self.role,
            );
            let signatures = signature_document(&[
                ("root-a", &self.root_a, &document),
                ("root-b", &self.root_b, &document),
                ("root-c", &self.root_c, &document),
                ("root-d", &self.root_d, &document),
            ]);
            (document, signatures)
        }

        fn bootstrap(&self, expires: u64) {
            let (root, signatures) = self.first(expires);
            self.store
                .bootstrap(&root, &signatures, &self.anchors(), 7, NOW)
                .expect("bootstrap");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    fn hex(bytes: &[u8]) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut encoded = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            encoded.push(char::from(HEX[usize::from(byte >> 4)]));
            encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
        encoded
    }

    fn root_document(
        generation: u64,
        expires: u64,
        roots: &[(&str, &SigningKey)],
        role: &SigningKey,
    ) -> Vec<u8> {
        let roots = roots
            .iter()
            .map(|(key_id, key)| {
                format!(
                    r#"{{"keyId":"{key_id}","publicKey":"{}"}}"#,
                    hex(key.verifying_key().as_bytes())
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!(
            r#"{{"schemaVersion":1,"generation":{generation},"expiresUnixSeconds":{expires},"rootThreshold":2,"rootKeys":[{roots}],"roles":[{{"channel":"stable","artifact":"system-image","target":"test-target","threshold":1,"keys":[{{"keyId":"system-role","publicKey":"{}"}}]}}]}}"#,
            hex(role.verifying_key().as_bytes())
        )
        .into_bytes()
    }

    fn signature_document(entries: &[(&str, &SigningKey, &[u8])]) -> Vec<u8> {
        let signatures = entries
            .iter()
            .map(|(key_id, key, payload)| {
                let mut message = Vec::from(ROOT_DOMAIN);
                message.extend_from_slice(payload);
                let signature = key.sign(&message);
                format!(
                    r#"{{"keyId":"{key_id}","signature":"{}"}}"#,
                    hex(&signature.to_bytes())
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!(r#"{{"schemaVersion":1,"signatures":[{signatures}]}}"#).into_bytes()
    }

    #[test]
    fn bootstrap_persists_exact_bytes_and_reopens() {
        let fixture = Fixture::new();
        let (root, signatures) = fixture.first(NOW + 100);
        let trusted = fixture
            .store
            .bootstrap(&root, &signatures, &fixture.anchors(), 7, NOW)
            .expect("bootstrap");
        assert_eq!(trusted.generation(), 7);
        assert_eq!(
            fs::read(
                fixture
                    .root
                    .join("generations/00000000000000000007/root.json")
            )
            .expect("stored root"),
            root
        );
        let reopened = UpdateRootStore::open(UpdateRootStoreConfig {
            store_root: fixture.root.clone(),
        })
        .expect("reopen");
        assert_eq!(
            reopened
                .load_current(&fixture.anchors(), 7, NOW)
                .expect("load")
                .generation(),
            7
        );
    }

    #[test]
    fn rotation_replays_an_expired_historical_root() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 5);
        let (root, signatures) = fixture.second(NOW + 100);
        fixture
            .store
            .rotate(&root, &signatures, &fixture.anchors(), 7, NOW + 4)
            .expect("rotation");
        assert_eq!(
            fixture
                .store
                .load_current(&fixture.anchors(), 8, NOW + 10)
                .expect("historical expiry does not invalidate chain")
                .generation(),
            8
        );
    }

    #[test]
    fn expired_current_root_can_authenticate_one_current_successor() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 5);
        let (root, signatures) = fixture.second(NOW + 100);
        assert_eq!(
            fixture
                .store
                .rotate(&root, &signatures, &fixture.anchors(), 7, NOW + 5)
                .expect("expired root still authenticates exact next root")
                .generation(),
            8
        );
        assert_eq!(
            fixture
                .store
                .load_current(&fixture.anchors(), 8, NOW + 5)
                .expect("candidate is current")
                .generation(),
            8
        );
    }

    #[test]
    fn expired_current_root_fails_closed() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 5);
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 7, NOW + 5),
            Err(UpdateRootStoreError::Trust(
                UpdateTrustError::RootExpired { .. }
            ))
        ));
    }

    #[test]
    fn protected_generation_floor_detects_rollback() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 8, NOW),
            Err(UpdateRootStoreError::Rollback {
                minimum_generation: 8,
                actual_generation: 7
            })
        ));
    }

    #[test]
    fn changed_committed_root_bytes_fail_signature_replay() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        let root_path = fixture
            .root
            .join("generations/00000000000000000007/root.json");
        let mut changed = fs::read(&root_path).expect("read root");
        changed[0] ^= 1;
        fs::write(root_path, changed).expect("change root");
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 7, NOW),
            Err(UpdateRootStoreError::Trust(_))
        ));
    }

    #[test]
    fn history_gap_fails_closed() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        let (root, signatures) = fixture.second(NOW + 100);
        fixture
            .store
            .rotate(&root, &signatures, &fixture.anchors(), 7, NOW)
            .expect("rotate");
        fs::rename(
            fixture.root.join("generations/00000000000000000008"),
            fixture.root.join("generations/00000000000000000009"),
        )
        .expect("create gap");
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 7, NOW),
            Err(UpdateRootStoreError::HistoryGap {
                expected: 8,
                actual: 9
            })
        ));
    }

    #[test]
    fn incomplete_publication_requires_explicit_recovery() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        let incoming = fixture
            .root
            .join("generations/.incoming-00000000000000000008");
        fs::create_dir(&incoming).expect("incoming");
        fs::write(incoming.join(ROOT_FILE), b"partial").expect("partial root");
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 7, NOW),
            Err(UpdateRootStoreError::RecoveryRequired)
        ));
        assert_eq!(fixture.store.recover().expect("recover"), 1);
        assert_eq!(
            fixture
                .store
                .load_current(&fixture.anchors(), 7, NOW)
                .expect("load after recovery")
                .generation(),
            7
        );
    }

    #[test]
    fn recovery_never_removes_committed_generations() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        let committed = fixture.root.join("generations/00000000000000000007");
        assert_eq!(fixture.store.recover().expect("clean recovery"), 0);
        assert!(committed.is_dir());
    }

    #[test]
    fn unexpected_generation_entry_fails_closed() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        fs::write(fixture.root.join("generations/current"), b"7").expect("unexpected");
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 7, NOW),
            Err(UpdateRootStoreError::InvalidLayout(_))
        ));
    }

    #[test]
    fn operation_lock_contention_is_nonblocking() {
        let fixture = Fixture::new();
        fixture.bootstrap(NOW + 100);
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .open(fixture.root.join(OPERATION_LOCK_FILE))
            .expect("open lock");
        fs4::FileExt::try_lock(&lock).expect("hold operation lock");
        assert!(matches!(
            fixture.store.load_current(&fixture.anchors(), 7, NOW),
            Err(UpdateRootStoreError::Busy)
        ));
    }

    #[test]
    fn committed_rename_is_the_publication_point() {
        let fixture = Fixture::new();
        let (root, signatures) = fixture.first(NOW + 100);
        let incoming = fixture
            .root
            .join("generations/.incoming-00000000000000000007");
        fs::create_dir(&incoming).expect("incoming");
        fs::write(incoming.join(ROOT_FILE), &root).expect("root");
        fs::write(incoming.join(SIGNATURE_FILE), &signatures).expect("signatures");
        fs::rename(
            incoming,
            fixture.root.join("generations/00000000000000000007"),
        )
        .expect("commit rename");
        assert_eq!(
            fixture
                .store
                .load_current(&fixture.anchors(), 7, NOW)
                .expect("load committed rename")
                .generation(),
            7
        );
    }
}
