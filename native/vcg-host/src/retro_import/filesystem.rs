//! Retro import filesystem.

use super::{
    COPY_BUFFER_BYTES, Deserialize, Digest, File, MAX_AUDIT_RECORD_BYTES,
    MAX_LIBRARY_DOCUMENT_BYTES, NativeAuditRecord, NativeProvisionAuditRecord, OpenOptions,
    PROVISION_ID_HEX_LENGTH, PROVISION_ID_PREFIX, Path, PathBuf, Read, RetroImportError,
    RetroInstalledLibrary, SCHEMA_VERSION, Serialize, Sha256, Write, fs, io, validate_library,
    validate_prefixed_hex_id, validate_sha256,
};

pub(super) fn verify_file_hash(
    path: &Path,
    expected_bytes: u64,
    expected_sha256: &str,
) -> Result<(), RetroImportError> {
    require_regular_file(path, "retro content file")?;
    let mut file = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open retro content file",
        path: path.to_owned(),
        source,
    })?;
    let metadata = file.metadata().map_err(|source| RetroImportError::Io {
        operation: "inspect retro content file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.len() != expected_bytes {
        return Err(RetroImportError::CommittedContentMismatch);
    }
    let mut hasher = Sha256::new();
    let mut observed = 0_u64;
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|source| RetroImportError::Io {
                operation: "hash retro content file",
                path: path.to_owned(),
                source,
            })?;
        if read == 0 {
            break;
        }
        observed = observed
            .checked_add(u64::try_from(read).unwrap_or(u64::MAX))
            .ok_or(RetroImportError::CapacityOverflow)?;
        hasher.update(&buffer[..read]);
    }
    if observed != expected_bytes || encode_hex(&hasher.finalize()) != expected_sha256 {
        return Err(RetroImportError::CommittedContentMismatch);
    }
    Ok(())
}

pub(super) fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    output
}

pub(super) fn serialized_bounded<T: Serialize>(
    value: &T,
    maximum: u64,
    label: &'static str,
) -> Result<Vec<u8>, RetroImportError> {
    let bytes = serde_json::to_vec(value).map_err(|error| RetroImportError::InvalidState {
        label,
        detail: error.to_string(),
    })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum {
        return Err(RetroImportError::StateTooLarge { label, maximum });
    }
    Ok(bytes)
}

pub(super) fn read_json_bounded<T: for<'de> Deserialize<'de>>(
    path: &Path,
    maximum: u64,
    label: &'static str,
) -> Result<T, RetroImportError> {
    let file = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open bounded JSON state",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| RetroImportError::Io {
            operation: "read bounded JSON state",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum {
        return Err(RetroImportError::StateTooLarge { label, maximum });
    }
    serde_json::from_slice(&bytes).map_err(|error| RetroImportError::InvalidState {
        label,
        detail: error.to_string(),
    })
}

pub(super) fn read_library(path: &Path) -> Result<RetroInstalledLibrary, RetroImportError> {
    let library: RetroInstalledLibrary =
        read_json_bounded(path, MAX_LIBRARY_DOCUMENT_BYTES, "retro installed library")?;
    validate_library(&library)?;
    Ok(library)
}

pub(super) fn read_audit(path: &Path) -> Result<NativeAuditRecord, RetroImportError> {
    let audit: NativeAuditRecord =
        read_json_bounded(path, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
    if audit.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(audit.schema_version));
    }
    Ok(audit)
}

pub(super) fn read_provision_audit(path: &Path) -> Result<NativeProvisionAuditRecord, RetroImportError> {
    require_regular_file(path, "retro import audit")?;
    let audit: NativeProvisionAuditRecord =
        read_json_bounded(path, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
    if audit.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(audit.schema_version));
    }
    validate_prefixed_hex_id(
        "provisioning ID",
        &audit.provisioning_id,
        PROVISION_ID_PREFIX,
        PROVISION_ID_HEX_LENGTH,
    )?;
    validate_sha256("staged manifest SHA-256", &audit.staged_manifest_sha256)?;
    validate_sha256("committed library SHA-256", &audit.library_sha256)?;
    Ok(audit)
}

pub(super) fn library_generation_filename(generation: u64) -> String {
    format!("generation-{generation:020}.json")
}

pub(super) fn create_directory_if_missing(path: &Path) -> Result<bool, RetroImportError> {
    if path_exists(path)? {
        return Ok(false);
    }
    fs::create_dir_all(path).map_err(|source| RetroImportError::Io {
        operation: "create retro import directory",
        path: path.to_owned(),
        source,
    })?;
    Ok(true)
}

pub(super) fn read_bytes_bounded(
    path: &Path,
    maximum: u64,
    label: &'static str,
) -> Result<Vec<u8>, RetroImportError> {
    require_regular_file(path, label)?;
    let file = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open bounded retro import file",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| RetroImportError::Io {
            operation: "read bounded retro import file",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum {
        return Err(RetroImportError::StateTooLarge { label, maximum });
    }
    Ok(bytes)
}

pub(super) fn publish_new_file(
    parent: &Path,
    temporary: &Path,
    final_path: &Path,
    bytes: &[u8],
    label: &'static str,
) -> Result<(), RetroImportError> {
    if path_exists(temporary)? || path_exists(final_path)? {
        return Err(RetroImportError::StateAlreadyExists(label));
    }
    write_new_synced_file(temporary, bytes, "write unpublished retro import state")?;
    fs::hard_link(temporary, final_path).map_err(|source| {
        if source.kind() == io::ErrorKind::AlreadyExists {
            RetroImportError::StateAlreadyExists(label)
        } else {
            RetroImportError::Io {
                operation: "publish retro import state",
                path: final_path.to_owned(),
                source,
            }
        }
    })?;
    sync_directory(parent)?;
    fs::remove_file(temporary).map_err(|source| RetroImportError::Io {
        operation: "remove published temporary retro import state",
        path: temporary.to_owned(),
        source,
    })?;
    sync_directory(parent)
}

pub(super) fn publish_new_file_resumable(
    parent: &Path,
    temporary: &Path,
    final_path: &Path,
    bytes: &[u8],
    label: &'static str,
) -> Result<(), RetroImportError> {
    if path_exists(final_path)? {
        return Err(RetroImportError::StateAlreadyExists(label));
    }
    if path_exists(temporary)? {
        require_regular_file(temporary, "resumable temporary retro import state")?;
        let observed = fs::read(temporary).map_err(|source| RetroImportError::Io {
            operation: "read resumable temporary retro import state",
            path: temporary.to_owned(),
            source,
        })?;
        if observed != bytes {
            return Err(RetroImportError::InvalidState {
                label,
                detail: "temporary bytes differ from the pending transaction".to_owned(),
            });
        }
    } else {
        write_new_synced_file(temporary, bytes, "write unpublished retro import state")?;
    }
    fs::hard_link(temporary, final_path).map_err(|source| {
        if source.kind() == io::ErrorKind::AlreadyExists {
            RetroImportError::StateAlreadyExists(label)
        } else {
            RetroImportError::Io {
                operation: "publish resumable retro import state",
                path: final_path.to_owned(),
                source,
            }
        }
    })?;
    sync_directory(parent)?;
    fs::remove_file(temporary).map_err(|source| RetroImportError::Io {
        operation: "remove published resumable retro import state",
        path: temporary.to_owned(),
        source,
    })?;
    let temporary_parent = temporary
        .parent()
        .ok_or_else(|| RetroImportError::UnsafePath(temporary.to_owned()))?;
    sync_directory(temporary_parent)
}

pub(super) fn remove_regular_file_if_present(path: &Path) -> Result<bool, RetroImportError> {
    if !path_exists(path)? {
        return Ok(false);
    }
    require_regular_file(path, "temporary retro import state")?;
    fs::remove_file(path).map_err(|source| RetroImportError::Io {
        operation: "remove temporary retro import state",
        path: path.to_owned(),
        source,
    })?;
    Ok(true)
}

pub(super) fn write_new_synced_file(
    path: &Path,
    bytes: &[u8],
    operation: &'static str,
) -> Result<(), RetroImportError> {
    let mut file = create_private_new_file(path, operation)?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| RetroImportError::Io {
            operation,
            path: path.to_owned(),
            source,
        })
}

pub(super) fn create_private_new_file(path: &Path, operation: &'static str) -> Result<File, RetroImportError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|source| RetroImportError::Io {
        operation,
        path: path.to_owned(),
        source,
    })
}

#[cfg(unix)]
pub(super) fn set_private_directory_permissions(path: &Path) -> Result<(), RetroImportError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|source| {
        RetroImportError::Io {
            operation: "set private retro staging permissions",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
pub(super) fn set_private_directory_permissions(_path: &Path) -> Result<(), RetroImportError> {
    Ok(())
}

#[cfg(unix)]
pub(super) fn seal_payload_permissions(path: &Path) -> Result<(), RetroImportError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o400)).map_err(|source| {
        RetroImportError::Io {
            operation: "seal staged retro content permissions",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
pub(super) fn seal_payload_permissions(_path: &Path) -> Result<(), RetroImportError> {
    Ok(())
}

#[cfg(unix)]
pub(super) fn ensure_same_filesystem(left: &Path, right: &Path) -> Result<(), RetroImportError> {
    use std::os::unix::fs::MetadataExt;
    let left_metadata = fs::metadata(left).map_err(|source| RetroImportError::Io {
        operation: "inspect retro import staging filesystem",
        path: left.to_owned(),
        source,
    })?;
    let right_metadata = fs::metadata(right).map_err(|source| RetroImportError::Io {
        operation: "inspect retro content filesystem",
        path: right.to_owned(),
        source,
    })?;
    if left_metadata.dev() != right_metadata.dev() {
        return Err(RetroImportError::DifferentFilesystems);
    }
    Ok(())
}

#[cfg(not(unix))]
pub(super) fn ensure_same_filesystem(left: &Path, right: &Path) -> Result<(), RetroImportError> {
    if left.components().next() != right.components().next() {
        return Err(RetroImportError::DifferentFilesystems);
    }
    Ok(())
}

pub(super) fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, RetroImportError> {
    if !path.is_absolute() {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| RetroImportError::Io {
        operation: "inspect configured retro import directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    fs::canonicalize(path).map_err(|source| RetroImportError::Io {
        operation: "canonicalize configured retro import directory",
        path: path.to_owned(),
        source,
    })
}

pub(super) fn canonical_direct_directory(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, RetroImportError> {
    let canonical = canonical_directory(kind, path)?;
    let expected_name = path
        .file_name()
        .ok_or_else(|| RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        })?;
    if path.parent() != Some(parent)
        || canonical.parent() != Some(parent)
        || canonical.file_name() != Some(expected_name)
    {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(canonical)
}

pub(super) fn canonical_direct_file(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, RetroImportError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| RetroImportError::Io {
        operation: "inspect configured retro import file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    let canonical = fs::canonicalize(path).map_err(|source| RetroImportError::Io {
        operation: "canonicalize configured retro import file",
        path: path.to_owned(),
        source,
    })?;
    let expected_name = path
        .file_name()
        .ok_or_else(|| RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        })?;
    if path.parent() != Some(parent)
        || canonical.parent() != Some(parent)
        || canonical.file_name() != Some(expected_name)
    {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(canonical)
}

pub(super) fn require_direct_directory(
    path: &Path,
    parent: &Path,
    kind: &'static str,
) -> Result<(), RetroImportError> {
    let canonical = canonical_direct_directory(kind, parent, path)?;
    if canonical != path {
        return Err(RetroImportError::UnsafePath(path.to_owned()));
    }
    Ok(())
}

pub(super) fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), RetroImportError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| RetroImportError::Io {
        operation: "inspect retro import file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(RetroImportError::UnsafePathWithKind {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

pub(super) fn path_exists(path: &Path) -> Result<bool, RetroImportError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(RetroImportError::Io {
            operation: "inspect retro import path",
            path: path.to_owned(),
            source,
        }),
    }
}

#[cfg(unix)]
pub(super) fn sync_directory(path: &Path) -> Result<(), RetroImportError> {
    let directory = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open retro import directory for synchronization",
        path: path.to_owned(),
        source,
    })?;
    directory.sync_all().map_err(|source| RetroImportError::Io {
        operation: "synchronize retro import directory",
        path: path.to_owned(),
        source,
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
pub(super) fn sync_directory(_path: &Path) -> Result<(), RetroImportError> {
    Ok(())
}
