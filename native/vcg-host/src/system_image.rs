//! Signature-first verification for target-specific system images.
//!
//! This module verifies a small detached-signed manifest before parsing it,
//! then completely hashes one bounded regular image file and retains its exact
//! opened handle for a future privileged writer. It does not create journal
//! evidence before inactive-partition write/read-back, download, mount, or
//! boot.

use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::system_update::{MAX_SYSTEM_IMAGE_BYTES, SystemSlot, VerifiedSystemImageEvidence};

const MANIFEST_SCHEMA_VERSION: u32 = 1;
const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-SYSTEM-IMAGE-MANIFEST-V1\0";
const MAX_MANIFEST_BYTES: u64 = 64 * 1_024;
const MAX_SIGNATURE_TEXT_BYTES: u64 = 256;
const MAX_PUBLIC_KEY_TEXT_BYTES: u64 = 128;

/// Signature-verified authority for one target-specific raw system image.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedSystemImageRelease {
    generation: u64,
    release_id: String,
    target: String,
    image_size_bytes: u64,
    image_sha256: [u8; 32],
    manifest_sha256: [u8; 32],
}

/// One completely verified source image and its exact still-open file handle.
#[derive(Debug)]
pub struct VerifiedSystemImageFile {
    release: VerifiedSystemImageRelease,
    file: File,
    source_path: PathBuf,
}

impl VerifiedSystemImageFile {
    #[must_use]
    pub const fn release(&self) -> &VerifiedSystemImageRelease {
        &self.release
    }

    /// Consumes the verification result and returns the exact verified handle
    /// rewound to byte zero plus its signed release authority.
    ///
    /// A privileged writer must copy from this handle, synchronize and read
    /// back the inactive partition, verify exact length/hash again, and only
    /// then construct journal evidence inside the native host.
    ///
    /// # Errors
    ///
    /// Rejects failure to rewind the verified handle.
    pub fn into_rewound_parts(
        mut self,
    ) -> Result<(VerifiedSystemImageRelease, File), SystemImageError> {
        self.file
            .seek(SeekFrom::Start(0))
            .map_err(|source| SystemImageError::Io {
                operation: "rewind verified system image",
                path: self.source_path,
                source,
            })?;
        Ok((self.release, self.file))
    }
}

impl VerifiedSystemImageRelease {
    /// Loads and verifies one bounded detached-signed image manifest.
    ///
    /// Signature verification precedes JSON parsing. All three paths and the
    /// exact expected target are privileged host configuration.
    ///
    /// # Errors
    ///
    /// Rejects relative or non-regular paths, oversized inputs, noncanonical
    /// key/signature encodings, invalid signatures, malformed or unknown JSON,
    /// wrong schema/target, unsafe identifiers, and invalid image bounds.
    pub fn load(
        manifest_path: &Path,
        signature_path: &Path,
        public_key_path: &Path,
        expected_target: &str,
    ) -> Result<Self, SystemImageError> {
        validate_identifier("expected target", expected_target, 64)?;
        for (kind, path) in [
            ("system image manifest", manifest_path),
            ("system image manifest signature", signature_path),
            ("system image public key", public_key_path),
        ] {
            require_absolute_regular_file(kind, path)?;
        }

        let manifest_bytes =
            read_bounded(manifest_path, MAX_MANIFEST_BYTES, "system image manifest")?;
        let signature_text = read_bounded(
            signature_path,
            MAX_SIGNATURE_TEXT_BYTES,
            "system image manifest signature",
        )?;
        let public_key_text = read_bounded(
            public_key_path,
            MAX_PUBLIC_KEY_TEXT_BYTES,
            "system image public key",
        )?;
        let signature_bytes = decode_canonical_hex::<64>(
            trim_single_line(&signature_text, "system image manifest signature")?,
            "system image manifest signature",
        )?;
        let public_key_bytes = decode_canonical_hex::<32>(
            trim_single_line(&public_key_text, "system image public key")?,
            "system image public key",
        )?;
        let signature = Signature::from_bytes(&signature_bytes);
        let verifying_key = VerifyingKey::from_bytes(&public_key_bytes)
            .map_err(|_| SystemImageError::InvalidEncoding("system image public key"))?;
        let mut signed_message =
            Vec::with_capacity(SIGNED_MESSAGE_PREFIX.len() + manifest_bytes.len());
        signed_message.extend_from_slice(SIGNED_MESSAGE_PREFIX);
        signed_message.extend_from_slice(&manifest_bytes);
        verifying_key
            .verify_strict(&signed_message, &signature)
            .map_err(|_| SystemImageError::SignatureRejected)?;

        let manifest_sha256 = Sha256::digest(&manifest_bytes).into();
        let document: SystemImageManifestDocument = serde_json::from_slice(&manifest_bytes)
            .map_err(|error| SystemImageError::InvalidDocument(error.to_string()))?;
        Self::from_document(document, expected_target, manifest_sha256)
    }

    fn from_document(
        document: SystemImageManifestDocument,
        expected_target: &str,
        manifest_sha256: [u8; 32],
    ) -> Result<Self, SystemImageError> {
        if document.schema_version != MANIFEST_SCHEMA_VERSION {
            return Err(SystemImageError::UnsupportedSchema(document.schema_version));
        }
        if document.generation == 0 {
            return Err(SystemImageError::InvalidRecord(
                "generation must be greater than zero".to_owned(),
            ));
        }
        validate_identifier("release ID", &document.release_id, 128)?;
        validate_identifier("target", &document.target, 64)?;
        if document.target != expected_target {
            return Err(SystemImageError::WrongTarget {
                expected: expected_target.to_owned(),
                actual: document.target,
            });
        }
        if document.image.format != SystemImageFormatDocument::Raw {
            return Err(SystemImageError::UnsupportedImageFormat);
        }
        if !(1..=MAX_SYSTEM_IMAGE_BYTES).contains(&document.image.size_bytes) {
            return Err(SystemImageError::InvalidRecord(format!(
                "image size must be within 1..={MAX_SYSTEM_IMAGE_BYTES} bytes"
            )));
        }
        let image_sha256 =
            decode_canonical_hex::<32>(document.image.sha256.as_bytes(), "image sha256")?;
        Ok(Self {
            generation: document.generation,
            release_id: document.release_id,
            target: expected_target.to_owned(),
            image_size_bytes: document.image.size_bytes,
            image_sha256,
            manifest_sha256,
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
    pub const fn image_size_bytes(&self) -> u64 {
        self.image_size_bytes
    }

    #[must_use]
    pub const fn image_sha256(&self) -> [u8; 32] {
        self.image_sha256
    }

    #[must_use]
    pub const fn manifest_sha256(&self) -> [u8; 32] {
        self.manifest_sha256
    }

    /// Completely reads and verifies one bounded regular image file while
    /// retaining the exact opened handle for the privileged writer.
    ///
    /// The file is opened once and hashed through that handle. Path replacement
    /// cannot redirect the retained handle. Concurrent writes through another
    /// handle remain outside this primitive; the privileged writer must
    /// reverify while copying and after read-back.
    ///
    /// # Errors
    ///
    /// Rejects relative/non-regular paths, size changes or mismatch, hash
    /// mismatch and read errors.
    pub fn verify_image(
        &self,
        image_path: &Path,
    ) -> Result<VerifiedSystemImageFile, SystemImageError> {
        require_absolute_regular_file("system image", image_path)?;
        let mut file = File::open(image_path).map_err(|source| SystemImageError::Io {
            operation: "open system image",
            path: image_path.to_owned(),
            source,
        })?;
        let initial = file.metadata().map_err(|source| SystemImageError::Io {
            operation: "inspect opened system image",
            path: image_path.to_owned(),
            source,
        })?;
        if !initial.is_file() {
            return Err(SystemImageError::UnsafePath {
                kind: "system image",
                path: image_path.to_owned(),
            });
        }
        if initial.len() != self.image_size_bytes {
            return Err(SystemImageError::ImageSizeMismatch {
                expected_bytes: self.image_size_bytes,
                actual_bytes: initial.len(),
            });
        }

        let mut digest = Sha256::new();
        let mut total = 0_u64;
        let mut buffer = [0_u8; 8 * 1_024];
        loop {
            let count = file
                .read(&mut buffer)
                .map_err(|source| SystemImageError::Io {
                    operation: "hash system image",
                    path: image_path.to_owned(),
                    source,
                })?;
            if count == 0 {
                break;
            }
            total = total
                .checked_add(u64::try_from(count).map_err(|_| {
                    SystemImageError::InvalidRecord("image read length overflow".to_owned())
                })?)
                .ok_or_else(|| {
                    SystemImageError::InvalidRecord("image read length overflow".to_owned())
                })?;
            if total > self.image_size_bytes {
                return Err(SystemImageError::ImageSizeMismatch {
                    expected_bytes: self.image_size_bytes,
                    actual_bytes: total,
                });
            }
            digest.update(&buffer[..count]);
        }
        let final_metadata = file.metadata().map_err(|source| SystemImageError::Io {
            operation: "reinspect opened system image",
            path: image_path.to_owned(),
            source,
        })?;
        if total != self.image_size_bytes || final_metadata.len() != self.image_size_bytes {
            return Err(SystemImageError::ImageSizeMismatch {
                expected_bytes: self.image_size_bytes,
                actual_bytes: total.max(final_metadata.len()),
            });
        }
        let actual: [u8; 32] = digest.finalize().into();
        if actual != self.image_sha256 {
            return Err(SystemImageError::ImageHashMismatch);
        }

        Ok(VerifiedSystemImageFile {
            release: self.clone(),
            file,
            source_path: image_path.to_owned(),
        })
    }

    /// Verifies exactly the signed image-length prefix read back from the
    /// host-selected inactive slot and produces sealed journal evidence.
    ///
    /// The privileged platform adapter owns the reader's provenance and must
    /// synchronize the completed write before opening the read-back handle.
    /// This byte verifier cannot distinguish an inactive-slot reader from any
    /// other `Read`; supplying the verified source would not prove the platform
    /// step.
    ///
    /// # Errors
    ///
    /// Rejects short reads, read failures, hash mismatch, or invalid evidence.
    pub fn verify_inactive_readback(
        &self,
        mut readback: impl Read,
        slot: SystemSlot,
    ) -> Result<VerifiedSystemImageEvidence, SystemImageError> {
        let mut digest = Sha256::new();
        let mut total = 0_u64;
        let mut buffer = [0_u8; 8 * 1_024];
        while total < self.image_size_bytes {
            let remaining = self.image_size_bytes - total;
            let maximum = usize::try_from(remaining.min(buffer.len() as u64))
                .map_err(|_| SystemImageError::InvalidRecord("read-back bound overflow".into()))?;
            let count = readback
                .read(&mut buffer[..maximum])
                .map_err(SystemImageError::ReadbackIo)?;
            if count == 0 {
                return Err(SystemImageError::ImageSizeMismatch {
                    expected_bytes: self.image_size_bytes,
                    actual_bytes: total,
                });
            }
            total = total
                .checked_add(u64::try_from(count).map_err(|_| {
                    SystemImageError::InvalidRecord("read-back length overflow".into())
                })?)
                .ok_or_else(|| {
                    SystemImageError::InvalidRecord("read-back length overflow".into())
                })?;
            digest.update(&buffer[..count]);
        }
        let actual: [u8; 32] = digest.finalize().into();
        if actual != self.image_sha256 {
            return Err(SystemImageError::ImageHashMismatch);
        }
        VerifiedSystemImageEvidence::new(
            slot,
            self.generation,
            self.release_id.clone(),
            self.target.clone(),
            self.image_size_bytes,
            encode_hex(&self.manifest_sha256),
            encode_hex(&self.image_sha256),
        )
        .map_err(|error| SystemImageError::InvalidEvidence(error.to_string()))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SystemImageManifestDocument {
    schema_version: u32,
    generation: u64,
    release_id: String,
    target: String,
    image: SystemImageDocument,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SystemImageDocument {
    format: SystemImageFormatDocument,
    sha256: String,
    size_bytes: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum SystemImageFormatDocument {
    Raw,
    RawZstd,
}

fn validate_identifier(
    kind: &'static str,
    value: &str,
    maximum_bytes: usize,
) -> Result<(), SystemImageError> {
    if value.is_empty()
        || value.len() > maximum_bytes
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(SystemImageError::InvalidRecord(format!(
            "{kind} must be 1..={maximum_bytes} ASCII letters, digits, dot, underscore, or hyphen"
        )));
    }
    Ok(())
}

fn require_absolute_regular_file(kind: &'static str, path: &Path) -> Result<(), SystemImageError> {
    if !path.is_absolute() {
        return Err(SystemImageError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| SystemImageError::Io {
        operation: "inspect system image input",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() {
        return Err(SystemImageError::UnsafePath {
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
) -> Result<Vec<u8>, SystemImageError> {
    let metadata = fs::metadata(path).map_err(|source| SystemImageError::Io {
        operation: "inspect system image input size",
        path: path.to_owned(),
        source,
    })?;
    if metadata.len() > maximum_bytes {
        return Err(SystemImageError::InputTooLarge {
            kind,
            maximum_bytes,
        });
    }
    let capacity =
        usize::try_from(metadata.len()).map_err(|_| SystemImageError::InputTooLarge {
            kind,
            maximum_bytes,
        })?;
    let file = File::open(path).map_err(|source| SystemImageError::Io {
        operation: "open system image input",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    file.take(maximum_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| SystemImageError::Io {
            operation: "read system image input",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum_bytes {
        return Err(SystemImageError::InputTooLarge {
            kind,
            maximum_bytes,
        });
    }
    Ok(bytes)
}

fn trim_single_line<'a>(bytes: &'a [u8], kind: &'static str) -> Result<&'a [u8], SystemImageError> {
    let trimmed = bytes.strip_suffix(b"\n").unwrap_or(bytes);
    if trimmed.contains(&b'\n') || trimmed.contains(&b'\r') {
        return Err(SystemImageError::InvalidEncoding(kind));
    }
    Ok(trimmed)
}

fn decode_canonical_hex<const N: usize>(
    bytes: &[u8],
    kind: &'static str,
) -> Result<[u8; N], SystemImageError> {
    if bytes.len() != N * 2 {
        return Err(SystemImageError::InvalidEncoding(kind));
    }
    let mut output = [0_u8; N];
    for (index, pair) in bytes.chunks_exact(2).enumerate() {
        output[index] = (decode_nibble(pair[0], kind)? << 4) | decode_nibble(pair[1], kind)?;
    }
    Ok(output)
}

fn decode_nibble(byte: u8, kind: &'static str) -> Result<u8, SystemImageError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(SystemImageError::InvalidEncoding(kind)),
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

/// Signed system-image verification failure.
#[derive(Debug)]
pub enum SystemImageError {
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
    UnsupportedImageFormat,
    InvalidRecord(String),
    ImageSizeMismatch {
        expected_bytes: u64,
        actual_bytes: u64,
    },
    ImageHashMismatch,
    ReadbackIo(io::Error),
    InvalidEvidence(String),
}

impl fmt::Display for SystemImageError {
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
            Self::SignatureRejected => {
                formatter.write_str("system image manifest signature rejected")
            }
            Self::InvalidDocument(error) => {
                write!(formatter, "system image manifest is invalid: {error}")
            }
            Self::UnsupportedSchema(version) => {
                write!(
                    formatter,
                    "system image manifest schema {version} is unsupported"
                )
            }
            Self::WrongTarget { expected, actual } => {
                write!(
                    formatter,
                    "system image target {actual} does not match {expected}"
                )
            }
            Self::UnsupportedImageFormat => {
                formatter.write_str("system image format has no bounded verifier")
            }
            Self::InvalidRecord(error) => {
                write!(
                    formatter,
                    "system image manifest record is invalid: {error}"
                )
            }
            Self::ImageSizeMismatch {
                expected_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "system image is {actual_bytes} bytes but manifest requires {expected_bytes}"
            ),
            Self::ImageHashMismatch => {
                formatter.write_str("system image hash does not match signed manifest")
            }
            Self::ReadbackIo(error) => write!(formatter, "read inactive system slot: {error}"),
            Self::InvalidEvidence(error) => {
                write!(
                    formatter,
                    "verified system image evidence is invalid: {error}"
                )
            }
        }
    }
}

impl std::error::Error for SystemImageError {
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
    use ed25519_dalek::{Signer, SigningKey};
    use std::io::Cursor;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);
    const TARGET: &str = "raspberry-pi-5";

    struct Fixture {
        root: PathBuf,
        manifest: PathBuf,
        signature: PathBuf,
        public_key: PathBuf,
        image: PathBuf,
        signing_key: SigningKey,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root =
                std::env::temp_dir().join(format!("vcg-system-image-{}-{id}", std::process::id()));
            fs::create_dir(&root).expect("create fixture");
            let signing_key = SigningKey::from_bytes(&[0x35; 32]);
            let public_key = root.join("system-image.pub");
            fs::write(
                &public_key,
                encode_hex(signing_key.verifying_key().as_bytes()),
            )
            .expect("write public key");
            Self {
                manifest: root.join("system-image.json"),
                signature: root.join("system-image.sig"),
                image: root.join("system.img"),
                public_key,
                signing_key,
                root,
            }
        }

        fn write_valid(&self, generation: u64, release_id: &str, image: &[u8]) {
            fs::write(&self.image, image).expect("write image");
            let manifest = format!(
                concat!(
                    "{{\"schemaVersion\":1,\"generation\":{},",
                    "\"releaseId\":\"{}\",\"target\":\"{}\",",
                    "\"image\":{{\"format\":\"raw\",\"sha256\":\"{}\",",
                    "\"sizeBytes\":{}}}}}"
                ),
                generation,
                release_id,
                TARGET,
                encode_hex(&Sha256::digest(image)),
                image.len()
            );
            fs::write(&self.manifest, manifest).expect("write manifest");
            self.sign_manifest();
        }

        fn sign_manifest(&self) {
            let manifest = fs::read(&self.manifest).expect("read manifest");
            let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(&manifest);
            let signature = self.signing_key.sign(&message);
            fs::write(&self.signature, encode_hex(&signature.to_bytes())).expect("write signature");
        }

        fn load(&self) -> Result<VerifiedSystemImageRelease, SystemImageError> {
            VerifiedSystemImageRelease::load(
                &self.manifest,
                &self.signature,
                &self.public_key,
                TARGET,
            )
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.root).expect("remove fixture");
        }
    }

    #[test]
    fn verifies_signature_before_parsing_and_binds_exact_release() {
        let fixture = Fixture::new();
        fixture.write_valid(7, "pi-release-7", b"complete raw image");
        let release = fixture.load().expect("load release");
        assert_eq!(release.generation(), 7);
        assert_eq!(release.release_id(), "pi-release-7");
        assert_eq!(release.target(), TARGET);
        assert_eq!(release.image_size_bytes(), 18);
        let expected_digest: [u8; 32] = Sha256::digest(b"complete raw image").into();
        assert_eq!(release.image_sha256(), expected_digest);
        let expected_manifest: [u8; 32] =
            Sha256::digest(fs::read(&fixture.manifest).expect("read manifest")).into();
        assert_eq!(release.manifest_sha256(), expected_manifest);

        let mut manifest = fs::read(&fixture.manifest).expect("read manifest");
        manifest[0] = b'[';
        fs::write(&fixture.manifest, manifest).expect("tamper manifest");
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::SignatureRejected)
        ));
    }

    #[test]
    fn rejects_a_signature_without_the_system_image_domain() {
        let fixture = Fixture::new();
        fixture.write_valid(2, "pi-release-2", b"image");
        let manifest = fs::read(&fixture.manifest).expect("read manifest");
        let signature = fixture.signing_key.sign(&manifest);
        fs::write(&fixture.signature, encode_hex(&signature.to_bytes()))
            .expect("write cross-domain signature");
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::SignatureRejected)
        ));
    }

    #[test]
    fn verifies_complete_image_and_retains_the_exact_open_handle() {
        let fixture = Fixture::new();
        fixture.write_valid(8, "pi-release-8", b"verified bytes");
        let release = fixture.load().expect("load release");
        let verified = release.verify_image(&fixture.image).expect("verify image");
        assert_eq!(verified.release().generation(), 8);
        assert_eq!(verified.release().release_id(), "pi-release-8");
        assert_eq!(verified.release().target(), TARGET);
        let (release, mut handle) = verified.into_rewound_parts().expect("rewind verified file");
        let mut bytes = Vec::new();
        handle
            .read_to_end(&mut bytes)
            .expect("read verified handle");
        assert_eq!(bytes, b"verified bytes");
        assert_eq!(release.image_size_bytes(), bytes.len() as u64);
        let evidence = release
            .verify_inactive_readback(Cursor::new(&bytes), SystemSlot::B)
            .expect("verify inactive readback");
        assert_eq!(evidence.image().slot(), SystemSlot::B);
        assert_eq!(evidence.image().image_size_bytes(), bytes.len() as u64);
    }

    #[test]
    fn retained_handle_is_not_redirected_by_path_replacement() {
        let fixture = Fixture::new();
        fixture.write_valid(8, "pi-release-8", b"original image bytes");
        let verified = fixture
            .load()
            .expect("load release")
            .verify_image(&fixture.image)
            .expect("verify image");
        let displaced = fixture.root.join("displaced.img");
        fs::rename(&fixture.image, &displaced).expect("move verified path");
        fs::write(&fixture.image, b"replacement image bytes").expect("replace source path");

        let (_release, mut handle) = verified.into_rewound_parts().expect("rewind verified file");
        let mut bytes = Vec::new();
        handle
            .read_to_end(&mut bytes)
            .expect("read retained handle");
        assert_eq!(bytes, b"original image bytes");
    }

    #[test]
    fn rejects_short_or_changed_inactive_readback() {
        let fixture = Fixture::new();
        fixture.write_valid(8, "pi-release-8", b"verified bytes");
        let release = fixture.load().expect("load release");
        assert!(matches!(
            release.verify_inactive_readback(Cursor::new(b"short"), SystemSlot::B),
            Err(SystemImageError::ImageSizeMismatch { .. })
        ));
        assert!(matches!(
            release.verify_inactive_readback(Cursor::new(b"changed bytes!"), SystemSlot::B),
            Err(SystemImageError::ImageHashMismatch)
        ));
    }

    #[test]
    fn changed_or_truncated_image_never_produces_evidence() {
        let fixture = Fixture::new();
        fixture.write_valid(2, "pi-release-2", b"original system image");
        let release = fixture.load().expect("load release");
        fs::write(&fixture.image, b"changed system image!").expect("change same-size image");
        assert!(matches!(
            release.verify_image(&fixture.image),
            Err(SystemImageError::ImageHashMismatch)
        ));
        fs::write(&fixture.image, b"short").expect("truncate image");
        assert!(matches!(
            release.verify_image(&fixture.image),
            Err(SystemImageError::ImageSizeMismatch { .. })
        ));
    }

    #[test]
    fn rejects_wrong_target_unknown_fields_and_unsupported_format() {
        for replacement in [
            ("\"raspberry-pi-5\"", "\"other-target\""),
            ("\"format\":\"raw\"", "\"format\":\"raw-zstd\""),
            ("\"schemaVersion\":1", "\"schemaVersion\":2"),
            (
                "\"releaseId\":\"pi-release-3\"",
                "\"releaseId\":\"pi-release-3\",\"unknown\":true",
            ),
        ] {
            let fixture = Fixture::new();
            fixture.write_valid(3, "pi-release-3", b"image");
            let changed = fs::read_to_string(&fixture.manifest)
                .expect("read manifest")
                .replace(replacement.0, replacement.1);
            fs::write(&fixture.manifest, changed).expect("write changed manifest");
            fixture.sign_manifest();
            assert!(fixture.load().is_err());
        }
    }

    #[test]
    fn rejects_zero_generation_and_image_size_outside_bounds() {
        for replacement in [
            ("\"generation\":6", "\"generation\":0".to_owned()),
            ("\"sizeBytes\":5", "\"sizeBytes\":0".to_owned()),
            (
                "\"sizeBytes\":5",
                format!("\"sizeBytes\":{}", MAX_SYSTEM_IMAGE_BYTES + 1),
            ),
        ] {
            let fixture = Fixture::new();
            fixture.write_valid(6, "pi-release-6", b"image");
            let changed = fs::read_to_string(&fixture.manifest)
                .expect("read manifest")
                .replace(replacement.0, &replacement.1);
            fs::write(&fixture.manifest, changed).expect("write invalid bounds");
            fixture.sign_manifest();
            assert!(matches!(
                fixture.load(),
                Err(SystemImageError::InvalidRecord(_))
            ));
        }
    }

    #[test]
    fn rejects_noncanonical_key_signature_hash_and_identifiers() {
        let fixture = Fixture::new();
        fixture.write_valid(4, "pi-release-4", b"image");
        fs::write(&fixture.public_key, "AA".repeat(32)).expect("uppercase key");
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::InvalidEncoding(_))
        ));

        fixture.write_valid(4, "pi-release-4", b"image");
        fs::write(&fixture.public_key, encode_hex(&[0x11; 32])).expect("wrong key");
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::SignatureRejected)
        ));

        fs::write(
            &fixture.public_key,
            encode_hex(fixture.signing_key.verifying_key().as_bytes()),
        )
        .expect("restore key");
        let changed = fs::read_to_string(&fixture.manifest)
            .expect("read manifest")
            .replace("\"pi-release-4\"", "\"../release\"");
        fs::write(&fixture.manifest, changed).expect("write unsafe ID");
        fixture.sign_manifest();
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::InvalidRecord(_))
        ));

        fixture.write_valid(4, "pi-release-4", b"image");
        let changed = fs::read_to_string(&fixture.manifest)
            .expect("read manifest")
            .replace(&encode_hex(&Sha256::digest(b"image")), &"A".repeat(64));
        fs::write(&fixture.manifest, changed).expect("write uppercase hash");
        fixture.sign_manifest();
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::InvalidEncoding("image sha256"))
        ));
    }

    #[test]
    fn rejects_relative_nonregular_and_oversized_inputs() {
        let fixture = Fixture::new();
        fixture.write_valid(5, "pi-release-5", b"image");
        assert!(matches!(
            VerifiedSystemImageRelease::load(
                Path::new("relative.json"),
                &fixture.signature,
                &fixture.public_key,
                TARGET
            ),
            Err(SystemImageError::UnsafePath { .. })
        ));
        assert!(matches!(
            fixture.load().expect("load").verify_image(&fixture.root),
            Err(SystemImageError::UnsafePath { .. })
        ));
        fs::write(
            &fixture.manifest,
            vec![b' '; usize::try_from(MAX_MANIFEST_BYTES + 1).expect("limit fits")],
        )
        .expect("write oversized manifest");
        assert!(matches!(
            fixture.load(),
            Err(SystemImageError::InputTooLarge { .. })
        ));
    }
}
