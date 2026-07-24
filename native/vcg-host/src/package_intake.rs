//! Signature-first package-release admission and bounded TAR extraction.
//!
//! This module verifies the small release descriptor that authorizes download
//! and intake, computes peak storage requirements, verifies a completed
//! archive against those signed bytes, and extracts only a narrow uncompressed
//! TAR layout. Network transfer and generation activation remain separate.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

const DESCRIPTOR_SCHEMA_VERSION: u32 = 1;
const MAX_DESCRIPTOR_BYTES: u64 = 65_536;
const MAX_SIGNATURE_TEXT_BYTES: u64 = 256;
const MAX_PUBLIC_KEY_TEXT_BYTES: u64 = 128;
const MAX_CATALOG_BYTES: u64 = 1_048_576;
const MAX_ARCHIVE_BYTES: u64 = 137_438_953_472;
const MAX_EXPANDED_BYTES: u64 = 206_158_430_208;
const MAX_EXPANDED_FILES: u64 = 262_144;
const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-PACKAGE-RELEASE-V1\0";

/// Archive encoding accepted by the release descriptor.
///
/// Only uncompressed TAR has an implemented extractor. `tar-zstd` is reserved
/// for a future bounded streaming decompressor and cannot be staged today.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PackageArchiveFormat {
    Tar,
    TarZstd,
}

/// Signature-verified authority for one package-generation download.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedPackageRelease {
    generation: u64,
    target: String,
    archive_format: PackageArchiveFormat,
    archive_sha256: [u8; 32],
    archive_size_bytes: u64,
    expanded_size_bytes: u64,
    expanded_file_count: u64,
    catalog_sha256: [u8; 32],
    catalog_size_bytes: u64,
}

/// Capacity result safe to expose to a host-owned update coordinator.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CapacityAdmission {
    pub available_bytes: u64,
    pub archive_bytes: u64,
    pub expanded_bytes: u64,
    pub reserve_bytes: u64,
    pub remaining_after_peak_bytes: u64,
}

/// Hard extraction bounds supplied by the host-owned update coordinator.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageIntakeLimits {
    archive_bytes: u64,
    expanded_bytes: u64,
    file_bytes: u64,
    entries: u64,
}

impl PackageIntakeLimits {
    /// Creates one internally consistent extraction limit set.
    ///
    /// # Errors
    ///
    /// Rejects zero limits and a per-file limit larger than the total
    /// expanded-byte limit.
    pub fn new(
        maximum_archive_bytes: u64,
        maximum_expanded_bytes: u64,
        maximum_file_bytes: u64,
        maximum_entries: u64,
    ) -> Result<Self, PackageIntakeError> {
        if maximum_archive_bytes == 0
            || maximum_expanded_bytes == 0
            || maximum_file_bytes == 0
            || maximum_entries == 0
            || maximum_archive_bytes < maximum_expanded_bytes
            || maximum_file_bytes > maximum_expanded_bytes
        {
            return Err(PackageIntakeError::InvalidLimits);
        }
        Ok(Self {
            archive_bytes: maximum_archive_bytes,
            expanded_bytes: maximum_expanded_bytes,
            file_bytes: maximum_file_bytes,
            entries: maximum_entries,
        })
    }
}

impl Default for PackageIntakeLimits {
    fn default() -> Self {
        Self {
            archive_bytes: MAX_ARCHIVE_BYTES,
            expanded_bytes: MAX_ARCHIVE_BYTES,
            file_bytes: MAX_ARCHIVE_BYTES,
            entries: MAX_EXPANDED_FILES,
        }
    }
}

/// Bounded facts measured while extracting one package release.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageIntakeStats {
    pub entry_count: u64,
    pub file_count: u64,
    pub expanded_bytes: u64,
}

/// Extracts one uncompressed package TAR into an empty disposable directory.
///
/// Only regular files are accepted; parent directories are implicit. Paths must be portable,
/// case-insensitively unique, and confined to the fixed generation layout.
/// Links, devices, FIFOs, sparse-size escapes, and metadata-driven ownership
/// changes are rejected or ignored. Callers own cleanup of the disposable
/// destination after any error.
///
/// # Errors
///
/// Rejects unsafe paths, non-regular archives, nonempty destinations,
/// unsupported entry types, duplicate/colliding names, missing required
/// layout, or any configured count/size bound.
#[allow(
    clippy::too_many_lines,
    reason = "the sequential TAR state machine is kept together for security review"
)]
pub fn extract_package_tar(
    archive_path: &Path,
    destination: &Path,
    limits: PackageIntakeLimits,
) -> Result<PackageIntakeStats, PackageIntakeError> {
    require_absolute_regular_file("package archive", archive_path)?;
    require_absolute_directory("package intake destination", destination)?;
    if fs::read_dir(destination)
        .map_err(|source| PackageIntakeError::Io {
            operation: "read package intake destination",
            path: destination.to_owned(),
            source,
        })?
        .next()
        .is_some()
    {
        return Err(PackageIntakeError::DestinationNotEmpty(
            destination.to_owned(),
        ));
    }

    let archive_bytes = fs::metadata(archive_path)
        .map_err(|source| PackageIntakeError::Io {
            operation: "inspect package archive",
            path: archive_path.to_owned(),
            source,
        })?
        .len();
    if archive_bytes > limits.archive_bytes {
        return Err(PackageIntakeError::ArchiveTooLarge {
            actual_bytes: archive_bytes,
            maximum_bytes: limits.archive_bytes,
        });
    }

    let file = File::open(archive_path).map_err(|source| PackageIntakeError::Io {
        operation: "open package archive",
        path: archive_path.to_owned(),
        source,
    })?;
    let mut archive = tar::Archive::new(file);
    let entries = archive.entries().map_err(|source| PackageIntakeError::Io {
        operation: "read package archive",
        path: archive_path.to_owned(),
        source,
    })?;
    let mut stats = PackageIntakeStats {
        entry_count: 0,
        file_count: 0,
        expanded_bytes: 0,
    };
    let mut exact_paths = HashSet::new();
    let mut folded_paths = HashMap::<String, String>::new();
    let mut saw_catalog = false;
    let mut saw_signature = false;
    let mut saw_install = false;

    for entry in entries {
        let mut entry = entry.map_err(|source| PackageIntakeError::Io {
            operation: "read package archive entry",
            path: archive_path.to_owned(),
            source,
        })?;
        stats.entry_count = stats
            .entry_count
            .checked_add(1)
            .ok_or(PackageIntakeError::EntryLimitExceeded(limits.entries))?;
        if stats.entry_count > limits.entries {
            return Err(PackageIntakeError::EntryLimitExceeded(limits.entries));
        }

        let has_pax = entry
            .pax_extensions()
            .map_err(|source| PackageIntakeError::Io {
                operation: "inspect package archive metadata",
                path: archive_path.to_owned(),
                source,
            })?
            .is_some();
        if has_pax {
            return Err(PackageIntakeError::UnsupportedEntry {
                path: "<extended-metadata>".to_owned(),
                kind: "pax".to_owned(),
            });
        }
        let raw_path = entry.path_bytes();
        if raw_path.as_ref() != entry.header().path_bytes().as_ref() {
            return Err(PackageIntakeError::UnsupportedEntry {
                path: "<extended-path>".to_owned(),
                kind: "gnu-or-pax-path".to_owned(),
            });
        }
        let trailing_slash = raw_path.as_ref().ends_with(b"/");
        let relative = portable_entry_path(raw_path.as_ref())?;
        let display = relative
            .to_str()
            .ok_or_else(|| PackageIntakeError::UnsafeArchivePath("<non-utf8>".to_owned()))?
            .replace('\\', "/");
        if !exact_paths.insert(display.clone()) {
            return Err(PackageIntakeError::DuplicateEntry(display));
        }
        let mut prefix = String::new();
        for component in display.split('/') {
            if !prefix.is_empty() {
                prefix.push('/');
            }
            prefix.push_str(component);
            let folded = prefix.to_ascii_lowercase();
            if let Some(existing) = folded_paths.insert(folded, prefix.clone())
                && existing != prefix
            {
                return Err(PackageIntakeError::PathCollision(format!(
                    "{existing} conflicts with {prefix}"
                )));
            }
        }

        let destination_path = destination.join(&relative);
        let entry_type = entry.header().entry_type();
        if !entry_type.is_file() {
            return Err(PackageIntakeError::UnsupportedEntry {
                path: display,
                kind: format!("{entry_type:?}"),
            });
        }
        if trailing_slash || relative == Path::new("install") {
            return Err(PackageIntakeError::UnsafeArchivePath(display));
        }

        let size = entry.size();
        if size > limits.file_bytes {
            return Err(PackageIntakeError::FileTooLarge {
                path: display,
                actual_bytes: size,
                maximum_bytes: limits.file_bytes,
            });
        }
        stats.expanded_bytes = stats.expanded_bytes.checked_add(size).ok_or(
            PackageIntakeError::ExpandedSizeExceeded {
                maximum_bytes: limits.expanded_bytes,
            },
        )?;
        if stats.expanded_bytes > limits.expanded_bytes {
            return Err(PackageIntakeError::ExpandedSizeExceeded {
                maximum_bytes: limits.expanded_bytes,
            });
        }
        stats.file_count += 1;

        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent).map_err(|source| PackageIntakeError::Io {
                operation: "create package archive parent",
                path: parent.to_owned(),
                source,
            })?;
        }
        let archive_mode = entry
            .header()
            .mode()
            .map_err(|source| PackageIntakeError::Io {
                operation: "read package archive file mode",
                path: destination_path.clone(),
                source,
            })?;
        if archive_mode & !0o777 != 0 {
            return Err(PackageIntakeError::UnsafeMode {
                path: display,
                mode: archive_mode,
            });
        }
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination_path)
            .map_err(|source| PackageIntakeError::Io {
                operation: "create package archive file",
                path: destination_path.clone(),
                source,
            })?;
        let copied =
            io::copy(&mut entry, &mut output).map_err(|source| PackageIntakeError::Io {
                operation: "extract package archive file",
                path: destination_path.clone(),
                source,
            })?;
        if copied != size {
            return Err(PackageIntakeError::EntrySizeMismatch {
                path: display,
                expected_bytes: size,
                actual_bytes: copied,
            });
        }
        set_file_permissions(&destination_path, archive_mode)?;
        output.sync_all().map_err(|source| PackageIntakeError::Io {
            operation: "synchronize package archive file",
            path: destination_path,
            source,
        })?;

        match relative.as_path() {
            path if path == Path::new("installed-catalog.json") => saw_catalog = true,
            path if path == Path::new("installed-catalog.sig") => saw_signature = true,
            path if path.starts_with("install") => saw_install = true,
            _ => {}
        }
    }

    for (present, required) in [
        (saw_catalog, "installed-catalog.json"),
        (saw_signature, "installed-catalog.sig"),
        (saw_install, "install"),
    ] {
        if !present {
            return Err(PackageIntakeError::MissingRequiredEntry(required));
        }
    }
    sync_directory_tree(destination)?;
    Ok(stats)
}

fn portable_entry_path(bytes: &[u8]) -> Result<PathBuf, PackageIntakeError> {
    let raw_text = std::str::from_utf8(bytes)
        .map_err(|_| PackageIntakeError::UnsafeArchivePath("<non-utf8>".to_owned()))?;
    let text = raw_text.strip_suffix('/').unwrap_or(raw_text);
    if text.is_empty()
        || text.len() > 512
        || text.starts_with('/')
        || text.ends_with('/')
        || text.contains('\\')
        || text.contains('\0')
    {
        return Err(PackageIntakeError::UnsafeArchivePath(text.to_owned()));
    }
    let components: Vec<&str> = text.split('/').collect();
    if components.len() > 32
        || components.iter().any(|component| {
            component.is_empty()
                || *component == "."
                || *component == ".."
                || component.len() > 128
                || component.ends_with(['.', ' '])
                || component.contains(':')
                || !component
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
                || is_windows_reserved_name(component)
        })
    {
        return Err(PackageIntakeError::UnsafeArchivePath(text.to_owned()));
    }
    let allowed = matches!(
        components.as_slice(),
        ["installed-catalog.json" | "installed-catalog.sig"] | ["install", ..]
    );
    if !allowed {
        return Err(PackageIntakeError::UnsafeArchivePath(text.to_owned()));
    }
    Ok(components.iter().collect())
}

fn is_windows_reserved_name(component: &str) -> bool {
    let stem = component
        .split_once('.')
        .map_or(component, |(stem, _)| stem)
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem.strip_prefix("COM").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
        || stem.strip_prefix("LPT").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
}

#[cfg(unix)]
fn set_file_permissions(path: &Path, archive_mode: u32) -> Result<(), PackageIntakeError> {
    use std::os::unix::fs::PermissionsExt;

    let mode = if archive_mode & 0o111 == 0 {
        0o644
    } else {
        0o755
    };
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(|source| {
        PackageIntakeError::Io {
            operation: "normalize package archive file permissions",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn set_file_permissions(_path: &Path, _archive_mode: u32) -> Result<(), PackageIntakeError> {
    Ok(())
}

#[cfg(unix)]
fn sync_directory_tree(path: &Path) -> Result<(), PackageIntakeError> {
    for entry in fs::read_dir(path).map_err(|source| PackageIntakeError::Io {
        operation: "read extracted package directory",
        path: path.to_owned(),
        source,
    })? {
        let entry = entry.map_err(|source| PackageIntakeError::Io {
            operation: "read extracted package entry",
            path: path.to_owned(),
            source,
        })?;
        let entry_path = entry.path();
        if entry
            .file_type()
            .map_err(|source| PackageIntakeError::Io {
                operation: "inspect extracted package entry",
                path: entry_path.clone(),
                source,
            })?
            .is_dir()
        {
            sync_directory_tree(&entry_path)?;
        }
    }
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| PackageIntakeError::Io {
            operation: "synchronize extracted package directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn sync_directory_tree(_path: &Path) -> Result<(), PackageIntakeError> {
    Ok(())
}

impl VerifiedPackageRelease {
    /// Loads and verifies one bounded signed release descriptor.
    ///
    /// Signature verification precedes JSON parsing. The descriptor and key
    /// locations are host configuration, never launcher or package input.
    ///
    /// # Errors
    ///
    /// Rejects relative or non-regular inputs, oversized files, noncanonical
    /// key/signature encodings, invalid signatures, unknown fields, wrong
    /// target/schema/format, and unsafe size or file-count bounds.
    pub fn load(
        descriptor_path: &Path,
        signature_path: &Path,
        public_key_path: &Path,
    ) -> Result<Self, PackageIntakeError> {
        for (kind, path) in [
            ("release descriptor", descriptor_path),
            ("release descriptor signature", signature_path),
            ("release public key", public_key_path),
        ] {
            require_absolute_regular_file(kind, path)?;
        }

        let descriptor_bytes =
            read_bounded(descriptor_path, MAX_DESCRIPTOR_BYTES, "release descriptor")?;
        let signature_text = read_bounded(
            signature_path,
            MAX_SIGNATURE_TEXT_BYTES,
            "release descriptor signature",
        )?;
        let public_key_text = read_bounded(
            public_key_path,
            MAX_PUBLIC_KEY_TEXT_BYTES,
            "release public key",
        )?;
        let signature_bytes = decode_canonical_hex::<64>(
            trim_single_line(&signature_text, "release descriptor signature")?,
            "release descriptor signature",
        )?;
        let public_key_bytes = decode_canonical_hex::<32>(
            trim_single_line(&public_key_text, "release public key")?,
            "release public key",
        )?;
        let signature = Signature::from_bytes(&signature_bytes);
        let verifying_key = VerifyingKey::from_bytes(&public_key_bytes)
            .map_err(|_| PackageIntakeError::InvalidEncoding("release public key"))?;
        let mut signed_message =
            Vec::with_capacity(SIGNED_MESSAGE_PREFIX.len() + descriptor_bytes.len());
        signed_message.extend_from_slice(SIGNED_MESSAGE_PREFIX);
        signed_message.extend_from_slice(&descriptor_bytes);
        verifying_key
            .verify_strict(&signed_message, &signature)
            .map_err(|_| PackageIntakeError::SignatureRejected)?;

        let document: ReleaseDescriptorDocument = serde_json::from_slice(&descriptor_bytes)
            .map_err(|error| PackageIntakeError::InvalidDocument(error.to_string()))?;
        Self::from_document(document)
    }

    fn from_document(document: ReleaseDescriptorDocument) -> Result<Self, PackageIntakeError> {
        if document.schema_version != DESCRIPTOR_SCHEMA_VERSION {
            return Err(PackageIntakeError::UnsupportedSchema(
                document.schema_version,
            ));
        }
        if document.generation == 0 {
            return Err(PackageIntakeError::InvalidRecord(
                "generation must be greater than zero".to_owned(),
            ));
        }
        let expected_target = current_target();
        if document.target != expected_target {
            return Err(PackageIntakeError::WrongTarget {
                expected: expected_target,
                actual: document.target,
            });
        }
        if !(1..=MAX_ARCHIVE_BYTES).contains(&document.archive.size_bytes) {
            return Err(PackageIntakeError::InvalidRecord(format!(
                "archive size must be within 1..={MAX_ARCHIVE_BYTES} bytes"
            )));
        }
        if !(1..=MAX_EXPANDED_BYTES).contains(&document.expanded.size_bytes) {
            return Err(PackageIntakeError::InvalidRecord(format!(
                "expanded size must be within 1..={MAX_EXPANDED_BYTES} bytes"
            )));
        }
        if !(1..=MAX_EXPANDED_FILES).contains(&document.expanded.file_count) {
            return Err(PackageIntakeError::InvalidRecord(format!(
                "expanded file count must be within 1..={MAX_EXPANDED_FILES}"
            )));
        }
        if !(1..=MAX_CATALOG_BYTES).contains(&document.catalog.size_bytes) {
            return Err(PackageIntakeError::InvalidRecord(format!(
                "catalog size must be within 1..={MAX_CATALOG_BYTES} bytes"
            )));
        }
        if document.catalog.size_bytes > document.expanded.size_bytes {
            return Err(PackageIntakeError::InvalidRecord(
                "catalog size exceeds the complete expanded release".to_owned(),
            ));
        }
        if matches!(document.archive.format, ArchiveFormatDocument::Tar)
            && document.archive.size_bytes < document.expanded.size_bytes
        {
            return Err(PackageIntakeError::InvalidRecord(
                "uncompressed TAR size is smaller than its expanded files".to_owned(),
            ));
        }
        document
            .archive
            .size_bytes
            .checked_add(document.expanded.size_bytes)
            .ok_or_else(|| {
                PackageIntakeError::InvalidRecord(
                    "archive and expanded sizes overflow capacity accounting".to_owned(),
                )
            })?;

        Ok(Self {
            generation: document.generation,
            target: document.target,
            archive_format: match document.archive.format {
                ArchiveFormatDocument::Tar => PackageArchiveFormat::Tar,
                ArchiveFormatDocument::TarZstd => PackageArchiveFormat::TarZstd,
            },
            archive_sha256: decode_canonical_hex::<32>(
                document.archive.sha256.as_bytes(),
                "archive sha256",
            )?,
            archive_size_bytes: document.archive.size_bytes,
            expanded_size_bytes: document.expanded.size_bytes,
            expanded_file_count: document.expanded.file_count,
            catalog_sha256: decode_canonical_hex::<32>(
                document.catalog.sha256.as_bytes(),
                "catalog sha256",
            )?,
            catalog_size_bytes: document.catalog.size_bytes,
        })
    }

    #[must_use]
    pub fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    #[must_use]
    pub fn archive_format(&self) -> PackageArchiveFormat {
        self.archive_format
    }

    #[must_use]
    pub fn archive_size_bytes(&self) -> u64 {
        self.archive_size_bytes
    }

    #[must_use]
    pub fn expanded_size_bytes(&self) -> u64 {
        self.expanded_size_bytes
    }

    #[must_use]
    pub fn expanded_file_count(&self) -> u64 {
        self.expanded_file_count
    }

    #[must_use]
    pub fn catalog_sha256(&self) -> [u8; 32] {
        self.catalog_sha256
    }

    #[must_use]
    pub fn catalog_size_bytes(&self) -> u64 {
        self.catalog_size_bytes
    }

    /// Produces extraction limits exactly bounded by the signed release.
    ///
    /// # Errors
    ///
    /// Rejects an archive format without an implemented bounded extractor.
    pub fn extraction_limits(&self) -> Result<PackageIntakeLimits, PackageIntakeError> {
        if self.archive_format != PackageArchiveFormat::Tar {
            return Err(PackageIntakeError::UnsupportedArchiveFormat);
        }
        PackageIntakeLimits::new(
            self.archive_size_bytes,
            self.expanded_size_bytes,
            self.expanded_size_bytes,
            self.expanded_file_count,
        )
    }

    /// Checks the peak archive-plus-extraction requirement against a supplied
    /// capacity snapshot.
    ///
    /// A nonzero reserve is mandatory. This arithmetic-only form makes
    /// low-space behavior deterministic and testable; normal intake should use
    /// [`Self::admit_capacity_at`] to obtain the snapshot from the target
    /// filesystem.
    ///
    /// # Errors
    ///
    /// Rejects zero reserve, arithmetic overflow, or insufficient space.
    pub fn admit_capacity(
        &self,
        available_bytes: u64,
        reserve_bytes: u64,
    ) -> Result<CapacityAdmission, PackageIntakeError> {
        if reserve_bytes == 0 {
            return Err(PackageIntakeError::InvalidReserve);
        }
        let peak_without_reserve = self
            .archive_size_bytes
            .checked_add(self.expanded_size_bytes)
            .ok_or(PackageIntakeError::CapacityOverflow)?;
        let required_bytes = peak_without_reserve
            .checked_add(reserve_bytes)
            .ok_or(PackageIntakeError::CapacityOverflow)?;
        if available_bytes < required_bytes {
            return Err(PackageIntakeError::InsufficientCapacity {
                available_bytes,
                required_bytes,
            });
        }
        Ok(CapacityAdmission {
            available_bytes,
            archive_bytes: self.archive_size_bytes,
            expanded_bytes: self.expanded_size_bytes,
            reserve_bytes,
            remaining_after_peak_bytes: available_bytes - peak_without_reserve,
        })
    }

    /// Checks extraction capacity after the archive already exists.
    ///
    /// The capacity snapshot already reflects the completed archive, so this
    /// phase counts only expanded bytes plus reserved headroom.
    ///
    /// # Errors
    ///
    /// Rejects zero reserve, arithmetic overflow, or insufficient space.
    pub fn admit_extraction_capacity(
        &self,
        available_bytes: u64,
        reserve_bytes: u64,
    ) -> Result<CapacityAdmission, PackageIntakeError> {
        if reserve_bytes == 0 {
            return Err(PackageIntakeError::InvalidReserve);
        }
        let required_bytes = self
            .expanded_size_bytes
            .checked_add(reserve_bytes)
            .ok_or(PackageIntakeError::CapacityOverflow)?;
        if available_bytes < required_bytes {
            return Err(PackageIntakeError::InsufficientCapacity {
                available_bytes,
                required_bytes,
            });
        }
        Ok(CapacityAdmission {
            available_bytes,
            archive_bytes: 0,
            expanded_bytes: self.expanded_size_bytes,
            reserve_bytes,
            remaining_after_peak_bytes: available_bytes - self.expanded_size_bytes,
        })
    }

    /// Reads available bytes for the filesystem containing an existing
    /// host-owned staging directory and applies peak-capacity admission.
    ///
    /// This is a point-in-time admission check, not a disk reservation. The
    /// update coordinator must serialize competing writers and repeat checks
    /// at bounded transfer/extraction boundaries.
    ///
    /// # Errors
    ///
    /// Rejects unsafe staging paths, filesystem-stat failures, invalid reserve,
    /// overflow, or insufficient capacity.
    pub fn admit_capacity_at(
        &self,
        staging_root: &Path,
        reserve_bytes: u64,
    ) -> Result<CapacityAdmission, PackageIntakeError> {
        require_absolute_directory("package staging root", staging_root)?;
        let available_bytes =
            fs4::available_space(staging_root).map_err(|source| PackageIntakeError::Io {
                operation: "read package staging capacity",
                path: staging_root.to_owned(),
                source,
            })?;
        self.admit_capacity(available_bytes, reserve_bytes)
    }

    /// Reads current staging-filesystem capacity for extraction after the
    /// archive download.
    ///
    /// # Errors
    ///
    /// Rejects unsafe staging paths, filesystem-stat failures, invalid reserve,
    /// overflow, or insufficient capacity.
    pub fn admit_extraction_capacity_at(
        &self,
        staging_root: &Path,
        reserve_bytes: u64,
    ) -> Result<CapacityAdmission, PackageIntakeError> {
        require_absolute_directory("package staging root", staging_root)?;
        let available_bytes =
            fs4::available_space(staging_root).map_err(|source| PackageIntakeError::Io {
                operation: "read package staging capacity",
                path: staging_root.to_owned(),
                source,
            })?;
        self.admit_extraction_capacity(available_bytes, reserve_bytes)
    }

    /// Verifies a completed archive against its signed exact length and hash.
    ///
    /// # Errors
    ///
    /// Rejects relative, symlinked, non-regular, missing, wrong-sized, changed,
    /// or unreadable archives.
    pub fn verify_archive(&self, archive_path: &Path) -> Result<(), PackageIntakeError> {
        require_absolute_regular_file("package archive", archive_path)?;
        let metadata = fs::metadata(archive_path).map_err(|source| PackageIntakeError::Io {
            operation: "inspect package archive",
            path: archive_path.to_owned(),
            source,
        })?;
        if metadata.len() != self.archive_size_bytes {
            return Err(PackageIntakeError::ArchiveSizeMismatch {
                expected_bytes: self.archive_size_bytes,
                actual_bytes: metadata.len(),
            });
        }
        let actual = sha256_file(archive_path)?;
        if actual != self.archive_sha256 {
            return Err(PackageIntakeError::ArchiveHashMismatch);
        }
        Ok(())
    }

    /// Verifies the extracted catalog's exact signed length and digest before
    /// the generation store interprets it.
    ///
    /// # Errors
    ///
    /// Rejects unsafe, wrong-sized, changed, or unreadable catalog files.
    pub fn verify_catalog(&self, catalog_path: &Path) -> Result<(), PackageIntakeError> {
        require_absolute_regular_file("installed catalog", catalog_path)?;
        let actual_bytes = fs::metadata(catalog_path)
            .map_err(|source| PackageIntakeError::Io {
                operation: "inspect installed catalog",
                path: catalog_path.to_owned(),
                source,
            })?
            .len();
        if actual_bytes != self.catalog_size_bytes {
            return Err(PackageIntakeError::CatalogSizeMismatch {
                expected_bytes: self.catalog_size_bytes,
                actual_bytes,
            });
        }
        if sha256_file(catalog_path)? != self.catalog_sha256 {
            return Err(PackageIntakeError::CatalogHashMismatch);
        }
        Ok(())
    }

    /// Verifies and extracts one descriptor-bound uncompressed package TAR.
    ///
    /// Host limits may tighten but never widen the signed bounds. The measured
    /// regular-file count and payload bytes must equal the signed expanded
    /// facts, and the extracted catalog must match its separately signed
    /// length and digest. The caller owns a private empty destination and must
    /// remove it after any error.
    ///
    /// # Errors
    ///
    /// Rejects unsupported formats, archive changes, unsafe entries, any host
    /// or signed bound violation, and expanded/catalog evidence mismatches.
    pub fn extract_verified(
        &self,
        archive_path: &Path,
        destination: &Path,
        host_limits: PackageIntakeLimits,
    ) -> Result<PackageIntakeStats, PackageIntakeError> {
        self.verify_archive(archive_path)?;
        let signed_limits = self.extraction_limits()?;
        let effective_limits = PackageIntakeLimits::new(
            host_limits.archive_bytes.min(signed_limits.archive_bytes),
            host_limits.expanded_bytes.min(signed_limits.expanded_bytes),
            host_limits.file_bytes.min(signed_limits.file_bytes),
            host_limits.entries.min(signed_limits.entries),
        )?;
        let stats = extract_package_tar(archive_path, destination, effective_limits)?;
        if stats.expanded_bytes != self.expanded_size_bytes
            || stats.file_count != self.expanded_file_count
            || stats.entry_count != self.expanded_file_count
        {
            return Err(PackageIntakeError::ExpandedFactsMismatch {
                expected_bytes: self.expanded_size_bytes,
                actual_bytes: stats.expanded_bytes,
                expected_files: self.expanded_file_count,
                actual_files: stats.file_count,
            });
        }
        self.verify_catalog(&destination.join("installed-catalog.json"))?;
        Ok(stats)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReleaseDescriptorDocument {
    schema_version: u32,
    generation: u64,
    target: String,
    archive: ArchiveDocument,
    expanded: ExpandedDocument,
    catalog: CatalogDocument,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArchiveDocument {
    format: ArchiveFormatDocument,
    sha256: String,
    size_bytes: u64,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum ArchiveFormatDocument {
    Tar,
    TarZstd,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExpandedDocument {
    size_bytes: u64,
    file_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CatalogDocument {
    sha256: String,
    size_bytes: u64,
}

fn current_target() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}

fn require_absolute_regular_file(
    kind: &'static str,
    path: &Path,
) -> Result<(), PackageIntakeError> {
    if !path.is_absolute() {
        return Err(PackageIntakeError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| PackageIntakeError::Io {
        operation: "inspect package intake file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() {
        return Err(PackageIntakeError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn require_absolute_directory(kind: &'static str, path: &Path) -> Result<(), PackageIntakeError> {
    if !path.is_absolute() {
        return Err(PackageIntakeError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| PackageIntakeError::Io {
        operation: "inspect package intake directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() {
        return Err(PackageIntakeError::UnsafePath {
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
) -> Result<Vec<u8>, PackageIntakeError> {
    let metadata = fs::metadata(path).map_err(|source| PackageIntakeError::Io {
        operation: "inspect package intake file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.len() > maximum_bytes {
        return Err(PackageIntakeError::InputTooLarge {
            kind,
            maximum_bytes,
        });
    }
    let file = File::open(path).map_err(|source| PackageIntakeError::Io {
        operation: "open package intake file",
        path: path.to_owned(),
        source,
    })?;
    let capacity =
        usize::try_from(metadata.len()).map_err(|_| PackageIntakeError::InputTooLarge {
            kind,
            maximum_bytes,
        })?;
    let mut bytes = Vec::with_capacity(capacity);
    file.take(maximum_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| PackageIntakeError::Io {
            operation: "read package intake file",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum_bytes {
        return Err(PackageIntakeError::InputTooLarge {
            kind,
            maximum_bytes,
        });
    }
    Ok(bytes)
}

fn trim_single_line<'a>(
    bytes: &'a [u8],
    kind: &'static str,
) -> Result<&'a [u8], PackageIntakeError> {
    let trimmed = bytes.strip_suffix(b"\n").unwrap_or(bytes);
    if trimmed.contains(&b'\n') || trimmed.contains(&b'\r') {
        return Err(PackageIntakeError::InvalidEncoding(kind));
    }
    Ok(trimmed)
}

fn decode_canonical_hex<const N: usize>(
    bytes: &[u8],
    kind: &'static str,
) -> Result<[u8; N], PackageIntakeError> {
    if bytes.len() != N * 2 {
        return Err(PackageIntakeError::InvalidEncoding(kind));
    }
    let mut output = [0_u8; N];
    for (index, pair) in bytes.chunks_exact(2).enumerate() {
        output[index] = (decode_nibble(pair[0], kind)? << 4) | decode_nibble(pair[1], kind)?;
    }
    Ok(output)
}

fn decode_nibble(byte: u8, kind: &'static str) -> Result<u8, PackageIntakeError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(PackageIntakeError::InvalidEncoding(kind)),
    }
}

fn sha256_file(path: &Path) -> Result<[u8; 32], PackageIntakeError> {
    let mut file = File::open(path).map_err(|source| PackageIntakeError::Io {
        operation: "open package archive",
        path: path.to_owned(),
        source,
    })?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 8 * 1_024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|source| PackageIntakeError::Io {
                operation: "hash package archive",
                path: path.to_owned(),
                source,
            })?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(digest.finalize().into())
}

/// Package-release intake failure.
#[derive(Debug)]
pub enum PackageIntakeError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InputTooLarge {
        kind: &'static str,
        maximum_bytes: u64,
    },
    InvalidEncoding(&'static str),
    SignatureRejected,
    InvalidDocument(String),
    UnsupportedSchema(u32),
    WrongTarget {
        expected: String,
        actual: String,
    },
    InvalidRecord(String),
    InvalidReserve,
    CapacityOverflow,
    InsufficientCapacity {
        available_bytes: u64,
        required_bytes: u64,
    },
    ArchiveSizeMismatch {
        expected_bytes: u64,
        actual_bytes: u64,
    },
    ArchiveHashMismatch,
    UnsupportedArchiveFormat,
    CatalogSizeMismatch {
        expected_bytes: u64,
        actual_bytes: u64,
    },
    CatalogHashMismatch,
    ExpandedFactsMismatch {
        expected_bytes: u64,
        actual_bytes: u64,
        expected_files: u64,
        actual_files: u64,
    },
    InvalidLimits,
    ArchiveTooLarge {
        actual_bytes: u64,
        maximum_bytes: u64,
    },
    DestinationNotEmpty(PathBuf),
    UnsupportedEntry {
        path: String,
        kind: String,
    },
    DuplicateEntry(String),
    PathCollision(String),
    UnsafeArchivePath(String),
    FileTooLarge {
        path: String,
        actual_bytes: u64,
        maximum_bytes: u64,
    },
    UnsafeMode {
        path: String,
        mode: u32,
    },
    ExpandedSizeExceeded {
        maximum_bytes: u64,
    },
    EntryLimitExceeded(u64),
    EntrySizeMismatch {
        path: String,
        expected_bytes: u64,
        actual_bytes: u64,
    },
    MissingRequiredEntry(&'static str),
}

impl fmt::Display for PackageIntakeError {
    #[allow(
        clippy::too_many_lines,
        reason = "each fail-closed intake variant has one explicit operator message"
    )]
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
            Self::InputTooLarge {
                kind,
                maximum_bytes,
            } => write!(formatter, "{kind} exceeds {maximum_bytes} bytes"),
            Self::InvalidEncoding(kind) => write!(formatter, "{kind} encoding is invalid"),
            Self::SignatureRejected => formatter.write_str("release descriptor signature rejected"),
            Self::InvalidDocument(error) => {
                write!(formatter, "release descriptor is invalid: {error}")
            }
            Self::UnsupportedSchema(version) => {
                write!(
                    formatter,
                    "release descriptor schema {version} is unsupported"
                )
            }
            Self::WrongTarget { expected, actual } => {
                write!(
                    formatter,
                    "release target {actual} does not match {expected}"
                )
            }
            Self::InvalidRecord(error) => {
                write!(formatter, "release descriptor record is invalid: {error}")
            }
            Self::InvalidReserve => {
                formatter.write_str("package capacity reserve must be greater than zero")
            }
            Self::CapacityOverflow => {
                formatter.write_str("package peak capacity calculation overflowed")
            }
            Self::InsufficientCapacity {
                available_bytes,
                required_bytes,
            } => write!(
                formatter,
                "package intake requires {required_bytes} available bytes but only {available_bytes} are available"
            ),
            Self::ArchiveSizeMismatch {
                expected_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "package archive is {actual_bytes} bytes but descriptor requires {expected_bytes}"
            ),
            Self::ArchiveHashMismatch => {
                formatter.write_str("package archive hash does not match release descriptor")
            }
            Self::UnsupportedArchiveFormat => {
                formatter.write_str("package archive format has no bounded extractor")
            }
            Self::CatalogSizeMismatch {
                expected_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "installed catalog is {actual_bytes} bytes but descriptor requires {expected_bytes}"
            ),
            Self::CatalogHashMismatch => {
                formatter.write_str("installed catalog hash does not match release descriptor")
            }
            Self::ExpandedFactsMismatch {
                expected_bytes,
                actual_bytes,
                expected_files,
                actual_files,
            } => write!(
                formatter,
                "package archive expanded to {actual_bytes} bytes/{actual_files} files but descriptor requires {expected_bytes} bytes/{expected_files} files"
            ),
            Self::InvalidLimits => formatter.write_str("package intake limits are invalid"),
            Self::ArchiveTooLarge {
                actual_bytes,
                maximum_bytes,
            } => write!(
                formatter,
                "package archive is {actual_bytes} bytes and exceeds {maximum_bytes} bytes"
            ),
            Self::DestinationNotEmpty(path) => write!(
                formatter,
                "package intake destination is not empty: {}",
                path.display()
            ),
            Self::UnsupportedEntry { path, kind } => {
                write!(
                    formatter,
                    "package archive entry {path} has unsupported type {kind}"
                )
            }
            Self::DuplicateEntry(path) => {
                write!(formatter, "package archive contains duplicate entry {path}")
            }
            Self::PathCollision(path) => {
                write!(
                    formatter,
                    "package archive contains a portable path collision: {path}"
                )
            }
            Self::UnsafeArchivePath(path) => {
                write!(formatter, "package archive path is unsafe: {path}")
            }
            Self::FileTooLarge {
                path,
                actual_bytes,
                maximum_bytes,
            } => write!(
                formatter,
                "package archive file {path} is {actual_bytes} bytes and exceeds {maximum_bytes} bytes"
            ),
            Self::UnsafeMode { path, mode } => {
                write!(
                    formatter,
                    "package archive file {path} has unsafe mode {mode:o}"
                )
            }
            Self::ExpandedSizeExceeded { maximum_bytes } => write!(
                formatter,
                "package archive expanded bytes exceed {maximum_bytes}"
            ),
            Self::EntryLimitExceeded(maximum) => {
                write!(formatter, "package archive exceeds {maximum} entries")
            }
            Self::EntrySizeMismatch {
                path,
                expected_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "package archive entry {path} yielded {actual_bytes} bytes but declared {expected_bytes}"
            ),
            Self::MissingRequiredEntry(path) => {
                write!(
                    formatter,
                    "package archive is missing required entry {path}"
                )
            }
        }
    }
}

impl std::error::Error for PackageIntakeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod archive_tests {
    use std::fs::{self, File};
    use std::io;
    use std::path::{Path, PathBuf};
    use std::process;
    use std::sync::atomic::{AtomicU64, Ordering};

    use tar::{Builder, EntryType, Header};

    use super::{
        PackageIntakeError, PackageIntakeLimits, extract_package_tar, portable_entry_path,
    };

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        root: PathBuf,
        archive: PathBuf,
        destination: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir()
                .join(format!("vcg-package-intake-{}-{sequence}", process::id()));
            fs::create_dir(&root).expect("fixture root creates");
            let archive = root.join("candidate.tar");
            let destination = root.join("destination");
            fs::create_dir(&destination).expect("destination creates");
            Self {
                root,
                archive,
                destination,
            }
        }

        fn builder(&self) -> Builder<File> {
            Builder::new(File::create(&self.archive).expect("archive creates"))
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn append_file(builder: &mut Builder<File>, path: &str, bytes: &[u8]) {
        let mut header = Header::new_gnu();
        header.set_entry_type(EntryType::Regular);
        header.set_mode(0o644);
        header.set_size(u64::try_from(bytes.len()).expect("fixture length converts"));
        header.set_cksum();
        builder
            .append_data(&mut header, path, bytes)
            .expect("fixture file appends");
    }

    fn append_required_files(builder: &mut Builder<File>) {
        append_file(builder, "installed-catalog.json", b"catalog");
        append_file(builder, "installed-catalog.sig", b"signature");
        append_file(builder, "install/packages/game/file.bin", b"artifact");
    }

    #[test]
    fn extracts_only_the_bounded_portable_release_layout() {
        let fixture = Fixture::new();
        let mut builder = fixture.builder();
        append_required_files(&mut builder);
        builder.finish().expect("archive finishes");

        let stats = extract_package_tar(
            &fixture.archive,
            &fixture.destination,
            PackageIntakeLimits::default(),
        )
        .expect("valid archive extracts");
        assert_eq!(stats.entry_count, 3);
        assert_eq!(stats.file_count, 3);
        assert_eq!(stats.expanded_bytes, 24);
        assert_eq!(
            fs::read(fixture.destination.join("install/packages/game/file.bin"))
                .expect("artifact reads"),
            b"artifact"
        );
    }

    #[test]
    fn rejects_links_duplicates_and_nonportable_names() {
        let link_fixture = Fixture::new();
        let mut builder = link_fixture.builder();
        append_required_files(&mut builder);
        let mut link = Header::new_gnu();
        link.set_entry_type(EntryType::Symlink);
        link.set_mode(0o777);
        link.set_size(0);
        link.set_link_name("file.bin").expect("link target sets");
        link.set_cksum();
        builder
            .append_data(&mut link, "install/packages/game/link", io::empty())
            .expect("fixture link appends");
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &link_fixture.archive,
                &link_fixture.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::UnsupportedEntry { .. })
        ));

        let directory_fixture = Fixture::new();
        let mut builder = directory_fixture.builder();
        append_required_files(&mut builder);
        let mut directory = Header::new_gnu();
        directory.set_entry_type(EntryType::Directory);
        directory.set_mode(0o755);
        directory.set_size(0);
        directory.set_cksum();
        builder
            .append_data(&mut directory, "install/extra", io::empty())
            .expect("fixture directory appends");
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &directory_fixture.archive,
                &directory_fixture.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::UnsupportedEntry { .. })
        ));

        let mode_fixture = Fixture::new();
        let mut builder = mode_fixture.builder();
        append_required_files(&mut builder);
        let mut special = Header::new_gnu();
        special.set_entry_type(EntryType::Regular);
        special.set_mode(0o4755);
        special.set_size(1);
        special.set_cksum();
        builder
            .append_data(&mut special, "install/special", b"x".as_slice())
            .expect("unsafe-mode fixture appends");
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &mode_fixture.archive,
                &mode_fixture.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::UnsafeMode { .. })
        ));

        let duplicate_fixture = Fixture::new();
        let mut builder = duplicate_fixture.builder();
        append_required_files(&mut builder);
        append_file(&mut builder, "install/Packages/game/file.bin", b"alias");
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &duplicate_fixture.archive,
                &duplicate_fixture.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::DuplicateEntry(_) | PackageIntakeError::PathCollision(_))
        ));

        for path in [
            b"../escape".as_slice(),
            b"/absolute".as_slice(),
            b"install\\escape".as_slice(),
            b"install//alias".as_slice(),
            b"install/CON".as_slice(),
            &[0xff],
        ] {
            assert!(
                portable_entry_path(path).is_err(),
                "unsafe path must fail: {path:?}"
            );
        }
    }

    #[test]
    fn rejects_hidden_extended_archive_metadata() {
        let fixture = Fixture::new();
        let mut builder = fixture.builder();
        builder
            .append_pax_extensions([("comment", b"hidden metadata".as_slice())])
            .expect("pax fixture appends");
        append_required_files(&mut builder);
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &fixture.archive,
                &fixture.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::UnsupportedEntry { .. })
        ));
    }

    #[test]
    fn enforces_archive_file_expanded_and_entry_limits() {
        assert!(matches!(
            PackageIntakeLimits::new(8, 9, 1, 1),
            Err(PackageIntakeError::InvalidLimits)
        ));

        let archive_fixture = Fixture::new();
        let mut builder = archive_fixture.builder();
        append_required_files(&mut builder);
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &archive_fixture.archive,
                &archive_fixture.destination,
                PackageIntakeLimits::new(1, 1, 1, 1).expect("small limits create")
            ),
            Err(PackageIntakeError::ArchiveTooLarge { .. })
        ));

        let file_fixture = Fixture::new();
        let mut builder = file_fixture.builder();
        append_required_files(&mut builder);
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &file_fixture.archive,
                &file_fixture.destination,
                PackageIntakeLimits::new(1_000_000, 100, 7, 10).expect("file limits create")
            ),
            Err(PackageIntakeError::FileTooLarge { .. })
        ));

        let entry_fixture = Fixture::new();
        let mut builder = entry_fixture.builder();
        append_required_files(&mut builder);
        builder.finish().expect("archive finishes");
        assert!(matches!(
            extract_package_tar(
                &entry_fixture.archive,
                &entry_fixture.destination,
                PackageIntakeLimits::new(1_000_000, 100, 100, 2).expect("entry limits create")
            ),
            Err(PackageIntakeError::EntryLimitExceeded(2))
        ));
    }

    #[test]
    fn destination_must_be_empty_and_archive_must_be_regular() {
        let fixture = Fixture::new();
        let mut builder = fixture.builder();
        append_required_files(&mut builder);
        builder.finish().expect("archive finishes");
        fs::write(fixture.destination.join("occupied"), b"x").expect("occupier writes");
        assert!(matches!(
            extract_package_tar(
                &fixture.archive,
                &fixture.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::DestinationNotEmpty(_))
        ));

        let unsafe_archive = Fixture::new();
        assert!(matches!(
            extract_package_tar(
                Path::new(&unsafe_archive.root),
                &unsafe_archive.destination,
                PackageIntakeLimits::default()
            ),
            Err(PackageIntakeError::UnsafePath { .. })
        ));
    }
}

#[cfg(test)]
mod descriptor_tests {
    use std::fs;
    use std::io::Cursor;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};
    use tar::{Builder, EntryType, Header};

    use super::{
        CapacityAdmission, PackageArchiveFormat, PackageIntakeError, PackageIntakeLimits,
        SIGNED_MESSAGE_PREFIX, VerifiedPackageRelease, current_target,
    };

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
        descriptor: PathBuf,
        signature: PathBuf,
        public_key: PathBuf,
        archive: PathBuf,
        signing_key: SigningKey,
    }

    impl Fixture {
        fn new() -> Self {
            let unique = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-package-release-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("fixture root creates");
            let signing_key = SigningKey::from_bytes(&[19_u8; 32]);
            let public_key = root.join("release.pub");
            fs::write(
                &public_key,
                encode_hex(signing_key.verifying_key().as_bytes()),
            )
            .expect("public key writes");
            Self {
                descriptor: root.join("release.json"),
                signature: root.join("release.sig"),
                archive: root.join("release.tar.zst"),
                public_key,
                signing_key,
                root,
            }
        }

        fn write_valid(&self, archive: &[u8], expanded_bytes: u64, file_count: u64) {
            fs::write(&self.archive, archive).expect("archive writes");
            let archive_sha256 = encode_hex(&Sha256::digest(archive));
            let catalog_sha256 = "11".repeat(32);
            let descriptor = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":7,\"target\":\"{}\",",
                    "\"archive\":{{\"format\":\"tar-zstd\",\"sha256\":\"{}\",\"sizeBytes\":{}}},",
                    "\"expanded\":{{\"sizeBytes\":{},\"fileCount\":{}}},",
                    "\"catalog\":{{\"sha256\":\"{}\",\"sizeBytes\":1024}}}}"
                ),
                current_target(),
                archive_sha256,
                archive.len(),
                expanded_bytes,
                file_count,
                catalog_sha256
            );
            fs::write(&self.descriptor, descriptor.as_bytes()).expect("descriptor writes");
            self.sign_descriptor();
        }

        fn write_tar_release(
            &self,
            archive: &[u8],
            expanded_bytes: u64,
            file_count: u64,
            catalog: &[u8],
        ) {
            fs::write(&self.archive, archive).expect("archive writes");
            let descriptor = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":7,\"target\":\"{}\",",
                    "\"archive\":{{\"format\":\"tar\",\"sha256\":\"{}\",\"sizeBytes\":{}}},",
                    "\"expanded\":{{\"sizeBytes\":{},\"fileCount\":{}}},",
                    "\"catalog\":{{\"sha256\":\"{}\",\"sizeBytes\":{}}}}}"
                ),
                current_target(),
                encode_hex(&Sha256::digest(archive)),
                archive.len(),
                expanded_bytes,
                file_count,
                encode_hex(&Sha256::digest(catalog)),
                catalog.len()
            );
            fs::write(&self.descriptor, descriptor.as_bytes()).expect("descriptor writes");
            self.sign_descriptor();
        }

        fn sign_descriptor(&self) {
            let descriptor = fs::read(&self.descriptor).expect("descriptor reads");
            let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(&descriptor);
            let signature = self.signing_key.sign(&message);
            fs::write(&self.signature, encode_hex(&signature.to_bytes()))
                .expect("signature writes");
        }

        fn load(&self) -> Result<VerifiedPackageRelease, PackageIntakeError> {
            VerifiedPackageRelease::load(&self.descriptor, &self.signature, &self.public_key)
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

    fn append_tar_file(builder: &mut Builder<Vec<u8>>, path: &str, bytes: &[u8]) {
        let mut header = Header::new_gnu();
        header.set_entry_type(EntryType::Regular);
        header.set_mode(0o644);
        header.set_size(u64::try_from(bytes.len()).expect("fixture length converts"));
        header.set_cksum();
        builder
            .append_data(&mut header, path, Cursor::new(bytes))
            .expect("fixture TAR file appends");
    }

    #[test]
    fn verifies_descriptor_before_capacity_and_archive_use() {
        let fixture = Fixture::new();
        fixture.write_valid(b"bounded archive", 8_192, 12);
        let release = fixture.load().expect("signed release verifies");

        assert_eq!(release.generation(), 7);
        assert_eq!(release.target(), current_target());
        assert_eq!(release.archive_format(), PackageArchiveFormat::TarZstd);
        assert_eq!(release.archive_size_bytes(), 15);
        assert_eq!(release.expanded_size_bytes(), 8_192);
        assert_eq!(release.expanded_file_count(), 12);
        assert_eq!(release.catalog_size_bytes(), 1_024);
        assert_eq!(release.catalog_sha256(), [0x11; 32]);
        release
            .verify_archive(&fixture.archive)
            .expect("exact archive verifies");

        let expected = CapacityAdmission {
            available_bytes: 20_000,
            archive_bytes: 15,
            expanded_bytes: 8_192,
            reserve_bytes: 4_096,
            remaining_after_peak_bytes: 11_793,
        };
        assert_eq!(
            release
                .admit_capacity(20_000, 4_096)
                .expect("capacity admits"),
            expected
        );
        assert!(
            release
                .admit_capacity_at(&fixture.root, 1)
                .expect("real filesystem capacity admits")
                .available_bytes
                > 0
        );
    }

    #[test]
    fn rejects_tampering_before_json_parse_and_archive_use() {
        let fixture = Fixture::new();
        fixture.write_valid(b"archive", 4_096, 4);

        let mut descriptor = fs::read(&fixture.descriptor).expect("descriptor reads");
        descriptor[0] = b'[';
        fs::write(&fixture.descriptor, descriptor).expect("tamper writes");
        assert!(matches!(
            fixture.load(),
            Err(PackageIntakeError::SignatureRejected)
        ));

        fixture.write_valid(b"archive", 4_096, 4);
        fs::write(&fixture.archive, b"changed").expect("archive changes");
        assert!(matches!(
            fixture
                .load()
                .expect("descriptor still verifies")
                .verify_archive(&fixture.archive),
            Err(PackageIntakeError::ArchiveHashMismatch
                | PackageIntakeError::ArchiveSizeMismatch { .. })
        ));
    }

    #[test]
    fn fails_closed_on_capacity_and_descriptor_bounds() {
        let fixture = Fixture::new();
        fixture.write_valid(b"archive", 4_096, 4);
        let release = fixture.load().expect("release verifies");
        assert!(matches!(
            release.admit_capacity(4_103, 1),
            Err(PackageIntakeError::InsufficientCapacity { .. })
        ));
        assert!(matches!(
            release.admit_capacity(u64::MAX, 0),
            Err(PackageIntakeError::InvalidReserve)
        ));
        assert!(matches!(
            release.admit_capacity(u64::MAX, u64::MAX),
            Err(PackageIntakeError::CapacityOverflow)
        ));

        let invalid = fs::read_to_string(&fixture.descriptor)
            .expect("descriptor reads")
            .replace("\"fileCount\":4", "\"fileCount\":0");
        fs::write(&fixture.descriptor, invalid).expect("invalid descriptor writes");
        fixture.sign_descriptor();
        assert!(matches!(
            fixture.load(),
            Err(PackageIntakeError::InvalidRecord(_))
        ));
    }

    #[test]
    fn descriptor_binds_exact_tar_extraction_and_catalog_evidence() {
        let fixture = Fixture::new();
        let catalog = b"signed installed catalog";
        let signature = b"detached signature";
        let artifact = b"package artifact";
        let mut builder = Builder::new(Vec::new());
        append_tar_file(&mut builder, "installed-catalog.json", catalog);
        append_tar_file(&mut builder, "installed-catalog.sig", signature);
        append_tar_file(&mut builder, "install/packages/game/artifact.bin", artifact);
        builder.finish().expect("fixture TAR finishes");
        let archive = builder.into_inner().expect("fixture TAR returns");
        let expanded_bytes = u64::try_from(catalog.len() + signature.len() + artifact.len())
            .expect("expanded fixture length converts");
        fixture.write_tar_release(&archive, expanded_bytes, 3, catalog);
        let release = fixture.load().expect("signed TAR release verifies");
        assert_eq!(release.archive_format(), PackageArchiveFormat::Tar);

        let destination = fixture.root.join("extracted");
        fs::create_dir(&destination).expect("extraction destination creates");
        let stats = release
            .extract_verified(
                &fixture.archive,
                &destination,
                PackageIntakeLimits::default(),
            )
            .expect("descriptor-bound TAR extracts");
        assert_eq!(stats.expanded_bytes, expanded_bytes);
        assert_eq!(stats.file_count, 3);
        assert_eq!(
            fs::read(destination.join("installed-catalog.json")).expect("extracted catalog reads"),
            catalog
        );

        let compressed = Fixture::new();
        compressed.write_valid(b"compressed archive", 4_096, 4);
        assert!(matches!(
            compressed
                .load()
                .expect("compressed descriptor verifies")
                .extraction_limits(),
            Err(PackageIntakeError::UnsupportedArchiveFormat)
        ));
    }
}
