//! Host-owned package launch coordination for authenticated launcher intents.

use std::collections::{HashSet, VecDeque};
use std::fmt;
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::installed_catalog::{
    CatalogError, ResolvedPackage, TrustedPackageCatalog, validate_intent_id,
};
use crate::process::{
    ControlledWatchdogOutcome, FileHealthProbe, LaunchError, ProcessSupervisor,
    WatchdogConfigError, WatchdogError, WatchdogEvent, WatchdogPolicy, WatchdogReason,
};
use crate::retroarch::{RetroArchError, RetroArchPlan, plan as plan_retroarch};

const MAX_LAUNCH_RECORDS: usize = 64;
const MONITOR_INTERVAL: Duration = Duration::from_millis(50);
const REQUEST_ID_HEX_BYTES: usize = 16;

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
    request_id: String,
    game_id: String,
    profile_id: String,
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
}

#[derive(Debug, Default)]
struct SharedLaunches {
    records: VecDeque<LaunchRecord>,
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
        Ok(Self {
            catalog,
            allowed_profiles,
            watchdog_games,
            watchdog_policy,
            shared: Arc::new(Mutex::new(SharedLaunches::default())),
            stop: Arc::new(AtomicBool::new(false)),
            workers: Mutex::new(Vec::new()),
        })
    }

    #[must_use]
    pub fn catalog(&self) -> &TrustedPackageCatalog {
        &self.catalog
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
            self.activate_process(request_id, game_id, profile_id, &plan, cancel)
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
        if let Some(active) = shared.records.iter().find(|record| record.state.active()) {
            return Err(NativeLaunchError::AlreadyRunning(active.game_id.clone()));
        }
        prune_records(&mut shared.records);
        if shared.records.len() >= MAX_LAUNCH_RECORDS {
            return Err(NativeLaunchError::RecordLimit);
        }
        shared.records.push_back(LaunchRecord {
            request_id: request_id.to_owned(),
            game_id: game_id.to_owned(),
            profile_id: profile_id.to_owned(),
            state: NativeLaunchState::Preparing,
            sequence: 1,
            detail_code: "PACKAGE_RESOLVING",
            cancel,
        });
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
        game_id: &str,
        profile_id: &str,
        plan: &RetroArchPlan,
        cancel: Arc<AtomicBool>,
    ) -> Result<NativeLaunchStart, NativeLaunchError> {
        let Ok(mut child) = ProcessSupervisor.launch(plan.launch()) else {
            return self.failed_start(request_id, "PROCESS_START_FAILED");
        };
        {
            let mut shared = lock(&self.shared)?;
            let Some(record) = shared
                .records
                .iter_mut()
                .find(|record| record.request_id == request_id)
            else {
                let _ = child.terminate();
                return Err(NativeLaunchError::RequestNotFound(request_id.to_owned()));
            };
            if record.cancel.load(Ordering::Acquire) {
                let _ = child.terminate();
                record.state = NativeLaunchState::Cancelled;
                record.sequence += 1;
                record.detail_code = "PROCESS_CANCELLED";
                return Ok(NativeLaunchStart {
                    snapshot: record.snapshot(),
                    replayed: false,
                });
            }
            record.state = NativeLaunchState::Running;
            record.sequence += 1;
            record.detail_code = "PROCESS_STARTED";
        }

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
            snapshot: NativeLaunchSnapshot {
                request_id: request_id.to_owned(),
                game_id: game_id.to_owned(),
                profile_id: profile_id.to_owned(),
                state: NativeLaunchState::Running,
                sequence: 2,
                detail_code: "PROCESS_STARTED",
            },
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
            let record = shared
                .records
                .iter_mut()
                .find(|record| record.request_id == request_id)
                .ok_or_else(|| NativeLaunchError::RequestNotFound(request_id.to_owned()))?;
            record.sequence += 1;
            if record.cancel.load(Ordering::Acquire) {
                record.state = NativeLaunchState::Cancelled;
                record.detail_code = "PROCESS_CANCELLED";
            } else {
                record.detail_code = "WATCHDOG_STARTING";
            }
            record.snapshot()
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
        let record = shared
            .records
            .iter_mut()
            .find(|record| record.request_id == request_id)
            .ok_or_else(|| NativeLaunchError::RequestNotFound(request_id.to_owned()))?;
        if matches!(
            record.state,
            NativeLaunchState::Preparing | NativeLaunchState::Running
        ) {
            record.cancel.store(true, Ordering::Release);
            record.state = NativeLaunchState::Stopping;
            record.sequence += 1;
            record.detail_code = "CANCEL_REQUESTED";
        }
        Ok(record.snapshot())
    }

    fn failed_start(
        &self,
        request_id: &str,
        detail_code: &'static str,
    ) -> Result<NativeLaunchStart, NativeLaunchError> {
        update_state(
            &self.shared,
            request_id,
            NativeLaunchState::Failed { exit_code: None },
            detail_code,
        );
        Ok(NativeLaunchStart {
            snapshot: self.status(request_id)?,
            replayed: false,
        })
    }

    fn cancelled_start(&self, request_id: &str) -> Result<NativeLaunchStart, NativeLaunchError> {
        update_state(
            &self.shared,
            request_id,
            NativeLaunchState::Cancelled,
            "PROCESS_CANCELLED",
        );
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
    let Some(record) = shared
        .records
        .iter_mut()
        .find(|record| record.request_id == request_id)
    else {
        return;
    };
    if record.cancel.load(Ordering::Acquire) && !matches!(event, WatchdogEvent::Cancelled { .. }) {
        if matches!(
            event,
            WatchdogEvent::Completed { .. } | WatchdogEvent::Failed { .. }
        ) {
            record.state = NativeLaunchState::Cancelled;
            record.sequence += 1;
            record.detail_code = "PROCESS_CANCELLED";
        }
        return;
    }
    match event {
        WatchdogEvent::Started { attempt, .. } => {
            record.state = NativeLaunchState::Running;
            record.sequence += 1;
            record.detail_code = if *attempt == 1 {
                "PROCESS_STARTED"
            } else {
                "PROCESS_RESTARTED"
            };
        }
        WatchdogEvent::Ready { recovered, .. } => {
            record.state = NativeLaunchState::Running;
            record.sequence += 1;
            record.detail_code = if *recovered {
                "WATCHDOG_HEALTH_RECOVERED"
            } else {
                "WATCHDOG_HEALTHY"
            };
        }
        WatchdogEvent::Restarting { .. } => {
            record.state = NativeLaunchState::Running;
            record.sequence += 1;
            record.detail_code = "WATCHDOG_RESTARTING";
        }
        WatchdogEvent::Completed { exit_code, .. } => {
            record.state = NativeLaunchState::Completed {
                exit_code: *exit_code,
            };
            record.sequence += 1;
            record.detail_code = "PROCESS_COMPLETED";
        }
        WatchdogEvent::Failed { reason, .. } => {
            record.state = NativeLaunchState::Failed {
                exit_code: watchdog_exit_code(reason),
            };
            record.sequence += 1;
            record.detail_code = watchdog_failure_code(reason);
        }
        WatchdogEvent::Cancelled { .. } => {
            record.state = NativeLaunchState::Cancelled;
            record.sequence += 1;
            record.detail_code = "PROCESS_CANCELLED";
        }
    }
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
    if let Ok(mut shared) = shared.lock()
        && let Some(record) = shared
            .records
            .iter_mut()
            .find(|record| record.request_id == request_id)
    {
        record.state = state;
        record.sequence += 1;
        record.detail_code = detail_code;
    }
}

fn prune_records(records: &mut VecDeque<LaunchRecord>) {
    while records.len() >= MAX_LAUNCH_RECORDS {
        let Some(index) = records.iter().position(|record| !record.state.active()) else {
            break;
        };
        records.remove(index);
    }
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
    ProfileNotFound(String),
    InvalidGame(String),
    InvalidRequestId(String),
    RequestConflict(String),
    RequestNotFound(String),
    AlreadyRunning(String),
    RecordLimit,
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::thread;
    use std::time::{Duration, Instant};

    use super::{NativeLaunchError, NativeLaunchService, NativeLaunchState, apply_watchdog_event};
    use crate::installed_catalog::tests::{signed_catalog, signed_launch_catalog};
    use crate::process::{WatchdogConfigError, WatchdogEvent, WatchdogPolicy};

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
        let service = NativeLaunchService::new(Arc::new(catalog), vec!["local-player".to_owned()])
            .expect("launch service configures");
        let request_id = "11111111111111111111111111111111";

        let first = service
            .start(request_id, "retro-2048", "local-player")
            .expect("validated request receives a lifecycle record");
        assert_eq!(
            first.snapshot.state,
            NativeLaunchState::Failed { exit_code: None }
        );
        assert_eq!(first.snapshot.detail_code, "PROCESS_START_FAILED");
        assert!(!first.replayed);

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
