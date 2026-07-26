//! Isolated, signed-policy candidate package health execution.

use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use crate::installed_catalog::{PackageHealthCheck, PackageHealthPolicy};
use crate::package_launch::{PackageLaunchError, PackageLaunchPlan};
use crate::process::{LaunchError, LaunchSpec, ProcessSupervisor};

const MAX_READY_BYTES: u64 = 4_096;

/// One package's prepared isolated health invocation.
#[derive(Debug)]
pub struct CandidateHealthRequest {
    pub game_id: String,
    pub policy: PackageHealthPolicy,
    pub plan: PackageLaunchPlan,
}

/// Executes candidate health checks without using a player's persistent data.
#[derive(Clone, Copy, Debug)]
pub struct CandidateHealthChecker {
    poll_interval: Duration,
}

impl Default for CandidateHealthChecker {
    fn default() -> Self {
        Self {
            poll_interval: Duration::from_millis(50),
        }
    }
}

impl CandidateHealthChecker {
    /// Creates a checker with a bounded polling interval.
    ///
    /// # Errors
    ///
    /// Rejects zero or greater-than-one-second polling intervals.
    pub fn new(poll_interval: Duration) -> Result<Self, CandidateHealthError> {
        if poll_interval.is_zero() || poll_interval > Duration::from_secs(1) {
            return Err(CandidateHealthError::InvalidPollInterval);
        }
        Ok(Self { poll_interval })
    }

    /// Prepares and runs one isolated package health check.
    ///
    /// `process` means the child survives the complete signed observation
    /// window. `explicit-ready` means the direct child or its qualified wrapper
    /// publishes one bounded non-empty UTF-8 token to `VCG_READY_FILE`.
    /// Neither mechanism alone proves compositor/window readiness.
    ///
    /// The caller must provide a plan whose runtime and data roots are
    /// disposable health-only paths, never player save paths.
    ///
    /// # Errors
    ///
    /// Rejects preparation/launch failures, early exit, invalid ready data,
    /// timeout, or inability to reap the candidate child.
    pub fn check(&self, request: &CandidateHealthRequest) -> Result<(), CandidateHealthError> {
        request
            .plan
            .prepare()
            .map_err(CandidateHealthError::Prepare)?;
        let ready_path = request.plan.session_root().join("vcg.ready");
        remove_stale_ready_file(&ready_path)?;
        let launch = match request.policy.check {
            PackageHealthCheck::Process => request.plan.launch().clone(),
            PackageHealthCheck::ExplicitReady => request
                .plan
                .launch()
                .clone()
                .env("VCG_READY_FILE", ready_path.as_os_str()),
        };
        observe_candidate(
            &request.game_id,
            &launch,
            request.policy,
            &ready_path,
            self.poll_interval,
        )
    }
}

fn observe_candidate(
    game_id: &str,
    launch: &LaunchSpec,
    policy: PackageHealthPolicy,
    ready_path: &Path,
    poll_interval: Duration,
) -> Result<(), CandidateHealthError> {
    let mut child = ProcessSupervisor
        .launch(launch)
        .map_err(CandidateHealthError::Launch)?;
    let started = Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|source| CandidateHealthError::Io {
                operation: "observe candidate process",
                path: launch.program().to_owned(),
                source,
            })?
        {
            return Err(CandidateHealthError::EarlyExit {
                game_id: game_id.to_owned(),
                exit_code: status.code(),
            });
        }

        if policy.check == PackageHealthCheck::ExplicitReady {
            match ready_token_exists(ready_path) {
                Ok(true) => {
                    terminate_candidate(&mut child, launch, "reap ready candidate process")?;
                    return Ok(());
                }
                Ok(false) => {}
                Err(error) => {
                    terminate_candidate(&mut child, launch, "reap invalid-ready candidate")?;
                    return Err(error);
                }
            }
        }

        let elapsed = started.elapsed();
        if elapsed >= policy.timeout {
            if policy.check == PackageHealthCheck::Process {
                terminate_candidate(&mut child, launch, "reap process-health candidate")?;
                return Ok(());
            }
            terminate_candidate(&mut child, launch, "reap timed-out ready candidate")?;
            return Err(CandidateHealthError::ReadyTimeout {
                game_id: game_id.to_owned(),
                timeout: policy.timeout,
            });
        }
        let remaining = policy
            .timeout
            .checked_sub(elapsed)
            .unwrap_or(Duration::ZERO);
        thread::sleep(poll_interval.min(remaining));
    }
}

fn terminate_candidate(
    child: &mut crate::process::ManagedChild,
    launch: &LaunchSpec,
    operation: &'static str,
) -> Result<(), CandidateHealthError> {
    child
        .terminate()
        .map(|_| ())
        .map_err(|source| CandidateHealthError::Io {
            operation,
            path: launch.program().to_owned(),
            source,
        })
}

fn remove_stale_ready_file(path: &Path) -> Result<(), CandidateHealthError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(CandidateHealthError::Io {
            operation: "remove stale candidate ready file",
            path: path.to_owned(),
            source,
        }),
    }
}

fn ready_token_exists(path: &Path) -> Result<bool, CandidateHealthError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => {}
        Ok(_) => return Err(CandidateHealthError::InvalidReadyToken(path.to_owned())),
        Err(source) if source.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(source) => {
            return Err(CandidateHealthError::Io {
                operation: "inspect candidate ready file",
                path: path.to_owned(),
                source,
            });
        }
    }
    let file = match File::open(path) {
        Ok(file) => file,
        Err(source) if source.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(source) => {
            return Err(CandidateHealthError::Io {
                operation: "open candidate ready file",
                path: path.to_owned(),
                source,
            });
        }
    };
    let mut bytes = Vec::new();
    file.take(MAX_READY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| CandidateHealthError::Io {
            operation: "read candidate ready file",
            path: path.to_owned(),
            source,
        })?;
    if bytes.is_empty()
        || u64::try_from(bytes.len()).is_ok_and(|length| length > MAX_READY_BYTES)
        || std::str::from_utf8(&bytes).is_err()
    {
        return Err(CandidateHealthError::InvalidReadyToken(path.to_owned()));
    }
    Ok(true)
}

/// Candidate health execution failure.
#[derive(Debug)]
pub enum CandidateHealthError {
    InvalidPollInterval,
    Prepare(PackageLaunchError),
    Launch(LaunchError),
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    EarlyExit {
        game_id: String,
        exit_code: Option<i32>,
    },
    InvalidReadyToken(PathBuf),
    ReadyTimeout {
        game_id: String,
        timeout: Duration,
    },
}

impl fmt::Display for CandidateHealthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPollInterval => {
                formatter.write_str("candidate health poll interval must be 1-1000 milliseconds")
            }
            Self::Prepare(error) => {
                write!(formatter, "candidate health preparation failed: {error}")
            }
            Self::Launch(error) => write!(formatter, "candidate health launch failed: {error}"),
            Self::Io {
                operation,
                path,
                source,
            } => write!(
                formatter,
                "{operation} failed for {}: {source}",
                path.display()
            ),
            Self::EarlyExit { game_id, exit_code } => write!(
                formatter,
                "candidate package {game_id} exited before health completion ({})",
                exit_code.map_or_else(|| "signal".to_owned(), |code| code.to_string())
            ),
            Self::InvalidReadyToken(path) => {
                write!(
                    formatter,
                    "candidate ready token is invalid: {}",
                    path.display()
                )
            }
            Self::ReadyTimeout { game_id, timeout } => write!(
                formatter,
                "candidate package {game_id} did not signal ready within {} milliseconds",
                timeout.as_millis()
            ),
        }
    }
}

impl std::error::Error for CandidateHealthError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Prepare(error) => Some(error),
            Self::Launch(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::process;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::thread;
    use std::time::Duration;

    use super::{
        CandidateHealthChecker, CandidateHealthError, PackageHealthCheck, PackageHealthPolicy,
        observe_candidate,
    };
    use crate::process::LaunchSpec;

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn helper_spec(mode: &str) -> LaunchSpec {
        LaunchSpec::new(env::current_exe().expect("test executable resolves"))
            .expect("helper launch spec creates")
            .args([
                "--exact",
                "package_health::tests::candidate_health_helper",
                "--ignored",
                "--nocapture",
            ])
            .env("VCG_TEST_CANDIDATE_HEALTH", mode)
    }

    fn ready_path() -> PathBuf {
        let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        env::temp_dir().join(format!("vcg-candidate-ready-{}-{sequence}", process::id()))
    }

    #[test]
    fn validates_health_checker_poll_interval() {
        assert!(matches!(
            CandidateHealthChecker::new(Duration::ZERO),
            Err(CandidateHealthError::InvalidPollInterval)
        ));
        assert!(CandidateHealthChecker::new(Duration::from_millis(1)).is_ok());
        assert!(matches!(
            CandidateHealthChecker::new(Duration::from_millis(1_001)),
            Err(CandidateHealthError::InvalidPollInterval)
        ));
    }

    #[test]
    fn process_health_requires_survival_for_the_signed_window() {
        let ready = ready_path();
        observe_candidate(
            "candidate",
            &helper_spec("stay"),
            PackageHealthPolicy {
                timeout: Duration::from_millis(100),
                check: PackageHealthCheck::Process,
            },
            &ready,
            Duration::from_millis(5),
        )
        .expect("surviving process passes process health");

        assert!(matches!(
            observe_candidate(
                "candidate",
                &helper_spec("exit"),
                PackageHealthPolicy {
                    timeout: Duration::from_millis(500),
                    check: PackageHealthCheck::Process,
                },
                &ready,
                Duration::from_millis(5),
            ),
            Err(CandidateHealthError::EarlyExit {
                exit_code: Some(23),
                ..
            })
        ));
    }

    #[test]
    fn explicit_ready_requires_one_bounded_valid_token() {
        let ready = ready_path();
        let ready_spec = helper_spec("ready").env("VCG_READY_FILE", ready.as_os_str());
        observe_candidate(
            "candidate",
            &ready_spec,
            PackageHealthPolicy {
                timeout: Duration::from_millis(500),
                check: PackageHealthCheck::ExplicitReady,
            },
            &ready,
            Duration::from_millis(5),
        )
        .expect("valid ready token passes");
        let _ = fs::remove_file(&ready);

        let invalid = helper_spec("invalid-ready").env("VCG_READY_FILE", ready.as_os_str());
        assert!(matches!(
            observe_candidate(
                "candidate",
                &invalid,
                PackageHealthPolicy {
                    timeout: Duration::from_millis(500),
                    check: PackageHealthCheck::ExplicitReady,
                },
                &ready,
                Duration::from_millis(5),
            ),
            Err(CandidateHealthError::InvalidReadyToken(_))
        ));
        let _ = fs::remove_file(ready);
    }

    #[test]
    fn explicit_ready_timeout_reaps_the_candidate() {
        let ready = ready_path();
        assert!(matches!(
            observe_candidate(
                "candidate",
                &helper_spec("stay"),
                PackageHealthPolicy {
                    timeout: Duration::from_millis(75),
                    check: PackageHealthCheck::ExplicitReady,
                },
                &ready,
                Duration::from_millis(5),
            ),
            Err(CandidateHealthError::ReadyTimeout { .. })
        ));
    }

    #[test]
    #[ignore = "subprocess helper for candidate health coverage"]
    fn candidate_health_helper() {
        match env::var("VCG_TEST_CANDIDATE_HEALTH").as_deref() {
            Ok("ready") => {
                let path = env::var_os("VCG_READY_FILE").expect("ready path is configured");
                fs::write(path, "ready").expect("ready token writes");
            }
            Ok("invalid-ready") => {
                let path = env::var_os("VCG_READY_FILE").expect("ready path is configured");
                fs::write(path, b"").expect("invalid ready token writes");
            }
            Ok("exit") => process::exit(23),
            Ok("stay") => {}
            _ => panic!("candidate health helper mode is configured"),
        }
        loop {
            thread::sleep(Duration::from_millis(50));
        }
    }
}
