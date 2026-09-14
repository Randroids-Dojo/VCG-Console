use std::env;
use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, Instant};

use vcg_host::bluetooth::BluetoothPairingService;
use vcg_host::host_api::{
    HOST_API_PROTOCOL_VERSION, HostCapabilities, HostLaunchPolicy, HostStatusServer,
};
use vcg_host::installed_catalog::{CatalogRoots, TrustedPackageCatalog};
use vcg_host::launcher::{LauncherRequest, loopback_origin, plan as plan_launcher};
use vcg_host::native_launch::NativeLaunchService;
use vcg_host::package_generation::{
    MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES, PackageGenerationConfig, PackageGenerationStore,
    ProtectedPackageGenerationState, RecoveryOutcome,
};
use vcg_host::process::{FileHealthProbe, LaunchSpec, ProcessSupervisor, WatchdogPolicy};
use vcg_host::profile_registry::{HostProfileRegistry, MAX_PROFILE_REGISTRY_BYTES};
use vcg_host::reserved_input::{
    RESERVED_GESTURE_HOLD_MILLIS, start as start_reserved_input_router,
};
use vcg_host::retro_import::{
    RETRO_OPERATOR_PROVISIONED_TRANSPORT, RetroImportStore, RetroImportStoreConfig,
    RetroLibrarySnapshot, RetroSignedSystemPolicy,
};
use vcg_host::retroarch::{
    ContentlessStart, ExpectedSha256, RetroArchRequest, plan as plan_retroarch,
};
use vcg_host::storage_layout::StorageNamespacePlan;
use vcg_host::update_root_store::{
    MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES, ProtectedUpdateRootState, RootAcceptance,
    UpdateRootStore, UpdateRootStoreConfig,
};
use vcg_host::update_trust::{
    DetachedUpdateSignatures, MAX_RETRO_SYSTEM_POLICY_BYTES, MAX_UPDATE_ROOT_ANCHOR_BYTES,
    MAX_UPDATE_ROOT_METADATA_BYTES, MAX_UPDATE_SIGNATURE_BUNDLE_BYTES, RootTrustAnchorSet,
    TrustedUpdatePolicy,
};

#[path = "cli/launcher.rs"]
mod launcher_command;
use launcher_command::{HostUpdateTrustOptions, launcher};

#[path = "cli/update_root.rs"]
mod update_root_command;
use update_root_command::update_root;

#[path = "cli/retroarch.rs"]
mod retroarch_command;
use retroarch_command::retroarch;

#[path = "cli/provision.rs"]
mod provision_command;
use provision_command::retro_provision;

#[path = "cli/process.rs"]
mod process_command;
use process_command::{supervise, watchdog};

fn main() -> ExitCode {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    match run(&arguments) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("vcg-host: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run(arguments: &[OsString]) -> Result<ExitCode, String> {
    let Some(command) = arguments.first().and_then(|argument| argument.to_str()) else {
        return Err(usage());
    };

    match command {
        "doctor" => {
            println!("vcg-host {}", env!("CARGO_PKG_VERSION"));
            println!("target: {}-{}", env::consts::ARCH, env::consts::OS);
            println!("launcher-shell: loopback-chromium-app-mode");
            println!("process-supervision: available");
            println!("game-watchdog: heartbeat-and-bounded-restart");
            println!("retroarch-adapter: plan-and-direct-launch");
            println!("retroarch-integrity: sha256-required");
            println!("retroarch-contentless-start: core-direct-default");
            println!("installed-catalog: ed25519-signed-target-qualified");
            println!("package-generations: protected-crash-recoverable-active-store");
            println!("native-launch: fixed-intent-process-lifecycle");
            println!("native-launch-watchdog: host-game-opt-in");
            println!("native-launch-replay: durable-bounded-fail-closed");
            println!("retro-library: session-import-and-operator-provisioning");
            println!("retroarch-readiness: compositor-adapter-pending");
            println!("reserved-input: observed-select-start-hold-or-home");
            println!("resource-fault-detection: adapter-required");
            println!("controller-registry: bounded-opaque-lifecycle");
            println!("sdl3-input: adapter pending target-Linux qualification");
            Ok(ExitCode::SUCCESS)
        }
        "launcher" => launcher(&arguments[1..]),
        "update-root" => update_root(&arguments[1..]),
        "supervise" => supervise(&arguments[1..]),
        "watchdog" => watchdog(&arguments[1..]),
        "retroarch" => retroarch(&arguments[1..]),
        "retro-provision" => retro_provision(&arguments[1..]),
        "help" | "--help" | "-h" => {
            println!("{}", usage());
            Ok(ExitCode::SUCCESS)
        }
        _ => Err(usage()),
    }
}

fn required_next_path(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
) -> Result<PathBuf, String> {
    *cursor += 1;
    required_path(arguments, *cursor, option)
}

fn required_next_text(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
) -> Result<String, String> {
    *cursor += 1;
    required_text(arguments, *cursor, option)
}

fn required_next_number(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
) -> Result<u64, String> {
    *cursor += 1;
    required_number(arguments, *cursor, option)
}

fn set_path_option(slot: &mut Option<PathBuf>, value: PathBuf, option: &str) -> Result<(), String> {
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

fn set_text_option(slot: &mut Option<String>, value: String, option: &str) -> Result<(), String> {
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

fn set_number_option(slot: &mut Option<u64>, value: u64, option: &str) -> Result<(), String> {
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

/// Parses one option value and records it, rejecting a repeated option.
fn set_parsed_option<T>(slot: &mut Option<T>, value: &str, option: &str) -> Result<(), String>
where
    T: FromStr,
    T::Err: fmt::Display,
{
    let value = value
        .parse::<T>()
        .map_err(|error| format!("{option}: {error}"))?;
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

fn current_target() -> String {
    format!("{}-{}", env::consts::ARCH, env::consts::OS)
}

fn load_update_signatures(
    path: &Path,
    kind: &'static str,
) -> Result<DetachedUpdateSignatures, String> {
    DetachedUpdateSignatures::from_json_bytes(&read_bounded_host_file(
        path,
        MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
        kind,
    )?)
    .map_err(|error| error.to_string())
}

fn read_bounded_host_file(
    path: &Path,
    maximum_bytes: usize,
    kind: &'static str,
) -> Result<Vec<u8>, String> {
    if !path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                std::path::Component::CurDir | std::path::Component::ParentDir
            )
        })
    {
        return Err(format!("{kind} path must be absolute and normalized"));
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("failed to inspect {kind} {}: {error}", path.display()))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(format!("{kind} must be a regular non-symlink file"));
    }
    let limit = u64::try_from(maximum_bytes).map_err(|_| format!("{kind} limit is invalid"))?;
    if metadata.len() == 0 || metadata.len() > limit {
        return Err(format!("{kind} must be 1..={maximum_bytes} bytes"));
    }
    let mut bytes = Vec::with_capacity(
        usize::try_from(metadata.len()).map_err(|_| format!("{kind} is too large"))?,
    );
    fs::File::open(path)
        .and_then(|file| file.take(limit + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("failed to read {kind} {}: {error}", path.display()))?;
    if bytes.is_empty() || bytes.len() > maximum_bytes {
        return Err(format!("{kind} must be 1..={maximum_bytes} bytes"));
    }
    Ok(bytes)
}

fn required_text(arguments: &[OsString], cursor: usize, option: &str) -> Result<String, String> {
    arguments
        .get(cursor)
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("{option} requires a non-empty UTF-8 value"))
}

fn required_path(arguments: &[OsString], cursor: usize, option: &str) -> Result<PathBuf, String> {
    let value = arguments
        .get(cursor)
        .ok_or_else(|| format!("{option} requires a path"))?;
    if value.is_empty() {
        return Err(format!("{option} requires a non-empty path"));
    }
    Ok(PathBuf::from(value))
}

fn required_number(arguments: &[OsString], cursor: usize, option: &str) -> Result<u64, String> {
    arguments
        .get(cursor)
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("{option} requires an integer"))?
        .parse()
        .map_err(|_| format!("{option} requires an integer"))
}

fn usage() -> String {
    "usage:\n  vcg-host doctor\n  vcg-host launcher [--dry-run] [--windowed] --browser <path> [--bluetoothctl <absolute-path>] [--cursor-nudge <absolute-path>] --profile-dir <path> --url <loopback-http-url> [--catalog <path> --catalog-signature <path> --install-root <path> | --package-store-root <path> --package-protected-state <path>] --update-root-store <path> --update-root-anchors <path> --update-root-protected-state <path> --update-channel <channel> --trusted-unix-seconds <seconds> --runtime-root <path> --data-root <path> [--content-root <path>] [--profile-registry <path> | --profile-id <development-id>...] [--launch-replay-root <path>] [--retro-library-root <path>] [--watchdog-game-id <id>]...\n  vcg-host update-root bootstrap|rotate --store-root <path> --root <path> --root-signatures <path> --root-anchors <path> --protected-state <path> --trusted-unix-seconds <seconds>\n  vcg-host update-root recover --store-root <path>\n  vcg-host supervise [--dry-run] -- <program> [arguments...]\n  vcg-host watchdog [options] --heartbeat-file <path> [--fault-file <path>] -- <program> [arguments...]\n  vcg-host retroarch [--dry-run] --install-root <path> --runtime-root <path> --data-root <path> --frontend <path> --frontend-sha256 <hex> --core <path> --core-sha256 <hex> --base-config <path> --base-config-sha256 <hex> --profile <id> --game <id> [--content-root <path> --content <path> --content-sha256 <hex>] [--contentless-start core|menu]\n  vcg-host retro-provision [--dry-run] --writable-root <path> --payload <staged-payload-path> --system-policy <path> --system-policy-signature <path> --update-root-store <path> --update-root-anchors <path> --update-root-protected-state <path> --update-channel <channel> --trusted-unix-seconds <seconds> --reserve-bytes <bytes>"
        .to_owned()
}

#[cfg(test)]
#[path = "cli/tests.rs"]
mod tests;
