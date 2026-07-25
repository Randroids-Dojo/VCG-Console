//! Bounded, path-free native diagnostic records.
//!
//! The store is deliberately not an export or telemetry API. A trusted host
//! chooses the retention bounds and hands move-only producer leases to the
//! exact in-process adapters that may emit each closed code.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};

const EVENT_SCHEMA_VERSION: u32 = 1;
const EVENTS_DIRECTORY: &str = "events";
const LOCK_FILE: &str = "diagnostics.lock";
const EVENT_SUFFIX: &str = ".json";
const INCOMING_PREFIX: &str = ".incoming-";
const MAX_STORED_EVENT_BYTES: u64 = 512;
const HARD_MAX_EVENTS: usize = 4_096;
const HARD_MAX_BYTES: u64 = 4 * 1_024 * 1_024;
const HARD_MAX_BOOT_EPOCHS: usize = 64;
const MIN_BYTE_BUDGET: u64 = MAX_STORED_EVENT_BYTES;

/// Trusted native component allowed to produce a closed subset of codes.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticProducer {
    AccessController,
    Launcher,
    PackageManager,
    PowerCoordinator,
    ProcessSupervisor,
    SystemUpdate,
}

/// Fixed diagnostic subsystem derived from the code.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticSubsystem {
    Access,
    Launcher,
    Packages,
    Power,
    Process,
    Updates,
}

/// Fixed severity derived from the code.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticSeverity {
    Info,
    Warning,
}

/// Closed native diagnostic vocabulary.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeDiagnosticCode {
    AccessAdminEntered,
    AccessConfirmationExpired,
    AccessDeveloperEnded,
    AccessDeveloperEntered,
    AccessFamilyLocked,
    LauncherReady,
    LaunchStarted,
    PackageInventoryAvailable,
    PackageInventoryUnavailable,
    PowerIdleStarted,
    PowerTransitionFailed,
    PowerWakeStarted,
    ProcessActivationDenied,
    ProcessChildExitedUnexpectedly,
    UpdateHealthFailed,
    UpdateRollbackStarted,
}

impl NativeDiagnosticCode {
    #[must_use]
    pub const fn producer(self) -> DiagnosticProducer {
        match self {
            Self::AccessAdminEntered
            | Self::AccessConfirmationExpired
            | Self::AccessDeveloperEnded
            | Self::AccessDeveloperEntered
            | Self::AccessFamilyLocked => DiagnosticProducer::AccessController,
            Self::LauncherReady | Self::LaunchStarted => DiagnosticProducer::Launcher,
            Self::PackageInventoryAvailable | Self::PackageInventoryUnavailable => {
                DiagnosticProducer::PackageManager
            }
            Self::PowerIdleStarted | Self::PowerTransitionFailed | Self::PowerWakeStarted => {
                DiagnosticProducer::PowerCoordinator
            }
            Self::ProcessActivationDenied | Self::ProcessChildExitedUnexpectedly => {
                DiagnosticProducer::ProcessSupervisor
            }
            Self::UpdateHealthFailed | Self::UpdateRollbackStarted => {
                DiagnosticProducer::SystemUpdate
            }
        }
    }

    #[must_use]
    pub const fn subsystem(self) -> DiagnosticSubsystem {
        match self.producer() {
            DiagnosticProducer::AccessController => DiagnosticSubsystem::Access,
            DiagnosticProducer::Launcher => DiagnosticSubsystem::Launcher,
            DiagnosticProducer::PackageManager => DiagnosticSubsystem::Packages,
            DiagnosticProducer::PowerCoordinator => DiagnosticSubsystem::Power,
            DiagnosticProducer::ProcessSupervisor => DiagnosticSubsystem::Process,
            DiagnosticProducer::SystemUpdate => DiagnosticSubsystem::Updates,
        }
    }

    #[must_use]
    pub const fn severity(self) -> DiagnosticSeverity {
        match self {
            Self::AccessConfirmationExpired
            | Self::AccessDeveloperEntered
            | Self::PackageInventoryUnavailable
            | Self::PowerTransitionFailed
            | Self::ProcessActivationDenied
            | Self::ProcessChildExitedUnexpectedly
            | Self::UpdateHealthFailed
            | Self::UpdateRollbackStarted => DiagnosticSeverity::Warning,
            Self::AccessAdminEntered
            | Self::AccessDeveloperEnded
            | Self::AccessFamilyLocked
            | Self::LauncherReady
            | Self::LaunchStarted
            | Self::PackageInventoryAvailable
            | Self::PowerIdleStarted
            | Self::PowerWakeStarted => DiagnosticSeverity::Info,
        }
    }
}

/// Caller-selected retention bounds. Product defaults remain an owner choice.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeDiagnosticStoreConfig {
    pub store_root: PathBuf,
    pub maximum_events: usize,
    pub maximum_bytes: u64,
    pub maximum_boot_epochs: usize,
}

/// Move-only, store-bound authority for one exact producer.
#[derive(Debug)]
pub struct DiagnosticProducerLease {
    producer: DiagnosticProducer,
    store_nonce: [u8; 16],
}

/// One immutable, path-free native diagnostic event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeDiagnosticEvent {
    ordinal: u64,
    boot_epoch: u64,
    uptime_ms: u64,
    producer: DiagnosticProducer,
    subsystem: DiagnosticSubsystem,
    severity: DiagnosticSeverity,
    code: NativeDiagnosticCode,
}

impl NativeDiagnosticEvent {
    #[must_use]
    pub const fn ordinal(&self) -> u64 {
        self.ordinal
    }

    #[must_use]
    pub const fn boot_epoch(&self) -> u64 {
        self.boot_epoch
    }

    #[must_use]
    pub const fn uptime_ms(&self) -> u64 {
        self.uptime_ms
    }

    #[must_use]
    pub const fn producer(&self) -> DiagnosticProducer {
        self.producer
    }

    #[must_use]
    pub const fn subsystem(&self) -> DiagnosticSubsystem {
        self.subsystem
    }

    #[must_use]
    pub const fn severity(&self) -> DiagnosticSeverity {
        self.severity
    }

    #[must_use]
    pub const fn code(&self) -> NativeDiagnosticCode {
        self.code
    }
}

/// Read-only review material. It is intentionally not serializable.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeDiagnosticSnapshot {
    events: Vec<NativeDiagnosticEvent>,
    evicted_events: u64,
    retained_bytes: u64,
    maximum_events: usize,
    maximum_bytes: u64,
    maximum_boot_epochs: usize,
}

impl NativeDiagnosticSnapshot {
    #[must_use]
    pub fn events(&self) -> &[NativeDiagnosticEvent] {
        &self.events
    }

    #[must_use]
    pub const fn evicted_events(&self) -> u64 {
        self.evicted_events
    }

    #[must_use]
    pub const fn retained_bytes(&self) -> u64 {
        self.retained_bytes
    }

    #[must_use]
    pub const fn maximum_events(&self) -> usize {
        self.maximum_events
    }

    #[must_use]
    pub const fn maximum_bytes(&self) -> u64 {
        self.maximum_bytes
    }

    #[must_use]
    pub const fn maximum_boot_epochs(&self) -> usize {
        self.maximum_boot_epochs
    }

    #[must_use]
    pub const fn contains_raw_frames(&self) -> bool {
        false
    }

    #[must_use]
    pub const fn contains_skeletons(&self) -> bool {
        false
    }

    #[must_use]
    pub const fn contains_profiles(&self) -> bool {
        false
    }

    #[must_use]
    pub const fn contains_personal_identifiers(&self) -> bool {
        false
    }

    #[must_use]
    pub const fn contains_credentials(&self) -> bool {
        false
    }

    #[must_use]
    pub const fn contains_free_text(&self) -> bool {
        false
    }

    #[must_use]
    pub fn retained_warning_events(&self) -> usize {
        self.events
            .iter()
            .filter(|event| event.severity == DiagnosticSeverity::Warning)
            .count()
    }

    #[must_use]
    pub fn subsystem_count(&self, subsystem: DiagnosticSubsystem) -> usize {
        self.events
            .iter()
            .filter(|event| event.subsystem == subsystem)
            .count()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredDiagnosticEvent {
    schema_version: u32,
    ordinal: u64,
    boot_epoch: u64,
    uptime_ms: u64,
    producer: DiagnosticProducer,
    subsystem: DiagnosticSubsystem,
    severity: DiagnosticSeverity,
    code: NativeDiagnosticCode,
}

impl StoredDiagnosticEvent {
    fn new(ordinal: u64, boot_epoch: u64, uptime_ms: u64, code: NativeDiagnosticCode) -> Self {
        Self {
            schema_version: EVENT_SCHEMA_VERSION,
            ordinal,
            boot_epoch,
            uptime_ms,
            producer: code.producer(),
            subsystem: code.subsystem(),
            severity: code.severity(),
            code,
        }
    }

    fn validate(&self) -> Result<(), NativeDiagnosticError> {
        if self.schema_version != EVENT_SCHEMA_VERSION {
            return Err(invalid_store("unsupported diagnostic event schema"));
        }
        if self.ordinal == 0 || self.boot_epoch == 0 {
            return Err(invalid_store(
                "diagnostic ordinals and boot epochs must be nonzero",
            ));
        }
        if self.producer != self.code.producer()
            || self.subsystem != self.code.subsystem()
            || self.severity != self.code.severity()
        {
            return Err(invalid_store(
                "diagnostic metadata does not match its closed code",
            ));
        }
        Ok(())
    }

    fn public_event(&self) -> NativeDiagnosticEvent {
        NativeDiagnosticEvent {
            ordinal: self.ordinal,
            boot_epoch: self.boot_epoch,
            uptime_ms: self.uptime_ms,
            producer: self.producer,
            subsystem: self.subsystem,
            severity: self.severity,
            code: self.code,
        }
    }
}

#[derive(Debug)]
struct RetainedEvent {
    stored: StoredDiagnosticEvent,
    bytes: u64,
    path: PathBuf,
}

/// Exclusive crash-recoverable native diagnostic store.
#[derive(Debug)]
pub struct NativeDiagnosticStore {
    events_directory: PathBuf,
    config: NativeDiagnosticStoreConfig,
    boot_epoch: u64,
    next_ordinal: u64,
    store_nonce: [u8; 16],
    retained: Vec<RetainedEvent>,
    last_uptime_by_producer: BTreeMap<DiagnosticProducer, u64>,
    lock: File,
}

impl Drop for NativeDiagnosticStore {
    fn drop(&mut self) {
        let _ = fs4::FileExt::unlock(&self.lock);
    }
}

impl NativeDiagnosticStore {
    /// Opens one exclusive store for an exact positive boot epoch.
    ///
    /// The caller remains responsible for obtaining the boot epoch from a
    /// trustworthy platform boundary. This store does not treat diagnostics as
    /// rollback-protected security authority.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe layout or policy, lock contention, malformed
    /// retained records, boot-epoch rollback, I/O failure, or unavailable
    /// randomness.
    pub fn open(
        config: NativeDiagnosticStoreConfig,
        boot_epoch: u64,
    ) -> Result<Self, NativeDiagnosticError> {
        validate_config(&config)?;
        if boot_epoch == 0 {
            return Err(NativeDiagnosticError::InvalidConfiguration(
                "diagnostic boot epoch must be nonzero".to_owned(),
            ));
        }
        let root = prepare_root(&config.store_root)?;
        let events_directory = prepare_events_directory(&root)?;
        let lock = open_lock(&root.join(LOCK_FILE))?;
        match fs4::FileExt::try_lock(&lock) {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(NativeDiagnosticError::Busy),
            Err(TryLockError::Error(source)) => {
                return Err(NativeDiagnosticError::Io {
                    operation: "lock native diagnostics",
                    path: root.join(LOCK_FILE),
                    source,
                });
            }
        }
        recover_incoming(&events_directory)?;
        let retained = load_events(&events_directory)?;
        validate_event_history(&retained, boot_epoch)?;
        let next_ordinal = retained.last().map_or(Ok(1), |event| {
            event
                .stored
                .ordinal
                .checked_add(1)
                .ok_or_else(|| invalid_store("native diagnostic event ordinal is exhausted"))
        })?;
        let mut nonce = [0_u8; 16];
        getrandom::fill(&mut nonce).map_err(NativeDiagnosticError::Random)?;
        let mut store = Self {
            events_directory,
            config,
            boot_epoch,
            next_ordinal,
            store_nonce: nonce,
            retained,
            last_uptime_by_producer: BTreeMap::new(),
            lock,
        };
        store.rebuild_uptime_index();
        store.enforce_retention()?;
        Ok(store)
    }

    /// Issues a move-only capability that can emit only this producer's codes.
    #[must_use]
    pub const fn authorize_producer(
        &self,
        producer: DiagnosticProducer,
    ) -> DiagnosticProducerLease {
        DiagnosticProducerLease {
            producer,
            store_nonce: self.store_nonce,
        }
    }

    /// Crash-safely appends one closed event and then enforces all selected
    /// retention bounds oldest-first.
    ///
    /// # Errors
    ///
    /// Returns an error when the lease is foreign, the code belongs to another
    /// producer, producer time reverses, publication or rotation fails, or a
    /// configured byte bound cannot contain the fixed record.
    pub fn record(
        &mut self,
        lease: &DiagnosticProducerLease,
        code: NativeDiagnosticCode,
        uptime_ms: u64,
    ) -> Result<NativeDiagnosticEvent, NativeDiagnosticError> {
        if lease.store_nonce != self.store_nonce {
            return Err(NativeDiagnosticError::ForeignProducerLease);
        }
        if lease.producer != code.producer() {
            return Err(NativeDiagnosticError::ProducerCodeMismatch);
        }
        if self
            .last_uptime_by_producer
            .get(&lease.producer)
            .is_some_and(|last| uptime_ms < *last)
        {
            return Err(NativeDiagnosticError::TimeReversal);
        }

        let event = StoredDiagnosticEvent::new(self.next_ordinal, self.boot_epoch, uptime_ms, code);
        let bytes = serialize_event(&event)?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > self.config.maximum_bytes {
            return Err(NativeDiagnosticError::EventExceedsRetentionBudget);
        }
        let path = event_path(&self.events_directory, event.ordinal);
        let incoming = incoming_path(&self.events_directory, event.ordinal);
        write_incoming(&incoming, &bytes)?;
        if let Err(source) = fs::rename(&incoming, &path) {
            let _ = fs::remove_file(&incoming);
            return Err(NativeDiagnosticError::Io {
                operation: "publish native diagnostic event",
                path,
                source,
            });
        }
        sync_directory(&self.events_directory)?;

        self.next_ordinal = self
            .next_ordinal
            .checked_add(1)
            .ok_or_else(|| invalid_store("native diagnostic event ordinal is exhausted"))?;
        self.last_uptime_by_producer
            .insert(lease.producer, uptime_ms);
        let public = event.public_event();
        self.retained.push(RetainedEvent {
            stored: event,
            bytes: u64::try_from(bytes.len()).unwrap_or(u64::MAX),
            path,
        });
        self.enforce_retention()?;
        Ok(public)
    }

    /// Returns path-free review material without granting export authority.
    #[must_use]
    pub fn snapshot(&self) -> NativeDiagnosticSnapshot {
        let evicted_events = self
            .retained
            .first()
            .map_or(0, |event| event.stored.ordinal.saturating_sub(1));
        NativeDiagnosticSnapshot {
            events: self
                .retained
                .iter()
                .map(|event| event.stored.public_event())
                .collect(),
            evicted_events,
            retained_bytes: self.retained.iter().map(|event| event.bytes).sum(),
            maximum_events: self.config.maximum_events,
            maximum_bytes: self.config.maximum_bytes,
            maximum_boot_epochs: self.config.maximum_boot_epochs,
        }
    }

    fn rebuild_uptime_index(&mut self) {
        self.last_uptime_by_producer.clear();
        for event in &self.retained {
            if event.stored.boot_epoch == self.boot_epoch {
                self.last_uptime_by_producer
                    .insert(event.stored.producer, event.stored.uptime_ms);
            }
        }
    }

    fn enforce_retention(&mut self) -> Result<(), NativeDiagnosticError> {
        let mut remove_count = 0;
        let boot_epochs = self
            .retained
            .iter()
            .map(|event| event.stored.boot_epoch)
            .collect::<BTreeSet<_>>();
        if boot_epochs.len() > self.config.maximum_boot_epochs {
            let keep_from = *boot_epochs
                .iter()
                .nth(boot_epochs.len() - self.config.maximum_boot_epochs)
                .expect("nonempty boot epoch set");
            remove_count = self
                .retained
                .iter()
                .take_while(|event| event.stored.boot_epoch < keep_from)
                .count();
        }
        remove_count = remove_count.max(
            self.retained
                .len()
                .saturating_sub(self.config.maximum_events),
        );
        let mut retained_bytes: u64 = self.retained.iter().map(|event| event.bytes).sum();
        while retained_bytes > self.config.maximum_bytes && remove_count < self.retained.len() {
            retained_bytes = retained_bytes.saturating_sub(self.retained[remove_count].bytes);
            remove_count += 1;
        }
        if remove_count == 0 {
            return Ok(());
        }
        for index in 0..remove_count {
            if let Err(source) = fs::remove_file(&self.retained[index].path) {
                if index > 0 {
                    self.retained.drain(..index);
                    let _ = sync_directory(&self.events_directory);
                }
                return Err(NativeDiagnosticError::Io {
                    operation: "rotate native diagnostic event",
                    path: self
                        .retained
                        .first()
                        .map_or_else(|| self.events_directory.clone(), |event| event.path.clone()),
                    source,
                });
            }
        }
        self.retained.drain(..remove_count);
        sync_directory(&self.events_directory)
    }
}

fn validate_config(config: &NativeDiagnosticStoreConfig) -> Result<(), NativeDiagnosticError> {
    if config.maximum_events == 0 || config.maximum_events > HARD_MAX_EVENTS {
        return Err(NativeDiagnosticError::InvalidConfiguration(format!(
            "diagnostic event bound must be between 1 and {HARD_MAX_EVENTS}"
        )));
    }
    if !(MIN_BYTE_BUDGET..=HARD_MAX_BYTES).contains(&config.maximum_bytes) {
        return Err(NativeDiagnosticError::InvalidConfiguration(format!(
            "diagnostic byte bound must be between {MIN_BYTE_BUDGET} and {HARD_MAX_BYTES}"
        )));
    }
    if config.maximum_boot_epochs == 0 || config.maximum_boot_epochs > HARD_MAX_BOOT_EPOCHS {
        return Err(NativeDiagnosticError::InvalidConfiguration(format!(
            "diagnostic boot-epoch bound must be between 1 and {HARD_MAX_BOOT_EPOCHS}"
        )));
    }
    Ok(())
}

fn prepare_root(path: &Path) -> Result<PathBuf, NativeDiagnosticError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(NativeDiagnosticError::UnsafePath(path.to_owned()));
    }
    if !path_exists(path)? {
        fs::create_dir_all(path).map_err(|source| NativeDiagnosticError::Io {
            operation: "create native diagnostics root",
            path: path.to_owned(),
            source,
        })?;
    }
    require_directory(path, "native diagnostics root")?;
    let root = fs::canonicalize(path).map_err(|source| NativeDiagnosticError::Io {
        operation: "resolve native diagnostics root",
        path: path.to_owned(),
        source,
    })?;
    validate_root_entries(&root)?;
    Ok(root)
}

fn validate_root_entries(root: &Path) -> Result<(), NativeDiagnosticError> {
    let entries = fs::read_dir(root).map_err(|source| NativeDiagnosticError::Io {
        operation: "enumerate native diagnostics root",
        path: root.to_owned(),
        source,
    })?;
    for entry in entries {
        let entry = entry.map_err(|source| NativeDiagnosticError::Io {
            operation: "read native diagnostics root entry",
            path: root.to_owned(),
            source,
        })?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_store("native diagnostics root entry is not UTF-8"))?;
        if name != EVENTS_DIRECTORY && name != LOCK_FILE {
            return Err(invalid_store(
                "native diagnostics root contains an unexpected entry",
            ));
        }
    }
    Ok(())
}

fn prepare_events_directory(root: &Path) -> Result<PathBuf, NativeDiagnosticError> {
    let path = root.join(EVENTS_DIRECTORY);
    if !path_exists(&path)? {
        fs::create_dir(&path).map_err(|source| NativeDiagnosticError::Io {
            operation: "create native diagnostics event directory",
            path: path.clone(),
            source,
        })?;
        sync_directory(root)?;
    }
    require_directory(&path, "native diagnostics event directory")?;
    Ok(path)
}

fn open_lock(path: &Path) -> Result<File, NativeDiagnosticError> {
    let existed = path_exists(path)?;
    if existed {
        require_regular_file(path, "native diagnostics lock")?;
    }
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|source| NativeDiagnosticError::Io {
            operation: "open native diagnostics lock",
            path: path.to_owned(),
            source,
        })?;
    if !existed {
        lock.sync_all()
            .map_err(|source| NativeDiagnosticError::Io {
                operation: "persist native diagnostics lock",
                path: path.to_owned(),
                source,
            })?;
        if let Some(parent) = path.parent() {
            sync_directory(parent)?;
        }
    }
    Ok(lock)
}

fn recover_incoming(events: &Path) -> Result<(), NativeDiagnosticError> {
    let entries = read_directory_bounded(events)?;
    let mut removed = false;
    for entry in entries {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_store("native diagnostic event name is not UTF-8"))?;
        if name.starts_with(INCOMING_PREFIX) {
            parse_incoming_name(&name)?;
            require_regular_file(&entry.path(), "incoming native diagnostic event")?;
            fs::remove_file(entry.path()).map_err(|source| NativeDiagnosticError::Io {
                operation: "remove incomplete native diagnostic event",
                path: entry.path(),
                source,
            })?;
            removed = true;
        }
    }
    if removed {
        sync_directory(events)?;
    }
    Ok(())
}

fn load_events(events: &Path) -> Result<Vec<RetainedEvent>, NativeDiagnosticError> {
    let entries = read_directory_bounded(events)?;
    let mut retained = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_store("native diagnostic event name is not UTF-8"))?;
        if name.starts_with(INCOMING_PREFIX) {
            continue;
        }
        let ordinal = parse_event_name(&name)?;
        let path = entry.path();
        require_regular_file(&path, "native diagnostic event")?;
        let (stored, bytes) = read_event(&path)?;
        stored.validate()?;
        if stored.ordinal != ordinal {
            return Err(invalid_store(
                "native diagnostic event does not match its filename",
            ));
        }
        retained.push(RetainedEvent {
            stored,
            bytes,
            path,
        });
    }
    retained.sort_by_key(|event| event.stored.ordinal);
    if retained.len() > HARD_MAX_EVENTS {
        return Err(NativeDiagnosticError::StoreLimitExceeded);
    }
    Ok(retained)
}

fn validate_event_history(
    retained: &[RetainedEvent],
    requested_boot_epoch: u64,
) -> Result<(), NativeDiagnosticError> {
    let mut current_boot_epoch = None;
    let mut last_uptime_by_producer = BTreeMap::new();
    for pair in retained.windows(2) {
        let prior = &pair[0].stored;
        let next = &pair[1].stored;
        if next.ordinal != prior.ordinal + 1 {
            return Err(invalid_store(
                "native diagnostic event ordinals are not contiguous",
            ));
        }
        if next.boot_epoch < prior.boot_epoch {
            return Err(invalid_store("native diagnostic boot epochs move backward"));
        }
    }
    for event in retained {
        if current_boot_epoch != Some(event.stored.boot_epoch) {
            current_boot_epoch = Some(event.stored.boot_epoch);
            last_uptime_by_producer.clear();
        }
        if last_uptime_by_producer
            .get(&event.stored.producer)
            .is_some_and(|last| event.stored.uptime_ms < *last)
        {
            return Err(invalid_store(
                "native diagnostic producer uptime moves backward",
            ));
        }
        last_uptime_by_producer.insert(event.stored.producer, event.stored.uptime_ms);
    }
    if retained
        .last()
        .is_some_and(|event| event.stored.boot_epoch > requested_boot_epoch)
    {
        return Err(NativeDiagnosticError::BootEpochRollback);
    }
    Ok(())
}

fn serialize_event(event: &StoredDiagnosticEvent) -> Result<Vec<u8>, NativeDiagnosticError> {
    let mut bytes = serde_json::to_vec(event)
        .map_err(|source| NativeDiagnosticError::InvalidStore(source.to_string()))?;
    bytes.push(b'\n');
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_STORED_EVENT_BYTES {
        return Err(NativeDiagnosticError::EventTooLarge);
    }
    Ok(bytes)
}

fn read_event(path: &Path) -> Result<(StoredDiagnosticEvent, u64), NativeDiagnosticError> {
    let file = File::open(path).map_err(|source| NativeDiagnosticError::Io {
        operation: "open native diagnostic event",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_STORED_EVENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| NativeDiagnosticError::Io {
            operation: "read native diagnostic event",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_STORED_EVENT_BYTES {
        return Err(NativeDiagnosticError::EventTooLarge);
    }
    let stored = serde_json::from_slice(&bytes)
        .map_err(|source| NativeDiagnosticError::InvalidStore(source.to_string()))?;
    Ok((stored, u64::try_from(bytes.len()).unwrap_or(u64::MAX)))
}

fn write_incoming(path: &Path, bytes: &[u8]) -> Result<(), NativeDiagnosticError> {
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
        return Err(NativeDiagnosticError::Io {
            operation: "persist incoming native diagnostic event",
            path: path.to_owned(),
            source,
        });
    }
    Ok(())
}

fn read_directory_bounded(path: &Path) -> Result<Vec<fs::DirEntry>, NativeDiagnosticError> {
    let entries = fs::read_dir(path).map_err(|source| NativeDiagnosticError::Io {
        operation: "enumerate native diagnostic events",
        path: path.to_owned(),
        source,
    })?;
    let mut bounded = Vec::new();
    for entry in entries {
        if bounded.len() > HARD_MAX_EVENTS {
            return Err(NativeDiagnosticError::StoreLimitExceeded);
        }
        bounded.push(entry.map_err(|source| NativeDiagnosticError::Io {
            operation: "read native diagnostic event entry",
            path: path.to_owned(),
            source,
        })?);
    }
    Ok(bounded)
}

fn event_path(directory: &Path, ordinal: u64) -> PathBuf {
    directory.join(format!("{ordinal:020}{EVENT_SUFFIX}"))
}

fn incoming_path(directory: &Path, ordinal: u64) -> PathBuf {
    directory.join(format!("{INCOMING_PREFIX}{ordinal:020}"))
}

fn parse_event_name(name: &str) -> Result<u64, NativeDiagnosticError> {
    let digits = name
        .strip_suffix(EVENT_SUFFIX)
        .ok_or_else(|| invalid_store("native diagnostic event name has an invalid suffix"))?;
    parse_ordinal(digits)
}

fn parse_incoming_name(name: &str) -> Result<u64, NativeDiagnosticError> {
    let digits = name
        .strip_prefix(INCOMING_PREFIX)
        .ok_or_else(|| invalid_store("incoming native diagnostic event name is invalid"))?;
    parse_ordinal(digits)
}

fn parse_ordinal(digits: &str) -> Result<u64, NativeDiagnosticError> {
    if digits.len() != 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_store(
            "native diagnostic event ordinal is not canonical",
        ));
    }
    let ordinal = digits
        .parse::<u64>()
        .map_err(|_| invalid_store("native diagnostic event ordinal is invalid"))?;
    if ordinal == 0 {
        return Err(invalid_store(
            "native diagnostic event ordinal must be nonzero",
        ));
    }
    Ok(ordinal)
}

fn path_exists(path: &Path) -> Result<bool, NativeDiagnosticError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(NativeDiagnosticError::Io {
            operation: "inspect native diagnostics path",
            path: path.to_owned(),
            source,
        }),
    }
}

fn require_directory(path: &Path, kind: &'static str) -> Result<(), NativeDiagnosticError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| NativeDiagnosticError::Io {
        operation: "inspect native diagnostics directory",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(NativeDiagnosticError::InvalidLayout {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), NativeDiagnosticError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| NativeDiagnosticError::Io {
        operation: "inspect native diagnostics file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(NativeDiagnosticError::InvalidLayout {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), NativeDiagnosticError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| NativeDiagnosticError::Io {
            operation: "synchronize native diagnostics directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(
    clippy::unnecessary_wraps,
    reason = "Windows does not expose the Unix directory synchronization primitive"
)]
fn sync_directory(_path: &Path) -> Result<(), NativeDiagnosticError> {
    Ok(())
}

fn invalid_store(message: &str) -> NativeDiagnosticError {
    NativeDiagnosticError::InvalidStore(message.to_owned())
}

/// Native diagnostic store failure. Callers must not turn this into a launch,
/// recovery, update, or save availability dependency.
#[derive(Debug)]
pub enum NativeDiagnosticError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    Random(getrandom::Error),
    InvalidConfiguration(String),
    UnsafePath(PathBuf),
    InvalidLayout {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidStore(String),
    StoreLimitExceeded,
    EventTooLarge,
    EventExceedsRetentionBudget,
    Busy,
    ForeignProducerLease,
    ProducerCodeMismatch,
    TimeReversal,
    BootEpochRollback,
}

impl fmt::Display for NativeDiagnosticError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} at {}: {source}", path.display()),
            Self::Random(source) => write!(formatter, "generate diagnostic store nonce: {source}"),
            Self::InvalidConfiguration(message) | Self::InvalidStore(message) => {
                formatter.write_str(message)
            }
            Self::UnsafePath(path) => {
                write!(
                    formatter,
                    "unsafe native diagnostics path {}",
                    path.display()
                )
            }
            Self::InvalidLayout { kind, path } => {
                write!(formatter, "{kind} has an unsafe type at {}", path.display())
            }
            Self::StoreLimitExceeded => {
                formatter.write_str("native diagnostic store exceeds its hard event bound")
            }
            Self::EventTooLarge => {
                formatter.write_str("native diagnostic event exceeds its fixed byte bound")
            }
            Self::EventExceedsRetentionBudget => {
                formatter.write_str("native diagnostic event exceeds the selected byte budget")
            }
            Self::Busy => formatter.write_str("native diagnostic store is already open"),
            Self::ForeignProducerLease => {
                formatter.write_str("diagnostic producer lease belongs to another store")
            }
            Self::ProducerCodeMismatch => {
                formatter.write_str("diagnostic code is not allowed for this producer")
            }
            Self::TimeReversal => {
                formatter.write_str("diagnostic producer uptime cannot move backward")
            }
            Self::BootEpochRollback => {
                formatter.write_str("diagnostic boot epoch cannot move backward")
            }
        }
    }
}

impl std::error::Error for NativeDiagnosticError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Random(source) => Some(source),
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
                root: std::env::temp_dir().join(format!(
                    "vcg-native-diagnostics-{}-{unique}",
                    std::process::id()
                )),
            }
        }

        fn config(&self) -> NativeDiagnosticStoreConfig {
            NativeDiagnosticStoreConfig {
                store_root: self.root.clone(),
                maximum_events: 8,
                maximum_bytes: 4_096,
                maximum_boot_epochs: 2,
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn closed_code_derives_source_subsystem_and_severity() {
        let fixture = Fixture::new();
        let mut store = NativeDiagnosticStore::open(fixture.config(), 7).expect("open");
        let producer = store.authorize_producer(DiagnosticProducer::PowerCoordinator);
        let event = store
            .record(&producer, NativeDiagnosticCode::PowerTransitionFailed, 12)
            .expect("record");
        assert_eq!(event.ordinal(), 1);
        assert_eq!(event.boot_epoch(), 7);
        assert_eq!(event.uptime_ms(), 12);
        assert_eq!(event.producer(), DiagnosticProducer::PowerCoordinator);
        assert_eq!(event.subsystem(), DiagnosticSubsystem::Power);
        assert_eq!(event.severity(), DiagnosticSeverity::Warning);
        assert_eq!(event.code(), NativeDiagnosticCode::PowerTransitionFailed);
    }

    #[test]
    fn store_and_producer_capabilities_are_exact() {
        let first_fixture = Fixture::new();
        let second_fixture = Fixture::new();
        let first = NativeDiagnosticStore::open(first_fixture.config(), 1).expect("first");
        let foreign = first.authorize_producer(DiagnosticProducer::Launcher);
        let mut second = NativeDiagnosticStore::open(second_fixture.config(), 1).expect("second");
        assert!(matches!(
            second.record(&foreign, NativeDiagnosticCode::LauncherReady, 1),
            Err(NativeDiagnosticError::ForeignProducerLease)
        ));
        let packages = second.authorize_producer(DiagnosticProducer::PackageManager);
        assert!(matches!(
            second.record(&packages, NativeDiagnosticCode::LauncherReady, 1),
            Err(NativeDiagnosticError::ProducerCodeMismatch)
        ));
    }

    #[test]
    fn producer_uptime_is_monotonic_within_one_boot() {
        let fixture = Fixture::new();
        let mut store = NativeDiagnosticStore::open(fixture.config(), 1).expect("open");
        let producer = store.authorize_producer(DiagnosticProducer::Launcher);
        store
            .record(&producer, NativeDiagnosticCode::LauncherReady, 9)
            .expect("first");
        assert!(matches!(
            store.record(&producer, NativeDiagnosticCode::LaunchStarted, 8),
            Err(NativeDiagnosticError::TimeReversal)
        ));
        store
            .record(&producer, NativeDiagnosticCode::LaunchStarted, 9)
            .expect("equal time is valid");
    }

    #[test]
    fn committed_events_reopen_and_continue() {
        let fixture = Fixture::new();
        {
            let mut store = NativeDiagnosticStore::open(fixture.config(), 3).expect("open");
            let producer = store.authorize_producer(DiagnosticProducer::Launcher);
            store
                .record(&producer, NativeDiagnosticCode::LauncherReady, 5)
                .expect("record");
        }
        let mut reopened = NativeDiagnosticStore::open(fixture.config(), 3).expect("reopen");
        let producer = reopened.authorize_producer(DiagnosticProducer::Launcher);
        let event = reopened
            .record(&producer, NativeDiagnosticCode::LaunchStarted, 6)
            .expect("continue");
        assert_eq!(event.ordinal(), 2);
        assert_eq!(reopened.snapshot().events().len(), 2);
    }

    #[test]
    fn incomplete_incoming_event_is_removed_on_reopen() {
        let fixture = Fixture::new();
        {
            let _store = NativeDiagnosticStore::open(fixture.config(), 1).expect("open");
        }
        let incoming = fixture
            .root
            .join(EVENTS_DIRECTORY)
            .join(".incoming-00000000000000000001");
        fs::write(&incoming, b"partial").expect("partial event");
        let store = NativeDiagnosticStore::open(fixture.config(), 1).expect("recover");
        assert!(store.snapshot().events().is_empty());
        assert!(!incoming.exists());
    }

    #[test]
    fn event_and_boot_bounds_evict_oldest_complete_records() {
        let fixture = Fixture::new();
        let mut config = fixture.config();
        config.maximum_events = 3;
        config.maximum_boot_epochs = 2;
        for boot_epoch in 1..=3 {
            let mut store =
                NativeDiagnosticStore::open(config.clone(), boot_epoch).expect("open boot");
            let producer = store.authorize_producer(DiagnosticProducer::Launcher);
            store
                .record(&producer, NativeDiagnosticCode::LauncherReady, 1)
                .expect("ready");
            store
                .record(&producer, NativeDiagnosticCode::LaunchStarted, 2)
                .expect("started");
        }
        let store = NativeDiagnosticStore::open(config, 3).expect("final reopen");
        let snapshot = store.snapshot();
        assert_eq!(snapshot.events().len(), 3);
        assert_eq!(snapshot.evicted_events(), 3);
        assert!(
            snapshot
                .events()
                .iter()
                .all(|event| event.boot_epoch() >= 2)
        );
    }

    #[test]
    fn byte_bound_is_enforced_oldest_first() {
        let fixture = Fixture::new();
        let mut config = fixture.config();
        config.maximum_bytes = MIN_BYTE_BUDGET;
        let mut store = NativeDiagnosticStore::open(config, 1).expect("open");
        let producer = store.authorize_producer(DiagnosticProducer::Launcher);
        for uptime in 0..8 {
            store
                .record(&producer, NativeDiagnosticCode::LaunchStarted, uptime)
                .expect("record");
        }
        let snapshot = store.snapshot();
        assert!(snapshot.retained_bytes() <= MIN_BYTE_BUDGET);
        assert!(snapshot.evicted_events() > 0);
        assert!(!snapshot.events().is_empty());
    }

    #[test]
    fn snapshot_is_path_free_and_reports_fixed_privacy_exclusions() {
        let fixture = Fixture::new();
        let mut store = NativeDiagnosticStore::open(fixture.config(), 1).expect("open");
        let producer = store.authorize_producer(DiagnosticProducer::PackageManager);
        store
            .record(
                &producer,
                NativeDiagnosticCode::PackageInventoryUnavailable,
                4,
            )
            .expect("record");
        let snapshot = store.snapshot();
        assert!(!snapshot.contains_raw_frames());
        assert!(!snapshot.contains_skeletons());
        assert!(!snapshot.contains_profiles());
        assert!(!snapshot.contains_personal_identifiers());
        assert!(!snapshot.contains_credentials());
        assert!(!snapshot.contains_free_text());
        assert_eq!(snapshot.retained_warning_events(), 1);
        assert_eq!(snapshot.subsystem_count(DiagnosticSubsystem::Packages), 1);
        let bytes = fs::read(
            fs::read_dir(fixture.root.join(EVENTS_DIRECTORY))
                .expect("event directory")
                .next()
                .expect("event")
                .expect("entry")
                .path(),
        )
        .expect("event bytes");
        let text = String::from_utf8(bytes).expect("UTF-8");
        for prohibited in [
            "profileId",
            "gameId",
            "path",
            "message",
            "token",
            "credential",
            "frame",
            "skeleton",
            "wallClock",
        ] {
            assert!(!text.contains(prohibited), "{prohibited} entered event");
        }
    }

    #[test]
    fn tampering_and_boot_epoch_rollback_fail_closed() {
        let fixture = Fixture::new();
        {
            let mut store = NativeDiagnosticStore::open(fixture.config(), 7).expect("open");
            let producer = store.authorize_producer(DiagnosticProducer::Launcher);
            store
                .record(&producer, NativeDiagnosticCode::LauncherReady, 1)
                .expect("record");
        }
        assert!(matches!(
            NativeDiagnosticStore::open(fixture.config(), 6),
            Err(NativeDiagnosticError::BootEpochRollback)
        ));
        let path = event_path(&fixture.root.join(EVENTS_DIRECTORY), 1);
        let changed = fs::read_to_string(&path)
            .expect("event")
            .replace("\"severity\":\"info\"", "\"severity\":\"warning\"");
        fs::write(path, changed).expect("tamper");
        assert!(matches!(
            NativeDiagnosticStore::open(fixture.config(), 7),
            Err(NativeDiagnosticError::InvalidStore(_))
        ));
    }

    #[test]
    fn reopen_detects_time_reversal_across_interleaved_producers() {
        let fixture = Fixture::new();
        {
            let mut store = NativeDiagnosticStore::open(fixture.config(), 1).expect("open");
            let launcher = store.authorize_producer(DiagnosticProducer::Launcher);
            let power = store.authorize_producer(DiagnosticProducer::PowerCoordinator);
            store
                .record(&launcher, NativeDiagnosticCode::LauncherReady, 10)
                .expect("launcher first");
            store
                .record(&power, NativeDiagnosticCode::PowerIdleStarted, 5)
                .expect("power");
            store
                .record(&launcher, NativeDiagnosticCode::LaunchStarted, 11)
                .expect("launcher second");
        }
        let path = event_path(&fixture.root.join(EVENTS_DIRECTORY), 3);
        let changed = fs::read_to_string(&path)
            .expect("event")
            .replace("\"uptimeMs\":11", "\"uptimeMs\":9");
        fs::write(path, changed).expect("tamper");
        assert!(matches!(
            NativeDiagnosticStore::open(fixture.config(), 1),
            Err(NativeDiagnosticError::InvalidStore(_))
        ));
    }

    #[test]
    fn invalid_policy_paths_layout_and_lock_contention_are_rejected() {
        let fixture = Fixture::new();
        let mut invalid = fixture.config();
        invalid.maximum_events = 0;
        assert!(matches!(
            NativeDiagnosticStore::open(invalid, 1),
            Err(NativeDiagnosticError::InvalidConfiguration(_))
        ));
        let mut relative = fixture.config();
        relative.store_root = PathBuf::from("relative");
        assert!(matches!(
            NativeDiagnosticStore::open(relative, 1),
            Err(NativeDiagnosticError::UnsafePath(_))
        ));
        let store = NativeDiagnosticStore::open(fixture.config(), 1).expect("open");
        assert!(matches!(
            NativeDiagnosticStore::open(fixture.config(), 1),
            Err(NativeDiagnosticError::Busy)
        ));
        drop(store);
        fs::write(fixture.root.join("unexpected"), b"no").expect("unexpected");
        assert!(matches!(
            NativeDiagnosticStore::open(fixture.config(), 1),
            Err(NativeDiagnosticError::InvalidStore(_))
        ));
    }
}
