//! Signature-first verification for computer-assisted recovery images.
//!
//! This module verifies a bounded target/hardware-specific recovery manifest
//! under a dedicated delegated role, completely hashes the downloaded archive,
//! and can verify an exact expanded-image read-back stream. It does not
//! download, decompress, select removable media, write a block device, prove
//! read-back provenance, or authorize destructive recovery.

use std::collections::BTreeSet;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::update_trust::{
    DetachedUpdateSignatures, TrustedUpdatePolicy, UpdateArtifactKind, VerifiedUpdateRole,
};

const RECOVERY_MANIFEST_SCHEMA_VERSION: u32 = 1;
const MAX_RECOVERY_MANIFEST_BYTES: u64 = 64 * 1_024;
const MAX_COMPATIBLE_HARDWARE_IDS: usize = 16;
/// Maximum accepted compressed or raw recovery archive size.
pub const MAX_RECOVERY_ARCHIVE_BYTES: u64 = 512 * 1_024 * 1_024 * 1_024;
/// Maximum accepted expanded recovery image size.
pub const MAX_RECOVERY_EXPANDED_BYTES: u64 = 512 * 1_024 * 1_024 * 1_024;
/// Maximum declared target-media capacity.
pub const MAX_RECOVERY_MEDIA_BYTES: u64 = 2 * 1_024 * 1_024 * 1_024 * 1_024;

/// Closed archive encodings accepted by the recovery manifest.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecoveryArchiveFormat {
    Raw,
    RawZip,
}

/// Delegated, signature-verified recovery-image release metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedRecoveryImageRelease {
    generation: u64,
    release_id: String,
    target: String,
    compatible_hardware_ids: Vec<String>,
    archive_format: RecoveryArchiveFormat,
    archive_size_bytes: u64,
    archive_sha256: [u8; 32],
    expanded_size_bytes: u64,
    expanded_sha256: [u8; 32],
    minimum_media_bytes: u64,
    manifest_sha256: [u8; 32],
    update_authority: VerifiedUpdateRole,
}

/// Completely verified archive plus the exact still-open source handle.
#[derive(Debug)]
pub struct VerifiedRecoveryArchive {
    release: VerifiedRecoveryImageRelease,
    file: File,
    source_path: PathBuf,
}

/// Exact expanded-image digest evidence.
///
/// The fields are private and instances can only be produced by reading the
/// signed length and hash. The privileged writer still owns reader provenance:
/// passing the downloaded source or another file would not prove removable
/// media read-back.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedRecoveryReadback {
    generation: u64,
    release_id: String,
    target: String,
    expanded_size_bytes: u64,
    expanded_sha256: [u8; 32],
    manifest_sha256: [u8; 32],
}

impl VerifiedRecoveryImageRelease {
    /// Loads a recovery manifest under the policy's exact
    /// channel/recovery-image/target role before parsing its JSON.
    ///
    /// # Errors
    ///
    /// Rejects unsafe paths, missing/expired/cross-role authority, malformed or
    /// open JSON, wrong target or hardware, unsafe identifiers, invalid bounds,
    /// noncanonical hashes, duplicate/unordered hardware IDs, and incoherent
    /// raw-image metadata.
    pub fn load(
        manifest_path: &Path,
        signatures: &DetachedUpdateSignatures,
        policy: &TrustedUpdatePolicy,
        expected_target: &str,
        expected_hardware_id: &str,
    ) -> Result<Self, RecoveryImageError> {
        validate_identifier("expected target", expected_target, 64)?;
        validate_identifier("expected hardware ID", expected_hardware_id, 128)?;
        require_absolute_regular_file("recovery manifest", manifest_path)?;
        let manifest_bytes = read_bounded(
            manifest_path,
            MAX_RECOVERY_MANIFEST_BYTES,
            "recovery manifest",
        )?;
        let update_authority = policy
            .verify(
                UpdateArtifactKind::RecoveryImage,
                expected_target,
                &manifest_bytes,
                signatures,
            )
            .map_err(|error| RecoveryImageError::UpdateAuthority(error.to_string()))?;
        let manifest_sha256 = Sha256::digest(&manifest_bytes).into();
        let document: RecoveryImageManifestDocument = serde_json::from_slice(&manifest_bytes)
            .map_err(|error| RecoveryImageError::InvalidDocument(error.to_string()))?;
        Self::from_document(
            document,
            expected_target,
            expected_hardware_id,
            manifest_sha256,
            update_authority,
        )
    }

    fn from_document(
        document: RecoveryImageManifestDocument,
        expected_target: &str,
        expected_hardware_id: &str,
        manifest_sha256: [u8; 32],
        update_authority: VerifiedUpdateRole,
    ) -> Result<Self, RecoveryImageError> {
        if document.schema_version != RECOVERY_MANIFEST_SCHEMA_VERSION {
            return Err(RecoveryImageError::UnsupportedSchema(
                document.schema_version,
            ));
        }
        if document.generation == 0 {
            return Err(RecoveryImageError::InvalidRecord(
                "generation must be greater than zero".to_owned(),
            ));
        }
        validate_identifier("release ID", &document.release_id, 128)?;
        validate_identifier("target", &document.target, 64)?;
        if document.target != expected_target {
            return Err(RecoveryImageError::WrongTarget {
                expected: expected_target.to_owned(),
                actual: document.target,
            });
        }
        validate_hardware_ids(&document.compatible_hardware_ids, expected_hardware_id)?;

        let archive_format = document.image.format.into();
        if !(1..=MAX_RECOVERY_ARCHIVE_BYTES).contains(&document.image.archive_size_bytes) {
            return Err(RecoveryImageError::InvalidRecord(format!(
                "archive size must be within 1..={MAX_RECOVERY_ARCHIVE_BYTES} bytes"
            )));
        }
        if !(1..=MAX_RECOVERY_EXPANDED_BYTES).contains(&document.image.expanded_size_bytes) {
            return Err(RecoveryImageError::InvalidRecord(format!(
                "expanded size must be within 1..={MAX_RECOVERY_EXPANDED_BYTES} bytes"
            )));
        }
        if !(document.image.expanded_size_bytes..=MAX_RECOVERY_MEDIA_BYTES)
            .contains(&document.image.minimum_media_bytes)
        {
            return Err(RecoveryImageError::InvalidRecord(format!(
                "minimum media size must be within expanded size..={MAX_RECOVERY_MEDIA_BYTES}"
            )));
        }
        let archive_sha256 =
            decode_canonical_hex::<32>(document.image.archive_sha256.as_bytes(), "archive sha256")?;
        let expanded_sha256 = decode_canonical_hex::<32>(
            document.image.expanded_sha256.as_bytes(),
            "expanded image sha256",
        )?;
        if archive_format == RecoveryArchiveFormat::Raw
            && (document.image.archive_size_bytes != document.image.expanded_size_bytes
                || archive_sha256 != expanded_sha256)
        {
            return Err(RecoveryImageError::InvalidRecord(
                "raw archive and expanded image identity must match".to_owned(),
            ));
        }

        Ok(Self {
            generation: document.generation,
            release_id: document.release_id,
            target: expected_target.to_owned(),
            compatible_hardware_ids: document.compatible_hardware_ids,
            archive_format,
            archive_size_bytes: document.image.archive_size_bytes,
            archive_sha256,
            expanded_size_bytes: document.image.expanded_size_bytes,
            expanded_sha256,
            minimum_media_bytes: document.image.minimum_media_bytes,
            manifest_sha256,
            update_authority,
        })
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

    #[must_use]
    pub fn compatible_hardware_ids(&self) -> &[String] {
        &self.compatible_hardware_ids
    }

    #[must_use]
    pub const fn archive_format(&self) -> RecoveryArchiveFormat {
        self.archive_format
    }

    #[must_use]
    pub const fn archive_size_bytes(&self) -> u64 {
        self.archive_size_bytes
    }

    #[must_use]
    pub const fn archive_sha256(&self) -> [u8; 32] {
        self.archive_sha256
    }

    #[must_use]
    pub const fn expanded_size_bytes(&self) -> u64 {
        self.expanded_size_bytes
    }

    #[must_use]
    pub const fn expanded_sha256(&self) -> [u8; 32] {
        self.expanded_sha256
    }

    #[must_use]
    pub const fn minimum_media_bytes(&self) -> u64 {
        self.minimum_media_bytes
    }

    #[must_use]
    pub const fn manifest_sha256(&self) -> [u8; 32] {
        self.manifest_sha256
    }

    #[must_use]
    pub const fn update_authority(&self) -> &VerifiedUpdateRole {
        &self.update_authority
    }

    /// Completely hashes one exact bounded regular archive and retains its
    /// opened handle for a future writer.
    ///
    /// # Errors
    ///
    /// Rejects unsafe/non-regular paths, size mismatch or change, hash
    /// mismatch, and read failures.
    pub fn verify_archive(
        &self,
        archive_path: &Path,
    ) -> Result<VerifiedRecoveryArchive, RecoveryImageError> {
        require_absolute_regular_file("recovery archive", archive_path)?;
        let mut file = File::open(archive_path).map_err(|source| RecoveryImageError::Io {
            operation: "open recovery archive",
            path: archive_path.to_owned(),
            source,
        })?;
        let initial = file.metadata().map_err(|source| RecoveryImageError::Io {
            operation: "inspect opened recovery archive",
            path: archive_path.to_owned(),
            source,
        })?;
        if !initial.is_file() {
            return Err(RecoveryImageError::UnsafePath {
                kind: "recovery archive",
                path: archive_path.to_owned(),
            });
        }
        if initial.len() != self.archive_size_bytes {
            return Err(RecoveryImageError::ArchiveSizeMismatch {
                expected_bytes: self.archive_size_bytes,
                actual_bytes: initial.len(),
            });
        }

        let (total, actual) = hash_exact(
            &mut file,
            self.archive_size_bytes,
            "hash recovery archive",
            archive_path,
        )?;
        let final_metadata = file.metadata().map_err(|source| RecoveryImageError::Io {
            operation: "reinspect opened recovery archive",
            path: archive_path.to_owned(),
            source,
        })?;
        if total != self.archive_size_bytes || final_metadata.len() != self.archive_size_bytes {
            return Err(RecoveryImageError::ArchiveSizeMismatch {
                expected_bytes: self.archive_size_bytes,
                actual_bytes: total.max(final_metadata.len()),
            });
        }
        if actual != self.archive_sha256 {
            return Err(RecoveryImageError::ArchiveHashMismatch);
        }

        Ok(VerifiedRecoveryArchive {
            release: self.clone(),
            file,
            source_path: archive_path.to_owned(),
        })
    }

    /// Hashes the exact signed expanded-image prefix from a caller-owned
    /// read-back stream.
    ///
    /// The caller must prove that the reader was opened from the synchronized
    /// selected removable device after writing. This method deliberately does
    /// not accept a path or device selector.
    ///
    /// # Errors
    ///
    /// Rejects short reads, I/O errors, overflow, or hash mismatch.
    pub fn verify_expanded_readback(
        &self,
        mut readback: impl Read,
    ) -> Result<VerifiedRecoveryReadback, RecoveryImageError> {
        let mut digest = Sha256::new();
        let mut total = 0_u64;
        let mut buffer = [0_u8; 8 * 1_024];
        while total < self.expanded_size_bytes {
            let remaining = self.expanded_size_bytes - total;
            let maximum = usize::try_from(remaining.min(buffer.len() as u64)).map_err(|_| {
                RecoveryImageError::InvalidRecord("read-back bound overflow".into())
            })?;
            let count = readback
                .read(&mut buffer[..maximum])
                .map_err(RecoveryImageError::ReadbackIo)?;
            if count == 0 {
                return Err(RecoveryImageError::ExpandedSizeMismatch {
                    expected_bytes: self.expanded_size_bytes,
                    actual_bytes: total,
                });
            }
            total = total
                .checked_add(u64::try_from(count).map_err(|_| {
                    RecoveryImageError::InvalidRecord("read-back length overflow".into())
                })?)
                .ok_or_else(|| {
                    RecoveryImageError::InvalidRecord("read-back length overflow".into())
                })?;
            digest.update(&buffer[..count]);
        }
        let actual: [u8; 32] = digest.finalize().into();
        if actual != self.expanded_sha256 {
            return Err(RecoveryImageError::ExpandedHashMismatch);
        }
        Ok(VerifiedRecoveryReadback {
            generation: self.generation,
            release_id: self.release_id.clone(),
            target: self.target.clone(),
            expanded_size_bytes: self.expanded_size_bytes,
            expanded_sha256: self.expanded_sha256,
            manifest_sha256: self.manifest_sha256,
        })
    }
}

impl VerifiedRecoveryArchive {
    #[must_use]
    pub const fn release(&self) -> &VerifiedRecoveryImageRelease {
        &self.release
    }

    /// Consumes the result and returns the exact verified archive handle at
    /// byte zero with its signed release metadata.
    ///
    /// # Errors
    ///
    /// Rejects failure to rewind the retained handle.
    pub fn into_rewound_parts(
        mut self,
    ) -> Result<(VerifiedRecoveryImageRelease, File), RecoveryImageError> {
        self.file
            .seek(SeekFrom::Start(0))
            .map_err(|source| RecoveryImageError::Io {
                operation: "rewind verified recovery archive",
                path: self.source_path,
                source,
            })?;
        Ok((self.release, self.file))
    }
}

impl VerifiedRecoveryReadback {
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

    #[must_use]
    pub const fn expanded_size_bytes(&self) -> u64 {
        self.expanded_size_bytes
    }

    #[must_use]
    pub const fn expanded_sha256(&self) -> [u8; 32] {
        self.expanded_sha256
    }

    #[must_use]
    pub const fn manifest_sha256(&self) -> [u8; 32] {
        self.manifest_sha256
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryImageManifestDocument {
    schema_version: u32,
    generation: u64,
    release_id: String,
    target: String,
    compatible_hardware_ids: Vec<String>,
    image: RecoveryImageDocument,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryImageDocument {
    format: RecoveryArchiveFormatDocument,
    archive_size_bytes: u64,
    archive_sha256: String,
    expanded_size_bytes: u64,
    expanded_sha256: String,
    minimum_media_bytes: u64,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum RecoveryArchiveFormatDocument {
    Raw,
    RawZip,
}

impl From<RecoveryArchiveFormatDocument> for RecoveryArchiveFormat {
    fn from(value: RecoveryArchiveFormatDocument) -> Self {
        match value {
            RecoveryArchiveFormatDocument::Raw => Self::Raw,
            RecoveryArchiveFormatDocument::RawZip => Self::RawZip,
        }
    }
}

fn validate_hardware_ids(
    hardware_ids: &[String],
    expected_hardware_id: &str,
) -> Result<(), RecoveryImageError> {
    if hardware_ids.is_empty() || hardware_ids.len() > MAX_COMPATIBLE_HARDWARE_IDS {
        return Err(RecoveryImageError::InvalidRecord(format!(
            "compatible hardware IDs must contain 1..={MAX_COMPATIBLE_HARDWARE_IDS} entries"
        )));
    }
    let mut prior: Option<&str> = None;
    let mut unique = BTreeSet::new();
    for hardware_id in hardware_ids {
        validate_identifier("compatible hardware ID", hardware_id, 128)?;
        if prior.is_some_and(|value| value >= hardware_id.as_str())
            || !unique.insert(hardware_id.as_str())
        {
            return Err(RecoveryImageError::InvalidRecord(
                "compatible hardware IDs must be strictly sorted and unique".to_owned(),
            ));
        }
        prior = Some(hardware_id);
    }
    if !unique.contains(expected_hardware_id) {
        return Err(RecoveryImageError::WrongHardware {
            expected: expected_hardware_id.to_owned(),
        });
    }
    Ok(())
}

fn hash_exact(
    reader: &mut impl Read,
    expected_bytes: u64,
    operation: &'static str,
    path: &Path,
) -> Result<(u64, [u8; 32]), RecoveryImageError> {
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 8 * 1_024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|source| RecoveryImageError::Io {
                operation,
                path: path.to_owned(),
                source,
            })?;
        if count == 0 {
            break;
        }
        total = total
            .checked_add(u64::try_from(count).map_err(|_| {
                RecoveryImageError::InvalidRecord("archive read length overflow".to_owned())
            })?)
            .ok_or_else(|| {
                RecoveryImageError::InvalidRecord("archive read length overflow".to_owned())
            })?;
        if total > expected_bytes {
            return Err(RecoveryImageError::ArchiveSizeMismatch {
                expected_bytes,
                actual_bytes: total,
            });
        }
        digest.update(&buffer[..count]);
    }
    Ok((total, digest.finalize().into()))
}

fn validate_identifier(
    kind: &'static str,
    value: &str,
    maximum_bytes: usize,
) -> Result<(), RecoveryImageError> {
    if value.is_empty()
        || value.len() > maximum_bytes
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(RecoveryImageError::InvalidRecord(format!(
            "{kind} must be 1..={maximum_bytes} ASCII letters, digits, dot, underscore, or hyphen"
        )));
    }
    Ok(())
}

fn require_absolute_regular_file(
    kind: &'static str,
    path: &Path,
) -> Result<(), RecoveryImageError> {
    if !path.is_absolute() {
        return Err(RecoveryImageError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| RecoveryImageError::Io {
        operation: "inspect recovery input",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(RecoveryImageError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn read_bounded(
    path: &Path,
    maximum_bytes: u64,
    kind: &'static str,
) -> Result<Vec<u8>, RecoveryImageError> {
    let metadata = fs::metadata(path).map_err(|source| RecoveryImageError::Io {
        operation: "inspect recovery metadata",
        path: path.to_owned(),
        source,
    })?;
    if metadata.len() == 0 || metadata.len() > maximum_bytes {
        return Err(RecoveryImageError::InputSize {
            kind,
            maximum_bytes,
        });
    }
    let capacity = usize::try_from(metadata.len()).map_err(|_| RecoveryImageError::InputSize {
        kind,
        maximum_bytes,
    })?;
    let file = File::open(path).map_err(|source| RecoveryImageError::Io {
        operation: "open recovery metadata",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    file.take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| RecoveryImageError::Io {
            operation: "read recovery metadata",
            path: path.to_owned(),
            source,
        })?;
    if bytes.len() != capacity {
        return Err(RecoveryImageError::InputSize {
            kind,
            maximum_bytes,
        });
    }
    Ok(bytes)
}

fn decode_canonical_hex<const N: usize>(
    bytes: &[u8],
    kind: &'static str,
) -> Result<[u8; N], RecoveryImageError> {
    if bytes.len() != N * 2 {
        return Err(RecoveryImageError::InvalidEncoding(kind));
    }
    let mut decoded = [0_u8; N];
    for (index, pair) in bytes.chunks_exact(2).enumerate() {
        decoded[index] = (decode_nibble(pair[0], kind)? << 4) | decode_nibble(pair[1], kind)?;
    }
    Ok(decoded)
}

fn decode_nibble(byte: u8, kind: &'static str) -> Result<u8, RecoveryImageError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(RecoveryImageError::InvalidEncoding(kind)),
    }
}

/// Recovery manifest/archive/read-back verification failures.
#[derive(Debug)]
pub enum RecoveryImageError {
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InputSize {
        kind: &'static str,
        maximum_bytes: u64,
    },
    UpdateAuthority(String),
    InvalidDocument(String),
    UnsupportedSchema(u32),
    InvalidRecord(String),
    WrongTarget {
        expected: String,
        actual: String,
    },
    WrongHardware {
        expected: String,
    },
    InvalidEncoding(&'static str),
    ArchiveSizeMismatch {
        expected_bytes: u64,
        actual_bytes: u64,
    },
    ArchiveHashMismatch,
    ExpandedSizeMismatch {
        expected_bytes: u64,
        actual_bytes: u64,
    },
    ExpandedHashMismatch,
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    ReadbackIo(io::Error),
}

impl fmt::Display for RecoveryImageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsafePath { kind, path } => {
                write!(
                    formatter,
                    "{kind} is not a safe regular file: {}",
                    path.display()
                )
            }
            Self::InputSize {
                kind,
                maximum_bytes,
            } => write!(formatter, "{kind} must contain 1..={maximum_bytes} bytes"),
            Self::UpdateAuthority(error) => {
                write!(formatter, "recovery update authority rejected: {error}")
            }
            Self::InvalidDocument(error) => {
                write!(formatter, "invalid recovery manifest: {error}")
            }
            Self::UnsupportedSchema(version) => {
                write!(formatter, "unsupported recovery manifest schema {version}")
            }
            Self::InvalidRecord(error) => write!(formatter, "invalid recovery record: {error}"),
            Self::WrongTarget { expected, actual } => {
                write!(
                    formatter,
                    "wrong recovery target: expected {expected}, got {actual}"
                )
            }
            Self::WrongHardware { expected } => {
                write!(
                    formatter,
                    "recovery image does not admit hardware {expected}"
                )
            }
            Self::InvalidEncoding(kind) => write!(formatter, "invalid {kind} encoding"),
            Self::ArchiveSizeMismatch {
                expected_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "recovery archive size mismatch: expected {expected_bytes}, got {actual_bytes}"
            ),
            Self::ArchiveHashMismatch => write!(formatter, "recovery archive hash mismatch"),
            Self::ExpandedSizeMismatch {
                expected_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "expanded recovery image size mismatch: expected {expected_bytes}, got {actual_bytes}"
            ),
            Self::ExpandedHashMismatch => {
                write!(formatter, "expanded recovery image hash mismatch")
            }
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} at {}: {source}", path.display()),
            Self::ReadbackIo(source) => write!(formatter, "read recovery image back: {source}"),
        }
    }
}

impl std::error::Error for RecoveryImageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } | Self::ReadbackIo(source) => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::update_trust::{
        DetachedUpdateSignature, RootTrustAnchor, RootTrustAnchorSet, TrustedUpdateRoot,
    };
    use ed25519_dalek::{Signer, SigningKey};
    use std::io::Cursor;
    use std::sync::atomic::{AtomicU64, Ordering};

    const NOW: u64 = 2_000_000_000;
    const TARGET: &str = "raspberry-pi-5-vcg";
    const HARDWARE: &str = "pi5-rev-1.0-8gb-hailo26";
    const ROOT_DOMAIN: &[u8] = b"VCG-UPDATE-TRUST-ROOT-V1\0";
    const RECOVERY_DOMAIN: &[u8] = b"VCG-RECOVERY-IMAGE-MANIFEST-V1\0";
    const SYSTEM_DOMAIN: &[u8] = b"VCG-SYSTEM-IMAGE-MANIFEST-V1\0";
    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
        manifest: PathBuf,
        archive: PathBuf,
        recovery_key: SigningKey,
        system_key: SigningKey,
        policy: TrustedUpdatePolicy,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir()
                .join(format!("vcg-recovery-image-{}-{id}", std::process::id()));
            fs::create_dir(&root).expect("create fixture");
            let root_key = SigningKey::from_bytes(&[0x41; 32]);
            let recovery_key = SigningKey::from_bytes(&[0x42; 32]);
            let system_key = SigningKey::from_bytes(&[0x43; 32]);
            let root_document = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":4,",
                    "\"expiresUnixSeconds\":{},\"rootThreshold\":1,",
                    "\"rootKeys\":[{{\"keyId\":\"offline-root\",",
                    "\"publicKey\":\"{}\"}}],\"roles\":[",
                    "{{\"channel\":\"recovery\",\"artifact\":\"recovery-image\",",
                    "\"target\":\"{}\",\"threshold\":1,\"keys\":[{{",
                    "\"keyId\":\"recovery-stable\",\"publicKey\":\"{}\"}}]}},",
                    "{{\"channel\":\"stable\",\"artifact\":\"system-image\",",
                    "\"target\":\"{}\",\"threshold\":1,\"keys\":[{{",
                    "\"keyId\":\"system-stable\",\"publicKey\":\"{}\"}}]}}]}}"
                ),
                NOW + 10_000,
                encode_hex(root_key.verifying_key().as_bytes()),
                TARGET,
                encode_hex(recovery_key.verifying_key().as_bytes()),
                TARGET,
                encode_hex(system_key.verifying_key().as_bytes()),
            )
            .into_bytes();
            let root_signatures =
                signatures([sign("offline-root", &root_key, ROOT_DOMAIN, &root_document)]);
            let anchors = RootTrustAnchorSet::new(
                1,
                [
                    RootTrustAnchor::new("offline-root", *root_key.verifying_key().as_bytes())
                        .expect("anchor"),
                ],
            )
            .expect("anchors");
            let trusted_root =
                TrustedUpdateRoot::bootstrap(&root_document, &root_signatures, &anchors, 4, NOW)
                    .expect("trusted root");
            let policy = TrustedUpdatePolicy::new(trusted_root, "recovery", NOW).expect("policy");
            Self {
                manifest: root.join("vcg-recovery.json"),
                archive: root.join("vcg-recovery.img"),
                recovery_key,
                system_key,
                policy,
                root,
            }
        }

        fn write_raw(&self, bytes: &[u8]) {
            fs::write(&self.archive, bytes).expect("write archive");
            let digest = encode_hex(&Sha256::digest(bytes));
            let manifest = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":7,",
                    "\"releaseId\":\"vcg-recovery-7\",\"target\":\"{}\",",
                    "\"compatibleHardwareIds\":[\"{}\"],\"image\":{{",
                    "\"format\":\"raw\",\"archiveSizeBytes\":{},",
                    "\"archiveSha256\":\"{}\",\"expandedSizeBytes\":{},",
                    "\"expandedSha256\":\"{}\",\"minimumMediaBytes\":{}}}}}"
                ),
                TARGET,
                HARDWARE,
                bytes.len(),
                digest,
                bytes.len(),
                digest,
                bytes.len() + 1_024,
            );
            fs::write(&self.manifest, manifest).expect("write manifest");
        }

        fn sign_recovery_manifest(&self) -> DetachedUpdateSignatures {
            let manifest = fs::read(&self.manifest).expect("read manifest");
            signatures([sign(
                "recovery-stable",
                &self.recovery_key,
                RECOVERY_DOMAIN,
                &manifest,
            )])
        }

        fn load(&self) -> Result<VerifiedRecoveryImageRelease, RecoveryImageError> {
            VerifiedRecoveryImageRelease::load(
                &self.manifest,
                &self.sign_recovery_manifest(),
                &self.policy,
                TARGET,
                HARDWARE,
            )
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.root).expect("remove fixture");
        }
    }

    fn sign(
        key_id: &str,
        key: &SigningKey,
        domain: &[u8],
        payload: &[u8],
    ) -> DetachedUpdateSignature {
        let mut message = Vec::from(domain);
        message.extend_from_slice(payload);
        DetachedUpdateSignature::from_hex(key_id, &encode_hex(&key.sign(&message).to_bytes()))
            .expect("signature")
    }

    fn signatures(
        entries: impl IntoIterator<Item = DetachedUpdateSignature>,
    ) -> DetachedUpdateSignatures {
        DetachedUpdateSignatures::new(entries).expect("signature set")
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

    #[test]
    fn verifies_delegated_manifest_archive_and_exact_readback() {
        let fixture = Fixture::new();
        fixture.write_raw(b"complete recovery image");
        let release = fixture.load().expect("release");
        assert_eq!(release.generation(), 7);
        assert_eq!(release.release_id(), "vcg-recovery-7");
        assert_eq!(release.target(), TARGET);
        assert_eq!(release.compatible_hardware_ids(), [HARDWARE]);
        assert_eq!(release.archive_format(), RecoveryArchiveFormat::Raw);
        assert_eq!(release.archive_size_bytes(), 23);
        assert_eq!(release.expanded_size_bytes(), 23);
        assert_eq!(release.minimum_media_bytes(), 1_047);
        assert_eq!(
            release.update_authority().artifact(),
            UpdateArtifactKind::RecoveryImage
        );
        assert_eq!(release.update_authority().channel(), "recovery");
        assert_eq!(
            release.update_authority().signing_key_ids(),
            ["recovery-stable"]
        );

        let verified = release
            .verify_archive(&fixture.archive)
            .expect("verified archive");
        assert_eq!(verified.release(), &release);
        let (release, mut handle) = verified.into_rewound_parts().expect("rewind");
        let mut bytes = Vec::new();
        handle
            .read_to_end(&mut bytes)
            .expect("read retained handle");
        assert_eq!(bytes, b"complete recovery image");
        let readback = release
            .verify_expanded_readback(Cursor::new(&bytes))
            .expect("readback");
        assert_eq!(readback.generation(), 7);
        assert_eq!(readback.release_id(), "vcg-recovery-7");
        assert_eq!(readback.target(), TARGET);
        assert_eq!(readback.expanded_size_bytes(), 23);
        assert_eq!(readback.expanded_sha256(), release.expanded_sha256());
        assert_eq!(readback.manifest_sha256(), release.manifest_sha256());
    }

    #[test]
    fn rejects_tampering_and_cross_role_or_cross_domain_signatures_before_parse() {
        let fixture = Fixture::new();
        fixture.write_raw(b"recovery");
        let manifest = fs::read(&fixture.manifest).expect("manifest");
        let system_signature = signatures([sign(
            "system-stable",
            &fixture.system_key,
            SYSTEM_DOMAIN,
            &manifest,
        )]);
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                &fixture.manifest,
                &system_signature,
                &fixture.policy,
                TARGET,
                HARDWARE,
            ),
            Err(RecoveryImageError::UpdateAuthority(_))
        ));
        let wrong_domain = signatures([sign(
            "recovery-stable",
            &fixture.recovery_key,
            SYSTEM_DOMAIN,
            &manifest,
        )]);
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                &fixture.manifest,
                &wrong_domain,
                &fixture.policy,
                TARGET,
                HARDWARE,
            ),
            Err(RecoveryImageError::UpdateAuthority(_))
        ));

        let valid_signatures = fixture.sign_recovery_manifest();
        let mut tampered = manifest;
        tampered[0] = b'[';
        fs::write(&fixture.manifest, tampered).expect("tamper");
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                &fixture.manifest,
                &valid_signatures,
                &fixture.policy,
                TARGET,
                HARDWARE,
            ),
            Err(RecoveryImageError::UpdateAuthority(_))
        ));
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                &fixture.manifest,
                &fixture.sign_recovery_manifest(),
                &fixture.policy,
                TARGET,
                HARDWARE,
            ),
            Err(RecoveryImageError::InvalidDocument(_))
        ));
    }

    #[test]
    fn binds_exact_target_hardware_and_sorted_unique_compatibility() {
        let fixture = Fixture::new();
        fixture.write_raw(b"image");
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                &fixture.manifest,
                &fixture.sign_recovery_manifest(),
                &fixture.policy,
                TARGET,
                "different-board",
            ),
            Err(RecoveryImageError::WrongHardware { .. })
        ));
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                &fixture.manifest,
                &fixture.sign_recovery_manifest(),
                &fixture.policy,
                "different-target",
                HARDWARE,
            ),
            Err(RecoveryImageError::UpdateAuthority(_))
        ));

        let original = fs::read_to_string(&fixture.manifest).expect("manifest");
        for ids in [r#"["z-board","a-board"]"#, r#"["a-board","a-board"]"#, "[]"] {
            fs::write(
                &fixture.manifest,
                original.replace(&format!("[\"{HARDWARE}\"]"), ids),
            )
            .expect("change hardware IDs");
            assert!(fixture.load().is_err());
        }
    }

    #[test]
    fn accepts_zip_archive_identity_separate_from_expanded_identity() {
        let fixture = Fixture::new();
        let archive = b"synthetic zip bytes";
        let expanded = b"expanded raw image bytes";
        fs::write(&fixture.archive, archive).expect("archive");
        let manifest = format!(
            concat!(
                "{{\"schemaVersion\":1,\"generation\":8,",
                "\"releaseId\":\"vcg-recovery-8\",\"target\":\"{}\",",
                "\"compatibleHardwareIds\":[\"{}\"],\"image\":{{",
                "\"format\":\"raw-zip\",\"archiveSizeBytes\":{},",
                "\"archiveSha256\":\"{}\",\"expandedSizeBytes\":{},",
                "\"expandedSha256\":\"{}\",\"minimumMediaBytes\":{}}}}}"
            ),
            TARGET,
            HARDWARE,
            archive.len(),
            encode_hex(&Sha256::digest(archive)),
            expanded.len(),
            encode_hex(&Sha256::digest(expanded)),
            expanded.len() + 1_024,
        );
        fs::write(&fixture.manifest, manifest).expect("manifest");
        let release = fixture.load().expect("zip release");
        assert_eq!(release.archive_format(), RecoveryArchiveFormat::RawZip);
        release
            .verify_archive(&fixture.archive)
            .expect("archive hash");
        release
            .verify_expanded_readback(Cursor::new(expanded))
            .expect("expanded readback");
    }

    #[test]
    fn rejects_incoherent_raw_identity_bounds_unknown_fields_and_hashes() {
        let fixture = Fixture::new();
        fixture.write_raw(b"image");
        let original = fs::read_to_string(&fixture.manifest).expect("manifest");
        let digest = encode_hex(&Sha256::digest(b"image"));
        let cases = [
            original.replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
            original.replace("\"generation\":7", "\"generation\":0"),
            original.replace("\"format\":\"raw\"", "\"format\":\"raw-tar\""),
            original.replace("\"archiveSizeBytes\":5", "\"archiveSizeBytes\":0"),
            original.replace(
                "\"archiveSizeBytes\":5",
                &format!("\"archiveSizeBytes\":{}", MAX_RECOVERY_ARCHIVE_BYTES + 1),
            ),
            original.replace("\"expandedSizeBytes\":5", "\"expandedSizeBytes\":6"),
            original.replace(
                "\"expandedSizeBytes\":5",
                &format!("\"expandedSizeBytes\":{}", MAX_RECOVERY_EXPANDED_BYTES + 1),
            ),
            original.replace("\"minimumMediaBytes\":1029", "\"minimumMediaBytes\":4"),
            original.replace(
                "\"minimumMediaBytes\":1029",
                &format!("\"minimumMediaBytes\":{}", MAX_RECOVERY_MEDIA_BYTES + 1),
            ),
            original.replace("\"vcg-recovery-7\"", "\"../recovery\""),
            original.replace(TARGET, "different-target"),
            original.replace(&digest, &"A".repeat(64)),
            original.replace(
                "\"releaseId\":\"vcg-recovery-7\"",
                "\"releaseId\":\"vcg-recovery-7\",\"unknown\":true",
            ),
        ];
        for changed in cases {
            fs::write(&fixture.manifest, changed).expect("invalid manifest");
            assert!(fixture.load().is_err());
        }

        let excessive_hardware = (0..=MAX_COMPATIBLE_HARDWARE_IDS)
            .map(|index| format!("\"board-{index:02}\""))
            .collect::<Vec<_>>()
            .join(",");
        fs::write(
            &fixture.manifest,
            original.replace(
                &format!("[\"{HARDWARE}\"]"),
                &format!("[{excessive_hardware}]"),
            ),
        )
        .expect("excessive hardware list");
        assert!(matches!(
            fixture.load(),
            Err(RecoveryImageError::InvalidRecord(_))
        ));
    }

    #[test]
    fn changed_truncated_or_replaced_archive_never_matches() {
        let fixture = Fixture::new();
        fixture.write_raw(b"original recovery image");
        let release = fixture.load().expect("release");
        fs::write(&fixture.archive, b"changed recovery image!").expect("changed");
        assert!(matches!(
            release.verify_archive(&fixture.archive),
            Err(RecoveryImageError::ArchiveHashMismatch)
        ));
        fs::write(&fixture.archive, b"short").expect("short");
        assert!(matches!(
            release.verify_archive(&fixture.archive),
            Err(RecoveryImageError::ArchiveSizeMismatch { .. })
        ));

        fs::write(&fixture.archive, b"original recovery image").expect("restore");
        let verified = release.verify_archive(&fixture.archive).expect("verified");
        let displaced = fixture.root.join("displaced.img");
        fs::rename(&fixture.archive, displaced).expect("displace");
        fs::write(&fixture.archive, b"replacement archive bytes").expect("replace");
        let (_release, mut handle) = verified.into_rewound_parts().expect("rewind");
        let mut bytes = Vec::new();
        handle.read_to_end(&mut bytes).expect("retained bytes");
        assert_eq!(bytes, b"original recovery image");
    }

    #[test]
    fn rejects_short_or_changed_expanded_readback() {
        let fixture = Fixture::new();
        fixture.write_raw(b"complete recovery");
        let release = fixture.load().expect("release");
        assert!(matches!(
            release.verify_expanded_readback(Cursor::new(b"short")),
            Err(RecoveryImageError::ExpandedSizeMismatch { .. })
        ));
        assert!(matches!(
            release.verify_expanded_readback(Cursor::new(b"tampered recovery")),
            Err(RecoveryImageError::ExpandedHashMismatch)
        ));
    }

    #[test]
    fn rejects_relative_nonregular_and_oversized_manifest_paths() {
        let fixture = Fixture::new();
        fixture.write_raw(b"image");
        assert!(matches!(
            VerifiedRecoveryImageRelease::load(
                Path::new("relative.json"),
                &fixture.sign_recovery_manifest(),
                &fixture.policy,
                TARGET,
                HARDWARE,
            ),
            Err(RecoveryImageError::UnsafePath { .. })
        ));
        assert!(matches!(
            fixture
                .load()
                .expect("release")
                .verify_archive(&fixture.root),
            Err(RecoveryImageError::UnsafePath { .. })
        ));
        fs::write(
            &fixture.manifest,
            vec![b' '; usize::try_from(MAX_RECOVERY_MANIFEST_BYTES + 1).expect("limit fits")],
        )
        .expect("oversized");
        assert!(matches!(
            fixture.load(),
            Err(RecoveryImageError::InputSize { .. })
        ));
    }
}
