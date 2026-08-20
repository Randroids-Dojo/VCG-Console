//! Crash-safe, bounded replay state for authenticated native launch intents.
//!
//! The journal is written at [`JOURNAL_SCHEMA_VERSION`]. Version 2, the only
//! prior version, is migrated by discarding its records behind the
//! restart-cleanup barrier; see [`migrate_pre_current_schema`]. Every other
//! version fails closed.

use std::collections::HashSet;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};

use crate::installed_catalog::validate_intent_id;
use crate::retro_import::is_library_entry_id;

const JOURNAL_SCHEMA_VERSION: u32 = 3;
/// The one prior journal schema this host migrates from.
const MIGRATED_JOURNAL_SCHEMA_VERSION: u32 = 2;
const MAX_EVENT_BYTES: u64 = 2_048;
const MAX_EVENTS_PER_RECORD: usize = 128;
const REQUEST_ID_BYTES: usize = 16;
const CLEANUP_REQUIRED_FILE: &str = "cleanup-required";
const SCHEMA_MIGRATION_FILE: &str = "schema-migration";

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DurableLaunchRecord {
    pub schema_version: u32,
    pub accepted_ordinal: u64,
    pub request_id: String,
    pub game_id: String,
    pub profile_id: String,
    /// The installed library entry this launch binds, when it binds one.
    ///
    /// Absent for every launch that names no library content, which is what
    /// keeps a record written before library content valid and unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_id: Option<String>,
    pub catalog_generation: u64,
    pub sequence: u64,
    pub state: String,
    pub detail_code: String,
    pub exit_code: Option<i32>,
}

impl DurableLaunchRecord {
    #[allow(
        clippy::too_many_arguments,
        reason = "the durable event explicitly binds every launch lifecycle field"
    )]
    pub(crate) fn new(
        accepted_ordinal: u64,
        request_id: &str,
        game_id: &str,
        profile_id: &str,
        entry_id: Option<&str>,
        catalog_generation: u64,
        sequence: u64,
        state: &str,
        detail_code: &str,
        exit_code: Option<i32>,
    ) -> Self {
        Self {
            schema_version: JOURNAL_SCHEMA_VERSION,
            accepted_ordinal,
            request_id: request_id.to_owned(),
            game_id: game_id.to_owned(),
            profile_id: profile_id.to_owned(),
            entry_id: entry_id.map(str::to_owned),
            catalog_generation,
            sequence,
            state: state.to_owned(),
            detail_code: detail_code.to_owned(),
            exit_code,
        }
    }

    fn validate(&self) -> Result<(), LaunchReplayError> {
        if self.schema_version != JOURNAL_SCHEMA_VERSION {
            return Err(LaunchReplayError::InvalidState(format!(
                "unsupported native launch replay schema {}",
                self.schema_version
            )));
        }
        if self.accepted_ordinal == 0 || self.catalog_generation == 0 || self.sequence == 0 {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay ordinals, catalog generations, and sequences must be nonzero"
                    .to_owned(),
            ));
        }
        validate_request_id(&self.request_id)?;
        validate_intent_id("game", &self.game_id).map_err(|_| {
            LaunchReplayError::InvalidState(
                "native launch replay contains an invalid game ID".to_owned(),
            )
        })?;
        validate_intent_id("profile", &self.profile_id).map_err(|_| {
            LaunchReplayError::InvalidState(
                "native launch replay contains an invalid profile ID".to_owned(),
            )
        })?;
        if let Some(entry_id) = &self.entry_id
            && !is_library_entry_id(entry_id)
        {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay contains an invalid library entry ID".to_owned(),
            ));
        }
        if !matches!(
            self.state.as_str(),
            "preparing" | "running" | "stopping" | "completed" | "failed" | "cancelled"
        ) {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay contains an invalid lifecycle state".to_owned(),
            ));
        }
        if self.detail_code.is_empty()
            || self.detail_code.len() > 64
            || !self
                .detail_code
                .bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte == b'_' || byte.is_ascii_digit())
        {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay contains an invalid detail code".to_owned(),
            ));
        }
        if !detail_matches_state(&self.state, &self.detail_code) {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay detail does not match lifecycle state".to_owned(),
            ));
        }
        if self.exit_code.is_some() && !matches!(self.state.as_str(), "completed" | "failed") {
            return Err(LaunchReplayError::InvalidState(
                "only terminal native launch replay states may contain an exit code".to_owned(),
            ));
        }
        Ok(())
    }

    pub(crate) fn active(&self) -> bool {
        matches!(self.state.as_str(), "preparing" | "running" | "stopping")
    }
}

/// One exclusive durable replay journal.
#[derive(Debug)]
pub(crate) struct LaunchReplayJournal {
    root: PathBuf,
    active: PathBuf,
    retired: PathBuf,
    next_ordinal: u64,
    lock: File,
}

impl Drop for LaunchReplayJournal {
    fn drop(&mut self) {
        let _ = fs4::FileExt::unlock(&self.lock);
    }
}

impl LaunchReplayJournal {
    pub(crate) fn open(
        journal_root: &Path,
        max_records: usize,
    ) -> Result<(Self, Vec<DurableLaunchRecord>, bool), LaunchReplayError> {
        if max_records == 0 {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay record bound must be nonzero".to_owned(),
            ));
        }
        let root = prepare_root(journal_root)?;
        let active = prepare_child_directory(&root, "active")?;
        let retired = prepare_child_directory(&root, "retired")?;
        let lock_path = root.join("journal.lock");
        let lock = open_lock(&lock_path)?;
        match fs4::FileExt::try_lock(&lock) {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(LaunchReplayError::Busy),
            Err(TryLockError::Error(source)) => {
                return Err(LaunchReplayError::Io {
                    operation: "lock native launch replay journal",
                    path: lock_path,
                    source,
                });
            }
        }

        clean_retired(&retired, max_records)?;
        migrate_pre_current_schema(&root, &active, max_records)?;
        let mut records = load_active(&active, max_records)?;
        records.sort_by_key(|record| record.accepted_ordinal);
        let mut ordinals = HashSet::new();
        let mut request_ids = HashSet::new();
        for record in &records {
            if !ordinals.insert(record.accepted_ordinal) {
                return Err(LaunchReplayError::InvalidState(
                    "native launch replay contains duplicate accepted ordinals".to_owned(),
                ));
            }
            if !request_ids.insert(record.request_id.clone()) {
                return Err(LaunchReplayError::InvalidState(
                    "native launch replay contains duplicate request IDs".to_owned(),
                ));
            }
        }
        let next_ordinal = records.last().map_or(Ok(1), |record| {
            record.accepted_ordinal.checked_add(1).ok_or_else(|| {
                LaunchReplayError::InvalidState(
                    "native launch replay ordinal overflowed".to_owned(),
                )
            })
        })?;
        let mut journal = Self {
            root,
            active,
            retired,
            next_ordinal,
            lock,
        };
        let recovered_nonterminal = records.iter().any(DurableLaunchRecord::active);
        let cleanup_required = journal.cleanup_required()? || recovered_nonterminal;
        if recovered_nonterminal {
            ensure_cleanup_required(&journal.root)?;
        }
        for record in &mut records {
            if record.active() {
                record.sequence = record.sequence.checked_add(1).ok_or_else(|| {
                    LaunchReplayError::InvalidState(
                        "native launch replay sequence overflowed".to_owned(),
                    )
                })?;
                "failed".clone_into(&mut record.state);
                "HOST_RESTARTED_INDETERMINATE".clone_into(&mut record.detail_code);
                record.exit_code = None;
                journal.append(record)?;
            }
        }
        Ok((journal, records, cleanup_required))
    }

    pub(crate) fn next_ordinal(&self) -> u64 {
        self.next_ordinal
    }

    pub(crate) fn accept(&mut self, record: &DurableLaunchRecord) -> Result<(), LaunchReplayError> {
        if record.accepted_ordinal != self.next_ordinal
            || record.sequence != 1
            || record.state != "preparing"
            || record.detail_code != "PACKAGE_RESOLVING"
            || record.exit_code.is_some()
        {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay acceptance is out of order".to_owned(),
            ));
        }
        record.validate()?;
        let directory = self.record_directory(record);
        fs::create_dir(&directory).map_err(|source| LaunchReplayError::Io {
            operation: "create native launch replay record",
            path: directory.clone(),
            source,
        })?;
        sync_directory(&self.active)?;
        write_event(&directory, record)?;
        self.next_ordinal = self.next_ordinal.checked_add(1).ok_or_else(|| {
            LaunchReplayError::InvalidState("native launch replay ordinal overflowed".to_owned())
        })?;
        Ok(())
    }

    pub(crate) fn append(&mut self, record: &DurableLaunchRecord) -> Result<(), LaunchReplayError> {
        record.validate()?;
        if record.sequence > u64::try_from(MAX_EVENTS_PER_RECORD).unwrap_or(u64::MAX) {
            return Err(LaunchReplayError::RecordEventLimit {
                request_id: record.request_id.clone(),
            });
        }
        let directory = self.record_directory(record);
        require_directory(&directory, "native launch replay record")?;
        let prior_sequence = record.sequence.checked_sub(1).ok_or_else(|| {
            LaunchReplayError::InvalidState(
                "native launch replay append has no prior sequence".to_owned(),
            )
        })?;
        if prior_sequence == 0 {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay append has no accepted event".to_owned(),
            ));
        }
        let prior_path = event_path(&directory, prior_sequence);
        if !path_exists(&prior_path)? {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay append is not contiguous".to_owned(),
            ));
        }
        require_regular_file(&prior_path, "native launch replay prior event")?;
        let prior = read_event(&prior_path)?;
        if prior.accepted_ordinal != record.accepted_ordinal
            || prior.request_id != record.request_id
            || prior.game_id != record.game_id
            || prior.profile_id != record.profile_id
            || prior.entry_id != record.entry_id
            || prior.catalog_generation != record.catalog_generation
            || prior.sequence != prior_sequence
            || !valid_state_transition(&prior.state, &record.state)
        {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay append conflicts with prior state".to_owned(),
            ));
        }
        write_event(&directory, record)
    }

    pub(crate) fn retire(
        &mut self,
        accepted_ordinal: u64,
        request_id: &str,
    ) -> Result<(), LaunchReplayError> {
        let name = record_directory_name(accepted_ordinal, request_id);
        let active = self.active.join(&name);
        let retired = self.retired.join(&name);
        require_directory(&active, "native launch replay record")?;
        if path_exists(&retired)? {
            return Err(LaunchReplayError::InvalidState(
                "native launch replay retirement target already exists".to_owned(),
            ));
        }
        fs::rename(&active, &retired).map_err(|source| LaunchReplayError::Io {
            operation: "retire native launch replay record",
            path: active,
            source,
        })?;
        sync_directory(&self.active)?;
        sync_directory(&self.retired)?;
        fs::remove_dir_all(&retired).map_err(|source| LaunchReplayError::Io {
            operation: "remove retired native launch replay record",
            path: retired.clone(),
            source,
        })?;
        sync_directory(&self.retired)
    }

    pub(crate) fn clear_cleanup_required(&mut self) -> Result<(), LaunchReplayError> {
        let path = self.root.join(CLEANUP_REQUIRED_FILE);
        if !path_exists(&path)? {
            return Ok(());
        }
        require_regular_file(&path, "native launch replay cleanup barrier")?;
        fs::remove_file(&path).map_err(|source| LaunchReplayError::Io {
            operation: "clear native launch replay cleanup barrier",
            path,
            source,
        })?;
        sync_directory(&self.root)
    }

    fn cleanup_required(&self) -> Result<bool, LaunchReplayError> {
        let path = self.root.join(CLEANUP_REQUIRED_FILE);
        if !path_exists(&path)? {
            return Ok(false);
        }
        require_regular_file(&path, "native launch replay cleanup barrier")?;
        Ok(true)
    }

    fn record_directory(&self, record: &DurableLaunchRecord) -> PathBuf {
        self.active.join(record_directory_name(
            record.accepted_ordinal,
            &record.request_id,
        ))
    }
}

fn prepare_root(path: &Path) -> Result<PathBuf, LaunchReplayError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(LaunchReplayError::UnsafePath {
            kind: "native launch replay root",
            path: path.to_owned(),
        });
    }
    if !path_exists(path)? {
        fs::create_dir_all(path).map_err(|source| LaunchReplayError::Io {
            operation: "create native launch replay root",
            path: path.to_owned(),
            source,
        })?;
    }
    require_directory(path, "native launch replay root")?;
    fs::canonicalize(path).map_err(|source| LaunchReplayError::Io {
        operation: "resolve native launch replay root",
        path: path.to_owned(),
        source,
    })
}

fn prepare_child_directory(root: &Path, name: &str) -> Result<PathBuf, LaunchReplayError> {
    let path = root.join(name);
    if !path_exists(&path)? {
        fs::create_dir(&path).map_err(|source| LaunchReplayError::Io {
            operation: "create native launch replay directory",
            path: path.clone(),
            source,
        })?;
        sync_directory(root)?;
    }
    require_directory(&path, "native launch replay directory")?;
    Ok(path)
}

fn clean_retired(retired: &Path, max_records: usize) -> Result<(), LaunchReplayError> {
    let entries = read_directory_bounded(
        retired,
        max_records
            .checked_add(1)
            .ok_or_else(|| invalid_entry("native launch replay bound overflowed"))?,
    )?;
    if entries.len() > max_records {
        return Err(LaunchReplayError::RecordLimit);
    }
    for entry in entries {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_entry("retired native launch replay name is not UTF-8"))?;
        parse_record_directory_name(&name)?;
        require_directory(&entry.path(), "retired native launch replay record")?;
        fs::remove_dir_all(entry.path()).map_err(|source| LaunchReplayError::Io {
            operation: "remove interrupted retired native launch replay record",
            path: entry.path(),
            source,
        })?;
    }
    sync_directory(retired)
}

fn ensure_cleanup_required(root: &Path) -> Result<(), LaunchReplayError> {
    let path = root.join(CLEANUP_REQUIRED_FILE);
    if path_exists(&path)? {
        require_regular_file(&path, "native launch replay cleanup barrier")?;
        return Ok(());
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .and_then(|file| file.sync_all())
        .map_err(|source| LaunchReplayError::Io {
            operation: "persist native launch replay cleanup barrier",
            path,
            source,
        })?;
    sync_directory(root)
}

/// The schema version of one on-disk event, read without trusting any other
/// field in it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JournalEventSchema {
    schema_version: u32,
}

/// The durable reason a pre-migration journal was discarded.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JournalSchemaMigration {
    schema_version: u32,
    migrated_from_schema_version: u32,
    discarded_records: usize,
}

/// Migrates a journal written at [`MIGRATED_JOURNAL_SCHEMA_VERSION`] by
/// discarding its records.
///
/// A version-2 record is never read forward, so no journal is silently treated
/// as if it were the current version. What a discarded record carried was one
/// request ID's at-most-once binding; losing it means an interrupted launch can
/// be requested again once, which is the accepted cost of the version bump.
/// What it must not lose is that the launch may still own a live process, so
/// the migration sets the restart-cleanup barrier before it removes anything:
/// no fresh launch is admitted until a privileged adapter proves the prior
/// process scope empty.
///
/// Any other version, and any journal mixing versions, is left untouched and
/// fails closed when its records load.
fn migrate_pre_current_schema(
    root: &Path,
    active: &Path,
    max_records: usize,
) -> Result<(), LaunchReplayError> {
    let Some(directories) = pre_current_schema_records(active, max_records)? else {
        return Ok(());
    };
    record_schema_migration(root, directories.len())?;
    ensure_cleanup_required(root)?;
    for directory in directories {
        fs::remove_dir_all(&directory).map_err(|source| LaunchReplayError::Io {
            operation: "discard pre-migration native launch replay record",
            path: directory,
            source,
        })?;
    }
    sync_directory(active)
}

/// Returns the active record directories only when every event under all of
/// them is at [`MIGRATED_JOURNAL_SCHEMA_VERSION`].
///
/// Anything this cannot read, bound, or version conclusively returns `None` so
/// the ordinary load path decides it and every existing rejection is preserved.
fn pre_current_schema_records(
    active: &Path,
    max_records: usize,
) -> Result<Option<Vec<PathBuf>>, LaunchReplayError> {
    let Some(bound) = max_records.checked_add(1) else {
        return Ok(None);
    };
    let entries = read_directory_bounded(active, bound)?;
    if entries.is_empty() || entries.len() > max_records {
        return Ok(None);
    }
    let mut directories = Vec::with_capacity(entries.len());
    let mut migrated_events = 0_usize;
    for entry in entries {
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            return Ok(None);
        }
        let directory = entry.path();
        let Ok(events) = read_directory_bounded(&directory, MAX_EVENTS_PER_RECORD + 1) else {
            return Ok(None);
        };
        if events.len() > MAX_EVENTS_PER_RECORD {
            return Ok(None);
        }
        for event in events {
            if event_schema_version(&event.path()) != Some(MIGRATED_JOURNAL_SCHEMA_VERSION) {
                return Ok(None);
            }
            migrated_events += 1;
        }
        directories.push(directory);
    }
    if migrated_events == 0 {
        return Ok(None);
    }
    Ok(Some(directories))
}

fn event_schema_version(path: &Path) -> Option<u32> {
    if !fs::symlink_metadata(path).ok()?.file_type().is_file() {
        return None;
    }
    let file = File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_EVENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_EVENT_BYTES {
        return None;
    }
    let event: JournalEventSchema = serde_json::from_slice(&bytes).ok()?;
    Some(event.schema_version)
}

fn record_schema_migration(root: &Path, discarded_records: usize) -> Result<(), LaunchReplayError> {
    let path = root.join(SCHEMA_MIGRATION_FILE);
    if path_exists(&path)? {
        require_regular_file(&path, "native launch replay schema migration record")?;
    }
    let bytes = serde_json::to_vec(&JournalSchemaMigration {
        schema_version: JOURNAL_SCHEMA_VERSION,
        migrated_from_schema_version: MIGRATED_JOURNAL_SCHEMA_VERSION,
        discarded_records,
    })
    .map_err(|error| LaunchReplayError::InvalidState(error.to_string()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|source| LaunchReplayError::Io {
            operation: "create native launch replay schema migration record",
            path: path.clone(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| LaunchReplayError::Io {
            operation: "persist native launch replay schema migration record",
            path,
            source,
        })?;
    sync_directory(root)
}

fn load_active(
    active: &Path,
    max_records: usize,
) -> Result<Vec<DurableLaunchRecord>, LaunchReplayError> {
    let entries = read_directory_bounded(
        active,
        max_records
            .checked_add(1)
            .ok_or_else(|| invalid_entry("native launch replay bound overflowed"))?,
    )?;
    if entries.len() > max_records {
        return Err(LaunchReplayError::RecordLimit);
    }
    let mut records = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_entry("native launch replay record name is not UTF-8"))?;
        let (accepted_ordinal, request_id) = parse_record_directory_name(&name)?;
        let directory = entry.path();
        require_directory(&directory, "native launch replay record")?;
        let events = read_directory_bounded(&directory, MAX_EVENTS_PER_RECORD + 1)?;
        if events.is_empty() {
            fs::remove_dir(&directory).map_err(|source| LaunchReplayError::Io {
                operation: "remove empty native launch replay record",
                path: directory,
                source,
            })?;
            sync_directory(active)?;
            continue;
        }
        if events.len() > MAX_EVENTS_PER_RECORD {
            return Err(LaunchReplayError::RecordEventLimit {
                request_id: request_id.clone(),
            });
        }
        let mut ordered = Vec::with_capacity(events.len());
        for event in events {
            let file_name = event
                .file_name()
                .into_string()
                .map_err(|_| invalid_entry("native launch replay event name is not UTF-8"))?;
            let sequence = parse_event_name(&file_name)?;
            require_regular_file(&event.path(), "native launch replay event")?;
            ordered.push((sequence, event.path()));
        }
        ordered.sort_by_key(|(sequence, _)| *sequence);
        let mut latest: Option<DurableLaunchRecord> = None;
        for (index, (sequence, path)) in ordered.into_iter().enumerate() {
            let expected = u64::try_from(index).unwrap_or(u64::MAX) + 1;
            if sequence != expected {
                return Err(invalid_entry(
                    "native launch replay event sequence is not contiguous",
                ));
            }
            let record = read_event(&path)?;
            if record.accepted_ordinal != accepted_ordinal
                || record.request_id != request_id
                || record.sequence != sequence
            {
                return Err(invalid_entry(
                    "native launch replay event does not match its path",
                ));
            }
            if let Some(previous) = &latest {
                if record.game_id != previous.game_id
                    || record.profile_id != previous.profile_id
                    || record.entry_id != previous.entry_id
                    || record.catalog_generation != previous.catalog_generation
                    || record.accepted_ordinal != previous.accepted_ordinal
                    || record.request_id != previous.request_id
                {
                    return Err(invalid_entry("native launch replay intent binding changed"));
                }
                if !valid_state_transition(&previous.state, &record.state) {
                    return Err(invalid_entry(
                        "native launch replay lifecycle transition is invalid",
                    ));
                }
            } else if record.state != "preparing"
                || record.detail_code != "PACKAGE_RESOLVING"
                || record.exit_code.is_some()
            {
                return Err(invalid_entry(
                    "native launch replay first event is not canonical acceptance",
                ));
            }
            latest = Some(record);
        }
        records.push(latest.expect("nonempty event set has a latest record"));
    }
    Ok(records)
}

fn write_event(directory: &Path, record: &DurableLaunchRecord) -> Result<(), LaunchReplayError> {
    let bytes = serde_json::to_vec(record)
        .map_err(|error| LaunchReplayError::InvalidState(error.to_string()))?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_EVENT_BYTES {
        return Err(invalid_entry("native launch replay event is oversized"));
    }
    let path = event_path(directory, record.sequence);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|source| LaunchReplayError::Io {
            operation: "create native launch replay event",
            path: path.clone(),
            source,
        })?;
    file.write_all(&bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| LaunchReplayError::Io {
            operation: "persist native launch replay event",
            path,
            source,
        })?;
    sync_directory(directory)
}

fn read_event(path: &Path) -> Result<DurableLaunchRecord, LaunchReplayError> {
    let file = File::open(path).map_err(|source| LaunchReplayError::Io {
        operation: "open native launch replay event",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_EVENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| LaunchReplayError::Io {
            operation: "read native launch replay event",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_EVENT_BYTES {
        return Err(invalid_entry("native launch replay event is oversized"));
    }
    let record: DurableLaunchRecord = serde_json::from_slice(&bytes)
        .map_err(|error| LaunchReplayError::InvalidState(error.to_string()))?;
    record.validate()?;
    Ok(record)
}

fn open_lock(path: &Path) -> Result<File, LaunchReplayError> {
    if path_exists(path)? {
        require_regular_file(path, "native launch replay lock")?;
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|source| LaunchReplayError::Io {
            operation: "open native launch replay lock",
            path: path.to_owned(),
            source,
        })?;
    if file.metadata().is_ok_and(|metadata| metadata.is_file()) {
        Ok(file)
    } else {
        Err(LaunchReplayError::UnsafePath {
            kind: "native launch replay lock",
            path: path.to_owned(),
        })
    }
}

fn read_directory_bounded(
    path: &Path,
    limit: usize,
) -> Result<Vec<fs::DirEntry>, LaunchReplayError> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|source| LaunchReplayError::Io {
        operation: "read native launch replay directory",
        path: path.to_owned(),
        source,
    })? {
        entries.push(entry.map_err(|source| LaunchReplayError::Io {
            operation: "read native launch replay entry",
            path: path.to_owned(),
            source,
        })?);
        if entries.len() > limit {
            break;
        }
    }
    Ok(entries)
}

fn record_directory_name(accepted_ordinal: u64, request_id: &str) -> String {
    format!("{accepted_ordinal:020}-{request_id}")
}

fn parse_record_directory_name(name: &str) -> Result<(u64, String), LaunchReplayError> {
    let Some((ordinal, request_id)) = name.split_once('-') else {
        return Err(invalid_entry(
            "native launch replay record name is malformed",
        ));
    };
    if ordinal.len() != 20 || !ordinal.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_entry(
            "native launch replay ordinal is not canonical",
        ));
    }
    let ordinal = ordinal
        .parse::<u64>()
        .map_err(|_| invalid_entry("native launch replay ordinal is invalid"))?;
    if ordinal == 0 {
        return Err(invalid_entry(
            "native launch replay ordinal must be nonzero",
        ));
    }
    validate_request_id(request_id)?;
    Ok((ordinal, request_id.to_owned()))
}

fn event_path(directory: &Path, sequence: u64) -> PathBuf {
    directory.join(format!("{sequence:020}.json"))
}

fn parse_event_name(name: &str) -> Result<u64, LaunchReplayError> {
    let Some(sequence) = name.strip_suffix(".json") else {
        return Err(invalid_entry(
            "native launch replay event name is malformed",
        ));
    };
    if sequence.len() != 20 || !sequence.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_entry(
            "native launch replay event sequence is not canonical",
        ));
    }
    let sequence = sequence
        .parse::<u64>()
        .map_err(|_| invalid_entry("native launch replay event sequence is invalid"))?;
    if sequence == 0 {
        return Err(invalid_entry(
            "native launch replay event sequence must be nonzero",
        ));
    }
    Ok(sequence)
}

fn validate_request_id(value: &str) -> Result<(), LaunchReplayError> {
    if value.len() == REQUEST_ID_BYTES * 2
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(invalid_entry("native launch replay request ID is invalid"))
    }
}

fn detail_matches_state(state: &str, detail_code: &str) -> bool {
    match state {
        "preparing" => matches!(detail_code, "PACKAGE_RESOLVING" | "WATCHDOG_STARTING"),
        "running" => matches!(
            detail_code,
            "PROCESS_STARTED"
                | "PROCESS_RESTARTED"
                | "WATCHDOG_HEALTHY"
                | "WATCHDOG_RESTARTING"
                | "WATCHDOG_HEALTH_RECOVERED"
        ),
        "stopping" => detail_code == "CANCEL_REQUESTED",
        "completed" => detail_code == "PROCESS_COMPLETED",
        "failed" => matches!(
            detail_code,
            "PACKAGE_RESOLUTION_FAILED"
                | "PACKAGE_PLAN_FAILED"
                | "PACKAGE_PREPARE_FAILED"
                | "PROCESS_START_FAILED"
                | "PROCESS_EXITED_UNSUCCESSFULLY"
                | "PROCESS_STATUS_FAILED"
                | "MONITOR_START_FAILED"
                | "WATCHDOG_STARTUP_TIMEOUT"
                | "WATCHDOG_HEARTBEAT_TIMEOUT"
                | "WATCHDOG_INVALID_HEALTH"
                | "WATCHDOG_PROCESS_EXIT"
                | "WATCHDOG_GPU_RESET"
                | "WATCHDOG_OUT_OF_MEMORY"
                | "WATCHDOG_INTERNAL_FAILURE"
                | "HOST_RESTARTED_INDETERMINATE"
                | "LAUNCH_STATE_PERSIST_FAILED"
        ),
        "cancelled" => detail_code == "PROCESS_CANCELLED",
        _ => false,
    }
}

fn valid_state_transition(previous: &str, next: &str) -> bool {
    match previous {
        "preparing" => matches!(
            next,
            "preparing" | "running" | "stopping" | "failed" | "cancelled"
        ),
        "running" => matches!(
            next,
            "running" | "stopping" | "completed" | "failed" | "cancelled"
        ),
        "stopping" => matches!(next, "failed" | "cancelled"),
        _ => false,
    }
}

fn path_exists(path: &Path) -> Result<bool, LaunchReplayError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(LaunchReplayError::Io {
            operation: "inspect native launch replay path",
            path: path.to_owned(),
            source,
        }),
    }
}

fn require_directory(path: &Path, kind: &'static str) -> Result<(), LaunchReplayError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| LaunchReplayError::Io {
        operation: "inspect native launch replay directory",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_dir() {
        Ok(())
    } else {
        Err(LaunchReplayError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), LaunchReplayError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| LaunchReplayError::Io {
        operation: "inspect native launch replay file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(LaunchReplayError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn invalid_entry(message: &str) -> LaunchReplayError {
    LaunchReplayError::InvalidState(message.to_owned())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), LaunchReplayError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| LaunchReplayError::Io {
            operation: "synchronize native launch replay directory",
            path: path.to_owned(),
            source,
        })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), LaunchReplayError> {
    Ok(())
}

#[derive(Debug)]
pub(crate) enum LaunchReplayError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    Busy,
    InvalidState(String),
    RecordLimit,
    RecordEventLimit {
        request_id: String,
    },
}

impl fmt::Display for LaunchReplayError {
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
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} is unsafe: {}", path.display())
            }
            Self::Busy => formatter.write_str("native launch replay journal is already in use"),
            Self::InvalidState(message) => {
                write!(
                    formatter,
                    "native launch replay state is invalid: {message}"
                )
            }
            Self::RecordLimit => formatter.write_str("native launch replay record limit exceeded"),
            Self::RecordEventLimit { request_id } => write!(
                formatter,
                "native launch replay event limit exceeded for request {request_id}"
            ),
        }
    }
}

impl std::error::Error for LaunchReplayError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::UnsafePath { .. }
            | Self::Busy
            | Self::InvalidState(_)
            | Self::RecordLimit
            | Self::RecordEventLimit { .. } => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::{
        DurableLaunchRecord, JOURNAL_SCHEMA_VERSION, LaunchReplayError, LaunchReplayJournal,
        MIGRATED_JOURNAL_SCHEMA_VERSION, SCHEMA_MIGRATION_FILE, record_directory_name, write_event,
    };

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const REQUEST_ONE: &str = "11111111111111111111111111111111";
    const REQUEST_TWO: &str = "22222222222222222222222222222222";

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-native-launch-replay-{}-{sequence}",
                std::process::id()
            ));
            Self { root }
        }

        fn record(
            ordinal: u64,
            request_id: &str,
            sequence: u64,
            state: &str,
            detail_code: &str,
        ) -> DurableLaunchRecord {
            DurableLaunchRecord::new(
                ordinal,
                request_id,
                "retro-2048",
                "local-player",
                None,
                7,
                sequence,
                state,
                detail_code,
                None,
            )
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    /// Writes one record whose events all carry `schema_version`, bypassing the
    /// writer so a journal from another schema can be reproduced on disk.
    fn seed_record_at_schema(
        root: &Path,
        ordinal: u64,
        request_id: &str,
        schema_version: u32,
        events: &[(u64, &str, &str)],
    ) -> PathBuf {
        let directory = root
            .join("active")
            .join(record_directory_name(ordinal, request_id));
        fs::create_dir(&directory).expect("record directory creates");
        for (sequence, state, detail_code) in events {
            let mut record = Fixture::record(ordinal, request_id, *sequence, state, detail_code);
            record.schema_version = schema_version;
            write_event(&directory, &record).expect("seeded event writes");
        }
        directory
    }

    fn read_json(path: &Path) -> serde_json::Value {
        serde_json::from_slice(&fs::read(path).expect("file reads")).expect("file parses")
    }

    #[test]
    fn writes_and_recovers_the_current_journal_schema_version() {
        let fixture = Fixture::new();
        let (mut journal, _, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        let accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        assert_eq!(accepted.schema_version, JOURNAL_SCHEMA_VERSION);
        journal.accept(&accepted).expect("acceptance persists");
        let failed = Fixture::record(1, REQUEST_ONE, 2, "failed", "PROCESS_START_FAILED");
        journal.append(&failed).expect("failure persists");
        drop(journal);

        let directory = fixture
            .root
            .join("active")
            .join(record_directory_name(1, REQUEST_ONE));
        for sequence in ["00000000000000000001.json", "00000000000000000002.json"] {
            assert_eq!(
                read_json(&directory.join(sequence))["schemaVersion"],
                JOURNAL_SCHEMA_VERSION
            );
        }

        let (_journal, recovered, cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal reopens");
        assert!(!cleanup_required);
        assert_eq!(recovered, vec![failed]);
        assert!(!fixture.root.join(SCHEMA_MIGRATION_FILE).exists());
    }

    #[test]
    fn migrates_a_pre_migration_journal_by_discarding_it_behind_the_cleanup_barrier() {
        let fixture = Fixture::new();
        let (journal, _, _) = LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        drop(journal);
        let interrupted = seed_record_at_schema(
            &fixture.root,
            1,
            REQUEST_ONE,
            MIGRATED_JOURNAL_SCHEMA_VERSION,
            &[
                (1, "preparing", "PACKAGE_RESOLVING"),
                (2, "running", "PROCESS_STARTED"),
            ],
        );
        let terminal = seed_record_at_schema(
            &fixture.root,
            2,
            REQUEST_TWO,
            MIGRATED_JOURNAL_SCHEMA_VERSION,
            &[
                (1, "preparing", "PACKAGE_RESOLVING"),
                (2, "completed", "PROCESS_COMPLETED"),
            ],
        );

        let (mut journal, records, cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("pre-migration journal migrates");
        assert!(records.is_empty());
        assert!(cleanup_required);
        assert!(!interrupted.exists());
        assert!(!terminal.exists());
        assert_eq!(
            read_json(&fixture.root.join(SCHEMA_MIGRATION_FILE)),
            serde_json::json!({
                "schemaVersion": JOURNAL_SCHEMA_VERSION,
                "migratedFromSchemaVersion": MIGRATED_JOURNAL_SCHEMA_VERSION,
                "discardedRecords": 2,
            })
        );

        assert_eq!(journal.next_ordinal(), 1);
        let accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        journal
            .accept(&accepted)
            .expect("a discarded request is accepted as a fresh launch");
        drop(journal);

        let (_journal, recovered, cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("migrated journal reopens");
        assert!(cleanup_required);
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].schema_version, JOURNAL_SCHEMA_VERSION);
        assert_eq!(recovered[0].detail_code, "HOST_RESTARTED_INDETERMINATE");
    }

    #[test]
    fn fails_closed_on_journal_schema_versions_it_cannot_migrate() {
        for schema_version in [0, 1, JOURNAL_SCHEMA_VERSION + 1, u32::MAX] {
            let fixture = Fixture::new();
            let (journal, _, _) =
                LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
            drop(journal);
            let directory = seed_record_at_schema(
                &fixture.root,
                1,
                REQUEST_ONE,
                schema_version,
                &[(1, "preparing", "PACKAGE_RESOLVING")],
            );
            assert!(matches!(
                LaunchReplayJournal::open(&fixture.root, 4),
                Err(LaunchReplayError::InvalidState(_))
            ));
            assert!(directory.exists());
            assert!(!fixture.root.join(SCHEMA_MIGRATION_FILE).exists());
        }
    }

    #[test]
    fn fails_closed_on_a_journal_that_mixes_schema_versions() {
        let fixture = Fixture::new();
        let (journal, _, _) = LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        drop(journal);
        let pre_migration = seed_record_at_schema(
            &fixture.root,
            1,
            REQUEST_ONE,
            MIGRATED_JOURNAL_SCHEMA_VERSION,
            &[(1, "preparing", "PACKAGE_RESOLVING")],
        );
        let current = seed_record_at_schema(
            &fixture.root,
            2,
            REQUEST_TWO,
            JOURNAL_SCHEMA_VERSION,
            &[(1, "preparing", "PACKAGE_RESOLVING")],
        );
        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 4),
            Err(LaunchReplayError::InvalidState(_))
        ));
        assert!(pre_migration.exists());
        assert!(current.exists());
        assert!(!fixture.root.join(SCHEMA_MIGRATION_FILE).exists());
    }

    #[test]
    fn library_entry_binding_is_immutable_and_survives_recovery() {
        let fixture = Fixture::new();
        let (mut journal, _records, _cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        let bound = Some(format!("content-{}", "a".repeat(64)));
        let mut accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        accepted.entry_id.clone_from(&bound);
        journal
            .accept(&accepted)
            .expect("bound acceptance persists");

        for replacement in [Some(format!("content-{}", "b".repeat(64))), None] {
            let mut changed = Fixture::record(1, REQUEST_ONE, 2, "running", "PROCESS_STARTED");
            changed.entry_id = replacement;
            assert!(matches!(
                journal.append(&changed),
                Err(LaunchReplayError::InvalidState(_))
            ));
        }

        let mut malformed = Fixture::record(2, REQUEST_TWO, 1, "preparing", "PACKAGE_RESOLVING");
        malformed.entry_id = Some("content-not-hexadecimal".to_owned());
        assert!(matches!(
            journal.accept(&malformed),
            Err(LaunchReplayError::InvalidState(_))
        ));

        let mut running = Fixture::record(1, REQUEST_ONE, 2, "running", "PROCESS_STARTED");
        running.entry_id.clone_from(&bound);
        journal
            .append(&running)
            .expect("unchanged entry binding persists");
        drop(journal);

        let (_journal, recovered, _cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal recovers");
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].entry_id, bound);
    }

    #[test]
    fn reopens_active_intent_as_terminal_indeterminate_without_reexecution() {
        let fixture = Fixture::new();
        let (mut journal, records, cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        assert!(records.is_empty());
        assert!(!cleanup_required);
        let accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        journal.accept(&accepted).expect("acceptance persists");
        let running = Fixture::record(1, REQUEST_ONE, 2, "running", "PROCESS_STARTED");
        journal.append(&running).expect("running state persists");
        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 4),
            Err(LaunchReplayError::Busy)
        ));
        drop(journal);

        let (mut journal, recovered, cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal recovers");
        assert!(cleanup_required);
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].sequence, 3);
        assert_eq!(recovered[0].state, "failed");
        assert_eq!(recovered[0].detail_code, "HOST_RESTARTED_INDETERMINATE");
        journal
            .clear_cleanup_required()
            .expect("cleanup barrier clears after external cleanup");
        drop(journal);

        let (_journal, stable, cleanup_required) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal reopens");
        assert_eq!(stable, recovered);
        assert!(!cleanup_required);
    }

    #[test]
    fn preserves_terminal_records_and_recovers_interrupted_retirement() {
        let fixture = Fixture::new();
        let (mut journal, _, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        let accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        journal.accept(&accepted).expect("acceptance persists");
        let failed = Fixture::record(1, REQUEST_ONE, 2, "failed", "PROCESS_START_FAILED");
        journal.append(&failed).expect("failure persists");
        drop(journal);

        let active = fixture
            .root
            .join("active")
            .join(record_directory_name(1, REQUEST_ONE));
        let retired = fixture
            .root
            .join("retired")
            .join(record_directory_name(1, REQUEST_ONE));
        fs::rename(&active, &retired).expect("interrupted retirement simulates");

        let (journal, records, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("retirement recovers");
        assert!(records.is_empty());
        assert!(!retired.exists());
        drop(journal);
    }

    #[test]
    fn removes_empty_acceptance_directory_after_interruption() {
        let fixture = Fixture::new();
        let (journal, _, _) = LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        drop(journal);
        let empty = fixture
            .root
            .join("active")
            .join(record_directory_name(1, REQUEST_ONE));
        fs::create_dir(&empty).expect("empty acceptance directory creates");

        let (_journal, records, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("empty record recovers");
        assert!(records.is_empty());
        assert!(!empty.exists());
    }

    #[test]
    fn rejects_corrupt_lifecycle_and_duplicate_request_bindings() {
        let fixture = Fixture::new();
        let (mut journal, _, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        let accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        journal.accept(&accepted).expect("acceptance persists");
        drop(journal);
        let event = fixture
            .root
            .join("active")
            .join(record_directory_name(1, REQUEST_ONE))
            .join("00000000000000000001.json");
        let mut invalid = accepted.clone();
        invalid.detail_code = "PROCESS_COMPLETED".to_owned();
        fs::write(
            &event,
            serde_json::to_vec(&invalid).expect("invalid event serializes"),
        )
        .expect("event corrupts");
        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 4),
            Err(LaunchReplayError::InvalidState(_))
        ));

        fs::remove_dir_all(&fixture.root).expect("corrupt journal removes");
        let (journal, _, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("fresh journal opens");
        drop(journal);
        for (ordinal, request_id) in [(1, REQUEST_TWO), (2, REQUEST_TWO)] {
            let directory = fixture
                .root
                .join("active")
                .join(record_directory_name(ordinal, request_id));
            fs::create_dir(&directory).expect("record directory creates");
            let record = Fixture::record(ordinal, request_id, 1, "preparing", "PACKAGE_RESOLVING");
            write_event(&directory, &record).expect("record event writes");
        }
        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 4),
            Err(LaunchReplayError::InvalidState(_))
        ));
    }

    #[test]
    fn rejects_catalog_generation_changes_within_one_launch_record() {
        let fixture = Fixture::new();
        let (mut journal, _, _) =
            LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        let accepted = Fixture::record(1, REQUEST_ONE, 1, "preparing", "PACKAGE_RESOLVING");
        journal.accept(&accepted).expect("acceptance persists");
        drop(journal);

        let directory = fixture
            .root
            .join("active")
            .join(record_directory_name(1, REQUEST_ONE));
        let mut running = Fixture::record(1, REQUEST_ONE, 2, "running", "PROCESS_STARTED");
        running.catalog_generation = 8;
        write_event(&directory, &running).expect("conflicting event writes");

        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 4),
            Err(LaunchReplayError::InvalidState(_))
        ));
    }

    #[test]
    fn rejects_noncanonical_root_paths_and_record_overflow() {
        let fixture = Fixture::new();
        let unsafe_root = fixture.root.join("child").join("..").join("journal");
        assert!(matches!(
            LaunchReplayJournal::open(&unsafe_root, 4),
            Err(LaunchReplayError::UnsafePath { .. })
        ));

        let (journal, _, _) = LaunchReplayJournal::open(&fixture.root, 1).expect("journal opens");
        drop(journal);
        for ordinal in 1..=2 {
            let request_id = if ordinal == 1 {
                REQUEST_ONE
            } else {
                REQUEST_TWO
            };
            let directory = fixture
                .root
                .join("active")
                .join(record_directory_name(ordinal, request_id));
            fs::create_dir(&directory).expect("record directory creates");
            let record = Fixture::record(ordinal, request_id, 1, "preparing", "PACKAGE_RESOLVING");
            write_event(&directory, &record).expect("record event writes");
        }
        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 1),
            Err(LaunchReplayError::RecordLimit)
        ));
    }

    #[test]
    fn rejects_event_overflow_before_parsing_unbounded_history() {
        let fixture = Fixture::new();
        let (journal, _, _) = LaunchReplayJournal::open(&fixture.root, 4).expect("journal opens");
        drop(journal);
        let directory = fixture
            .root
            .join("active")
            .join(record_directory_name(1, REQUEST_ONE));
        fs::create_dir(&directory).expect("record directory creates");
        for sequence in 1..=129 {
            let detail = if sequence == 1 {
                "PACKAGE_RESOLVING"
            } else {
                "WATCHDOG_STARTING"
            };
            let record = Fixture::record(1, REQUEST_ONE, sequence, "preparing", detail);
            write_event(&directory, &record).expect("bounded event serializes");
        }
        assert!(matches!(
            LaunchReplayJournal::open(&fixture.root, 4),
            Err(LaunchReplayError::RecordEventLimit { .. })
        ));
    }
}
