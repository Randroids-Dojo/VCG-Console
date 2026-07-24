//! Host-owned package launch coordination for authenticated launcher intents.

use std::collections::{BTreeSet, HashSet, VecDeque};
use std::fmt;
use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::installed_catalog::{
    CatalogError, ResolvedPackage, TrustedPackageCatalog, validate_intent_id,
};
use crate::native_launch_replay::{DurableLaunchRecord, LaunchReplayError, LaunchReplayJournal};
use crate::process::{
    ControlledWatchdogOutcome, FileHealthProbe, LaunchError, ProcessSupervisor,
    WatchdogConfigError, WatchdogError, WatchdogEvent, WatchdogPolicy, WatchdogReason,
};
use crate::retroarch::{RetroArchError, RetroArchPlan, plan as plan_retroarch};

const MAX_LAUNCH_RECORDS: usize = 64;
const MONITOR_INTERVAL: Duration = Duration::from_millis(50);
const REQUEST_ID_HEX_BYTES: usize = 16;
const MAX_PERSISTED_WATCHDOG_RESTARTS: u32 = 16;

/// One browser-safe view of a host-owned launch.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeLaunchSnapshot {
    pub request_id: String,
    pub game_id: String,
    pub profile_id: String,
    pub state: NativeLaunchState,
    pub sequence: u64,
    pub detail_code: &'static str,
}

/// Observable launch lifecycle. Process IDs, paths, and command lines remain
/// private to the host.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeLaunchState {
    Preparing,
    Running,
    Stopping,
    Completed { exit_code: Option<i32> },
    Failed { exit_code: Option<i32> },
    Cancelled,
}

impl NativeLaunchState {
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Preparing => "preparing",
            Self::Running => "running",
            Self::Stopping => "stopping",
            Self::Completed { .. } => "completed",
            Self::Failed { .. } => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    #[must_use]
    pub fn exit_code(self) -> Option<i32> {
        match self {
            Self::Completed { exit_code } | Self::Failed { exit_code } => exit_code,
            Self::Preparing | Self::Running | Self::Stopping | Self::Cancelled => None,
        }
    }

    fn active(self) -> bool {
        matches!(self, Self::Preparing | Self::Running | Self::Stopping)
    }
}

/// Result of an idempotent launch request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeLaunchStart {
    pub snapshot: NativeLaunchSnapshot,
    pub replayed: bool,
}

#[derive(Debug)]
struct LaunchRecord {
    accepted_ordinal: u64,
    request_id: String,
    game_id: String,
    profile_id: String,
    catalog_generation: u64,
    state: NativeLaunchState,
    sequence: u64,
    detail_code: &'static str,
    cancel: Arc<AtomicBool>,
}

impl LaunchRecord {
    fn snapshot(&self) -> NativeLaunchSnapshot {
        NativeLaunchSnapshot {
            request_id: self.request_id.clone(),
            game_id: self.game_id.clone(),
            profile_id: self.profile_id.clone(),
            state: self.state,
            sequence: self.sequence,
            detail_code: self.detail_code,
        }
    }

    fn durable(&self) -> DurableLaunchRecord {
        DurableLaunchRecord::new(
            self.accepted_ordinal,
            &self.request_id,
            &self.game_id,
            &self.profile_id,
            self.catalog_generation,
            self.sequence,
            self.state.name(),
            self.detail_code,
            self.state.exit_code(),
        )
    }

    fn from_durable(record: DurableLaunchRecord) -> Result<Self, NativeLaunchError> {
        let state = match record.state.as_str() {
            "preparing" => NativeLaunchState::Preparing,
            "running" => NativeLaunchState::Running,
            "stopping" => NativeLaunchState::Stopping,
            "completed" => NativeLaunchState::Completed {
                exit_code: record.exit_code,
            },
            "failed" => NativeLaunchState::Failed {
                exit_code: record.exit_code,
            },
            "cancelled" => NativeLaunchState::Cancelled,
            _ => {
                return Err(NativeLaunchError::from(LaunchReplayError::InvalidState(
                    "native launch replay state is unsupported".to_owned(),
                )));
            }
        };
        let detail_code = durable_detail_code(&record.detail_code).ok_or_else(|| {
            NativeLaunchError::from(LaunchReplayError::InvalidState(
                "native launch replay detail code is unsupported".to_owned(),
            ))
        })?;
        Ok(Self {
            accepted_ordinal: record.accepted_ordinal,
            request_id: record.request_id,
            game_id: record.game_id,
            profile_id: record.profile_id,
            catalog_generation: record.catalog_generation,
            state,
            sequence: record.sequence,
            detail_code,
            cancel: Arc::new(AtomicBool::new(false)),
        })
    }
}

#[derive(Debug)]
struct SharedLaunches {
    records: VecDeque<LaunchRecord>,
    journal: Option<LaunchReplayJournal>,
    next_ordinal: u64,
    journal_faulted: bool,
    restart_cleanup_required: bool,
}

impl Default for SharedLaunches {
    fn default() -> Self {
        Self {
            records: VecDeque::new(),
            journal: None,
            next_ordinal: 1,
            journal_faulted: false,
            restart_cleanup_required: false,
        }
    }
}

enum PreparedLaunch {
    Ready(Box<RetroArchPlan>),
    Failed(&'static str),
}

/// Resolves fixed launcher intent through the signed catalog and owns every
/// child process it starts.
#[derive(Debug)]
pub struct NativeLaunchService {
    catalog: Arc<TrustedPackageCatalog>,
    allowed_profiles: HashSet<String>,
    watchdog_games: HashSet<String>,
    watchdog_policy: WatchdogPolicy,
    shared: Arc<Mutex<SharedLaunches>>,
    stop: Arc<AtomicBool>,
    workers: Mutex<Vec<JoinHandle<()>>>,
}

impl NativeLaunchService {
    /// Creates a launch service with an explicit host-owned profile allowlist.
    ///
    /// # Errors
    ///
    /// Rejects an empty list, duplicates, and invalid profile identifiers.
    pub fn new(
        catalog: Arc<TrustedPackageCatalog>,
        profile_ids: impl IntoIterator<Item = String>,
    ) -> Result<Self, NativeLaunchError> {
        Self::with_watchdog_games(
            catalog,
            profile_ids,
            Vec::new(),
            WatchdogPolicy::local_game_defaults(),
        )
    }

    /// Creates a launch service whose explicitly selected games require
    /// heartbeat supervision.
    ///
    /// Watchdog game IDs must identify packages in the signature-verified
    /// catalog. The browser cannot enable supervision or select probe paths.
    ///
    /// # Errors
    ///
    /// Rejects invalid or duplicate launch-profile/watchdog-game IDs, watchdog
    /// games absent from the catalog, and invalid watchdog policy.
    pub fn with_watchdog_games(
        catalog: Arc<TrustedPackageCatalog>,
        profile_ids: impl IntoIterator<Item = String>,
        watchdog_game_ids: impl IntoIterator<Item = String>,
        watchdog_policy: WatchdogPolicy,
    ) -> Result<Self, NativeLaunchError> {
        Self::with_optional_replay(
            catalog,
            profile_ids,
            watchdog_game_ids,
            watchdog_policy,
            None,
        )
    }

    /// Creates a launch service with durable bounded cross-restart replay.
    ///
    /// Every accepted state is synchronized beneath the host-owned journal
    /// root before execution. Reopening converts a nonterminal record into an
    /// indeterminate terminal failure and never re-executes it.
    ///
    /// # Errors
    ///
    /// Rejects invalid launch configuration, unsafe or corrupted journal
    /// state, journal lock contention, and journal I/O failures.
    pub fn with_persistent_replay(
        catalog: Arc<TrustedPackageCatalog>,
        profile_ids: impl IntoIterator<Item = String>,
        watchdog_game_ids: impl IntoIterator<Item = String>,
        watchdog_policy: WatchdogPolicy,
        journal_root: &Path,
    ) -> Result<Self, NativeLaunchError> {
        Self::with_optional_replay(
            catalog,
            profile_ids,
            watchdog_game_ids,
            watchdog_policy,
            Some(journal_root),
        )
    }

    fn with_optional_replay(
        catalog: Arc<TrustedPackageCatalog>,
        profile_ids: impl IntoIterator<Item = String>,
        watchdog_game_ids: impl IntoIterator<Item = String>,
        watchdog_policy: WatchdogPolicy,
        journal_root: Option<&Path>,
    ) -> Result<Self, NativeLaunchError> {
        let mut allowed_profiles = HashSet::new();
        for profile_id in profile_ids {
            validate_intent_id("profile", &profile_id)
                .map_err(|_| NativeLaunchError::InvalidProfile(profile_id.clone()))?;
            if !allowed_profiles.insert(profile_id.clone()) {
                return Err(NativeLaunchError::DuplicateProfile(profile_id));
            }
        }
        if allowed_profiles.is_empty() {
            return Err(NativeLaunchError::NoProfiles);
        }
        let mut watchdog_games = HashSet::new();
        for game_id in watchdog_game_ids {
            validate_intent_id("game", &game_id)
                .map_err(|_| NativeLaunchError::InvalidWatchdogGame(game_id.clone()))?;
            if !watchdog_games.insert(game_id.clone()) {
                return Err(NativeLaunchError::DuplicateWatchdogGame(game_id));
            }
            if catalog.package_summary(&game_id).is_err() {
                return Err(NativeLaunchError::WatchdogGameNotInstalled(game_id));
            }
        }
        watchdog_policy
            .validate()
            .map_err(NativeLaunchError::WatchdogConfiguration)?;
        if watchdog_policy.max_restarts > MAX_PERSISTED_WATCHDOG_RESTARTS {
            return Err(NativeLaunchError::WatchdogRestartLimit(
                watchdog_policy.max_restarts,
            ));
        }
        let shared = if let Some(journal_root) = journal_root {
            let (journal, durable_records, restart_cleanup_required) =
                LaunchReplayJournal::open(journal_root, MAX_LAUNCH_RECORDS)
                    .map_err(NativeLaunchError::from)?;
            let next_ordinal = journal.next_ordinal();
            let records = durable_records
                .into_iter()
                .map(LaunchRecord::from_durable)
                .collect::<Result<VecDeque<_>, _>>()?;
            SharedLaunches {
                records,
                journal: Some(journal),
                next_ordinal,
                journal_faulted: false,
                restart_cleanup_required,
            }
        } else {
            SharedLaunches::default()
        };
        Ok(Self {
            catalog,
            allowed_profiles,
            watchdog_games,
            watchdog_policy,
            shared: Arc::new(Mutex::new(shared)),
            stop: Arc::new(AtomicBool::new(false)),
            workers: Mutex::new(Vec::new()),
        })
    }

    #[must_use]
    pub fn catalog(&self) -> &TrustedPackageCatalog {
        &self.catalog
    }

    /// Clears a crash-recovery launch barrier after trusted host code has
    /// proven that every process from the interrupted launch is gone.
    ///
    /// This method is intentionally not exposed by the browser API.
    ///
    /// # Errors
    ///
    /// Fails when the service is memory-only, replay persistence is faulted,
    /// or the cleanup acknowledgement cannot be synchronized.
    pub fn acknowledge_restart_cleanup(&self) -> Result<(), NativeLaunchError> {
        let mut shared = lock(&self.shared)?;
        if shared.journal_faulted {
            return Err(NativeLaunchError::ReplayUnavailable);
        }
        let Some(journal) = &mut shared.journal else {
            return Err(NativeLaunchError::ReplayUnavailable);
        };
        if let Err(error) = journal.clear_cleanup_required() {
            shared.journal_faulted = true;
            return Err(error.into());
        }
        shared.restart_cleanup_required = false;
        Ok(())
    }

    /// Returns catalog generations that package maintenance must not remove.
    ///
    /// Active records protect their exact trusted catalog generation. While a
    /// restart cleanup barrier is set, every recovered indeterminate record
    /// remains protected until trusted descendant cleanup is acknowledged.
    /// Paths and browser-supplied values never enter this result.
    ///
    /// # Errors
    ///
    /// Fails closed when replay persistence is unavailable.
    pub fn protected_catalog_generations(&self) -> Result<Vec<u64>, NativeLaunchError> {
        let shared = lock(&self.shared)?;
        if shared.journal_faulted {
            return Err(NativeLaunchError::ReplayUnavailable);
        }
        let mut generations = BTreeSet::new();
        for record in &shared.records {
            if record.state.active()
                || (shared.restart_cleanup_required
                    && record.detail_code == "HOST_RESTARTED_INDETERMINATE")
            {
                generations.insert(record.catalog_generation);
            }
        }
        Ok(generations.into_iter().collect())
    }

    /// Starts one package or returns the existing record for an identical
    /// request ID. Reusing an ID for different intent fails closed.
    ///
    /// # Errors
    ///
    /// Rejects unknown profiles, conflicting or excessive requests, catalog
    /// and artifact verification failures, storage preparation failures, and
    /// child-process start failures.
    pub fn start(
        &self,
        request_id: &str,
        game_id: &str,
        profile_id: &str,
    ) -> Result<NativeLaunchStart, NativeLaunchError> {
        self.validate_launch_intent(request_id, game_id, profile_id)?;
        self.reap_finished_workers()?;

        let cancel = Arc::new(AtomicBool::new(false));
        if let Some(replay) = self.reserve(request_id, game_id, profile_id, Arc::clone(&cancel))? {
            return Ok(replay);
        }

        let plan = match self.prepare_plan(game_id, profile_id) {
            PreparedLaunch::Ready(plan) => plan,
            PreparedLaunch::Failed(code) => return self.failed_start(request_id, code),
        };
        if self.stop.load(Ordering::Acquire) || cancel.load(Ordering::Acquire) {
            return self.cancelled_start(request_id);
        }
        if self.watchdog_games.contains(game_id) {
            self.activate_watchdog(request_id, &plan, &cancel)
        } else {
            self.activate_process(request_id, &plan, cancel)
        }
    }

    fn validate_launch_intent(
        &self,
        request_id: &str,
        game_id: &str,
        profile_id: &str,
    ) -> Result<(), NativeLaunchError> {
        validate_request_id(request_id)?;
        validate_intent_id("game", game_id)
            .map_err(|_| NativeLaunchError::InvalidGame(game_id.to_owned()))?;
        validate_intent_id("profile", profile_id)
            .map_err(|_| NativeLaunchError::InvalidProfile(profile_id.to_owned()))?;
        if self.allowed_profiles.contains(profile_id) {
            Ok(())
        } else {
            Err(NativeLaunchError::ProfileNotFound(profile_id.to_owned()))
        }
    }

    fn reserve(
        &self,
        request_id: &str,
        game_id: &str,
        profile_id: &str,
        cancel: Arc<AtomicBool>,
    ) -> Result<Option<NativeLaunchStart>, NativeLaunchError> {
        let mut shared = lock(&self.shared)?;
        if shared.journal_faulted {
            return Err(NativeLaunchError::ReplayUnavailable);
        }
        if let Some(existing) = shared
            .records
            .iter()
            .find(|record| record.request_id == request_id)
        {
            if existing.game_id != game_id || existing.profile_id != profile_id {
                return Err(NativeLaunchError::RequestConflict(request_id.to_owned()));
            }
            return Ok(Some(NativeLaunchStart {
                snapshot: existing.snapshot(),
                replayed: true,
            }));
        }
        if shared.restart_cleanup_required {
            return Err(NativeLaunchError::RestartCleanupRequired);
        }
        if let Some(active) = shared.records.iter().find(|record| record.state.active()) {
            return Err(NativeLaunchError::AlreadyRunning(active.game_id.clone()));
        }
        prune_records(&mut shared)?;
        if shared.records.len() >= MAX_LAUNCH_RECORDS {
            return Err(NativeLaunchError::RecordLimit);
        }
        let accepted_ordinal = shared.next_ordinal;
        let record = LaunchRecord {
            accepted_ordinal,
            request_id: request_id.to_owned(),
            game_id: game_id.to_owned(),
            profile_id: profile_id.to_owned(),
            catalog_generation: self.catalog.generation(),
            state: NativeLaunchState::Preparing,
            sequence: 1,
            detail_code: "PACKAGE_RESOLVING",
            cancel,
        };
        if let Some(journal) = &mut shared.journal {
            if let Err(error) = journal.accept(&record.durable()) {
                shared.journal_faulted = true;
                return Err(error.into());
            }
            shared.next_ordinal = journal.next_ordinal();
        } else {
            shared.next_ordinal = shared
                .next_ordinal
                .checked_add(1)
                .ok_or(NativeLaunchError::RecordLimit)?;
        }
        shared.records.push_back(record);
        Ok(None)
    }

    fn prepare_plan(&self, game_id: &str, profile_id: &str) -> PreparedLaunch {
        let Ok(resolved) = self.catalog.resolve(game_id, profile_id) else {
            return PreparedLaunch::Failed("PACKAGE_RESOLUTION_FAILED");
        };
        let ResolvedPackage::Libretro(request) = resolved;
        let Ok(plan) = plan_retroarch(&request) else {
            return PreparedLaunch::Failed("PACKAGE_PLAN_FAILED");
        };
        if plan.prepare().is_err() {
            PreparedLaunch::Failed("PACKAGE_PREPARE_FAILED")
        } else {
            PreparedLaunch::Ready(Box::new(plan))
        }
    }

    fn activate_process(
        &self,
        request_id: &str,
        plan: &RetroArchPlan,
        cancel: Arc<AtomicBool>,
    ) -> Result<NativeLaunchStart, NativeLaunchError> {
        let Ok(mut child) = ProcessSupervisor.launch(plan.launch()) else {
            return self.failed_start(request_id, "PROCESS_START_FAILED");
        };
        let accepted_snapshot = {
            let mut shared = lock(&self.shared)?;
            let Some(index) = shared
                .records
                .iter()
                .position(|record| record.request_id == request_id)
            else {
                let _ = child.terminate();
                return Err(NativeLaunchError::RequestNotFound(request_id.to_owned()));
            };
            if shared.records[index].cancel.load(Ordering::Acquire) {
                let _ = child.terminate();
                transition_record(
                    &mut shared,
                    index,
                    NativeLaunchState::Cancelled,
                    "PROCESS_CANCELLED",
                )?;
                return Ok(NativeLaunchStart {
                    snapshot: shared.records[index].snapshot(),
                    replayed: false,
                });
            }
            if let Err(error) = transition_record(
                &mut shared,
                index,
                NativeLaunchState::Running,
                "PROCESS_STARTED",
            ) {
                let _ = child.terminate();
                return Err(error);
            }
            shared.records[index].snapshot()
        };

        let shared = Arc::clone(&self.shared);
        let stop = Arc::clone(&self.stop);
        let worker_request_id = request_id.to_owned();
        let worker = thread::Builder::new()
            .name(format!("vcg-game-{}", short_request_id(request_id)))
            .spawn(move || {
                monitor_child(&mut child, &shared, &stop, &cancel, &worker_request_id);
            })
            .map_err(|source| {
                update_state(
                    &self.shared,
                    request_id,
                    NativeLaunchState::Failed { exit_code: None },
                    "MONITOR_START_FAILED",
                );
                NativeLaunchError::Io {
                    operation: "start launch monitor",
                    source,
                }
            })?;
        lock(&self.workers)?.push(worker);

        Ok(NativeLaunchStart {
            snapshot: accepted_snapshot,
            replayed: false,
        })
    }

    fn activate_watchdog(
        &self,
        request_id: &str,
        plan: &RetroArchPlan,
        cancel: &Arc<AtomicBool>,
    ) -> Result<NativeLaunchStart, NativeLaunchError> {
        let heartbeat_path = plan.storage().session.join("vcg.heartbeat");
        let probe = FileHealthProbe::new(&heartbeat_path, None)
            .map_err(NativeLaunchError::WatchdogConfiguration)?;
        let launch = plan
            .launch()
            .clone()
            .env("VCG_HEARTBEAT_FILE", heartbeat_path.as_os_str());
        let accepted_snapshot = {
            let mut shared = lock(&self.shared)?;
            let index = shared
                .records
                .iter()
                .position(|record| record.request_id == request_id)
                .ok_or_else(|| NativeLaunchError::RequestNotFound(request_id.to_owned()))?;
            if shared.records[index].cancel.load(Ordering::Acquire) {
                transition_record(
                    &mut shared,
                    index,
                    NativeLaunchState::Cancelled,
                    "PROCESS_CANCELLED",
                )?;
            } else {
                transition_record(
                    &mut shared,
                    index,
                    NativeLaunchState::Preparing,
                    "WATCHDOG_STARTING",
                )?;
            }
            shared.records[index].snapshot()
        };
        if accepted_snapshot.state == NativeLaunchState::Cancelled {
            return Ok(NativeLaunchStart {
                snapshot: accepted_snapshot,
                replayed: false,
            });
        }
        let policy = self.watchdog_policy.clone();
        let shared = Arc::clone(&self.shared);
        let stop = Arc::clone(&self.stop);
        let worker_cancel = Arc::clone(cancel);
        let worker_request_id = request_id.to_owned();
        let worker = thread::Builder::new()
            .name(format!("vcg-watchdog-{}", short_request_id(request_id)))
            .spawn(move || {
                monitor_watchdog(
                    &launch,
                    &policy,
                    probe,
                    &shared,
                    &stop,
                    &worker_cancel,
                    &worker_request_id,
                );
            })
            .map_err(|source| {
                update_state(
                    &self.shared,
                    request_id,
                    NativeLaunchState::Failed { exit_code: None },
                    "MONITOR_START_FAILED",
                );
                NativeLaunchError::Io {
                    operation: "start watchdog monitor",
                    source,
                }
            })?;
        lock(&self.workers)?.push(worker);

        Ok(NativeLaunchStart {
            snapshot: accepted_snapshot,
            replayed: false,
        })
    }

    /// Returns one launch without exposing native implementation details.
    ///
    /// # Errors
    ///
    /// Rejects malformed or unknown request IDs.
    pub fn status(&self, request_id: &str) -> Result<NativeLaunchSnapshot, NativeLaunchError> {
        validate_request_id(request_id)?;
        lock(&self.shared)?
            .records
            .iter()
            .find(|record| record.request_id == request_id)
            .map(LaunchRecord::snapshot)
            .ok_or_else(|| NativeLaunchError::RequestNotFound(request_id.to_owned()))
    }

    /// Requests cancellation. Repeated cancellation of the same launch is
    /// idempotent.
    ///
    /// # Errors
    ///
    /// Rejects malformed or unknown request IDs.
    pub fn cancel(&self, request_id: &str) -> Result<NativeLaunchSnapshot, NativeLaunchError> {
        validate_request_id(request_id)?;
        let mut shared = lock(&self.shared)?;
        let index = shared
            .records
            .iter()
            .position(|record| record.request_id == request_id)
            .ok_or_else(|| NativeLaunchError::RequestNotFound(request_id.to_owned()))?;
        if matches!(
            shared.records[index].state,
            NativeLaunchState::Preparing | NativeLaunchState::Running
        ) {
            shared.records[index].cancel.store(true, Ordering::Release);
            transition_record(
                &mut shared,
                index,
                NativeLaunchState::Stopping,
                "CANCEL_REQUESTED",
            )?;
        }
        Ok(shared.records[index].snapshot())
    }

    fn failed_start(
        &self,
        request_id: &str,
        detail_code: &'static str,
    ) -> Result<NativeLaunchStart, NativeLaunchError> {
        update_state_result(
            &self.shared,
            request_id,
            NativeLaunchState::Failed { exit_code: None },
            detail_code,
        )?;
        Ok(NativeLaunchStart {
            snapshot: self.status(request_id)?,
            replayed: false,
        })
    }

    fn cancelled_start(&self, request_id: &str) -> Result<NativeLaunchStart, NativeLaunchError> {
        update_state_result(
            &self.shared,
            request_id,
            NativeLaunchState::Cancelled,
            "PROCESS_CANCELLED",
        )?;
        Ok(NativeLaunchStart {
            snapshot: self.status(request_id)?,
            replayed: false,
        })
    }

    fn reap_finished_workers(&self) -> Result<(), NativeLaunchError> {
        let mut workers = lock(&self.workers)?;
        let mut index = 0;
        while index < workers.len() {
            if workers[index].is_finished() {
                let worker = workers.remove(index);
                let _ = worker.join();
            } else {
                index += 1;
            }
        }
        Ok(())
    }
}

impl Drop for NativeLaunchService {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let workers = match self.workers.get_mut() {
            Ok(workers) => std::mem::take(workers),
            Err(poisoned) => std::mem::take(poisoned.into_inner()),
        };
        for worker in workers {
            let _ = worker.join();
        }
    }
}

fn monitor_watchdog(
    launch: &crate::process::LaunchSpec,
    policy: &WatchdogPolicy,
    probe: FileHealthProbe,
    shared: &Mutex<SharedLaunches>,
    stop: &AtomicBool,
    cancel: &AtomicBool,
    request_id: &str,
) {
    let result = ProcessSupervisor.watch_controlled(
        launch,
        policy,
        probe,
        |event| apply_watchdog_event(shared, request_id, event),
        || stop.load(Ordering::Acquire) || cancel.load(Ordering::Acquire),
    );
    match result {
        Ok(
            ControlledWatchdogOutcome::Completed(_) | ControlledWatchdogOutcome::Cancelled { .. },
        )
        | Err(WatchdogError::RecoveryExhausted { .. }) => {}
        Err(WatchdogError::Launch(_)) => update_state(
            shared,
            request_id,
            NativeLaunchState::Failed { exit_code: None },
            "PROCESS_START_FAILED",
        ),
        Err(WatchdogError::Configuration(_) | WatchdogError::Io { .. }) => update_state(
            shared,
            request_id,
            NativeLaunchState::Failed { exit_code: None },
            "WATCHDOG_INTERNAL_FAILURE",
        ),
    }
}

fn apply_watchdog_event(shared: &Mutex<SharedLaunches>, request_id: &str, event: &WatchdogEvent) {
    let Ok(mut shared) = shared.lock() else {
        return;
    };
    let Some(index) = shared
        .records
        .iter()
        .position(|record| record.request_id == request_id)
    else {
        return;
    };
    if shared.records[index].cancel.load(Ordering::Acquire)
        && !matches!(event, WatchdogEvent::Cancelled { .. })
    {
        if matches!(
            event,
            WatchdogEvent::Completed { .. } | WatchdogEvent::Failed { .. }
        ) {
            let _ = transition_record(
                &mut shared,
                index,
                NativeLaunchState::Cancelled,
                "PROCESS_CANCELLED",
            );
        }
        return;
    }
    let (state, detail_code) = match event {
        WatchdogEvent::Started { attempt, .. } => (
            NativeLaunchState::Running,
            if *attempt == 1 {
                "PROCESS_STARTED"
            } else {
                "PROCESS_RESTARTED"
            },
        ),
        WatchdogEvent::Ready { recovered, .. } => (
            NativeLaunchState::Running,
            if *recovered {
                "WATCHDOG_HEALTH_RECOVERED"
            } else {
                "WATCHDOG_HEALTHY"
            },
        ),
        WatchdogEvent::Restarting { .. } => (NativeLaunchState::Running, "WATCHDOG_RESTARTING"),
        WatchdogEvent::Completed { exit_code, .. } => (
            NativeLaunchState::Completed {
                exit_code: *exit_code,
            },
            "PROCESS_COMPLETED",
        ),
        WatchdogEvent::Failed { reason, .. } => (
            NativeLaunchState::Failed {
                exit_code: watchdog_exit_code(reason),
            },
            watchdog_failure_code(reason),
        ),
        WatchdogEvent::Cancelled { .. } => (NativeLaunchState::Cancelled, "PROCESS_CANCELLED"),
    };
    let _ = transition_record(&mut shared, index, state, detail_code);
}

fn watchdog_exit_code(reason: &WatchdogReason) -> Option<i32> {
    match reason {
        WatchdogReason::ProcessExit { exit_code } => *exit_code,
        WatchdogReason::StartupTimeout
        | WatchdogReason::HeartbeatTimeout
        | WatchdogReason::InvalidProbeData
        | WatchdogReason::ResourceFault(_) => None,
    }
}

fn watchdog_failure_code(reason: &WatchdogReason) -> &'static str {
    match reason {
        WatchdogReason::StartupTimeout => "WATCHDOG_STARTUP_TIMEOUT",
        WatchdogReason::HeartbeatTimeout => "WATCHDOG_HEARTBEAT_TIMEOUT",
        WatchdogReason::InvalidProbeData => "WATCHDOG_INVALID_HEALTH",
        WatchdogReason::ProcessExit { .. } => "WATCHDOG_PROCESS_EXIT",
        WatchdogReason::ResourceFault(crate::process::ResourceFault::GpuReset) => {
            "WATCHDOG_GPU_RESET"
        }
        WatchdogReason::ResourceFault(crate::process::ResourceFault::OutOfMemory) => {
            "WATCHDOG_OUT_OF_MEMORY"
        }
    }
}

fn monitor_child(
    child: &mut crate::process::ManagedChild,
    shared: &Mutex<SharedLaunches>,
    stop: &AtomicBool,
    cancel: &AtomicBool,
    request_id: &str,
) {
    loop {
        if stop.load(Ordering::Acquire) || cancel.load(Ordering::Acquire) {
            let _ = child.terminate();
            update_state(
                shared,
                request_id,
                NativeLaunchState::Cancelled,
                "PROCESS_CANCELLED",
            );
            return;
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                update_state(
                    shared,
                    request_id,
                    NativeLaunchState::Completed {
                        exit_code: status.code(),
                    },
                    "PROCESS_COMPLETED",
                );
                return;
            }
            Ok(Some(status)) => {
                update_state(
                    shared,
                    request_id,
                    NativeLaunchState::Failed {
                        exit_code: status.code(),
                    },
                    "PROCESS_EXITED_UNSUCCESSFULLY",
                );
                return;
            }
            Ok(None) => thread::sleep(MONITOR_INTERVAL),
            Err(_) => {
                let _ = child.terminate();
                update_state(
                    shared,
                    request_id,
                    NativeLaunchState::Failed { exit_code: None },
                    "PROCESS_STATUS_FAILED",
                );
                return;
            }
        }
    }
}

fn update_state(
    shared: &Mutex<SharedLaunches>,
    request_id: &str,
    state: NativeLaunchState,
    detail_code: &'static str,
) {
    let _ = update_state_result(shared, request_id, state, detail_code);
}

fn update_state_result(
    shared: &Mutex<SharedLaunches>,
    request_id: &str,
    state: NativeLaunchState,
    detail_code: &'static str,
) -> Result<(), NativeLaunchError> {
    let mut shared = lock(shared)?;
    let index = shared
        .records
        .iter()
        .position(|record| record.request_id == request_id)
        .ok_or_else(|| NativeLaunchError::RequestNotFound(request_id.to_owned()))?;
    transition_record(&mut shared, index, state, detail_code)
}

fn transition_record(
    shared: &mut SharedLaunches,
    index: usize,
    state: NativeLaunchState,
    detail_code: &'static str,
) -> Result<(), NativeLaunchError> {
    if shared.journal_faulted {
        return Err(NativeLaunchError::ReplayUnavailable);
    }
    let sequence = shared.records[index]
        .sequence
        .checked_add(1)
        .ok_or(NativeLaunchError::RecordLimit)?;
    let durable = DurableLaunchRecord::new(
        shared.records[index].accepted_ordinal,
        &shared.records[index].request_id,
        &shared.records[index].game_id,
        &shared.records[index].profile_id,
        shared.records[index].catalog_generation,
        sequence,
        state.name(),
        detail_code,
        state.exit_code(),
    );
    if let Some(journal) = &mut shared.journal
        && let Err(error) = journal.append(&durable)
    {
        shared.journal_faulted = true;
        let record = &mut shared.records[index];
        record.cancel.store(true, Ordering::Release);
        record.state = NativeLaunchState::Failed { exit_code: None };
        record.sequence = sequence;
        record.detail_code = "LAUNCH_STATE_PERSIST_FAILED";
        return Err(error.into());
    }
    let record = &mut shared.records[index];
    record.state = state;
    record.sequence = sequence;
    record.detail_code = detail_code;
    Ok(())
}

fn prune_records(shared: &mut SharedLaunches) -> Result<(), NativeLaunchError> {
    while shared.records.len() >= MAX_LAUNCH_RECORDS {
        let Some(index) = shared
            .records
            .iter()
            .position(|record| !record.state.active())
        else {
            break;
        };
        let record = &shared.records[index];
        if let Some(journal) = &mut shared.journal
            && let Err(error) = journal.retire(record.accepted_ordinal, &record.request_id)
        {
            shared.journal_faulted = true;
            return Err(error.into());
        }
        shared.records.remove(index);
    }
    Ok(())
}

fn validate_request_id(value: &str) -> Result<(), NativeLaunchError> {
    if value.len() == REQUEST_ID_HEX_BYTES * 2
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(NativeLaunchError::InvalidRequestId(value.to_owned()))
    }
}

fn durable_detail_code(value: &str) -> Option<&'static str> {
    Some(match value {
        "PACKAGE_RESOLVING" => "PACKAGE_RESOLVING",
        "PACKAGE_RESOLUTION_FAILED" => "PACKAGE_RESOLUTION_FAILED",
        "PACKAGE_PLAN_FAILED" => "PACKAGE_PLAN_FAILED",
        "PACKAGE_PREPARE_FAILED" => "PACKAGE_PREPARE_FAILED",
        "PROCESS_START_FAILED" => "PROCESS_START_FAILED",
        "PROCESS_STARTED" => "PROCESS_STARTED",
        "PROCESS_RESTARTED" => "PROCESS_RESTARTED",
        "PROCESS_COMPLETED" => "PROCESS_COMPLETED",
        "PROCESS_EXITED_UNSUCCESSFULLY" => "PROCESS_EXITED_UNSUCCESSFULLY",
        "PROCESS_STATUS_FAILED" => "PROCESS_STATUS_FAILED",
        "PROCESS_CANCELLED" => "PROCESS_CANCELLED",
        "CANCEL_REQUESTED" => "CANCEL_REQUESTED",
        "MONITOR_START_FAILED" => "MONITOR_START_FAILED",
        "WATCHDOG_STARTING" => "WATCHDOG_STARTING",
        "WATCHDOG_HEALTHY" => "WATCHDOG_HEALTHY",
        "WATCHDOG_RESTARTING" => "WATCHDOG_RESTARTING",
        "WATCHDOG_HEALTH_RECOVERED" => "WATCHDOG_HEALTH_RECOVERED",
        "WATCHDOG_STARTUP_TIMEOUT" => "WATCHDOG_STARTUP_TIMEOUT",
        "WATCHDOG_HEARTBEAT_TIMEOUT" => "WATCHDOG_HEARTBEAT_TIMEOUT",
        "WATCHDOG_INVALID_HEALTH" => "WATCHDOG_INVALID_HEALTH",
        "WATCHDOG_PROCESS_EXIT" => "WATCHDOG_PROCESS_EXIT",
        "WATCHDOG_GPU_RESET" => "WATCHDOG_GPU_RESET",
        "WATCHDOG_OUT_OF_MEMORY" => "WATCHDOG_OUT_OF_MEMORY",
        "WATCHDOG_INTERNAL_FAILURE" => "WATCHDOG_INTERNAL_FAILURE",
        "HOST_RESTARTED_INDETERMINATE" => "HOST_RESTARTED_INDETERMINATE",
        "LAUNCH_STATE_PERSIST_FAILED" => "LAUNCH_STATE_PERSIST_FAILED",
        _ => return None,
    })
}

fn short_request_id(value: &str) -> &str {
    value.get(..8).unwrap_or("invalid")
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, NativeLaunchError> {
    mutex.lock().map_err(|_| NativeLaunchError::StatePoisoned)
}

/// Launch preparation, coordination, or process failure.
#[derive(Debug)]
pub enum NativeLaunchError {
    NoProfiles,
    InvalidProfile(String),
    DuplicateProfile(String),
    InvalidWatchdogGame(String),
    DuplicateWatchdogGame(String),
    WatchdogGameNotInstalled(String),
    WatchdogConfiguration(WatchdogConfigError),
    WatchdogRestartLimit(u32),
    ProfileNotFound(String),
    InvalidGame(String),
    InvalidRequestId(String),
    RequestConflict(String),
    RequestNotFound(String),
    AlreadyRunning(String),
    RecordLimit,
    Replay(String),
    ReplayUnavailable,
    RestartCleanupRequired,
    Catalog(CatalogError),
    RetroArch(RetroArchError),
    Launch(LaunchError),
    Io {
        operation: &'static str,
        source: io::Error,
    },
    StatePoisoned,
}

impl fmt::Display for NativeLaunchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoProfiles => formatter.write_str("at least one host profile ID is required"),
            Self::InvalidProfile(id) => write!(formatter, "profile ID is invalid: {id}"),
            Self::DuplicateProfile(id) => write!(formatter, "profile ID is duplicated: {id}"),
            Self::InvalidWatchdogGame(id) => {
                write!(formatter, "watchdog game ID is invalid: {id}")
            }
            Self::DuplicateWatchdogGame(id) => {
                write!(formatter, "watchdog game ID is duplicated: {id}")
            }
            Self::WatchdogGameNotInstalled(id) => {
                write!(formatter, "watchdog game is not installed: {id}")
            }
            Self::WatchdogConfiguration(error) => error.fmt(formatter),
            Self::WatchdogRestartLimit(restarts) => write!(
                formatter,
                "native launch watchdog restart count {restarts} exceeds {MAX_PERSISTED_WATCHDOG_RESTARTS}"
            ),
            Self::ProfileNotFound(id) => write!(formatter, "profile is not configured: {id}"),
            Self::InvalidGame(id) => write!(formatter, "game ID is invalid: {id}"),
            Self::InvalidRequestId(id) => write!(formatter, "launch request ID is invalid: {id}"),
            Self::RequestConflict(id) => {
                write!(
                    formatter,
                    "launch request ID was reused for different intent: {id}"
                )
            }
            Self::RequestNotFound(id) => write!(formatter, "launch request was not found: {id}"),
            Self::AlreadyRunning(id) => write!(formatter, "game is already running: {id}"),
            Self::RecordLimit => formatter.write_str("launch record limit reached"),
            Self::Replay(error) => write!(formatter, "native launch replay failed: {error}"),
            Self::ReplayUnavailable => {
                formatter.write_str("native launch replay state is unavailable")
            }
            Self::RestartCleanupRequired => formatter
                .write_str("native launch restart cleanup must be proven before another launch"),
            Self::Catalog(error) => write!(formatter, "package resolution failed: {error}"),
            Self::RetroArch(error) => write!(formatter, "RetroArch planning failed: {error}"),
            Self::Launch(error) => write!(formatter, "game process launch failed: {error}"),
            Self::Io { operation, source } => write!(formatter, "{operation} failed: {source}"),
            Self::StatePoisoned => formatter.write_str("launch state is unavailable"),
        }
    }
}

impl std::error::Error for NativeLaunchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Catalog(error) => Some(error),
            Self::RetroArch(error) => Some(error),
            Self::Launch(error) => Some(error),
            Self::WatchdogConfiguration(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

impl From<LaunchReplayError> for NativeLaunchError {
    fn from(error: LaunchReplayError) -> Self {
        Self::Replay(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::thread;
    use std::time::{Duration, Instant};

    use super::{
        MAX_PERSISTED_WATCHDOG_RESTARTS, NativeLaunchError, NativeLaunchService, NativeLaunchState,
        apply_watchdog_event,
    };
    use crate::installed_catalog::tests::{signed_catalog, signed_launch_catalog};
    use crate::process::{WatchdogConfigError, WatchdogEvent, WatchdogPolicy};

    static REPLAY_FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn replay_root() -> PathBuf {
        let sequence = REPLAY_FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "vcg-native-launch-service-replay-{}-{sequence}",
            std::process::id()
        ))
    }

    fn fast_watchdog_policy(max_restarts: u32) -> WatchdogPolicy {
        WatchdogPolicy {
            startup_timeout: Duration::from_millis(100),
            heartbeat_timeout: Duration::from_millis(100),
            poll_interval: Duration::from_millis(1),
            restart_backoff: Duration::ZERO,
            max_restarts,
        }
    }

    #[test]
    fn requires_explicit_unique_host_profile_ids() {
        let (_fixture, catalog) = signed_catalog();
        assert!(matches!(
            NativeLaunchService::new(Arc::new(catalog.clone()), Vec::new()),
            Err(NativeLaunchError::NoProfiles)
        ));
        assert!(matches!(
            NativeLaunchService::new(Arc::new(catalog.clone()), vec!["../escape".to_owned()]),
            Err(NativeLaunchError::InvalidProfile(_))
        ));
        assert!(matches!(
            NativeLaunchService::new(
                Arc::new(catalog),
                vec!["local-player".to_owned(), "local-player".to_owned()]
            ),
            Err(NativeLaunchError::DuplicateProfile(_))
        ));
    }

    #[test]
    fn watchdog_games_are_explicit_validated_catalog_members() {
        let (_fixture, catalog) = signed_catalog();
        assert!(matches!(
            NativeLaunchService::with_watchdog_games(
                Arc::new(catalog.clone()),
                vec!["local-player".to_owned()],
                vec!["unknown-game".to_owned()],
                fast_watchdog_policy(1),
            ),
            Err(NativeLaunchError::WatchdogGameNotInstalled(_))
        ));
        assert!(matches!(
            NativeLaunchService::with_watchdog_games(
                Arc::new(catalog.clone()),
                vec!["local-player".to_owned()],
                vec!["retro-2048".to_owned(), "retro-2048".to_owned()],
                fast_watchdog_policy(1),
            ),
            Err(NativeLaunchError::DuplicateWatchdogGame(_))
        ));
        let mut invalid_policy = fast_watchdog_policy(1);
        invalid_policy.startup_timeout = Duration::ZERO;
        assert!(matches!(
            NativeLaunchService::with_watchdog_games(
                Arc::new(catalog),
                vec!["local-player".to_owned()],
                Vec::new(),
                invalid_policy,
            ),
            Err(NativeLaunchError::WatchdogConfiguration(
                WatchdogConfigError::ZeroDuration("startup timeout")
            ))
        ));
        assert!(matches!(
            NativeLaunchService::with_watchdog_games(
                Arc::new(signed_catalog().1),
                vec!["local-player".to_owned()],
                Vec::new(),
                fast_watchdog_policy(MAX_PERSISTED_WATCHDOG_RESTARTS + 1),
            ),
            Err(NativeLaunchError::WatchdogRestartLimit(_))
        ));
    }

    #[test]
    fn rejects_untrusted_intent_before_process_start() {
        let (_fixture, catalog) = signed_catalog();
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");

        assert!(matches!(
            service.start("not-hex", "retro-2048", "local-player"),
            Err(NativeLaunchError::InvalidRequestId(_))
        ));
        assert!(matches!(
            service.start(
                "00000000000000000000000000000000",
                "../escape",
                "local-player"
            ),
            Err(NativeLaunchError::InvalidGame(_))
        ));
        assert!(matches!(
            service.start(
                "00000000000000000000000000000000",
                "retro-2048",
                "unknown-player"
            ),
            Err(NativeLaunchError::ProfileNotFound(_))
        ));
    }

    #[test]
    fn records_and_replays_a_failed_start_without_reexecuting_it() {
        let (_fixture, catalog) = signed_catalog();
        let generation = catalog.generation();
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");
        let request_id = "11111111111111111111111111111111";

        service
            .reserve(
                request_id,
                "retro-2048",
                "local-player",
                Arc::new(AtomicBool::new(false)),
            )
            .expect("launch reserves");
        assert_eq!(
            service
                .protected_catalog_generations()
                .expect("active generation protection reads"),
            vec![generation]
        );
        let first = service
            .failed_start(request_id, "PROCESS_START_FAILED")
            .expect("reserved request fails terminally");
        assert_eq!(
            first.snapshot.state,
            NativeLaunchState::Failed { exit_code: None }
        );
        assert_eq!(first.snapshot.detail_code, "PROCESS_START_FAILED");
        assert!(!first.replayed);
        assert!(
            service
                .protected_catalog_generations()
                .expect("terminal generation protection reads")
                .is_empty()
        );

        let replay = service
            .start(request_id, "retro-2048", "local-player")
            .expect("identical request replays");
        assert!(replay.replayed);
        assert_eq!(replay.snapshot, first.snapshot);
        assert!(matches!(
            service.start(request_id, "not-installed", "local-player"),
            Err(NativeLaunchError::RequestConflict(_))
        ));
    }

    #[test]
    fn persists_terminal_replay_and_exclusively_locks_the_journal() {
        let (_fixture, catalog) = signed_catalog();
        let catalog = Arc::new(catalog);
        let journal_root = replay_root();
        let request_id = "12121212121212121212121212121212";
        let first_snapshot = {
            let service = NativeLaunchService::with_persistent_replay(
                Arc::clone(&catalog),
                vec!["local-player".to_owned()],
                Vec::new(),
                fast_watchdog_policy(1),
                &journal_root,
            )
            .expect("persistent launch service configures");
            let first = service
                .start(request_id, "retro-2048", "local-player")
                .expect("failed process start records");
            assert_eq!(
                first.snapshot.state,
                NativeLaunchState::Failed { exit_code: None }
            );
            first.snapshot
        };

        {
            let reopened = NativeLaunchService::with_persistent_replay(
                Arc::clone(&catalog),
                vec!["local-player".to_owned()],
                Vec::new(),
                fast_watchdog_policy(1),
                &journal_root,
            )
            .expect("persistent launch service reopens");
            let replay = reopened
                .start(request_id, "retro-2048", "local-player")
                .expect("terminal request replays after restart");
            assert!(replay.replayed);
            assert_eq!(replay.snapshot, first_snapshot);
            assert!(matches!(
                NativeLaunchService::with_persistent_replay(
                    Arc::clone(&catalog),
                    vec!["local-player".to_owned()],
                    Vec::new(),
                    fast_watchdog_policy(1),
                    &journal_root,
                ),
                Err(NativeLaunchError::Replay(_))
            ));
            assert!(matches!(
                reopened.start(request_id, "not-installed", "local-player"),
                Err(NativeLaunchError::RequestConflict(_))
            ));
        }

        fs::remove_dir_all(&journal_root).expect("replay fixture removes");
    }

    #[test]
    fn restart_indeterminate_replay_blocks_fresh_launch_until_trusted_cleanup() {
        let (_fixture, catalog) = signed_catalog();
        let generation = catalog.generation();
        let catalog = Arc::new(catalog);
        let journal_root = replay_root();
        let interrupted_id = "13131313131313131313131313131313";
        let fresh_id = "14141414141414141414141414141414";
        {
            let service = NativeLaunchService::with_persistent_replay(
                Arc::clone(&catalog),
                vec!["local-player".to_owned()],
                Vec::new(),
                fast_watchdog_policy(1),
                &journal_root,
            )
            .expect("persistent launch service configures");
            service
                .reserve(
                    interrupted_id,
                    "retro-2048",
                    "local-player",
                    Arc::new(AtomicBool::new(false)),
                )
                .expect("accepted intent persists before execution");
            assert_eq!(
                service
                    .protected_catalog_generations()
                    .expect("active generation protection reads"),
                vec![generation]
            );
        }

        {
            let reopened = NativeLaunchService::with_persistent_replay(
                Arc::clone(&catalog),
                vec!["local-player".to_owned()],
                Vec::new(),
                fast_watchdog_policy(1),
                &journal_root,
            )
            .expect("interrupted replay state recovers");
            let replay = reopened
                .start(interrupted_id, "retro-2048", "local-player")
                .expect("identical interrupted intent replays");
            assert!(replay.replayed);
            assert_eq!(
                replay.snapshot.state,
                NativeLaunchState::Failed { exit_code: None }
            );
            assert_eq!(replay.snapshot.detail_code, "HOST_RESTARTED_INDETERMINATE");
            assert_eq!(
                reopened
                    .protected_catalog_generations()
                    .expect("indeterminate generation protection reads"),
                vec![generation]
            );
            assert!(matches!(
                reopened.start(fresh_id, "retro-2048", "local-player"),
                Err(NativeLaunchError::RestartCleanupRequired)
            ));
        }

        let reopened = NativeLaunchService::with_persistent_replay(
            Arc::clone(&catalog),
            vec!["local-player".to_owned()],
            Vec::new(),
            fast_watchdog_policy(1),
            &journal_root,
        )
        .expect("cleanup barrier survives another restart");
        assert!(matches!(
            reopened.start(fresh_id, "retro-2048", "local-player"),
            Err(NativeLaunchError::RestartCleanupRequired)
        ));
        reopened
            .acknowledge_restart_cleanup()
            .expect("trusted process cleanup acknowledgement persists");
        assert!(
            reopened
                .protected_catalog_generations()
                .expect("cleared generation protection reads")
                .is_empty()
        );
        let fresh = reopened
            .start(fresh_id, "retro-2048", "local-player")
            .expect("fresh launch is admitted after cleanup proof");
        assert!(!fresh.replayed);
        assert_eq!(
            fresh.snapshot.state,
            NativeLaunchState::Failed { exit_code: None }
        );
        drop(reopened);
        fs::remove_dir_all(&journal_root).expect("replay fixture removes");
    }

    #[test]
    fn persistent_retention_retires_the_oldest_terminal_record() {
        let (_fixture, catalog) = signed_catalog();
        let catalog = Arc::new(catalog);
        let journal_root = replay_root();
        {
            let service = NativeLaunchService::with_persistent_replay(
                Arc::clone(&catalog),
                vec!["local-player".to_owned()],
                Vec::new(),
                fast_watchdog_policy(1),
                &journal_root,
            )
            .expect("persistent launch service configures");
            for ordinal in 1..=65_u128 {
                let request_id = format!("{ordinal:032x}");
                let failed = service
                    .start(&request_id, "not-installed", "local-player")
                    .expect("missing package creates a terminal record");
                assert_eq!(
                    failed.snapshot.state,
                    NativeLaunchState::Failed { exit_code: None }
                );
            }
            assert!(matches!(
                service.status("00000000000000000000000000000001"),
                Err(NativeLaunchError::RequestNotFound(_))
            ));
            assert_eq!(
                service
                    .status("00000000000000000000000000000002")
                    .expect("second retained record remains")
                    .detail_code,
                "PACKAGE_RESOLUTION_FAILED"
            );
        }

        let reopened = NativeLaunchService::with_persistent_replay(
            Arc::clone(&catalog),
            vec!["local-player".to_owned()],
            Vec::new(),
            fast_watchdog_policy(1),
            &journal_root,
        )
        .expect("retired history reopens cleanly");
        let replay = reopened
            .start(
                "00000000000000000000000000000002",
                "not-installed",
                "local-player",
            )
            .expect("retained terminal record replays");
        assert!(replay.replayed);
        drop(reopened);
        fs::remove_dir_all(&journal_root).expect("replay fixture removes");
    }

    #[test]
    fn persistence_failure_cancels_the_owned_launch_and_fails_closed() {
        let (_fixture, catalog) = signed_catalog();
        let journal_root = replay_root();
        let request_id = "15151515151515151515151515151515";
        let service = NativeLaunchService::with_persistent_replay(
            Arc::new(catalog),
            vec!["local-player".to_owned()],
            Vec::new(),
            fast_watchdog_policy(1),
            &journal_root,
        )
        .expect("persistent launch service configures");
        let cancel = Arc::new(AtomicBool::new(false));
        service
            .reserve(
                request_id,
                "retro-2048",
                "local-player",
                Arc::clone(&cancel),
            )
            .expect("accepted intent persists");

        let record_directory = fs::read_dir(journal_root.join("active"))
            .expect("active replay directory reads")
            .next()
            .expect("accepted replay record exists")
            .expect("accepted replay record reads")
            .path();
        fs::remove_dir_all(record_directory).expect("fault injection removes record storage");

        apply_watchdog_event(
            &service.shared,
            request_id,
            &WatchdogEvent::Started {
                attempt: 1,
                process_id: 7,
            },
        );

        assert!(cancel.load(Ordering::Acquire));
        let snapshot = service
            .status(request_id)
            .expect("failure remains observable");
        assert_eq!(
            snapshot.state,
            NativeLaunchState::Failed { exit_code: None }
        );
        assert_eq!(snapshot.detail_code, "LAUNCH_STATE_PERSIST_FAILED");
        assert!(matches!(
            service.start(
                "16161616161616161616161616161616",
                "retro-2048",
                "local-player"
            ),
            Err(NativeLaunchError::ReplayUnavailable)
        ));

        drop(service);
        fs::remove_dir_all(&journal_root).expect("replay fixture removes");
    }

    #[test]
    fn starts_and_observes_only_the_catalog_resolved_process() {
        let (_fixture, catalog) = signed_launch_catalog();
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");
        let request_id = "22222222222222222222222222222222";
        let started = service
            .start(request_id, "retro-2048", "local-player")
            .expect("signed package process starts");
        assert_eq!(started.snapshot.state, NativeLaunchState::Running);
        assert_eq!(started.snapshot.detail_code, "PROCESS_STARTED");

        let deadline = Instant::now() + Duration::from_secs(5);
        let terminal = loop {
            let snapshot = service
                .status(request_id)
                .expect("launch remains observable");
            if !matches!(
                snapshot.state,
                NativeLaunchState::Preparing
                    | NativeLaunchState::Running
                    | NativeLaunchState::Stopping
            ) {
                break snapshot;
            }
            assert!(
                Instant::now() < deadline,
                "copied test process did not exit"
            );
            thread::sleep(Duration::from_millis(20));
        };
        assert!(matches!(
            terminal.state,
            NativeLaunchState::Completed { .. } | NativeLaunchState::Failed { .. }
        ));
        assert!(terminal.sequence >= 3);
    }

    #[test]
    fn watchdog_game_restarts_and_reports_a_catalog_resolved_child_failure() {
        let (_fixture, catalog) = signed_launch_catalog();
        let service = NativeLaunchService::with_watchdog_games(
            Arc::new(catalog),
            vec!["local-player".to_owned(), "profile-guest".to_owned()],
            vec!["retro-2048".to_owned()],
            fast_watchdog_policy(1),
        )
        .expect("watchdog launch service configures");
        let request_id = "44444444444444444444444444444444";
        let started = service
            .start(request_id, "retro-2048", "profile-guest")
            .expect("watchdog worker is accepted");
        assert_eq!(started.snapshot.state, NativeLaunchState::Preparing);
        assert_eq!(started.snapshot.sequence, 2);
        assert_eq!(started.snapshot.detail_code, "WATCHDOG_STARTING");
        assert_eq!(started.snapshot.profile_id, "profile-guest");

        let deadline = Instant::now() + Duration::from_secs(5);
        let terminal = loop {
            let snapshot = service
                .status(request_id)
                .expect("supervised launch remains observable");
            if !snapshot.state.active() {
                break snapshot;
            }
            assert!(
                Instant::now() < deadline,
                "watchdog launch did not reach a terminal state"
            );
            thread::sleep(Duration::from_millis(10));
        };
        assert!(matches!(
            terminal.state,
            NativeLaunchState::Failed { exit_code: Some(_) }
        ));
        assert_eq!(terminal.detail_code, "WATCHDOG_PROCESS_EXIT");
        assert!(
            terminal.sequence >= 6,
            "one bounded restart must be observable"
        );
    }

    #[test]
    fn cancellation_is_idempotent_and_advances_the_bounded_lifecycle() {
        let (_fixture, catalog) = signed_catalog();
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");
        let request_id = "33333333333333333333333333333333";
        service
            .reserve(
                request_id,
                "retro-2048",
                "local-player",
                Arc::new(std::sync::atomic::AtomicBool::new(false)),
            )
            .expect("launch reserves");

        let first = service.cancel(request_id).expect("cancel is accepted");
        assert_eq!(first.state, NativeLaunchState::Stopping);
        assert_eq!(first.sequence, 2);
        assert_eq!(first.detail_code, "CANCEL_REQUESTED");
        let replay = service.cancel(request_id).expect("cancel replays");
        assert_eq!(replay, first);
        let terminal = service
            .cancelled_start(request_id)
            .expect("cancel completes")
            .snapshot;
        assert_eq!(terminal.state, NativeLaunchState::Cancelled);
        assert_eq!(terminal.sequence, 3);
        assert_eq!(terminal.detail_code, "PROCESS_CANCELLED");
    }

    #[test]
    fn accepted_watchdog_cancellation_cannot_regress_to_running_or_completed() {
        let (_fixture, catalog) = signed_catalog();
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");
        let request_id = "55555555555555555555555555555555";
        let cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
        service
            .reserve(
                request_id,
                "retro-2048",
                "local-player",
                Arc::clone(&cancel),
            )
            .expect("launch reserves");
        service.cancel(request_id).expect("cancel is accepted");

        apply_watchdog_event(
            &service.shared,
            request_id,
            &WatchdogEvent::Started {
                attempt: 1,
                process_id: 7,
            },
        );
        assert_eq!(
            service.status(request_id).expect("status remains").state,
            NativeLaunchState::Stopping
        );
        apply_watchdog_event(
            &service.shared,
            request_id,
            &WatchdogEvent::Completed {
                attempt: 1,
                exit_code: Some(0),
                recovered: false,
            },
        );
        let terminal = service.status(request_id).expect("terminal remains");
        assert_eq!(terminal.state, NativeLaunchState::Cancelled);
        assert_eq!(terminal.detail_code, "PROCESS_CANCELLED");
    }

    #[test]
    fn watchdog_events_advance_one_bounded_launch_record_without_claiming_readiness() {
        let (_fixture, catalog) = signed_catalog();
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");
        let request_id = "66666666666666666666666666666666";
        service
            .reserve(
                request_id,
                "retro-2048",
                "local-player",
                Arc::new(std::sync::atomic::AtomicBool::new(false)),
            )
            .expect("launch reserves");

        let events = [
            WatchdogEvent::Started {
                attempt: 1,
                process_id: 7,
            },
            WatchdogEvent::Ready {
                attempt: 1,
                recovered: false,
            },
            WatchdogEvent::Restarting {
                attempt: 1,
                next_attempt: 2,
                reason: crate::process::WatchdogReason::HeartbeatTimeout,
            },
            WatchdogEvent::Started {
                attempt: 2,
                process_id: 8,
            },
            WatchdogEvent::Ready {
                attempt: 2,
                recovered: true,
            },
            WatchdogEvent::Completed {
                attempt: 2,
                exit_code: Some(0),
                recovered: true,
            },
        ];
        let expected_codes = [
            "PROCESS_STARTED",
            "WATCHDOG_HEALTHY",
            "WATCHDOG_RESTARTING",
            "PROCESS_RESTARTED",
            "WATCHDOG_HEALTH_RECOVERED",
            "PROCESS_COMPLETED",
        ];
        for (index, (event, expected_code)) in events.iter().zip(expected_codes).enumerate() {
            apply_watchdog_event(&service.shared, request_id, event);
            let snapshot = service.status(request_id).expect("status remains");
            assert_eq!(snapshot.sequence, u64::try_from(index).unwrap() + 2);
            assert_eq!(snapshot.detail_code, expected_code);
        }
        assert_eq!(
            service.status(request_id).expect("terminal remains").state,
            NativeLaunchState::Completed { exit_code: Some(0) }
        );
    }
}
