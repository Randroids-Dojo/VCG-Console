use super::{
    BluetoothPairingService, CatalogRoots, ContentlessStart, HostStatusServer,
    ProtectedUpdateRootState, current_target, plan_launcher,
};
use super::launcher_command::{
    HostUpdateTrustOptions, LauncherCatalogOptions, LauncherCatalogSourceOptions,
    LauncherProfileSource, launcher_request, load_retro_library, retro_library_report,
    start_launcher_host_api,
};
use super::update_root_command::{UpdateRootOptions, parse_update_root_option};
use super::provision_command::{retro_provision, retro_provision_request};
use super::retroarch_command::retroarch_request;
use super::process_command::{supervise, supervise_plan, watchdog_plan};
use ed25519_dalek::{Signer, SigningKey};
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{Read as _, Write as _};
use std::path::PathBuf;
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

    let options = || HostUpdateTrustOptions {
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

/// One signed loose catalog with a bootstrapped update root, so the
/// launcher's own catalog load path can be driven end to end.
struct LauncherCatalogFixture {
    root: PathBuf,
    catalog: PathBuf,
    signature: PathBuf,
    anchors: PathBuf,
    protected_state: PathBuf,
    store_root: PathBuf,
    install: PathBuf,
    runtime: PathBuf,
    data: PathBuf,
    manifest: PathBuf,
    frontend: PathBuf,
    core: PathBuf,
    base_config: PathBuf,
}

/// Bootstraps one update root that delegates installed-catalog authority
/// for the compiled target, and returns the delegated role key.
fn bootstrap_catalog_update_root(
    store_root: &std::path::Path,
    anchors: &std::path::Path,
    protected_state: &std::path::Path,
) -> SigningKey {
    fs::create_dir_all(store_root.join("generations")).expect("create root store");
    File::create(store_root.join(".vcg-update-root-store.lock")).expect("create lock");

    let root_key = SigningKey::from_bytes(&[91; 32]);
    let role_key = SigningKey::from_bytes(&[92; 32]);
    let root_bytes = format!(
        r#"{{"schemaVersion":1,"generation":1,"expiresUnixSeconds":2000000100,"rootThreshold":1,"rootKeys":[{{"keyId":"root-a","publicKey":"{}"}}],"roles":[{{"channel":"stable","artifact":"installed-catalog","target":"{}","threshold":1,"keys":[{{"keyId":"catalog-a","publicKey":"{}"}}]}}]}}"#,
        lower_hex(root_key.verifying_key().as_bytes()),
        current_target(),
        lower_hex(role_key.verifying_key().as_bytes())
    )
    .into_bytes();
    let mut signed = Vec::from(ROOT_DOMAIN);
    signed.extend_from_slice(&root_bytes);
    let root_signature_bytes = format!(
        r#"{{"schemaVersion":1,"signatures":[{{"keyId":"root-a","signature":"{}"}}]}}"#,
        lower_hex(&root_key.sign(&signed).to_bytes())
    )
    .into_bytes();
    let anchor_set = RootTrustAnchorSet::new(
        1,
        [
            RootTrustAnchor::new("root-a", *root_key.verifying_key().as_bytes())
                .expect("root anchor"),
        ],
    )
    .expect("anchor set");
    let protected_bytes = format!(
        r#"{{"schemaVersion":1,"generation":1,"rootMetadataSha256":"{}"}}"#,
        lower_hex(&Sha256::digest(&root_bytes))
    )
    .into_bytes();
    UpdateRootStore::open(UpdateRootStoreConfig {
        store_root: store_root.to_owned(),
    })
    .expect("open root store")
    .bootstrap(
        &root_bytes,
        &root_signature_bytes,
        &anchor_set,
        &ProtectedUpdateRootState::from_json_bytes(&protected_bytes).expect("protected state"),
        2_000_000_000,
    )
    .expect("bootstrap root");

    fs::write(
        anchors,
        format!(
            r#"{{"schemaVersion":1,"threshold":1,"anchors":[{{"keyId":"root-a","publicKey":"{}"}}]}}"#,
            lower_hex(root_key.verifying_key().as_bytes())
        ),
    )
    .expect("write anchors");
    fs::write(protected_state, protected_bytes).expect("write protected state");
    role_key
}

/// Writes one installed package tree and returns its manifest, frontend,
/// core, and base configuration.
fn write_install_root(install: &std::path::Path) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let package = install.join("packages").join("retro-2048");
    let retroarch = install.join("retroarch");
    let cores = install.join("cores");
    fs::create_dir_all(&package).expect("create package directory");
    fs::create_dir_all(&retroarch).expect("create frontend directory");
    fs::create_dir_all(&cores).expect("create core directory");
    let manifest = package.join("vcg-game.json");
    let frontend = retroarch.join("retroarch");
    let core = cores.join("2048_libretro.so");
    let base_config = retroarch.join("vcg-base.cfg");
    fs::write(
        &manifest,
        br#"{"documentType":"vcg-installed-game-manifest","schemaVersion":1,"id":"retro-2048","version":"1.0.0","runtime":"libretro","compatibilityStatus":"qualified","launch":{"timeoutMs":15000,"healthCheck":{"type":"process"}}}"#,
    )
    .expect("write manifest");
    fs::write(&frontend, b"frontend fixture").expect("write frontend");
    fs::write(&core, b"core fixture").expect("write core");
    fs::write(&base_config, b"config_save_on_exit = \"false\"\n")
        .expect("write base configuration");
    (manifest, frontend, core, base_config)
}

impl LauncherCatalogFixture {
    fn new() -> Self {
        let unique = NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "vcg-launcher-catalog-{}-{unique}",
            std::process::id()
        ));
        let store_root = root.join("update-root-store");
        let anchors = root.join("anchors.json");
        let protected_state = root.join("protected-root.json");
        let role_key = bootstrap_catalog_update_root(&store_root, &anchors, &protected_state);

        let install = root.join("installed");
        let (manifest, frontend, core, base_config) = write_install_root(&install);

        let document = format!(
            r#"{{"schemaVersion":1,"generation":7,"target":"{}","packages":[{{"id":"retro-2048","version":"1.0.0","qualification":"qualified","runtime":"libretro","manifest":{{"path":"packages/retro-2048/vcg-game.json","sha256":"{}"}},"libretro":{{"frontend":{{"path":"retroarch/retroarch","sha256":"{}"}},"core":{{"path":"cores/2048_libretro.so","sha256":"{}"}},"baseConfig":{{"path":"retroarch/vcg-base.cfg","sha256":"{}"}},"content":{{"mode":"none"}}}}}}]}}"#,
            current_target(),
            digest_file(&manifest),
            digest_file(&frontend),
            digest_file(&core),
            digest_file(&base_config)
        )
        .into_bytes();
        let catalog = root.join("installed-catalog.json");
        fs::write(&catalog, &document).expect("write catalog");
        let mut catalog_message = Vec::from(&b"VCG-INSTALLED-CATALOG-V1\0"[..]);
        catalog_message.extend_from_slice(&document);
        let signature = root.join("installed-catalog.sig.json");
        fs::write(
            &signature,
            format!(
                r#"{{"schemaVersion":1,"signatures":[{{"keyId":"catalog-a","signature":"{}"}}]}}"#,
                lower_hex(&role_key.sign(&catalog_message).to_bytes())
            ),
        )
        .expect("write catalog signature");

        Self {
            catalog,
            signature,
            anchors,
            protected_state,
            store_root,
            runtime: root.join("runtime"),
            data: root.join("data"),
            root,
            install,
            manifest,
            frontend,
            core,
            base_config,
        }
    }

    fn options(&self) -> LauncherCatalogOptions {
        LauncherCatalogOptions {
            source: LauncherCatalogSourceOptions::Loose {
                catalog: self.catalog.clone(),
                signature: self.signature.clone(),
                roots: CatalogRoots {
                    install_root: self.install.clone(),
                    content_root: None,
                    runtime_root: self.runtime.clone(),
                    data_root: self.data.clone(),
                },
            },
            update_trust: HostUpdateTrustOptions {
                store_root: self.store_root.clone(),
                root_anchors: self.anchors.clone(),
                protected_state: self.protected_state.clone(),
                channel: "stable".to_owned(),
                trusted_unix_seconds: 2_000_000_000,
            },
            profiles: LauncherProfileSource::DevelopmentIds(Vec::new()),
            watchdog_game_ids: Vec::new(),
            launch_replay_root: None,
            retro_library_root: None,
        }
    }
}

impl Drop for LauncherCatalogFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn digest_file(path: &std::path::Path) -> String {
    lower_hex(&Sha256::digest(
        fs::read(path).expect("read fixture artifact"),
    ))
}

#[test]
fn launcher_catalog_load_verifies_every_package_artifact() {
    let fixture = LauncherCatalogFixture::new();
    // Both modes load a clean catalog: dry-run does not mutate state.
    fixture
        .options()
        .load(false)
        .expect("clean catalog loads under dry-run");
    fixture
        .options()
        .load(true)
        .expect("clean catalog loads at normal startup");

    for (role, artifact, replacement) in [
        ("core", fixture.core.clone(), b"tampered core".as_slice()),
        (
            "frontend",
            fixture.frontend.clone(),
            b"tampered frontend".as_slice(),
        ),
        (
            "manifest",
            fixture.manifest.clone(),
            br#"{"schemaVersion":1,"id":"retro-2048","version":"1.0.1","runtime":"libretro","compatibilityStatus":"qualified","launch":{"timeoutMs":15000,"healthCheck":{"type":"process"}}}"#.as_slice(),
        ),
    ] {
        let original = fs::read(&artifact).expect("read artifact");
        let expected = digest_file(&artifact);
        fs::write(&artifact, replacement).expect("tamper artifact");
        let actual = digest_file(&artifact);
        for recover in [false, true] {
            let Err(error) = fixture.options().load(recover) else {
                panic!("tampered {role} must fail catalog load");
            };
            assert!(
                error.contains(&format!("{role} SHA-256 mismatch"))
                    && error.contains(&format!("expected {expected}"))
                    && error.contains(&format!("got {actual}")),
                "{role} failure reports role and both digests: {error}"
            );
        }
        fs::write(&artifact, original).expect("restore artifact");
    }

    assert!(fixture.base_config.is_file());
    fixture
        .options()
        .load(false)
        .expect("restored catalog loads again");
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
    let cursor_nudge_path = std::env::current_dir()
        .expect("current directory is available")
        .join("cursor-nudge");
    let arguments = vec![
        OsString::from("--dry-run"),
        OsString::from("--windowed"),
        OsString::from("--browser"),
        browser.into_os_string(),
        OsString::from("--bluetoothctl"),
        bluetoothctl_path.clone().into_os_string(),
        OsString::from("--cursor-nudge"),
        cursor_nudge_path.clone().into_os_string(),
        OsString::from("--profile-dir"),
        profile.into_os_string(),
        OsString::from("--url"),
        OsString::from("http://127.0.0.1:5173/"),
    ];
    let (dry_run, request, catalog, bluetoothctl, cursor_nudge) =
        launcher_request(&arguments).expect("launcher request parses");

    assert!(dry_run);
    assert!(catalog.is_none());
    assert_eq!(bluetoothctl, Some(bluetoothctl_path));
    assert_eq!(cursor_nudge, Some(cursor_nudge_path));
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
    let (_, _, catalog, _, _) =
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
    let (_, _, catalog, _, _) =
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
        update_trust: HostUpdateTrustOptions {
            store_root: root_store.clone(),
            root_anchors: fixture.join("missing-anchors.json"),
            protected_state: fixture.join("missing-protected-state.json"),
            channel: "stable".to_owned(),
            trusted_unix_seconds: 2_000_000_000,
        },
        profiles: LauncherProfileSource::Registry(registry),
        watchdog_game_ids: Vec::new(),
        launch_replay_root: Some(fixture.join("launch-replay")),
        retro_library_root: None,
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
            update_trust: HostUpdateTrustOptions {
                store_root: root_store.clone(),
                root_anchors: fixture.join("missing-anchors.json"),
                protected_state: fixture.join("missing-root-protected-state.json"),
                channel: "stable".to_owned(),
                trusted_unix_seconds: 2_000_000_000,
            },
            profiles: LauncherProfileSource::DevelopmentIds(Vec::new()),
            watchdog_game_ids: Vec::new(),
            launch_replay_root: None,
            retro_library_root: None,
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
    let (_, _, catalog, _, _) =
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

/// The `retro-provision` arguments for one fixture root: a signed
/// NES system policy, the update trust that verifies it, and the staged
/// payload and writable roots beneath the same directory.
fn retro_provision_arguments(root: &std::path::Path) -> Vec<String> {
    let text = |path: &std::path::Path| path.to_str().expect("UTF-8 fixture path").to_owned();
    let mut arguments = vec![
        "--writable-root".to_owned(),
        text(&root.join("writable")),
        "--payload".to_owned(),
        text(&root.join("payload")),
        "--reserve-bytes".to_owned(),
        "4096".to_owned(),
    ];
    arguments.extend(signed_retro_system_policy_arguments(root));
    arguments
}

/// Writes one signed system policy naming NES and returns the policy,
/// signature, and update-trust arguments that verify it.
fn signed_retro_system_policy_arguments(root: &std::path::Path) -> Vec<String> {
    let (store_root, anchors_path, protected_path, _catalog_key, policy_key) =
        bootstrapped_update_root(root);
    let policy_bytes = format!(
        r#"{{"schemaVersion":1,"policyId":"retro-policy","policyRevision":1,"target":"{}","maxLibraryEntries":100000,"maxLibraryBytes":8589934592,"systems":[{{"systemId":"nes","extensions":[".fds",".nes"],"coreId":"mesen","controllerProfile":"retropad-standard-v1","maxContentBytes":16777216}}]}}"#,
        current_target()
    )
    .into_bytes();
    let policy_path = root.join("retro-system-policy.json");
    fs::write(&policy_path, &policy_bytes).expect("write retro system policy");
    let mut signed_policy = Vec::from(RETRO_POLICY_DOMAIN);
    signed_policy.extend_from_slice(&policy_bytes);
    let signature_path = root.join("retro-system-policy.signatures.json");
    fs::write(
        &signature_path,
        format!(
            r#"{{"schemaVersion":1,"signatures":[{{"keyId":"retro-policy-a","signature":"{}"}}]}}"#,
            lower_hex(&policy_key.sign(&signed_policy).to_bytes())
        ),
    )
    .expect("write retro system policy signatures");

    let text = |path: &std::path::Path| path.to_str().expect("UTF-8 fixture path").to_owned();
    vec![
        "--system-policy".to_owned(),
        text(&policy_path),
        "--system-policy-signature".to_owned(),
        text(&signature_path),
        "--update-root-store".to_owned(),
        text(&store_root),
        "--update-root-anchors".to_owned(),
        text(&anchors_path),
        "--update-root-protected-state".to_owned(),
        text(&protected_path),
        "--update-channel".to_owned(),
        "stable".to_owned(),
        "--trusted-unix-seconds".to_owned(),
        "2000000000".to_owned(),
    ]
}

/// Writes one staged NES payload and returns the content digest its
/// entry ID and object name are derived from.
fn write_nes_payload(payload: &std::path::Path, content: &[u8], title: &str) -> String {
    let sha256 = lower_hex(&Sha256::digest(content));
    fs::create_dir_all(payload.join("objects")).expect("create payload objects");
    fs::write(
        payload
            .join("objects")
            .join(format!("nes-content-{sha256}.nes")),
        content,
    )
    .expect("write payload object");
    fs::write(
        payload.join("staged-content.json"),
        serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 1,
            "documentType": "vcg-operator-staged-retro-content",
            "systemId": "nes",
            "coreId": "mesen",
            "controllerProfile": "retropad-standard-v1",
            "provenance": "operator-staged-local-collection",
            "sourceLabel": "operator collection",
            "entryCount": 1,
            "totalBytes": content.len(),
            "entries": [{
                "entryId": format!("content-{sha256}"),
                "systemId": "nes",
                "sha256": sha256,
                "sizeBytes": content.len(),
                "extension": ".nes",
                "title": title,
                "coreId": "mesen",
                "controllerProfile": "retropad-standard-v1",
                "objectName": format!("nes-content-{sha256}.nes"),
                "container": "plain"
            }]
        }))
        .expect("serialize staged manifest"),
    )
    .expect("write staged manifest");
    sha256
}

/// Arguments whose paths never have to exist, for parser-only checks.
fn retro_provision_parse_arguments(
    writable: &std::path::Path,
    payload: &std::path::Path,
) -> Vec<String> {
    vec![
        "--writable-root".to_owned(),
        writable.to_str().expect("UTF-8 writable root").to_owned(),
        "--payload".to_owned(),
        payload.to_str().expect("UTF-8 payload root").to_owned(),
        "--system-policy".to_owned(),
        "/metadata/retro-system-policy.json".to_owned(),
        "--system-policy-signature".to_owned(),
        "/metadata/retro-system-policy.signatures.json".to_owned(),
        "--update-root-store".to_owned(),
        "/metadata/update-root-store".to_owned(),
        "--update-root-anchors".to_owned(),
        "/metadata/update-root-anchors.json".to_owned(),
        "--update-root-protected-state".to_owned(),
        "/metadata/update-root-protected-state.json".to_owned(),
        "--update-channel".to_owned(),
        "stable".to_owned(),
        "--trusted-unix-seconds".to_owned(),
        "2000000000".to_owned(),
        "--reserve-bytes".to_owned(),
        "4096".to_owned(),
    ]
}

fn os_args(values: &[String]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

#[test]
fn retro_provision_parser_requires_signed_policy_inputs_and_derives_store_roots() {
    let writable = std::env::temp_dir().join("vcg-retro-provision-parse-writable");
    let payload = std::env::temp_dir().join("vcg-retro-provision-parse-payload");
    let base = retro_provision_parse_arguments(&writable, &payload);

    let request =
        retro_provision_request(&os_args(&base)).expect("retro-provision options parse");
    assert!(!request.dry_run);
    assert_eq!(request.payload, payload);
    assert_eq!(
        request.config.staging_root,
        writable.join("staging").join("retro-imports")
    );
    assert_eq!(request.config.content_root, writable.join("retro"));
    assert_eq!(request.config.reserve_bytes, 4_096);

    let mut duplicate_policy = base.clone();
    duplicate_policy.extend([
        "--system-policy".to_owned(),
        "/metadata/other-policy.json".to_owned(),
    ]);
    let mut unknown = base.clone();
    unknown.extend(["--system".to_owned(), "nes".to_owned()]);
    let mut retired = base.clone();
    retired.extend(["--core".to_owned(), "mesen".to_owned()]);
    let mut retired_ceiling = base.clone();
    retired_ceiling.extend(["--max-library-bytes".to_owned(), "1".to_owned()]);
    let without = |option: &str| {
        base.chunks(2)
            .filter(|pair| pair[0] != option)
            .flat_map(<[String]>::to_vec)
            .collect::<Vec<_>>()
    };

    for invalid in [
        duplicate_policy,
        unknown,
        retired,
        retired_ceiling,
        without("--payload"),
        without("--system-policy"),
        without("--system-policy-signature"),
        without("--update-root-store"),
        without("--update-root-anchors"),
        without("--update-root-protected-state"),
        without("--update-channel"),
        without("--trusted-unix-seconds"),
        without("--reserve-bytes"),
    ] {
        assert!(retro_provision_request(&os_args(&invalid)).is_err());
    }
    assert!(retro_provision_request(&[]).is_err());
}

#[test]
fn retro_provision_provisions_roots_and_commits_a_staged_payload() {
    let root = std::env::temp_dir().join(format!(
        "vcg-retro-provision-cli-{}-{}",
        std::process::id(),
        NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed)
    ));
    let writable = root.join("writable");
    let sha256 = write_nes_payload(
        &root.join("payload"),
        b"operator staged nes bytes",
        "Operator Fixture",
    );

    let base = retro_provision_arguments(&root);
    let mut dry_run = vec!["--dry-run".to_owned()];
    dry_run.extend(base.clone());
    assert!(
        retro_provision(&os_args(&dry_run)).is_err(),
        "a dry run must refuse to create roots"
    );

    retro_provision(&os_args(&base)).expect("provision the staged payload");
    let library = fs::read_to_string(
        writable
            .join("retro")
            .join("libraries")
            .join("generation-00000000000000000002.json"),
    )
    .expect("read committed generation");
    assert!(library.contains("\"transport\":\"operator-provisioned\""));
    assert!(library.contains(&sha256));
    assert!(!library.contains("importSessionId"));

    retro_provision(&os_args(&dry_run)).expect("dry run against provisioned roots");
    assert!(
        !writable
            .join("retro")
            .join("libraries")
            .join("generation-00000000000000000003.json")
            .exists()
    );

    if root.starts_with(std::env::temp_dir()) {
        let _ = fs::remove_dir_all(&root);
    }
}

#[test]
fn retro_provision_refuses_an_unauthorized_system_policy_before_creating_roots() {
    let root = unique_fixture_root("vcg-retro-provision-policy-authority");
    let writable = root.join("writable");
    write_nes_payload(
        &root.join("payload"),
        b"unauthorized policy fixture bytes",
        "Authority Fixture",
    );
    let base = retro_provision_arguments(&root);
    let policy_path = root.join("retro-system-policy.json");
    let signature_path = root.join("retro-system-policy.signatures.json");
    let policy_bytes = fs::read(&policy_path).expect("read the signed policy");
    let signature_bytes = fs::read(&signature_path).expect("read the policy signatures");

    let raised_ceiling = String::from_utf8(policy_bytes.clone())
        .expect("UTF-8 policy")
        .replace("16777216", "33554432");
    fs::write(&policy_path, &raised_ceiling).expect("write the tampered policy");
    let refusal = retro_provision(&os_args(&base)).expect_err("a tampered policy is refused");
    assert!(refusal.contains("update authority"), "{refusal}");
    assert!(
        !writable.exists(),
        "verification must precede any filesystem mutation"
    );

    fs::write(&policy_path, &policy_bytes).expect("restore the signed policy");
    let (_, _, _, catalog_key, _) = bootstrapped_update_root(&root);
    let mut signed_policy = Vec::from(RETRO_POLICY_DOMAIN);
    signed_policy.extend_from_slice(&policy_bytes);
    fs::write(
        &signature_path,
        format!(
            r#"{{"schemaVersion":1,"signatures":[{{"keyId":"catalog-a","signature":"{}"}}]}}"#,
            lower_hex(&catalog_key.sign(&signed_policy).to_bytes())
        ),
    )
    .expect("write the wrong-role signatures");
    let refusal =
        retro_provision(&os_args(&base)).expect_err("the catalog role cannot sign a policy");
    assert!(refusal.contains("update authority"), "{refusal}");
    assert!(!writable.exists());

    fs::write(&signature_path, &signature_bytes).expect("restore the policy signatures");
    retro_provision(&os_args(&base)).expect("the signed policy provisions");
    assert!(
        writable
            .join("retro")
            .join("libraries")
            .join("generation-00000000000000000002.json")
            .exists()
    );

    discard_fixture(&root);
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
const LOOPBACK_ORIGIN: &str = "http://127.0.0.1:5173";
const CATALOG_DOMAIN: &[u8] = b"VCG-INSTALLED-CATALOG-V1\0";
const RETRO_POLICY_DOMAIN: &[u8] = b"VCG-RETRO-SYSTEM-POLICY-V1\0";
const LIBRARY_FIXTURE_TITLE: &str = "Launcher Library Fixture";

fn unique_fixture_root(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "{label}-{}-{}",
        std::process::id(),
        NEXT_ROOT_FIXTURE.fetch_add(1, Ordering::Relaxed)
    ))
}

/// Bootstraps one accepted update root that delegates the installed
/// catalog and the retro system policy for the compiled target, and
/// returns the store root, the anchor and protected-state paths, and both
/// delegated signing keys.
///
/// A fixture root that already carries an accepted store keeps it, so two
/// artifacts in one fixture share one root.
fn bootstrapped_update_root(
    root: &std::path::Path,
) -> (
    std::path::PathBuf,
    std::path::PathBuf,
    std::path::PathBuf,
    SigningKey,
    SigningKey,
) {
    let store_root = root.join("root-store");
    let anchors_path = root.join("root-anchors.json");
    let protected_path = root.join("protected-root.json");
    let root_key = SigningKey::from_bytes(&[91; 32]);
    let catalog_key = SigningKey::from_bytes(&[92; 32]);
    let policy_key = SigningKey::from_bytes(&[93; 32]);
    if protected_path.exists() {
        return (
            store_root,
            anchors_path,
            protected_path,
            catalog_key,
            policy_key,
        );
    }
    fs::create_dir_all(store_root.join("generations")).expect("create root store");
    File::create(store_root.join(".vcg-update-root-store.lock")).expect("create root lock");

    let target = current_target();
    let root_bytes = format!(
        r#"{{"schemaVersion":1,"generation":1,"expiresUnixSeconds":2000000100,"rootThreshold":1,"rootKeys":[{{"keyId":"root-a","publicKey":"{}"}}],"roles":[{{"channel":"stable","artifact":"installed-catalog","target":"{target}","threshold":1,"keys":[{{"keyId":"catalog-a","publicKey":"{}"}}]}},{{"channel":"stable","artifact":"retro-system-policy","target":"{target}","threshold":1,"keys":[{{"keyId":"retro-policy-a","publicKey":"{}"}}]}}]}}"#,
        lower_hex(root_key.verifying_key().as_bytes()),
        lower_hex(catalog_key.verifying_key().as_bytes()),
        lower_hex(policy_key.verifying_key().as_bytes())
    )
    .into_bytes();
    let mut signed_root = Vec::from(ROOT_DOMAIN);
    signed_root.extend_from_slice(&root_bytes);
    let root_signatures = format!(
        r#"{{"schemaVersion":1,"signatures":[{{"keyId":"root-a","signature":"{}"}}]}}"#,
        lower_hex(&root_key.sign(&signed_root).to_bytes())
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
    let protected_bytes = format!(
        r#"{{"schemaVersion":1,"generation":1,"rootMetadataSha256":"{}"}}"#,
        lower_hex(&Sha256::digest(&root_bytes))
    )
    .into_bytes();
    let protected_state =
        ProtectedUpdateRootState::from_json_bytes(&protected_bytes).expect("protected state");
    UpdateRootStore::open(UpdateRootStoreConfig {
        store_root: store_root.clone(),
    })
    .expect("open root store")
    .bootstrap(
        &root_bytes,
        &root_signatures,
        &anchors,
        &protected_state,
        2_000_000_000,
    )
    .expect("bootstrap root");

    fs::write(
        &anchors_path,
        format!(
            r#"{{"schemaVersion":1,"threshold":1,"anchors":[{{"keyId":"root-a","publicKey":"{}"}}]}}"#,
            lower_hex(root_key.verifying_key().as_bytes())
        ),
    )
    .expect("write anchors");
    fs::write(&protected_path, protected_bytes).expect("write protected root state");

    (
        store_root,
        anchors_path,
        protected_path,
        catalog_key,
        policy_key,
    )
}

/// Writes an empty signature-verified catalog beneath a bootstrapped
/// update root, and returns the complete launcher configuration for it.
fn signed_catalog_launcher_arguments(root: &std::path::Path) -> Vec<String> {
    let (store_root, anchors_path, protected_path, role_key, _policy_key) =
        bootstrapped_update_root(root);
    let target = current_target();
    let catalog_bytes =
        format!(r#"{{"schemaVersion":1,"generation":1,"target":"{target}","packages":[]}}"#)
            .into_bytes();
    let mut signed_catalog = Vec::from(CATALOG_DOMAIN);
    signed_catalog.extend_from_slice(&catalog_bytes);
    let catalog_path = root.join("catalog.json");
    fs::write(&catalog_path, &catalog_bytes).expect("write catalog");
    let catalog_signature_path = root.join("catalog.signatures.json");
    fs::write(
        &catalog_signature_path,
        format!(
            r#"{{"schemaVersion":1,"signatures":[{{"keyId":"catalog-a","signature":"{}"}}]}}"#,
            lower_hex(&role_key.sign(&signed_catalog).to_bytes())
        ),
    )
    .expect("write catalog signatures");

    let install_root = root.join("installed");
    fs::create_dir_all(&install_root).expect("create install root");

    let text = |path: &std::path::Path| path.to_str().expect("UTF-8 fixture path").to_owned();
    vec![
        "--browser".to_owned(),
        text(&root.join("browser")),
        "--profile-dir".to_owned(),
        text(&root.join("browser-profile")),
        "--url".to_owned(),
        "http://127.0.0.1:5173/".to_owned(),
        "--catalog".to_owned(),
        text(&catalog_path),
        "--catalog-signature".to_owned(),
        text(&catalog_signature_path),
        "--install-root".to_owned(),
        text(&install_root),
        "--runtime-root".to_owned(),
        text(&root.join("runtime")),
        "--data-root".to_owned(),
        text(&root.join("data")),
        "--update-root-store".to_owned(),
        text(&store_root),
        "--update-root-anchors".to_owned(),
        text(&anchors_path),
        "--update-root-protected-state".to_owned(),
        text(&protected_path),
        "--update-channel".to_owned(),
        "stable".to_owned(),
        "--trusted-unix-seconds".to_owned(),
        "2000000000".to_owned(),
    ]
}

/// Provisions one operator-staged entry and returns the writable root
/// `--retro-library-root` names.
fn provisioned_retro_library_root(root: &std::path::Path) -> std::path::PathBuf {
    let writable = root.join("writable");
    write_nes_payload(
        &root.join("payload"),
        b"launcher retro library fixture bytes",
        LIBRARY_FIXTURE_TITLE,
    );
    retro_provision(&os_args(&retro_provision_arguments(root)))
        .expect("provision the retro library fixture");
    writable
}

fn host_api_status(server: &HostStatusServer) -> String {
    let launcher_url = server
        .launcher_url("http://127.0.0.1:5173/")
        .expect("launcher URL builds");
    let token = launcher_url
        .split("vcg-host-token=")
        .nth(1)
        .expect("token is present");
    let mut stream =
        std::net::TcpStream::connect(server.address()).expect("host API accepts a connection");
    stream
        .write_all(
            format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {LOOPBACK_ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            )
            .as_bytes(),
        )
        .expect("status request writes");
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .expect("status response reads");
    response
}

fn discard_fixture(root: &std::path::Path) {
    if root.starts_with(std::env::temp_dir()) {
        let _ = fs::remove_dir_all(root);
    }
}

#[test]
fn launcher_advertises_the_retro_library_only_when_its_root_is_configured() {
    let root = unique_fixture_root("vcg-launcher-retro-library");
    let base = signed_catalog_launcher_arguments(&root);

    let (_, _, without_library, _, _) =
        launcher_request(&os_args(&base)).expect("catalog configuration parses");
    let configuration = without_library
        .expect("catalog options exist")
        .load(false)
        .expect("catalog loads without a library");
    assert!(configuration.library.is_none());
    let metadata_only =
        start_launcher_host_api(LOOPBACK_ORIGIN.to_owned(), Some(configuration), None)
            .expect("host API starts without a library");
    let status = host_api_status(&metadata_only);
    assert!(status.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(status.contains("\"trusted-package-catalog\""));
    assert!(
        !status.contains("retro-library"),
        "an unconfigured library must not be advertised"
    );
    drop(metadata_only);

    let writable = provisioned_retro_library_root(&root);
    let mut with_library = base;
    with_library.extend([
        "--retro-library-root".to_owned(),
        writable.to_str().expect("UTF-8 writable root").to_owned(),
    ]);
    let (_, _, configured, _, _) =
        launcher_request(&os_args(&with_library)).expect("library configuration parses");
    let configuration = configured
        .expect("catalog options exist")
        .load(false)
        .expect("catalog and library load");
    let library = configuration
        .library
        .as_ref()
        .expect("the configured library loads");
    assert_eq!(library.generation(), 2);
    assert_eq!(library.entries().len(), 1);
    let server = start_launcher_host_api(LOOPBACK_ORIGIN.to_owned(), Some(configuration), None)
        .expect("host API starts with a library");
    let status = host_api_status(&server);
    assert!(status.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(status.contains("\"retro-library\""));
    drop(server);

    discard_fixture(&root);
}

#[test]
fn launcher_serves_the_retro_library_alongside_launch_profiles() {
    let root = unique_fixture_root("vcg-launcher-retro-library-profiles");
    let mut arguments = signed_catalog_launcher_arguments(&root);
    let writable = provisioned_retro_library_root(&root);
    let text = |path: &std::path::Path| path.to_str().expect("UTF-8 fixture path").to_owned();
    arguments.extend([
        "--profile-id".to_owned(),
        "profile-randy".to_owned(),
        "--launch-replay-root".to_owned(),
        text(&root.join("launch-replay")),
        "--retro-library-root".to_owned(),
        text(&writable),
    ]);

    let (_, _, catalog, _, _) =
        launcher_request(&os_args(&arguments)).expect("library launch configuration parses");
    let configuration = catalog
        .expect("catalog options exist")
        .load(false)
        .expect("catalog, profiles, and library load");
    let server = start_launcher_host_api(LOOPBACK_ORIGIN.to_owned(), Some(configuration), None)
        .expect("host API starts with a library and launch profiles");
    let status = host_api_status(&server);
    assert!(status.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(status.contains("\"trusted-package-launch\""));
    assert!(status.contains("\"retro-library\""));
    drop(server);

    discard_fixture(&root);
}

/// The appliance systemd unit always passes `--bluetoothctl`, and a retro
/// game cannot be played without a controller.
#[test]
fn launcher_serves_the_retro_library_with_controller_pairing() {
    let root = unique_fixture_root("vcg-launcher-retro-library-pairing");
    let mut arguments = signed_catalog_launcher_arguments(&root);
    let writable = provisioned_retro_library_root(&root);
    let text = |path: &std::path::Path| path.to_str().expect("UTF-8 fixture path").to_owned();
    arguments.extend([
        "--retro-library-root".to_owned(),
        text(&writable),
        "--bluetoothctl".to_owned(),
        text(&root.join("bluetoothctl")),
    ]);

    let (_, _, catalog, bluetoothctl, _) = launcher_request(&os_args(&arguments))
        .expect("a library and controller pairing parse together");
    let configuration = catalog
        .expect("catalog options exist")
        .load(false)
        .expect("catalog and library load");
    let service = BluetoothPairingService::new(
        bluetoothctl.expect("the pairing executable is configured"),
    )
    .expect("the pairing service configures");
    let server = start_launcher_host_api(
        LOOPBACK_ORIGIN.to_owned(),
        Some(configuration),
        Some(service),
    )
    .expect("host API starts with a library and controller pairing");
    let status = host_api_status(&server);
    assert!(status.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(status.contains("\"retro-library\""));
    assert!(status.contains("\"bluetooth-controller-pairing\""));
    drop(server);

    discard_fixture(&root);
}

#[test]
fn launcher_dry_run_discloses_retro_library_counts_only() {
    let root = unique_fixture_root("vcg-launcher-retro-library-report");
    let writable = provisioned_retro_library_root(&root);
    let library = load_retro_library(&writable).expect("the provisioned library loads");
    let report = retro_library_report(&library);

    assert_eq!(report, "launcher:retro-library generation=2 entries=1");
    let entry = &library.entries()[0];
    for disclosure in [
        writable.to_str().expect("UTF-8 writable root"),
        library
            .object_root()
            .to_str()
            .expect("UTF-8 library object root"),
        entry.title(),
        entry.entry_id(),
    ] {
        assert!(
            !report.contains(disclosure),
            "the dry-run library report disclosed {disclosure}"
        );
    }

    discard_fixture(&root);
}

#[test]
fn launcher_retro_library_root_fails_closed() {
    let root = unique_fixture_root("vcg-launcher-retro-library-refusal");
    fs::create_dir_all(&root).expect("create refusal fixture");

    assert!(load_retro_library(std::path::Path::new("writable")).is_err());
    assert!(load_retro_library(&root.join("absent")).is_err());

    let unprovisioned = root.join("unprovisioned");
    fs::create_dir_all(unprovisioned.join("retro")).expect("create retro root");
    fs::create_dir_all(unprovisioned.join("staging").join("retro-imports"))
        .expect("create staging root");
    assert!(load_retro_library(&unprovisioned).is_err());

    let writable = provisioned_retro_library_root(&root);
    assert!(load_retro_library(&writable).is_ok());
    fs::write(
        writable
            .join("staging")
            .join("retro-imports")
            .join("retro-import.intent.json"),
        b"{}",
    )
    .expect("write pending import state");
    let Err(error) = load_retro_library(&writable) else {
        panic!("a library awaiting recovery must not be served");
    };
    assert_eq!(error, "retro library: retro import recovery is required");

    discard_fixture(&root);
}

#[test]
fn retro_library_root_joins_catalog_mode_and_every_other_capability() {
    let base = [
        "--browser",
        "/browser",
        "--profile-dir",
        "/profile",
        "--url",
        "http://127.0.0.1:5173/",
    ];
    let mut alone = base.to_vec();
    alone.extend(["--retro-library-root", "/writable"]);
    assert!(
        launcher_request(&args(&alone)).is_err(),
        "the library root joins the all-or-nothing catalog configuration"
    );

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
        "--retro-library-root",
        "/writable",
    ]);
    extend_update_trust(&mut complete);
    let (_, _, catalog, _, _) =
        launcher_request(&args(&complete)).expect("library configuration parses");
    assert_eq!(
        catalog
            .expect("catalog options exist")
            .retro_library_root
            .as_deref(),
        Some(std::path::Path::new("/writable"))
    );

    let mut duplicate = complete.clone();
    duplicate.extend(["--retro-library-root", "/other-writable"]);
    assert!(launcher_request(&args(&duplicate)).is_err());

    let mut with_bluetooth = complete.clone();
    with_bluetooth.extend(["--bluetoothctl", "/usr/bin/bluetoothctl"]);
    let (_, _, catalog, bluetoothctl, _) = launcher_request(&args(&with_bluetooth))
        .expect("a library pairs with controller pairing");
    assert_eq!(
        bluetoothctl.as_deref(),
        Some(std::path::Path::new("/usr/bin/bluetoothctl"))
    );
    assert!(
        catalog
            .expect("catalog options exist")
            .retro_library_root
            .is_some()
    );

    let mut with_watchdog = complete;
    with_watchdog.extend([
        "--launch-replay-root",
        "/launch-replay",
        "--profile-id",
        "profile-randy",
        "--watchdog-game-id",
        "retro-2048",
    ]);
    let (_, _, catalog, _, _) =
        launcher_request(&args(&with_watchdog)).expect("a library pairs with watchdog games");
    let catalog = catalog.expect("catalog options exist");
    assert!(catalog.retro_library_root.is_some());
    assert_eq!(catalog.watchdog_game_ids, vec!["retro-2048".to_owned()]);
}
