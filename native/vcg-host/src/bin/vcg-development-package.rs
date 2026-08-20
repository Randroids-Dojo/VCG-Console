//! Machine-local package builder for the Windows `x86_64` Retro 2048 candidate.

use std::collections::BTreeMap;
use std::env;
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tar::{Builder, EntryType, Header};
use vcg_host::installed_catalog::INSTALLED_MANIFEST_DOCUMENT_TYPE;
use vcg_host::package_generation::{
    PackageGenerationConfig, PackageGenerationStore, ProtectedPackageGenerationState,
};
use vcg_host::package_health::CandidateHealthChecker;
use vcg_host::update_root_store::{
    ProtectedUpdateRootState, RootAcceptance, UpdateRootStore, UpdateRootStoreConfig,
};
use vcg_host::update_trust::{
    RootTrustAnchorSet, TrustedUpdatePolicy, UpdateArtifactKind, artifact_signing_message,
    root_signing_message,
};

const CHANNEL: &str = "development";
const TARGET: &str = "x86_64-windows";
const PACKAGE_ID: &str = "retro-2048";
const PACKAGE_VERSION: &str = "qualification-candidate-2026-07-23";
const ROOT_KEY_ID: &str = "development-root-one";
const CATALOG_KEY_ID: &str = "development-catalog-one";
const RELEASE_KEY_ID: &str = "development-release-one";
const FRONTEND_ARCHIVE_SHA256: &str =
    "b2139b1d0f9d4526dc6b5ce23cbb3efdc766096fa6f2c3df016818b486ac6372";
const CORES_ARCHIVE_SHA256: &str =
    "86b871e11b9b4772ac644b40a38f2c8e9449da1f355eae7da08aa061148547b0";
const FRONTEND_SHA256: &str = "81c11b6f24932bf7918f05eee8928035bff3887335fd2a081507c75e9d94d06a";
const CORE_SHA256: &str = "60227525eb9b222497dde0c6b8707876f6458e65675b9f24d91e333372bdc151";

fn main() -> ExitCode {
    let arguments: Vec<OsString> = env::args_os().skip(1).collect();
    match run(&arguments) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vcg-development-package: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(arguments: &[OsString]) -> Result<(), Box<dyn std::error::Error>> {
    if env::consts::ARCH != "x86_64" || env::consts::OS != "windows" {
        return Err("this development package tool supports only x86_64-windows".into());
    }
    let options = Options::parse(arguments)?;
    options.validate()?;
    let trusted_time = unix_time()?;
    let trust = provision_trust(&options.development_root, trusted_time)?;
    let paths = DevelopmentPaths::provision(&options.development_root)?;
    let package_state = load_or_initialize_package_state(&paths.package_protected_state)?;
    let store = PackageGenerationStore::open(PackageGenerationConfig {
        store_root: paths.package_store.clone(),
        update_policy: trust.policy.clone(),
        protected_state: package_state,
        content_root: Some(paths.content.clone()),
        runtime_root: paths.runtime.clone(),
        data_root: paths.data.clone(),
    })?;
    if let Some(active) = store.load_active()? {
        active.catalog.verify_all_artifacts()?;
        println!(
            "development-package:already-active generation={} package={} version={} channel={CHANNEL}",
            active.generation, PACKAGE_ID, PACKAGE_VERSION
        );
        print_launcher_arguments(&options.development_root, trusted_time);
        return Ok(());
    }

    verify_exact_file(
        &options.frontend_archive,
        FRONTEND_ARCHIVE_SHA256,
        "RetroArch archive",
    )?;
    verify_exact_file(
        &options.cores_archive,
        CORES_ARCHIVE_SHA256,
        "RetroArch core archive",
    )?;
    let extraction = extract_official_archives(&options, &paths)?;
    let prepared = prepare_release_source(&options, &paths, &extraction, &trust, 1)?;
    let staged = store.stage_package_tar(
        "retro-2048-development-one",
        &prepared.descriptor,
        &prepared.descriptor_signatures,
        &prepared.archive,
        1,
    )?;
    println!(
        "development-package:staged generation={} files={} expandedBytes={}",
        staged.generation, staged.intake.file_count, staged.intake.expanded_bytes
    );
    let health = CandidateHealthChecker::new(Duration::from_millis(50))?;
    let promotion = store.promote_health_checked("retro-2048-development-one", &health)?;
    fs::write(
        &paths.package_protected_state,
        promotion.protected_state.to_json_bytes()?,
    )?;
    let committed = PackageGenerationStore::open(PackageGenerationConfig {
        store_root: paths.package_store.clone(),
        update_policy: trust.policy.clone(),
        protected_state: promotion.protected_state,
        content_root: Some(paths.content.clone()),
        runtime_root: paths.runtime.clone(),
        data_root: paths.data.clone(),
    })?
    .load_active()?
    .ok_or("promoted package generation is not active")?;
    committed.catalog.verify_all_artifacts()?;
    write_evidence(
        &options,
        &paths,
        &prepared,
        committed.generation,
        trusted_time,
        &trust,
    )?;
    fs::remove_dir_all(&extraction)?;
    println!(
        "development-package:active generation={} package={} version={} qualification=development compatibility=unverified",
        committed.generation, PACKAGE_ID, PACKAGE_VERSION
    );
    print_launcher_arguments(&options.development_root, trusted_time);
    Ok(())
}

#[derive(Debug)]
struct Options {
    development_root: PathBuf,
    frontend_archive: PathBuf,
    cores_archive: PathBuf,
    base_config: PathBuf,
    notices: PathBuf,
}

impl Options {
    fn parse(arguments: &[OsString]) -> Result<Self, Box<dyn std::error::Error>> {
        let mut values = BTreeMap::new();
        let mut cursor = 0;
        while cursor < arguments.len() {
            let option = arguments[cursor]
                .to_str()
                .ok_or("options must be valid UTF-8")?;
            if ![
                "--development-root",
                "--frontend-archive",
                "--cores-archive",
                "--base-config",
                "--notices",
            ]
            .contains(&option)
            {
                return Err(format!("unknown option {option}").into());
            }
            cursor += 1;
            let value = arguments
                .get(cursor)
                .ok_or_else(|| format!("{option} requires a path"))?;
            if values
                .insert(option.to_owned(), PathBuf::from(value))
                .is_some()
            {
                return Err(format!("{option} may be supplied only once").into());
            }
            cursor += 1;
        }
        let mut required = |name: &str| {
            values
                .remove(name)
                .ok_or_else(|| format!("missing required option {name}"))
        };
        Ok(Self {
            development_root: required("--development-root")?,
            frontend_archive: required("--frontend-archive")?,
            cores_archive: required("--cores-archive")?,
            base_config: required("--base-config")?,
            notices: required("--notices")?,
        })
    }

    fn validate(&self) -> Result<(), Box<dyn std::error::Error>> {
        if !self.development_root.is_absolute() {
            return Err("development root must be absolute".into());
        }
        for (kind, path) in [
            ("frontend archive", &self.frontend_archive),
            ("cores archive", &self.cores_archive),
            ("base configuration", &self.base_config),
            ("notices", &self.notices),
        ] {
            if !path.is_absolute() || !path.is_file() {
                return Err(format!(
                    "{kind} must be an absolute regular file: {}",
                    path.display()
                )
                .into());
            }
        }
        Ok(())
    }
}

struct DevelopmentPaths {
    package_store: PathBuf,
    package_protected_state: PathBuf,
    content: PathBuf,
    runtime: PathBuf,
    data: PathBuf,
    build: PathBuf,
    evidence: PathBuf,
}

impl DevelopmentPaths {
    fn provision(root: &Path) -> io::Result<Self> {
        let package_store = root.join("package-store");
        let content = root.join("content");
        let runtime = root.join("runtime");
        let data = root.join("data");
        let build = root.join("build");
        let evidence = root.join("evidence");
        for directory in [
            package_store.join("staging"),
            package_store.join("generations"),
            package_store.join("activations"),
            content.clone(),
            runtime.clone(),
            data.clone(),
            build.clone(),
            evidence.clone(),
        ] {
            fs::create_dir_all(directory)?;
        }
        create_regular_file(&package_store.join(".vcg-package-store.lock"))?;
        Ok(Self {
            package_protected_state: root.join("package-protected-state.json"),
            package_store,
            content,
            runtime,
            data,
            build,
            evidence,
        })
    }
}

struct TrustMaterial {
    policy: TrustedUpdatePolicy,
    root_metadata: PathBuf,
    root_signatures: PathBuf,
    anchors: PathBuf,
    protected_state: PathBuf,
    root_store: PathBuf,
    catalog_key: SigningKey,
    release_key: SigningKey,
}

fn provision_trust(
    root: &Path,
    trusted_time: u64,
) -> Result<TrustMaterial, Box<dyn std::error::Error>> {
    fs::create_dir_all(root)?;
    let trust_root = root.join("trust");
    let private = trust_root.join("private");
    let root_store = trust_root.join("accepted-roots");
    fs::create_dir_all(&private)?;
    fs::create_dir_all(root_store.join("generations"))?;
    create_regular_file(&root_store.join(".vcg-update-root-store.lock"))?;
    let root_key = load_or_create_key(&private.join("root.ed25519"))?;
    let catalog_key = load_or_create_key(&private.join("catalog.ed25519"))?;
    let release_key = load_or_create_key(&private.join("release.ed25519"))?;
    let root_metadata = trust_root.join("root.json");
    let root_signatures = trust_root.join("root.signatures.json");
    let anchors_path = trust_root.join("anchors.json");
    if !root_metadata.exists() {
        let document = json!({
            "schemaVersion": 1,
            "generation": 1,
            "expiresUnixSeconds": trusted_time + 31_536_000,
            "rootThreshold": 1,
            "rootKeys": [{
                "keyId": ROOT_KEY_ID,
                "publicKey": hex(root_key.verifying_key().as_bytes()),
            }],
            "roles": [{
                "channel": CHANNEL,
                "artifact": "installed-catalog",
                "target": TARGET,
                "threshold": 1,
                "keys": [{
                    "keyId": CATALOG_KEY_ID,
                    "publicKey": hex(catalog_key.verifying_key().as_bytes()),
                }],
            }, {
                "channel": CHANNEL,
                "artifact": "package-release",
                "target": TARGET,
                "threshold": 1,
                "keys": [{
                    "keyId": RELEASE_KEY_ID,
                    "publicKey": hex(release_key.verifying_key().as_bytes()),
                }],
            }],
        });
        let root_bytes = serde_json::to_vec_pretty(&document)?;
        fs::write(&root_metadata, &root_bytes)?;
        fs::write(
            &root_signatures,
            signature_bundle(
                ROOT_KEY_ID,
                &root_key.sign(&root_signing_message(&root_bytes)).to_bytes(),
            )?,
        )?;
        fs::write(
            &anchors_path,
            serde_json::to_vec_pretty(&json!({
                "schemaVersion": 1,
                "threshold": 1,
                "anchors": [{
                    "keyId": ROOT_KEY_ID,
                    "publicKey": hex(root_key.verifying_key().as_bytes()),
                }],
            }))?,
        )?;
    }
    let root_bytes = fs::read(&root_metadata)?;
    let root_signature_bytes = fs::read(&root_signatures)?;
    let anchor_bytes = fs::read(&anchors_path)?;
    let anchors = RootTrustAnchorSet::from_json_bytes(&anchor_bytes)?;
    let protected_state_path = trust_root.join("protected-state.json");
    let protected = if protected_state_path.exists() {
        ProtectedUpdateRootState::from_json_bytes(&fs::read(&protected_state_path)?)?
    } else {
        ProtectedUpdateRootState::uninitialized()
    };
    let store = UpdateRootStore::open(UpdateRootStoreConfig {
        store_root: root_store.clone(),
    })?;
    let acceptance = store.bootstrap(
        &root_bytes,
        &root_signature_bytes,
        &anchors,
        &protected,
        trusted_time,
    )?;
    let committed = match acceptance {
        RootAcceptance::Active(state) | RootAcceptance::ProtectionCommitRequired(state) => state,
    };
    fs::write(&protected_state_path, serde_json::to_vec(&committed)?)?;
    let accepted_root = store.load_current(&anchors, &committed, trusted_time)?;
    let policy = TrustedUpdatePolicy::new(accepted_root, CHANNEL, trusted_time)?;
    Ok(TrustMaterial {
        policy,
        root_metadata,
        root_signatures,
        anchors: anchors_path,
        protected_state: protected_state_path,
        root_store,
        catalog_key,
        release_key,
    })
}

fn load_or_create_key(path: &Path) -> Result<SigningKey, Box<dyn std::error::Error>> {
    if path.exists() {
        let bytes = fs::read(path)?;
        let seed: [u8; 32] = bytes.try_into().map_err(|_| {
            format!(
                "development key must be exactly 32 bytes: {}",
                path.display()
            )
        })?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    let mut seed = [0_u8; 32];
    getrandom::fill(&mut seed)?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(&seed)?;
    file.sync_all()?;
    Ok(SigningKey::from_bytes(&seed))
}

fn load_or_initialize_package_state(
    path: &Path,
) -> Result<ProtectedPackageGenerationState, Box<dyn std::error::Error>> {
    if path.exists() {
        Ok(ProtectedPackageGenerationState::from_json_bytes(
            &fs::read(path)?,
        )?)
    } else {
        let state = ProtectedPackageGenerationState::initial(CHANNEL, TARGET)?;
        fs::write(path, state.to_json_bytes()?)?;
        Ok(state)
    }
}

fn extract_official_archives(
    options: &Options,
    paths: &DevelopmentPaths,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let extraction = paths.build.join("official-extraction-1");
    if extraction.exists() {
        return Err(format!(
            "refusing to replace existing extraction: {}",
            extraction.display()
        )
        .into());
    }
    fs::create_dir(&extraction)?;
    let system_root = env::var_os("SystemRoot").ok_or("SystemRoot is unavailable")?;
    let tar = PathBuf::from(system_root).join("System32").join("tar.exe");
    if !tar.is_file() {
        return Err(format!("Windows archive tool is unavailable: {}", tar.display()).into());
    }
    let status = Command::new(&tar)
        .args([OsString::from("-xf")])
        .arg(&options.frontend_archive)
        .arg("-C")
        .arg(&extraction)
        .status()?;
    if !status.success() {
        return Err(format!("official frontend archive extraction failed: {status}").into());
    }
    let status = Command::new(&tar)
        .args([OsString::from("-xf")])
        .arg(&options.cores_archive)
        .arg("-C")
        .arg(&extraction)
        .arg("RetroArch-Win64/cores/2048_libretro.dll")
        .status()?;
    if !status.success() {
        return Err(format!("official core archive extraction failed: {status}").into());
    }
    verify_exact_file(
        &extraction.join("RetroArch-Win64/retroarch.exe"),
        FRONTEND_SHA256,
        "RetroArch frontend",
    )?;
    verify_exact_file(
        &extraction.join("RetroArch-Win64/cores/2048_libretro.dll"),
        CORE_SHA256,
        "2048 libretro core",
    )?;
    Ok(extraction)
}

struct PreparedRelease {
    archive: PathBuf,
    descriptor: PathBuf,
    descriptor_signatures: PathBuf,
    catalog: PathBuf,
    catalog_signatures: PathBuf,
    manifest: PathBuf,
    frontend: PathBuf,
    core: PathBuf,
    base_config: PathBuf,
    auxiliary: Vec<(PathBuf, Option<String>)>,
}

/// Console-owned staging tree for one development release. Every path is
/// created by `stage_release_tree`, so later stages never invent a location.
struct StagedTree {
    source: PathBuf,
    install: PathBuf,
    package_dir: PathBuf,
    frontend: PathBuf,
    core: PathBuf,
    base_config: PathBuf,
    auxiliary: Vec<(PathBuf, Option<String>)>,
}

fn prepare_release_source(
    options: &Options,
    paths: &DevelopmentPaths,
    extraction: &Path,
    trust: &TrustMaterial,
    generation: u64,
) -> Result<PreparedRelease, Box<dyn std::error::Error>> {
    let tree = stage_release_tree(options, paths, extraction)?;
    let (manifest, frontend_hash, core_hash) = tree.write_package_manifest()?;
    let (catalog, catalog_signatures) =
        tree.write_signed_catalog(&manifest, &frontend_hash, &core_hash, trust, generation)?;
    let (archive, descriptor, descriptor_signatures) =
        tree.write_signed_descriptor(paths, &catalog, trust, generation)?;
    Ok(PreparedRelease {
        archive,
        descriptor,
        descriptor_signatures,
        catalog,
        catalog_signatures,
        manifest,
        frontend: tree.frontend,
        core: tree.core,
        base_config: tree.base_config,
        auxiliary: tree.auxiliary,
    })
}

/// Copies every upstream artifact into a fresh console-owned tree. Refuses to
/// reuse an existing source directory so a stale build cannot be republished.
fn stage_release_tree(
    options: &Options,
    paths: &DevelopmentPaths,
    extraction: &Path,
) -> Result<StagedTree, Box<dyn std::error::Error>> {
    let source = paths.build.join("release-source-1");
    if source.exists() {
        return Err(format!(
            "refusing to replace existing release source: {}",
            source.display()
        )
        .into());
    }
    let install = source.join("install");
    let frontend_dir = install.join("retroarch");
    let core_dir = install.join("cores");
    let package_dir = install.join("packages").join(PACKAGE_ID);
    fs::create_dir_all(&frontend_dir)?;
    fs::create_dir_all(&core_dir)?;
    fs::create_dir_all(&package_dir)?;
    let upstream = extraction.join("RetroArch-Win64");
    let mut auxiliary = Vec::new();
    for entry in fs::read_dir(&upstream)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let upstream_name = entry.file_name();
        let (package_name, runtime_name) = if upstream_name == "libstdc++-6.dll" {
            (
                OsString::from("libstdcxx-6.dll"),
                Some("libstdc++-6.dll".to_owned()),
            )
        } else {
            (upstream_name.clone(), None)
        };
        let destination = frontend_dir.join(package_name);
        fs::copy(entry.path(), &destination)?;
        if upstream_name != "retroarch.exe" {
            auxiliary.push((destination, runtime_name));
        }
    }
    auxiliary.sort_by(|left, right| left.0.cmp(&right.0));
    let frontend = frontend_dir.join("retroarch.exe");
    let core = core_dir.join("2048_libretro.dll");
    fs::copy(upstream.join("cores/2048_libretro.dll"), &core)?;
    let base_config = frontend_dir.join("vcg-base.cfg");
    fs::copy(&options.base_config, &base_config)?;
    let notices = package_dir.join("THIRD_PARTY_NOTICES.txt");
    fs::copy(&options.notices, &notices)?;
    auxiliary.push((notices, None));
    auxiliary.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(StagedTree {
        source,
        install,
        package_dir,
        frontend,
        core,
        base_config,
        auxiliary,
    })
}

impl StagedTree {
    /// Writes the installed-root game manifest and returns it with the exact
    /// frontend and core digests every later stage must reuse.
    fn write_package_manifest(
        &self,
    ) -> Result<(PathBuf, String, String), Box<dyn std::error::Error>> {
        let manifest = self.package_dir.join("vcg-game.json");
        let frontend_hash = digest_file(&self.frontend)?;
        let core_hash = digest_file(&self.core)?;
        let manifest_document = json!({
        "documentType": INSTALLED_MANIFEST_DOCUMENT_TYPE,
        "schemaVersion": 1,
        "id": PACKAGE_ID,
        "version": PACKAGE_VERSION,
        "title": "2048",
        "publisher": "Gabriele Cirulli / Libretro",
        "runtime": "libretro",
        "entrypoint": "libretro:2048",
        "architectures": ["x86_64"],
        "permissions": ["gamepad", "persistent-storage"],
        "inputProfiles": ["gamepad"],
        "minimumConsoleVersion": "0.1.0",
        "network": "offline",
        "allowedOrigins": [],
        "compatibilityStatus": "unverified",
        "launch": { "timeoutMs": 3000, "healthCheck": { "type": "process" } },
        "rights": {
            "distribution": "redistributable",
            "codeLicense": "GPL-3.0-only AND LicenseRef-Public-Domain",
            "contentLicense": "NONE",
            "reviewStatus": "unreviewed"
        },
        "libretro": {
            "frontend": {
                "id": "retroarch",
                "version": "1.22.2",
                "license": "GPL-3.0-only",
                "source": "https://github.com/libretro/RetroArch",
                "sha256": frontend_hash
            },
            "core": {
                "id": "2048",
                "version": "retroarch-1.22.2-stable-bundle",
                "license": "LicenseRef-Public-Domain",
                "source": "https://github.com/libretro/libretro-2048",
                "architectures": ["x86_64"],
                "supportsNoGame": true,
                "sha256": core_hash
            },
            "content": { "mode": "none" },
            "bios": [],
            "controllerProfile": "gamepad",
            "saveNamespace": "retro-2048"
        }
        });
        fs::write(&manifest, serde_json::to_vec_pretty(&manifest_document)?)?;
        Ok((manifest, frontend_hash, core_hash))
    }

    /// Writes the installed catalog and its detached catalog-role signature.
    fn write_signed_catalog(
        &self,
        manifest: &Path,
        frontend_hash: &str,
        core_hash: &str,
        trust: &TrustMaterial,
        generation: u64,
    ) -> Result<(PathBuf, PathBuf), Box<dyn std::error::Error>> {
        let install = &self.install;
        let auxiliary_documents = self
            .auxiliary
            .iter()
            .map(|(path, runtime_name)| {
                let mut document = json!({
                    "path": relative_slash(install, path)?,
                    "sha256": digest_file(path)?,
                });
                if let Some(runtime_name) = runtime_name {
                    document["runtimeName"] = json!(runtime_name);
                }
                Ok(document)
            })
            .collect::<Result<Vec<Value>, Box<dyn std::error::Error>>>()?;
        let catalog_document = json!({
            "schemaVersion": 1,
            "generation": generation,
            "target": TARGET,
            "packages": [{
                "id": PACKAGE_ID,
                "version": PACKAGE_VERSION,
                "qualification": "development",
                "runtime": "libretro",
                "manifest": {
                    "path": relative_slash(install, manifest)?,
                    "sha256": digest_file(manifest)?,
                },
                "libretro": {
                    "frontend": {
                        "path": relative_slash(install, &self.frontend)?,
                        "sha256": frontend_hash,
                    },
                    "core": {
                        "path": relative_slash(install, &self.core)?,
                        "sha256": core_hash,
                    },
                    "baseConfig": {
                        "path": relative_slash(install, &self.base_config)?,
                        "sha256": digest_file(&self.base_config)?,
                    },
                    "auxiliary": auxiliary_documents,
                    "content": { "mode": "none" },
                },
            }],
        });
        let catalog = self.source.join("installed-catalog.json");
        let catalog_bytes = serde_json::to_vec_pretty(&catalog_document)?;
        fs::write(&catalog, &catalog_bytes)?;
        let catalog_signatures = self.source.join("installed-catalog.sig");
        fs::write(
            &catalog_signatures,
            signature_bundle(
                CATALOG_KEY_ID,
                &trust
                    .catalog_key
                    .sign(&artifact_signing_message(
                        UpdateArtifactKind::InstalledCatalog,
                        &catalog_bytes,
                    ))
                    .to_bytes(),
            )?,
        )?;
        Ok((catalog, catalog_signatures))
    }

    /// Packs the staged tree into a deterministic archive and writes the
    /// release descriptor with its detached release-role signature.
    fn write_signed_descriptor(
        &self,
        paths: &DevelopmentPaths,
        catalog: &Path,
        trust: &TrustMaterial,
        generation: u64,
    ) -> Result<(PathBuf, PathBuf, PathBuf), Box<dyn std::error::Error>> {
        let archive = paths.build.join("retro-2048-development-1.tar");
        let (expanded_bytes, file_count) = create_deterministic_tar(&self.source, &archive)?;
        let descriptor_document = json!({
            "schemaVersion": 1,
            "generation": generation,
            "target": TARGET,
            "archive": {
                "format": "tar",
                "sha256": digest_file(&archive)?,
                "sizeBytes": fs::metadata(&archive)?.len(),
            },
            "expanded": { "sizeBytes": expanded_bytes, "fileCount": file_count },
            "catalog": {
                "sha256": digest_file(catalog)?,
                "sizeBytes": fs::metadata(catalog)?.len(),
            },
        });
        let descriptor = paths.build.join("retro-2048-development-1.release.json");
        let descriptor_bytes = serde_json::to_vec_pretty(&descriptor_document)?;
        fs::write(&descriptor, &descriptor_bytes)?;
        let descriptor_signatures = paths
            .build
            .join("retro-2048-development-1.release.signatures.json");
        fs::write(
            &descriptor_signatures,
            signature_bundle(
                RELEASE_KEY_ID,
                &trust
                    .release_key
                    .sign(&artifact_signing_message(
                        UpdateArtifactKind::PackageRelease,
                        &descriptor_bytes,
                    ))
                    .to_bytes(),
            )?,
        )?;
        Ok((archive, descriptor, descriptor_signatures))
    }
}

fn create_deterministic_tar(
    source: &Path,
    archive: &Path,
) -> Result<(u64, u64), Box<dyn std::error::Error>> {
    let mut files = Vec::new();
    collect_files(source, source, &mut files)?;
    files.sort_by(|left, right| left.0.cmp(&right.0));
    let archive_file = File::create(archive)?;
    let mut builder = Builder::new(archive_file);
    let mut expanded = 0_u64;
    for (relative, path) in &files {
        let bytes = fs::read(path)?;
        expanded = expanded
            .checked_add(u64::try_from(bytes.len())?)
            .ok_or("expanded package size overflow")?;
        let mut header = Header::new_gnu();
        header.set_entry_type(EntryType::Regular);
        header.set_mode(0o644);
        header.set_uid(0);
        header.set_gid(0);
        header.set_mtime(0);
        header.set_size(u64::try_from(bytes.len())?);
        header.set_cksum();
        builder.append_data(&mut header, relative, bytes.as_slice())?;
    }
    builder.finish()?;
    let archive_file = builder.into_inner()?;
    archive_file.sync_all()?;
    Ok((expanded, u64::try_from(files.len())?))
}

fn collect_files(
    root: &Path,
    directory: &Path,
    output: &mut Vec<(String, PathBuf)>,
) -> Result<(), Box<dyn std::error::Error>> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Err(format!(
                "package source contains a symlink: {}",
                entry.path().display()
            )
            .into());
        }
        if file_type.is_dir() {
            collect_files(root, &entry.path(), output)?;
        } else if file_type.is_file() {
            output.push((relative_slash(root, &entry.path())?, entry.path()));
        } else {
            return Err(format!(
                "package source contains a special file: {}",
                entry.path().display()
            )
            .into());
        }
    }
    Ok(())
}

fn signature_bundle(key_id: &str, signature: &[u8; 64]) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "signatures": [{ "keyId": key_id, "signature": hex(signature) }],
    }))
}

fn verify_exact_file(
    path: &Path,
    expected: &str,
    kind: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let actual = digest_file(path)?;
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "{kind} SHA-256 mismatch at {}: expected {expected}, got {actual}",
            path.display()
        )
        .into())
    }
}

fn digest_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    // Heap-allocated: a 64 KiB stack buffer trips clippy's large-stack-arrays
    // bound and risks the smaller default stacks on the target appliances.
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(hex(&digest.finalize()))
}

fn relative_slash(root: &Path, path: &Path) -> Result<String, Box<dyn std::error::Error>> {
    Ok(path
        .strip_prefix(root)?
        .to_string_lossy()
        .replace('\\', "/"))
}

fn create_regular_file(path: &Path) -> io::Result<()> {
    if path.exists() {
        if path.is_file() {
            return Ok(());
        }
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("required regular file is not a file: {}", path.display()),
        ));
    }
    File::create(path)?.sync_all()
}

fn unix_time() -> Result<u64, std::time::SystemTimeError> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs())
}

fn hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        write!(output, "{byte:02x}").expect("formatting to String cannot fail");
    }
    output
}

fn write_evidence(
    options: &Options,
    paths: &DevelopmentPaths,
    release: &PreparedRelease,
    generation: u64,
    trusted_time: u64,
    trust: &TrustMaterial,
) -> Result<(), Box<dyn std::error::Error>> {
    let auxiliary = release
        .auxiliary
        .iter()
        .map(|(path, runtime_name)| {
            Ok(json!({
                "path": path.file_name().and_then(|name| name.to_str()).unwrap_or("unknown"),
                "runtimeName": runtime_name,
                "bytes": fs::metadata(path)?.len(),
                "sha256": digest_file(path)?,
            }))
        })
        .collect::<Result<Vec<Value>, io::Error>>()?;
    let evidence = json!({
        "schemaVersion": 1,
        "scope": "machine-local-windows-x86_64-development-only",
        "generation": generation,
        "channel": CHANNEL,
        "target": TARGET,
        "trustedUnixSeconds": trusted_time,
        "package": {
            "id": PACKAGE_ID,
            "version": PACKAGE_VERSION,
            "qualification": "development",
            "compatibilityStatus": "unverified",
        },
        "upstream": {
            "retroArchVersion": "1.22.2",
            "retroArchGit": "69a4f0e",
            "frontendArchive": {
                "source": "https://buildbot.libretro.com/stable/1.22.2/windows/x86_64/RetroArch.7z",
                "path": options.frontend_archive,
                "bytes": fs::metadata(&options.frontend_archive)?.len(),
                "sha256": digest_file(&options.frontend_archive)?,
            },
            "coresArchive": {
                "source": "https://buildbot.libretro.com/stable/1.22.2/windows/x86_64/RetroArch_cores.7z",
                "path": options.cores_archive,
                "bytes": fs::metadata(&options.cores_archive)?.len(),
                "sha256": digest_file(&options.cores_archive)?,
            },
            "frontend": { "bytes": fs::metadata(&release.frontend)?.len(), "sha256": digest_file(&release.frontend)? },
            "core": { "bytes": fs::metadata(&release.core)?.len(), "sha256": digest_file(&release.core)? },
            "baseConfig": { "bytes": fs::metadata(&release.base_config)?.len(), "sha256": digest_file(&release.base_config)? },
            "auxiliary": auxiliary,
        },
        "signed": {
            "archive": { "path": release.archive, "bytes": fs::metadata(&release.archive)?.len(), "sha256": digest_file(&release.archive)? },
            "releaseDescriptor": { "path": release.descriptor, "sha256": digest_file(&release.descriptor)? },
            "releaseSignatures": { "path": release.descriptor_signatures, "sha256": digest_file(&release.descriptor_signatures)? },
            "catalog": { "path": release.catalog, "sha256": digest_file(&release.catalog)? },
            "catalogSignatures": { "path": release.catalog_signatures, "sha256": digest_file(&release.catalog_signatures)? },
            "manifest": { "path": release.manifest, "sha256": digest_file(&release.manifest)? },
        },
        "trust": {
            "rootMetadata": trust.root_metadata,
            "rootSignatures": trust.root_signatures,
            "anchors": trust.anchors,
            "protectedState": trust.protected_state,
            "rootStore": trust.root_store,
            "privateKeysRecorded": false,
        },
        "installed": {
            "packageStore": paths.package_store,
            "packageProtectedState": paths.package_protected_state,
            "runtimeRoot": paths.runtime,
            "dataRoot": paths.data,
            "contentRoot": paths.content,
        },
        "claimBoundary": "This proves one signed, hash-bound, health-gated machine-local Windows x86_64 development generation. It is not a production release, legal approval, redistribution authority, ARM64/Linux qualification, controller qualification, compositor readiness proof, or broad compatibility result."
    });
    fs::write(
        paths.evidence.join("retro-2048-development-install.json"),
        serde_json::to_vec_pretty(&evidence)?,
    )?;
    Ok(())
}

fn print_launcher_arguments(root: &Path, trusted_time: u64) {
    println!(
        "development-package:launcher package-store={}",
        root.join("package-store").display()
    );
    println!(
        "development-package:launcher package-protected-state={}",
        root.join("package-protected-state.json").display()
    );
    println!(
        "development-package:launcher update-root-store={}",
        root.join("trust/accepted-roots").display()
    );
    println!(
        "development-package:launcher update-root-anchors={}",
        root.join("trust/anchors.json").display()
    );
    println!(
        "development-package:launcher update-root-protected-state={}",
        root.join("trust/protected-state.json").display()
    );
    println!(
        "development-package:launcher update-channel={CHANNEL} trusted-unix-seconds={trusted_time}"
    );
}
