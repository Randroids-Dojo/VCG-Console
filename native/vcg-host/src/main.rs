use std::env;
use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::str::FromStr;
use std::time::Duration;

use vcg_host::bluetooth::BluetoothPairingService;
use vcg_host::host_api::{HOST_API_PROTOCOL_VERSION, HostStatusServer};
use vcg_host::installed_catalog::{CatalogRoots, TrustedPackageCatalog};
use vcg_host::launcher::{LauncherRequest, loopback_origin, plan as plan_launcher};
use vcg_host::native_launch::NativeLaunchService;
use vcg_host::package_generation::{
    MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES, PackageGenerationConfig, PackageGenerationStore,
    ProtectedPackageGenerationState, RecoveryOutcome,
};
use vcg_host::process::{FileHealthProbe, LaunchSpec, ProcessSupervisor, WatchdogPolicy};
use vcg_host::profile_registry::{HostProfileRegistry, MAX_PROFILE_REGISTRY_BYTES};
use vcg_host::retroarch::{
    ContentlessStart, ExpectedSha256, RetroArchRequest, plan as plan_retroarch,
};
use vcg_host::update_root_store::{
    MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES, ProtectedUpdateRootState, RootAcceptance,
    UpdateRootStore, UpdateRootStoreConfig,
};
use vcg_host::update_trust::{
    DetachedUpdateSignatures, MAX_UPDATE_ROOT_ANCHOR_BYTES, MAX_UPDATE_ROOT_METADATA_BYTES,
    MAX_UPDATE_SIGNATURE_BUNDLE_BYTES, RootTrustAnchorSet, TrustedUpdatePolicy,
};

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
            println!("retroarch-readiness: compositor-adapter-pending");
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
        "help" | "--help" | "-h" => {
            println!("{}", usage());
            Ok(ExitCode::SUCCESS)
        }
        _ => Err(usage()),
    }
}

#[derive(Default)]
struct LauncherOptions {
    dry_run: bool,
    windowed: bool,
    browser: Option<PathBuf>,
    bluetoothctl: Option<PathBuf>,
    profile_dir: Option<PathBuf>,
    url: Option<String>,
    catalog: Option<PathBuf>,
    catalog_signature: Option<PathBuf>,
    package_store_root: Option<PathBuf>,
    package_protected_state: Option<PathBuf>,
    install_root: Option<PathBuf>,
    content_root: Option<PathBuf>,
    runtime_root: Option<PathBuf>,
    data_root: Option<PathBuf>,
    launch_replay_root: Option<PathBuf>,
    profile_registry: Option<PathBuf>,
    profile_ids: Vec<String>,
    watchdog_game_ids: Vec<String>,
    update_root_store: Option<PathBuf>,
    update_root_anchors: Option<PathBuf>,
    update_root_protected_state: Option<PathBuf>,
    update_channel: Option<String>,
    trusted_unix_seconds: Option<u64>,
}

struct LauncherCatalogOptions {
    source: LauncherCatalogSourceOptions,
    update_trust: LauncherUpdateTrustOptions,
    profiles: LauncherProfileSource,
    watchdog_game_ids: Vec<String>,
    launch_replay_root: Option<PathBuf>,
}

enum LauncherProfileSource {
    Registry(PathBuf),
    DevelopmentIds(Vec<String>),
}

enum LauncherCatalogSourceOptions {
    Loose {
        catalog: PathBuf,
        signature: PathBuf,
        roots: CatalogRoots,
    },
    GenerationStore {
        store_root: PathBuf,
        protected_state: PathBuf,
        content_root: Option<PathBuf>,
        runtime_root: PathBuf,
        data_root: PathBuf,
    },
}

struct LauncherUpdateTrustOptions {
    store_root: PathBuf,
    root_anchors: PathBuf,
    protected_state: PathBuf,
    channel: String,
    trusted_unix_seconds: u64,
}

struct LauncherCatalogConfiguration {
    catalog: TrustedPackageCatalog,
    profile_ids: Vec<String>,
    watchdog_game_ids: Vec<String>,
    launch_replay_root: Option<PathBuf>,
    source: &'static str,
    recovery: Option<RecoveryOutcome>,
    root_recovery: Option<usize>,
}

fn launcher(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, request, catalog_options, bluetoothctl) = launcher_request(arguments)?;
    // Validate the browser request before a real launcher startup is allowed
    // to recover or otherwise mutate package-store state.
    let initial_spec = plan_launcher(&request).map_err(|error| error.to_string())?;
    let origin = loopback_origin(request.url()).map_err(|error| error.to_string())?;
    let catalog_configuration = catalog_options
        .map(|options| options.load(!dry_run))
        .transpose()?;
    if dry_run {
        if let Some(executable) = bluetoothctl {
            BluetoothPairingService::new(executable).map_err(|error| error.to_string())?;
            println!("launcher:bluetooth-controller-pairing configured");
        }
        println!("launcher:plan mode=dry-run");
        if let Some(configuration) = &catalog_configuration {
            println!(
                "launcher:catalog source={} generation={} target={}",
                configuration.source,
                configuration.catalog.generation(),
                configuration.catalog.target()
            );
            println!(
                "launcher:profiles count={}",
                configuration.profile_ids.len()
            );
            println!(
                "launcher:watchdog-games count={}",
                configuration.watchdog_game_ids.len()
            );
            if !configuration.profile_ids.is_empty() {
                NativeLaunchService::with_watchdog_games(
                    std::sync::Arc::new(configuration.catalog.clone()),
                    configuration.profile_ids.clone(),
                    configuration.watchdog_game_ids.clone(),
                    WatchdogPolicy::local_game_defaults(),
                )
                .map_err(|error| error.to_string())?;
                if !configuration
                    .launch_replay_root
                    .as_deref()
                    .is_some_and(Path::is_absolute)
                {
                    return Err("launcher replay root must be absolute".to_owned());
                }
            }
        }
        println!("program: {}", initial_spec.program().display());
        for argument in initial_spec.arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        return Ok(ExitCode::SUCCESS);
    }

    let bluetooth_service = bluetoothctl
        .map(BluetoothPairingService::new)
        .transpose()
        .map_err(|error| error.to_string())?;
    let host_api = start_launcher_host_api(origin, catalog_configuration, bluetooth_service)?;
    let launcher_url = host_api
        .launcher_url(request.url())
        .map_err(|error| error.to_string())?;
    let request = request.with_url(launcher_url);
    let spec = plan_launcher(&request).map_err(|error| error.to_string())?;
    fs::create_dir_all(request.profile_dir())
        .map_err(|error| format!("failed to create launcher profile directory: {error}"))?;
    println!(
        "launcher:host-api address={} protocol={}",
        host_api.address(),
        HOST_API_PROTOCOL_VERSION
    );
    let child = ProcessSupervisor
        .launch(&spec)
        .map_err(|error| error.to_string())?;
    println!(
        "launcher:started pid={} origin={}",
        child.id(),
        host_api.allowed_origin()
    );
    let status = child.wait().map_err(|error| error.to_string())?;
    println!(
        "launcher:completed exit_code={}",
        status
            .code()
            .map_or_else(|| "signal".to_owned(), |code| code.to_string())
    );
    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

fn start_launcher_host_api(
    origin: String,
    configuration: Option<LauncherCatalogConfiguration>,
    bluetooth_service: Option<BluetoothPairingService>,
) -> Result<HostStatusServer, String> {
    let Some(configuration) = configuration else {
        return match bluetooth_service {
            Some(service) => HostStatusServer::start_with_bluetooth(origin, service),
            None => HostStatusServer::start(origin),
        }
        .map_err(|error| error.to_string());
    };
    report_root_recovery(configuration.root_recovery);
    report_package_recovery(configuration.recovery);
    if configuration.profile_ids.is_empty() {
        return match bluetooth_service {
            Some(service) => HostStatusServer::start_with_catalog_and_bluetooth(
                origin,
                configuration.catalog,
                service,
            ),
            None => HostStatusServer::start_with_catalog(origin, configuration.catalog),
        }
        .map_err(|error| error.to_string());
    }
    let launch_replay_root = configuration
        .launch_replay_root
        .expect("launch profiles require replay root");
    let server = match (
        configuration.watchdog_game_ids.is_empty(),
        bluetooth_service,
    ) {
        (true, Some(service)) => {
            HostStatusServer::start_with_persistent_launch_service_and_bluetooth(
                origin,
                configuration.catalog,
                configuration.profile_ids,
                &launch_replay_root,
                service,
            )
        }
        (true, None) => HostStatusServer::start_with_persistent_launch_service(
            origin,
            configuration.catalog,
            configuration.profile_ids,
            &launch_replay_root,
        ),
        (false, Some(service)) => {
            HostStatusServer::start_with_persistent_watchdog_launch_service_and_bluetooth(
                origin,
                configuration.catalog,
                configuration.profile_ids,
                configuration.watchdog_game_ids,
                WatchdogPolicy::local_game_defaults(),
                &launch_replay_root,
                service,
            )
        }
        (false, None) => HostStatusServer::start_with_persistent_watchdog_launch_service(
            origin,
            configuration.catalog,
            configuration.profile_ids,
            configuration.watchdog_game_ids,
            WatchdogPolicy::local_game_defaults(),
            &launch_replay_root,
        ),
    };
    server.map_err(|error| error.to_string())
}

fn report_root_recovery(recovered_directories: Option<usize>) {
    if let Some(recovered_directories) = recovered_directories {
        println!("launcher:update-root-recovery removed-unpublished={recovered_directories}");
    }
}

fn report_package_recovery(recovery: Option<RecoveryOutcome>) {
    if let Some(recovery) = recovery {
        match recovery {
            RecoveryOutcome::Clean => println!("launcher:package-recovery state=clean"),
            RecoveryOutcome::ProtectionCommitRequired { state } => {
                println!(
                    "launcher:package-recovery state=protection-commit-required generation={}",
                    state.generation()
                );
            }
        }
    }
}

impl LauncherCatalogOptions {
    fn load(self, recover: bool) -> Result<LauncherCatalogConfiguration, String> {
        let profile_ids = self.profiles.load()?;
        if !self.watchdog_game_ids.is_empty() && profile_ids.is_empty() {
            return Err("watchdog games require at least one registered profile".to_owned());
        }
        if !profile_ids.is_empty() && self.launch_replay_root.is_none() {
            return Err("nonempty profile registry requires --launch-replay-root".to_owned());
        }
        let package_protected_state = match &self.source {
            LauncherCatalogSourceOptions::Loose { .. } => None,
            LauncherCatalogSourceOptions::GenerationStore {
                protected_state, ..
            } => {
                let state =
                    ProtectedPackageGenerationState::from_json_bytes(&read_bounded_host_file(
                        protected_state,
                        MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES,
                        "package protected state",
                    )?)
                    .map_err(|error| error.to_string())?;
                state
                    .validate_scope(&self.update_trust.channel, &current_target())
                    .map_err(|error| error.to_string())?;
                Some(state)
            }
        };
        let (update_policy, root_recovery) = self.update_trust.load(recover)?;
        let (catalog, source, recovery) = match self.source {
            LauncherCatalogSourceOptions::Loose {
                catalog,
                signature,
                roots,
            } => (
                TrustedPackageCatalog::load_with_update_role(
                    &catalog,
                    &load_update_signatures(&signature)?,
                    &update_policy,
                    &current_target(),
                    roots,
                )
                .map_err(|error| error.to_string())?,
                "loose-catalog",
                None,
            ),
            LauncherCatalogSourceOptions::GenerationStore {
                store_root,
                protected_state: _,
                content_root,
                runtime_root,
                data_root,
            } => {
                let store = PackageGenerationStore::open(PackageGenerationConfig {
                    store_root,
                    update_policy,
                    protected_state: package_protected_state
                        .expect("generation-store state was parsed before recovery"),
                    content_root,
                    runtime_root,
                    data_root,
                })
                .map_err(|error| error.to_string())?;
                let recovery = if recover {
                    Some(store.recover().map_err(|error| error.to_string())?)
                } else {
                    if store
                        .recovery_required()
                        .map_err(|error| error.to_string())?
                    {
                        return Err(
                            "package generation recovery is required; dry-run does not mutate state"
                                .to_owned(),
                        );
                    }
                    None
                };
                let active = store
                    .load_active()
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| {
                        "package generation store has no active generation".to_owned()
                    })?;
                (active.catalog, "generation-store", recovery)
            }
        };
        Ok(LauncherCatalogConfiguration {
            catalog,
            profile_ids,
            watchdog_game_ids: self.watchdog_game_ids,
            launch_replay_root: self.launch_replay_root,
            source,
            recovery,
            root_recovery,
        })
    }
}

impl LauncherProfileSource {
    fn load(self) -> Result<Vec<String>, String> {
        match self {
            Self::Registry(path) => HostProfileRegistry::from_json_bytes(&read_bounded_host_file(
                &path,
                MAX_PROFILE_REGISTRY_BYTES,
                "profile registry",
            )?)
            .map(HostProfileRegistry::into_profile_ids)
            .map_err(|error| error.to_string()),
            Self::DevelopmentIds(profile_ids) => Ok(profile_ids),
        }
    }
}

impl LauncherUpdateTrustOptions {
    fn load(self, recover: bool) -> Result<(TrustedUpdatePolicy, Option<usize>), String> {
        let anchors = RootTrustAnchorSet::from_json_bytes(&read_bounded_host_file(
            &self.root_anchors,
            MAX_UPDATE_ROOT_ANCHOR_BYTES,
            "update root anchors",
        )?)
        .map_err(|error| error.to_string())?;
        let protected_state = ProtectedUpdateRootState::from_json_bytes(&read_bounded_host_file(
            &self.protected_state,
            MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES,
            "protected update root state",
        )?)
        .map_err(|error| error.to_string())?;
        let store = UpdateRootStore::open(UpdateRootStoreConfig {
            store_root: self.store_root,
        })
        .map_err(|error| error.to_string())?;
        let root_recovery = recover
            .then(|| store.recover().map_err(|error| error.to_string()))
            .transpose()?;
        let root = store
            .load_current(&anchors, &protected_state, self.trusted_unix_seconds)
            .map_err(|error| error.to_string())?;
        let policy = TrustedUpdatePolicy::new(root, self.channel, self.trusted_unix_seconds)
            .map_err(|error| error.to_string())?;
        Ok((policy, root_recovery))
    }
}

#[derive(Clone, Copy)]
enum UpdateRootAction {
    Bootstrap,
    Rotate,
    Recover,
}

#[derive(Default)]
struct UpdateRootOptions {
    store_root: Option<PathBuf>,
    root: Option<PathBuf>,
    root_signatures: Option<PathBuf>,
    root_anchors: Option<PathBuf>,
    protected_state: Option<PathBuf>,
    trusted_unix_seconds: Option<u64>,
}

fn update_root(arguments: &[OsString]) -> Result<ExitCode, String> {
    let action = match arguments.first().and_then(|argument| argument.to_str()) {
        Some("bootstrap") => UpdateRootAction::Bootstrap,
        Some("rotate") => UpdateRootAction::Rotate,
        Some("recover") => UpdateRootAction::Recover,
        _ => return Err(usage()),
    };
    let mut options = UpdateRootOptions::default();
    let mut cursor = 1;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "update-root options must be UTF-8".to_owned())?;
        parse_update_root_option(arguments, &mut cursor, option, &mut options)?;
        cursor += 1;
    }
    let store_root = options
        .store_root
        .ok_or_else(|| "update-root requires --store-root".to_owned())?;
    let store = UpdateRootStore::open(UpdateRootStoreConfig { store_root })
        .map_err(|error| error.to_string())?;

    if matches!(action, UpdateRootAction::Recover) {
        if options.root.is_some()
            || options.root_signatures.is_some()
            || options.root_anchors.is_some()
            || options.protected_state.is_some()
            || options.trusted_unix_seconds.is_some()
        {
            return Err("update-root recover accepts only --store-root".to_owned());
        }
        let removed = store.recover().map_err(|error| error.to_string())?;
        println!("update-root:recovered removed-unpublished={removed}");
        return Ok(ExitCode::SUCCESS);
    }

    let root = read_bounded_host_file(
        &options
            .root
            .ok_or_else(|| "update-root requires --root".to_owned())?,
        MAX_UPDATE_ROOT_METADATA_BYTES,
        "update root metadata",
    )?;
    let root_signatures = read_bounded_host_file(
        &options
            .root_signatures
            .ok_or_else(|| "update-root requires --root-signatures".to_owned())?,
        MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
        "update root signature bundle",
    )?;
    let anchors = RootTrustAnchorSet::from_json_bytes(&read_bounded_host_file(
        &options
            .root_anchors
            .ok_or_else(|| "update-root requires --root-anchors".to_owned())?,
        MAX_UPDATE_ROOT_ANCHOR_BYTES,
        "update root anchors",
    )?)
    .map_err(|error| error.to_string())?;
    let protected_state = ProtectedUpdateRootState::from_json_bytes(&read_bounded_host_file(
        &options
            .protected_state
            .ok_or_else(|| "update-root requires --protected-state".to_owned())?,
        MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES,
        "protected update root state",
    )?)
    .map_err(|error| error.to_string())?;
    let trusted_unix_seconds = options
        .trusted_unix_seconds
        .ok_or_else(|| "update-root requires --trusted-unix-seconds".to_owned())?;
    let accepted = match action {
        UpdateRootAction::Bootstrap => store.bootstrap(
            &root,
            &root_signatures,
            &anchors,
            &protected_state,
            trusted_unix_seconds,
        ),
        UpdateRootAction::Rotate => store.rotate(
            &root,
            &root_signatures,
            &anchors,
            &protected_state,
            trusted_unix_seconds,
        ),
        UpdateRootAction::Recover => unreachable!("recover returned above"),
    }
    .map_err(|error| error.to_string())?;
    report_root_acceptance(action, accepted);
    Ok(ExitCode::SUCCESS)
}

fn report_root_acceptance(action: UpdateRootAction, accepted: RootAcceptance) {
    let operation = match action {
        UpdateRootAction::Bootstrap => "bootstrap",
        UpdateRootAction::Rotate => "rotate",
        UpdateRootAction::Recover => unreachable!("recover returned above"),
    };
    let (status, state) = match accepted {
        RootAcceptance::Active(state) => ("active", state),
        RootAcceptance::ProtectionCommitRequired(state) => ("protected-commit-required", state),
    };
    println!(
        "update-root:accepted operation={operation} status={status} generation={} root_sha256={}",
        state.generation(),
        state
            .root_metadata_sha256()
            .expect("an accepted root state always has a digest")
    );
}

fn parse_update_root_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut UpdateRootOptions,
) -> Result<(), String> {
    if option == "--trusted-unix-seconds" {
        return set_number_option(
            &mut output.trusted_unix_seconds,
            required_next_number(arguments, cursor, option)?,
            option,
        );
    }
    let slot = match option {
        "--store-root" => &mut output.store_root,
        "--root" => &mut output.root,
        "--root-signatures" => &mut output.root_signatures,
        "--root-anchors" => &mut output.root_anchors,
        "--protected-state" => &mut output.protected_state,
        value => return Err(format!("unknown update-root option: {value}")),
    };
    set_path_option(slot, required_next_path(arguments, cursor, option)?, option)
}

fn launcher_request(
    arguments: &[OsString],
) -> Result<
    (
        bool,
        LauncherRequest,
        Option<LauncherCatalogOptions>,
        Option<PathBuf>,
    ),
    String,
> {
    let mut options = LauncherOptions::default();
    let mut cursor = 0;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "launcher options must be UTF-8".to_owned())?;
        parse_launcher_option(arguments, &mut cursor, option, &mut options)?;
        cursor += 1;
    }

    let mut request = LauncherRequest::new(
        options
            .browser
            .take()
            .ok_or_else(|| "launcher requires --browser".to_owned())?,
        options
            .profile_dir
            .take()
            .ok_or_else(|| "launcher requires --profile-dir".to_owned())?,
        options
            .url
            .take()
            .ok_or_else(|| "launcher requires --url".to_owned())?,
    );
    if options.windowed {
        request = request.windowed();
    }
    let dry_run = options.dry_run;
    let bluetoothctl = options.bluetoothctl.take();
    let catalog = launcher_catalog_options(options)?;
    Ok((dry_run, request, catalog, bluetoothctl))
}

fn launcher_catalog_options(
    options: LauncherOptions,
) -> Result<Option<LauncherCatalogOptions>, String> {
    let loose_requested = options.catalog.is_some()
        || options.catalog_signature.is_some()
        || options.install_root.is_some();
    let store_requested = options.package_store_root.is_some();
    if loose_requested && store_requested {
        return Err(
            "launcher accepts either --package-store-root or loose catalog paths, not both"
                .to_owned(),
        );
    }
    if options.package_protected_state.is_some() && !store_requested {
        return Err(
            "--package-protected-state is accepted only with --package-store-root".to_owned(),
        );
    }
    let catalog_requested = loose_requested
        || store_requested
        || options.package_protected_state.is_some()
        || options.content_root.is_some()
        || options.runtime_root.is_some()
        || options.data_root.is_some()
        || options.launch_replay_root.is_some()
        || options.profile_registry.is_some()
        || !options.profile_ids.is_empty()
        || !options.watchdog_game_ids.is_empty()
        || options.update_root_store.is_some()
        || options.update_root_anchors.is_some()
        || options.update_root_protected_state.is_some()
        || options.update_channel.is_some()
        || options.trusted_unix_seconds.is_some();
    validate_launcher_profile_options(&options)?;
    let catalog = if catalog_requested {
        let runtime_root = options
            .runtime_root
            .ok_or_else(|| "launcher catalog requires --runtime-root".to_owned())?;
        let data_root = options
            .data_root
            .ok_or_else(|| "launcher catalog requires --data-root".to_owned())?;
        let update_trust = LauncherUpdateTrustOptions {
            store_root: options
                .update_root_store
                .ok_or_else(|| "launcher catalog requires --update-root-store".to_owned())?,
            root_anchors: options
                .update_root_anchors
                .ok_or_else(|| "launcher catalog requires --update-root-anchors".to_owned())?,
            protected_state: options.update_root_protected_state.ok_or_else(|| {
                "launcher catalog requires --update-root-protected-state".to_owned()
            })?,
            channel: options
                .update_channel
                .ok_or_else(|| "launcher catalog requires --update-channel".to_owned())?,
            trusted_unix_seconds: options
                .trusted_unix_seconds
                .ok_or_else(|| "launcher catalog requires --trusted-unix-seconds".to_owned())?,
        };
        let source = if let Some(store_root) = options.package_store_root {
            LauncherCatalogSourceOptions::GenerationStore {
                store_root,
                protected_state: options.package_protected_state.ok_or_else(|| {
                    "launcher generation store requires --package-protected-state".to_owned()
                })?,
                content_root: options.content_root,
                runtime_root,
                data_root,
            }
        } else {
            LauncherCatalogSourceOptions::Loose {
                catalog: options
                    .catalog
                    .ok_or_else(|| "launcher catalog requires --catalog".to_owned())?,
                signature: options
                    .catalog_signature
                    .ok_or_else(|| "launcher catalog requires --catalog-signature".to_owned())?,
                roots: CatalogRoots {
                    install_root: options
                        .install_root
                        .ok_or_else(|| "launcher catalog requires --install-root".to_owned())?,
                    content_root: options.content_root,
                    runtime_root,
                    data_root,
                },
            }
        };
        let profiles = options.profile_registry.map_or_else(
            || LauncherProfileSource::DevelopmentIds(options.profile_ids),
            LauncherProfileSource::Registry,
        );
        Some(LauncherCatalogOptions {
            source,
            update_trust,
            profiles,
            watchdog_game_ids: options.watchdog_game_ids,
            launch_replay_root: options.launch_replay_root,
        })
    } else {
        None
    };
    Ok(catalog)
}

fn validate_launcher_profile_options(options: &LauncherOptions) -> Result<(), String> {
    if options.profile_registry.is_some() && !options.profile_ids.is_empty() {
        return Err("launcher accepts --profile-registry or --profile-id, not both".to_owned());
    }
    let any_profile_source = options.profile_registry.is_some() || !options.profile_ids.is_empty();
    if !options.watchdog_game_ids.is_empty() && !any_profile_source {
        return Err("--watchdog-game-id requires launch profiles".to_owned());
    }
    if !any_profile_source && options.launch_replay_root.is_some() {
        return Err("--launch-replay-root requires launch profiles".to_owned());
    }
    if !options.profile_ids.is_empty() && options.launch_replay_root.is_none() {
        return Err("--profile-id requires --launch-replay-root".to_owned());
    }
    Ok(())
}

fn parse_launcher_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut LauncherOptions,
) -> Result<(), String> {
    match option {
        "--dry-run" => {
            output.dry_run = true;
            Ok(())
        }
        "--windowed" => {
            output.windowed = true;
            Ok(())
        }
        "--browser" => set_path_option(
            &mut output.browser,
            required_next_path(arguments, cursor, option)?,
            option,
        ),
        "--bluetoothctl" => set_path_option(
            &mut output.bluetoothctl,
            required_next_path(arguments, cursor, option)?,
            option,
        ),
        "--profile-dir" => set_path_option(
            &mut output.profile_dir,
            required_next_path(arguments, cursor, option)?,
            option,
        ),
        "--url" => set_text_option(
            &mut output.url,
            required_next_text(arguments, cursor, option)?,
            option,
        ),
        _ => parse_launcher_catalog_option(arguments, cursor, option, output),
    }
}

fn parse_launcher_catalog_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut LauncherOptions,
) -> Result<(), String> {
    if option == "--profile-id" {
        let profile_id = required_next_text(arguments, cursor, option)?;
        if output
            .profile_ids
            .iter()
            .any(|existing| existing == &profile_id)
        {
            return Err("--profile-id values must be unique".to_owned());
        }
        output.profile_ids.push(profile_id);
        return Ok(());
    }
    if option == "--watchdog-game-id" {
        let game_id = required_next_text(arguments, cursor, option)?;
        if output
            .watchdog_game_ids
            .iter()
            .any(|existing| existing == &game_id)
        {
            return Err("--watchdog-game-id values must be unique".to_owned());
        }
        output.watchdog_game_ids.push(game_id);
        return Ok(());
    }
    if option == "--update-channel" {
        return set_text_option(
            &mut output.update_channel,
            required_next_text(arguments, cursor, option)?,
            option,
        );
    }
    if option == "--trusted-unix-seconds" {
        return set_number_option(
            &mut output.trusted_unix_seconds,
            required_next_number(arguments, cursor, option)?,
            option,
        );
    }
    let slot = match option {
        "--catalog" => &mut output.catalog,
        "--catalog-signature" => &mut output.catalog_signature,
        "--package-store-root" => &mut output.package_store_root,
        "--package-protected-state" => &mut output.package_protected_state,
        "--install-root" => &mut output.install_root,
        "--content-root" => &mut output.content_root,
        "--runtime-root" => &mut output.runtime_root,
        "--data-root" => &mut output.data_root,
        "--launch-replay-root" => &mut output.launch_replay_root,
        "--profile-registry" => &mut output.profile_registry,
        "--update-root-store" => &mut output.update_root_store,
        "--update-root-anchors" => &mut output.update_root_anchors,
        "--update-root-protected-state" => &mut output.update_root_protected_state,
        value => return Err(format!("unknown launcher option: {value}")),
    };
    set_path_option(slot, required_next_path(arguments, cursor, option)?, option)
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

fn retroarch(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, request) = retroarch_request(arguments)?;
    let plan = plan_retroarch(&request).map_err(|error| error.to_string())?;
    if dry_run {
        println!("retroarch:plan mode=dry-run");
        println!("program: {}", plan.launch().program().display());
        for argument in plan.launch().arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        println!("session: {}", plan.storage().session.display());
        println!("session-config: {}", plan.storage().config.display());
        println!("saves: {}", plan.storage().saves.display());
        println!("states: {}", plan.storage().states.display());
        println!("contentless: {}", plan.contentless());
        println!(
            "contentless-start: {}",
            plan.contentless_start()
                .map_or("not-applicable", ContentlessStart::as_str)
        );
        return Ok(ExitCode::SUCCESS);
    }

    plan.prepare().map_err(|error| error.to_string())?;
    println!(
        "retroarch:prepared game={} profile={} config={}",
        request.game_id,
        request.profile_id,
        plan.storage().config.display()
    );
    let child = ProcessSupervisor
        .launch(plan.launch())
        .map_err(|error| error.to_string())?;
    println!("retroarch:started pid={}", child.id());
    let status = child.wait().map_err(|error| error.to_string())?;
    println!(
        "retroarch:completed exit_code={}",
        status
            .code()
            .map_or_else(|| "signal".to_owned(), |code| code.to_string())
    );
    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

#[derive(Default)]
struct RetroArchOptions {
    dry_run: bool,
    install_root: Option<PathBuf>,
    content_root: Option<PathBuf>,
    runtime_root: Option<PathBuf>,
    data_root: Option<PathBuf>,
    frontend: Option<PathBuf>,
    frontend_sha256: Option<ExpectedSha256>,
    core: Option<PathBuf>,
    core_sha256: Option<ExpectedSha256>,
    content: Option<PathBuf>,
    content_sha256: Option<ExpectedSha256>,
    base_config: Option<PathBuf>,
    base_config_sha256: Option<ExpectedSha256>,
    profile_id: Option<String>,
    game_id: Option<String>,
    contentless_start: Option<ContentlessStart>,
}

fn retroarch_request(arguments: &[OsString]) -> Result<(bool, RetroArchRequest), String> {
    let mut options = RetroArchOptions::default();
    let mut cursor = 0;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "retroarch options must be UTF-8".to_owned())?;
        parse_retroarch_option(arguments, &mut cursor, option, &mut options)?;
        cursor += 1;
    }

    let dry_run = options.dry_run;
    Ok((
        dry_run,
        RetroArchRequest {
            install_root: options
                .install_root
                .ok_or_else(|| "retroarch requires --install-root".to_owned())?,
            content_root: options.content_root,
            runtime_root: options
                .runtime_root
                .ok_or_else(|| "retroarch requires --runtime-root".to_owned())?,
            data_root: options
                .data_root
                .ok_or_else(|| "retroarch requires --data-root".to_owned())?,
            frontend: options
                .frontend
                .ok_or_else(|| "retroarch requires --frontend".to_owned())?,
            frontend_sha256: options
                .frontend_sha256
                .ok_or_else(|| "retroarch requires --frontend-sha256".to_owned())?,
            core: options
                .core
                .ok_or_else(|| "retroarch requires --core".to_owned())?,
            core_sha256: options
                .core_sha256
                .ok_or_else(|| "retroarch requires --core-sha256".to_owned())?,
            content: options.content,
            content_sha256: options.content_sha256,
            base_config: options
                .base_config
                .ok_or_else(|| "retroarch requires --base-config".to_owned())?,
            base_config_sha256: options
                .base_config_sha256
                .ok_or_else(|| "retroarch requires --base-config-sha256".to_owned())?,
            auxiliary: Vec::new(),
            profile_id: options
                .profile_id
                .ok_or_else(|| "retroarch requires --profile".to_owned())?,
            game_id: options
                .game_id
                .ok_or_else(|| "retroarch requires --game".to_owned())?,
            contentless_start: options.contentless_start,
        },
    ))
}

fn parse_retroarch_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut RetroArchOptions,
) -> Result<(), String> {
    if option == "--dry-run" {
        output.dry_run = true;
        return Ok(());
    }
    *cursor += 1;
    match option {
        "--install-root" => set_path_option(
            &mut output.install_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--content-root" => set_path_option(
            &mut output.content_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--runtime-root" => set_path_option(
            &mut output.runtime_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--data-root" => set_path_option(
            &mut output.data_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--frontend" => set_path_option(
            &mut output.frontend,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--frontend-sha256" => set_parsed_option(
            &mut output.frontend_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--core" => set_path_option(
            &mut output.core,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--core-sha256" => set_parsed_option(
            &mut output.core_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--content" => set_path_option(
            &mut output.content,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--content-sha256" => set_parsed_option(
            &mut output.content_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--base-config" => set_path_option(
            &mut output.base_config,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--base-config-sha256" => set_parsed_option(
            &mut output.base_config_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--profile" => set_text_option(
            &mut output.profile_id,
            required_text(arguments, *cursor, option)?,
            option,
        ),
        "--game" => set_text_option(
            &mut output.game_id,
            required_text(arguments, *cursor, option)?,
            option,
        ),
        "--contentless-start" => set_parsed_option(
            &mut output.contentless_start,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        value => Err(format!("unknown retroarch option: {value}")),
    }
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

fn load_update_signatures(path: &Path) -> Result<DetachedUpdateSignatures, String> {
    DetachedUpdateSignatures::from_json_bytes(&read_bounded_host_file(
        path,
        MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
        "installed catalog signature bundle",
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

fn supervise(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, spec) = supervise_plan(arguments)?;

    if dry_run {
        println!("program: {}", spec.program().display());
        for argument in spec.arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        return Ok(ExitCode::SUCCESS);
    }

    let child = ProcessSupervisor
        .launch(&spec)
        .map_err(|error| error.to_string())?;
    println!("started: {}", child.id());
    let status = child.wait().map_err(|error| error.to_string())?;
    println!("exited: {status}");

    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

#[derive(Debug)]
struct WatchdogPlan {
    dry_run: bool,
    spec: LaunchSpec,
    policy: WatchdogPolicy,
    heartbeat_file: PathBuf,
    fault_file: Option<PathBuf>,
}

fn watchdog(arguments: &[OsString]) -> Result<ExitCode, String> {
    let plan = watchdog_plan(arguments)?;
    if plan.dry_run {
        println!("program: {}", plan.spec.program().display());
        for argument in plan.spec.arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        println!("heartbeat-file: {}", plan.heartbeat_file.display());
        if let Some(path) = &plan.fault_file {
            println!("fault-file: {}", path.display());
        }
        println!(
            "watchdog: startup={}ms heartbeat={}ms poll={}ms backoff={}ms restarts={}",
            plan.policy.startup_timeout.as_millis(),
            plan.policy.heartbeat_timeout.as_millis(),
            plan.policy.poll_interval.as_millis(),
            plan.policy.restart_backoff.as_millis(),
            plan.policy.max_restarts
        );
        return Ok(ExitCode::SUCCESS);
    }

    let probe = FileHealthProbe::new(plan.heartbeat_file, plan.fault_file)
        .map_err(|error| error.to_string())?;
    ProcessSupervisor
        .watch(&plan.spec, &plan.policy, probe, |event| println!("{event}"))
        .map_err(|error| error.to_string())?;
    Ok(ExitCode::SUCCESS)
}

fn watchdog_plan(arguments: &[OsString]) -> Result<WatchdogPlan, String> {
    let mut dry_run = false;
    let mut policy = WatchdogPolicy::local_game_defaults();
    let mut heartbeat_file = None;
    let mut fault_file = None;
    let mut cursor = 0;

    while let Some(argument) = arguments.get(cursor) {
        let Some(option) = argument.to_str() else {
            break;
        };
        match option {
            "--dry-run" => dry_run = true,
            "--heartbeat-file" => {
                cursor += 1;
                heartbeat_file = Some(required_path(arguments, cursor, option)?);
            }
            "--fault-file" => {
                cursor += 1;
                fault_file = Some(required_path(arguments, cursor, option)?);
            }
            "--startup-timeout-ms" => {
                cursor += 1;
                policy.startup_timeout =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--heartbeat-timeout-ms" => {
                cursor += 1;
                policy.heartbeat_timeout =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--poll-ms" => {
                cursor += 1;
                policy.poll_interval =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--restart-backoff-ms" => {
                cursor += 1;
                policy.restart_backoff =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--max-restarts" => {
                cursor += 1;
                policy.max_restarts = required_number(arguments, cursor, option)?
                    .try_into()
                    .map_err(|_| "--max-restarts exceeds the supported range".to_owned())?;
            }
            "--" => {
                cursor += 1;
                break;
            }
            value if value.starts_with("--") => {
                return Err(format!("unknown watchdog option: {value}"));
            }
            _ => break,
        }
        cursor += 1;
    }

    let heartbeat_file =
        heartbeat_file.ok_or_else(|| "watchdog requires --heartbeat-file".to_owned())?;
    FileHealthProbe::new(heartbeat_file.clone(), fault_file.clone())
        .map_err(|error| error.to_string())?;
    let program = arguments
        .get(cursor)
        .ok_or_else(|| "watchdog requires an executable after `--`".to_owned())?;
    policy.validate().map_err(|error| error.to_string())?;
    let spec = LaunchSpec::new(program)
        .map_err(|error| error.to_string())?
        .args(arguments[cursor + 1..].iter().cloned())
        .env("VCG_HEARTBEAT_FILE", heartbeat_file.as_os_str());

    Ok(WatchdogPlan {
        dry_run,
        spec,
        policy,
        heartbeat_file,
        fault_file,
    })
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

fn supervise_plan(arguments: &[OsString]) -> Result<(bool, LaunchSpec), String> {
    let mut dry_run = false;
    let mut cursor = 0;

    if arguments
        .get(cursor)
        .is_some_and(|value| value == "--dry-run")
    {
        dry_run = true;
        cursor += 1;
    }
    if arguments.get(cursor).is_some_and(|value| value == "--") {
        cursor += 1;
    }

    let program = arguments
        .get(cursor)
        .ok_or_else(|| "supervise requires an executable after `--`".to_owned())?;
    let spec = LaunchSpec::new(program)
        .map_err(|error| error.to_string())?
        .args(arguments[cursor + 1..].iter().cloned());
    Ok((dry_run, spec))
}

fn usage() -> String {
    "usage:\n  vcg-host doctor\n  vcg-host launcher [--dry-run] [--windowed] --browser <path> [--bluetoothctl <absolute-path>] --profile-dir <path> --url <loopback-http-url> [--catalog <path> --catalog-signature <path> --install-root <path> | --package-store-root <path> --package-protected-state <path>] --update-root-store <path> --update-root-anchors <path> --update-root-protected-state <path> --update-channel <channel> --trusted-unix-seconds <seconds> --runtime-root <path> --data-root <path> [--content-root <path>] [--profile-registry <path> | --profile-id <development-id>...] [--launch-replay-root <path>] [--watchdog-game-id <id>]...\n  vcg-host update-root bootstrap|rotate --store-root <path> --root <path> --root-signatures <path> --root-anchors <path> --protected-state <path> --trusted-unix-seconds <seconds>\n  vcg-host update-root recover --store-root <path>\n  vcg-host supervise [--dry-run] -- <program> [arguments...]\n  vcg-host watchdog [options] --heartbeat-file <path> [--fault-file <path>] -- <program> [arguments...]\n  vcg-host retroarch [--dry-run] --install-root <path> --runtime-root <path> --data-root <path> --frontend <path> --frontend-sha256 <hex> --core <path> --core-sha256 <hex> --base-config <path> --base-config-sha256 <hex> --profile <id> --game <id> [--content-root <path> --content <path> --content-sha256 <hex>] [--contentless-start core|menu]"
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        ContentlessStart, LauncherCatalogOptions, LauncherCatalogSourceOptions,
        LauncherProfileSource, LauncherUpdateTrustOptions, ProtectedUpdateRootState,
        UpdateRootOptions, current_target, launcher_request, parse_update_root_option,
        plan_launcher, retroarch_request, supervise, supervise_plan, watchdog_plan,
    };
    use ed25519_dalek::{Signer, SigningKey};
    use std::ffi::OsString;
    use std::fs::{self, File};
    use std::sync::atomic::{AtomicU64, Ordering};

    use sha2::{Digest, Sha256};
    use vcg_host::update_root_store::{UpdateRootStore, UpdateRootStoreConfig};
    use vcg_host::update_trust::{RootTrustAnchor, RootTrustAnchorSet};

    const ROOT_DOMAIN: &[u8] = b"VCG-UPDATE-TRUST-ROOT-V1\0";
    static NEXT_ROOT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    fn lower_hex(bytes: &[u8]) -> String {
        let mut output = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            use std::fmt::Write as _;
            write!(output, "{byte:02x}").expect("write hex");
        }
        output
    }

    fn extend_update_trust(values: &mut Vec<&'static str>) {
        values.extend([
            "--update-root-store",
            "/metadata/update-root-store",
            "--update-root-anchors",
            "/metadata/update-root-anchors.json",
            "--update-root-protected-state",
            "/metadata/update-root-protected-state.json",
            "--update-channel",
            "stable",
            "--trusted-unix-seconds",
            "2000000000",
        ]);
    }

    #[test]
    fn update_root_options_are_explicit_and_unique() {
        let arguments = args(&[
            "--store-root",
            "/metadata/update-root-store",
            "--root",
            "/metadata/root.json",
            "--root-signatures",
            "/metadata/root.signatures.json",
            "--root-anchors",
            "/metadata/root-anchors.json",
            "--protected-state",
            "/metadata/protected-root-state.json",
            "--trusted-unix-seconds",
            "2000000000",
        ]);
        let mut options = UpdateRootOptions::default();
        let mut cursor = 0;
        while let Some(argument) = arguments.get(cursor) {
            let option = argument.to_str().expect("UTF-8 option");
            parse_update_root_option(&arguments, &mut cursor, option, &mut options)
                .expect("option parses");
            cursor += 1;
        }
        assert_eq!(
            options.store_root.as_deref(),
            Some(std::path::Path::new("/metadata/update-root-store"))
        );
        assert_eq!(
            options.protected_state.as_deref(),
            Some(std::path::Path::new("/metadata/protected-root-state.json"))
        );
        assert_eq!(options.trusted_unix_seconds, Some(2_000_000_000));

        let duplicate = args(&[
            "--store-root",
            "/metadata/update-root-store",
            "--store-root",
            "/other",
        ]);
        let mut duplicate_options = UpdateRootOptions::default();
        let mut duplicate_cursor = 0;
        let first = duplicate[duplicate_cursor].to_str().expect("first option");
        parse_update_root_option(
            &duplicate,
            &mut duplicate_cursor,
            first,
            &mut duplicate_options,
        )
        .expect("first store root");
        duplicate_cursor += 1;
        let second = duplicate[duplicate_cursor].to_str().expect("second option");
        assert!(
            parse_update_root_option(
                &duplicate,
                &mut duplicate_cursor,
                second,
                &mut duplicate_options,
            )
            .is_err()
        );
        let unknown = args(&["--candidate", "/metadata/root.json"]);
        let mut unknown_options = UpdateRootOptions::default();
        let mut unknown_cursor = 0;
        assert!(
            parse_update_root_option(
                &unknown,
                &mut unknown_cursor,
                "--candidate",
                &mut unknown_options,
            )
            .is_err()
        );
    }

    #[test]
    fn launcher_replays_root_store_and_keeps_dry_run_recovery_read_only() {
        let unique = NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed);
        let fixture = std::env::temp_dir().join(format!(
            "vcg-launcher-root-store-{}-{unique}",
            std::process::id()
        ));
        let generations = fixture.join("generations");
        fs::create_dir_all(&generations).expect("create root store");
        File::create(fixture.join(".vcg-update-root-store.lock")).expect("create lock");

        let root_key = SigningKey::from_bytes(&[81; 32]);
        let role_key = SigningKey::from_bytes(&[82; 32]);
        let root_bytes = format!(
            r#"{{"schemaVersion":1,"generation":1,"expiresUnixSeconds":2000000100,"rootThreshold":1,"rootKeys":[{{"keyId":"root-a","publicKey":"{}"}}],"roles":[{{"channel":"stable","artifact":"installed-catalog","target":"test-target","threshold":1,"keys":[{{"keyId":"catalog-a","publicKey":"{}"}}]}}]}}"#,
            lower_hex(root_key.verifying_key().as_bytes()),
            lower_hex(role_key.verifying_key().as_bytes())
        )
        .into_bytes();
        let mut signed = Vec::from(ROOT_DOMAIN);
        signed.extend_from_slice(&root_bytes);
        let signature_bytes = format!(
            r#"{{"schemaVersion":1,"signatures":[{{"keyId":"root-a","signature":"{}"}}]}}"#,
            lower_hex(&root_key.sign(&signed).to_bytes())
        )
        .into_bytes();
        let anchors = RootTrustAnchorSet::new(
            1,
            [
                RootTrustAnchor::new("root-a", *root_key.verifying_key().as_bytes())
                    .expect("root anchor"),
            ],
        )
        .expect("anchor set");
        let store = UpdateRootStore::open(UpdateRootStoreConfig {
            store_root: fixture.clone(),
        })
        .expect("open store");
        let root_digest = lower_hex(&Sha256::digest(&root_bytes));
        let protected_bytes =
            format!(r#"{{"schemaVersion":1,"generation":1,"rootMetadataSha256":"{root_digest}"}}"#)
                .into_bytes();
        let protected_state =
            ProtectedUpdateRootState::from_json_bytes(&protected_bytes).expect("protected state");
        store
            .bootstrap(
                &root_bytes,
                &signature_bytes,
                &anchors,
                &protected_state,
                2_000_000_000,
            )
            .expect("bootstrap");
        let anchors_path = fixture.join("anchors.json");
        fs::write(
            &anchors_path,
            format!(
                r#"{{"schemaVersion":1,"threshold":1,"anchors":[{{"keyId":"root-a","publicKey":"{}"}}]}}"#,
                lower_hex(root_key.verifying_key().as_bytes())
            ),
        )
        .expect("write anchors");
        let protected_path = fixture.join("protected-root.json");
        fs::write(&protected_path, protected_bytes).expect("write protected state");

        let options = || LauncherUpdateTrustOptions {
            store_root: fixture.clone(),
            root_anchors: anchors_path.clone(),
            protected_state: protected_path.clone(),
            channel: "stable".to_owned(),
            trusted_unix_seconds: 2_000_000_000,
        };
        let (policy, recovery) = options().load(false).expect("read-only replay");
        assert_eq!(policy.root().generation(), 1);
        assert_eq!(recovery, None);

        fs::create_dir(generations.join(".incoming-00000000000000000002"))
            .expect("simulate interrupted root publication");
        assert!(options().load(false).is_err());
        let (policy, recovery) = options().load(true).expect("normal startup recovers");
        assert_eq!(policy.root().generation(), 1);
        assert_eq!(recovery, Some(1));
        assert!(!generations.join(".incoming-00000000000000000002").exists());
        fs::remove_dir_all(&fixture).expect("remove fixture");
    }

    #[test]
    fn supervise_requires_a_program() {
        assert!(supervise(&[]).is_err());
        assert!(supervise(&args(&["--dry-run"])).is_err());
    }

    #[test]
    fn parses_a_windowed_launcher_request() {
        let browser = std::env::current_dir()
            .expect("current directory is available")
            .join("browser");
        let profile = std::env::current_dir()
            .expect("current directory is available")
            .join("profile");
        let bluetoothctl_path = std::env::current_dir()
            .expect("current directory is available")
            .join("bluetoothctl");
        let arguments = vec![
            OsString::from("--dry-run"),
            OsString::from("--windowed"),
            OsString::from("--browser"),
            browser.into_os_string(),
            OsString::from("--bluetoothctl"),
            bluetoothctl_path.clone().into_os_string(),
            OsString::from("--profile-dir"),
            profile.into_os_string(),
            OsString::from("--url"),
            OsString::from("http://127.0.0.1:5173/"),
        ];
        let (dry_run, request, catalog, bluetoothctl) =
            launcher_request(&arguments).expect("launcher request parses");

        assert!(dry_run);
        assert!(catalog.is_none());
        assert_eq!(bluetoothctl, Some(bluetoothctl_path));
        let spec = plan_launcher(&request).expect("launcher request plans");
        assert!(
            !spec
                .arguments()
                .any(|argument| argument == "--start-fullscreen")
        );
    }

    #[test]
    fn launcher_requires_all_explicit_inputs() {
        assert!(launcher_request(&[]).is_err());
        assert!(launcher_request(&args(&["--browser", "browser"])).is_err());
        assert!(
            launcher_request(&args(&["--browser", "browser", "--profile-dir", "profile"])).is_err()
        );
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "the all-or-nothing launcher configuration matrix is clearest as one test"
    )]
    fn launcher_catalog_configuration_is_all_or_nothing() {
        let base = [
            "--browser",
            "/browser",
            "--profile-dir",
            "/profile",
            "--url",
            "http://127.0.0.1:5173/",
        ];
        let mut complete = base.to_vec();
        complete.extend([
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--launch-replay-root",
            "/launch-replay",
            "--profile-id",
            "profile-randy",
            "--profile-id",
            "profile-guest",
            "--watchdog-game-id",
            "retro-2048",
        ]);
        extend_update_trust(&mut complete);
        let (_, _, catalog, _) =
            launcher_request(&args(&complete)).expect("complete catalog configuration parses");
        let catalog = catalog.expect("catalog options exist");
        assert!(matches!(
            &catalog.profiles,
            LauncherProfileSource::DevelopmentIds(profile_ids)
                if profile_ids == &["profile-randy", "profile-guest"]
        ));
        assert_eq!(catalog.watchdog_game_ids, ["retro-2048"]);
        assert_eq!(
            catalog.launch_replay_root.as_deref(),
            Some(std::path::Path::new("/launch-replay"))
        );

        let mut partial = base.to_vec();
        partial.extend(["--catalog", "/metadata/catalog.json"]);
        assert!(launcher_request(&args(&partial)).is_err());
        let mut profile_without_catalog = base.to_vec();
        profile_without_catalog.extend(["--profile-id", "profile-randy"]);
        assert!(launcher_request(&args(&profile_without_catalog)).is_err());
        let mut duplicate_profile = complete;
        duplicate_profile.extend(["--profile-id", "profile-randy"]);
        assert!(launcher_request(&args(&duplicate_profile)).is_err());
        let mut watchdog_without_catalog = base.to_vec();
        watchdog_without_catalog.extend(["--watchdog-game-id", "retro-2048"]);
        assert!(launcher_request(&args(&watchdog_without_catalog)).is_err());
        let mut watchdog_without_profile = base.to_vec();
        watchdog_without_profile.extend([
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--watchdog-game-id",
            "retro-2048",
        ]);
        extend_update_trust(&mut watchdog_without_profile);
        assert!(launcher_request(&args(&watchdog_without_profile)).is_err());
        let mut duplicate_watchdog_game = base.to_vec();
        duplicate_watchdog_game.extend([
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--launch-replay-root",
            "/launch-replay",
            "--profile-id",
            "profile-randy",
            "--watchdog-game-id",
            "retro-2048",
            "--watchdog-game-id",
            "retro-2048",
        ]);
        extend_update_trust(&mut duplicate_watchdog_game);
        assert!(launcher_request(&args(&duplicate_watchdog_game)).is_err());
    }

    #[test]
    fn launcher_profile_registry_is_bounded_persistent_and_exclusive() {
        let unique = NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed);
        let fixture = std::env::temp_dir().join(format!("vcg-profile-registry-main-test-{unique}"));
        fs::create_dir(&fixture).expect("create registry fixture");
        let registry = fixture.join("profiles.json");
        fs::write(
            &registry,
            br#"{"schemaVersion":1,"profiles":[{"id":"profile-randy"},{"id":"guest-01"}]}"#,
        )
        .expect("write profile registry");
        assert_eq!(
            LauncherProfileSource::Registry(registry.clone())
                .load()
                .expect("registry loads"),
            ["profile-randy", "guest-01"]
        );

        let base = [
            "--browser",
            "/browser",
            "--profile-dir",
            "/profile",
            "--url",
            "http://127.0.0.1:5173/",
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--launch-replay-root",
            "/launch-replay",
            "--profile-registry",
            "/metadata/profiles.json",
        ];
        let mut configured = base.to_vec();
        extend_update_trust(&mut configured);
        let (_, _, catalog, _) =
            launcher_request(&args(&configured)).expect("profile registry parses");
        assert!(matches!(
            catalog.expect("catalog options").profiles,
            LauncherProfileSource::Registry(path)
                if path == std::path::Path::new("/metadata/profiles.json")
        ));

        let mut metadata_only = configured.clone();
        let replay_option = metadata_only
            .iter()
            .position(|value| *value == "--launch-replay-root")
            .expect("replay option exists");
        metadata_only.drain(replay_option..=replay_option + 1);
        assert!(
            launcher_request(&args(&metadata_only)).is_ok(),
            "an empty persistent registry may remain metadata-only"
        );

        let mut mixed = base.to_vec();
        mixed.extend(["--profile-id", "profile-randy"]);
        extend_update_trust(&mut mixed);
        assert!(launcher_request(&args(&mixed)).is_err());

        fs::write(
            &registry,
            br#"{"schemaVersion":1,"profiles":[{"id":"../escape"}]}"#,
        )
        .expect("replace with invalid registry");
        assert!(LauncherProfileSource::Registry(registry).load().is_err());
        fs::remove_dir_all(&fixture).expect("remove registry fixture");
    }

    #[test]
    fn invalid_profile_registry_precedes_any_trust_or_package_recovery() {
        let unique = NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed);
        let fixture =
            std::env::temp_dir().join(format!("vcg-profile-registry-order-test-{unique}"));
        fs::create_dir(&fixture).expect("create ordering fixture");
        let registry = fixture.join("profiles.json");
        fs::write(
            &registry,
            br#"{"schemaVersion":1,"profiles":[{"id":"../escape"}]}"#,
        )
        .expect("write invalid profile registry");
        let root_store = fixture.join("root-store-that-must-not-be-opened");
        let options = LauncherCatalogOptions {
            source: LauncherCatalogSourceOptions::Loose {
                catalog: fixture.join("missing-catalog.json"),
                signature: fixture.join("missing-catalog.sig"),
                roots: vcg_host::installed_catalog::CatalogRoots {
                    install_root: fixture.join("missing-install"),
                    content_root: None,
                    runtime_root: fixture.join("runtime"),
                    data_root: fixture.join("data"),
                },
            },
            update_trust: LauncherUpdateTrustOptions {
                store_root: root_store.clone(),
                root_anchors: fixture.join("missing-anchors.json"),
                protected_state: fixture.join("missing-protected-state.json"),
                channel: "stable".to_owned(),
                trusted_unix_seconds: 2_000_000_000,
            },
            profiles: LauncherProfileSource::Registry(registry),
            watchdog_game_ids: Vec::new(),
            launch_replay_root: Some(fixture.join("launch-replay")),
        };
        let Err(error) = options.load(true) else {
            panic!("invalid registry must fail first");
        };
        assert!(error.contains("profile registry ID is invalid"));
        assert!(!root_store.exists());
        fs::remove_dir_all(&fixture).expect("remove ordering fixture");
    }

    #[test]
    fn invalid_package_protected_state_precedes_update_root_recovery() {
        let target = current_target();
        for document in [
            format!(
                r#"{{"schemaVersion":1,"channel":"stable","target":"{target}","generation":7,"catalogSha256":null}}"#
            ),
            format!(
                r#"{{"schemaVersion":1,"channel":"recovery","target":"{target}","generation":0,"catalogSha256":null}}"#
            ),
        ] {
            let unique = NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let fixture = std::env::temp_dir().join(format!(
                "vcg-package-protection-order-test-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&fixture).expect("create ordering fixture");
            let protected_state = fixture.join("package-protected-state.json");
            fs::write(&protected_state, document).expect("write invalid package protected state");
            let root_store = fixture.join("root-store-that-must-not-be-opened");
            let options = LauncherCatalogOptions {
                source: LauncherCatalogSourceOptions::GenerationStore {
                    store_root: fixture.join("package-store-that-must-not-be-opened"),
                    protected_state,
                    content_root: None,
                    runtime_root: fixture.join("runtime"),
                    data_root: fixture.join("data"),
                },
                update_trust: LauncherUpdateTrustOptions {
                    store_root: root_store.clone(),
                    root_anchors: fixture.join("missing-anchors.json"),
                    protected_state: fixture.join("missing-root-protected-state.json"),
                    channel: "stable".to_owned(),
                    trusted_unix_seconds: 2_000_000_000,
                },
                profiles: LauncherProfileSource::DevelopmentIds(Vec::new()),
                watchdog_game_ids: Vec::new(),
                launch_replay_root: None,
            };
            let Err(error) = options.load(true) else {
                panic!("invalid package protected state must fail first");
            };
            assert!(error.contains("package protected state"));
            assert!(!root_store.exists());
            fs::remove_dir_all(&fixture).expect("remove ordering fixture");
        }
    }

    #[test]
    fn launcher_profiles_require_exactly_one_replay_root() {
        let mut configured = vec![
            "--browser",
            "/browser",
            "--profile-dir",
            "/profile",
            "--url",
            "http://127.0.0.1:5173/",
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
        ];
        extend_update_trust(&mut configured);
        let mut profile_without_replay = configured.clone();
        profile_without_replay.extend(["--profile-id", "profile-randy"]);
        assert!(launcher_request(&args(&profile_without_replay)).is_err());

        let mut replay_without_profile = configured.clone();
        replay_without_profile.extend(["--launch-replay-root", "/launch-replay"]);
        assert!(launcher_request(&args(&replay_without_profile)).is_err());

        let mut duplicate_replay_root = configured;
        duplicate_replay_root.extend([
            "--launch-replay-root",
            "/launch-replay",
            "--launch-replay-root",
            "/other-replay",
            "--profile-id",
            "profile-randy",
        ]);
        assert!(launcher_request(&args(&duplicate_replay_root)).is_err());
    }

    #[test]
    fn launcher_generation_store_is_explicit_and_mutually_exclusive() {
        let base = [
            "--browser",
            "/browser",
            "--profile-dir",
            "/profile",
            "--url",
            "http://127.0.0.1:5173/",
        ];
        let mut complete = base.to_vec();
        complete.extend([
            "--package-store-root",
            "/package-store",
            "--package-protected-state",
            "/platform/package-protected-state.json",
            "--content-root",
            "/content",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--launch-replay-root",
            "/launch-replay",
            "--profile-id",
            "profile-randy",
        ]);
        extend_update_trust(&mut complete);
        let (_, _, catalog, _) =
            launcher_request(&args(&complete)).expect("generation store configuration parses");
        let catalog = catalog.expect("catalog options exist");
        let LauncherCatalogSourceOptions::GenerationStore {
            store_root,
            protected_state,
            content_root,
            ..
        } = catalog.source
        else {
            panic!("generation store source expected");
        };
        assert_eq!(store_root, std::path::Path::new("/package-store"));
        assert_eq!(
            protected_state,
            std::path::Path::new("/platform/package-protected-state.json")
        );
        assert_eq!(
            content_root.as_deref(),
            Some(std::path::Path::new("/content"))
        );

        let mut mixed = complete;
        mixed.extend([
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
        ]);
        assert!(launcher_request(&args(&mixed)).is_err());

        let mut missing_key = base.to_vec();
        missing_key.extend([
            "--package-store-root",
            "/package-store",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
        ]);
        assert!(launcher_request(&args(&missing_key)).is_err());

        let mut missing_package_state = base.to_vec();
        missing_package_state.extend([
            "--package-store-root",
            "/package-store",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
        ]);
        extend_update_trust(&mut missing_package_state);
        assert!(launcher_request(&args(&missing_package_state)).is_err());

        let mut loose_with_package_state = base.to_vec();
        loose_with_package_state.extend([
            "--catalog",
            "/metadata/catalog.json",
            "--catalog-signature",
            "/metadata/catalog.sig",
            "--install-root",
            "/installed",
            "--package-protected-state",
            "/platform/package-protected-state.json",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
        ]);
        extend_update_trust(&mut loose_with_package_state);
        assert!(launcher_request(&args(&loose_with_package_state)).is_err());
    }

    #[test]
    fn parses_a_normal_program_invocation() {
        let (dry_run, spec) =
            supervise_plan(&args(&["program", "argument"])).expect("normal invocation parses");
        assert!(!dry_run);
        assert_eq!(spec.program(), std::path::Path::new("program"));
        assert_eq!(
            spec.arguments().collect::<Vec<_>>(),
            vec![std::ffi::OsStr::new("argument")]
        );
    }

    #[test]
    fn parses_dry_run_separator_and_arguments() {
        let (dry_run, spec) = supervise_plan(&args(&[
            "--dry-run",
            "--",
            "program",
            "--child-option",
            "value",
        ]))
        .expect("dry run parses");
        assert!(dry_run);
        assert_eq!(spec.program(), std::path::Path::new("program"));
        assert_eq!(
            spec.arguments().collect::<Vec<_>>(),
            vec![
                std::ffi::OsStr::new("--child-option"),
                std::ffi::OsStr::new("value")
            ]
        );
    }

    #[test]
    fn preserves_child_arguments_that_begin_with_dashes() {
        let (_, spec) = supervise_plan(&args(&["program", "--", "--child-option"]))
            .expect("child arguments parse");
        assert_eq!(
            spec.arguments().collect::<Vec<_>>(),
            vec![
                std::ffi::OsStr::new("--"),
                std::ffi::OsStr::new("--child-option")
            ]
        );
    }

    #[test]
    fn watchdog_requires_a_heartbeat_file_and_program() {
        assert!(watchdog_plan(&args(&["--", "program"])).is_err());
        assert!(watchdog_plan(&args(&["--heartbeat-file", "heartbeat"])).is_err());
        assert!(
            watchdog_plan(&args(&[
                "--heartbeat-file",
                "signal",
                "--fault-file",
                "signal",
                "--",
                "program"
            ]))
            .is_err()
        );
    }

    #[test]
    fn retroarch_requires_all_trusted_roots_and_artifacts() {
        assert!(retroarch_request(&[]).is_err());
        assert!(
            retroarch_request(&args(&[
                "--install-root",
                "/installed",
                "--runtime-root",
                "/runtime",
                "--data-root",
                "/data",
                "--frontend",
                "/installed/retroarch",
                "--core",
                "/installed/core.so",
                "--base-config",
                "/installed/base.cfg",
                "--profile",
                "player-one",
            ]))
            .is_err()
        );
    }

    #[test]
    fn retroarch_parser_rejects_duplicate_and_unknown_options() {
        assert!(
            retroarch_request(&args(&["--install-root", "/one", "--install-root", "/two"]))
                .is_err()
        );
        assert!(retroarch_request(&args(&["--surprise"])).is_err());
        assert!(
            retroarch_request(&args(&[
                "--frontend-sha256",
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            ]))
            .is_err()
        );
    }

    #[test]
    fn retroarch_parser_accepts_exact_manifest_hashes() {
        let hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let (_, request) = retroarch_request(&args(&[
            "--dry-run",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--frontend",
            "/installed/retroarch",
            "--frontend-sha256",
            hash,
            "--core",
            "/installed/core.so",
            "--core-sha256",
            hash,
            "--base-config",
            "/installed/base.cfg",
            "--base-config-sha256",
            hash,
            "--profile",
            "player-one",
            "--game",
            "retro-2048",
        ]))
        .expect("complete request parses");
        assert_eq!(request.frontend_sha256.to_string(), hash);
        assert_eq!(request.core_sha256.to_string(), hash);
        assert_eq!(request.base_config_sha256.to_string(), hash);
        assert!(request.content_sha256.is_none());
        assert!(request.contentless_start.is_none());
    }

    #[test]
    fn retroarch_parser_reads_the_contentless_start_policy() {
        let hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let base = |policy: &'static str| {
            args(&[
                "--dry-run",
                "--install-root",
                "/installed",
                "--runtime-root",
                "/runtime",
                "--data-root",
                "/data",
                "--frontend",
                "/installed/retroarch",
                "--frontend-sha256",
                hash,
                "--core",
                "/installed/core.so",
                "--core-sha256",
                hash,
                "--base-config",
                "/installed/base.cfg",
                "--base-config-sha256",
                hash,
                "--profile",
                "player-one",
                "--game",
                "retro-2048",
                "--contentless-start",
                policy,
            ])
        };
        let (_, request) = retroarch_request(&base("menu")).expect("menu policy parses");
        assert_eq!(request.contentless_start, Some(ContentlessStart::Menu));
        let (_, request) = retroarch_request(&base("core")).expect("core policy parses");
        assert_eq!(
            request.contentless_start,
            Some(ContentlessStart::CoreDirect)
        );
        assert!(retroarch_request(&base("Start Core")).is_err());
        assert!(
            retroarch_request(&args(&[
                "--contentless-start",
                "core",
                "--contentless-start",
                "menu"
            ]))
            .is_err()
        );
    }

    #[test]
    fn parses_a_bounded_watchdog_plan() {
        let plan = watchdog_plan(&args(&[
            "--dry-run",
            "--heartbeat-file",
            "heartbeat",
            "--fault-file",
            "fault",
            "--startup-timeout-ms",
            "25",
            "--heartbeat-timeout-ms",
            "10",
            "--poll-ms",
            "2",
            "--restart-backoff-ms",
            "0",
            "--max-restarts",
            "2",
            "--",
            "program",
            "--child-option",
        ]))
        .expect("watchdog invocation parses");
        assert!(plan.dry_run);
        assert_eq!(plan.heartbeat_file, std::path::Path::new("heartbeat"));
        assert_eq!(
            plan.fault_file.as_deref(),
            Some(std::path::Path::new("fault"))
        );
        assert_eq!(
            plan.policy.startup_timeout,
            std::time::Duration::from_millis(25)
        );
        assert_eq!(
            plan.policy.heartbeat_timeout,
            std::time::Duration::from_millis(10)
        );
        assert_eq!(
            plan.policy.poll_interval,
            std::time::Duration::from_millis(2)
        );
        assert_eq!(plan.policy.restart_backoff, std::time::Duration::ZERO);
        assert_eq!(plan.policy.max_restarts, 2);
        assert_eq!(plan.spec.program(), std::path::Path::new("program"));
        assert_eq!(
            plan.spec.arguments().collect::<Vec<_>>(),
            vec![std::ffi::OsStr::new("--child-option")]
        );
    }
}
