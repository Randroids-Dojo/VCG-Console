//! Command composition and parsing for launcher.

use super::{
    BluetoothPairingService, CatalogRoots, Duration, ExitCode, HOST_API_PROTOCOL_VERSION,
    HostCapabilities, HostLaunchPolicy, HostProfileRegistry, HostStatusServer, LauncherRequest,
    MAX_PROFILE_REGISTRY_BYTES, MAX_PROTECTED_PACKAGE_GENERATION_STATE_BYTES,
    MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES, MAX_UPDATE_ROOT_ANCHOR_BYTES, NativeLaunchService,
    OsString, PackageGenerationConfig, PackageGenerationStore, Path, PathBuf, ProcessSupervisor,
    ProtectedPackageGenerationState, ProtectedUpdateRootState, RecoveryOutcome, RetroImportStore,
    RetroImportStoreConfig, RetroLibrarySnapshot, RootTrustAnchorSet, StorageNamespacePlan,
    TrustedPackageCatalog, TrustedUpdatePolicy, UpdateRootStore, UpdateRootStoreConfig,
    WatchdogPolicy, current_target, fs, load_update_signatures, loopback_origin, plan_launcher,
    read_bounded_host_file, required_next_number, required_next_path, required_next_text,
    set_number_option, set_path_option, set_text_option,
};

#[derive(Default)]
pub(super) struct LauncherOptions {
    pub(super) dry_run: bool,
    pub(super) windowed: bool,
    pub(super) browser: Option<PathBuf>,
    pub(super) bluetoothctl: Option<PathBuf>,
    pub(super) cursor_nudge: Option<PathBuf>,
    pub(super) profile_dir: Option<PathBuf>,
    pub(super) url: Option<String>,
    pub(super) catalog: Option<PathBuf>,
    pub(super) catalog_signature: Option<PathBuf>,
    pub(super) package_store_root: Option<PathBuf>,
    pub(super) package_protected_state: Option<PathBuf>,
    pub(super) install_root: Option<PathBuf>,
    pub(super) content_root: Option<PathBuf>,
    pub(super) runtime_root: Option<PathBuf>,
    pub(super) data_root: Option<PathBuf>,
    pub(super) launch_replay_root: Option<PathBuf>,
    pub(super) retro_library_root: Option<PathBuf>,
    pub(super) profile_registry: Option<PathBuf>,
    pub(super) profile_ids: Vec<String>,
    pub(super) watchdog_game_ids: Vec<String>,
    pub(super) update_root_store: Option<PathBuf>,
    pub(super) update_root_anchors: Option<PathBuf>,
    pub(super) update_root_protected_state: Option<PathBuf>,
    pub(super) update_channel: Option<String>,
    pub(super) trusted_unix_seconds: Option<u64>,
}

pub(super) struct LauncherCatalogOptions {
    pub(super) source: LauncherCatalogSourceOptions,
    pub(super) update_trust: HostUpdateTrustOptions,
    pub(super) profiles: LauncherProfileSource,
    pub(super) watchdog_game_ids: Vec<String>,
    pub(super) launch_replay_root: Option<PathBuf>,
    pub(super) retro_library_root: Option<PathBuf>,
}

pub(super) enum LauncherProfileSource {
    Registry(PathBuf),
    DevelopmentIds(Vec<String>),
}

pub(super) enum LauncherCatalogSourceOptions {
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

/// The accepted-root store, anchors, protected state, channel, and trusted
/// time every delegated artifact this host loads is verified under.
pub(super) struct HostUpdateTrustOptions {
    pub(super) store_root: PathBuf,
    pub(super) root_anchors: PathBuf,
    pub(super) protected_state: PathBuf,
    pub(super) channel: String,
    pub(super) trusted_unix_seconds: u64,
}

pub(super) struct LauncherCatalogConfiguration {
    pub(super) catalog: TrustedPackageCatalog,
    pub(super) profile_ids: Vec<String>,
    pub(super) watchdog_game_ids: Vec<String>,
    pub(super) launch_replay_root: Option<PathBuf>,
    pub(super) library: Option<RetroLibrarySnapshot>,
    pub(super) source: &'static str,
    pub(super) recovery: Option<RecoveryOutcome>,
    pub(super) root_recovery: Option<usize>,
}

/// The launcher only reads the installed retro library. A store reserve gates
/// installs, which this process never performs, so the value only has to clear
/// the store's nonzero-reserve check.
pub(super) const RETRO_LIBRARY_READ_RESERVE_BYTES: u64 = 1;

pub(super) fn launcher(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, request, catalog_options, bluetoothctl, cursor_nudge) =
        launcher_request(arguments)?;
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
            if let Some(library) = &configuration.library {
                println!("{}", retro_library_report(library));
            }
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
    spawn_cursor_nudge(cursor_nudge);
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

/// Best-effort, one-shot synthetic pointer nudge so cage can hide its
/// default Wayland cursor even when no physical pointing device is ever
/// attached -- runs `vcg-cursor-nudge` (a separate binary; see that
/// crate's doc comment for why raw uinput ioctls live outside this
/// unsafe-forbidden crate) as a subprocess on a detached background
/// thread. A slow, missing, or failed nudge is purely cosmetic and must
/// never delay or fail the actual console launch.
pub(super) fn spawn_cursor_nudge(cursor_nudge: Option<PathBuf>) {
    let Some(cursor_nudge) = cursor_nudge else {
        return;
    };
    std::thread::spawn(move || {
        // Give cage and Chromium time to map the window first -- the nudge
        // only matters once Chromium actually has pointer focus on a
        // mapped Wayland surface.
        std::thread::sleep(Duration::from_secs(2));
        match std::process::Command::new(&cursor_nudge).status() {
            Ok(status) if status.success() => println!("launcher:cursor-nudge ok"),
            Ok(status) => {
                eprintln!("launcher:cursor-nudge failed (cosmetic only): exit {status}");
            }
            Err(error) => {
                eprintln!("launcher:cursor-nudge failed to start (cosmetic only): {error}");
            }
        }
    });
}

/// Every capability the operator configured is served together: a retro
/// library needs controller pairing, because a retro game needs a controller.
pub(super) fn start_launcher_host_api(
    origin: String,
    configuration: Option<LauncherCatalogConfiguration>,
    bluetooth_service: Option<BluetoothPairingService>,
) -> Result<HostStatusServer, String> {
    let mut capabilities = HostCapabilities::default();
    if let Some(configuration) = configuration {
        report_root_recovery(configuration.root_recovery);
        report_package_recovery(configuration.recovery);
        capabilities = if configuration.profile_ids.is_empty() {
            HostCapabilities::with_catalog(configuration.catalog)
        } else {
            let launch_replay_root = configuration
                .launch_replay_root
                .expect("launch profiles require replay root");
            HostCapabilities::with_launch_service(
                configuration.catalog,
                HostLaunchPolicy::new(configuration.profile_ids)
                    .with_watchdog_games(
                        configuration.watchdog_game_ids,
                        WatchdogPolicy::local_game_defaults(),
                    )
                    .with_replay_journal(&launch_replay_root),
            )
        };
        if let Some(library) = configuration.library {
            capabilities = capabilities.and_library(library);
        }
    }
    if let Some(service) = bluetooth_service {
        capabilities = capabilities.and_bluetooth(service);
    }
    HostStatusServer::start_with_capabilities(origin, capabilities)
        .map_err(|error| error.to_string())
}

/// The dry-run library disclosure: counts only, never a root, an object path,
/// or an entry title.
pub(super) fn retro_library_report(library: &RetroLibrarySnapshot) -> String {
    format!(
        "launcher:retro-library generation={} entries={}",
        library.generation(),
        library.entries().len()
    )
}

/// Opens the operator-provisioned retro library read-only and takes the one
/// snapshot this launcher process serves.
pub(super) fn load_retro_library(writable_root: &Path) -> Result<RetroLibrarySnapshot, String> {
    let namespace = StorageNamespacePlan::new(writable_root)
        .map_err(|error| format!("retro library: {error}"))?;
    let config = RetroImportStoreConfig::from_storage_namespace(
        &namespace,
        RETRO_LIBRARY_READ_RESERVE_BYTES,
    );
    RetroImportStore::open(&config)
        .and_then(|store| store.library_snapshot())
        .map_err(|error| format!("retro library: {error}"))
}

pub(super) fn report_root_recovery(recovered_directories: Option<usize>) {
    if let Some(recovered_directories) = recovered_directories {
        println!("launcher:update-root-recovery removed-unpublished={recovered_directories}");
    }
}

pub(super) fn report_package_recovery(recovery: Option<RecoveryOutcome>) {
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
    pub(super) fn load(self, recover: bool) -> Result<LauncherCatalogConfiguration, String> {
        let profile_ids = self.profiles.load()?;
        if !self.watchdog_game_ids.is_empty() && profile_ids.is_empty() {
            return Err("watchdog games require at least one registered profile".to_owned());
        }
        if !profile_ids.is_empty() && self.launch_replay_root.is_none() {
            return Err("nonempty profile registry requires --launch-replay-root".to_owned());
        }
        let library = self
            .retro_library_root
            .as_deref()
            .map(load_retro_library)
            .transpose()?;
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
        let (catalog, source, recovery) =
            load_catalog_source(self.source, update_policy, package_protected_state, recover)?;
        // Defence in depth for both source modes: hashing every signed
        // artifact here makes `--dry-run` a real integrity check instead of a
        // configuration check, so a tampered core fails startup rather than
        // the first launch that resolves it. Resolve-time verification is
        // unchanged, and immutable package/content storage is still required
        // to close the verification-to-use race.
        catalog
            .verify_all_artifacts()
            .map_err(|error| error.to_string())?;
        Ok(LauncherCatalogConfiguration {
            catalog,
            profile_ids,
            watchdog_game_ids: self.watchdog_game_ids,
            launch_replay_root: self.launch_replay_root,
            library,
            source,
            recovery,
            root_recovery,
        })
    }
}

/// Loads the signed catalog named by one configured source, together with the
/// source label and any package-store recovery it performed.
pub(super) fn load_catalog_source(
    source: LauncherCatalogSourceOptions,
    update_policy: TrustedUpdatePolicy,
    package_protected_state: Option<ProtectedPackageGenerationState>,
    recover: bool,
) -> Result<(TrustedPackageCatalog, &'static str, Option<RecoveryOutcome>), String> {
    match source {
        LauncherCatalogSourceOptions::Loose {
            catalog,
            signature,
            roots,
        } => Ok((
            TrustedPackageCatalog::load_with_update_role(
                &catalog,
                &load_update_signatures(&signature, "installed catalog signature bundle")?,
                &update_policy,
                &current_target(),
                roots,
            )
            .map_err(|error| error.to_string())?,
            "loose-catalog",
            None,
        )),
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
                .ok_or_else(|| "package generation store has no active generation".to_owned())?;
            Ok((active.catalog, "generation-store", recovery))
        }
    }
}

impl LauncherProfileSource {
    pub(super) fn load(self) -> Result<Vec<String>, String> {
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

impl HostUpdateTrustOptions {
    pub(super) fn load(
        self,
        recover: bool,
    ) -> Result<(TrustedUpdatePolicy, Option<usize>), String> {
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

pub(super) fn launcher_request(arguments: &[OsString]) -> Result<LauncherRequestParts, String> {
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
    let cursor_nudge = options.cursor_nudge.take();
    let catalog = launcher_catalog_options(options)?;
    Ok((dry_run, request, catalog, bluetoothctl, cursor_nudge))
}

pub(super) fn launcher_catalog_options(
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
        || options.retro_library_root.is_some()
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
        let update_trust = HostUpdateTrustOptions {
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
            retro_library_root: options.retro_library_root,
        })
    } else {
        None
    };
    Ok(catalog)
}

pub(super) fn validate_launcher_profile_options(options: &LauncherOptions) -> Result<(), String> {
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

pub(super) fn parse_launcher_option(
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
        "--cursor-nudge" => set_path_option(
            &mut output.cursor_nudge,
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

pub(super) fn parse_launcher_catalog_option(
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
        "--retro-library-root" => &mut output.retro_library_root,
        "--profile-registry" => &mut output.profile_registry,
        "--update-root-store" => &mut output.update_root_store,
        "--update-root-anchors" => &mut output.update_root_anchors,
        "--update-root-protected-state" => &mut output.update_root_protected_state,
        value => return Err(format!("unknown launcher option: {value}")),
    };
    set_path_option(slot, required_next_path(arguments, cursor, option)?, option)
}

/// `(dry_run, request, catalog_options, bluetoothctl, cursor_nudge)`.
pub(super) type LauncherRequestParts = (
    bool,
    LauncherRequest,
    Option<LauncherCatalogOptions>,
    Option<PathBuf>,
    Option<PathBuf>,
);
