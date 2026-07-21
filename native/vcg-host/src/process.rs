//! Direct child-process supervision without shell interpretation.

use std::ffi::{OsStr, OsString};
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus};

/// Validated process launch parameters.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LaunchSpec {
    program: PathBuf,
    args: Vec<OsString>,
    current_dir: Option<PathBuf>,
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
    pub fn program(&self) -> &Path {
        &self.program
    }

    pub fn arguments(&self) -> impl Iterator<Item = &OsStr> {
        self.args.iter().map(OsString::as_os_str)
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
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
    use std::thread;
    use std::time::{Duration, Instant};

    use super::{LaunchError, LaunchSpec, ProcessSupervisor};

    #[test]
    fn rejects_an_empty_program() {
        assert!(matches!(
            LaunchSpec::new(""),
            Err(LaunchError::EmptyProgram)
        ));
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
    #[ignore = "subprocess helper for cleanup-on-drop coverage"]
    fn managed_child_drop_helper() {
        thread::sleep(Duration::from_secs(30));
    }
}
