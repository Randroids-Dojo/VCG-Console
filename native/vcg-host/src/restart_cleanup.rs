//! Privileged proof boundary for native-launch restart cleanup.
//!
//! A recovered launch barrier may be cleared only with an in-memory proof tied
//! to that exact service instance. The platform adapter remains responsible
//! for terminating and inspecting the prior game process scope.

use std::error::Error;
use std::fmt;
#[cfg(target_os = "linux")]
use std::fs::File;
#[cfg(target_os = "linux")]
use std::io::{Read, Seek, SeekFrom, Write};
#[cfg(target_os = "linux")]
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

#[cfg(any(target_os = "linux", test))]
const MAX_CGROUP_EVENT_BYTES: usize = 512;
#[cfg(target_os = "linux")]
const MAX_CGROUP_EVENT_READ_BYTES: u64 = 513;
const MAX_CGROUP_INSPECTIONS: u16 = 256;
const MAX_CGROUP_INSPECTION_INTERVAL: Duration = Duration::from_millis(250);
const MAX_CGROUP_TOTAL_WAIT: Duration = Duration::from_secs(5);

/// Closed result from a privileged process-scope cleanup adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestartCleanupInspection {
    /// The adapter terminated any survivors and proved the prior scope empty.
    Empty,
    /// At least one prior descendant remains.
    NotEmpty,
    /// Scope ownership or inspection is unavailable or ambiguous.
    Unavailable,
}

/// Target-specific privileged boundary that owns the prior game process scope.
///
/// A production implementation must use a qualified service-manager/cgroup or
/// equivalent operating-system primitive. Returning `Empty` is security
/// authority; browser, game, hosted-content, and ordinary loopback inputs must
/// never implement or select this adapter.
pub trait RestartCleanupAdapter {
    fn terminate_and_inspect_prior_scope(&mut self) -> RestartCleanupInspection;
}

/// Explicit bounded polling policy for one Linux cgroup-v2 cleanup attempt.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CgroupV2RestartCleanupPolicy {
    inspections: u16,
    interval: Duration,
}

impl CgroupV2RestartCleanupPolicy {
    /// Creates a caller-selected policy within the fixed safety ceiling.
    ///
    /// `inspections` includes the immediate first inspection. The interval is
    /// applied only before later inspections.
    ///
    /// # Errors
    ///
    /// Returns an error for zero/excessive inspections, an excessive interval,
    /// or a total sleep window above five seconds.
    pub fn new(
        inspections: u16,
        interval: Duration,
    ) -> Result<Self, CgroupV2RestartCleanupOpenError> {
        let sleep_count = u32::from(inspections.saturating_sub(1));
        if inspections == 0
            || inspections > MAX_CGROUP_INSPECTIONS
            || interval > MAX_CGROUP_INSPECTION_INTERVAL
            || interval
                .checked_mul(sleep_count)
                .is_none_or(|total| total > MAX_CGROUP_TOTAL_WAIT)
        {
            return Err(CgroupV2RestartCleanupOpenError::InvalidPolicy);
        }
        Ok(Self {
            inspections,
            interval,
        })
    }
}

/// Candidate Linux cgroup-v2 implementation of the restart cleanup boundary.
///
/// The constructor opens and retains the exact scope's `cgroup.kill` and
/// `cgroup.events` controls relative to one no-follow directory descriptor.
/// Cleanup writes the kernel's only accepted kill value and requires recursive
/// `populated 0` evidence from the retained events descriptor. The adapter is
/// deliberately single-use.
///
/// This type is Linux-only and remains an unwired candidate. A target service
/// must still create and own the exact non-root scope, prevent process escape,
/// constrain directory/control permissions, and qualify the kernel/mount.
#[cfg(target_os = "linux")]
#[derive(Debug)]
pub struct CgroupV2RestartCleanupAdapter {
    kill: File,
    events: File,
    policy: CgroupV2RestartCleanupPolicy,
    used: bool,
}

#[cfg(target_os = "linux")]
impl CgroupV2RestartCleanupAdapter {
    /// Opens the exact existing cgroup-v2 scope without following a final
    /// directory or control-file symlink.
    ///
    /// # Errors
    ///
    /// Returns an error for a relative path, an unavailable directory/control,
    /// a non-regular control, or malformed initial `cgroup.events` evidence.
    pub fn open(
        scope_directory: &Path,
        policy: CgroupV2RestartCleanupPolicy,
    ) -> Result<Self, CgroupV2RestartCleanupOpenError> {
        use rustix::fs::{CWD, FileType, Mode, OFlags, fstat, openat};

        if !scope_directory.is_absolute() {
            return Err(CgroupV2RestartCleanupOpenError::InvalidScope);
        }
        let directory = openat(
            CWD,
            scope_directory,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(|_| CgroupV2RestartCleanupOpenError::ControlUnavailable)?;
        let kill = openat(
            &directory,
            "cgroup.kill",
            OFlags::WRONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(|_| CgroupV2RestartCleanupOpenError::ControlUnavailable)?;
        let events = openat(
            &directory,
            "cgroup.events",
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(|_| CgroupV2RestartCleanupOpenError::ControlUnavailable)?;
        if !FileType::from_raw_mode(
            fstat(&kill)
                .map_err(|_| CgroupV2RestartCleanupOpenError::ControlUnavailable)?
                .st_mode,
        )
        .is_file()
            || !FileType::from_raw_mode(
                fstat(&events)
                    .map_err(|_| CgroupV2RestartCleanupOpenError::ControlUnavailable)?
                    .st_mode,
            )
            .is_file()
        {
            return Err(CgroupV2RestartCleanupOpenError::InvalidControl);
        }
        let mut adapter = Self {
            kill: kill.into(),
            events: events.into(),
            policy,
            used: false,
        };
        adapter
            .read_populated()
            .ok_or(CgroupV2RestartCleanupOpenError::InvalidControl)?;
        Ok(adapter)
    }

    fn read_populated(&mut self) -> Option<bool> {
        self.events.seek(SeekFrom::Start(0)).ok()?;
        let mut bytes = Vec::new();
        Read::by_ref(&mut self.events)
            .take(MAX_CGROUP_EVENT_READ_BYTES)
            .read_to_end(&mut bytes)
            .ok()?;
        parse_cgroup_populated(&bytes)
    }
}

#[cfg(target_os = "linux")]
impl RestartCleanupAdapter for CgroupV2RestartCleanupAdapter {
    fn terminate_and_inspect_prior_scope(&mut self) -> RestartCleanupInspection {
        if self.used {
            return RestartCleanupInspection::Unavailable;
        }
        self.used = true;
        if self.kill.write_all(b"1").is_err() {
            return RestartCleanupInspection::Unavailable;
        }
        for inspection in 0..self.policy.inspections {
            if inspection > 0 && !self.policy.interval.is_zero() {
                std::thread::sleep(self.policy.interval);
            }
            match self.read_populated() {
                Some(false) => return RestartCleanupInspection::Empty,
                Some(true) => {}
                None => return RestartCleanupInspection::Unavailable,
            }
        }
        RestartCleanupInspection::NotEmpty
    }
}

/// Closed failure while binding a candidate Linux cgroup-v2 cleanup adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CgroupV2RestartCleanupOpenError {
    InvalidPolicy,
    InvalidScope,
    ControlUnavailable,
    InvalidControl,
}

impl fmt::Display for CgroupV2RestartCleanupOpenError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPolicy => formatter.write_str("invalid cgroup cleanup policy"),
            Self::InvalidScope => formatter.write_str("invalid cgroup cleanup scope"),
            Self::ControlUnavailable => {
                formatter.write_str("cgroup cleanup control is unavailable")
            }
            Self::InvalidControl => formatter.write_str("invalid cgroup cleanup control"),
        }
    }
}

impl Error for CgroupV2RestartCleanupOpenError {}

#[cfg(any(target_os = "linux", test))]
fn parse_cgroup_populated(bytes: &[u8]) -> Option<bool> {
    if bytes.is_empty() || bytes.len() > MAX_CGROUP_EVENT_BYTES {
        return None;
    }
    let document = std::str::from_utf8(bytes).ok()?;
    let mut populated = None;
    for line in document.lines() {
        let (key, value) = line.split_once(' ')?;
        if key.is_empty()
            || value.is_empty()
            || key.bytes().any(|byte| !byte.is_ascii_lowercase())
            || value.bytes().any(|byte| !byte.is_ascii_digit())
        {
            return None;
        }
        if key == "populated" {
            if populated.is_some() {
                return None;
            }
            populated = match value {
                "0" => Some(false),
                "1" => Some(true),
                _ => return None,
            };
        }
    }
    populated
}

#[derive(Debug)]
pub(crate) struct RestartCleanupBarrierIdentity {
    _private: (),
}

impl RestartCleanupBarrierIdentity {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self { _private: () })
    }
}

/// Opaque request for cleanup proof of one exact recovered barrier.
///
/// The request is non-cloneable and non-serializable. Another request may be
/// issued for retry while the same barrier remains active.
#[derive(Debug)]
pub struct RestartCleanupRequest {
    identity: Arc<RestartCleanupBarrierIdentity>,
}

impl RestartCleanupRequest {
    pub(crate) fn new(identity: &Arc<RestartCleanupBarrierIdentity>) -> Self {
        Self {
            identity: Arc::clone(identity),
        }
    }
}

/// Non-serializable proof that one privileged adapter reported the exact
/// request's prior process scope empty.
#[derive(Debug)]
pub struct VerifiedRestartCleanup {
    identity: Arc<RestartCleanupBarrierIdentity>,
}

impl VerifiedRestartCleanup {
    pub(crate) fn into_identity(self) -> Arc<RestartCleanupBarrierIdentity> {
        self.identity
    }
}

/// Invokes the privileged adapter exactly once for one opaque cleanup request.
///
/// # Errors
///
/// Returns a closed error when descendants remain or inspection is ambiguous.
pub fn verify_restart_cleanup(
    request: RestartCleanupRequest,
    adapter: &mut impl RestartCleanupAdapter,
) -> Result<VerifiedRestartCleanup, RestartCleanupVerificationError> {
    match adapter.terminate_and_inspect_prior_scope() {
        RestartCleanupInspection::Empty => Ok(VerifiedRestartCleanup {
            identity: request.identity,
        }),
        RestartCleanupInspection::NotEmpty => {
            Err(RestartCleanupVerificationError::DescendantsRemain)
        }
        RestartCleanupInspection::Unavailable => {
            Err(RestartCleanupVerificationError::InspectionUnavailable)
        }
    }
}

/// Closed privileged cleanup-verification failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestartCleanupVerificationError {
    DescendantsRemain,
    InspectionUnavailable,
}

impl fmt::Display for RestartCleanupVerificationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DescendantsRemain => {
                formatter.write_str("prior native launch descendants remain")
            }
            Self::InspectionUnavailable => {
                formatter.write_str("prior native launch scope inspection is unavailable")
            }
        }
    }
}

impl Error for RestartCleanupVerificationError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cgroup_policy_is_explicit_and_bounded() {
        assert_eq!(
            CgroupV2RestartCleanupPolicy::new(0, Duration::ZERO),
            Err(CgroupV2RestartCleanupOpenError::InvalidPolicy)
        );
        assert_eq!(
            CgroupV2RestartCleanupPolicy::new(MAX_CGROUP_INSPECTIONS + 1, Duration::ZERO),
            Err(CgroupV2RestartCleanupOpenError::InvalidPolicy)
        );
        assert_eq!(
            CgroupV2RestartCleanupPolicy::new(2, Duration::from_millis(251)),
            Err(CgroupV2RestartCleanupOpenError::InvalidPolicy)
        );
        assert_eq!(
            CgroupV2RestartCleanupPolicy::new(256, Duration::from_millis(20)),
            Err(CgroupV2RestartCleanupOpenError::InvalidPolicy)
        );
        CgroupV2RestartCleanupPolicy::new(1, Duration::from_millis(250))
            .expect("no sleep after one inspection");
    }

    #[test]
    fn cgroup_events_parser_requires_one_closed_populated_value() {
        assert_eq!(
            parse_cgroup_populated(b"populated 0\nfrozen 0\n"),
            Some(false)
        );
        assert_eq!(
            parse_cgroup_populated(b"frozen 1\npopulated 1\nfuture 42\n"),
            Some(true)
        );
        for invalid in [
            b"".as_slice(),
            b"frozen 0\n",
            b"populated 0\npopulated 1\n",
            b"populated 2\n",
            b"populated 00\n",
            b"populated 0 extra\n",
            b"Populated 0\n",
            b"populated\t0\n",
            b"populated 0\n\n",
            b"\xff",
        ] {
            assert_eq!(parse_cgroup_populated(invalid), None, "{invalid:?}");
        }
        assert_eq!(
            parse_cgroup_populated(&vec![b'a'; MAX_CGROUP_EVENT_BYTES + 1]),
            None
        );
    }

    #[cfg(target_os = "linux")]
    mod linux {
        use super::*;
        use std::fs;
        use std::os::unix::fs::symlink;
        use std::sync::atomic::{AtomicU64, Ordering};

        static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

        struct Fixture {
            root: std::path::PathBuf,
        }

        impl Fixture {
            fn new(events: &[u8]) -> Self {
                let root = std::env::temp_dir().join(format!(
                    "vcg-cgroup-cleanup-{}-{}",
                    std::process::id(),
                    NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
                ));
                fs::create_dir(&root).expect("fixture root");
                fs::write(root.join("cgroup.kill"), b"").expect("kill");
                fs::write(root.join("cgroup.events"), events).expect("events");
                Self { root }
            }

            fn policy() -> CgroupV2RestartCleanupPolicy {
                CgroupV2RestartCleanupPolicy::new(1, Duration::ZERO).expect("policy")
            }
        }

        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.root);
            }
        }

        #[test]
        fn exact_empty_scope_is_killed_once_and_verified() {
            let fixture = Fixture::new(b"populated 0\nfrozen 0\n");
            let mut adapter = CgroupV2RestartCleanupAdapter::open(&fixture.root, Fixture::policy())
                .expect("open");
            assert_eq!(
                adapter.terminate_and_inspect_prior_scope(),
                RestartCleanupInspection::Empty
            );
            assert_eq!(
                fs::read(fixture.root.join("cgroup.kill")).expect("kill"),
                b"1"
            );
            assert_eq!(
                adapter.terminate_and_inspect_prior_scope(),
                RestartCleanupInspection::Unavailable
            );
        }

        #[test]
        fn populated_or_malformed_scope_never_produces_empty_proof() {
            let populated = Fixture::new(b"populated 1\n");
            let mut adapter =
                CgroupV2RestartCleanupAdapter::open(&populated.root, Fixture::policy())
                    .expect("open");
            assert_eq!(
                adapter.terminate_and_inspect_prior_scope(),
                RestartCleanupInspection::NotEmpty
            );

            let malformed = Fixture::new(b"populated 0\n");
            let mut adapter =
                CgroupV2RestartCleanupAdapter::open(&malformed.root, Fixture::policy())
                    .expect("open");
            fs::write(malformed.root.join("cgroup.events"), b"populated 2\n").expect("malform");
            assert_eq!(
                adapter.terminate_and_inspect_prior_scope(),
                RestartCleanupInspection::Unavailable
            );
        }

        #[test]
        fn retained_controls_cannot_be_redirected_by_scope_path_replacement() {
            let fixture = Fixture::new(b"populated 0\n");
            let mut adapter = CgroupV2RestartCleanupAdapter::open(&fixture.root, Fixture::policy())
                .expect("open");
            let original = fixture.root.with_extension("original");
            fs::rename(&fixture.root, &original).expect("rename original scope");
            fs::create_dir(&fixture.root).expect("replacement");
            fs::write(fixture.root.join("cgroup.kill"), b"replacement").expect("replacement kill");
            fs::write(fixture.root.join("cgroup.events"), b"populated 1\n")
                .expect("replacement events");

            assert_eq!(
                adapter.terminate_and_inspect_prior_scope(),
                RestartCleanupInspection::Empty
            );
            assert_eq!(
                fs::read(original.join("cgroup.kill")).expect("original kill"),
                b"1"
            );
            assert_eq!(
                fs::read(fixture.root.join("cgroup.kill")).expect("replacement kill"),
                b"replacement"
            );
            fs::remove_dir_all(&fixture.root).expect("remove replacement");
            fs::rename(original, &fixture.root).expect("restore fixture root");
        }

        #[test]
        fn relative_missing_and_symlink_controls_are_rejected() {
            assert!(matches!(
                CgroupV2RestartCleanupAdapter::open(Path::new("relative"), Fixture::policy()),
                Err(CgroupV2RestartCleanupOpenError::InvalidScope)
            ));
            let missing = Fixture::new(b"populated 0\n");
            fs::remove_file(missing.root.join("cgroup.kill")).expect("remove kill");
            assert!(matches!(
                CgroupV2RestartCleanupAdapter::open(&missing.root, Fixture::policy()),
                Err(CgroupV2RestartCleanupOpenError::ControlUnavailable)
            ));

            let linked = Fixture::new(b"populated 0\n");
            fs::rename(
                linked.root.join("cgroup.events"),
                linked.root.join("real-events"),
            )
            .expect("rename events");
            symlink("real-events", linked.root.join("cgroup.events")).expect("symlink");
            assert!(matches!(
                CgroupV2RestartCleanupAdapter::open(&linked.root, Fixture::policy()),
                Err(CgroupV2RestartCleanupOpenError::ControlUnavailable)
            ));
        }
    }
}
