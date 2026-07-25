//! Inert developer-only artifact receipt after paired-session admission.
//!
//! The store consumes only an already authorized developer `Push`, verifies
//! the complete declared byte length and SHA-256, and atomically publishes one
//! opaque blob plus path-free receipt. It does not parse, extract, install,
//! execute, launch, retain, or roll back a development build.

use std::error::Error;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::developer_pairing::{
    AuthorizedDeveloperOperation, DeveloperOperation, MAX_DEVELOPER_ARTIFACT_BYTES,
};

const ARTIFACT_SCHEMA_VERSION: u32 = 1;
const STAGING_DIRECTORY: &str = "staging";
const READY_DIRECTORY: &str = "ready";
const OPERATION_LOCK_FILE: &str = ".vcg-developer-artifact.lock";
const RECEIPT_FILE: &str = "receipt.json";
const ARTIFACT_FILE: &str = "artifact.bin";
const MAX_RECEIPT_BYTES: u64 = 4 * 1_024;
const COPY_BUFFER_BYTES: usize = 64 * 1_024;
pub const MAX_READY_DEVELOPER_ARTIFACTS: usize = 1_024;
pub const MAX_DEVELOPER_TRANSFER_CHUNK_BYTES: usize = 1_024 * 1_024;

/// Preprovisioned developer-only artifact store.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeveloperArtifactStoreConfig {
    pub store_root: PathBuf,
}

/// One path-free receipt published with an inert artifact.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeveloperArtifactReceipt {
    schema_version: u32,
    request_id: String,
    workstation_id: String,
    session_ordinal: u64,
    deployment_id: String,
    artifact_sha256: String,
    artifact_bytes: u64,
}

/// Verified retained handle for one ready developer-only artifact.
#[derive(Debug)]
pub struct ReadyDeveloperArtifact {
    receipt: DeveloperArtifactReceipt,
    artifact: File,
}

impl ReadyDeveloperArtifact {
    #[must_use]
    pub fn request_id(&self) -> &str {
        &self.receipt.request_id
    }

    #[must_use]
    pub fn workstation_id(&self) -> &str {
        &self.receipt.workstation_id
    }

    #[must_use]
    pub const fn session_ordinal(&self) -> u64 {
        self.receipt.session_ordinal
    }

    #[must_use]
    pub fn deployment_id(&self) -> &str {
        &self.receipt.deployment_id
    }

    #[must_use]
    pub fn artifact_sha256(&self) -> &str {
        &self.receipt.artifact_sha256
    }

    #[must_use]
    pub const fn artifact_bytes(&self) -> u64 {
        self.receipt.artifact_bytes
    }

    /// Returns the retained verified artifact handle at byte offset zero.
    ///
    /// # Errors
    ///
    /// Returns an I/O error if the retained handle cannot seek.
    pub fn reader(&mut self) -> Result<&mut File, DeveloperArtifactError> {
        self.artifact
            .seek(SeekFrom::Start(0))
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "seek verified developer artifact",
                path: PathBuf::from("<retained-developer-artifact>"),
                source,
            })?;
        Ok(&mut self.artifact)
    }
}

/// Volatile authority for one incomplete developer artifact receipt.
///
/// This value is deliberately non-serializable and non-cloneable. It retains
/// the exact authorized Push plus incremental SHA-256 state. Dropping it never
/// publishes or removes bytes; explicit cancellation or restart recovery must
/// discard its inert staging directory.
#[derive(Debug)]
pub struct PendingDeveloperArtifact {
    authorization: AuthorizedDeveloperOperation,
    receipt: DeveloperArtifactReceipt,
    store_root: PathBuf,
    received_bytes: u64,
    hasher: Sha256,
}

impl PendingDeveloperArtifact {
    #[must_use]
    pub fn request_id(&self) -> &str {
        &self.receipt.request_id
    }

    #[must_use]
    pub fn deployment_id(&self) -> &str {
        &self.receipt.deployment_id
    }

    #[must_use]
    pub const fn expected_bytes(&self) -> u64 {
        self.receipt.artifact_bytes
    }

    #[must_use]
    pub const fn received_bytes(&self) -> u64 {
        self.received_bytes
    }
}

/// Serialized inert developer-artifact receipt store.
#[derive(Clone, Debug)]
pub struct DeveloperArtifactStore {
    root: PathBuf,
    staging: PathBuf,
    ready: PathBuf,
    operation_lock: PathBuf,
}

impl DeveloperArtifactStore {
    /// Opens an already provisioned store.
    ///
    /// The root must be absolute and contain direct real `staging` and `ready`
    /// directories plus a direct regular `.vcg-developer-artifact.lock` file.
    ///
    /// # Errors
    ///
    /// Rejects absent, relative, aliased, symlinked/reparse, or wrong-kind
    /// store components.
    pub fn open(config: DeveloperArtifactStoreConfig) -> Result<Self, DeveloperArtifactError> {
        let DeveloperArtifactStoreConfig { store_root } = config;
        validate_absolute(&store_root)?;
        let root = canonical_directory("developer artifact store", &store_root)?;
        let staging = canonical_direct_directory(
            "developer artifact staging",
            &root,
            &root.join(STAGING_DIRECTORY),
        )?;
        let ready = canonical_direct_directory(
            "developer artifact ready",
            &root,
            &root.join(READY_DIRECTORY),
        )?;
        let operation_lock = canonical_direct_file(
            "developer artifact operation lock",
            &root,
            &root.join(OPERATION_LOCK_FILE),
        )?;
        Ok(Self {
            root,
            staging,
            ready,
            operation_lock,
        })
    }

    /// Receives and publishes one exact authorized Push as an inert blob.
    ///
    /// The authorization is consumed. Its request ID is the durable
    /// idempotency key. Complete artifact bytes and a canonical path-free
    /// receipt are synchronized inside `staging`, then the directory is
    /// atomically renamed into `ready`.
    ///
    /// # Errors
    ///
    /// Rejects non-Push authority, lock contention, pending recovery, duplicate
    /// requests, full stores, short/long/changed input, unsafe state, or I/O
    /// failure. Any failed transfer remains inert in `staging` until explicit
    /// recovery; no failed byte becomes ready.
    pub fn publish_authorized_push<C>(
        &self,
        authorization: AuthorizedDeveloperOperation,
        source: &mut impl Read,
        mut trusted_now_ms: C,
    ) -> Result<ReadyDeveloperArtifact, DeveloperArtifactError>
    where
        C: FnMut() -> u64,
    {
        let mut transfer = self.begin_authorized_push(authorization, trusted_now_ms())?;
        let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
        loop {
            let count = source
                .read(&mut buffer)
                .map_err(|_| DeveloperArtifactError::SourceRead)?;
            if count == 0 {
                break;
            }
            self.append_authorized_push(&mut transfer, &buffer[..count], trusted_now_ms())?;
        }
        self.finalize_authorized_push(transfer, trusted_now_ms())
    }

    /// Starts one same-process, session-bound developer Push.
    ///
    /// The authorization is consumed into a non-serializable transfer. The
    /// canonical receipt and an empty artifact are synchronized in staging,
    /// but nothing becomes ready.
    ///
    /// # Errors
    ///
    /// Rejects inactive/non-Push authority, lock contention, pending recovery,
    /// duplicate requests, full stores, or unsafe state.
    pub fn begin_authorized_push(
        &self,
        authorization: AuthorizedDeveloperOperation,
        now_ms: u64,
    ) -> Result<PendingDeveloperArtifact, DeveloperArtifactError> {
        let receipt = receipt_from_authorization(&authorization)?;
        authorization
            .with_live_session(now_ms, || {
                self.with_lock(|store| store.begin_locked(&receipt))
            })
            .map_err(|_| DeveloperArtifactError::SessionInactive)??;
        Ok(PendingDeveloperArtifact {
            authorization,
            receipt,
            store_root: self.root.clone(),
            received_bytes: 0,
            hasher: Sha256::new(),
        })
    }

    /// Appends one bounded retryable chunk to an active Push.
    ///
    /// A caller may retry the same chunk only when this method returns before
    /// writing it, such as `Busy`. Any I/O ambiguity leaves staging inert and
    /// requires cancellation or recovery. Fresh trusted monotonic time is
    /// required for every call.
    ///
    /// # Errors
    ///
    /// Rejects an inactive session, another store, empty/excessive/overrun
    /// chunks, changed staging state, lock contention, or I/O failure.
    pub fn append_authorized_push(
        &self,
        transfer: &mut PendingDeveloperArtifact,
        chunk: &[u8],
        now_ms: u64,
    ) -> Result<u64, DeveloperArtifactError> {
        self.require_transfer_store(transfer)?;
        if chunk.is_empty() {
            return Err(DeveloperArtifactError::EmptyChunk);
        }
        if chunk.len() > MAX_DEVELOPER_TRANSFER_CHUNK_BYTES {
            return Err(DeveloperArtifactError::ChunkTooLarge {
                maximum: MAX_DEVELOPER_TRANSFER_CHUNK_BYTES,
            });
        }
        let PendingDeveloperArtifact {
            authorization,
            receipt,
            received_bytes,
            hasher,
            ..
        } = transfer;
        authorization
            .with_live_session(now_ms, || {
                self.with_lock(|store| store.append_locked(receipt, received_bytes, hasher, chunk))
            })
            .map_err(|_| DeveloperArtifactError::SessionInactive)?
    }

    /// Publishes one complete Push while its originating session is live.
    ///
    /// The incremental digest and a complete readback must both match the
    /// authorization. Publication is the staging-directory rename.
    ///
    /// # Errors
    ///
    /// Rejects inactive authority, incomplete/changed bytes, another store,
    /// lock contention, unsafe state, or I/O failure.
    pub fn finalize_authorized_push(
        &self,
        transfer: PendingDeveloperArtifact,
        now_ms: u64,
    ) -> Result<ReadyDeveloperArtifact, DeveloperArtifactError> {
        self.require_transfer_store(&transfer)?;
        let PendingDeveloperArtifact {
            authorization,
            receipt,
            received_bytes,
            hasher,
            ..
        } = transfer;
        authorization
            .with_live_session(now_ms, || {
                self.with_lock(|store| store.finalize_locked(&receipt, received_bytes, &hasher))
            })
            .map_err(|_| DeveloperArtifactError::SessionInactive)?
    }

    /// Explicitly discards one incomplete Push, including after session loss.
    ///
    /// # Errors
    ///
    /// Rejects another store, changed or unsafe staging state, lock
    /// contention, or I/O failure.
    pub fn cancel_authorized_push(
        &self,
        transfer: PendingDeveloperArtifact,
    ) -> Result<(), DeveloperArtifactError> {
        self.require_transfer_store(&transfer)?;
        let PendingDeveloperArtifact {
            receipt,
            received_bytes,
            ..
        } = transfer;
        self.with_lock(|store| store.cancel_locked(&receipt, received_bytes))
    }

    /// Reloads and completely revalidates one ready receipt and artifact.
    ///
    /// # Errors
    ///
    /// Rejects unsafe IDs/layout, unknown or noncanonical receipt fields,
    /// metadata mismatch, changed length/hash, unexpected files, and I/O
    /// failure.
    pub fn load_ready(
        &self,
        request_id: &str,
    ) -> Result<ReadyDeveloperArtifact, DeveloperArtifactError> {
        validate_safe_id("request", request_id)?;
        self.with_lock(|store| store.load_ready_locked(request_id))
    }

    /// Removes every direct, safely named incomplete staging directory.
    ///
    /// Recovery is intentionally destructive only inside the canonical direct
    /// staging directory. Any file, link/reparse entry, unsafe name, excessive
    /// count, or nested layout fails closed instead of being removed.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, unsafe or excessive staging state, or I/O
    /// failure.
    pub fn recover_incomplete(&self) -> Result<usize, DeveloperArtifactError> {
        self.with_lock(Self::recover_locked)
    }

    fn begin_locked(
        &self,
        receipt: &DeveloperArtifactReceipt,
    ) -> Result<(), DeveloperArtifactError> {
        if !self.staging_entries()?.is_empty() {
            return Err(DeveloperArtifactError::RecoveryRequired);
        }
        let ready_count = self.ready_entries()?.len();
        if ready_count >= MAX_READY_DEVELOPER_ARTIFACTS {
            return Err(DeveloperArtifactError::ReadyCapacityExceeded {
                maximum: MAX_READY_DEVELOPER_ARTIFACTS,
            });
        }
        let requested_staging_path = self.staging.join(&receipt.request_id);
        let ready_path = self.ready.join(&receipt.request_id);
        if path_exists(&ready_path)? || path_exists(&requested_staging_path)? {
            return Err(DeveloperArtifactError::DuplicateRequest(
                receipt.request_id.clone(),
            ));
        }

        fs::create_dir(&requested_staging_path).map_err(|source| DeveloperArtifactError::Io {
            operation: "create developer artifact staging transaction",
            path: requested_staging_path.clone(),
            source,
        })?;
        sync_directory(&self.staging)?;
        let staging_path = canonical_direct_directory(
            "developer artifact staging transaction",
            &self.staging,
            &requested_staging_path,
        )?;
        let receipt_path = staging_path.join(RECEIPT_FILE);
        write_receipt(&receipt_path, receipt)?;
        let artifact_path = staging_path.join(ARTIFACT_FILE);
        let artifact = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&artifact_path)
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "create developer artifact bytes",
                path: artifact_path,
                source,
            })?;
        artifact
            .sync_all()
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "synchronize empty developer artifact",
                path: staging_path.join(ARTIFACT_FILE),
                source,
            })?;
        sync_directory(&staging_path)?;
        Ok(())
    }

    fn append_locked(
        &self,
        receipt: &DeveloperArtifactReceipt,
        received_bytes: &mut u64,
        hasher: &mut Sha256,
        chunk: &[u8],
    ) -> Result<u64, DeveloperArtifactError> {
        let next_received = received_bytes
            .checked_add(u64::try_from(chunk.len()).map_err(|_| {
                DeveloperArtifactError::InvalidReceipt(
                    "developer artifact chunk length overflowed".to_owned(),
                )
            })?)
            .ok_or_else(|| {
                DeveloperArtifactError::InvalidReceipt(
                    "developer artifact byte count overflowed".to_owned(),
                )
            })?;
        if next_received > receipt.artifact_bytes {
            return Err(DeveloperArtifactError::ArtifactLengthMismatch {
                expected: receipt.artifact_bytes,
                actual: next_received,
            });
        }
        let transaction = self.validate_pending(receipt, *received_bytes)?;
        let artifact_path = transaction.join(ARTIFACT_FILE);
        let mut artifact = OpenOptions::new()
            .append(true)
            .open(&artifact_path)
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "open incomplete developer artifact",
                path: artifact_path.clone(),
                source,
            })?;
        artifact
            .write_all(chunk)
            .and_then(|()| artifact.sync_data())
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "append developer artifact chunk",
                path: artifact_path,
                source,
            })?;
        hasher.update(chunk);
        *received_bytes = next_received;
        Ok(next_received)
    }

    fn finalize_locked(
        &self,
        receipt: &DeveloperArtifactReceipt,
        received_bytes: u64,
        hasher: &Sha256,
    ) -> Result<ReadyDeveloperArtifact, DeveloperArtifactError> {
        if received_bytes != receipt.artifact_bytes {
            return Err(DeveloperArtifactError::ArtifactLengthMismatch {
                expected: receipt.artifact_bytes,
                actual: received_bytes,
            });
        }
        if encode_hex(&hasher.clone().finalize()) != receipt.artifact_sha256 {
            return Err(DeveloperArtifactError::ArtifactDigestMismatch);
        }
        let staging_path = self.validate_pending(receipt, received_bytes)?;
        let artifact_path = canonical_direct_file(
            "incomplete developer artifact bytes",
            &staging_path,
            &staging_path.join(ARTIFACT_FILE),
        )?;
        let mut artifact =
            File::open(&artifact_path).map_err(|source| DeveloperArtifactError::Io {
                operation: "open complete developer artifact",
                path: artifact_path.clone(),
                source,
            })?;
        verify_artifact(&mut artifact, &artifact_path, receipt)?;
        drop(artifact);
        sync_directory(&staging_path)?;
        let ready_path = self.ready.join(&receipt.request_id);
        if path_exists(&ready_path)? {
            return Err(DeveloperArtifactError::DuplicateRequest(
                receipt.request_id.clone(),
            ));
        }
        fs::rename(&staging_path, &ready_path).map_err(|source| DeveloperArtifactError::Io {
            operation: "publish ready developer artifact",
            path: ready_path.clone(),
            source,
        })?;
        sync_directory(&self.staging)?;
        sync_directory(&self.ready)?;
        self.load_ready_locked(&receipt.request_id)
    }

    fn cancel_locked(
        &self,
        receipt: &DeveloperArtifactReceipt,
        received_bytes: u64,
    ) -> Result<(), DeveloperArtifactError> {
        let transaction = self.validate_pending(receipt, received_bytes)?;
        fs::remove_dir_all(&transaction).map_err(|source| DeveloperArtifactError::Io {
            operation: "cancel incomplete developer artifact",
            path: transaction,
            source,
        })?;
        sync_directory(&self.staging)
    }

    fn validate_pending(
        &self,
        receipt: &DeveloperArtifactReceipt,
        received_bytes: u64,
    ) -> Result<PathBuf, DeveloperArtifactError> {
        let transaction = canonical_direct_directory(
            "incomplete developer artifact",
            &self.staging,
            &self.staging.join(&receipt.request_id),
        )?;
        require_exact_children(&transaction, &[ARTIFACT_FILE, RECEIPT_FILE])?;
        let receipt_path = canonical_direct_file(
            "incomplete developer artifact receipt",
            &transaction,
            &transaction.join(RECEIPT_FILE),
        )?;
        if read_receipt(&receipt_path)? != *receipt {
            return Err(DeveloperArtifactError::ReceiptBindingMismatch);
        }
        let artifact_path = canonical_direct_file(
            "incomplete developer artifact bytes",
            &transaction,
            &transaction.join(ARTIFACT_FILE),
        )?;
        let actual = fs::metadata(&artifact_path)
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "inspect incomplete developer artifact",
                path: artifact_path,
                source,
            })?
            .len();
        if actual != received_bytes {
            return Err(DeveloperArtifactError::ArtifactLengthMismatch {
                expected: received_bytes,
                actual,
            });
        }
        Ok(transaction)
    }

    fn require_transfer_store(
        &self,
        transfer: &PendingDeveloperArtifact,
    ) -> Result<(), DeveloperArtifactError> {
        if transfer.store_root == self.root {
            Ok(())
        } else {
            Err(DeveloperArtifactError::TransferStoreMismatch)
        }
    }

    fn load_ready_locked(
        &self,
        request_id: &str,
    ) -> Result<ReadyDeveloperArtifact, DeveloperArtifactError> {
        let ready_path = canonical_direct_directory(
            "ready developer artifact",
            &self.ready,
            &self.ready.join(request_id),
        )?;
        require_exact_children(&ready_path, &[ARTIFACT_FILE, RECEIPT_FILE])?;
        let receipt_path = canonical_direct_file(
            "developer artifact receipt",
            &ready_path,
            &ready_path.join(RECEIPT_FILE),
        )?;
        let artifact_path = canonical_direct_file(
            "developer artifact bytes",
            &ready_path,
            &ready_path.join(ARTIFACT_FILE),
        )?;
        let receipt = read_receipt(&receipt_path)?;
        if receipt.request_id != request_id {
            return Err(DeveloperArtifactError::ReceiptBindingMismatch);
        }
        let mut artifact =
            File::open(&artifact_path).map_err(|source| DeveloperArtifactError::Io {
                operation: "open ready developer artifact",
                path: artifact_path.clone(),
                source,
            })?;
        verify_artifact(&mut artifact, &artifact_path, &receipt)?;
        Ok(ReadyDeveloperArtifact { receipt, artifact })
    }

    fn recover_locked(&self) -> Result<usize, DeveloperArtifactError> {
        let entries = self.staging_entries()?;
        for entry in &entries {
            let transaction = canonical_direct_directory(
                "incomplete developer artifact",
                &self.staging,
                &self.staging.join(entry),
            )?;
            require_exact_or_partial_children(&transaction)?;
        }
        for entry in &entries {
            let transaction = self.staging.join(entry);
            fs::remove_dir_all(&transaction).map_err(|source| DeveloperArtifactError::Io {
                operation: "remove incomplete developer artifact",
                path: transaction,
                source,
            })?;
        }
        if !entries.is_empty() {
            sync_directory(&self.staging)?;
        }
        Ok(entries.len())
    }

    fn staging_entries(&self) -> Result<Vec<String>, DeveloperArtifactError> {
        bounded_directories(&self.staging, "developer artifact staging")
    }

    fn ready_entries(&self) -> Result<Vec<String>, DeveloperArtifactError> {
        bounded_directories(&self.ready, "ready developer artifacts")
    }

    fn with_lock<T>(
        &self,
        operation: impl FnOnce(&Self) -> Result<T, DeveloperArtifactError>,
    ) -> Result<T, DeveloperArtifactError> {
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&self.operation_lock)
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "open developer artifact operation lock",
                path: self.operation_lock.clone(),
                source,
            })?;
        match fs4::FileExt::try_lock(&lock) {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(DeveloperArtifactError::Busy),
            Err(TryLockError::Error(source)) => {
                return Err(DeveloperArtifactError::Io {
                    operation: "lock developer artifact store",
                    path: self.operation_lock.clone(),
                    source,
                });
            }
        }
        let result = operation(self);
        let _ = fs4::FileExt::unlock(&lock);
        result
    }
}

fn receipt_from_authorization(
    authorization: &AuthorizedDeveloperOperation,
) -> Result<DeveloperArtifactReceipt, DeveloperArtifactError> {
    let DeveloperOperation::Push {
        deployment_id,
        artifact_sha256,
        artifact_bytes,
    } = authorization.request().operation()
    else {
        return Err(DeveloperArtifactError::PushAuthorityRequired);
    };
    let receipt = DeveloperArtifactReceipt {
        schema_version: ARTIFACT_SCHEMA_VERSION,
        request_id: authorization.request().request_id().to_owned(),
        workstation_id: authorization.workstation_id().to_owned(),
        session_ordinal: authorization.session_ordinal(),
        deployment_id: deployment_id.clone(),
        artifact_sha256: artifact_sha256.clone(),
        artifact_bytes: *artifact_bytes,
    };
    validate_receipt(&receipt)?;
    Ok(receipt)
}

fn verify_artifact(
    artifact: &mut File,
    path: &Path,
    receipt: &DeveloperArtifactReceipt,
) -> Result<(), DeveloperArtifactError> {
    let metadata = artifact
        .metadata()
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "inspect ready developer artifact",
            path: path.to_owned(),
            source,
        })?;
    if !metadata.is_file() || metadata.len() != receipt.artifact_bytes {
        return Err(DeveloperArtifactError::ArtifactLengthMismatch {
            expected: receipt.artifact_bytes,
            actual: metadata.len(),
        });
    }
    artifact
        .seek(SeekFrom::Start(0))
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "seek ready developer artifact",
            path: path.to_owned(),
            source,
        })?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    loop {
        let count = artifact
            .read(&mut buffer)
            .map_err(|source| DeveloperArtifactError::Io {
                operation: "hash ready developer artifact",
                path: path.to_owned(),
                source,
            })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if encode_hex(&hasher.finalize()) != receipt.artifact_sha256 {
        return Err(DeveloperArtifactError::ArtifactDigestMismatch);
    }
    artifact
        .seek(SeekFrom::Start(0))
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "rewind ready developer artifact",
            path: path.to_owned(),
            source,
        })?;
    Ok(())
}

fn write_receipt(
    path: &Path,
    receipt: &DeveloperArtifactReceipt,
) -> Result<(), DeveloperArtifactError> {
    validate_receipt(receipt)?;
    let bytes = serde_json::to_vec(receipt)
        .map_err(|error| DeveloperArtifactError::InvalidReceipt(error.to_string()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "create developer artifact receipt",
            path: path.to_owned(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "persist developer artifact receipt",
            path: path.to_owned(),
            source,
        })
}

fn read_receipt(path: &Path) -> Result<DeveloperArtifactReceipt, DeveloperArtifactError> {
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|file| file.take(MAX_RECEIPT_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "read developer artifact receipt",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_RECEIPT_BYTES {
        return Err(DeveloperArtifactError::InvalidReceipt(
            "developer artifact receipt exceeds size limit".to_owned(),
        ));
    }
    let receipt: DeveloperArtifactReceipt = serde_json::from_slice(&bytes)
        .map_err(|error| DeveloperArtifactError::InvalidReceipt(error.to_string()))?;
    validate_receipt(&receipt)?;
    let canonical = serde_json::to_vec(&receipt)
        .map_err(|error| DeveloperArtifactError::InvalidReceipt(error.to_string()))?;
    if canonical != bytes {
        return Err(DeveloperArtifactError::InvalidReceipt(
            "developer artifact receipt must be canonical JSON".to_owned(),
        ));
    }
    Ok(receipt)
}

fn validate_receipt(receipt: &DeveloperArtifactReceipt) -> Result<(), DeveloperArtifactError> {
    if receipt.schema_version != ARTIFACT_SCHEMA_VERSION {
        return Err(DeveloperArtifactError::InvalidReceipt(format!(
            "unsupported developer artifact schema {}",
            receipt.schema_version
        )));
    }
    validate_safe_id("request", &receipt.request_id)?;
    validate_workstation_id(&receipt.workstation_id)?;
    if receipt.session_ordinal == 0 {
        return Err(DeveloperArtifactError::InvalidReceipt(
            "developer artifact session ordinal must be nonzero".to_owned(),
        ));
    }
    validate_safe_id("deployment", &receipt.deployment_id)?;
    if !is_canonical_sha256(&receipt.artifact_sha256)
        || receipt.artifact_bytes == 0
        || receipt.artifact_bytes > MAX_DEVELOPER_ARTIFACT_BYTES
    {
        return Err(DeveloperArtifactError::InvalidReceipt(
            "developer artifact identity is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn validate_workstation_id(value: &str) -> Result<(), DeveloperArtifactError> {
    let Some(suffix) = value.strip_prefix("workstation-") else {
        return Err(DeveloperArtifactError::InvalidReceipt(
            "developer artifact workstation ID is invalid".to_owned(),
        ));
    };
    if suffix.len() != 32
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(DeveloperArtifactError::InvalidReceipt(
            "developer artifact workstation ID is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn validate_safe_id(kind: &'static str, value: &str) -> Result<(), DeveloperArtifactError> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(DeveloperArtifactError::InvalidIdentifier {
            kind,
            value: value.to_owned(),
        });
    }
    Ok(())
}

fn bounded_directories(
    root: &Path,
    kind: &'static str,
) -> Result<Vec<String>, DeveloperArtifactError> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(root).map_err(|source| DeveloperArtifactError::Io {
        operation: "enumerate developer artifact directory",
        path: root.to_owned(),
        source,
    })? {
        let entry = entry.map_err(|source| DeveloperArtifactError::Io {
            operation: "read developer artifact directory entry",
            path: root.to_owned(),
            source,
        })?;
        if entries.len() >= MAX_READY_DEVELOPER_ARTIFACTS {
            return Err(DeveloperArtifactError::ReadyCapacityExceeded {
                maximum: MAX_READY_DEVELOPER_ARTIFACTS,
            });
        }
        let name =
            entry
                .file_name()
                .into_string()
                .map_err(|_| DeveloperArtifactError::UnsafePath {
                    kind,
                    path: entry.path(),
                })?;
        validate_safe_id("stored request", &name)?;
        let metadata =
            fs::symlink_metadata(entry.path()).map_err(|source| DeveloperArtifactError::Io {
                operation: "inspect developer artifact directory entry",
                path: entry.path(),
                source,
            })?;
        if !metadata.file_type().is_dir() {
            return Err(DeveloperArtifactError::UnsafePath {
                kind,
                path: entry.path(),
            });
        }
        entries.push(name);
    }
    entries.sort();
    Ok(entries)
}

fn require_exact_children(
    directory: &Path,
    expected: &[&str],
) -> Result<(), DeveloperArtifactError> {
    let mut names = Vec::new();
    for entry in fs::read_dir(directory).map_err(|source| DeveloperArtifactError::Io {
        operation: "enumerate ready developer artifact",
        path: directory.to_owned(),
        source,
    })? {
        let entry = entry.map_err(|source| DeveloperArtifactError::Io {
            operation: "read ready developer artifact entry",
            path: directory.to_owned(),
            source,
        })?;
        let name =
            entry
                .file_name()
                .into_string()
                .map_err(|_| DeveloperArtifactError::UnsafePath {
                    kind: "ready developer artifact entry",
                    path: entry.path(),
                })?;
        names.push(name);
    }
    names.sort();
    let mut expected = expected
        .iter()
        .map(|value| (*value).to_owned())
        .collect::<Vec<_>>();
    expected.sort();
    if names == expected {
        Ok(())
    } else {
        Err(DeveloperArtifactError::UnsafePath {
            kind: "ready developer artifact layout",
            path: directory.to_owned(),
        })
    }
}

fn require_exact_or_partial_children(directory: &Path) -> Result<(), DeveloperArtifactError> {
    let mut names = Vec::new();
    for entry in fs::read_dir(directory).map_err(|source| DeveloperArtifactError::Io {
        operation: "enumerate incomplete developer artifact",
        path: directory.to_owned(),
        source,
    })? {
        let entry = entry.map_err(|source| DeveloperArtifactError::Io {
            operation: "read incomplete developer artifact entry",
            path: directory.to_owned(),
            source,
        })?;
        let metadata =
            fs::symlink_metadata(entry.path()).map_err(|source| DeveloperArtifactError::Io {
                operation: "inspect incomplete developer artifact entry",
                path: entry.path(),
                source,
            })?;
        if !metadata.file_type().is_file() {
            return Err(DeveloperArtifactError::UnsafePath {
                kind: "incomplete developer artifact entry",
                path: entry.path(),
            });
        }
        let name =
            entry
                .file_name()
                .into_string()
                .map_err(|_| DeveloperArtifactError::UnsafePath {
                    kind: "incomplete developer artifact entry",
                    path: entry.path(),
                })?;
        if !matches!(name.as_str(), RECEIPT_FILE | ARTIFACT_FILE) {
            return Err(DeveloperArtifactError::UnsafePath {
                kind: "incomplete developer artifact layout",
                path: directory.to_owned(),
            });
        }
        names.push(name);
    }
    names.sort();
    names.dedup();
    if names.len() <= 2 {
        Ok(())
    } else {
        Err(DeveloperArtifactError::UnsafePath {
            kind: "incomplete developer artifact layout",
            path: directory.to_owned(),
        })
    }
}

fn validate_absolute(path: &Path) -> Result<(), DeveloperArtifactError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(DeveloperArtifactError::UnsafePath {
            kind: "developer artifact store root",
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, DeveloperArtifactError> {
    let canonical = fs::canonicalize(path).map_err(|source| DeveloperArtifactError::Io {
        operation: "canonicalize developer artifact directory",
        path: path.to_owned(),
        source,
    })?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(DeveloperArtifactError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn canonical_direct_directory(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, DeveloperArtifactError> {
    let canonical = canonical_directory(kind, path)?;
    if canonical.parent() == Some(parent) && canonical.file_name() == path.file_name() {
        Ok(canonical)
    } else {
        Err(DeveloperArtifactError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn canonical_direct_file(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, DeveloperArtifactError> {
    let canonical = fs::canonicalize(path).map_err(|source| DeveloperArtifactError::Io {
        operation: "canonicalize developer artifact file",
        path: path.to_owned(),
        source,
    })?;
    if canonical.is_file()
        && canonical.parent() == Some(parent)
        && canonical.file_name() == path.file_name()
    {
        Ok(canonical)
    } else {
        Err(DeveloperArtifactError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn path_exists(path: &Path) -> Result<bool, DeveloperArtifactError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(DeveloperArtifactError::Io {
            operation: "inspect developer artifact path",
            path: path.to_owned(),
            source,
        }),
    }
}

fn is_canonical_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    output
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), DeveloperArtifactError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| DeveloperArtifactError::Io {
            operation: "synchronize developer artifact directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(
    clippy::unnecessary_wraps,
    reason = "Windows does not expose the Unix directory synchronization primitive"
)]
fn sync_directory(_path: &Path) -> Result<(), DeveloperArtifactError> {
    Ok(())
}

/// Developer-only artifact receipt failure.
#[derive(Debug)]
pub enum DeveloperArtifactError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    SourceRead,
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidIdentifier {
        kind: &'static str,
        value: String,
    },
    InvalidReceipt(String),
    PushAuthorityRequired,
    SessionInactive,
    TransferStoreMismatch,
    EmptyChunk,
    ChunkTooLarge {
        maximum: usize,
    },
    Busy,
    RecoveryRequired,
    DuplicateRequest(String),
    ReadyCapacityExceeded {
        maximum: usize,
    },
    ArtifactLengthMismatch {
        expected: u64,
        actual: u64,
    },
    ArtifactDigestMismatch,
    ReceiptBindingMismatch,
}

impl fmt::Display for DeveloperArtifactError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                operation,
                path,
                source,
            } => write!(
                formatter,
                "{operation} at {} failed: {source}",
                path.display()
            ),
            Self::SourceRead => formatter.write_str("developer artifact source read failed"),
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidIdentifier { kind, value } => {
                write!(
                    formatter,
                    "developer artifact {kind} ID is invalid: {value}"
                )
            }
            Self::InvalidReceipt(detail) => {
                write!(formatter, "developer artifact receipt is invalid: {detail}")
            }
            Self::PushAuthorityRequired => {
                formatter.write_str("developer artifact receipt requires Push authority")
            }
            Self::SessionInactive => {
                formatter.write_str("developer artifact session is no longer active")
            }
            Self::TransferStoreMismatch => {
                formatter.write_str("developer artifact transfer belongs to another store")
            }
            Self::EmptyChunk => formatter.write_str("developer artifact transfer chunk is empty"),
            Self::ChunkTooLarge { maximum } => {
                write!(
                    formatter,
                    "developer artifact transfer chunk exceeds {maximum} bytes"
                )
            }
            Self::Busy => formatter.write_str("developer artifact store is busy"),
            Self::RecoveryRequired => {
                formatter.write_str("developer artifact staging requires explicit recovery")
            }
            Self::DuplicateRequest(request_id) => {
                write!(
                    formatter,
                    "developer artifact request already exists: {request_id}"
                )
            }
            Self::ReadyCapacityExceeded { maximum } => {
                write!(
                    formatter,
                    "developer artifact store exceeds {maximum} ready entries"
                )
            }
            Self::ArtifactLengthMismatch { expected, actual } => write!(
                formatter,
                "developer artifact length mismatch: expected {expected}, received {actual}"
            ),
            Self::ArtifactDigestMismatch => {
                formatter.write_str("developer artifact SHA-256 does not match authority")
            }
            Self::ReceiptBindingMismatch => {
                formatter.write_str("developer artifact receipt does not match requested identity")
            }
        }
    }
}

impl Error for DeveloperArtifactError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};

    use super::*;
    use crate::developer_pairing::{
        DeveloperOperationRequest, DeveloperSessionAuthority, DeveloperTrustLoad,
        DeveloperTrustRegistry, ProtectedDeveloperTrustState,
    };

    static FIXTURE_ORDINAL: AtomicU64 = AtomicU64::new(1);

    struct StoreFixture {
        root: PathBuf,
        store: DeveloperArtifactStore,
    }

    impl StoreFixture {
        fn new() -> Self {
            let ordinal = FIXTURE_ORDINAL.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-developer-artifact-{}-{ordinal}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("fixture root");
            fs::create_dir(root.join(STAGING_DIRECTORY)).expect("staging");
            fs::create_dir(root.join(READY_DIRECTORY)).expect("ready");
            File::create(root.join(OPERATION_LOCK_FILE)).expect("lock");
            let root = fs::canonicalize(root).expect("canonical fixture");
            let store = DeveloperArtifactStore::open(DeveloperArtifactStoreConfig {
                store_root: root.clone(),
            })
            .expect("store opens");
            Self { root, store }
        }
    }

    impl Drop for StoreFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn sha256(bytes: &[u8]) -> String {
        encode_hex(&Sha256::digest(bytes))
    }

    fn active_registry(key: &SigningKey) -> DeveloperTrustRegistry {
        let empty = match DeveloperTrustRegistry::load(
            &DeveloperTrustRegistry::empty_json_bytes().expect("empty registry"),
            &ProtectedDeveloperTrustState::uninitialized(),
        )
        .expect("empty loads")
        {
            DeveloperTrustLoad::Active(registry) => registry,
            DeveloperTrustLoad::ProtectionCommitRequired(_) => panic!("empty must be active"),
        };
        let pending = empty
            .pair_after_local_confirmation(*key.verifying_key().as_bytes())
            .expect("pair");
        match DeveloperTrustRegistry::load(pending.registry_bytes(), pending.next_protected_state())
            .expect("paired loads")
        {
            DeveloperTrustLoad::Active(registry) => registry,
            DeveloperTrustLoad::ProtectionCommitRequired(_) => panic!("pair must be active"),
        }
    }

    fn authorized_operation(
        request_id: &str,
        operation: DeveloperOperation,
    ) -> (DeveloperSessionAuthority, AuthorizedDeveloperOperation) {
        let key = SigningKey::from_bytes(&[71; 32]);
        let registry = active_registry(&key);
        let workstation_id = registry
            .workstation_ids()
            .next()
            .expect("workstation")
            .to_owned();
        let mut authority =
            DeveloperSessionAuthority::new_after_local_confirmation(registry, [72; 32], 100, 1_000)
                .expect("authority");
        let challenge = authority
            .begin_challenge(&workstation_id, [73; 32], 110, 200)
            .expect("challenge");
        let capability = authority
            .authenticate(
                &challenge,
                key.sign(&challenge.signing_message()).to_bytes(),
                120,
            )
            .expect("authenticate");
        let operation = authority
            .authorize_operation(
                &capability,
                DeveloperOperationRequest::new(request_id, operation).expect("request"),
                130,
            )
            .expect("authorize");
        (authority, operation)
    }

    fn authorized_push(
        request_id: &str,
        deployment_id: &str,
        bytes: &[u8],
    ) -> (DeveloperSessionAuthority, AuthorizedDeveloperOperation) {
        authorized_operation(
            request_id,
            DeveloperOperation::Push {
                deployment_id: deployment_id.to_owned(),
                artifact_sha256: sha256(bytes),
                artifact_bytes: u64::try_from(bytes.len()).expect("fixture length"),
            },
        )
    }

    #[test]
    fn publishes_exact_authorized_bytes_and_revalidates_a_retained_handle() {
        let fixture = StoreFixture::new();
        let bytes = b"exact developer artifact";
        let (_authority, operation) = authorized_push("request-1", "build-1", bytes);
        let mut ready = fixture
            .store
            .publish_authorized_push(operation, &mut Cursor::new(bytes), || 130)
            .expect("artifact publishes");
        assert_eq!(ready.request_id(), "request-1");
        assert_eq!(ready.deployment_id(), "build-1");
        assert_eq!(ready.artifact_sha256(), sha256(bytes));
        assert_eq!(ready.artifact_bytes(), bytes.len() as u64);
        assert_eq!(ready.session_ordinal(), 1);
        assert!(ready.workstation_id().starts_with("workstation-"));
        let mut actual = Vec::new();
        ready
            .reader()
            .expect("reader")
            .read_to_end(&mut actual)
            .expect("read retained");
        assert_eq!(actual, bytes);

        let mut reloaded = fixture
            .store
            .load_ready("request-1")
            .expect("artifact reloads");
        actual.clear();
        reloaded
            .reader()
            .expect("reader")
            .read_to_end(&mut actual)
            .expect("read reloaded");
        assert_eq!(actual, bytes);
    }

    #[test]
    fn rejects_non_push_authority_before_store_mutation() {
        let fixture = StoreFixture::new();
        let (_authority, operation) = authorized_operation(
            "request-launch",
            DeveloperOperation::Launch {
                deployment_id: "build-1".to_owned(),
            },
        );
        assert!(matches!(
            fixture
                .store
                .publish_authorized_push(operation, &mut Cursor::new(b"unused"), || 130),
            Err(DeveloperArtifactError::PushAuthorityRequired)
        ));
        assert!(fixture.store.staging_entries().expect("staging").is_empty());
        assert!(fixture.store.ready_entries().expect("ready").is_empty());
    }

    #[test]
    fn short_long_and_changed_sources_never_publish_and_require_recovery() {
        for (ordinal, declared, actual) in [
            (1, b"declared".as_slice(), b"short".as_slice()),
            (2, b"short".as_slice(), b"longer".as_slice()),
            (3, b"declared".as_slice(), b"changed!".as_slice()),
        ] {
            let fixture = StoreFixture::new();
            let request_id = format!("request-{ordinal}");
            let (_authority, operation) = authorized_push(&request_id, "build-1", declared);
            let result =
                fixture
                    .store
                    .publish_authorized_push(operation, &mut Cursor::new(actual), || 130);
            assert!(matches!(
                result,
                Err(DeveloperArtifactError::ArtifactLengthMismatch { .. }
                    | DeveloperArtifactError::ArtifactDigestMismatch)
            ));
            assert!(fixture.store.ready_entries().expect("ready").is_empty());
            assert!(matches!(
                {
                    let (_next_authority, next_operation) =
                        authorized_push("request-next", "build-2", b"next");
                    fixture.store.publish_authorized_push(
                        next_operation,
                        &mut Cursor::new(b"next"),
                        || 130,
                    )
                },
                Err(DeveloperArtifactError::RecoveryRequired)
            ));
            assert_eq!(fixture.store.recover_incomplete().expect("recover"), 1);
            assert!(fixture.store.staging_entries().expect("staging").is_empty());
        }
    }

    #[test]
    fn durable_request_identity_rejects_cross_session_replay() {
        let fixture = StoreFixture::new();
        let bytes = b"developer build";
        let (_authority, operation) = authorized_push("request-replay", "build-1", bytes);
        fixture
            .store
            .publish_authorized_push(operation, &mut Cursor::new(bytes), || 130)
            .expect("first push");
        let (_replay_authority, replay_operation) =
            authorized_push("request-replay", "build-2", b"other");
        assert!(matches!(
            fixture.store.publish_authorized_push(
                replay_operation,
                &mut Cursor::new(b"other"),
                || 130,
            ),
            Err(DeveloperArtifactError::DuplicateRequest(_))
        ));
    }

    #[test]
    fn chunked_transfer_retries_only_an_uncommitted_chunk() {
        let fixture = StoreFixture::new();
        let bytes = b"retryable developer build";
        let (_authority, operation) = authorized_push("request-chunks", "build-1", bytes);
        let mut transfer = fixture
            .store
            .begin_authorized_push(operation, 130)
            .expect("transfer begins");
        assert_eq!(transfer.request_id(), "request-chunks");
        assert_eq!(transfer.deployment_id(), "build-1");
        assert_eq!(transfer.expected_bytes(), bytes.len() as u64);
        assert_eq!(transfer.received_bytes(), 0);

        let operation_lock = OpenOptions::new()
            .read(true)
            .write(true)
            .open(fixture.root.join(OPERATION_LOCK_FILE))
            .expect("lock file");
        fs4::FileExt::try_lock(&operation_lock).expect("hold operation lock");
        assert!(matches!(
            fixture
                .store
                .append_authorized_push(&mut transfer, &bytes[..9], 140),
            Err(DeveloperArtifactError::Busy)
        ));
        assert_eq!(transfer.received_bytes(), 0);
        fs4::FileExt::unlock(&operation_lock).expect("release operation lock");

        assert_eq!(
            fixture
                .store
                .append_authorized_push(&mut transfer, &bytes[..9], 141)
                .expect("retry succeeds"),
            9
        );
        assert_eq!(
            fixture
                .store
                .append_authorized_push(&mut transfer, &bytes[9..], 142)
                .expect("remainder succeeds"),
            bytes.len() as u64
        );
        let mut ready = fixture
            .store
            .finalize_authorized_push(transfer, 143)
            .expect("complete transfer publishes");
        let mut actual = Vec::new();
        ready
            .reader()
            .expect("ready reader")
            .read_to_end(&mut actual)
            .expect("read ready");
        assert_eq!(actual, bytes);
    }

    #[test]
    fn session_close_drop_and_expiry_stop_incomplete_transfers() {
        for mode in ["close", "drop", "expiry"] {
            let fixture = StoreFixture::new();
            let bytes = b"session-bound build";
            let (mut authority, operation) = authorized_push("request-session", "build-1", bytes);
            let mut transfer = fixture
                .store
                .begin_authorized_push(operation, 130)
                .expect("transfer begins");
            fixture
                .store
                .append_authorized_push(&mut transfer, &bytes[..7], 140)
                .expect("first chunk");
            let next_time = match mode {
                "close" => {
                    authority.close();
                    141
                }
                "drop" => {
                    drop(authority);
                    141
                }
                "expiry" => 1_000,
                _ => unreachable!(),
            };
            assert!(matches!(
                fixture
                    .store
                    .append_authorized_push(&mut transfer, &bytes[7..], next_time),
                Err(DeveloperArtifactError::SessionInactive)
            ));
            assert_eq!(transfer.received_bytes(), 7);
            assert!(fixture.store.ready_entries().expect("ready").is_empty());
            fixture
                .store
                .cancel_authorized_push(transfer)
                .expect("inactive transfer cancels");
            assert!(fixture.store.staging_entries().expect("staging").is_empty());
        }
    }

    #[test]
    fn session_must_remain_live_through_atomic_publication() {
        let fixture = StoreFixture::new();
        let bytes = b"complete but not published";
        let (mut authority, operation) =
            authorized_push("request-close-finalize", "build-1", bytes);
        let mut transfer = fixture
            .store
            .begin_authorized_push(operation, 130)
            .expect("transfer begins");
        fixture
            .store
            .append_authorized_push(&mut transfer, bytes, 140)
            .expect("complete bytes");
        authority.close();
        assert!(matches!(
            fixture.store.finalize_authorized_push(transfer, 141),
            Err(DeveloperArtifactError::SessionInactive)
        ));
        assert!(fixture.store.ready_entries().expect("ready").is_empty());
        assert_eq!(fixture.store.recover_incomplete().expect("recover"), 1);
    }

    #[test]
    fn chunk_bounds_overrun_and_store_binding_fail_before_writing() {
        let fixture = StoreFixture::new();
        let other = StoreFixture::new();
        let bytes = b"bounded";
        let (_authority, operation) = authorized_push("request-bounds", "build-1", bytes);
        let mut transfer = fixture
            .store
            .begin_authorized_push(operation, 130)
            .expect("transfer begins");
        assert!(matches!(
            other.store.append_authorized_push(&mut transfer, b"x", 131),
            Err(DeveloperArtifactError::TransferStoreMismatch)
        ));
        assert!(matches!(
            fixture
                .store
                .append_authorized_push(&mut transfer, b"", 132),
            Err(DeveloperArtifactError::EmptyChunk)
        ));
        assert!(matches!(
            fixture.store.append_authorized_push(
                &mut transfer,
                &vec![0; MAX_DEVELOPER_TRANSFER_CHUNK_BYTES + 1],
                133
            ),
            Err(DeveloperArtifactError::ChunkTooLarge { .. })
        ));
        assert!(matches!(
            fixture
                .store
                .append_authorized_push(&mut transfer, b"bounded-overrun", 134),
            Err(DeveloperArtifactError::ArtifactLengthMismatch { .. })
        ));
        assert_eq!(transfer.received_bytes(), 0);
        fixture
            .store
            .append_authorized_push(&mut transfer, bytes, 135)
            .expect("valid chunk remains usable");
        fixture
            .store
            .finalize_authorized_push(transfer, 136)
            .expect("valid transfer publishes");
    }

    #[test]
    fn wrong_complete_digest_remains_inert_until_recovery() {
        let fixture = StoreFixture::new();
        let declared = b"declared";
        let changed = b"changed!";
        let (_authority, operation) = authorized_push("request-digest", "build-1", declared);
        let mut transfer = fixture
            .store
            .begin_authorized_push(operation, 130)
            .expect("transfer begins");
        fixture
            .store
            .append_authorized_push(&mut transfer, changed, 131)
            .expect("same-length changed bytes append");
        assert!(matches!(
            fixture.store.finalize_authorized_push(transfer, 132),
            Err(DeveloperArtifactError::ArtifactDigestMismatch)
        ));
        assert!(fixture.store.ready_entries().expect("ready").is_empty());
        assert_eq!(fixture.store.recover_incomplete().expect("recover"), 1);
    }

    #[test]
    fn explicit_cancellation_removes_only_its_bound_incomplete_receipt() {
        let fixture = StoreFixture::new();
        let bytes = b"cancel this transfer";
        let (_authority, operation) = authorized_push("request-cancel", "build-1", bytes);
        let mut transfer = fixture
            .store
            .begin_authorized_push(operation, 130)
            .expect("transfer begins");
        fixture
            .store
            .append_authorized_push(&mut transfer, &bytes[..6], 131)
            .expect("partial bytes");
        fixture
            .store
            .cancel_authorized_push(transfer)
            .expect("exact cancellation");
        assert!(fixture.store.staging_entries().expect("staging").is_empty());
        assert!(fixture.store.ready_entries().expect("ready").is_empty());
    }

    #[test]
    fn dropped_transfer_is_never_resumed_from_writable_staging() {
        let fixture = StoreFixture::new();
        let bytes = b"restart boundary";
        let (_authority, operation) = authorized_push("request-dropped", "build-1", bytes);
        let mut transfer = fixture
            .store
            .begin_authorized_push(operation, 130)
            .expect("transfer begins");
        fixture
            .store
            .append_authorized_push(&mut transfer, &bytes[..7], 131)
            .expect("partial bytes");
        drop(transfer);

        let (_next_authority, next_operation) = authorized_push("request-next", "build-2", b"next");
        assert!(matches!(
            fixture.store.begin_authorized_push(next_operation, 132),
            Err(DeveloperArtifactError::RecoveryRequired)
        ));
        assert_eq!(fixture.store.recover_incomplete().expect("recover"), 1);
        assert!(fixture.store.staging_entries().expect("staging").is_empty());
    }

    #[test]
    fn changed_artifact_receipt_or_extra_ready_file_fails_closed() {
        for mutation in ["artifact", "receipt", "extra"] {
            let fixture = StoreFixture::new();
            let bytes = b"developer build";
            let (_authority, operation) = authorized_push("request-tamper", "build-1", bytes);
            fixture
                .store
                .publish_authorized_push(operation, &mut Cursor::new(bytes), || 130)
                .expect("push");
            let ready = fixture.root.join(READY_DIRECTORY).join("request-tamper");
            match mutation {
                "artifact" => fs::write(ready.join(ARTIFACT_FILE), b"changed content")
                    .expect("change artifact"),
                "receipt" => {
                    let mut receipt =
                        fs::read_to_string(ready.join(RECEIPT_FILE)).expect("receipt");
                    receipt.push(' ');
                    fs::write(ready.join(RECEIPT_FILE), receipt).expect("change receipt");
                }
                "extra" => {
                    fs::write(ready.join("secret.txt"), b"unexpected").expect("extra file");
                }
                _ => unreachable!(),
            }
            assert!(fixture.store.load_ready("request-tamper").is_err());
        }
    }

    #[test]
    fn operation_lock_is_nonblocking() {
        let fixture = StoreFixture::new();
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .open(fixture.root.join(OPERATION_LOCK_FILE))
            .expect("lock file");
        fs4::FileExt::try_lock(&lock).expect("take lock");
        assert!(matches!(
            fixture.store.load_ready("request-missing"),
            Err(DeveloperArtifactError::Busy)
        ));
        fs4::FileExt::unlock(&lock).expect("unlock");
    }

    #[test]
    fn open_requires_absolute_preprovisioned_direct_real_components() {
        assert!(
            DeveloperArtifactStore::open(DeveloperArtifactStoreConfig {
                store_root: PathBuf::from("relative")
            })
            .is_err()
        );
        let fixture = StoreFixture::new();
        fs::remove_file(fixture.root.join(OPERATION_LOCK_FILE)).expect("remove lock");
        fs::create_dir(fixture.root.join(OPERATION_LOCK_FILE)).expect("wrong-kind lock");
        assert!(
            DeveloperArtifactStore::open(DeveloperArtifactStoreConfig {
                store_root: fixture.root.clone()
            })
            .is_err()
        );
    }

    #[test]
    fn recovery_refuses_unknown_files_and_removes_only_valid_incomplete_state() {
        let fixture = StoreFixture::new();
        let staging = fixture.root.join(STAGING_DIRECTORY);
        let valid = staging.join("request-incomplete");
        fs::create_dir(&valid).expect("incomplete");
        fs::write(valid.join(RECEIPT_FILE), b"partial").expect("partial receipt");
        fs::write(staging.join("foreign-file"), b"unsafe").expect("foreign");
        assert!(fixture.store.recover_incomplete().is_err());
        assert!(valid.exists());
        fs::remove_file(staging.join("foreign-file")).expect("remove foreign");
        assert_eq!(fixture.store.recover_incomplete().expect("recover"), 1);
        assert!(!valid.exists());
    }
}
