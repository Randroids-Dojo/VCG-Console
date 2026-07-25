//! Crash-recoverable persistence for the closed device-wide accessibility v1
//! preference document.

use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};

const SCHEMA_VERSION: u32 = 1;
const MAX_DOCUMENT_BYTES: u64 = 1_024;
const GENERATIONS_DIRECTORY: &str = "generations";
const LOCK_FILE: &str = "accessibility.lock";
const RESET_MARKER: &str = "reset-required";
const INCOMING_PREFIX: &str = ".incoming-";
const DOCUMENT_SUFFIX: &str = ".json";
const MAX_DIRECTORY_ENTRIES: usize = 4;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityTextScale {
    #[default]
    Standard,
    Large,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityContrast {
    #[default]
    Standard,
    High,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityMotion {
    #[default]
    System,
    Reduced,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilitySeatedPlay {
    #[default]
    Standard,
    Preferred,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityConfirmButton {
    #[default]
    South,
    West,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityAudioCues {
    #[default]
    On,
    Off,
}

/// Exact device-wide accessibility preference document shared with the desk
/// launcher prototype.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccessibilityPreferences {
    schema_version: u32,
    text_scale: AccessibilityTextScale,
    contrast: AccessibilityContrast,
    motion: AccessibilityMotion,
    seated_play: AccessibilitySeatedPlay,
    confirm_button: AccessibilityConfirmButton,
    audio_cues: AccessibilityAudioCues,
}

impl Default for AccessibilityPreferences {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            text_scale: AccessibilityTextScale::Standard,
            contrast: AccessibilityContrast::Standard,
            motion: AccessibilityMotion::System,
            seated_play: AccessibilitySeatedPlay::Standard,
            confirm_button: AccessibilityConfirmButton::South,
            audio_cues: AccessibilityAudioCues::On,
        }
    }
}

impl AccessibilityPreferences {
    #[must_use]
    pub const fn new(
        text_scale: AccessibilityTextScale,
        contrast: AccessibilityContrast,
        motion: AccessibilityMotion,
        seated_play: AccessibilitySeatedPlay,
        confirm_button: AccessibilityConfirmButton,
        audio_cues: AccessibilityAudioCues,
    ) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            text_scale,
            contrast,
            motion,
            seated_play,
            confirm_button,
            audio_cues,
        }
    }

    /// Parses only the exact bounded v1 document.
    ///
    /// # Errors
    ///
    /// Returns an error for oversized, malformed, wrong-version, open, or
    /// out-of-vocabulary JSON.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, AccessibilityStoreError> {
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_DOCUMENT_BYTES {
            return Err(AccessibilityStoreError::InvalidDocument(
                "accessibility document exceeds 1024 bytes".to_owned(),
            ));
        }
        let preferences: Self = serde_json::from_slice(bytes)
            .map_err(|error| AccessibilityStoreError::InvalidDocument(error.to_string()))?;
        if preferences.schema_version != SCHEMA_VERSION {
            return Err(AccessibilityStoreError::InvalidDocument(
                "unsupported accessibility schema version".to_owned(),
            ));
        }
        Ok(preferences)
    }

    /// Produces the canonical compact v1 document.
    ///
    /// # Errors
    ///
    /// Returns an error if serialization unexpectedly fails or exceeds the
    /// fixed document ceiling.
    pub fn to_json_bytes(self) -> Result<Vec<u8>, AccessibilityStoreError> {
        let mut bytes = serde_json::to_vec(&self)
            .map_err(|error| AccessibilityStoreError::InvalidDocument(error.to_string()))?;
        bytes.push(b'\n');
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_DOCUMENT_BYTES {
            return Err(AccessibilityStoreError::InvalidDocument(
                "accessibility document exceeds 1024 bytes".to_owned(),
            ));
        }
        Ok(bytes)
    }

    #[must_use]
    pub const fn text_scale(self) -> AccessibilityTextScale {
        self.text_scale
    }

    #[must_use]
    pub const fn contrast(self) -> AccessibilityContrast {
        self.contrast
    }

    #[must_use]
    pub const fn motion(self) -> AccessibilityMotion {
        self.motion
    }

    #[must_use]
    pub const fn seated_play(self) -> AccessibilitySeatedPlay {
        self.seated_play
    }

    #[must_use]
    pub const fn confirm_button(self) -> AccessibilityConfirmButton {
        self.confirm_button
    }

    #[must_use]
    pub const fn audio_cues(self) -> AccessibilityAudioCues {
        self.audio_cues
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessibilityPersistence {
    Default,
    Saved,
    Rejected,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AccessibilitySnapshot {
    preferences: AccessibilityPreferences,
    persistence: AccessibilityPersistence,
}

impl AccessibilitySnapshot {
    #[must_use]
    pub const fn preferences(self) -> AccessibilityPreferences {
        self.preferences
    }

    #[must_use]
    pub const fn persistence(self) -> AccessibilityPersistence {
        self.persistence
    }
}

#[derive(Debug)]
struct Generation {
    ordinal: u64,
    path: PathBuf,
}

/// One exclusive native accessibility preference store.
#[derive(Debug)]
pub struct AccessibilityStore {
    root: PathBuf,
    generations: PathBuf,
    next_ordinal: u64,
    snapshot: AccessibilitySnapshot,
    lock: File,
}

impl Drop for AccessibilityStore {
    fn drop(&mut self) {
        let _ = fs4::FileExt::unlock(&self.lock);
    }
}

impl AccessibilityStore {
    /// Opens and recovers one absolute local store.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe layout, excessive retained state, lock
    /// contention, or an I/O failure. A malformed latest document is instead
    /// represented as conservative defaults with `Rejected` persistence.
    pub fn open(store_root: &Path) -> Result<Self, AccessibilityStoreError> {
        let root = prepare_root(store_root)?;
        let generations = prepare_generations(&root)?;
        let lock = open_lock(&root.join(LOCK_FILE))?;
        match fs4::FileExt::try_lock(&lock) {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(AccessibilityStoreError::Busy),
            Err(TryLockError::Error(source)) => {
                return Err(AccessibilityStoreError::Io {
                    operation: "lock accessibility store",
                    path: root.join(LOCK_FILE),
                    source,
                });
            }
        }
        recover_reset(&root, &generations)?;
        remove_incoming(&generations)?;
        let mut committed = committed_generations(&generations)?;
        committed.sort_by_key(|generation| generation.ordinal);
        let (snapshot, next_ordinal) = if let Some(latest) = committed.last() {
            let bytes = read_bounded(&latest.path)?;
            let snapshot = match AccessibilityPreferences::from_json_bytes(&bytes) {
                Ok(preferences) => AccessibilitySnapshot {
                    preferences,
                    persistence: AccessibilityPersistence::Saved,
                },
                Err(AccessibilityStoreError::InvalidDocument(_)) => AccessibilitySnapshot {
                    preferences: AccessibilityPreferences::default(),
                    persistence: AccessibilityPersistence::Rejected,
                },
                Err(error) => return Err(error),
            };
            let next = latest.ordinal.checked_add(1).ok_or_else(|| {
                AccessibilityStoreError::InvalidLayout(
                    "accessibility generation is exhausted".to_owned(),
                )
            })?;
            (snapshot, next)
        } else {
            (
                AccessibilitySnapshot {
                    preferences: AccessibilityPreferences::default(),
                    persistence: AccessibilityPersistence::Default,
                },
                1,
            )
        };
        cleanup_old_generations(&generations, &committed)?;
        Ok(Self {
            root,
            generations,
            next_ordinal,
            snapshot,
            lock,
        })
    }

    #[must_use]
    pub const fn snapshot(&self) -> AccessibilitySnapshot {
        self.snapshot
    }

    /// Atomically publishes one complete exact v1 document.
    ///
    /// # Errors
    ///
    /// Returns an error for publication, synchronization, ordinal exhaustion,
    /// or cleanup failure. The returned error never grants partial preference
    /// authority.
    pub fn save(
        &mut self,
        preferences: AccessibilityPreferences,
    ) -> Result<AccessibilitySnapshot, AccessibilityStoreError> {
        let bytes = preferences.to_json_bytes()?;
        let incoming = self
            .generations
            .join(format!("{INCOMING_PREFIX}{:020}", self.next_ordinal));
        let committed = generation_path(&self.generations, self.next_ordinal);
        write_new(&incoming, &bytes)?;
        if let Err(source) = fs::rename(&incoming, &committed) {
            let _ = fs::remove_file(&incoming);
            return Err(AccessibilityStoreError::Io {
                operation: "publish accessibility preferences",
                path: committed,
                source,
            });
        }
        sync_directory(&self.generations)?;
        self.next_ordinal = self.next_ordinal.checked_add(1).ok_or_else(|| {
            AccessibilityStoreError::InvalidLayout(
                "accessibility generation is exhausted".to_owned(),
            )
        })?;
        self.snapshot = AccessibilitySnapshot {
            preferences,
            persistence: AccessibilityPersistence::Saved,
        };
        let committed = committed_generations(&self.generations)?;
        cleanup_old_generations(&self.generations, &committed)?;
        Ok(self.snapshot)
    }

    /// Durably commits complete reset to conservative defaults.
    ///
    /// # Errors
    ///
    /// Returns an error when the reset marker or generation deletion cannot be
    /// persisted. Reopen completes any reset whose marker was published.
    pub fn reset(&mut self) -> Result<AccessibilitySnapshot, AccessibilityStoreError> {
        let marker = self.root.join(RESET_MARKER);
        if !path_exists(&marker)? {
            write_new(&marker, &[])?;
            sync_directory(&self.root)?;
        }
        finish_reset(&self.root, &self.generations)?;
        self.next_ordinal = 1;
        self.snapshot = AccessibilitySnapshot {
            preferences: AccessibilityPreferences::default(),
            persistence: AccessibilityPersistence::Default,
        };
        Ok(self.snapshot)
    }
}

fn prepare_root(path: &Path) -> Result<PathBuf, AccessibilityStoreError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(AccessibilityStoreError::UnsafePath(path.to_owned()));
    }
    if !path_exists(path)? {
        fs::create_dir_all(path).map_err(|source| AccessibilityStoreError::Io {
            operation: "create accessibility root",
            path: path.to_owned(),
            source,
        })?;
    }
    require_directory(path, "accessibility root")?;
    let root = fs::canonicalize(path).map_err(|source| AccessibilityStoreError::Io {
        operation: "resolve accessibility root",
        path: path.to_owned(),
        source,
    })?;
    for entry in fs::read_dir(&root).map_err(|source| AccessibilityStoreError::Io {
        operation: "enumerate accessibility root",
        path: root.clone(),
        source,
    })? {
        let entry = entry.map_err(|source| AccessibilityStoreError::Io {
            operation: "read accessibility root entry",
            path: root.clone(),
            source,
        })?;
        let name = entry.file_name();
        if name != GENERATIONS_DIRECTORY && name != LOCK_FILE && name != RESET_MARKER {
            return Err(AccessibilityStoreError::InvalidLayout(
                "accessibility root contains an unexpected entry".to_owned(),
            ));
        }
    }
    Ok(root)
}

fn prepare_generations(root: &Path) -> Result<PathBuf, AccessibilityStoreError> {
    let path = root.join(GENERATIONS_DIRECTORY);
    if !path_exists(&path)? {
        fs::create_dir(&path).map_err(|source| AccessibilityStoreError::Io {
            operation: "create accessibility generations",
            path: path.clone(),
            source,
        })?;
        sync_directory(root)?;
    }
    require_directory(&path, "accessibility generations")?;
    Ok(path)
}

fn open_lock(path: &Path) -> Result<File, AccessibilityStoreError> {
    if path_exists(path)? {
        require_file(path, "accessibility lock")?;
    }
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|source| AccessibilityStoreError::Io {
            operation: "open accessibility lock",
            path: path.to_owned(),
            source,
        })
}

fn recover_reset(root: &Path, generations: &Path) -> Result<(), AccessibilityStoreError> {
    let marker = root.join(RESET_MARKER);
    if !path_exists(&marker)? {
        return Ok(());
    }
    require_file(&marker, "accessibility reset marker")?;
    finish_reset(root, generations)
}

fn finish_reset(root: &Path, generations: &Path) -> Result<(), AccessibilityStoreError> {
    for entry in read_generation_entries(generations)? {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_layout("accessibility generation name is not UTF-8"))?;
        validate_generation_name(&name)?;
        require_file(&entry.path(), "accessibility generation")?;
        fs::remove_file(entry.path()).map_err(|source| AccessibilityStoreError::Io {
            operation: "reset accessibility preferences",
            path: entry.path(),
            source,
        })?;
    }
    sync_directory(generations)?;
    let marker = root.join(RESET_MARKER);
    if path_exists(&marker)? {
        fs::remove_file(&marker).map_err(|source| AccessibilityStoreError::Io {
            operation: "complete accessibility reset",
            path: marker,
            source,
        })?;
        sync_directory(root)?;
    }
    Ok(())
}

fn remove_incoming(generations: &Path) -> Result<(), AccessibilityStoreError> {
    let mut removed = false;
    for entry in read_generation_entries(generations)? {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_layout("accessibility generation name is not UTF-8"))?;
        if let Some(digits) = name.strip_prefix(INCOMING_PREFIX) {
            parse_ordinal(digits)?;
            require_file(&entry.path(), "incoming accessibility generation")?;
            fs::remove_file(entry.path()).map_err(|source| AccessibilityStoreError::Io {
                operation: "remove incomplete accessibility generation",
                path: entry.path(),
                source,
            })?;
            removed = true;
        }
    }
    if removed {
        sync_directory(generations)?;
    }
    Ok(())
}

fn committed_generations(generations: &Path) -> Result<Vec<Generation>, AccessibilityStoreError> {
    let mut committed = Vec::new();
    for entry in read_generation_entries(generations)? {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_layout("accessibility generation name is not UTF-8"))?;
        if name.starts_with(INCOMING_PREFIX) {
            continue;
        }
        let digits = name
            .strip_suffix(DOCUMENT_SUFFIX)
            .ok_or_else(|| invalid_layout("accessibility generation suffix is invalid"))?;
        let ordinal = parse_ordinal(digits)?;
        require_file(&entry.path(), "accessibility generation")?;
        committed.push(Generation {
            ordinal,
            path: entry.path(),
        });
    }
    Ok(committed)
}

fn cleanup_old_generations(
    generations: &Path,
    committed: &[Generation],
) -> Result<(), AccessibilityStoreError> {
    if committed.len() <= 1 {
        return Ok(());
    }
    let newest = committed
        .iter()
        .map(|generation| generation.ordinal)
        .max()
        .expect("nonempty committed accessibility generations");
    for generation in committed {
        if generation.ordinal != newest {
            fs::remove_file(&generation.path).map_err(|source| AccessibilityStoreError::Io {
                operation: "remove superseded accessibility generation",
                path: generation.path.clone(),
                source,
            })?;
        }
    }
    sync_directory(generations)
}

fn read_generation_entries(path: &Path) -> Result<Vec<fs::DirEntry>, AccessibilityStoreError> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|source| AccessibilityStoreError::Io {
        operation: "enumerate accessibility generations",
        path: path.to_owned(),
        source,
    })? {
        if entries.len() >= MAX_DIRECTORY_ENTRIES {
            return Err(invalid_layout(
                "accessibility generation directory exceeds its bound",
            ));
        }
        entries.push(entry.map_err(|source| AccessibilityStoreError::Io {
            operation: "read accessibility generation entry",
            path: path.to_owned(),
            source,
        })?);
    }
    Ok(entries)
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, AccessibilityStoreError> {
    let file = File::open(path).map_err(|source| AccessibilityStoreError::Io {
        operation: "open accessibility preferences",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_DOCUMENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| AccessibilityStoreError::Io {
            operation: "read accessibility preferences",
            path: path.to_owned(),
            source,
        })?;
    Ok(bytes)
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), AccessibilityStoreError> {
    let result = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .and_then(|mut file| {
            file.write_all(bytes)?;
            file.sync_all()
        });
    if let Err(source) = result {
        let _ = fs::remove_file(path);
        return Err(AccessibilityStoreError::Io {
            operation: "persist accessibility state",
            path: path.to_owned(),
            source,
        });
    }
    Ok(())
}

fn generation_path(directory: &Path, ordinal: u64) -> PathBuf {
    directory.join(format!("{ordinal:020}{DOCUMENT_SUFFIX}"))
}

fn parse_ordinal(digits: &str) -> Result<u64, AccessibilityStoreError> {
    if digits.len() != 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_layout("accessibility generation is not canonical"));
    }
    let ordinal = digits
        .parse::<u64>()
        .map_err(|_| invalid_layout("accessibility generation is invalid"))?;
    if ordinal == 0 {
        return Err(invalid_layout("accessibility generation must be nonzero"));
    }
    Ok(ordinal)
}

fn validate_generation_name(name: &str) -> Result<u64, AccessibilityStoreError> {
    if let Some(digits) = name.strip_prefix(INCOMING_PREFIX) {
        return parse_ordinal(digits);
    }
    let digits = name
        .strip_suffix(DOCUMENT_SUFFIX)
        .ok_or_else(|| invalid_layout("accessibility generation suffix is invalid"))?;
    parse_ordinal(digits)
}

fn path_exists(path: &Path) -> Result<bool, AccessibilityStoreError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(AccessibilityStoreError::Io {
            operation: "inspect accessibility path",
            path: path.to_owned(),
            source,
        }),
    }
}

fn require_directory(path: &Path, kind: &'static str) -> Result<(), AccessibilityStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| AccessibilityStoreError::Io {
        operation: "inspect accessibility directory",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AccessibilityStoreError::UnsafeLayout {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn require_file(path: &Path, kind: &'static str) -> Result<(), AccessibilityStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| AccessibilityStoreError::Io {
        operation: "inspect accessibility file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AccessibilityStoreError::UnsafeLayout {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), AccessibilityStoreError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| AccessibilityStoreError::Io {
            operation: "synchronize accessibility directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(
    clippy::unnecessary_wraps,
    reason = "Windows does not expose the Unix directory synchronization primitive"
)]
fn sync_directory(_path: &Path) -> Result<(), AccessibilityStoreError> {
    Ok(())
}

fn invalid_layout(message: &str) -> AccessibilityStoreError {
    AccessibilityStoreError::InvalidLayout(message.to_owned())
}

#[derive(Debug)]
pub enum AccessibilityStoreError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    UnsafePath(PathBuf),
    UnsafeLayout {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidLayout(String),
    InvalidDocument(String),
    Busy,
}

impl fmt::Display for AccessibilityStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} at {}: {source}", path.display()),
            Self::UnsafePath(path) => {
                write!(formatter, "unsafe accessibility path {}", path.display())
            }
            Self::UnsafeLayout { kind, path } => {
                write!(formatter, "{kind} has an unsafe type at {}", path.display())
            }
            Self::InvalidLayout(message) | Self::InvalidDocument(message) => {
                formatter.write_str(message)
            }
            Self::Busy => formatter.write_str("accessibility store is already open"),
        }
    }
}

impl std::error::Error for AccessibilityStoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let unique = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            Self {
                root: std::env::temp_dir()
                    .join(format!("vcg-accessibility-{}-{unique}", std::process::id())),
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn changed() -> AccessibilityPreferences {
        AccessibilityPreferences::new(
            AccessibilityTextScale::Large,
            AccessibilityContrast::High,
            AccessibilityMotion::Reduced,
            AccessibilitySeatedPlay::Preferred,
            AccessibilityConfirmButton::West,
            AccessibilityAudioCues::Off,
        )
    }

    #[test]
    fn defaults_are_exact_and_authority_free() {
        let fixture = Fixture::new();
        let store = AccessibilityStore::open(&fixture.root).expect("open");
        assert_eq!(
            store.snapshot(),
            AccessibilitySnapshot {
                preferences: AccessibilityPreferences::default(),
                persistence: AccessibilityPersistence::Default
            }
        );
    }

    #[test]
    fn exact_browser_v1_document_round_trips() {
        let bytes = br#"{"schemaVersion":1,"textScale":"large","contrast":"high","motion":"reduced","seatedPlay":"preferred","confirmButton":"west","audioCues":"off"}"#;
        let parsed = AccessibilityPreferences::from_json_bytes(bytes).expect("parse");
        assert_eq!(parsed, changed());
        assert_eq!(
            AccessibilityPreferences::from_json_bytes(&parsed.to_json_bytes().expect("serialize"))
                .expect("reparse"),
            parsed
        );
    }

    #[test]
    fn strict_parser_rejects_open_wrong_and_oversized_documents() {
        for invalid in [
            br"{}".as_slice(),
            br#"{"schemaVersion":2,"textScale":"standard","contrast":"standard","motion":"system","seatedPlay":"standard","confirmButton":"south","audioCues":"on"}"#,
            br#"{"schemaVersion":1,"textScale":"huge","contrast":"standard","motion":"system","seatedPlay":"standard","confirmButton":"south","audioCues":"on"}"#,
            br#"{"schemaVersion":1,"textScale":"standard","contrast":"standard","motion":"system","seatedPlay":"standard","confirmButton":"south","audioCues":"on","extra":true}"#,
        ] {
            assert!(AccessibilityPreferences::from_json_bytes(invalid).is_err());
        }
        assert!(
            AccessibilityPreferences::from_json_bytes(&vec![
                b' ';
                usize::try_from(MAX_DOCUMENT_BYTES)
                    .expect("bound")
                    + 1
            ])
            .is_err()
        );
    }

    #[test]
    fn save_is_atomic_reopens_and_removes_superseded_generation() {
        let fixture = Fixture::new();
        {
            let mut store = AccessibilityStore::open(&fixture.root).expect("open");
            assert_eq!(
                store.save(changed()).expect("save").persistence(),
                AccessibilityPersistence::Saved
            );
            store
                .save(AccessibilityPreferences::default())
                .expect("second save");
        }
        let reopened = AccessibilityStore::open(&fixture.root).expect("reopen");
        assert_eq!(
            reopened.snapshot().preferences(),
            AccessibilityPreferences::default()
        );
        assert_eq!(
            fs::read_dir(fixture.root.join(GENERATIONS_DIRECTORY))
                .expect("generations")
                .count(),
            1
        );
    }

    #[test]
    fn incomplete_incoming_file_is_never_loaded() {
        let fixture = Fixture::new();
        {
            let _store = AccessibilityStore::open(&fixture.root).expect("open");
        }
        let incoming = fixture
            .root
            .join(GENERATIONS_DIRECTORY)
            .join(".incoming-00000000000000000001");
        fs::write(&incoming, b"partial").expect("partial");
        let store = AccessibilityStore::open(&fixture.root).expect("recover");
        assert_eq!(
            store.snapshot().persistence(),
            AccessibilityPersistence::Default
        );
        assert!(!incoming.exists());
    }

    #[test]
    fn malformed_committed_state_is_disclosed_and_replaceable() {
        let fixture = Fixture::new();
        {
            let mut store = AccessibilityStore::open(&fixture.root).expect("open");
            store.save(changed()).expect("save");
        }
        fs::write(
            generation_path(&fixture.root.join(GENERATIONS_DIRECTORY), 1),
            b"{broken",
        )
        .expect("corrupt");
        let mut store = AccessibilityStore::open(&fixture.root).expect("reopen");
        assert_eq!(
            store.snapshot(),
            AccessibilitySnapshot {
                preferences: AccessibilityPreferences::default(),
                persistence: AccessibilityPersistence::Rejected
            }
        );
        assert_eq!(
            store
                .save(changed())
                .expect("replace rejected")
                .persistence(),
            AccessibilityPersistence::Saved
        );
    }

    #[test]
    fn reset_marker_makes_reset_recoverable() {
        let fixture = Fixture::new();
        {
            let mut store = AccessibilityStore::open(&fixture.root).expect("open");
            store.save(changed()).expect("save");
        }
        fs::write(fixture.root.join(RESET_MARKER), b"").expect("reset marker");
        let store = AccessibilityStore::open(&fixture.root).expect("recover reset");
        assert_eq!(
            store.snapshot().persistence(),
            AccessibilityPersistence::Default
        );
        assert_eq!(
            fs::read_dir(fixture.root.join(GENERATIONS_DIRECTORY))
                .expect("generations")
                .count(),
            0
        );
    }

    #[test]
    fn unsafe_layout_and_lock_contention_fail_closed() {
        let fixture = Fixture::new();
        assert!(matches!(
            AccessibilityStore::open(Path::new("relative")),
            Err(AccessibilityStoreError::UnsafePath(_))
        ));
        let store = AccessibilityStore::open(&fixture.root).expect("open");
        assert!(matches!(
            AccessibilityStore::open(&fixture.root),
            Err(AccessibilityStoreError::Busy)
        ));
        drop(store);
        fs::write(fixture.root.join("unexpected"), b"no").expect("unexpected");
        assert!(matches!(
            AccessibilityStore::open(&fixture.root),
            Err(AccessibilityStoreError::InvalidLayout(_))
        ));
    }
}
