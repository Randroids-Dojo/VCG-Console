//! Crash-recoverable activation of fully verified signed package generations.

use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::installed_catalog::{CatalogError, CatalogRoots, TrustedPackageCatalog};

const ACTIVATION_SCHEMA_VERSION: u32 = 1;
const MAX_MARKER_BYTES: u64 = 1_024;
const INTENT_FILE: &str = "promotion.intent";
const STAGED_INTENT_FILE: &str = ".vcg-promotion-intent";
const CATALOG_FILE: &str = "installed-catalog.json";
const CATALOG_SIGNATURE_FILE: &str = "installed-catalog.sig";
const INSTALL_DIRECTORY: &str = "install";

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
        let mut highest = None;
        let mut count = 0_usize;
        for entry in fs::read_dir(&self.activations).map_err(|source| GenerationError::Io {
            operation: "read activation directory",
            path: self.activations.clone(),
            source,
        })? {
            count += 1;
            if count > 4_096 {
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
            if highest.is_none_or(|current| generation > current) {
                highest = Some(generation);
            }
        }

        highest
            .map(|generation| self.load_committed_generation(generation))
            .transpose()
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

    /// Promotes one fully populated `staging/<transaction-id>` snapshot.
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
    pub fn promote(&self, transaction_id: &str) -> Result<PromotionOutcome, GenerationError> {
        validate_transaction_id(transaction_id)?;
        let global_intent = self.root.join(INTENT_FILE);
        if global_intent.exists() {
            return Err(GenerationError::RecoveryRequired);
        }

        let stage = self.canonical_stage(transaction_id)?;
        let candidate = self.load_release(&stage)?;
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

/// Signed generation activation failure.
#[derive(Debug)]
pub enum GenerationError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    Catalog(CatalogError),
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidLayout(String),
    InvalidTransactionId(String),
    MarkerMismatch(String),
    RecoveryRequired,
    RollbackRejected {
        current: u64,
        candidate: u64,
    },
    GenerationExists(u64),
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
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidLayout(error) => write!(formatter, "package store is invalid: {error}"),
            Self::InvalidTransactionId(value) => {
                write!(formatter, "package transaction id is invalid: {value}")
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
        }
    }
}

impl std::error::Error for GenerationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Catalog(error) => Some(error),
            _ => None,
        }
    }
}

impl From<CatalogError> for GenerationError {
    fn from(error: CatalogError) -> Self {
        Self::Catalog(error)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;
    use sha2::{Digest, Sha256};

    use super::{
        ACTIVATION_SCHEMA_VERSION, ActivationMarker, GenerationError, INTENT_FILE,
        PackageGenerationConfig, PackageGenerationStore, PromotionOutcome, RecoveryOutcome,
        STAGED_INTENT_FILE, prepare_staged_marker, publish_intent, read_marker,
    };

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-INSTALLED-CATALOG-V1\0";

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
                     \"runtime\":\"libretro\",\"compatibilityStatus\":\"qualified\"}}"
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
            store.promote("install-seven").expect("generation promotes"),
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
            store.promote("update-eight").expect("update promotes"),
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
            store.promote("repeat-eight"),
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
            store.promote("tampered-seven"),
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
    fn malformed_newest_marker_fails_closed_instead_of_falling_back() {
        let fixture = Fixture::new();
        fixture.stage("install-seven", 7, "1.0.0");
        let store = fixture.store();
        store.promote("install-seven").expect("generation promotes");
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
