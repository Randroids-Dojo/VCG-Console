//! Provisions update-root trust material, one signed loose installed-package
//! catalog, and optionally one signed retro system policy for an
//! operator-named target.
//!
//! Every artifact is supplied by the operator and read from disk; this tool
//! downloads nothing and vendors nothing.

use std::collections::BTreeMap;
use std::env;
use std::error::Error;
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

use ed25519_dalek::{Signer, SigningKey};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use vcg_host::installed_catalog::{CatalogRoots, TrustedPackageCatalog};
use vcg_host::retro_import::RetroSignedSystemPolicy;
use vcg_host::update_root_store::{
    ProtectedUpdateRootState, RootAcceptance, UpdateRootStore, UpdateRootStoreConfig,
    UpdateRootStoreError,
};
use vcg_host::update_trust::{
    DetachedUpdateSignatures, MAX_RETRO_SYSTEM_POLICY_BYTES, RootTrustAnchorSet,
    TrustedUpdatePolicy, UpdateArtifactKind, artifact_signing_message, root_signing_message,
};

const ROOT_KEY_ID: &str = "vcg-retro-root-one";
const CATALOG_KEY_ID: &str = "vcg-retro-catalog-one";
const POLICY_KEY_ID: &str = "vcg-retro-policy-one";
const CATALOG_ARTIFACT: &str = "installed-catalog";
const POLICY_ARTIFACT: &str = "retro-system-policy";
const CATALOG_FILE: &str = "installed-catalog.json";
const CATALOG_SIGNATURE_FILE: &str = "installed-catalog.sig";
const INCOMING_CATALOG_FILE: &str = "installed-catalog.json.incoming";
const POLICY_FILE: &str = "retro-system-policy.json";
const POLICY_SIGNATURE_FILE: &str = "retro-system-policy.sig";
const MAX_PACKAGE_INPUT_BYTES: usize = 256 * 1_024;
const USAGE: &str = concat!(
    "usage:\n  vcg-retro-provision --state-root <path> --install-root <path> ",
    "[--content-root <path>] --runtime-root <path> --data-root <path> ",
    "--channel <channel> --target <arch-os> --packages <path> ",
    "--expires-unix-seconds <seconds> [--trusted-unix-seconds <seconds>] ",
    "[--system-policy <path>]\n",
    "  --packages file: {\"schemaVersion\":1,\"packages\":[{\"id\":<id>,",
    "\"version\":<version>,\"qualification\":\"qualified\"|\"development\",",
    "\"manifest\":<install-relative path>,\"frontend\":<install-relative path>,",
    "\"core\":<install-relative path>,\"baseConfig\":<install-relative path>,",
    "\"content\":{\"mode\":\"none\"}|{\"mode\":\"managed\",",
    "\"path\":<content-relative path>}|{\"mode\":\"library\",",
    "\"systemId\":<library system>,\"coreId\":<library core>}}]}\n",
    "  --system-policy file: {\"schemaVersion\":1,\"policyId\":<id>,",
    "\"policyRevision\":<number>,\"target\":<arch-os>,",
    "\"maxLibraryEntries\":<count>,\"maxLibraryBytes\":<bytes>,",
    "\"systems\":[{\"systemId\":<id>,\"extensions\":[<.extension>],",
    "\"coreId\":<id>,\"controllerProfile\":<id>,",
    "\"maxContentBytes\":<bytes>}]}"
);
const OPTION_NAMES: [&str; 11] = [
    "--state-root",
    "--install-root",
    "--content-root",
    "--runtime-root",
    "--data-root",
    "--channel",
    "--target",
    "--packages",
    "--expires-unix-seconds",
    "--trusted-unix-seconds",
    "--system-policy",
];

fn main() -> ExitCode {
    let arguments: Vec<OsString> = env::args_os().skip(1).collect();
    match run(&arguments) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vcg-retro-provision: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(arguments: &[OsString]) -> Result<(), Box<dyn Error>> {
    match arguments.first().and_then(|argument| argument.to_str()) {
        None => return Err(USAGE.into()),
        Some("help" | "--help" | "-h") => {
            println!("{USAGE}");
            return Ok(());
        }
        Some(_) => {}
    }
    let options = Options::parse(arguments)?;
    options.validate()?;
    let paths = StatePaths::provision(&options.state_root)?;
    let inputs = read_package_inputs(&options.packages)?;
    let packages = package_documents(&options, &inputs)?;
    let policy_document = read_policy_document(&options)?;
    let trust = provision_trust(&options, &paths)?;
    let publication = publish_catalog(&options, &paths, &packages, &trust)?;
    let policy = publish_system_policy(&options, &paths, policy_document.as_deref(), &trust)?;
    report(&options, &paths, &trust, &publication, policy.as_ref());
    Ok(())
}

/// Operator-supplied provisioning inputs.
#[derive(Debug)]
struct Options {
    state_root: PathBuf,
    install_root: PathBuf,
    content_root: Option<PathBuf>,
    runtime_root: PathBuf,
    data_root: PathBuf,
    channel: String,
    target: String,
    packages: PathBuf,
    expires_unix_seconds: u64,
    trusted_unix_seconds: u64,
    /// Absent when this run publishes only a catalog.
    system_policy: Option<PathBuf>,
}

impl Options {
    fn parse(arguments: &[OsString]) -> Result<Self, Box<dyn Error>> {
        let mut values: BTreeMap<String, OsString> = BTreeMap::new();
        let mut cursor = 0;
        while cursor < arguments.len() {
            let option = arguments[cursor]
                .to_str()
                .ok_or("options must be valid UTF-8")?;
            if !OPTION_NAMES.contains(&option) {
                return Err(format!("unknown option {option}").into());
            }
            cursor += 1;
            let value = arguments
                .get(cursor)
                .ok_or_else(|| format!("{option} requires a value"))?;
            if values.insert(option.to_owned(), value.clone()).is_some() {
                return Err(format!("{option} may be supplied only once").into());
            }
            cursor += 1;
        }
        let trusted_unix_seconds = match values.remove("--trusted-unix-seconds") {
            Some(value) => number(&value, "--trusted-unix-seconds")?,
            None => unix_time()?,
        };
        Ok(Self {
            state_root: PathBuf::from(required(&mut values, "--state-root")?),
            install_root: PathBuf::from(required(&mut values, "--install-root")?),
            content_root: values.remove("--content-root").map(PathBuf::from),
            runtime_root: PathBuf::from(required(&mut values, "--runtime-root")?),
            data_root: PathBuf::from(required(&mut values, "--data-root")?),
            channel: text(&required(&mut values, "--channel")?, "--channel")?,
            target: text(&required(&mut values, "--target")?, "--target")?,
            packages: PathBuf::from(required(&mut values, "--packages")?),
            expires_unix_seconds: number(
                &required(&mut values, "--expires-unix-seconds")?,
                "--expires-unix-seconds",
            )?,
            trusted_unix_seconds,
            system_policy: values.remove("--system-policy").map(PathBuf::from),
        })
    }

    fn validate(&self) -> Result<(), Box<dyn Error>> {
        require_identifier("--channel", &self.channel)?;
        require_identifier("--target", &self.target)?;
        for (option, path) in [
            ("--state-root", &self.state_root),
            ("--runtime-root", &self.runtime_root),
            ("--data-root", &self.data_root),
        ] {
            require_owned_root(option, path)?;
        }
        for (option, path) in [
            ("--install-root", Some(&self.install_root)),
            ("--content-root", self.content_root.as_ref()),
        ] {
            let Some(path) = path else { continue };
            require_owned_root(option, path)?;
            if !path.is_dir() {
                return Err(
                    format!("{option} must be an existing directory: {}", path.display()).into(),
                );
            }
        }
        for (option, path) in [
            ("--packages", Some(&self.packages)),
            ("--system-policy", self.system_policy.as_ref()),
        ] {
            let Some(path) = path else { continue };
            if !path.is_absolute() || !path.is_file() {
                return Err(format!(
                    "{option} must be an absolute regular file: {}",
                    path.display()
                )
                .into());
            }
        }
        if self.expires_unix_seconds <= self.trusted_unix_seconds {
            return Err(format!(
                "--expires-unix-seconds {} must be later than the trusted time {}",
                self.expires_unix_seconds, self.trusted_unix_seconds
            )
            .into());
        }
        Ok(())
    }

    fn catalog_roots(&self) -> CatalogRoots {
        CatalogRoots {
            install_root: self.install_root.clone(),
            content_root: self.content_root.clone(),
            runtime_root: self.runtime_root.clone(),
            data_root: self.data_root.clone(),
        }
    }
}

fn required(values: &mut BTreeMap<String, OsString>, name: &str) -> Result<OsString, String> {
    values
        .remove(name)
        .ok_or_else(|| format!("missing required option {name}"))
}

fn text(value: &OsString, name: &str) -> Result<String, String> {
    value
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("{name} must be valid UTF-8"))
}

fn number(value: &OsString, name: &str) -> Result<u64, String> {
    text(value, name)?
        .parse::<u64>()
        .map_err(|error| format!("{name} must be a whole number of seconds: {error}"))
}

/// Console-owned files this tool creates beneath the state root.
struct StatePaths {
    private: PathBuf,
    store: PathBuf,
    anchors: PathBuf,
    root_metadata: PathBuf,
    root_signatures: PathBuf,
    protected_state: PathBuf,
    catalog: PathBuf,
    catalog_signature: PathBuf,
    incoming_catalog: PathBuf,
    policy: PathBuf,
    policy_signature: PathBuf,
}

impl StatePaths {
    fn provision(state_root: &Path) -> io::Result<Self> {
        let trust = state_root.join("trust");
        let private = trust.join("private");
        let store = trust.join("accepted-roots");
        fs::create_dir_all(&private)?;
        fs::create_dir_all(store.join("generations"))?;
        create_regular_file(&store.join(".vcg-update-root-store.lock"))?;
        Ok(Self {
            private,
            anchors: trust.join("anchors.json"),
            root_metadata: trust.join("root.json"),
            root_signatures: trust.join("root.signatures.json"),
            protected_state: trust.join("protected-state.json"),
            store,
            catalog: state_root.join(CATALOG_FILE),
            catalog_signature: state_root.join(CATALOG_SIGNATURE_FILE),
            incoming_catalog: state_root.join(INCOMING_CATALOG_FILE),
            policy: state_root.join(POLICY_FILE),
            policy_signature: state_root.join(POLICY_SIGNATURE_FILE),
        })
    }
}

/// Accepted update-root authority plus the keys that sign this target's
/// catalog and, when the operator supplied one, its retro system policy.
struct TrustMaterial {
    policy: TrustedUpdatePolicy,
    catalog_key: SigningKey,
    /// Absent when this run publishes only a catalog.
    policy_key: Option<SigningKey>,
    root_generation: u64,
    protection: &'static str,
}

fn provision_trust(options: &Options, paths: &StatePaths) -> Result<TrustMaterial, Box<dyn Error>> {
    let root_key = load_or_create_key(&paths.private.join("root.ed25519"))?;
    let catalog_key = load_or_create_key(&paths.private.join("catalog.ed25519"))?;
    let policy_key = if options.system_policy.is_some() {
        Some(load_or_create_key(&paths.private.join("policy.ed25519"))?)
    } else {
        None
    };
    let catalog_public_key = hex(catalog_key.verifying_key().as_bytes());
    let policy_public_key = policy_key
        .as_ref()
        .map(|key| hex(key.verifying_key().as_bytes()));
    if paths.root_metadata.exists() {
        if let Some(public_key) = &policy_public_key {
            delegate_policy_role(options, paths, &root_key, public_key)?;
        }
    } else {
        write_root(
            options,
            paths,
            &root_key,
            &catalog_public_key,
            policy_public_key.as_deref(),
        )?;
    }
    let root_bytes = fs::read(&paths.root_metadata)?;
    require_role(
        &root_bytes,
        options,
        CATALOG_ARTIFACT,
        &catalog_public_key,
        &paths.root_metadata,
    )?;
    if let Some(public_key) = &policy_public_key {
        require_role(
            &root_bytes,
            options,
            POLICY_ARTIFACT,
            public_key,
            &paths.root_metadata,
        )?;
    }
    let (policy, root_generation, protection) = accept_root(options, paths, &root_bytes)?;
    Ok(TrustMaterial {
        policy,
        catalog_key,
        policy_key,
        root_generation,
        protection,
    })
}

/// Writes the first root generation, its signature, and the anchors that pin
/// it. The retro system policy role is delegated only when the operator asked
/// this run to sign a policy.
fn write_root(
    options: &Options,
    paths: &StatePaths,
    root_key: &SigningKey,
    catalog_public_key: &str,
    policy_public_key: Option<&str>,
) -> Result<(), Box<dyn Error>> {
    let mut roles = vec![role_document(
        options,
        CATALOG_ARTIFACT,
        CATALOG_KEY_ID,
        catalog_public_key,
    )];
    if let Some(public_key) = policy_public_key {
        roles.push(role_document(
            options,
            POLICY_ARTIFACT,
            POLICY_KEY_ID,
            public_key,
        ));
    }
    let root_public_key = hex(root_key.verifying_key().as_bytes());
    let root_bytes = serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "generation": 1,
        "expiresUnixSeconds": options.expires_unix_seconds,
        "rootThreshold": 1,
        "rootKeys": [{ "keyId": ROOT_KEY_ID, "publicKey": root_public_key }],
        "roles": roles,
    }))?;
    fs::write(&paths.root_metadata, &root_bytes)?;
    fs::write(&paths.root_signatures, sign_root(root_key, &root_bytes)?)?;
    fs::write(
        &paths.anchors,
        serde_json::to_vec_pretty(&json!({
            "schemaVersion": 1,
            "threshold": 1,
            "anchors": [{ "keyId": ROOT_KEY_ID, "publicKey": root_public_key }],
        }))?,
    )?;
    Ok(())
}

/// Delegates the retro system policy role in an already published root.
///
/// The root document is what the role lives in, so gaining the role changes
/// those bytes: the candidate advances one generation, is signed again by the
/// same root key, and is accepted as a rotation whose protected state the run
/// commits. A root that already carries the role is left byte for byte as it
/// is, which keeps repeated runs on one generation.
fn delegate_policy_role(
    options: &Options,
    paths: &StatePaths,
    root_key: &SigningKey,
    policy_public_key: &str,
) -> Result<(), Box<dyn Error>> {
    let location = paths.root_metadata.display();
    let mut document: Value =
        serde_json::from_slice(&fs::read(&paths.root_metadata)?).map_err(|error| {
            format!("update root metadata at {location} is not valid JSON: {error}")
        })?;
    if find_role(&document, options, POLICY_ARTIFACT).is_some() {
        return Ok(());
    }
    let generation = document
        .get("generation")
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("update root metadata at {location} has no generation"))?
        .checked_add(1)
        .ok_or("update root generation would overflow")?;
    let role = role_document(options, POLICY_ARTIFACT, POLICY_KEY_ID, policy_public_key);
    let object = document
        .as_object_mut()
        .ok_or_else(|| format!("update root metadata at {location} is not a JSON object"))?;
    object.insert("generation".to_owned(), json!(generation));
    object.insert(
        "expiresUnixSeconds".to_owned(),
        json!(options.expires_unix_seconds),
    );
    object
        .get_mut("roles")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("update root metadata at {location} has no roles"))?
        .push(role);
    let candidate = serde_json::to_vec_pretty(&document)?;
    fs::write(&paths.root_metadata, &candidate)?;
    fs::write(&paths.root_signatures, sign_root(root_key, &candidate)?)?;
    Ok(())
}

fn role_document(options: &Options, artifact: &str, key_id: &str, public_key: &str) -> Value {
    json!({
        "channel": options.channel,
        "artifact": artifact,
        "target": options.target,
        "threshold": 1,
        "keys": [{ "keyId": key_id, "publicKey": public_key }],
    })
}

fn sign_root(root_key: &SigningKey, root_bytes: &[u8]) -> Result<Vec<u8>, serde_json::Error> {
    signature_bundle(
        ROOT_KEY_ID,
        &root_key.sign(&root_signing_message(root_bytes)).to_bytes(),
    )
}

/// Runs the two-phase bootstrap: publish the signed root, then commit the exact
/// protected state the launcher requires before the root authorizes anything.
///
/// A root the store already holds under different bytes is offered as the exact
/// next generation instead, which is how a state root provisioned before this
/// tool signed policies gains the retro system policy role. The store verifies
/// that candidate against the current root keys and refuses anything else.
fn accept_root(
    options: &Options,
    paths: &StatePaths,
    root_bytes: &[u8],
) -> Result<(TrustedUpdatePolicy, u64, &'static str), Box<dyn Error>> {
    let anchors = RootTrustAnchorSet::from_json_bytes(&fs::read(&paths.anchors)?)?;
    let protected = if paths.protected_state.exists() {
        ProtectedUpdateRootState::from_json_bytes(&fs::read(&paths.protected_state)?)?
    } else {
        ProtectedUpdateRootState::uninitialized()
    };
    let store = UpdateRootStore::open(UpdateRootStoreConfig {
        store_root: paths.store.clone(),
    })?;
    let signatures = fs::read(&paths.root_signatures)?;
    let acceptance = match store.bootstrap(
        root_bytes,
        &signatures,
        &anchors,
        &protected,
        options.trusted_unix_seconds,
    ) {
        Err(UpdateRootStoreError::AlreadyBootstrapped) => store.rotate(
            root_bytes,
            &signatures,
            &anchors,
            &protected,
            options.trusted_unix_seconds,
        )?,
        result => result?,
    };
    let (committed, protection) = match acceptance {
        RootAcceptance::Active(state) => (state, "active"),
        RootAcceptance::ProtectionCommitRequired(state) => (state, "committed"),
    };
    fs::write(&paths.protected_state, serde_json::to_vec(&committed)?)?;
    let accepted_root = store.load_current(&anchors, &committed, options.trusted_unix_seconds)?;
    let generation = accepted_root.generation();
    let policy = TrustedUpdatePolicy::new(
        accepted_root,
        options.channel.clone(),
        options.trusted_unix_seconds,
    )?;
    Ok((policy, generation, protection))
}

fn find_role<'a>(document: &'a Value, options: &Options, artifact: &str) -> Option<&'a Value> {
    document
        .get("roles")
        .and_then(Value::as_array)?
        .iter()
        .find(|role| {
            role.get("channel").and_then(Value::as_str) == Some(options.channel.as_str())
                && role.get("artifact").and_then(Value::as_str) == Some(artifact)
                && role.get("target").and_then(Value::as_str) == Some(options.target.as_str())
        })
}

fn require_role(
    root_bytes: &[u8],
    options: &Options,
    artifact: &str,
    public_key: &str,
    root_metadata: &Path,
) -> Result<(), Box<dyn Error>> {
    let location = root_metadata.display();
    let document: Value = serde_json::from_slice(root_bytes).map_err(|error| {
        format!("update root metadata at {location} is not valid JSON: {error}")
    })?;
    if document.get("roles").and_then(Value::as_array).is_none() {
        return Err(format!("update root metadata at {location} has no roles").into());
    }
    let role = find_role(&document, options, artifact).ok_or_else(|| {
        format!(
            "update root metadata at {location} has no {artifact} role for channel {} and target {}",
            options.channel, options.target
        )
    })?;
    let delegated = role
        .get("keys")
        .and_then(Value::as_array)
        .is_some_and(|keys| {
            keys.iter()
                .any(|key| key.get("publicKey").and_then(Value::as_str) == Some(public_key))
        });
    if !delegated {
        return Err(format!(
            "update root metadata at {location} does not delegate its {artifact} role to the stored signing key"
        )
        .into());
    }
    Ok(())
}

fn load_or_create_key(path: &Path) -> Result<SigningKey, Box<dyn Error>> {
    if path.exists() {
        let bytes = fs::read(path)?;
        let seed: [u8; 32] = bytes
            .try_into()
            .map_err(|_| format!("signing key must be exactly 32 bytes: {}", path.display()))?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    let mut seed = [0_u8; 32];
    getrandom::fill(&mut seed)?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(&seed)?;
    file.sync_all()?;
    Ok(SigningKey::from_bytes(&seed))
}

/// Operator-declared installed packages.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageInputDocument {
    schema_version: u32,
    packages: Vec<PackageInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageInput {
    id: String,
    version: String,
    #[serde(default)]
    qualification: InputQualification,
    manifest: String,
    frontend: String,
    core: String,
    base_config: String,
    content: ContentInput,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum InputQualification {
    #[default]
    Qualified,
    Development,
}

impl InputQualification {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Qualified => "qualified",
            Self::Development => "development",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "kebab-case", deny_unknown_fields)]
enum ContentInput {
    None,
    Managed {
        path: String,
    },
    /// Names which library system and core the package may run, never a file.
    /// The host selects one entry per launch from the library it published.
    Library {
        #[serde(rename = "systemId")]
        system_id: String,
        #[serde(rename = "coreId")]
        core_id: String,
    },
}

fn read_bounded(path: &Path, maximum_bytes: usize, kind: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    let file = File::open(path)?;
    let mut bytes = Vec::new();
    file.take(u64::try_from(maximum_bytes)? + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum_bytes {
        return Err(format!(
            "{kind} exceeds the {maximum_bytes}-byte limit: {}",
            path.display()
        )
        .into());
    }
    Ok(bytes)
}

fn read_package_inputs(path: &Path) -> Result<Vec<PackageInput>, Box<dyn Error>> {
    let bytes = read_bounded(path, MAX_PACKAGE_INPUT_BYTES, "package input")?;
    let document: PackageInputDocument = serde_json::from_slice(&bytes)
        .map_err(|error| format!("package input at {} is invalid: {error}", path.display()))?;
    if document.schema_version != 1 {
        return Err(format!(
            "package input schema {} is not supported",
            document.schema_version
        )
        .into());
    }
    if document.packages.is_empty() {
        return Err(format!("package input at {} declares no packages", path.display()).into());
    }
    Ok(document.packages)
}

/// Digests every declared artifact and returns the exact catalog package
/// records. Any missing or unsafe path fails before trust material is used.
fn package_documents(
    options: &Options,
    inputs: &[PackageInput],
) -> Result<Vec<Value>, Box<dyn Error>> {
    let mut packages = Vec::with_capacity(inputs.len());
    for input in inputs {
        if input.qualification == InputQualification::Development
            && options.channel != "development"
        {
            return Err(format!(
                "package {} is declared development but --channel is {}",
                input.id, options.channel
            )
            .into());
        }
        let install = &options.install_root;
        packages.push(json!({
            "id": input.id,
            "version": input.version,
            "qualification": input.qualification.as_str(),
            "runtime": "libretro",
            "manifest": {
                "path": input.manifest,
                "sha256": digest_managed("manifest", &input.id, install, &input.manifest)?,
            },
            "libretro": {
                "frontend": {
                    "path": input.frontend,
                    "sha256": digest_managed("frontend", &input.id, install, &input.frontend)?,
                },
                "core": {
                    "path": input.core,
                    "sha256": digest_managed("core", &input.id, install, &input.core)?,
                },
                "baseConfig": {
                    "path": input.base_config,
                    "sha256": digest_managed(
                        "base configuration",
                        &input.id,
                        install,
                        &input.base_config,
                    )?,
                },
                "content": content_document(options, input)?,
            },
        }));
    }
    Ok(packages)
}

fn content_document(options: &Options, input: &PackageInput) -> Result<Value, Box<dyn Error>> {
    match &input.content {
        ContentInput::None => Ok(json!({ "mode": "none" })),
        ContentInput::Managed { path } => {
            let root = options.content_root.as_ref().ok_or_else(|| {
                format!(
                    "package {} declares managed content and requires --content-root",
                    input.id
                )
            })?;
            Ok(json!({
                "mode": "managed",
                "path": path,
                "sha256": digest_managed("content", &input.id, root, path)?,
            }))
        }
        ContentInput::Library { system_id, core_id } => Ok(json!({
            "mode": "library",
            "systemId": system_id,
            "coreId": core_id,
        })),
    }
}

fn digest_managed(
    kind: &str,
    package_id: &str,
    root: &Path,
    relative: &str,
) -> Result<String, Box<dyn Error>> {
    require_relative(kind, package_id, relative)?;
    let path = root.join(relative);
    if !path.is_file() {
        return Err(format!(
            "{kind} for package {package_id} is not a regular file: {}",
            path.display()
        )
        .into());
    }
    let digest = digest_file(&path).map_err(|error| {
        format!(
            "{kind} for package {package_id} could not be read at {}: {error}",
            path.display()
        )
    })?;
    Ok(digest)
}

/// One published catalog generation and the verified catalog it resolves to.
struct Publication {
    generation: u64,
    republished: bool,
    catalog: TrustedPackageCatalog,
}

/// Signs the catalog, verifies it exactly as the launcher will, and only then
/// publishes it. A candidate that fails verification never replaces the
/// catalog or the signature already in the state root.
fn publish_catalog(
    options: &Options,
    paths: &StatePaths,
    packages: &[Value],
    trust: &TrustMaterial,
) -> Result<Publication, Box<dyn Error>> {
    let (generation, bytes, republished) = match existing_catalog(&paths.catalog)? {
        Some(published) => {
            if catalog_bytes(options, packages, published.generation)? == published.bytes {
                (published.generation, published.bytes, false)
            } else {
                let next = published
                    .generation
                    .checked_add(1)
                    .ok_or("catalog generation would overflow")?;
                (next, catalog_bytes(options, packages, next)?, true)
            }
        }
        None => (1, catalog_bytes(options, packages, 1)?, true),
    };
    let signature = signature_bundle(
        CATALOG_KEY_ID,
        &trust
            .catalog_key
            .sign(&artifact_signing_message(
                UpdateArtifactKind::InstalledCatalog,
                &bytes,
            ))
            .to_bytes(),
    )?;
    let candidate = if republished {
        fs::write(&paths.incoming_catalog, &bytes)?;
        &paths.incoming_catalog
    } else {
        &paths.catalog
    };
    let catalog = match verify_published_catalog(options, candidate, &signature, &trust.policy) {
        Ok(catalog) => catalog,
        Err(error) => {
            if republished {
                fs::remove_file(&paths.incoming_catalog)?;
            }
            return Err(error);
        }
    };
    if republished {
        fs::rename(&paths.incoming_catalog, &paths.catalog)?;
    }
    fs::write(&paths.catalog_signature, &signature)?;
    Ok(Publication {
        generation,
        republished,
        catalog,
    })
}

/// The catalog generation already published in the state root.
struct PublishedCatalog {
    generation: u64,
    bytes: Vec<u8>,
}

fn existing_catalog(path: &Path) -> Result<Option<PublishedCatalog>, Box<dyn Error>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path)?;
    let document: Value = serde_json::from_slice(&bytes).map_err(|error| {
        format!(
            "installed catalog at {} is not valid JSON: {error}",
            path.display()
        )
    })?;
    let generation = document
        .get("generation")
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("installed catalog at {} has no generation", path.display()))?;
    Ok(Some(PublishedCatalog { generation, bytes }))
}

fn catalog_bytes(
    options: &Options,
    packages: &[Value],
    generation: u64,
) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "generation": generation,
        "target": options.target,
        "packages": packages,
    }))
}

/// Loads the published catalog exactly as the launcher does, then verifies every
/// referenced artifact digest.
fn verify_published_catalog(
    options: &Options,
    catalog: &Path,
    signature: &[u8],
    policy: &TrustedUpdatePolicy,
) -> Result<TrustedPackageCatalog, Box<dyn Error>> {
    let signatures = DetachedUpdateSignatures::from_json_bytes(signature)?;
    let catalog = TrustedPackageCatalog::load_with_update_role(
        catalog,
        &signatures,
        policy,
        &options.target,
        options.catalog_roots(),
    )?;
    catalog.verify_all_artifacts()?;
    Ok(catalog)
}

/// Reads the operator's retro system policy and binds it to this target before
/// any trust material or published artifact changes.
fn read_policy_document(options: &Options) -> Result<Option<Vec<u8>>, Box<dyn Error>> {
    let Some(path) = &options.system_policy else {
        return Ok(None);
    };
    let bytes = read_bounded(path, MAX_RETRO_SYSTEM_POLICY_BYTES, "retro system policy")?;
    let document: Value = serde_json::from_slice(&bytes).map_err(|error| {
        format!(
            "retro system policy at {} is not valid JSON: {error}",
            path.display()
        )
    })?;
    let declared = document
        .get("target")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            format!(
                "retro system policy at {} declares no target",
                path.display()
            )
        })?;
    if declared != options.target {
        return Err(format!(
            "retro system policy at {} declares target {declared} but --target is {}",
            path.display(),
            options.target
        )
        .into());
    }
    Ok(Some(bytes))
}

/// Signs the operator's retro system policy with the delegated role key,
/// verifies it exactly as `vcg-host retro-provision` will, and only then
/// publishes it. A document that fails verification is never written.
fn publish_system_policy(
    options: &Options,
    paths: &StatePaths,
    document: Option<&[u8]>,
    trust: &TrustMaterial,
) -> Result<Option<RetroSignedSystemPolicy>, Box<dyn Error>> {
    let (Some(document), Some(key)) = (document, trust.policy_key.as_ref()) else {
        return Ok(None);
    };
    let signature = signature_bundle(
        POLICY_KEY_ID,
        &key.sign(&artifact_signing_message(
            UpdateArtifactKind::RetroSystemPolicy,
            document,
        ))
        .to_bytes(),
    )?;
    let policy = RetroSignedSystemPolicy::load_with_update_role(
        document,
        &DetachedUpdateSignatures::from_json_bytes(&signature)?,
        &trust.policy,
        &options.target,
    )?;
    fs::write(&paths.policy, document)?;
    fs::write(&paths.policy_signature, &signature)?;
    Ok(Some(policy))
}

fn report(
    options: &Options,
    paths: &StatePaths,
    trust: &TrustMaterial,
    publication: &Publication,
    policy: Option<&RetroSignedSystemPolicy>,
) {
    let catalog = &publication.catalog;
    println!(
        "vcg-retro-provision:root generation={} protected-state={} expires-unix-seconds={}",
        trust.root_generation,
        trust.protection,
        trust.policy.root().expires_unix_seconds()
    );
    println!(
        "vcg-retro-provision:catalog generation={} packages={} target={} channel={} republished={}",
        publication.generation,
        catalog.package_summaries().len(),
        catalog.target(),
        options.channel,
        publication.republished
    );
    for summary in catalog.package_summaries() {
        println!(
            "vcg-retro-provision:package id={} version={} runtime={}",
            summary.id, summary.version, summary.runtime
        );
    }
    if let Some(policy) = policy {
        println!(
            "vcg-retro-provision:policy id={} revision={} systems={}",
            policy.policy_id(),
            policy.policy_revision(),
            policy.system_count()
        );
    }
    println!(
        "vcg-retro-provision:launcher --catalog {}",
        paths.catalog.display()
    );
    println!(
        "vcg-retro-provision:launcher --catalog-signature {}",
        paths.catalog_signature.display()
    );
    println!(
        "vcg-retro-provision:launcher --install-root {}",
        options.install_root.display()
    );
    if let Some(content_root) = &options.content_root {
        println!(
            "vcg-retro-provision:launcher --content-root {}",
            content_root.display()
        );
    }
    println!(
        "vcg-retro-provision:launcher --runtime-root {}",
        options.runtime_root.display()
    );
    println!(
        "vcg-retro-provision:launcher --data-root {}",
        options.data_root.display()
    );
    println!(
        "vcg-retro-provision:launcher --update-root-store {}",
        paths.store.display()
    );
    println!(
        "vcg-retro-provision:launcher --update-root-anchors {}",
        paths.anchors.display()
    );
    println!(
        "vcg-retro-provision:launcher --update-root-protected-state {}",
        paths.protected_state.display()
    );
    println!(
        "vcg-retro-provision:launcher --update-channel {}",
        options.channel
    );
    println!(
        "vcg-retro-provision:launcher --trusted-unix-seconds {}",
        options.trusted_unix_seconds
    );
    if policy.is_some() {
        println!(
            "vcg-retro-provision:launcher --system-policy {}",
            paths.policy.display()
        );
        println!(
            "vcg-retro-provision:launcher --system-policy-signature {}",
            paths.policy_signature.display()
        );
    }
}

fn signature_bundle(key_id: &str, signature: &[u8; 64]) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "signatures": [{ "keyId": key_id, "signature": hex(signature) }],
    }))
}

fn require_identifier(option: &str, value: &str) -> Result<(), Box<dyn Error>> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte));
    if valid {
        Ok(())
    } else {
        Err(
            format!("{option} must be 1-64 characters of ASCII letters, digits, '.', '_', or '-'")
                .into(),
        )
    }
}

fn require_owned_root(option: &str, path: &Path) -> Result<(), Box<dyn Error>> {
    let valid = path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir));
    if valid {
        Ok(())
    } else {
        Err(format!(
            "{option} must be an absolute path without '.' or '..' components: {}",
            path.display()
        )
        .into())
    }
}

fn require_relative(kind: &str, package_id: &str, value: &str) -> Result<(), Box<dyn Error>> {
    let valid = !value.is_empty()
        && !value.contains('\\')
        && !value.contains(':')
        && !value.starts_with('/')
        && value
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..");
    if valid {
        Ok(())
    } else {
        Err(format!(
            "{kind} path for package {package_id} must be relative and use '/' separators without empty, '.', or '..' segments: {value}"
        )
        .into())
    }
}

fn digest_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    // Heap-allocated: a 64 KiB stack buffer trips clippy's large-stack-arrays
    // bound and risks the smaller default stacks on the target appliances.
    let mut buffer = vec![0_u8; 64 * 1_024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(hex(&digest.finalize()))
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    const TRUSTED: u64 = 2_000_000_000;
    const EXPIRES: u64 = 2_100_000_000;
    const TARGET: &str = "aarch64-linux";
    const CHANNEL: &str = "stable";
    const POLICY_ID: &str = "retro-policy";
    const MANIFEST: &[u8] = br#"{"documentType":"vcg-installed-game-manifest","schemaVersion":1,"id":"retro-2048","version":"1.0.0","runtime":"libretro","compatibilityStatus":"qualified","launch":{"timeoutMs":15000,"healthCheck":{"type":"process"}}}"#;
    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new(core: &str) -> Self {
            let unique = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root = env::temp_dir().join(format!(
                "vcg-retro-provision-{}-{unique}",
                std::process::id()
            ));
            let install = root.join("install");
            fs::create_dir_all(install.join("games/retro-2048")).expect("game directory");
            fs::create_dir_all(install.join("runtimes/retroarch")).expect("runtime directory");
            fs::create_dir_all(install.join("cores")).expect("core directory");
            fs::create_dir_all(root.join("content/retro-2048")).expect("content directory");
            fs::create_dir_all(root.join("state")).expect("state directory");
            fs::write(install.join("games/retro-2048/vcg-game.json"), MANIFEST)
                .expect("write manifest");
            fs::write(install.join("runtimes/retroarch/retroarch"), b"frontend")
                .expect("write frontend");
            fs::write(
                install.join("runtimes/retroarch/vcg-base.cfg"),
                b"config_save_on_exit = \"false\"\n",
            )
            .expect("write base configuration");
            fs::write(install.join("cores/2048_libretro.so"), b"core").expect("write core");
            fs::write(root.join("content/retro-2048/game.bin"), b"content").expect("write content");
            fs::write(
                root.join("packages.json"),
                format!(
                    concat!(
                        "{{\"schemaVersion\":1,\"packages\":[{{",
                        "\"id\":\"retro-2048\",\"version\":\"1.0.0\",",
                        "\"manifest\":\"games/retro-2048/vcg-game.json\",",
                        "\"frontend\":\"runtimes/retroarch/retroarch\",",
                        "\"core\":\"{}\",",
                        "\"baseConfig\":\"runtimes/retroarch/vcg-base.cfg\",",
                        "\"content\":{{\"mode\":\"managed\",\"path\":\"retro-2048/game.bin\"}}",
                        "}}]}}"
                    ),
                    core
                ),
            )
            .expect("write package input");
            Self { root }
        }

        fn arguments(&self) -> Vec<OsString> {
            [
                "--state-root",
                self.root.join("state").to_str().expect("state path"),
                "--install-root",
                self.root.join("install").to_str().expect("install path"),
                "--content-root",
                self.root.join("content").to_str().expect("content path"),
                "--runtime-root",
                self.root.join("runtime").to_str().expect("runtime path"),
                "--data-root",
                self.root.join("data").to_str().expect("data path"),
                "--channel",
                CHANNEL,
                "--target",
                TARGET,
                "--packages",
                self.root
                    .join("packages.json")
                    .to_str()
                    .expect("input path"),
                "--expires-unix-seconds",
                &EXPIRES.to_string(),
                "--trusted-unix-seconds",
                &TRUSTED.to_string(),
            ]
            .into_iter()
            .map(OsString::from)
            .collect()
        }

        fn arguments_with_policy(&self, policy: &Path) -> Vec<OsString> {
            let mut arguments = self.arguments();
            arguments.push(OsString::from("--system-policy"));
            arguments.push(OsString::from(policy));
            arguments
        }

        fn state(&self) -> PathBuf {
            self.root.join("state")
        }

        fn write_policy(&self, document: &str) -> PathBuf {
            let path = self.root.join("system-policy.json");
            fs::write(&path, document).expect("write policy document");
            path
        }

        /// The artifact each delegated role in the published root names.
        fn root_roles(&self) -> Vec<String> {
            let document: Value = serde_json::from_slice(
                &fs::read(self.state().join("trust/root.json")).expect("root metadata"),
            )
            .expect("root metadata parses");
            document["roles"]
                .as_array()
                .expect("roles")
                .iter()
                .map(|role| role["artifact"].as_str().expect("artifact").to_owned())
                .collect()
        }

        fn protected_generation(&self) -> u64 {
            ProtectedUpdateRootState::from_json_bytes(
                &fs::read(self.state().join("trust/protected-state.json"))
                    .expect("protected state"),
            )
            .expect("protected state parses")
            .generation()
        }

        /// Repeats the accepted-root replay every consumer performs: anchors and
        /// protected state from disk, then the accepted root and its channel.
        fn trusted_update_policy(&self) -> Result<TrustedUpdatePolicy, Box<dyn Error>> {
            let state = self.state();
            let anchors =
                RootTrustAnchorSet::from_json_bytes(&fs::read(state.join("trust/anchors.json"))?)?;
            let protected = ProtectedUpdateRootState::from_json_bytes(&fs::read(
                state.join("trust/protected-state.json"),
            )?)?;
            let store = UpdateRootStore::open(UpdateRootStoreConfig {
                store_root: state.join("trust/accepted-roots"),
            })?;
            let root = store.load_current(&anchors, &protected, TRUSTED)?;
            Ok(TrustedUpdatePolicy::new(root, CHANNEL, TRUSTED)?)
        }

        /// Repeats the exact signed-policy load `vcg-host retro-provision` runs.
        fn load_policy_as_host(&self) -> Result<RetroSignedSystemPolicy, Box<dyn Error>> {
            let state = self.state();
            let signatures = DetachedUpdateSignatures::from_json_bytes(&fs::read(
                state.join(POLICY_SIGNATURE_FILE),
            )?)?;
            Ok(RetroSignedSystemPolicy::load_with_update_role(
                &fs::read(state.join(POLICY_FILE))?,
                &signatures,
                &self.trusted_update_policy()?,
                TARGET,
            )?)
        }

        /// Repeats the launcher's own loose-catalog load: anchors and protected
        /// state from disk, then the accepted root, policy, and catalog.
        fn load_as_launcher(&self) -> Result<TrustedPackageCatalog, Box<dyn Error>> {
            let state = self.state();
            let policy = self.trusted_update_policy()?;
            let signatures = DetachedUpdateSignatures::from_json_bytes(&fs::read(
                state.join(CATALOG_SIGNATURE_FILE),
            )?)?;
            let catalog = TrustedPackageCatalog::load_with_update_role(
                &state.join(CATALOG_FILE),
                &signatures,
                &policy,
                TARGET,
                CatalogRoots {
                    install_root: self.root.join("install"),
                    content_root: Some(self.root.join("content")),
                    runtime_root: self.root.join("runtime"),
                    data_root: self.root.join("data"),
                },
            )?;
            catalog.verify_all_artifacts()?;
            Ok(catalog)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    /// One retro system policy document for a target and revision.
    fn policy_document(target: &str, revision: u64, extensions: &str) -> String {
        format!(
            concat!(
                "{{\"schemaVersion\":1,\"policyId\":\"{}\",\"policyRevision\":{},",
                "\"target\":\"{}\",\"maxLibraryEntries\":128,",
                "\"maxLibraryBytes\":33554432,\"systems\":[{{\"systemId\":\"gb\",",
                "\"extensions\":{},\"coreId\":\"gambatte\",",
                "\"controllerProfile\":\"game-boy-standard\",",
                "\"maxContentBytes\":4194304}}]}}"
            ),
            POLICY_ID, revision, target, extensions
        )
    }

    #[test]
    fn two_phase_bootstrap_publishes_a_launcher_loadable_catalog() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        run(&fixture.arguments()).expect("first provisioning run");
        let state = fixture.state();
        let root_bytes = fs::read(state.join("trust/root.json")).expect("root metadata");
        assert_eq!(
            fs::read(state.join("trust/accepted-roots/generations/00000000000000000001/root.json"))
                .expect("committed generation"),
            root_bytes
        );
        let protected = ProtectedUpdateRootState::from_json_bytes(
            &fs::read(state.join("trust/protected-state.json")).expect("protected state"),
        )
        .expect("protected state parses");
        assert_eq!(protected.generation(), 1);
        assert_eq!(
            protected.root_metadata_sha256(),
            Some(hex(&Sha256::digest(&root_bytes)).as_str())
        );

        let catalog = fixture.load_as_launcher().expect("launcher loads catalog");
        assert_eq!(catalog.generation(), 1);
        assert_eq!(catalog.target(), TARGET);
        let summaries = catalog.package_summaries();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, "retro-2048");

        let published = fs::read(state.join(CATALOG_FILE)).expect("catalog");
        run(&fixture.arguments()).expect("second provisioning run");
        assert_eq!(
            fs::read(state.join(CATALOG_FILE)).expect("catalog after rerun"),
            published
        );
        assert_eq!(
            fixture
                .load_as_launcher()
                .expect("launcher loads after rerun")
                .generation(),
            1
        );
    }

    #[test]
    fn library_content_publishes_a_system_and_core_binding_without_a_file() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        fs::write(
            fixture.root.join("packages.json"),
            concat!(
                "{\"schemaVersion\":1,\"packages\":[{",
                "\"id\":\"retro-2048\",\"version\":\"1.0.0\",",
                "\"manifest\":\"games/retro-2048/vcg-game.json\",",
                "\"frontend\":\"runtimes/retroarch/retroarch\",",
                "\"core\":\"cores/2048_libretro.so\",",
                "\"baseConfig\":\"runtimes/retroarch/vcg-base.cfg\",",
                "\"content\":{\"mode\":\"library\",\"systemId\":\"nes\",\"coreId\":\"mesen\"}",
                "}]}"
            ),
        )
        .expect("write library package input");

        run(&fixture.arguments()).expect("library provisioning run");

        let published =
            fs::read_to_string(fixture.state().join(CATALOG_FILE)).expect("published catalog");
        assert!(published.contains(r#""mode": "library""#), "{published}");
        assert!(published.contains(r#""systemId": "nes""#), "{published}");
        assert!(published.contains(r#""coreId": "mesen""#), "{published}");
        // A library record names no file and carries no content digest.
        assert!(!published.contains("retro-2048/game.bin"), "{published}");

        let catalog = fixture.load_as_launcher().expect("launcher loads catalog");
        assert_eq!(catalog.package_summaries().len(), 1);
    }

    #[test]
    fn changed_artifact_fails_verification_until_republished() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        run(&fixture.arguments()).expect("first provisioning run");
        fs::write(
            fixture.root.join("install/cores/2048_libretro.so"),
            b"replaced core",
        )
        .expect("replace core");
        assert!(
            fixture.load_as_launcher().is_err(),
            "a changed core must fail the signed digest check"
        );
        run(&fixture.arguments()).expect("republish after the core changed");
        assert_eq!(
            fixture
                .load_as_launcher()
                .expect("republished catalog loads")
                .generation(),
            2
        );
    }

    #[test]
    fn an_unverifiable_candidate_never_replaces_the_published_catalog() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        run(&fixture.arguments()).expect("first provisioning run");
        let state = fixture.state();
        let published = fs::read(state.join(CATALOG_FILE)).expect("catalog");
        let signature = fs::read(state.join(CATALOG_SIGNATURE_FILE)).expect("catalog signature");
        fs::write(
            fixture.root.join("install/games/retro-2048/vcg-game.json"),
            String::from_utf8(MANIFEST.to_vec())
                .expect("manifest is UTF-8")
                .replace("\"version\":\"1.0.0\"", "\"version\":\"9.9.9\""),
        )
        .expect("rewrite manifest identity");
        let error = run(&fixture.arguments())
            .expect_err("a manifest that contradicts the catalog must fail closed");
        assert!(
            error.to_string().contains("manifest"),
            "error must name the bound manifest: {error}"
        );
        assert_eq!(
            fs::read(state.join(CATALOG_FILE)).expect("catalog after failure"),
            published
        );
        assert_eq!(
            fs::read(state.join(CATALOG_SIGNATURE_FILE)).expect("signature after failure"),
            signature
        );
        assert!(!state.join(INCOMING_CATALOG_FILE).exists());
    }

    #[test]
    fn missing_artifact_fails_before_publication() {
        let fixture = Fixture::new("cores/absent_libretro.so");
        let error = run(&fixture.arguments()).expect_err("a missing core must fail closed");
        assert!(
            error.to_string().contains("absent_libretro.so"),
            "error must name the missing artifact: {error}"
        );
        assert!(!fixture.state().join(CATALOG_FILE).exists());
    }

    #[test]
    fn usage_is_available_and_an_empty_invocation_fails() {
        run(&[OsString::from("--help")]).expect("--help prints usage");
        let error = run(&[]).expect_err("an empty invocation must fail");
        assert!(error.to_string().starts_with("usage:"));
    }

    #[test]
    fn a_signed_policy_verifies_and_republishes_idempotently() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        let document = policy_document(TARGET, 3, "[\".gb\"]");
        let path = fixture.write_policy(&document);
        run(&fixture.arguments_with_policy(&path)).expect("first provisioning run");

        let state = fixture.state();
        assert_eq!(
            fs::read(state.join(POLICY_FILE)).expect("published policy"),
            document.as_bytes()
        );
        assert_eq!(fixture.root_roles(), [CATALOG_ARTIFACT, POLICY_ARTIFACT]);
        assert_eq!(fixture.protected_generation(), 1);

        let policy = fixture.load_policy_as_host().expect("host loads policy");
        assert_eq!(policy.policy_id(), POLICY_ID);
        assert_eq!(policy.policy_revision(), 3);
        assert_eq!(policy.target(), TARGET);
        assert_eq!(policy.system_count(), 1);
        assert_eq!(
            policy.update_authority().artifact(),
            UpdateArtifactKind::RetroSystemPolicy
        );
        assert_eq!(policy.update_authority().channel(), CHANNEL);
        assert_eq!(policy.update_authority().root_generation(), 1);
        assert!(policy.system("gb").is_ok());

        let signature = fs::read(state.join(POLICY_SIGNATURE_FILE)).expect("policy signature");
        run(&fixture.arguments_with_policy(&path)).expect("second provisioning run");
        assert_eq!(
            fs::read(state.join(POLICY_SIGNATURE_FILE)).expect("signature after rerun"),
            signature
        );
        assert_eq!(fixture.protected_generation(), 1);
        assert_eq!(
            fixture
                .load_as_launcher()
                .expect("launcher loads after rerun")
                .generation(),
            1
        );
        assert_eq!(
            fixture
                .load_policy_as_host()
                .expect("policy after rerun")
                .policy_revision(),
            3
        );
    }

    #[test]
    fn a_tampered_policy_fails_the_verification_that_published_it() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        let path = fixture.write_policy(&policy_document(TARGET, 3, "[\".gb\"]"));
        run(&fixture.arguments_with_policy(&path)).expect("provisioning run");
        fs::write(
            fixture.state().join(POLICY_FILE),
            policy_document(TARGET, 4, "[\".gb\"]"),
        )
        .expect("rewrite the published policy");
        let error = fixture
            .load_policy_as_host()
            .expect_err("a rewritten policy must fail its signature check");
        assert!(
            error.to_string().contains("update authority"),
            "error must name the failed authority check: {error}"
        );
    }

    #[test]
    fn a_policy_the_host_would_refuse_is_never_published() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        let unsorted = fixture.write_policy(&policy_document(TARGET, 3, "[\".gbc\",\".gb\"]"));
        let error = run(&fixture.arguments_with_policy(&unsorted))
            .expect_err("unsorted extensions must fail closed");
        assert!(
            error.to_string().contains("sorted"),
            "error must state the extension rule: {error}"
        );
        let state = fixture.state();
        assert!(!state.join(POLICY_FILE).exists());
        assert!(!state.join(POLICY_SIGNATURE_FILE).exists());

        let mismatched = fixture.write_policy(&policy_document("other-target", 3, "[\".gb\"]"));
        let error = run(&fixture.arguments_with_policy(&mismatched))
            .expect_err("a policy naming another target must fail closed");
        assert!(
            error.to_string().contains("other-target"),
            "error must name the declared target: {error}"
        );
        assert!(!state.join(POLICY_FILE).exists());
    }

    #[test]
    fn catalog_only_provisioning_delegates_no_policy_role() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        run(&fixture.arguments()).expect("first provisioning run");
        let state = fixture.state();
        assert_eq!(fixture.root_roles(), [CATALOG_ARTIFACT]);
        assert!(!state.join("trust/private/policy.ed25519").exists());
        assert!(!state.join(POLICY_FILE).exists());
        assert!(!state.join(POLICY_SIGNATURE_FILE).exists());
        assert_eq!(fixture.protected_generation(), 1);

        run(&fixture.arguments()).expect("second provisioning run");
        assert_eq!(fixture.root_roles(), [CATALOG_ARTIFACT]);
        assert_eq!(fixture.protected_generation(), 1);
    }

    #[test]
    fn a_root_without_a_policy_role_rotates_once_to_gain_one() {
        let fixture = Fixture::new("cores/2048_libretro.so");
        run(&fixture.arguments()).expect("catalog-only provisioning run");
        let state = fixture.state();
        let catalog = fs::read(state.join(CATALOG_FILE)).expect("catalog");
        assert_eq!(fixture.protected_generation(), 1);

        let path = fixture.write_policy(&policy_document(TARGET, 3, "[\".gb\"]"));
        run(&fixture.arguments_with_policy(&path)).expect("policy provisioning run");
        assert_eq!(fixture.root_roles(), [CATALOG_ARTIFACT, POLICY_ARTIFACT]);
        assert_eq!(fixture.protected_generation(), 2);
        assert_eq!(
            fs::read(state.join(CATALOG_FILE)).expect("catalog after the rotation"),
            catalog
        );
        assert_eq!(
            fixture
                .load_as_launcher()
                .expect("launcher loads under the rotated root")
                .generation(),
            1
        );
        assert_eq!(
            fixture
                .load_policy_as_host()
                .expect("host loads policy")
                .update_authority()
                .root_generation(),
            2
        );

        run(&fixture.arguments_with_policy(&path)).expect("third provisioning run");
        assert_eq!(fixture.protected_generation(), 2);
    }

    #[test]
    fn unsafe_package_paths_fail_closed() {
        let fixture = Fixture::new("../outside/2048_libretro.so");
        let error = run(&fixture.arguments()).expect_err("an escaping path must fail closed");
        assert!(
            error.to_string().contains("must be relative"),
            "error must state the path rule: {error}"
        );
    }
}
