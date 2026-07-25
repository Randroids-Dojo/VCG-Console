//! Direct child-process supervision without shell interpretation.

use std::ffi::{OsStr, OsString};
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus};
use std::thread;
use std::time::{Duration, Instant};

const MAX_PROBE_BYTES: u64 = 4_096;

/// Validated process launch parameters.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LaunchSpec {
    program: PathBuf,
    args: Vec<OsString>,
    current_dir: Option<PathBuf>,
    environment: Vec<(OsString, OsString)>,
}

impl LaunchSpec {
    /// Creates a direct executable launch. Arguments are never interpreted by a shell.
    ///
    /// # Errors
    ///
    /// Returns [`LaunchError::EmptyProgram`] when the executable path is empty.
    pub fn new(program: impl Into<PathBuf>) -> Result<Self, LaunchError> {
        let program = program.into();
        if program.as_os_str().is_empty() {
            return Err(LaunchError::EmptyProgram);
        }

        Ok(Self {
            program,
            args: Vec::new(),
            current_dir: None,
            environment: Vec::new(),
        })
    }

    #[must_use]
    pub fn args(mut self, args: impl IntoIterator<Item = impl Into<OsString>>) -> Self {
        self.args.extend(args.into_iter().map(Into::into));
        self
    }

    #[must_use]
    pub fn current_dir(mut self, directory: impl Into<PathBuf>) -> Self {
        self.current_dir = Some(directory.into());
        self
    }

    #[must_use]
    pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
        self.environment.push((key.into(), value.into()));
        self
    }

    #[must_use]
    pub fn program(&self) -> &Path {
        &self.program
    }

    pub fn arguments(&self) -> impl Iterator<Item = &OsStr> {
        self.args.iter().map(OsString::as_os_str)
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        command.envs(self.environment.iter().map(|(key, value)| (key, value)));
        if let Some(directory) = &self.current_dir {
            command.current_dir(directory);
        }
        command
    }
}

/// Error produced before or while starting a supervised process.
#[derive(Debug)]
pub enum LaunchError {
    EmptyProgram,
    Spawn { program: PathBuf, source: io::Error },
}

impl fmt::Display for LaunchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyProgram => formatter.write_str("program path must not be empty"),
            Self::Spawn { program, source } => {
                write!(formatter, "failed to start {}: {source}", program.display())
            }
        }
    }
}

impl std::error::Error for LaunchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::EmptyProgram => None,
            Self::Spawn { source, .. } => Some(source),
        }
    }
}

/// Starts processes under the host's lifecycle ownership.
#[derive(Debug, Default)]
pub struct ProcessSupervisor;

#[derive(Debug)]
enum AttemptResult {
    Completed(ExitStatus),
    Recover(WatchdogReason),
    Cancelled,
}

impl ProcessSupervisor {
    /// Starts a child and transfers its lifecycle ownership to a managed handle.
    ///
    /// # Errors
    ///
    /// Returns [`LaunchError::Spawn`] when the operating system cannot start the child.
    pub fn launch(&self, spec: &LaunchSpec) -> Result<ManagedChild, LaunchError> {
        let child = spec
            .command()
            .spawn()
            .map_err(|source| LaunchError::Spawn {
                program: spec.program.clone(),
                source,
            })?;

        Ok(ManagedChild {
            child,
            reaped: false,
        })
    }

    /// Runs a child under heartbeat and resource-fault supervision.
    ///
    /// A failed child is force-reaped before a bounded restart. A successful
    /// exit completes immediately, even when no heartbeat was observed.
    ///
    /// # Errors
    ///
    /// Returns an error when the child cannot launch, the probe or process
    /// cannot be inspected, or the configured recovery budget is exhausted.
    pub fn watch<P, F>(
        &self,
        spec: &LaunchSpec,
        policy: &WatchdogPolicy,
        probe: P,
        emit: F,
    ) -> Result<WatchdogOutcome, WatchdogError>
    where
        P: HealthProbe,
        F: FnMut(&WatchdogEvent),
    {
        match self.watch_controlled(spec, policy, probe, emit, || false)? {
            ControlledWatchdogOutcome::Completed(outcome) => Ok(outcome),
            ControlledWatchdogOutcome::Cancelled { .. } => {
                unreachable!("an uncontrolled watchdog cannot be cancelled")
            }
        }
    }

    /// Runs a child under bounded supervision while observing a host-owned
    /// cancellation signal.
    ///
    /// Cancellation always terminates and reaps the current direct child. It
    /// also interrupts restart backoff and prevents another attempt from
    /// starting.
    ///
    /// # Errors
    ///
    /// Returns an error when the child cannot launch, the probe or process
    /// cannot be inspected, or the configured recovery budget is exhausted.
    pub fn watch_controlled<P, F, C>(
        &self,
        spec: &LaunchSpec,
        policy: &WatchdogPolicy,
        probe: P,
        emit: F,
        cancelled: C,
    ) -> Result<ControlledWatchdogOutcome, WatchdogError>
    where
        P: HealthProbe,
        F: FnMut(&WatchdogEvent),
        C: FnMut() -> bool,
    {
        Self::watch_controlled_with_launcher(spec, policy, probe, emit, cancelled, |launch_spec| {
            self.launch(launch_spec).map(Some)
        })
    }

    /// Runs a cancellation-aware watchdog with a host-owned atomic launch
    /// boundary.
    ///
    /// Returning `Ok(None)` from `launch_child` cancels before a new process is
    /// started. The native launcher uses this to serialize each watchdog start
    /// against privileged power admission closure.
    pub(crate) fn watch_controlled_with_launcher<P, F, C, L>(
        spec: &LaunchSpec,
        policy: &WatchdogPolicy,
        mut probe: P,
        mut emit: F,
        mut cancelled: C,
        mut launch_child: L,
    ) -> Result<ControlledWatchdogOutcome, WatchdogError>
    where
        P: HealthProbe,
        F: FnMut(&WatchdogEvent),
        C: FnMut() -> bool,
        L: FnMut(&LaunchSpec) -> Result<Option<ManagedChild>, LaunchError>,
    {
        policy.validate().map_err(WatchdogError::Configuration)?;
        let mut attempt = 0;

        loop {
            if cancelled() {
                emit(&WatchdogEvent::Cancelled { attempt });
                return Ok(ControlledWatchdogOutcome::Cancelled { attempts: attempt });
            }
            attempt += 1;
            probe.reset().map_err(|source| WatchdogError::Io {
                operation: "reset health probe",
                source,
            })?;
            if cancelled() {
                emit(&WatchdogEvent::Cancelled {
                    attempt: attempt - 1,
                });
                return Ok(ControlledWatchdogOutcome::Cancelled {
                    attempts: attempt - 1,
                });
            }
            let Some(mut child) = launch_child(spec).map_err(WatchdogError::Launch)? else {
                emit(&WatchdogEvent::Cancelled {
                    attempt: attempt - 1,
                });
                return Ok(ControlledWatchdogOutcome::Cancelled {
                    attempts: attempt - 1,
                });
            };
            emit(&WatchdogEvent::Started {
                attempt,
                process_id: child.id(),
            });
            match Self::monitor_attempt(
                &mut child,
                policy,
                &mut probe,
                &mut emit,
                &mut cancelled,
                attempt,
            )? {
                AttemptResult::Completed(status) => {
                    emit(&WatchdogEvent::Completed {
                        attempt,
                        exit_code: status.code(),
                        recovered: attempt > 1,
                    });
                    return Ok(ControlledWatchdogOutcome::Completed(WatchdogOutcome {
                        status,
                        attempts: attempt,
                        recovered: attempt > 1,
                    }));
                }
                AttemptResult::Recover(reason) => {
                    Self::recover_or_fail(&mut emit, policy, attempt, reason)?;
                    if wait_for_restart_or_cancel(
                        policy.restart_backoff,
                        policy.poll_interval,
                        &mut cancelled,
                    ) {
                        emit(&WatchdogEvent::Cancelled { attempt });
                        return Ok(ControlledWatchdogOutcome::Cancelled { attempts: attempt });
                    }
                }
                AttemptResult::Cancelled => {
                    emit(&WatchdogEvent::Cancelled { attempt });
                    return Ok(ControlledWatchdogOutcome::Cancelled { attempts: attempt });
                }
            }
        }
    }

    fn monitor_attempt<P, F, C>(
        child: &mut ManagedChild,
        policy: &WatchdogPolicy,
        probe: &mut P,
        emit: &mut F,
        cancelled: &mut C,
        attempt: u32,
    ) -> Result<AttemptResult, WatchdogError>
    where
        P: HealthProbe,
        F: FnMut(&WatchdogEvent),
        C: FnMut() -> bool,
    {
        let started_at = Instant::now();
        let mut last_heartbeat_at = started_at;
        let mut ready = false;

        loop {
            if cancelled() {
                child.terminate().map_err(|source| WatchdogError::Io {
                    operation: "terminate cancelled child",
                    source,
                })?;
                return Ok(AttemptResult::Cancelled);
            }
            if let Some(status) = child.try_wait().map_err(|source| WatchdogError::Io {
                operation: "inspect child status",
                source,
            })? {
                return Ok(if status.success() {
                    AttemptResult::Completed(status)
                } else {
                    AttemptResult::Recover(WatchdogReason::ProcessExit {
                        exit_code: status.code(),
                    })
                });
            }

            let now = Instant::now();
            let signal = match probe.poll() {
                Ok(signal) => signal,
                Err(source) if source.kind() == io::ErrorKind::InvalidData => {
                    child.terminate().map_err(|source| WatchdogError::Io {
                        operation: "terminate child with invalid probe data",
                        source,
                    })?;
                    return Ok(AttemptResult::Recover(WatchdogReason::InvalidProbeData));
                }
                Err(source) => {
                    return Err(WatchdogError::Io {
                        operation: "poll health probe",
                        source,
                    });
                }
            };
            let reason = match signal {
                HealthSignal::Quiet
                    if ready
                        && now.duration_since(last_heartbeat_at) >= policy.heartbeat_timeout =>
                {
                    Some(WatchdogReason::HeartbeatTimeout)
                }
                HealthSignal::Quiet
                    if !ready && now.duration_since(started_at) >= policy.startup_timeout =>
                {
                    Some(WatchdogReason::StartupTimeout)
                }
                HealthSignal::Quiet => None,
                HealthSignal::Heartbeat => {
                    last_heartbeat_at = now;
                    if !ready {
                        ready = true;
                        emit(&WatchdogEvent::Ready {
                            attempt,
                            recovered: attempt > 1,
                        });
                    }
                    None
                }
                HealthSignal::ResourceFault(fault) => Some(WatchdogReason::ResourceFault(fault)),
            };

            if let Some(reason) = reason {
                child.terminate().map_err(|source| WatchdogError::Io {
                    operation: "terminate unhealthy child",
                    source,
                })?;
                return Ok(AttemptResult::Recover(reason));
            }
            thread::sleep(policy.poll_interval);
        }
    }

    fn recover_or_fail<F>(
        emit: &mut F,
        policy: &WatchdogPolicy,
        attempt: u32,
        reason: WatchdogReason,
    ) -> Result<(), WatchdogError>
    where
        F: FnMut(&WatchdogEvent),
    {
        if attempt <= policy.max_restarts {
            emit(&WatchdogEvent::Restarting {
                attempt,
                next_attempt: attempt + 1,
                reason,
            });
            Ok(())
        } else {
            emit(&WatchdogEvent::Failed {
                attempts: attempt,
                reason: reason.clone(),
            });
            Err(WatchdogError::RecoveryExhausted {
                reason,
                attempts: attempt,
            })
        }
    }
}

fn wait_for_restart_or_cancel<C>(
    duration: Duration,
    poll_interval: Duration,
    cancelled: &mut C,
) -> bool
where
    C: FnMut() -> bool,
{
    let deadline = Instant::now() + duration;
    loop {
        if cancelled() {
            return true;
        }
        let now = Instant::now();
        if now >= deadline {
            return false;
        }
        thread::sleep((deadline - now).min(poll_interval));
    }
}

/// Bounded recovery policy for one supervised child.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WatchdogPolicy {
    pub startup_timeout: Duration,
    pub heartbeat_timeout: Duration,
    pub poll_interval: Duration,
    pub restart_backoff: Duration,
    pub max_restarts: u32,
}

impl WatchdogPolicy {
    #[must_use]
    pub fn local_game_defaults() -> Self {
        Self {
            startup_timeout: Duration::from_secs(15),
            heartbeat_timeout: Duration::from_secs(8),
            poll_interval: Duration::from_millis(100),
            restart_backoff: Duration::from_millis(250),
            max_restarts: 1,
        }
    }

    /// Confirms all time-based polling gates are non-zero.
    ///
    /// # Errors
    ///
    /// Returns [`WatchdogConfigError::ZeroDuration`] for an unusable duration.
    pub fn validate(&self) -> Result<(), WatchdogConfigError> {
        for (name, value) in [
            ("startup timeout", self.startup_timeout),
            ("heartbeat timeout", self.heartbeat_timeout),
            ("poll interval", self.poll_interval),
        ] {
            if value.is_zero() {
                return Err(WatchdogConfigError::ZeroDuration(name));
            }
        }
        Ok(())
    }
}

/// Invalid watchdog configuration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WatchdogConfigError {
    ZeroDuration(&'static str),
    DuplicateProbePath,
}

impl fmt::Display for WatchdogConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ZeroDuration(name) => write!(formatter, "{name} must be greater than zero"),
            Self::DuplicateProbePath => {
                formatter.write_str("heartbeat and fault files must use different paths")
            }
        }
    }
}

impl std::error::Error for WatchdogConfigError {}

/// Resource failures reported by a narrow operating-system adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResourceFault {
    GpuReset,
    OutOfMemory,
}

impl fmt::Display for ResourceFault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::GpuReset => formatter.write_str("gpu-reset"),
            Self::OutOfMemory => formatter.write_str("out-of-memory"),
        }
    }
}

/// One health observation from the child or operating-system adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HealthSignal {
    Quiet,
    Heartbeat,
    ResourceFault(ResourceFault),
}

/// Resettable health source used by the watchdog for each launch attempt.
pub trait HealthProbe {
    /// Removes stale attempt state before the child starts.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when stale state cannot be cleared.
    fn reset(&mut self) -> io::Result<()>;

    /// Reports a heartbeat, resource fault, or no new signal.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when current health state cannot be read safely.
    fn poll(&mut self) -> io::Result<HealthSignal>;
}

/// File-backed heartbeat and resource-fault boundary for wrapper processes.
#[derive(Clone, Debug)]
pub struct FileHealthProbe {
    heartbeat_path: PathBuf,
    fault_path: Option<PathBuf>,
    last_heartbeat: Option<Vec<u8>>,
}

impl FileHealthProbe {
    /// Creates a probe with distinct host-owned heartbeat and fault files.
    ///
    /// # Errors
    ///
    /// Returns [`WatchdogConfigError::DuplicateProbePath`] when both signals
    /// would race through the same file.
    pub fn new(
        heartbeat_path: impl Into<PathBuf>,
        fault_path: Option<PathBuf>,
    ) -> Result<Self, WatchdogConfigError> {
        let heartbeat_path = heartbeat_path.into();
        if fault_path.as_ref() == Some(&heartbeat_path) {
            return Err(WatchdogConfigError::DuplicateProbePath);
        }
        Ok(Self {
            heartbeat_path,
            fault_path,
            last_heartbeat: None,
        })
    }

    #[must_use]
    pub fn heartbeat_path(&self) -> &Path {
        &self.heartbeat_path
    }

    #[must_use]
    pub fn fault_path(&self) -> Option<&Path> {
        self.fault_path.as_deref()
    }

    fn clear(path: &Path) -> io::Result<()> {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    fn read_bounded(path: &Path) -> io::Result<Vec<u8>> {
        let mut bytes = Vec::new();
        File::open(path)?
            .take(MAX_PROBE_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_PROBE_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "health probe file exceeds 4096 bytes",
            ));
        }
        Ok(bytes)
    }
}

impl HealthProbe for FileHealthProbe {
    fn reset(&mut self) -> io::Result<()> {
        Self::clear(&self.heartbeat_path)?;
        if let Some(path) = &self.fault_path {
            Self::clear(path)?;
        }
        self.last_heartbeat = None;
        Ok(())
    }

    fn poll(&mut self) -> io::Result<HealthSignal> {
        if let Some(path) = &self.fault_path {
            match Self::read_bounded(path) {
                Ok(bytes) => {
                    let value = String::from_utf8(bytes)
                        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
                    return match value.trim() {
                        "gpu-reset" => Ok(HealthSignal::ResourceFault(ResourceFault::GpuReset)),
                        "out-of-memory" => {
                            Ok(HealthSignal::ResourceFault(ResourceFault::OutOfMemory))
                        }
                        _ => Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            "unknown resource fault signal",
                        )),
                    };
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
        }

        match Self::read_bounded(&self.heartbeat_path) {
            Ok(bytes) if self.last_heartbeat.as_ref() != Some(&bytes) => {
                let value = std::str::from_utf8(&bytes)
                    .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
                if value.trim().is_empty() {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "heartbeat must contain a non-empty UTF-8 value",
                    ));
                }
                self.last_heartbeat = Some(bytes);
                Ok(HealthSignal::Heartbeat)
            }
            Ok(_) => Ok(HealthSignal::Quiet),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(HealthSignal::Quiet),
            Err(error) => Err(error),
        }
    }
}

/// Why a running game was stopped or restarted.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WatchdogReason {
    StartupTimeout,
    HeartbeatTimeout,
    InvalidProbeData,
    ProcessExit { exit_code: Option<i32> },
    ResourceFault(ResourceFault),
}

impl fmt::Display for WatchdogReason {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::StartupTimeout => formatter.write_str("startup-timeout"),
            Self::HeartbeatTimeout => formatter.write_str("heartbeat-timeout"),
            Self::InvalidProbeData => formatter.write_str("invalid-probe-data"),
            Self::ProcessExit {
                exit_code: Some(code),
            } => write!(formatter, "process-exit-{code}"),
            Self::ProcessExit { exit_code: None } => formatter.write_str("process-exit-signal"),
            Self::ResourceFault(fault) => fault.fmt(formatter),
        }
    }
}

/// Observable lifecycle event emitted by the native watchdog.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WatchdogEvent {
    Started {
        attempt: u32,
        process_id: u32,
    },
    Ready {
        attempt: u32,
        recovered: bool,
    },
    Restarting {
        attempt: u32,
        next_attempt: u32,
        reason: WatchdogReason,
    },
    Completed {
        attempt: u32,
        exit_code: Option<i32>,
        recovered: bool,
    },
    Failed {
        attempts: u32,
        reason: WatchdogReason,
    },
    Cancelled {
        attempt: u32,
    },
}

impl fmt::Display for WatchdogEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Started {
                attempt,
                process_id,
            } => write!(
                formatter,
                "watchdog:started attempt={attempt} pid={process_id}"
            ),
            Self::Ready { attempt, recovered } => {
                write!(
                    formatter,
                    "watchdog:ready attempt={attempt} recovered={recovered}"
                )
            }
            Self::Restarting {
                attempt,
                next_attempt,
                reason,
            } => write!(
                formatter,
                "watchdog:restarting attempt={attempt} next_attempt={next_attempt} reason={reason}"
            ),
            Self::Completed {
                attempt,
                exit_code,
                recovered,
            } => write!(
                formatter,
                "watchdog:completed attempt={attempt} exit_code={} recovered={recovered}",
                exit_code.map_or_else(|| "signal".to_owned(), |code| code.to_string())
            ),
            Self::Failed { attempts, reason } => {
                write!(
                    formatter,
                    "watchdog:failed attempts={attempts} reason={reason}"
                )
            }
            Self::Cancelled { attempt } => {
                write!(formatter, "watchdog:cancelled attempt={attempt}")
            }
        }
    }
}

/// Terminal result from a cancellation-aware watchdog run.
#[derive(Debug)]
pub enum ControlledWatchdogOutcome {
    Completed(WatchdogOutcome),
    Cancelled { attempts: u32 },
}

/// Successful completion after one or more supervised attempts.
#[derive(Debug)]
pub struct WatchdogOutcome {
    pub status: ExitStatus,
    pub attempts: u32,
    pub recovered: bool,
}

/// Failure to launch, inspect, or recover a supervised child.
#[derive(Debug)]
pub enum WatchdogError {
    Configuration(WatchdogConfigError),
    Launch(LaunchError),
    Io {
        operation: &'static str,
        source: io::Error,
    },
    RecoveryExhausted {
        reason: WatchdogReason,
        attempts: u32,
    },
}

impl fmt::Display for WatchdogError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Configuration(error) => error.fmt(formatter),
            Self::Launch(error) => error.fmt(formatter),
            Self::Io { operation, source } => write!(formatter, "{operation}: {source}"),
            Self::RecoveryExhausted { reason, attempts } => write!(
                formatter,
                "watchdog recovery exhausted after {attempts} attempt(s): {reason}"
            ),
        }
    }
}

impl std::error::Error for WatchdogError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Configuration(error) => Some(error),
            Self::Launch(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            Self::RecoveryExhausted { .. } => None,
        }
    }
}

/// A child that cannot outlive its supervisor handle accidentally.
#[derive(Debug)]
pub struct ManagedChild {
    child: Child,
    reaped: bool,
}

impl ManagedChild {
    #[must_use]
    pub fn id(&self) -> u32 {
        self.child.id()
    }

    /// Checks for exit without blocking and reaps the process when it has exited.
    ///
    /// # Errors
    ///
    /// Returns an operating-system error when process status cannot be read.
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let status = self.child.try_wait()?;
        self.reaped |= status.is_some();
        Ok(status)
    }

    /// Waits for normal process exit and reaps the child.
    ///
    /// # Errors
    ///
    /// Returns an operating-system error when waiting for the child fails.
    pub fn wait(mut self) -> io::Result<ExitStatus> {
        let status = self.child.wait()?;
        self.reaped = true;
        Ok(status)
    }

    /// Forces a running process to exit and reaps it.
    ///
    /// # Errors
    ///
    /// Returns an operating-system error when status, termination, or waiting fails.
    pub fn terminate(&mut self) -> io::Result<ExitStatus> {
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        let status = self.child.wait()?;
        self.reaped = true;
        Ok(status)
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        if self.reaped {
            return;
        }

        match self.child.try_wait() {
            Ok(Some(_)) => {}
            Ok(None) | Err(_) => {
                let _ = self.child.kill();
            }
        }
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use std::env;
    use std::fs;
    use std::io;
    use std::path::PathBuf;
    use std::process;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::thread;
    use std::time::{Duration, Instant, SystemTime};

    use super::{
        ControlledWatchdogOutcome, FileHealthProbe, HealthProbe, HealthSignal, LaunchError,
        LaunchSpec, ProcessSupervisor, ResourceFault, WatchdogError, WatchdogEvent, WatchdogPolicy,
        WatchdogReason,
    };

    #[derive(Debug)]
    struct QuietProbe;

    impl HealthProbe for QuietProbe {
        fn reset(&mut self) -> io::Result<()> {
            Ok(())
        }

        fn poll(&mut self) -> io::Result<HealthSignal> {
            Ok(HealthSignal::Quiet)
        }
    }

    #[derive(Debug, Default)]
    struct HeartbeatOnceProbe {
        emitted: bool,
    }

    #[derive(Debug)]
    struct HealthyProbe;

    impl HealthProbe for HealthyProbe {
        fn reset(&mut self) -> io::Result<()> {
            Ok(())
        }

        fn poll(&mut self) -> io::Result<HealthSignal> {
            Ok(HealthSignal::Heartbeat)
        }
    }

    #[derive(Debug)]
    struct InvalidDataProbe;

    impl HealthProbe for InvalidDataProbe {
        fn reset(&mut self) -> io::Result<()> {
            Ok(())
        }

        fn poll(&mut self) -> io::Result<HealthSignal> {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "malformed test signal",
            ))
        }
    }

    impl HealthProbe for HeartbeatOnceProbe {
        fn reset(&mut self) -> io::Result<()> {
            Ok(())
        }

        fn poll(&mut self) -> io::Result<HealthSignal> {
            if self.emitted {
                Ok(HealthSignal::Quiet)
            } else {
                self.emitted = true;
                Ok(HealthSignal::Heartbeat)
            }
        }
    }

    #[derive(Debug)]
    struct FaultAfterMarkerProbe {
        fault: ResourceFault,
        marker: PathBuf,
        emitted: bool,
    }

    impl HealthProbe for FaultAfterMarkerProbe {
        fn reset(&mut self) -> io::Result<()> {
            Ok(())
        }

        fn poll(&mut self) -> io::Result<HealthSignal> {
            let child_started = fs::read_to_string(&self.marker)
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .is_some_and(|attempt| attempt >= 1);
            if !self.emitted && child_started {
                self.emitted = true;
                Ok(HealthSignal::ResourceFault(self.fault))
            } else {
                Ok(HealthSignal::Quiet)
            }
        }
    }

    fn test_directory(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("system clock follows Unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("vcg-host-{name}-{}-{unique}", process::id()))
    }

    fn fast_policy(max_restarts: u32) -> WatchdogPolicy {
        WatchdogPolicy {
            startup_timeout: Duration::from_millis(100),
            heartbeat_timeout: Duration::from_millis(100),
            poll_interval: Duration::from_millis(1),
            restart_backoff: Duration::ZERO,
            max_restarts,
        }
    }

    #[test]
    fn rejects_an_empty_program() {
        assert!(matches!(
            LaunchSpec::new(""),
            Err(LaunchError::EmptyProgram)
        ));
    }

    #[test]
    fn atomic_watchdog_launch_boundary_can_cancel_before_spawn() {
        let spec = LaunchSpec::new("must-not-start").expect("nonempty program is valid");
        let mut events = Vec::new();
        let mut launch_calls = 0;
        let outcome = ProcessSupervisor::watch_controlled_with_launcher(
            &spec,
            &fast_policy(1),
            QuietProbe,
            |event| events.push(event.clone()),
            || false,
            |_| {
                launch_calls += 1;
                Ok(None)
            },
        )
        .expect("host launch boundary cancels cleanly");

        assert!(matches!(
            outcome,
            ControlledWatchdogOutcome::Cancelled { attempts: 0 }
        ));
        assert_eq!(launch_calls, 1);
        assert_eq!(events, vec![WatchdogEvent::Cancelled { attempt: 0 }]);
    }

    #[test]
    fn supervises_a_direct_child_to_normal_exit() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args(["--list"]);
        let child = ProcessSupervisor.launch(&spec).expect("child starts");
        let status = child.wait().expect("child is reaped");

        assert!(status.success());
    }

    #[test]
    fn reports_spawn_failure_with_the_program() {
        let missing = "vcg-host-program-that-does-not-exist";
        let spec = LaunchSpec::new(missing).expect("nonempty program");
        let error = ProcessSupervisor
            .launch(&spec)
            .expect_err("missing child must fail");

        assert!(error.to_string().contains(missing));
    }

    #[test]
    fn dropping_a_managed_child_stops_and_reaps_it() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::managed_child_drop_helper",
                "--ignored",
            ]);
        let child = ProcessSupervisor.launch(&spec).expect("child starts");
        thread::sleep(Duration::from_millis(20));

        let started = Instant::now();
        drop(child);

        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn file_probe_resets_stale_state_and_reports_bounded_signals() {
        let directory = test_directory("probe");
        fs::create_dir_all(&directory).expect("test directory is created");
        let heartbeat = directory.join("heartbeat");
        let fault = directory.join("fault");
        fs::write(&heartbeat, "stale").expect("stale heartbeat is written");
        fs::write(&fault, "gpu-reset").expect("stale fault is written");
        let mut probe =
            FileHealthProbe::new(&heartbeat, Some(fault.clone())).expect("probe paths differ");

        probe.reset().expect("stale signals are removed");
        assert!(!heartbeat.exists());
        assert!(!fault.exists());
        assert_eq!(
            probe.poll().expect("missing signals are quiet"),
            HealthSignal::Quiet
        );

        fs::write(&heartbeat, "1").expect("heartbeat is written");
        assert_eq!(
            probe.poll().expect("new heartbeat is read"),
            HealthSignal::Heartbeat
        );
        assert_eq!(
            probe.poll().expect("unchanged heartbeat is quiet"),
            HealthSignal::Quiet
        );
        fs::write(&heartbeat, "2").expect("heartbeat advances");
        assert_eq!(
            probe.poll().expect("advanced heartbeat is read"),
            HealthSignal::Heartbeat
        );
        fs::write(&fault, "out-of-memory").expect("resource fault is written");
        assert_eq!(
            probe.poll().expect("resource fault is read"),
            HealthSignal::ResourceFault(ResourceFault::OutOfMemory)
        );
        fs::remove_file(&fault).expect("fault is cleared");

        for invalid_heartbeat in [Vec::new(), vec![0xff], vec![b'x'; 4_097]] {
            fs::write(&heartbeat, invalid_heartbeat).expect("invalid heartbeat is written");
            assert_eq!(
                probe
                    .poll()
                    .expect_err("invalid heartbeat is rejected")
                    .kind(),
                io::ErrorKind::InvalidData
            );
        }
        fs::write(&fault, "unknown-fault").expect("unknown fault is written");
        assert_eq!(
            probe.poll().expect_err("unknown fault is rejected").kind(),
            io::ErrorKind::InvalidData
        );

        fs::remove_dir_all(directory).expect("test directory is removed");
    }

    #[test]
    fn watchdog_restarts_once_after_a_crash_and_completes() {
        let directory = test_directory("restart");
        fs::create_dir_all(&directory).expect("test directory is created");
        let counter = directory.join("counter");
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::watchdog_crash_once_helper",
                "--ignored",
            ])
            .env("VCG_WATCHDOG_TEST_COUNTER", counter.as_os_str());
        let mut events = Vec::new();

        let outcome = ProcessSupervisor
            .watch(&spec, &fast_policy(1), QuietProbe, |event| {
                events.push(event.clone());
            })
            .expect("second attempt succeeds");
        assert_eq!(outcome.attempts, 2);
        assert!(outcome.recovered);
        assert!(outcome.status.success());
        assert!(events.iter().any(|event| matches!(
            event,
            WatchdogEvent::Restarting {
                reason: WatchdogReason::ProcessExit {
                    exit_code: Some(17)
                },
                ..
            }
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            WatchdogEvent::Completed {
                attempt: 2,
                recovered: true,
                ..
            }
        )));

        fs::remove_dir_all(directory).expect("test directory is removed");
    }

    #[test]
    fn watchdog_restarts_then_fails_a_repeated_startup_timeout() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::managed_child_drop_helper",
                "--ignored",
            ]);
        let started = Instant::now();
        let mut events = Vec::new();
        let error = ProcessSupervisor
            .watch(&spec, &fast_policy(1), QuietProbe, |event| {
                events.push(event.clone());
            })
            .expect_err("silent child must exhaust recovery");

        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(matches!(
            error,
            WatchdogError::RecoveryExhausted {
                reason: WatchdogReason::StartupTimeout,
                attempts: 2
            }
        ));
        assert!(events.iter().any(|event| matches!(
            event,
            WatchdogEvent::Restarting {
                reason: WatchdogReason::StartupTimeout,
                ..
            }
        )));
    }

    #[test]
    fn watchdog_force_reaps_a_post_ready_heartbeat_timeout() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::managed_child_drop_helper",
                "--ignored",
            ]);
        let mut events = Vec::new();
        let error = ProcessSupervisor
            .watch(
                &spec,
                &fast_policy(0),
                HeartbeatOnceProbe::default(),
                |event| events.push(event.clone()),
            )
            .expect_err("stale heartbeat must exhaust recovery");

        assert!(matches!(
            error,
            WatchdogError::RecoveryExhausted {
                reason: WatchdogReason::HeartbeatTimeout,
                attempts: 1
            }
        ));
        assert!(events.iter().any(|event| matches!(
            event,
            WatchdogEvent::Ready {
                attempt: 1,
                recovered: false
            }
        )));
    }

    #[test]
    fn watchdog_keeps_healthy_heartbeats_internal_and_bounded() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::watchdog_healthy_helper",
                "--ignored",
            ]);
        let mut events = Vec::new();
        let outcome = ProcessSupervisor
            .watch(&spec, &fast_policy(0), HealthyProbe, |event| {
                events.push(event.clone());
            })
            .expect("changing heartbeats keep the child healthy");

        assert!(outcome.status.success());
        assert_eq!(events.len(), 3);
        assert!(matches!(events[0], WatchdogEvent::Started { .. }));
        assert!(matches!(events[1], WatchdogEvent::Ready { .. }));
        assert!(matches!(events[2], WatchdogEvent::Completed { .. }));
    }

    #[test]
    fn controlled_watchdog_terminates_a_running_child_on_cancellation() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::managed_child_drop_helper",
                "--ignored",
            ]);
        let polls = AtomicUsize::new(0);
        let mut events = Vec::new();

        let outcome = ProcessSupervisor
            .watch_controlled(
                &spec,
                &fast_policy(0),
                HealthyProbe,
                |event| events.push(event.clone()),
                || polls.fetch_add(1, Ordering::Relaxed) >= 5,
            )
            .expect("cancellation is a successful terminal outcome");

        assert!(matches!(
            outcome,
            ControlledWatchdogOutcome::Cancelled { attempts: 1 }
        ));
        assert!(
            events
                .iter()
                .any(|event| matches!(event, WatchdogEvent::Cancelled { attempt: 1 }))
        );
        assert!(
            !events
                .iter()
                .any(|event| matches!(event, WatchdogEvent::Completed { .. }))
        );
    }

    #[test]
    fn controlled_watchdog_cancels_restart_backoff_before_another_spawn() {
        let directory = test_directory("cancel-backoff");
        fs::create_dir_all(&directory).expect("test directory is created");
        let counter = directory.join("counter");
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::watchdog_crash_once_helper",
                "--ignored",
            ])
            .env("VCG_WATCHDOG_TEST_COUNTER", counter.as_os_str());
        let restarting = Arc::new(AtomicBool::new(false));
        let event_flag = Arc::clone(&restarting);
        let cancel_flag = Arc::clone(&restarting);
        let mut policy = fast_policy(1);
        policy.restart_backoff = Duration::from_secs(1);

        let outcome = ProcessSupervisor
            .watch_controlled(
                &spec,
                &policy,
                QuietProbe,
                move |event| {
                    if matches!(event, WatchdogEvent::Restarting { .. }) {
                        event_flag.store(true, Ordering::Release);
                    }
                },
                move || cancel_flag.load(Ordering::Acquire),
            )
            .expect("backoff cancellation succeeds");

        assert!(matches!(
            outcome,
            ControlledWatchdogOutcome::Cancelled { attempts: 1 }
        ));
        assert_eq!(
            fs::read_to_string(&counter).expect("only first attempt records"),
            "1"
        );
        fs::remove_dir_all(directory).expect("test directory is removed");
    }

    #[test]
    fn watchdog_restarts_then_reports_invalid_probe_data() {
        let executable = env::current_exe().expect("current test executable");
        let spec = LaunchSpec::new(executable)
            .expect("valid executable")
            .args([
                "--exact",
                "process::tests::managed_child_drop_helper",
                "--ignored",
            ]);
        let mut events = Vec::new();
        let error = ProcessSupervisor
            .watch(&spec, &fast_policy(1), InvalidDataProbe, |event| {
                events.push(event.clone());
            })
            .expect_err("invalid probe data must exhaust bounded recovery");

        assert!(matches!(
            error,
            WatchdogError::RecoveryExhausted {
                reason: WatchdogReason::InvalidProbeData,
                attempts: 2
            }
        ));
        assert!(events.iter().any(|event| matches!(
            event,
            WatchdogEvent::Restarting {
                reason: WatchdogReason::InvalidProbeData,
                ..
            }
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            WatchdogEvent::Failed {
                reason: WatchdogReason::InvalidProbeData,
                ..
            }
        )));
    }

    #[test]
    fn watchdog_recovers_from_explicit_gpu_and_memory_faults() {
        for fault in [ResourceFault::GpuReset, ResourceFault::OutOfMemory] {
            let directory = test_directory(&fault.to_string());
            fs::create_dir_all(&directory).expect("test directory is created");
            let counter = directory.join("counter");
            let executable = env::current_exe().expect("current test executable");
            let spec = LaunchSpec::new(executable)
                .expect("valid executable")
                .args([
                    "--exact",
                    "process::tests::watchdog_fault_once_helper",
                    "--ignored",
                ])
                .env("VCG_WATCHDOG_TEST_COUNTER", counter.as_os_str());
            let probe = FaultAfterMarkerProbe {
                fault,
                marker: counter.clone(),
                emitted: false,
            };
            let mut events = Vec::new();

            let outcome = ProcessSupervisor
                .watch(&spec, &fast_policy(1), probe, |event| {
                    events.push(event.clone());
                })
                .expect("second attempt succeeds after resource fault");
            assert_eq!(outcome.attempts, 2);
            assert!(outcome.recovered);
            assert!(events.iter().any(|event| matches!(
                event,
                WatchdogEvent::Restarting {
                    reason: WatchdogReason::ResourceFault(observed),
                    ..
                } if *observed == fault
            )));

            fs::remove_dir_all(directory).expect("test directory is removed");
        }
    }

    #[test]
    #[ignore = "subprocess helper for cleanup-on-drop coverage"]
    fn managed_child_drop_helper() {
        thread::sleep(Duration::from_secs(30));
    }

    #[test]
    #[ignore = "subprocess helper for bounded crash recovery coverage"]
    fn watchdog_crash_once_helper() {
        let counter = env::var_os("VCG_WATCHDOG_TEST_COUNTER")
            .map(PathBuf::from)
            .expect("counter path is provided");
        let attempt = fs::read_to_string(&counter)
            .ok()
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        fs::write(counter, (attempt + 1).to_string()).expect("counter is advanced");
        if attempt == 0 {
            process::exit(17);
        }
    }

    #[test]
    #[ignore = "subprocess helper for resource-fault recovery coverage"]
    fn watchdog_fault_once_helper() {
        let counter = env::var_os("VCG_WATCHDOG_TEST_COUNTER")
            .map(PathBuf::from)
            .expect("counter path is provided");
        let attempt = fs::read_to_string(&counter)
            .ok()
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        fs::write(counter, (attempt + 1).to_string()).expect("counter is advanced");
        if attempt == 0 {
            thread::sleep(Duration::from_secs(30));
        }
    }

    #[test]
    #[ignore = "subprocess helper for bounded healthy-heartbeat coverage"]
    fn watchdog_healthy_helper() {
        thread::sleep(Duration::from_millis(250));
    }
}
