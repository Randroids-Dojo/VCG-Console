//! Contained `RetroArch` launch planning and per-profile runtime preparation.

use std::ffi::{OsStr, OsString};
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;

use sha2::{Digest, Sha256};

use crate::process::LaunchSpec;

/// Exact SHA-256 value supplied by the validated game manifest.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ExpectedSha256([u8; 32]);

impl ExpectedSha256 {
    #[must_use]
    pub(crate) fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl fmt::Display for ExpectedSha256 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in self.0 {
            write!(formatter, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl FromStr for ExpectedSha256 {
    type Err = ExpectedSha256Error;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.len() != 64 {
            return Err(ExpectedSha256Error);
        }
        let mut bytes = [0_u8; 32];
        for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
            let high = decode_hex(pair[0]).ok_or(ExpectedSha256Error)?;
            let low = decode_hex(pair[1]).ok_or(ExpectedSha256Error)?;
            bytes[index] = (high << 4) | low;
        }
        Ok(Self(bytes))
    }
}

fn decode_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}

/// Invalid lowercase SHA-256 text.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ExpectedSha256Error;

impl fmt::Display for ExpectedSha256Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SHA-256 must be 64 lowercase hexadecimal characters")
    }
}

impl std::error::Error for ExpectedSha256Error {}

/// Trusted inputs resolved from an installed libretro manifest.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroArchRequest {
    pub install_root: PathBuf,
    pub content_root: Option<PathBuf>,
    pub runtime_root: PathBuf,
    pub data_root: PathBuf,
    pub frontend: PathBuf,
    pub frontend_sha256: ExpectedSha256,
    pub core: PathBuf,
    pub core_sha256: ExpectedSha256,
    pub content: Option<PathBuf>,
    pub content_sha256: Option<ExpectedSha256>,
    pub base_config: PathBuf,
    pub base_config_sha256: ExpectedSha256,
    pub auxiliary: Vec<RetroArchAuxiliaryArtifact>,
    pub profile_id: String,
    pub game_id: String,
}

/// One additional frontend runtime file bound by the signed installed catalog.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroArchAuxiliaryArtifact {
    pub path: PathBuf,
    pub sha256: ExpectedSha256,
    /// Development-channel filename required by the upstream Windows loader.
    pub runtime_name: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct MaterializedArtifact {
    source: PathBuf,
    destination: PathBuf,
    sha256: ExpectedSha256,
}

/// Console-owned storage assigned to one profile and one retro title.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroArchStorage {
    pub session: PathBuf,
    pub config: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    pub playlists: PathBuf,
    pub saves: PathBuf,
    pub states: PathBuf,
    pub remaps: PathBuf,
    pub screenshots: PathBuf,
    pub system: PathBuf,
    pub core_options: PathBuf,
}

/// Access granted to one exact host path by a future sandbox adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetroSandboxAccess {
    ReadOnly,
    ReadWrite,
}

/// One exact file or directory selected by the host for sandbox exposure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroSandboxMount {
    pub path: PathBuf,
    pub access: RetroSandboxAccess,
}

/// One device or ambient authority considered by the sandbox policy.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum RetroSandboxCapability {
    Display,
    Audio,
    Gamepad,
    Network,
    Camera,
    Microphone,
    RawInput,
    SourceMedia,
    Desktop,
}

/// Device and ambient authority intended for a future enforcing adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroSandboxCapabilities {
    allowed: Vec<RetroSandboxCapability>,
    denied: Vec<RetroSandboxCapability>,
}

impl RetroSandboxCapabilities {
    #[must_use]
    pub fn allowed(&self) -> &[RetroSandboxCapability] {
        &self.allowed
    }

    #[must_use]
    pub fn denied(&self) -> &[RetroSandboxCapability] {
        &self.denied
    }
}

/// Host-derived least-privilege intent for one `RetroArch` launch.
///
/// This is a reviewable plan, not enforcement. A qualified Linux adapter must
/// translate it into namespaces/mounts/device mediation and fail closed when
/// any requested boundary cannot be applied.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroSandboxPlan {
    mounts: Vec<RetroSandboxMount>,
    capabilities: RetroSandboxCapabilities,
}

impl RetroSandboxPlan {
    #[must_use]
    pub fn mounts(&self) -> &[RetroSandboxMount] {
        &self.mounts
    }

    #[must_use]
    pub fn capabilities(&self) -> &RetroSandboxCapabilities {
        &self.capabilities
    }
}

/// Fully validated direct process invocation plus its generated configuration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroArchPlan {
    launch: LaunchSpec,
    storage: RetroArchStorage,
    sandbox: RetroSandboxPlan,
    generated_config: String,
    contentless: bool,
    materialized_artifacts: Vec<MaterializedArtifact>,
}

impl RetroArchPlan {
    #[must_use]
    pub fn launch(&self) -> &LaunchSpec {
        &self.launch
    }

    #[must_use]
    pub fn storage(&self) -> &RetroArchStorage {
        &self.storage
    }

    #[must_use]
    pub fn sandbox(&self) -> &RetroSandboxPlan {
        &self.sandbox
    }

    #[must_use]
    pub fn generated_config(&self) -> &str {
        &self.generated_config
    }

    #[must_use]
    pub fn contentless(&self) -> bool {
        self.contentless
    }

    /// Creates private runtime/data directories and atomically publishes the
    /// session-specific append configuration.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when a directory or configuration cannot be
    /// created safely.
    pub fn prepare(&self) -> Result<(), RetroArchError> {
        let core_options_parent =
            self.storage.core_options.parent().ok_or_else(|| {
                RetroArchError::UnsafeConfigPath(self.storage.core_options.clone())
            })?;
        for directory in [
            &self.storage.session,
            &self.storage.cache,
            &self.storage.logs,
            &self.storage.playlists,
            &self.storage.saves,
            &self.storage.states,
            &self.storage.remaps,
            &self.storage.screenshots,
            &self.storage.system,
            core_options_parent,
        ] {
            create_private_directory(directory)?;
        }
        for artifact in &self.materialized_artifacts {
            materialize_verified_artifact(artifact)?;
        }

        let temporary = self
            .storage
            .config
            .with_extension(format!("cfg.tmp-{}", std::process::id()));
        fs::write(&temporary, self.generated_config.as_bytes()).map_err(|source| {
            RetroArchError::Io {
                operation: "write temporary RetroArch configuration",
                path: temporary.clone(),
                source,
            }
        })?;
        set_private_file_permissions(&temporary)?;
        fs::rename(&temporary, &self.storage.config).map_err(|source| RetroArchError::Io {
            operation: "publish RetroArch configuration",
            path: self.storage.config.clone(),
            source,
        })?;
        Ok(())
    }
}

/// Builds a contained `RetroArch` process plan without mutating the filesystem.
///
/// # Errors
///
/// Rejects missing package artifacts, untrusted content locations, unsafe IDs,
/// relative host-owned roots, and paths that cannot be represented in a
/// `RetroArch` configuration.
pub fn plan(request: &RetroArchRequest) -> Result<RetroArchPlan, RetroArchError> {
    validate_id("profile", &request.profile_id)?;
    validate_id("game", &request.game_id)?;
    validate_owned_root("runtime root", &request.runtime_root)?;
    validate_owned_root("data root", &request.data_root)?;

    let install_root = canonical_directory("install root", &request.install_root)?;
    let frontend = canonical_package_file("frontend", &request.frontend, &install_root)?;
    let core = canonical_package_file("core", &request.core, &install_root)?;
    let base_config =
        canonical_package_file("base configuration", &request.base_config, &install_root)?;
    verify_file_hash("frontend", &frontend, &request.frontend_sha256)?;
    verify_file_hash("core", &core, &request.core_sha256)?;
    verify_file_hash(
        "base configuration",
        &base_config,
        &request.base_config_sha256,
    )?;
    let mut auxiliary = Vec::with_capacity(request.auxiliary.len());
    let frontend_runtime = request
        .runtime_root
        .join("retroarch")
        .join(&request.profile_id)
        .join(&request.game_id)
        .join("frontend");
    let frontend_name = frontend
        .file_name()
        .ok_or_else(|| RetroArchError::UnsafeConfigPath(frontend.clone()))?;
    let materialized_frontend = frontend_runtime.join(frontend_name);
    let mut materialized_artifacts = vec![MaterializedArtifact {
        source: frontend.clone(),
        destination: materialized_frontend.clone(),
        sha256: request.frontend_sha256,
    }];
    let mut runtime_names =
        std::collections::HashSet::from([frontend_name.to_string_lossy().to_ascii_lowercase()]);
    for artifact in &request.auxiliary {
        let path =
            canonical_package_file("frontend auxiliary artifact", &artifact.path, &install_root)?;
        verify_file_hash("frontend auxiliary artifact", &path, &artifact.sha256)?;
        let runtime_name = artifact.runtime_name.as_deref().map_or_else(
            || {
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .ok_or_else(|| RetroArchError::UnsafeConfigPath(path.clone()))
            },
            |name| {
                validate_runtime_name(name)?;
                Ok(name.to_owned())
            },
        )?;
        if !runtime_names.insert(runtime_name.to_ascii_lowercase()) {
            return Err(RetroArchError::DuplicateRuntimeArtifact(runtime_name));
        }
        materialized_artifacts.push(MaterializedArtifact {
            source: path.clone(),
            destination: frontend_runtime.join(runtime_name),
            sha256: artifact.sha256,
        });
        auxiliary.push(path);
    }
    let content = match (
        &request.content,
        &request.content_root,
        &request.content_sha256,
    ) {
        (Some(path), Some(root), Some(expected)) => {
            let root = canonical_directory("content root", root)?;
            let path = canonical_managed_file("content", path, &root)?;
            verify_file_hash("content", &path, expected)?;
            Some(path)
        }
        (Some(_), None, _) => return Err(RetroArchError::MissingContentRoot),
        (Some(_), Some(_), None) => return Err(RetroArchError::MissingContentHash),
        (None, _, Some(_)) => return Err(RetroArchError::UnexpectedContentHash),
        (None, _, None) => None,
    };

    let session = request
        .runtime_root
        .join("retroarch")
        .join(&request.profile_id)
        .join(&request.game_id);
    let persistent = request
        .data_root
        .join("profiles")
        .join(&request.profile_id)
        .join("games")
        .join(&request.game_id);
    let storage = RetroArchStorage {
        config: session.join("vcg-session.cfg"),
        cache: session.join("cache"),
        logs: session.join("logs"),
        playlists: session.join("playlists"),
        session: session.clone(),
        saves: persistent.join("saves"),
        states: persistent.join("states"),
        remaps: persistent.join("remaps"),
        screenshots: persistent.join("screenshots"),
        system: persistent.join("system"),
        core_options: persistent.join("config").join("retroarch-core-options.cfg"),
    };
    for path in storage_paths(&storage) {
        validate_config_path(path)?;
    }
    let sandbox = sandbox_plan(
        &frontend,
        &core,
        &base_config,
        &auxiliary,
        content.as_deref(),
        &storage,
    )?;

    let contentless = content.is_none();
    let generated_config = render_config(&storage);
    let mut arguments = vec![
        OsString::from("--config"),
        base_config.into_os_string(),
        OsString::from("--appendconfig"),
        storage.config.clone().into_os_string(),
        OsString::from("--verbose"),
        OsString::from("-L"),
        core.into_os_string(),
    ];
    if let Some(content) = content {
        arguments.push(content.into_os_string());
    } else {
        // Official CLI guidance requires --menu when no content is passed.
        // The pinned core must still be qualified for one-action Start Core.
        arguments.push(OsString::from("--menu"));
    }

    let launch = LaunchSpec::new(materialized_frontend)
        .map_err(|error| RetroArchError::LaunchPlan(error.to_string()))?
        .args(arguments)
        .current_dir(&session)
        .env("XDG_CONFIG_HOME", session.as_os_str())
        .env("VCG_RUNTIME", "libretro")
        .env("VCG_PROFILE_ID", OsStr::new(&request.profile_id))
        .env("VCG_GAME_ID", OsStr::new(&request.game_id));

    Ok(RetroArchPlan {
        launch,
        storage,
        sandbox,
        generated_config,
        contentless,
        materialized_artifacts,
    })
}

fn validate_runtime_name(name: &str) -> Result<(), RetroArchError> {
    let valid = !name.is_empty()
        && name.len() <= 128
        && !name.ends_with(['.', ' '])
        && name != "."
        && name != ".."
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'+'));
    if valid {
        Ok(())
    } else {
        Err(RetroArchError::UnsafeRuntimeName(name.to_owned()))
    }
}

fn materialize_verified_artifact(artifact: &MaterializedArtifact) -> Result<(), RetroArchError> {
    verify_file_hash(
        "runtime source artifact",
        &artifact.source,
        &artifact.sha256,
    )?;
    let parent = artifact
        .destination
        .parent()
        .ok_or_else(|| RetroArchError::UnsafeConfigPath(artifact.destination.clone()))?;
    create_private_directory(parent)?;
    let temporary = artifact
        .destination
        .with_extension(format!("vcg-tmp-{}", std::process::id()));
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|source| RetroArchError::Io {
            operation: "remove stale runtime artifact temporary",
            path: temporary.clone(),
            source,
        })?;
    }
    fs::copy(&artifact.source, &temporary).map_err(|source| RetroArchError::Io {
        operation: "materialize verified runtime artifact",
        path: temporary.clone(),
        source,
    })?;
    verify_file_hash(
        "materialized runtime artifact",
        &temporary,
        &artifact.sha256,
    )?;
    if artifact.destination.exists() {
        fs::remove_file(&artifact.destination).map_err(|source| RetroArchError::Io {
            operation: "replace materialized runtime artifact",
            path: artifact.destination.clone(),
            source,
        })?;
    }
    fs::rename(&temporary, &artifact.destination).map_err(|source| RetroArchError::Io {
        operation: "publish materialized runtime artifact",
        path: artifact.destination.clone(),
        source,
    })?;
    Ok(())
}

fn sandbox_plan(
    frontend: &Path,
    core: &Path,
    base_config: &Path,
    auxiliary: &[PathBuf],
    content: Option<&Path>,
    storage: &RetroArchStorage,
) -> Result<RetroSandboxPlan, RetroArchError> {
    let mut read_only = vec![frontend.to_owned(), core.to_owned(), base_config.to_owned()];
    read_only.extend_from_slice(auxiliary);
    if let Some(content) = content {
        read_only.push(content.to_owned());
    }
    let core_options_parent = storage
        .core_options
        .parent()
        .ok_or_else(|| RetroArchError::UnsafeConfigPath(storage.core_options.clone()))?;
    let read_write = vec![
        storage.session.clone(),
        storage.saves.clone(),
        storage.states.clone(),
        storage.remaps.clone(),
        storage.screenshots.clone(),
        storage.system.clone(),
        core_options_parent.to_owned(),
    ];
    for artifact in &read_only {
        for writable in &read_write {
            let comparable_writable = comparable_planned_path(writable)?;
            if artifact.starts_with(&comparable_writable) {
                return Err(RetroArchError::UnsafeSandboxOverlap {
                    first: artifact.clone(),
                    second: comparable_writable,
                });
            }
        }
    }
    let mut mounts = read_only
        .into_iter()
        .map(|path| RetroSandboxMount {
            path,
            access: RetroSandboxAccess::ReadOnly,
        })
        .chain(read_write.into_iter().map(|path| RetroSandboxMount {
            path,
            access: RetroSandboxAccess::ReadWrite,
        }))
        .collect::<Vec<_>>();
    mounts.sort_unstable_by(|left, right| left.path.cmp(&right.path));
    if let Some(pair) = mounts.windows(2).find(|pair| pair[0].path == pair[1].path) {
        return Err(RetroArchError::UnsafeSandboxOverlap {
            first: pair[0].path.clone(),
            second: pair[1].path.clone(),
        });
    }
    Ok(RetroSandboxPlan {
        mounts,
        capabilities: RetroSandboxCapabilities {
            allowed: vec![
                RetroSandboxCapability::Display,
                RetroSandboxCapability::Audio,
                RetroSandboxCapability::Gamepad,
            ],
            denied: vec![
                RetroSandboxCapability::Network,
                RetroSandboxCapability::Camera,
                RetroSandboxCapability::Microphone,
                RetroSandboxCapability::RawInput,
                RetroSandboxCapability::SourceMedia,
                RetroSandboxCapability::Desktop,
            ],
        },
    })
}

fn comparable_planned_path(path: &Path) -> Result<PathBuf, RetroArchError> {
    let mut ancestor = path;
    let mut suffix = Vec::new();
    while !ancestor.exists() {
        let name = ancestor
            .file_name()
            .ok_or_else(|| RetroArchError::UnsafeConfigPath(path.to_owned()))?;
        suffix.push(name.to_owned());
        ancestor = ancestor
            .parent()
            .ok_or_else(|| RetroArchError::UnsafeConfigPath(path.to_owned()))?;
    }
    let mut comparable = fs::canonicalize(ancestor).map_err(|source| RetroArchError::Io {
        operation: "resolve sandbox path ancestor",
        path: ancestor.to_owned(),
        source,
    })?;
    for name in suffix.into_iter().rev() {
        comparable.push(name);
    }
    Ok(comparable)
}

fn validate_id(kind: &'static str, value: &str) -> Result<(), RetroArchError> {
    let valid = !value.is_empty()
        && value.len() <= 80
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || (byte == b'-' && index > 0)
        })
        && !value.ends_with('-')
        && !value.contains("--");
    if valid {
        Ok(())
    } else {
        Err(RetroArchError::InvalidId {
            kind,
            value: value.to_owned(),
        })
    }
}

fn validate_owned_root(kind: &'static str, path: &Path) -> Result<(), RetroArchError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(RetroArchError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    validate_config_path(path)
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, RetroArchError> {
    let canonical = fs::canonicalize(path).map_err(|source| RetroArchError::Io {
        operation: "resolve trusted directory",
        path: path.to_owned(),
        source,
    })?;
    if !canonical.is_dir() {
        return Err(RetroArchError::NotDirectory {
            kind,
            path: canonical,
        });
    }
    Ok(canonical)
}

fn canonical_package_file(
    kind: &'static str,
    path: &Path,
    install_root: &Path,
) -> Result<PathBuf, RetroArchError> {
    canonical_managed_file(kind, path, install_root)
}

fn canonical_managed_file(
    kind: &'static str,
    path: &Path,
    allowed_root: &Path,
) -> Result<PathBuf, RetroArchError> {
    let canonical = fs::canonicalize(path).map_err(|source| RetroArchError::Io {
        operation: "resolve managed file",
        path: path.to_owned(),
        source,
    })?;
    if !canonical.is_file() {
        return Err(RetroArchError::NotFile {
            kind,
            path: canonical,
        });
    }
    if !canonical.starts_with(allowed_root) {
        return Err(RetroArchError::OutsideManagedRoot {
            kind,
            path: canonical,
            root: allowed_root.to_owned(),
        });
    }
    Ok(canonical)
}

fn verify_file_hash(
    kind: &'static str,
    path: &Path,
    expected: &ExpectedSha256,
) -> Result<(), RetroArchError> {
    let actual = digest_file(path)?;
    if actual == *expected {
        Ok(())
    } else {
        Err(RetroArchError::HashMismatch {
            kind,
            path: path.to_owned(),
            expected: *expected,
            actual,
        })
    }
}

fn digest_file(path: &Path) -> Result<ExpectedSha256, RetroArchError> {
    let mut file = File::open(path).map_err(|source| RetroArchError::Io {
        operation: "open artifact for SHA-256 verification",
        path: path.to_owned(),
        source,
    })?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 16 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|source| RetroArchError::Io {
                operation: "read artifact for SHA-256 verification",
                path: path.to_owned(),
                source,
            })?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(ExpectedSha256(digest.finalize().into()))
}

fn storage_paths(storage: &RetroArchStorage) -> [&Path; 11] {
    [
        &storage.session,
        &storage.config,
        &storage.cache,
        &storage.logs,
        &storage.playlists,
        &storage.saves,
        &storage.states,
        &storage.remaps,
        &storage.screenshots,
        &storage.system,
        &storage.core_options,
    ]
}

fn validate_config_path(path: &Path) -> Result<(), RetroArchError> {
    let value = path.to_string_lossy();
    if value.contains(['"', '\n', '\r']) {
        Err(RetroArchError::UnsafeConfigPath(path.to_owned()))
    } else {
        Ok(())
    }
}

fn render_config(storage: &RetroArchStorage) -> String {
    let mut lines = vec![
        ("config_save_on_exit", "false".to_owned()),
        ("history_list_enable", "false".to_owned()),
        ("network_cmd_enable", "false".to_owned()),
        ("stdin_cmd_enable", "false".to_owned()),
        ("cheevos_enable", "false".to_owned()),
        ("menu_show_online_updater", "false".to_owned()),
        ("menu_show_core_updater", "false".to_owned()),
        ("menu_show_load_core", "false".to_owned()),
        ("menu_show_load_content", "false".to_owned()),
        ("menu_show_configurations", "false".to_owned()),
        ("menu_show_information", "false".to_owned()),
        ("kiosk_mode_enable", "true".to_owned()),
        ("preemptive_frames_enable", "false".to_owned()),
        ("rewind_enable", "false".to_owned()),
        ("run_ahead_enabled", "false".to_owned()),
        ("video_frame_delay", "0".to_owned()),
        ("video_frame_delay_auto", "false".to_owned()),
        ("video_fullscreen", "true".to_owned()),
        ("video_hard_sync", "false".to_owned()),
        ("video_shader_enable", "false".to_owned()),
        ("video_threaded", "false".to_owned()),
        ("load_dummy_on_core_shutdown", "false".to_owned()),
        ("savefile_directory", path_value(&storage.saves)),
        ("savestate_directory", path_value(&storage.states)),
        ("input_remapping_directory", path_value(&storage.remaps)),
        ("screenshot_directory", path_value(&storage.screenshots)),
        ("system_directory", path_value(&storage.system)),
        ("cache_directory", path_value(&storage.cache)),
        ("playlist_directory", path_value(&storage.playlists)),
        ("log_dir", path_value(&storage.logs)),
        ("core_options_path", path_value(&storage.core_options)),
        (
            "content_history_path",
            path_value(&storage.session.join("content_history.lpl")),
        ),
    ];
    lines.sort_unstable_by_key(|(name, _)| *name);
    let mut config = String::from("# Generated by vcg-host. Do not edit.\n");
    for (name, value) in lines {
        config.push_str(name);
        config.push_str(" = \"");
        config.push_str(&value);
        config.push_str("\"\n");
    }
    config
}

fn path_value(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "\\\\")
}

fn create_private_directory(path: &Path) -> Result<(), RetroArchError> {
    fs::create_dir_all(path).map_err(|source| RetroArchError::Io {
        operation: "create private RetroArch directory",
        path: path.to_owned(),
        source,
    })?;
    set_private_directory_permissions(path)
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), RetroArchError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|source| {
        RetroArchError::Io {
            operation: "protect RetroArch directory",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn set_private_directory_permissions(_path: &Path) -> Result<(), RetroArchError> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), RetroArchError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|source| {
        RetroArchError::Io {
            operation: "protect RetroArch configuration",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn set_private_file_permissions(_path: &Path) -> Result<(), RetroArchError> {
    Ok(())
}

/// Invalid request or filesystem failure during planning/preparation.
#[derive(Debug)]
pub enum RetroArchError {
    InvalidId {
        kind: &'static str,
        value: String,
    },
    UnsafeRoot {
        kind: &'static str,
        path: PathBuf,
    },
    NotDirectory {
        kind: &'static str,
        path: PathBuf,
    },
    NotFile {
        kind: &'static str,
        path: PathBuf,
    },
    OutsideManagedRoot {
        kind: &'static str,
        path: PathBuf,
        root: PathBuf,
    },
    MissingContentRoot,
    MissingContentHash,
    UnexpectedContentHash,
    UnsafeSandboxOverlap {
        first: PathBuf,
        second: PathBuf,
    },
    HashMismatch {
        kind: &'static str,
        path: PathBuf,
        expected: ExpectedSha256,
        actual: ExpectedSha256,
    },
    UnsafeConfigPath(PathBuf),
    UnsafeRuntimeName(String),
    DuplicateRuntimeArtifact(String),
    LaunchPlan(String),
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for RetroArchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidId { kind, value } => {
                write!(
                    formatter,
                    "{kind} ID is not a safe package identifier: {value}"
                )
            }
            Self::UnsafeRoot { kind, path } => {
                write!(
                    formatter,
                    "{kind} must be an absolute normalized path: {}",
                    path.display()
                )
            }
            Self::NotDirectory { kind, path } => {
                write!(formatter, "{kind} is not a directory: {}", path.display())
            }
            Self::NotFile { kind, path } => {
                write!(
                    formatter,
                    "{kind} is not a regular file: {}",
                    path.display()
                )
            }
            Self::OutsideManagedRoot { kind, path, root } => write!(
                formatter,
                "{kind} is outside its console-managed root: {} is not under {}",
                path.display(),
                root.display()
            ),
            Self::MissingContentRoot => {
                formatter.write_str("managed content requires an explicit content root")
            }
            Self::MissingContentHash => {
                formatter.write_str("managed content requires an expected SHA-256")
            }
            Self::UnexpectedContentHash => {
                formatter.write_str("contentless launch cannot declare a content SHA-256")
            }
            Self::UnsafeSandboxOverlap { first, second } => write!(
                formatter,
                "sandbox paths overlap unsafely: {} and {}",
                first.display(),
                second.display()
            ),
            Self::HashMismatch {
                kind,
                path,
                expected,
                actual,
            } => write!(
                formatter,
                "{kind} SHA-256 mismatch at {}: expected {expected}, got {actual}",
                path.display()
            ),
            Self::UnsafeConfigPath(path) => write!(
                formatter,
                "path cannot be represented safely in RetroArch configuration: {}",
                path.display()
            ),
            Self::UnsafeRuntimeName(name) => {
                write!(formatter, "unsafe frontend runtime filename: {name}")
            }
            Self::DuplicateRuntimeArtifact(name) => {
                write!(formatter, "duplicate frontend runtime filename: {name}")
            }
            Self::LaunchPlan(message) => write!(formatter, "cannot create launch plan: {message}"),
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} at {}: {source}", path.display()),
        }
    }
}

impl std::error::Error for RetroArchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::ffi::OsStr;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        ExpectedSha256, RetroArchAuxiliaryArtifact, RetroArchError, RetroArchRequest,
        RetroSandboxAccess, RetroSandboxCapability, digest_file, plan,
    };

    struct Fixture {
        root: PathBuf,
        install: PathBuf,
        content_store: PathBuf,
        runtime: PathBuf,
        data: PathBuf,
        frontend: PathBuf,
        core: PathBuf,
        content: PathBuf,
        config: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "vcg-retroarch-test-{}-{unique}",
                std::process::id()
            ));
            let install = root.join("installed");
            let content_store = root.join("content");
            let runtime = root.join("runtime");
            let data = root.join("data");
            fs::create_dir_all(install.join("cores")).expect("create install");
            fs::create_dir_all(&content_store).expect("create content store");
            let frontend = install.join("retroarch");
            let core = install.join("cores").join("test_libretro.so");
            let content = content_store.join("test.rom");
            let config = install.join("retroarch-base.cfg");
            for path in [&frontend, &core, &content, &config] {
                fs::write(path, b"fixture").expect("create fixture file");
            }
            Self {
                root,
                install,
                content_store,
                runtime,
                data,
                frontend,
                core,
                content,
                config,
            }
        }

        fn request(&self) -> RetroArchRequest {
            RetroArchRequest {
                install_root: self.install.clone(),
                content_root: Some(self.content_store.clone()),
                runtime_root: self.runtime.clone(),
                data_root: self.data.clone(),
                frontend: self.frontend.clone(),
                frontend_sha256: digest_file(&self.frontend).expect("hash frontend"),
                core: self.core.clone(),
                core_sha256: digest_file(&self.core).expect("hash core"),
                content: Some(self.content.clone()),
                content_sha256: Some(digest_file(&self.content).expect("hash content")),
                base_config: self.config.clone(),
                base_config_sha256: digest_file(&self.config).expect("hash base configuration"),
                auxiliary: Vec::new(),
                profile_id: "player-one".to_owned(),
                game_id: "test-game".to_owned(),
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn builds_a_direct_content_launch_with_isolated_paths() {
        let fixture = Fixture::new();
        let plan = plan(&fixture.request()).expect("valid plan");
        assert_eq!(
            plan.launch().program(),
            fixture
                .runtime
                .join("retroarch/player-one/test-game/frontend/retroarch")
                .as_path()
        );
        let arguments = plan.launch().arguments().collect::<Vec<_>>();
        assert_eq!(arguments[0], OsStr::new("--config"));
        let canonical_core = fs::canonicalize(&fixture.core).expect("canonical core");
        let canonical_content = fs::canonicalize(&fixture.content).expect("canonical content");
        assert!(arguments.contains(&canonical_core.as_os_str()));
        assert!(arguments.contains(&canonical_content.as_os_str()));
        assert!(!arguments.contains(&OsStr::new("--menu")));
        assert!(!plan.contentless());
        assert!(
            plan.storage()
                .saves
                .ends_with("player-one/games/test-game/saves")
        );
        assert!(
            plan.generated_config()
                .contains("network_cmd_enable = \"false\"")
        );
        assert!(
            plan.generated_config()
                .contains("kiosk_mode_enable = \"true\"")
        );
        for conservative_default in [
            "preemptive_frames_enable = \"false\"",
            "rewind_enable = \"false\"",
            "run_ahead_enabled = \"false\"",
            "video_frame_delay = \"0\"",
            "video_frame_delay_auto = \"false\"",
            "video_hard_sync = \"false\"",
            "video_shader_enable = \"false\"",
            "video_threaded = \"false\"",
        ] {
            assert!(
                plan.generated_config().contains(conservative_default),
                "missing conservative experience default: {conservative_default}"
            );
        }
    }

    #[test]
    fn derives_a_minimal_read_only_and_writable_sandbox_intent() {
        let fixture = Fixture::new();
        let plan = plan(&fixture.request()).expect("valid plan");
        let sandbox = plan.sandbox();
        let read_only = sandbox
            .mounts()
            .iter()
            .filter(|mount| mount.access == RetroSandboxAccess::ReadOnly)
            .map(|mount| mount.path.as_path())
            .collect::<Vec<_>>();
        let read_write = sandbox
            .mounts()
            .iter()
            .filter(|mount| mount.access == RetroSandboxAccess::ReadWrite)
            .map(|mount| mount.path.as_path())
            .collect::<Vec<_>>();
        for artifact in [
            &fixture.frontend,
            &fixture.core,
            &fixture.config,
            &fixture.content,
        ] {
            let canonical = fs::canonicalize(artifact).expect("artifact canonicalizes");
            assert!(read_only.contains(&canonical.as_path()));
        }
        assert!(read_write.contains(&plan.storage().session.as_path()));
        for directory in [
            &plan.storage().saves,
            &plan.storage().states,
            &plan.storage().remaps,
            &plan.storage().screenshots,
            &plan.storage().system,
        ] {
            assert!(read_write.contains(&directory.as_path()));
        }
        assert!(
            !sandbox.mounts().iter().any(|mount| {
                mount.path == fixture.install || mount.path == fixture.content_store
            })
        );
    }

    #[test]
    fn materializes_and_rehashes_signed_frontend_runtime_artifacts() {
        let fixture = Fixture::new();
        let auxiliary = fixture.install.join("libstdcxx-6.dll");
        fs::write(&auxiliary, b"signed loader dependency").expect("write auxiliary artifact");
        let mut request = fixture.request();
        request.auxiliary.push(RetroArchAuxiliaryArtifact {
            path: auxiliary.clone(),
            sha256: digest_file(&auxiliary).expect("hash auxiliary artifact"),
            runtime_name: Some("libstdc++-6.dll".to_owned()),
        });

        let plan = plan(&request).expect("plan with signed auxiliary artifact");
        plan.prepare()
            .expect("materialize verified frontend runtime");
        assert_eq!(
            fs::read(plan.launch().program()).expect("read materialized frontend"),
            b"fixture"
        );
        assert_eq!(
            fs::read(
                fixture
                    .runtime
                    .join("retroarch/player-one/test-game/frontend/libstdc++-6.dll")
            )
            .expect("read materialized alias"),
            b"signed loader dependency"
        );
        assert!(plan.sandbox().mounts().iter().any(|mount| {
            mount.access == RetroSandboxAccess::ReadOnly
                && mount.path == fs::canonicalize(&auxiliary).expect("canonical auxiliary")
        }));

        fs::write(&auxiliary, b"changed dependency").expect("change auxiliary artifact");
        assert!(matches!(
            plan.prepare(),
            Err(RetroArchError::HashMismatch {
                kind: "runtime source artifact",
                ..
            })
        ));
    }

    #[test]
    fn denies_ambient_and_source_media_authority() {
        let fixture = Fixture::new();
        let plan = plan(&fixture.request()).expect("valid plan");
        let capabilities = plan.sandbox().capabilities();
        assert_eq!(
            capabilities.allowed(),
            [
                RetroSandboxCapability::Display,
                RetroSandboxCapability::Audio,
                RetroSandboxCapability::Gamepad,
            ]
        );
        assert_eq!(
            capabilities.denied(),
            [
                RetroSandboxCapability::Network,
                RetroSandboxCapability::Camera,
                RetroSandboxCapability::Microphone,
                RetroSandboxCapability::RawInput,
                RetroSandboxCapability::SourceMedia,
                RetroSandboxCapability::Desktop,
            ]
        );
    }

    #[test]
    fn contentless_plan_exposes_no_content_store() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.content = None;
        request.content_sha256 = None;
        request.content_root = None;
        let plan = plan(&request).expect("contentless plan");
        assert!(
            !plan
                .sandbox()
                .mounts()
                .iter()
                .any(|mount| mount.path.starts_with(&fixture.content_store))
        );
    }

    #[test]
    fn rejects_read_only_content_nested_in_writable_game_data() {
        let fixture = Fixture::new();
        let content = fixture
            .data
            .join("profiles/player-one/games/test-game/saves/test.rom");
        fs::create_dir_all(content.parent().expect("content parent"))
            .expect("create writable content parent");
        fs::write(&content, b"managed content in unsafe location").expect("write content");
        let mut request = fixture.request();
        request.content_root = Some(fixture.data.clone());
        request.content = Some(content.clone());
        request.content_sha256 = Some(digest_file(&content).expect("hash content"));
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::UnsafeSandboxOverlap { .. })
        ));
    }

    #[test]
    fn prepares_private_session_and_persistent_directories() {
        let fixture = Fixture::new();
        let plan = plan(&fixture.request()).expect("valid plan");
        plan.prepare().expect("prepare plan");
        assert_eq!(
            fs::read_to_string(&plan.storage().config).expect("read config"),
            plan.generated_config()
        );
        for path in [
            &plan.storage().cache,
            &plan.storage().saves,
            &plan.storage().states,
            &plan.storage().remaps,
        ] {
            assert!(path.is_dir(), "{} is a directory", path.display());
        }
    }

    #[test]
    fn contentless_core_uses_the_bounded_menu_handoff() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.content = None;
        request.content_sha256 = None;
        request.content_root = None;
        let plan = plan(&request).expect("contentless plan");
        assert!(plan.contentless());
        assert!(
            plan.launch()
                .arguments()
                .any(|argument| argument == OsStr::new("--menu"))
        );
    }

    #[test]
    fn rejects_content_outside_the_console_store() {
        let fixture = Fixture::new();
        let outside = fixture.root.join("outside.rom");
        fs::write(&outside, b"not imported").expect("write outside content");
        let mut request = fixture.request();
        request.content = Some(outside);
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::OutsideManagedRoot {
                kind: "content",
                ..
            })
        ));
    }

    #[test]
    fn rejects_package_artifacts_outside_the_install_root() {
        let fixture = Fixture::new();
        let outside = fixture.root.join("outside-core.so");
        fs::write(&outside, b"unmanaged core").expect("write outside core");
        let mut request = fixture.request();
        request.core = outside;
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::OutsideManagedRoot { kind: "core", .. })
        ));
    }

    #[test]
    fn rejects_path_traversal_ids_and_relative_owned_roots() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.profile_id = "../other".to_owned();
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::InvalidId {
                kind: "profile",
                ..
            })
        ));

        let mut request = fixture.request();
        request.runtime_root = Path::new("relative/runtime").to_owned();
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::UnsafeRoot {
                kind: "runtime root",
                ..
            })
        ));
    }

    #[test]
    fn requires_a_content_root_when_content_is_present() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.content_root = None;
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::MissingContentRoot)
        ));
    }

    #[test]
    fn rejects_an_artifact_that_does_not_match_the_manifest_hash() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.core_sha256 = ExpectedSha256([0; 32]);
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::HashMismatch { kind: "core", .. })
        ));

        let mut request = fixture.request();
        request.base_config_sha256 = ExpectedSha256([0; 32]);
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::HashMismatch {
                kind: "base configuration",
                ..
            })
        ));
    }

    #[test]
    fn rejects_missing_or_unexpected_content_hashes() {
        let fixture = Fixture::new();
        let mut request = fixture.request();
        request.content_sha256 = None;
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::MissingContentHash)
        ));

        let mut request = fixture.request();
        request.content = None;
        assert!(matches!(
            plan(&request),
            Err(RetroArchError::UnexpectedContentHash)
        ));
    }

    #[test]
    fn parses_only_canonical_lowercase_sha256_text() {
        let valid = "ab".repeat(32);
        assert_eq!(
            valid
                .parse::<ExpectedSha256>()
                .expect("valid hash")
                .to_string(),
            valid
        );
        assert!("AB".repeat(32).parse::<ExpectedSha256>().is_err());
        assert!("a".repeat(63).parse::<ExpectedSha256>().is_err());
        assert!("g0".repeat(32).parse::<ExpectedSha256>().is_err());
    }
}
