//! Signed native-package planning with direct, shell-free execution.
//!
//! This module validates one catalog-resolved executable and derives isolated
//! runtime and persistent-data directories. It does not claim an OS sandbox,
//! compositor readiness, device filtering, or descendant containment.

use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::process::{LaunchError, LaunchSpec};
use crate::retroarch::ExpectedSha256;

/// Trusted inputs resolved from a signed installed native package.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativePackageRequest {
    pub install_root: PathBuf,
    pub runtime_root: PathBuf,
    pub data_root: PathBuf,
    pub executable: PathBuf,
    pub executable_sha256: ExpectedSha256,
    pub profile_id: String,
    pub game_id: String,
}

/// Console-owned storage assigned to one profile and native game.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativePackageStorage {
    pub session: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    pub data: PathBuf,
}

/// Fully verified native executable invocation and its host-owned storage.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativePackagePlan {
    launch: LaunchSpec,
    storage: NativePackageStorage,
}

impl NativePackagePlan {
    #[must_use]
    pub fn launch(&self) -> &LaunchSpec {
        &self.launch
    }

    #[must_use]
    pub const fn storage(&self) -> &NativePackageStorage {
        &self.storage
    }

    /// Creates private runtime and persistent-data directories.
    ///
    /// # Errors
    ///
    /// Returns an I/O failure when a host-owned directory cannot be created or
    /// protected.
    pub fn prepare(&self) -> Result<(), NativePackageError> {
        for directory in [
            &self.storage.session,
            &self.storage.cache,
            &self.storage.logs,
            &self.storage.data,
        ] {
            create_private_directory(directory)?;
        }
        Ok(())
    }
}

/// Builds a direct native-package process plan without filesystem mutation.
///
/// The executable is canonicalized beneath the install root and completely
/// hashed before the plan is returned. No package-controlled arguments,
/// environment names, working directory, or writable paths are accepted.
///
/// # Errors
///
/// Rejects unsafe IDs/roots, missing or escaping executables, hash mismatch,
/// and invalid process construction.
pub fn plan(request: &NativePackageRequest) -> Result<NativePackagePlan, NativePackageError> {
    validate_id("profile", &request.profile_id)?;
    validate_id("game", &request.game_id)?;
    validate_owned_root("runtime root", &request.runtime_root)?;
    validate_owned_root("data root", &request.data_root)?;
    if request.runtime_root == request.data_root
        || request.runtime_root.starts_with(&request.data_root)
        || request.data_root.starts_with(&request.runtime_root)
    {
        return Err(NativePackageError::OverlappingRoots {
            runtime_root: request.runtime_root.clone(),
            data_root: request.data_root.clone(),
        });
    }
    let install_root = canonical_directory("install root", &request.install_root)?;
    let executable =
        canonical_package_file("native executable", &request.executable, &install_root)?;
    verify_file_hash(&executable, &request.executable_sha256)?;

    let relative = Path::new("games")
        .join(&request.game_id)
        .join("profiles")
        .join(&request.profile_id)
        .join("native");
    let session = request.runtime_root.join(&relative);
    let data = request.data_root.join(&relative).join("saves");
    let storage = NativePackageStorage {
        cache: session.join("cache"),
        logs: session.join("logs"),
        session,
        data,
    };
    let working_directory =
        executable
            .parent()
            .ok_or_else(|| NativePackageError::OutsideInstallRoot {
                path: executable.clone(),
                root: install_root,
            })?;
    let launch = LaunchSpec::new(&executable)
        .map_err(NativePackageError::Launch)?
        .current_dir(working_directory)
        .env("VCG_GAME_ID", &request.game_id)
        .env("VCG_PROFILE_ID", &request.profile_id)
        .env("VCG_RUNTIME_ROOT", storage.session.as_os_str())
        .env("VCG_DATA_ROOT", storage.data.as_os_str());
    Ok(NativePackagePlan { launch, storage })
}

fn validate_id(kind: &'static str, value: &str) -> Result<(), NativePackageError> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || (byte == b'-' && index > 0)
        })
        && !value.ends_with('-')
        && !value.contains("--");
    if valid {
        Ok(())
    } else {
        Err(NativePackageError::InvalidId {
            kind,
            value: value.to_owned(),
        })
    }
}

fn validate_owned_root(kind: &'static str, path: &Path) -> Result<(), NativePackageError> {
    if path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        Ok(())
    } else {
        Err(NativePackageError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        })
    }
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, NativePackageError> {
    let canonical = fs::canonicalize(path).map_err(|source| NativePackageError::Io {
        operation: "resolve native package directory",
        path: path.to_owned(),
        source,
    })?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(NativePackageError::NotDirectory {
            kind,
            path: canonical,
        })
    }
}

fn canonical_package_file(
    kind: &'static str,
    path: &Path,
    root: &Path,
) -> Result<PathBuf, NativePackageError> {
    let canonical = fs::canonicalize(path).map_err(|source| NativePackageError::Io {
        operation: "resolve native package file",
        path: path.to_owned(),
        source,
    })?;
    if !canonical.is_file() {
        return Err(NativePackageError::NotFile {
            kind,
            path: canonical,
        });
    }
    if canonical.starts_with(root) && canonical != root {
        Ok(canonical)
    } else {
        Err(NativePackageError::OutsideInstallRoot {
            path: canonical,
            root: root.to_owned(),
        })
    }
}

fn verify_file_hash(path: &Path, expected: &ExpectedSha256) -> Result<(), NativePackageError> {
    let mut file = File::open(path).map_err(|source| NativePackageError::Io {
        operation: "open native package executable",
        path: path.to_owned(),
        source,
    })?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1_024].into_boxed_slice();
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|source| NativePackageError::Io {
                operation: "hash native package executable",
                path: path.to_owned(),
                source,
            })?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    let actual = digest.finalize();
    if actual.as_slice() == expected.as_bytes() {
        Ok(())
    } else {
        Err(NativePackageError::HashMismatch {
            path: path.to_owned(),
        })
    }
}

fn create_private_directory(path: &Path) -> Result<(), NativePackageError> {
    fs::create_dir_all(path).map_err(|source| NativePackageError::Io {
        operation: "create private native package directory",
        path: path.to_owned(),
        source,
    })?;
    set_private_directory_permissions(path)
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), NativePackageError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|source| {
        NativePackageError::Io {
            operation: "protect native package directory",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn set_private_directory_permissions(_path: &Path) -> Result<(), NativePackageError> {
    Ok(())
}

/// Native-package planning or preparation failure.
#[derive(Debug)]
pub enum NativePackageError {
    InvalidId {
        kind: &'static str,
        value: String,
    },
    UnsafeRoot {
        kind: &'static str,
        path: PathBuf,
    },
    OverlappingRoots {
        runtime_root: PathBuf,
        data_root: PathBuf,
    },
    NotDirectory {
        kind: &'static str,
        path: PathBuf,
    },
    NotFile {
        kind: &'static str,
        path: PathBuf,
    },
    OutsideInstallRoot {
        path: PathBuf,
        root: PathBuf,
    },
    HashMismatch {
        path: PathBuf,
    },
    Launch(LaunchError),
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for NativePackageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidId { kind, value } => {
                write!(formatter, "{kind} ID is not safe: {value}")
            }
            Self::UnsafeRoot { kind, path } => {
                write!(formatter, "{kind} is unsafe: {}", path.display())
            }
            Self::OverlappingRoots {
                runtime_root,
                data_root,
            } => write!(
                formatter,
                "native runtime and data roots overlap: {} and {}",
                runtime_root.display(),
                data_root.display()
            ),
            Self::NotDirectory { kind, path } => {
                write!(formatter, "{kind} is not a directory: {}", path.display())
            }
            Self::NotFile { kind, path } => {
                write!(formatter, "{kind} is not a file: {}", path.display())
            }
            Self::OutsideInstallRoot { path, root } => write!(
                formatter,
                "native executable {} escapes install root {}",
                path.display(),
                root.display()
            ),
            Self::HashMismatch { path } => {
                write!(
                    formatter,
                    "native executable hash mismatch: {}",
                    path.display()
                )
            }
            Self::Launch(error) => write!(formatter, "{error}"),
            Self::Io {
                operation,
                path,
                source,
            } => write!(
                formatter,
                "{operation} failed for {}: {source}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for NativePackageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Launch(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::str::FromStr;
    use std::time::{SystemTime, UNIX_EPOCH};

    use sha2::{Digest, Sha256};

    use super::{NativePackageError, NativePackageRequest, plan};
    use crate::retroarch::ExpectedSha256;

    struct Fixture {
        root: PathBuf,
        install: PathBuf,
        runtime: PathBuf,
        data: PathBuf,
        executable: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "vcg-native-package-test-{}-{unique}",
                std::process::id()
            ));
            let install = root.join("installed");
            let runtime = root.join("runtime");
            let data = root.join("data");
            let executable = install
                .join("packages")
                .join("native-game")
                .join(format!("game{}", std::env::consts::EXE_SUFFIX));
            fs::create_dir_all(
                executable
                    .parent()
                    .expect("fixture executable has a parent"),
            )
            .expect("create package directory");
            fs::write(&executable, b"native executable fixture").expect("write executable");
            Self {
                root,
                install,
                runtime,
                data,
                executable,
            }
        }

        fn request(&self) -> NativePackageRequest {
            NativePackageRequest {
                install_root: self.install.clone(),
                runtime_root: self.runtime.clone(),
                data_root: self.data.clone(),
                executable: self.executable.clone(),
                executable_sha256: digest(&self.executable),
                profile_id: "player-one".to_owned(),
                game_id: "native-game".to_owned(),
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn digest(path: &std::path::Path) -> ExpectedSha256 {
        use std::fmt::Write as _;

        let bytes = fs::read(path).expect("read fixture");
        let mut value = String::with_capacity(64);
        for byte in Sha256::digest(bytes) {
            write!(value, "{byte:02x}").expect("writing to a String cannot fail");
        }
        ExpectedSha256::from_str(&value).expect("fixture digest is canonical")
    }

    #[test]
    fn derives_direct_launch_and_host_owned_storage() {
        let fixture = Fixture::new();
        let planned = plan(&fixture.request()).expect("native package plans");

        assert_eq!(
            planned.launch().program(),
            fs::canonicalize(&fixture.executable).expect("executable canonicalizes")
        );
        assert_eq!(planned.launch().arguments().count(), 0);
        assert_eq!(
            planned.storage().session,
            fixture
                .runtime
                .join("games")
                .join("native-game")
                .join("profiles")
                .join("player-one")
                .join("native")
        );
        assert_eq!(
            planned.storage().data,
            fixture
                .data
                .join("games/native-game/profiles/player-one/native/saves")
        );

        planned.prepare().expect("storage prepares");
        for path in [
            &planned.storage().session,
            &planned.storage().cache,
            &planned.storage().logs,
            &planned.storage().data,
        ] {
            assert!(path.is_dir(), "{} should be a directory", path.display());
        }
    }

    #[test]
    fn rejects_changed_or_escaping_executables() {
        let fixture = Fixture::new();
        let request = fixture.request();
        fs::write(&fixture.executable, b"changed").expect("change executable");
        assert!(matches!(
            plan(&request),
            Err(NativePackageError::HashMismatch { .. })
        ));

        let fixture = Fixture::new();
        let outside = fixture
            .root
            .join(format!("outside{}", std::env::consts::EXE_SUFFIX));
        fs::write(&outside, b"outside").expect("write outside executable");
        let mut request = fixture.request();
        request.executable = outside.clone();
        request.executable_sha256 = digest(&outside);
        assert!(matches!(
            plan(&request),
            Err(NativePackageError::OutsideInstallRoot { .. })
        ));
    }

    #[test]
    fn rejects_unsafe_intent_and_storage_inputs() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.profile_id = "../other".to_owned();
        assert!(matches!(
            plan(&request),
            Err(NativePackageError::InvalidId {
                kind: "profile",
                ..
            })
        ));

        let mut request = fixture.request();
        request.runtime_root = PathBuf::from("relative");
        assert!(matches!(
            plan(&request),
            Err(NativePackageError::UnsafeRoot {
                kind: "runtime root",
                ..
            })
        ));

        let mut request = fixture.request();
        request.runtime_root = fixture.data.join("runtime");
        assert!(matches!(
            plan(&request),
            Err(NativePackageError::OverlappingRoots { .. })
        ));
    }
}
