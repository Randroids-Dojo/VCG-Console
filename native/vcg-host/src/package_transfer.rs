//! Durable, resumable receipt of one signature-authorized package archive.

use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};

use crate::package_intake::{PackageArchiveFormat, PackageIntakeError, VerifiedPackageRelease};

const TRANSFER_SCHEMA_VERSION: u32 = 1;
const TRANSFER_CLEANUP_SCHEMA_VERSION: u32 = 1;
const MAX_STATE_BYTES: u64 = 1_024;
const MAX_CHUNK_BYTES: usize = 8 * 1_024 * 1_024;

/// Current durable archive-receipt progress.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageTransferProgress {
    pub received_bytes: u64,
    pub expected_bytes: u64,
    pub complete: bool,
}

/// Result of accepting or replaying one transfer chunk.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageTransferAppend {
    pub received_bytes: u64,
    pub complete: bool,
    pub replayed: bool,
}

/// Explicit lifecycle reason for removing a durable transfer receipt.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PackageTransferCleanupKind {
    AbandonedPartial,
    ConsumedReady,
}

/// Path-free result of one explicit transfer cleanup.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageTransferCleanup {
    pub kind: PackageTransferCleanupKind,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PackageReleaseIdentity {
    generation: u64,
    archive_format: String,
    archive_sha256: String,
    archive_size_bytes: u64,
    expanded_size_bytes: u64,
    expanded_file_count: u64,
    catalog_sha256: String,
    catalog_size_bytes: u64,
}

impl PackageReleaseIdentity {
    pub(crate) fn for_release(release: &VerifiedPackageRelease) -> Self {
        Self {
            generation: release.generation(),
            archive_format: match release.archive_format() {
                PackageArchiveFormat::Tar => "tar",
                PackageArchiveFormat::TarZstd => "tar-zstd",
            }
            .to_owned(),
            archive_sha256: encode_hex(&release.archive_sha256()),
            archive_size_bytes: release.archive_size_bytes(),
            expanded_size_bytes: release.expanded_size_bytes(),
            expanded_file_count: release.expanded_file_count(),
            catalog_sha256: encode_hex(&release.catalog_sha256()),
            catalog_size_bytes: release.catalog_size_bytes(),
        }
    }

    pub(crate) fn generation(&self) -> u64 {
        self.generation
    }

    pub(crate) fn catalog_sha256(&self) -> &str {
        &self.catalog_sha256
    }
}

/// Exclusive receiver for one package archive transaction.
#[derive(Debug)]
pub struct PackageArchiveTransfer {
    root: PathBuf,
    transaction_id: String,
    state_path: PathBuf,
    partial_path: PathBuf,
    ready_path: PathBuf,
    cleanup_path: PathBuf,
    release: VerifiedPackageRelease,
    reserve_bytes: u64,
    _lock: File,
}

impl PackageArchiveTransfer {
    /// Opens or begins one transfer bound to an already verified release.
    ///
    /// One nonblocking filesystem lock serializes the transaction. The
    /// immutable state record binds generation, exact archive length, and
    /// SHA-256. Receipt progress is the synchronized partial file length, so
    /// no mutable counter can advance ahead of durable bytes.
    ///
    /// If a verified ready archive already exists, this method completes
    /// interrupted post-publication cleanup before returning.
    ///
    /// # Errors
    ///
    /// Rejects unsafe roots/IDs, lock contention, changed release bindings,
    /// orphaned or unsafe state, oversized partial files, and invalid ready
    /// archives.
    pub fn open_or_begin(
        transfer_root: &Path,
        transaction_id: &str,
        release: &VerifiedPackageRelease,
        reserve_bytes: u64,
    ) -> Result<Self, PackageTransferError> {
        validate_transaction_id(transaction_id)?;
        if reserve_bytes == 0 {
            return Err(PackageIntakeError::InvalidReserve.into());
        }
        let root = canonical_directory("package transfer root", transfer_root)?;
        let state_path = root.join(format!(".transfer-{transaction_id}.json"));
        let partial_path = root.join(format!(".transfer-{transaction_id}.part"));
        let ready_path = root.join(format!("ready-{transaction_id}.archive"));
        let cleanup_path = root.join(format!(".transfer-{transaction_id}.cleanup.json"));
        let lock_path = root.join(format!(".transfer-{transaction_id}.lock"));
        let lock = open_lock_file(&lock_path)?;
        match fs4::FileExt::try_lock(&lock) {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => {
                return Err(PackageTransferError::Busy(transaction_id.to_owned()));
            }
            Err(TryLockError::Error(source)) => {
                return Err(PackageTransferError::Io {
                    operation: "lock package transfer",
                    path: lock_path,
                    source,
                });
            }
        }

        let receiver = Self {
            root,
            transaction_id: transaction_id.to_owned(),
            state_path,
            partial_path,
            ready_path,
            cleanup_path,
            release: release.clone(),
            reserve_bytes,
            _lock: lock,
        };
        if receiver.recover_cleanup()?.is_some() {
            return Err(PackageTransferError::CleanupRecovered(
                transaction_id.to_owned(),
            ));
        }
        receiver.initialize()?;
        let durable_received = receiver.progress()?.received_bytes;
        receiver.release.admit_remaining_transfer_capacity_at(
            &receiver.root,
            durable_received,
            reserve_bytes,
        )?;
        Ok(receiver)
    }

    /// Returns the bounded transaction identifier owned by this receiver.
    #[must_use]
    pub fn transaction_id(&self) -> &str {
        &self.transaction_id
    }

    /// Explicitly removes a closed transfer's incomplete archive and binding.
    ///
    /// The receiver's exclusive lock remains held throughout the operation.
    /// A durable cleanup intent makes interruption recoverable on the next
    /// open. A verified ready archive is never eligible for this operation.
    ///
    /// # Errors
    ///
    /// Rejects changed bindings, a published ready archive, unsafe files, or
    /// persistence failures.
    pub fn discard_abandoned(self) -> Result<PackageTransferCleanup, PackageTransferError> {
        self.verify_binding()?;
        if path_exists(&self.ready_path)? {
            return Err(PackageTransferError::CleanupStateMismatch(
                "a ready archive is not an abandoned partial".to_owned(),
            ));
        }
        require_regular_file(&self.partial_path, "partial package archive")?;
        let received = file_length(&self.partial_path)?;
        if received > self.release.archive_size_bytes() {
            return Err(PackageTransferError::PartialTooLarge {
                actual_bytes: received,
                expected_bytes: self.release.archive_size_bytes(),
            });
        }
        self.begin_cleanup(PackageTransferCleanupKind::AbandonedPartial)?;
        self.finish_cleanup(PackageTransferCleanupKind::AbandonedPartial)?;
        Ok(PackageTransferCleanup {
            kind: PackageTransferCleanupKind::AbandonedPartial,
        })
    }

    pub(crate) fn release_identity(&self) -> PackageReleaseIdentity {
        PackageReleaseIdentity::for_release(&self.release)
    }

    pub(crate) fn remove_consumed_ready(
        self,
    ) -> Result<PackageTransferCleanup, PackageTransferError> {
        self.verify_binding()?;
        if !path_exists(&self.ready_path)? {
            return Err(PackageTransferError::NotReady);
        }
        require_regular_file(&self.ready_path, "ready package archive")?;
        self.release.verify_archive(&self.ready_path)?;
        self.cleanup_published_partial()?;
        self.begin_cleanup(PackageTransferCleanupKind::ConsumedReady)?;
        self.finish_cleanup(PackageTransferCleanupKind::ConsumedReady)?;
        Ok(PackageTransferCleanup {
            kind: PackageTransferCleanupKind::ConsumedReady,
        })
    }

    /// Returns the ready archive only when it remains bound to the supplied
    /// verified release.
    ///
    /// The receiver keeps its transaction lock while the returned path is
    /// used. Callers must not retain the path after dropping the receiver.
    /// This method never finalizes a complete partial transfer implicitly.
    ///
    /// # Errors
    ///
    /// Rejects a changed/missing binding, a release mismatch, an incomplete
    /// or unpublished transfer, an unsafe ready path, or changed archive
    /// bytes.
    pub fn ready_archive_for(
        &self,
        release: &VerifiedPackageRelease,
    ) -> Result<PathBuf, PackageTransferError> {
        require_regular_file(&self.state_path, "package transfer state")?;
        let actual = read_state(&self.state_path)?;
        let receiver_binding = TransferBinding::for_release(&self.transaction_id, &self.release);
        let requested_binding = TransferBinding::for_release(&self.transaction_id, release);
        if actual != receiver_binding || actual != requested_binding {
            return Err(PackageTransferError::BindingMismatch);
        }
        if !path_exists(&self.ready_path)? {
            return Err(PackageTransferError::NotReady);
        }
        require_regular_file(&self.ready_path, "ready package archive")?;
        release.verify_archive(&self.ready_path)?;
        Ok(self.ready_path.clone())
    }

    /// Returns current progress from the durable archive file length.
    ///
    /// # Errors
    ///
    /// Rejects unsafe/missing partial state or an invalid ready archive.
    pub fn progress(&self) -> Result<PackageTransferProgress, PackageTransferError> {
        self.verify_binding()?;
        if path_exists(&self.ready_path)? {
            require_regular_file(&self.ready_path, "ready package archive")?;
            self.release.verify_archive(&self.ready_path)?;
            return Ok(PackageTransferProgress {
                received_bytes: self.release.archive_size_bytes(),
                expected_bytes: self.release.archive_size_bytes(),
                complete: true,
            });
        }
        require_regular_file(&self.partial_path, "partial package archive")?;
        let received_bytes = file_length(&self.partial_path)?;
        if received_bytes > self.release.archive_size_bytes() {
            return Err(PackageTransferError::PartialTooLarge {
                actual_bytes: received_bytes,
                expected_bytes: self.release.archive_size_bytes(),
            });
        }
        Ok(PackageTransferProgress {
            received_bytes,
            expected_bytes: self.release.archive_size_bytes(),
            complete: received_bytes == self.release.archive_size_bytes(),
        })
    }

    /// Appends one exact bounded chunk or accepts an identical completed
    /// replay.
    ///
    /// A new chunk must begin at the current durable length. A wholly received
    /// replay is accepted only if every byte matches. Gaps, partial overlap,
    /// conflicting replay, empty/oversized chunks, and writes beyond the
    /// signed archive length fail closed.
    ///
    /// # Errors
    ///
    /// Rejects invalid chunks/offsets, completed transfers, unsafe files, and
    /// I/O failures.
    pub fn append(
        &self,
        offset: u64,
        bytes: &[u8],
    ) -> Result<PackageTransferAppend, PackageTransferError> {
        self.verify_binding()?;
        if bytes.is_empty() || bytes.len() > MAX_CHUNK_BYTES {
            return Err(PackageTransferError::InvalidChunkLength(bytes.len()));
        }
        let chunk_bytes =
            u64::try_from(bytes.len()).map_err(|_| PackageTransferError::ArchiveLengthExceeded)?;
        if path_exists(&self.ready_path)? {
            return Err(PackageTransferError::AlreadyComplete);
        }
        require_regular_file(&self.partial_path, "partial package archive")?;
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&self.partial_path)
            .map_err(|source| PackageTransferError::Io {
                operation: "open partial package archive",
                path: self.partial_path.clone(),
                source,
            })?;
        let received = file
            .metadata()
            .map_err(|source| PackageTransferError::Io {
                operation: "inspect partial package archive",
                path: self.partial_path.clone(),
                source,
            })?
            .len();
        if received > self.release.archive_size_bytes() {
            return Err(PackageTransferError::PartialTooLarge {
                actual_bytes: received,
                expected_bytes: self.release.archive_size_bytes(),
            });
        }

        if offset < received {
            return self.verify_replay(&mut file, offset, bytes, chunk_bytes, received);
        }
        if offset != received {
            return Err(PackageTransferError::OffsetMismatch {
                expected: received,
                actual: offset,
            });
        }
        let next = received
            .checked_add(chunk_bytes)
            .ok_or(PackageTransferError::ArchiveLengthExceeded)?;
        if next > self.release.archive_size_bytes() {
            return Err(PackageTransferError::ArchiveLengthExceeded);
        }
        self.release.admit_remaining_transfer_capacity_at(
            &self.root,
            received,
            self.reserve_bytes,
        )?;
        file.seek(SeekFrom::End(0))
            .and_then(|_| file.write_all(bytes))
            .and_then(|()| file.sync_all())
            .map_err(|source| PackageTransferError::Io {
                operation: "persist package archive chunk",
                path: self.partial_path.clone(),
                source,
            })?;
        Ok(PackageTransferAppend {
            received_bytes: next,
            complete: next == self.release.archive_size_bytes(),
            replayed: false,
        })
    }

    fn verify_replay(
        &self,
        file: &mut File,
        offset: u64,
        bytes: &[u8],
        chunk_bytes: u64,
        received: u64,
    ) -> Result<PackageTransferAppend, PackageTransferError> {
        let replay_end = offset
            .checked_add(chunk_bytes)
            .ok_or(PackageTransferError::ArchiveLengthExceeded)?;
        if replay_end > received {
            return Err(PackageTransferError::OffsetMismatch {
                expected: received,
                actual: offset,
            });
        }
        file.seek(SeekFrom::Start(offset))
            .and_then(|_| {
                let mut existing = vec![0_u8; bytes.len()];
                file.read_exact(&mut existing)?;
                if existing == bytes {
                    Ok(())
                } else {
                    Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "replayed package bytes differ",
                    ))
                }
            })
            .map_err(|source| {
                if source.kind() == io::ErrorKind::InvalidData {
                    PackageTransferError::ReplayMismatch { offset }
                } else {
                    PackageTransferError::Io {
                        operation: "verify replayed package chunk",
                        path: self.partial_path.clone(),
                        source,
                    }
                }
            })?;
        Ok(PackageTransferAppend {
            received_bytes: received,
            complete: received == self.release.archive_size_bytes(),
            replayed: true,
        })
    }

    /// Verifies and publishes the complete archive under a no-replace ready
    /// name.
    ///
    /// Publication is a same-filesystem hard link. Recovery verifies the
    /// already-published ready name and its retained immutable binding before
    /// removing the partial name, making interruption on either side
    /// deterministic.
    ///
    /// # Errors
    ///
    /// Rejects incomplete or changed archives, conflicting ready names,
    /// unsafe files, and persistence failures.
    pub fn finalize(&self) -> Result<PathBuf, PackageTransferError> {
        self.verify_binding()?;
        if path_exists(&self.ready_path)? {
            self.release.verify_archive(&self.ready_path)?;
            self.cleanup_published_partial()?;
            return Ok(self.ready_path.clone());
        }
        let progress = self.progress()?;
        if !progress.complete {
            return Err(PackageTransferError::Incomplete {
                received_bytes: progress.received_bytes,
                expected_bytes: progress.expected_bytes,
            });
        }
        self.release.verify_archive(&self.partial_path)?;
        fs::hard_link(&self.partial_path, &self.ready_path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                PackageTransferError::ReadyExists
            } else {
                PackageTransferError::Io {
                    operation: "publish ready package archive",
                    path: self.ready_path.clone(),
                    source,
                }
            }
        })?;
        sync_directory(&self.root)?;
        self.cleanup_published_partial()?;
        Ok(self.ready_path.clone())
    }

    fn initialize(&self) -> Result<(), PackageTransferError> {
        if path_exists(&self.ready_path)? {
            require_regular_file(&self.ready_path, "ready package archive")?;
            self.release.verify_archive(&self.ready_path)?;
            if !path_exists(&self.state_path)? {
                return Err(PackageTransferError::OrphanReady(self.ready_path.clone()));
            }
            self.verify_binding()?;
            self.cleanup_published_partial()?;
            return Ok(());
        }

        if path_exists(&self.state_path)? {
            self.verify_binding()?;
        } else {
            if path_exists(&self.partial_path)? {
                return Err(PackageTransferError::OrphanPartial(
                    self.partial_path.clone(),
                ));
            }
            write_state(
                &self.state_path,
                &TransferBinding::for_release(&self.transaction_id, &self.release),
            )?;
            sync_directory(&self.root)?;
        }

        if path_exists(&self.partial_path)? {
            require_regular_file(&self.partial_path, "partial package archive")?;
        } else {
            create_empty_file(&self.partial_path, "create partial package archive")?;
            sync_directory(&self.root)?;
        }
        let received = file_length(&self.partial_path)?;
        if received > self.release.archive_size_bytes() {
            return Err(PackageTransferError::PartialTooLarge {
                actual_bytes: received,
                expected_bytes: self.release.archive_size_bytes(),
            });
        }
        Ok(())
    }

    fn verify_binding(&self) -> Result<(), PackageTransferError> {
        require_regular_file(&self.state_path, "package transfer state")?;
        let actual = read_state(&self.state_path)?;
        let expected = TransferBinding::for_release(&self.transaction_id, &self.release);
        if actual == expected {
            Ok(())
        } else {
            Err(PackageTransferError::BindingMismatch)
        }
    }

    fn cleanup_published_partial(&self) -> Result<(), PackageTransferError> {
        if path_exists(&self.partial_path)? {
            require_regular_file(&self.partial_path, "partial package archive")?;
            fs::remove_file(&self.partial_path).map_err(|source| PackageTransferError::Io {
                operation: "remove completed partial package archive",
                path: self.partial_path.clone(),
                source,
            })?;
        }
        sync_directory(&self.root)
    }

    fn begin_cleanup(&self, kind: PackageTransferCleanupKind) -> Result<(), PackageTransferError> {
        let intent = TransferCleanupIntent {
            schema_version: TRANSFER_CLEANUP_SCHEMA_VERSION,
            kind,
            binding: TransferBinding::for_release(&self.transaction_id, &self.release),
        };
        write_cleanup_intent(&self.cleanup_path, &intent)?;
        sync_directory(&self.root)
    }

    fn recover_cleanup(&self) -> Result<Option<PackageTransferCleanupKind>, PackageTransferError> {
        if !path_exists(&self.cleanup_path)? {
            return Ok(None);
        }
        require_regular_file(&self.cleanup_path, "package transfer cleanup intent")?;
        let intent = read_cleanup_intent(&self.cleanup_path)?;
        if intent.binding.transaction_id != self.transaction_id {
            return Err(PackageTransferError::CleanupStateMismatch(
                "cleanup transaction does not match its filename".to_owned(),
            ));
        }
        if path_exists(&self.state_path)? {
            require_regular_file(&self.state_path, "package transfer state")?;
            if read_state(&self.state_path)? != intent.binding {
                return Err(PackageTransferError::CleanupStateMismatch(
                    "cleanup intent does not match transfer binding".to_owned(),
                ));
            }
        }
        self.finish_cleanup(intent.kind)?;
        Ok(Some(intent.kind))
    }

    fn finish_cleanup(&self, kind: PackageTransferCleanupKind) -> Result<(), PackageTransferError> {
        if kind == PackageTransferCleanupKind::AbandonedPartial && path_exists(&self.ready_path)? {
            return Err(PackageTransferError::CleanupStateMismatch(
                "abandoned cleanup found a ready archive".to_owned(),
            ));
        }
        for (path, file_kind) in [
            (&self.partial_path, "partial package archive"),
            (&self.ready_path, "ready package archive"),
            (&self.state_path, "package transfer state"),
        ] {
            if path_exists(path)? {
                require_regular_file(path, file_kind)?;
                fs::remove_file(path).map_err(|source| PackageTransferError::Io {
                    operation: "remove package transfer cleanup target",
                    path: path.clone(),
                    source,
                })?;
            }
        }
        sync_directory(&self.root)?;
        fs::remove_file(&self.cleanup_path).map_err(|source| PackageTransferError::Io {
            operation: "remove package transfer cleanup intent",
            path: self.cleanup_path.clone(),
            source,
        })?;
        sync_directory(&self.root)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TransferBinding {
    schema_version: u32,
    transaction_id: String,
    generation: u64,
    archive_sha256: String,
    archive_size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TransferCleanupIntent {
    schema_version: u32,
    kind: PackageTransferCleanupKind,
    binding: TransferBinding,
}

impl TransferBinding {
    fn for_release(transaction_id: &str, release: &VerifiedPackageRelease) -> Self {
        Self {
            schema_version: TRANSFER_SCHEMA_VERSION,
            transaction_id: transaction_id.to_owned(),
            generation: release.generation(),
            archive_sha256: encode_hex(&release.archive_sha256()),
            archive_size_bytes: release.archive_size_bytes(),
        }
    }
}

fn validate_transaction_id(value: &str) -> Result<(), PackageTransferError> {
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
        Err(PackageTransferError::InvalidTransactionId(value.to_owned()))
    }
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, PackageTransferError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(PackageTransferError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| PackageTransferError::Io {
        operation: "inspect package transfer directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() {
        return Err(PackageTransferError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    fs::canonicalize(path).map_err(|source| PackageTransferError::Io {
        operation: "resolve package transfer directory",
        path: path.to_owned(),
        source,
    })
}

fn open_lock_file(path: &Path) -> Result<File, PackageTransferError> {
    if path_exists(path)? {
        require_regular_file(path, "package transfer lock")?;
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|source| PackageTransferError::Io {
            operation: "open package transfer lock",
            path: path.to_owned(),
            source,
        })?;
    let metadata = fs::symlink_metadata(path).map_err(|source| PackageTransferError::Io {
        operation: "inspect package transfer lock",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_file() && file.metadata().is_ok_and(|metadata| metadata.is_file()) {
        Ok(file)
    } else {
        Err(PackageTransferError::UnsafePath {
            kind: "package transfer lock",
            path: path.to_owned(),
        })
    }
}

fn create_empty_file(path: &Path, operation: &'static str) -> Result<(), PackageTransferError> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|source| PackageTransferError::Io {
            operation,
            path: path.to_owned(),
            source,
        })
}

fn write_state(path: &Path, state: &TransferBinding) -> Result<(), PackageTransferError> {
    let bytes = serde_json::to_vec(state)
        .map_err(|error| PackageTransferError::InvalidState(error.to_string()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| PackageTransferError::Io {
            operation: "create package transfer state",
            path: path.to_owned(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| PackageTransferError::Io {
            operation: "persist package transfer state",
            path: path.to_owned(),
            source,
        })
}

fn write_cleanup_intent(
    path: &Path,
    intent: &TransferCleanupIntent,
) -> Result<(), PackageTransferError> {
    let bytes = serde_json::to_vec(intent)
        .map_err(|error| PackageTransferError::InvalidState(error.to_string()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|source| PackageTransferError::Io {
            operation: "create package transfer cleanup intent",
            path: path.to_owned(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| PackageTransferError::Io {
            operation: "persist package transfer cleanup intent",
            path: path.to_owned(),
            source,
        })
}

fn read_state(path: &Path) -> Result<TransferBinding, PackageTransferError> {
    let file = File::open(path).map_err(|source| PackageTransferError::Io {
        operation: "open package transfer state",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_STATE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| PackageTransferError::Io {
            operation: "read package transfer state",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_STATE_BYTES {
        return Err(PackageTransferError::InvalidState(
            "state exceeds size limit".to_owned(),
        ));
    }
    let state: TransferBinding = serde_json::from_slice(&bytes)
        .map_err(|error| PackageTransferError::InvalidState(error.to_string()))?;
    validate_binding(&state)?;
    Ok(state)
}

fn read_cleanup_intent(path: &Path) -> Result<TransferCleanupIntent, PackageTransferError> {
    let file = File::open(path).map_err(|source| PackageTransferError::Io {
        operation: "open package transfer cleanup intent",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_STATE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| PackageTransferError::Io {
            operation: "read package transfer cleanup intent",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_STATE_BYTES {
        return Err(PackageTransferError::InvalidState(
            "cleanup intent exceeds size limit".to_owned(),
        ));
    }
    let intent: TransferCleanupIntent = serde_json::from_slice(&bytes)
        .map_err(|error| PackageTransferError::InvalidState(error.to_string()))?;
    if intent.schema_version != TRANSFER_CLEANUP_SCHEMA_VERSION {
        return Err(PackageTransferError::InvalidState(format!(
            "unsupported cleanup schema {}",
            intent.schema_version
        )));
    }
    validate_binding(&intent.binding)?;
    Ok(intent)
}

fn validate_binding(state: &TransferBinding) -> Result<(), PackageTransferError> {
    validate_transaction_id(&state.transaction_id)?;
    if state.schema_version != TRANSFER_SCHEMA_VERSION {
        return Err(PackageTransferError::InvalidState(format!(
            "unsupported state schema {}",
            state.schema_version
        )));
    }
    if state.generation == 0
        || state.archive_size_bytes == 0
        || state.archive_sha256.len() != 64
        || !state
            .archive_sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(PackageTransferError::InvalidState(
            "state binding is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool, PackageTransferError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(PackageTransferError::Io {
            operation: "inspect package transfer path",
            path: path.to_owned(),
            source,
        }),
    }
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), PackageTransferError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| PackageTransferError::Io {
        operation: "inspect package transfer file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(PackageTransferError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn file_length(path: &Path) -> Result<u64, PackageTransferError> {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .map_err(|source| PackageTransferError::Io {
            operation: "inspect package transfer length",
            path: path.to_owned(),
            source,
        })
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
fn sync_directory(path: &Path) -> Result<(), PackageTransferError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| PackageTransferError::Io {
            operation: "synchronize package transfer directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), PackageTransferError> {
    Ok(())
}

/// Durable package archive transfer failure.
#[derive(Debug)]
pub enum PackageTransferError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    Intake(PackageIntakeError),
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidTransactionId(String),
    Busy(String),
    InvalidState(String),
    BindingMismatch,
    CleanupStateMismatch(String),
    CleanupRecovered(String),
    OrphanPartial(PathBuf),
    OrphanReady(PathBuf),
    PartialTooLarge {
        actual_bytes: u64,
        expected_bytes: u64,
    },
    InvalidChunkLength(usize),
    OffsetMismatch {
        expected: u64,
        actual: u64,
    },
    ReplayMismatch {
        offset: u64,
    },
    ArchiveLengthExceeded,
    AlreadyComplete,
    NotReady,
    Incomplete {
        received_bytes: u64,
        expected_bytes: u64,
    },
    ReadyExists,
}

impl fmt::Display for PackageTransferError {
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
            Self::Intake(error) => write!(formatter, "{error}"),
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidTransactionId(value) => {
                write!(
                    formatter,
                    "package transfer transaction id is invalid: {value}"
                )
            }
            Self::Busy(value) => write!(formatter, "package transfer is already open: {value}"),
            Self::InvalidState(error) => {
                write!(formatter, "package transfer state is invalid: {error}")
            }
            Self::BindingMismatch => {
                formatter.write_str("package transfer state belongs to a different release")
            }
            Self::CleanupStateMismatch(error) => {
                write!(
                    formatter,
                    "package transfer cleanup state is invalid: {error}"
                )
            }
            Self::CleanupRecovered(value) => write!(
                formatter,
                "package transfer cleanup completed during recovery: {value}"
            ),
            Self::OrphanPartial(path) => write!(
                formatter,
                "partial package archive has no signed transfer binding: {}",
                path.display()
            ),
            Self::OrphanReady(path) => write!(
                formatter,
                "ready package archive has no signed transfer binding: {}",
                path.display()
            ),
            Self::PartialTooLarge {
                actual_bytes,
                expected_bytes,
            } => write!(
                formatter,
                "partial package archive is {actual_bytes} bytes but release requires at most {expected_bytes}"
            ),
            Self::InvalidChunkLength(length) => write!(
                formatter,
                "package transfer chunk length {length} is outside 1..={MAX_CHUNK_BYTES}"
            ),
            Self::OffsetMismatch { expected, actual } => write!(
                formatter,
                "package transfer offset {actual} does not match durable offset {expected}"
            ),
            Self::ReplayMismatch { offset } => write!(
                formatter,
                "replayed package transfer bytes differ at offset {offset}"
            ),
            Self::ArchiveLengthExceeded => {
                formatter.write_str("package transfer exceeds signed archive length")
            }
            Self::AlreadyComplete => formatter.write_str("package transfer is already complete"),
            Self::NotReady => {
                formatter.write_str("package transfer has not published a ready archive")
            }
            Self::Incomplete {
                received_bytes,
                expected_bytes,
            } => write!(
                formatter,
                "package transfer has {received_bytes} of {expected_bytes} bytes"
            ),
            Self::ReadyExists => formatter.write_str("ready package archive name already exists"),
        }
    }
}

impl std::error::Error for PackageTransferError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Intake(error) => Some(error),
            _ => None,
        }
    }
}

impl From<PackageIntakeError> for PackageTransferError {
    fn from(error: PackageIntakeError) -> Self {
        Self::Intake(error)
    }
}

#[cfg(test)]
mod adversarial_tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};

    use super::{
        MAX_CHUNK_BYTES, PackageArchiveTransfer, PackageTransferCleanup,
        PackageTransferCleanupKind, PackageTransferError, PackageTransferProgress,
    };
    use crate::package_intake::VerifiedPackageRelease;

    const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-PACKAGE-RELEASE-V1\0";
    static NEXT_TEMP: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
        signing_key: SigningKey,
    }

    impl Fixture {
        fn new() -> Self {
            let unique = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-package-transfer-adversarial-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("fixture root creates");
            Self {
                root,
                signing_key: SigningKey::from_bytes(&[29_u8; 32]),
            }
        }

        fn release(&self, label: &str, generation: u64, archive: &[u8]) -> VerifiedPackageRelease {
            let descriptor_path = self.root.join(format!("{label}.json"));
            let signature_path = self.root.join(format!("{label}.sig"));
            let public_key_path = self.root.join(format!("{label}.pub"));
            let descriptor = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":{},\"target\":\"{}-{}\",",
                    "\"archive\":{{\"format\":\"tar\",\"sha256\":\"{}\",\"sizeBytes\":{}}},",
                    "\"expanded\":{{\"sizeBytes\":1,\"fileCount\":1}},",
                    "\"catalog\":{{\"sha256\":\"{}\",\"sizeBytes\":1}}}}"
                ),
                generation,
                std::env::consts::ARCH,
                std::env::consts::OS,
                encode_hex(&Sha256::digest(archive)),
                archive.len(),
                "11".repeat(32)
            );
            fs::write(&descriptor_path, descriptor.as_bytes()).expect("descriptor writes");
            let mut signed_message = Vec::from(SIGNED_MESSAGE_PREFIX);
            signed_message.extend_from_slice(descriptor.as_bytes());
            let signature = self.signing_key.sign(&signed_message);
            fs::write(&signature_path, encode_hex(&signature.to_bytes()))
                .expect("signature writes");
            fs::write(
                &public_key_path,
                encode_hex(self.signing_key.verifying_key().as_bytes()),
            )
            .expect("public key writes");
            VerifiedPackageRelease::load(&descriptor_path, &signature_path, &public_key_path)
                .expect("release verifies")
        }

        fn transfer_path(&self, transaction_id: &str, suffix: &str) -> PathBuf {
            self.root
                .join(format!(".transfer-{transaction_id}.{suffix}"))
        }

        fn ready_path(&self, transaction_id: &str) -> PathBuf {
            self.root.join(format!("ready-{transaction_id}.archive"))
        }

        fn cleanup_path(&self, transaction_id: &str) -> PathBuf {
            self.transfer_path(transaction_id, "cleanup.json")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn encode_hex(bytes: &[u8]) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut encoded = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            encoded.push(char::from(HEX[usize::from(byte >> 4)]));
            encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
        encoded
    }

    fn open(
        root: &Path,
        transaction_id: &str,
        release: &VerifiedPackageRelease,
    ) -> PackageArchiveTransfer {
        PackageArchiveTransfer::open_or_begin(root, transaction_id, release, 1)
            .expect("transfer opens")
    }

    #[test]
    fn appends_replays_resumes_and_finalizes_exact_archive() {
        let fixture = Fixture::new();
        let archive = b"durable signed package archive bytes";
        let release = fixture.release("release", 7, archive);
        let transaction_id = "download-7";

        let transfer = open(&fixture.root, transaction_id, &release);
        assert_eq!(
            transfer.progress().expect("progress reads"),
            PackageTransferProgress {
                received_bytes: 0,
                expected_bytes: archive.len() as u64,
                complete: false,
            }
        );
        let first = &archive[..11];
        let appended = transfer.append(0, first).expect("first chunk appends");
        assert!(!appended.replayed);
        assert_eq!(appended.received_bytes, 11);
        let replayed = transfer.append(0, first).expect("same replay accepts");
        assert!(replayed.replayed);
        assert_eq!(replayed.received_bytes, 11);
        drop(transfer);

        let resumed = open(&fixture.root, transaction_id, &release);
        assert_eq!(
            resumed
                .progress()
                .expect("resumed progress reads")
                .received_bytes,
            11
        );
        let completed = resumed
            .append(11, &archive[11..])
            .expect("remaining bytes append");
        assert!(completed.complete);
        let ready = resumed.finalize().expect("archive finalizes");
        assert_eq!(fs::read(&ready).expect("ready reads"), archive);
        assert!(!fixture.transfer_path(transaction_id, "part").exists());
        assert!(fixture.transfer_path(transaction_id, "json").exists());
        drop(resumed);

        let reopened = open(&fixture.root, transaction_id, &release);
        assert!(reopened.progress().expect("ready progress reads").complete);
        assert!(reopened.append(0, first).is_err());
        assert_eq!(reopened.finalize().expect("ready finalizes again"), ready);
    }

    #[test]
    fn explicitly_discards_only_an_abandoned_bound_partial() {
        let fixture = Fixture::new();
        let archive = b"abandoned signed package archive";
        let release = fixture.release("abandoned-release", 8, archive);
        let transaction_id = "abandoned-8";
        let transfer = open(&fixture.root, transaction_id, &release);
        transfer.append(0, &archive[..9]).expect("prefix appends");

        assert_eq!(
            transfer
                .discard_abandoned()
                .expect("abandoned transfer discards"),
            PackageTransferCleanup {
                kind: PackageTransferCleanupKind::AbandonedPartial,
            }
        );
        assert!(!fixture.transfer_path(transaction_id, "part").exists());
        assert!(!fixture.transfer_path(transaction_id, "json").exists());
        assert!(!fixture.cleanup_path(transaction_id).exists());
        assert!(fixture.transfer_path(transaction_id, "lock").is_file());

        let restarted = open(&fixture.root, transaction_id, &release);
        assert_eq!(
            restarted
                .progress()
                .expect("new transfer reads")
                .received_bytes,
            0
        );
        restarted
            .append(0, archive)
            .expect("replacement archive appends");
        restarted.finalize().expect("replacement finalizes");
        assert!(matches!(
            restarted.discard_abandoned(),
            Err(PackageTransferError::CleanupStateMismatch(_))
        ));
        assert!(fixture.ready_path(transaction_id).is_file());
        assert!(fixture.transfer_path(transaction_id, "json").is_file());
    }

    #[test]
    fn recovers_interrupted_abandoned_and_consumed_cleanup_before_reuse() {
        let fixture = Fixture::new();
        let archive = b"cleanup recovery package archive";
        let release = fixture.release("cleanup-release", 9, archive);

        let abandoned_id = "recover-abandoned";
        let abandoned = open(&fixture.root, abandoned_id, &release);
        abandoned
            .append(0, &archive[..7])
            .expect("abandoned prefix appends");
        abandoned
            .begin_cleanup(PackageTransferCleanupKind::AbandonedPartial)
            .expect("abandoned intent persists");
        drop(abandoned);
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, abandoned_id, &release, 1),
            Err(PackageTransferError::CleanupRecovered(value)) if value == abandoned_id
        ));
        assert!(!fixture.transfer_path(abandoned_id, "part").exists());
        assert!(!fixture.transfer_path(abandoned_id, "json").exists());
        assert!(!fixture.cleanup_path(abandoned_id).exists());

        let consumed_id = "recover-consumed";
        let consumed = open(&fixture.root, consumed_id, &release);
        consumed
            .append(0, archive)
            .expect("consumed archive appends");
        consumed.finalize().expect("consumed archive finalizes");
        consumed
            .begin_cleanup(PackageTransferCleanupKind::ConsumedReady)
            .expect("consumed intent persists");
        fs::remove_file(fixture.transfer_path(consumed_id, "json"))
            .expect("simulate state removal before interruption");
        drop(consumed);
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, consumed_id, &release, 1),
            Err(PackageTransferError::CleanupRecovered(value)) if value == consumed_id
        ));
        assert!(!fixture.ready_path(consumed_id).exists());
        assert!(!fixture.cleanup_path(consumed_id).exists());
        assert_eq!(
            open(&fixture.root, consumed_id, &release)
                .progress()
                .expect("transaction can restart after recovery")
                .received_bytes,
            0
        );
    }

    #[test]
    fn rejects_tampered_cleanup_intent_without_removing_bound_state() {
        let fixture = Fixture::new();
        let archive = b"cleanup tamper package archive";
        let release = fixture.release("cleanup-tamper-release", 10, archive);
        let transaction_id = "cleanup-tamper";
        let transfer = open(&fixture.root, transaction_id, &release);
        transfer
            .append(0, &archive[..8])
            .expect("tamper prefix appends");
        transfer
            .begin_cleanup(PackageTransferCleanupKind::AbandonedPartial)
            .expect("cleanup intent persists");
        let cleanup_path = fixture.cleanup_path(transaction_id);
        let mut document: serde_json::Value =
            serde_json::from_slice(&fs::read(&cleanup_path).expect("cleanup intent reads"))
                .expect("cleanup intent parses");
        document["unexpected"] = serde_json::json!(true);
        fs::write(
            &cleanup_path,
            serde_json::to_vec(&document).expect("tampered cleanup serializes"),
        )
        .expect("cleanup intent tampers");
        drop(transfer);

        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, transaction_id, &release, 1),
            Err(PackageTransferError::InvalidState(_))
        ));
        assert!(fixture.transfer_path(transaction_id, "part").is_file());
        assert!(fixture.transfer_path(transaction_id, "json").is_file());
        assert!(cleanup_path.is_file());
    }

    #[test]
    fn rejects_gaps_overlap_conflicts_invalid_chunks_and_overrun() {
        let fixture = Fixture::new();
        let archive = b"0123456789";
        let release = fixture.release("release", 8, archive);
        let transfer = open(&fixture.root, "bounded-8", &release);

        assert!(matches!(
            transfer.append(0, &[]),
            Err(PackageTransferError::InvalidChunkLength(0))
        ));
        let oversized = vec![0_u8; MAX_CHUNK_BYTES + 1];
        assert!(matches!(
            transfer.append(0, &oversized),
            Err(PackageTransferError::InvalidChunkLength(_))
        ));
        assert!(matches!(
            transfer.append(1, b"1"),
            Err(PackageTransferError::OffsetMismatch {
                expected: 0,
                actual: 1
            })
        ));
        transfer.append(0, b"0123").expect("prefix appends");
        assert!(matches!(
            transfer.append(2, b"2345"),
            Err(PackageTransferError::OffsetMismatch {
                expected: 4,
                actual: 2
            })
        ));
        assert!(matches!(
            transfer.append(0, b"xxxx"),
            Err(PackageTransferError::ReplayMismatch { offset: 0 })
        ));
        assert!(matches!(
            transfer.append(4, b"456789x"),
            Err(PackageTransferError::ArchiveLengthExceeded)
        ));
        assert!(matches!(
            transfer.finalize(),
            Err(PackageTransferError::Incomplete {
                received_bytes: 4,
                expected_bytes: 10
            })
        ));
    }

    #[test]
    fn serializes_one_transaction_with_a_nonblocking_lock() {
        let fixture = Fixture::new();
        let archive = b"archive for lock coverage";
        let release = fixture.release("release", 9, archive);
        let first = open(&fixture.root, "locked-9", &release);

        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "locked-9", &release, 1),
            Err(PackageTransferError::Busy(value)) if value == "locked-9"
        ));
        drop(first);
        open(&fixture.root, "locked-9", &release);
    }

    #[test]
    fn rejects_changed_release_binding_and_orphan_partial() {
        let fixture = Fixture::new();
        let first_release = fixture.release("first", 10, b"first archive bytes");
        let transfer = open(&fixture.root, "binding-10", &first_release);
        drop(transfer);
        let changed_release = fixture.release("changed", 10, b"changed archive bytes");
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "binding-10", &changed_release, 1),
            Err(PackageTransferError::BindingMismatch)
        ));

        fs::write(fixture.transfer_path("orphan-11", "part"), b"unbound bytes")
            .expect("orphan writes");
        let orphan_release = fixture.release("orphan", 11, b"expected archive");
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "orphan-11", &orphan_release, 1),
            Err(PackageTransferError::OrphanPartial(_))
        ));
    }

    #[test]
    fn retains_wrong_complete_bytes_and_refuses_publication() {
        let fixture = Fixture::new();
        let archive = b"expected exact archive";
        let release = fixture.release("release", 12, archive);
        let transfer = open(&fixture.root, "hash-12", &release);
        let wrong = vec![b'x'; archive.len()];
        transfer
            .append(0, &wrong)
            .expect("wrong bytes durably append");

        assert!(matches!(
            transfer.finalize(),
            Err(PackageTransferError::Intake(_))
        ));
        assert!(!fixture.ready_path("hash-12").exists());
        assert_eq!(
            fs::read(fixture.transfer_path("hash-12", "part"))
                .expect("partial remains inspectable"),
            wrong
        );
    }

    #[test]
    fn recovers_interruption_after_no_replace_ready_publication() {
        let fixture = Fixture::new();
        let archive = b"archive published before cleanup";
        let release = fixture.release("release", 13, archive);
        let transaction_id = "recover-13";
        let transfer = open(&fixture.root, transaction_id, &release);
        transfer.append(0, archive).expect("archive appends");
        fs::hard_link(
            fixture.transfer_path(transaction_id, "part"),
            fixture.ready_path(transaction_id),
        )
        .expect("ready link simulates interrupted publication");
        drop(transfer);

        let recovered = open(&fixture.root, transaction_id, &release);
        assert!(
            recovered
                .progress()
                .expect("recovered ready reads")
                .complete
        );
        assert!(!fixture.transfer_path(transaction_id, "part").exists());
        assert!(fixture.transfer_path(transaction_id, "json").exists());
        assert_eq!(
            fs::read(fixture.ready_path(transaction_id)).expect("ready reads"),
            archive
        );
    }

    #[test]
    fn published_archive_retains_binding_and_rejects_orphan_ready_state() {
        let fixture = Fixture::new();
        let archive = b"generation-bound ready archive";
        let first_release = fixture.release("first-ready", 15, archive);
        let transaction_id = "ready-binding";
        let transfer = open(&fixture.root, transaction_id, &first_release);
        transfer.append(0, archive).expect("archive appends");
        transfer.finalize().expect("archive publishes");
        drop(transfer);

        let later_release = fixture.release("later-ready", 16, archive);
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, transaction_id, &later_release, 1),
            Err(PackageTransferError::BindingMismatch)
        ));

        let orphan_transaction = "orphan-ready";
        fs::write(fixture.ready_path(orphan_transaction), archive).expect("orphan ready writes");
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(
                &fixture.root,
                orphan_transaction,
                &first_release,
                1
            ),
            Err(PackageTransferError::OrphanReady(_))
        ));
    }

    #[test]
    fn zero_reserve_fails_before_creating_transfer_state() {
        let fixture = Fixture::new();
        let release = fixture.release("reserve", 17, b"reserve-bound archive");

        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "zero-reserve", &release, 0),
            Err(PackageTransferError::Intake(
                crate::package_intake::PackageIntakeError::InvalidReserve
            ))
        ));
        assert!(!fixture.transfer_path("zero-reserve", "json").exists());
        assert!(!fixture.transfer_path("zero-reserve", "part").exists());
        assert!(!fixture.transfer_path("zero-reserve", "lock").exists());
    }

    #[test]
    fn rejects_unsafe_transaction_ids() {
        let fixture = Fixture::new();
        let release = fixture.release("release", 14, b"archive bytes");
        for transaction_id in ["", "../escape", "Upper", "-lead", "trail-", "two--dash"] {
            assert!(matches!(
                PackageArchiveTransfer::open_or_begin(&fixture.root, transaction_id, &release, 1),
                Err(PackageTransferError::InvalidTransactionId(_))
            ));
        }
    }
}

#[cfg(test)]
mod additional_tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};

    use super::{PackageArchiveTransfer, PackageTransferError};
    use crate::package_intake::{PackageIntakeError, VerifiedPackageRelease};

    const RELEASE_PREFIX: &[u8] = b"VCG-PACKAGE-RELEASE-V1\0";
    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        root: PathBuf,
        public_key: PathBuf,
        signing_key: SigningKey,
    }

    impl Fixture {
        fn new() -> Self {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-package-transfer-extra-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("fixture root creates");
            let signing_key = SigningKey::from_bytes(&[29_u8; 32]);
            let public_key = root.join("release.pub");
            fs::write(
                &public_key,
                encode_hex(signing_key.verifying_key().as_bytes()),
            )
            .expect("public key writes");
            Self {
                root,
                public_key,
                signing_key,
            }
        }

        fn release(&self, archive: &[u8], generation: u64) -> VerifiedPackageRelease {
            let descriptor = self.root.join(format!("release-{generation}.json"));
            let signature = self.root.join(format!("release-{generation}.sig"));
            let document = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":{},\"target\":\"{}-{}\",",
                    "\"archive\":{{\"format\":\"tar-zstd\",\"sha256\":\"{}\",\"sizeBytes\":{}}},",
                    "\"expanded\":{{\"sizeBytes\":1,\"fileCount\":1}},",
                    "\"catalog\":{{\"sha256\":\"{}\",\"sizeBytes\":1}}}}"
                ),
                generation,
                std::env::consts::ARCH,
                std::env::consts::OS,
                encode_hex(&Sha256::digest(archive)),
                archive.len(),
                "11".repeat(32),
            );
            fs::write(&descriptor, document.as_bytes()).expect("descriptor writes");
            let mut message = Vec::from(RELEASE_PREFIX);
            message.extend_from_slice(document.as_bytes());
            fs::write(
                &signature,
                encode_hex(&self.signing_key.sign(&message).to_bytes()),
            )
            .expect("signature writes");
            VerifiedPackageRelease::load(&descriptor, &signature, &self.public_key)
                .expect("release verifies")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
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

    #[test]
    fn resumes_exact_chunks_and_publishes_one_verified_archive() {
        let fixture = Fixture::new();
        let archive = b"durable package archive";
        let release = fixture.release(archive, 7);
        let transaction = "release-seven";

        {
            let transfer =
                PackageArchiveTransfer::open_or_begin(&fixture.root, transaction, &release, 1)
                    .expect("transfer begins");
            assert_eq!(
                transfer.progress().expect("progress reads").received_bytes,
                0
            );
            let first = &archive[..8];
            let appended = transfer.append(0, first).expect("first chunk appends");
            assert_eq!(appended.received_bytes, 8);
            assert!(!appended.complete);
            assert!(!appended.replayed);
            let replay = transfer.append(0, first).expect("chunk replay verifies");
            assert!(replay.replayed);
            assert!(matches!(
                transfer.append(10, b"x"),
                Err(PackageTransferError::OffsetMismatch {
                    expected: 8,
                    actual: 10
                })
            ));
        }

        let transfer =
            PackageArchiveTransfer::open_or_begin(&fixture.root, transaction, &release, 1)
                .expect("transfer resumes");
        assert_eq!(
            transfer.progress().expect("progress reads").received_bytes,
            8
        );
        assert!(matches!(
            transfer.append(0, b"conflict"),
            Err(PackageTransferError::ReplayMismatch { offset: 0 })
        ));
        let final_chunk = transfer
            .append(8, &archive[8..])
            .expect("final chunk appends");
        assert!(final_chunk.complete);
        let ready = transfer.finalize().expect("archive finalizes");
        assert_eq!(fs::read(&ready).expect("ready archive reads"), archive);
        assert!(!fixture.root.join(".transfer-release-seven.part").exists());
        assert!(fixture.root.join(".transfer-release-seven.json").exists());
        assert!(matches!(
            transfer.append(0, b"x"),
            Err(PackageTransferError::AlreadyComplete)
        ));
        drop(transfer);

        let reopened =
            PackageArchiveTransfer::open_or_begin(&fixture.root, transaction, &release, 1)
                .expect("published transfer reopens");
        assert!(reopened.progress().expect("progress reads").complete);
        assert_eq!(reopened.finalize().expect("finalize replays"), ready);
    }

    #[test]
    fn serializes_transactions_and_binds_resume_to_one_release() {
        let fixture = Fixture::new();
        let release = fixture.release(b"first release", 7);
        let other = fixture.release(b"second release", 8);
        let first = PackageArchiveTransfer::open_or_begin(&fixture.root, "shared", &release, 1)
            .expect("first transfer opens");
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "shared", &release, 1),
            Err(PackageTransferError::Busy(id)) if id == "shared"
        ));
        drop(first);
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "shared", &other, 1),
            Err(PackageTransferError::BindingMismatch)
        ));
    }

    #[test]
    fn rejects_overrun_or_changed_complete_bytes_without_publication() {
        let fixture = Fixture::new();
        let archive = b"expected";
        let release = fixture.release(archive, 7);
        let transfer = PackageArchiveTransfer::open_or_begin(&fixture.root, "tamper", &release, 1)
            .expect("transfer begins");
        assert!(matches!(
            transfer.append(0, b"expected-extra"),
            Err(PackageTransferError::ArchiveLengthExceeded)
        ));
        transfer
            .append(0, b"XXXXXXXX")
            .expect("wrong complete bytes append");
        assert!(matches!(
            transfer.finalize(),
            Err(PackageTransferError::Intake(
                PackageIntakeError::ArchiveHashMismatch
            ))
        ));
        assert!(!fixture.root.join("ready-tamper.archive").exists());
    }

    #[test]
    fn refuses_unbound_partial_state() {
        let fixture = Fixture::new();
        let release = fixture.release(b"archive", 7);
        fs::write(fixture.root.join(".transfer-orphan.part"), b"bytes")
            .expect("orphan partial writes");
        assert!(matches!(
            PackageArchiveTransfer::open_or_begin(&fixture.root, "orphan", &release, 1),
            Err(PackageTransferError::OrphanPartial(_))
        ));
    }
}
