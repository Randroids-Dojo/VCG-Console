use super::formats::RetroSessionTransport;
use super::validation::validate_visible_title;
use std::sync::atomic::{AtomicU64, Ordering};

use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Value, json};

use super::*;
use crate::update_trust::{
    DetachedUpdateSignature, RootTrustAnchor, RootTrustAnchorSet, TrustedUpdateRoot,
    artifact_signing_message, root_signing_message,
};

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);
const INSPECTION_ID: &str = "rii-11111111111111111111111111111111";
const SOURCE_HANDLE: &str = "rih-22222222222222222222222222222222";
const SESSION_ID: &str = "ris-33333333333333333333333333333333";

#[test]
fn installed_titles_reject_invisible_directional_and_nonportable_unicode() {
    for value in [
        "Game\u{85}",
        "Game\u{ad}",
        "Game\u{200b}",
        "Game\u{2028}",
        "Game\u{202e}",
        "Game\u{2066}",
        "Game\u{feff}",
    ] {
        assert!(matches!(
            validate_visible_title(value),
            Err(RetroImportError::InvalidLibrary(_))
        ));
    }

    assert!(validate_visible_title(&"🎮".repeat(80)).is_ok());
    assert!(matches!(
        validate_visible_title(&"🎮".repeat(81)),
        Err(RetroImportError::InvalidLibrary(_))
    ));
}

#[test]
fn system_and_core_identifiers_admit_only_what_a_catalog_package_can_bind() {
    assert!(validate_bindable_id("system ID", "genesis-cd").is_ok());
    assert!(matches!(
        validate_bindable_id("system ID", "genesis.cd"),
        Err(RetroImportError::InvalidIdentifier { .. })
    ));
    assert!(matches!(
        validate_bindable_id("core ID", "genesis.plus.gx"),
        Err(RetroImportError::InvalidIdentifier { .. })
    ));

    let oversized = "g".repeat(MAX_BINDABLE_ID_BYTES + 1);
    for value in [
        "",
        "GB",
        "-gb",
        "gb-",
        ".gb",
        "gb.",
        "gb--cd",
        "gb..cd",
        "gb.-cd",
        "gb-.cd",
        "gb_cd",
        "gb/cd",
        "gb cd",
        "gb\u{e9}",
        oversized.as_str(),
    ] {
        assert!(
            matches!(
                validate_safe_id("system ID", value, MAX_BINDABLE_ID_BYTES),
                Err(RetroImportError::InvalidIdentifier { .. })
            ),
            "the wider grammar must keep rejecting {value}"
        );
        assert!(
            matches!(
                validate_bindable_id("system ID", value),
                Err(RetroImportError::InvalidIdentifier { .. })
            ),
            "the bindable grammar must keep rejecting {value}"
        );
    }

    // No package names a policy, controller profile, plan, or scanner
    // engine, so those identifiers keep the wider grammar.
    for (label, value) in [
        ("policy ID", "retro.policy"),
        ("controller profile", "retropad.standard.v1"),
        ("scanner engine ID", "clamav.0.103"),
    ] {
        assert!(validate_safe_id(label, value, MAX_BINDABLE_ID_BYTES).is_ok());
    }
}

#[test]
fn current_library_generations_load_and_dotted_bindings_do_not() {
    let entry = |system_id: &str, core_id: &str| {
        json!({
            "entryId":
                "content-01f1b54b6e483ccf72c4aca752cdb6de6e0ba4497164be7c705a5292d1e15ba4",
            "systemId": system_id,
            "sha256": "01f1b54b6e483ccf72c4aca752cdb6de6e0ba4497164be7c705a5292d1e15ba4",
            "sizeBytes": 262_160,
            "extension": ".nes",
            "title": "Conquest of the Crystal Palace (U)",
            "coreId": core_id,
            "controllerProfile": "retropad-standard-v1",
            "provenance": { "transport": "operator-provisioned" }
        })
    };
    let generation = |system_id: &str, core_id: &str| {
        let document = json!({
            "schemaVersion": 1,
            "generation": 1,
            "entries": [entry(system_id, core_id)]
        });
        serde_json::from_value::<RetroInstalledLibrary>(document)
            .expect("installed library document parses")
    };

    validate_library(&generation("nes", "mesen")).expect("shipped identifiers still load");
    validate_library(&generation("snes", "snes9x")).expect("shipped identifiers still load");

    for (system_id, core_id) in [("genesis.cd", "mesen"), ("nes", "genesis.plus.gx")] {
        assert!(matches!(
            validate_library(&generation(system_id, core_id)),
            Err(RetroImportError::InvalidIdentifier { .. })
        ));
    }
}

struct Fixture {
    root: PathBuf,
    staging: PathBuf,
    content: PathBuf,
    store: RetroImportStore,
}

impl Fixture {
    fn new() -> Self {
        Self::with_reserve(1)
    }

    fn with_reserve(reserve_bytes: u64) -> Self {
        let root = std::env::temp_dir().join(format!(
            "vcg-retro-import-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let staging = root.join("staging");
        let content = root.join("retro");
        let store = provision_test_store(&RetroImportStoreConfig {
            staging_root: staging.clone(),
            content_root: content.clone(),
            reserve_bytes,
        });
        Self {
            root,
            staging,
            content,
            store,
        }
    }

    fn source(&self, name: &str, bytes: &[u8]) -> File {
        let path = self.root.join(name);
        fs::write(&path, bytes).expect("write source");
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .expect("open source")
    }

    fn library(&self) -> RetroInstalledLibrary {
        self.store.current_library().expect("read current library")
    }

    fn pending(&self) -> Option<PendingInstall> {
        self.store.read_pending().expect("read pending")
    }

    fn object_files(&self) -> Vec<PathBuf> {
        let mut paths = fs::read_dir(self.content.join(RETRO_CONTENT_OBJECTS_DIRECTORY))
            .expect("read objects")
            .map(|entry| entry.expect("object entry").path())
            .collect::<Vec<_>>();
        paths.sort();
        paths
    }

    fn audit_files(&self) -> Vec<PathBuf> {
        let mut paths = fs::read_dir(self.content.join(RETRO_AUDIT_DIRECTORY))
            .expect("read audits")
            .map(|entry| entry.expect("audit entry").path())
            .collect::<Vec<_>>();
        paths.sort();
        paths
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if self.root.starts_with(std::env::temp_dir()) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}

fn provision_test_store(config: &RetroImportStoreConfig) -> RetroImportStore {
    assert!(
        RetroImportStore::provision_roots(config).expect("provision retro roots"),
        "a fresh fixture must create its roots"
    );
    assert!(
        !RetroImportStore::provision_roots(config).expect("reprovision retro roots"),
        "provisioning roots must be idempotent"
    );
    RetroImportStore::open(config).expect("open retro import store")
}

fn protected_namespace_sentinels(
    namespace: &StorageNamespacePlan,
) -> Vec<(PathBuf, &'static [u8])> {
    vec![
        (
            namespace
                .root_for(WritableDataClass::SystemMetadata)
                .join("system.json"),
            b"system state",
        ),
        (
            namespace
                .root_for(WritableDataClass::ProductionPackages)
                .join("frontend.pkg"),
            b"production frontend",
        ),
        (
            namespace
                .root_for(WritableDataClass::ProductionPackages)
                .join("core.pkg"),
            b"curated core",
        ),
        (
            namespace
                .root_for(WritableDataClass::DeveloperPackages)
                .join("developer.pkg"),
            b"developer package",
        ),
        (
            namespace
                .root_for(WritableDataClass::Saves)
                .join("save.bin"),
            b"save bytes",
        ),
        (
            namespace
                .root_for(WritableDataClass::Saves)
                .join("state.bin"),
            b"state bytes",
        ),
        (
            namespace
                .root_for(WritableDataClass::Saves)
                .join("remap.json"),
            b"remap bytes",
        ),
        (
            namespace
                .root_for(WritableDataClass::Profiles)
                .join("profile.vault"),
            b"profile bytes",
        ),
        (
            namespace.root_for(WritableDataClass::Logs).join("host.log"),
            b"log bytes",
        ),
        (
            namespace
                .root_for(WritableDataClass::Cache)
                .join("cache.bin"),
            b"cache bytes",
        ),
        (
            namespace.package_staging_root().join("package.partial"),
            b"package staging bytes",
        ),
    ]
}

fn replace_managed_object_bytes_for_test(path: &Path, bytes: &[u8]) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path)
            .expect("inspect managed object permissions")
            .permissions();
        permissions.set_mode(0o600);
        fs::set_permissions(path, permissions).expect("make managed object test-writable");
    }
    fs::write(path, bytes).expect("replace managed object bytes");
}

#[derive(Clone)]
struct FakeScanner {
    status: RetroScanStatus,
    unavailable: bool,
    wrong_inspection: bool,
    wrong_hash: bool,
    calls: usize,
    observed: Vec<u8>,
}

impl FakeScanner {
    fn clean() -> Self {
        Self {
            status: RetroScanStatus::Clean,
            unavailable: false,
            wrong_inspection: false,
            wrong_hash: false,
            calls: 0,
            observed: Vec::new(),
        }
    }

    fn with_status(status: RetroScanStatus) -> Self {
        Self {
            status,
            ..Self::clean()
        }
    }
}

impl RetroContentScanner for FakeScanner {
    fn scan(
        &mut self,
        subject: &mut dyn Read,
        request: &RetroScanRequest,
    ) -> Result<RetroScanEvidence, String> {
        self.calls += 1;
        self.observed.clear();
        subject
            .read_to_end(&mut self.observed)
            .map_err(|error| error.to_string())?;
        if self.unavailable {
            return Err("scanner process unavailable".to_owned());
        }
        Ok(RetroScanEvidence::new(
            "test-scanner",
            "rules-2026-07-24",
            if self.wrong_inspection {
                "rii-99999999999999999999999999999999"
            } else {
                request.inspection_id()
            },
            if self.wrong_hash {
                "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
            } else {
                request.subject_sha256()
            },
            self.status,
        ))
    }
}

fn digest(bytes: &[u8]) -> String {
    encode_hex(&Sha256::digest(bytes))
}

fn policy() -> RetroPlainSystemPolicy {
    RetroPlainSystemPolicy::new(
        "retro-policy",
        7,
        "gb",
        ".gb",
        "gambatte",
        "game-boy-standard",
        4 * 1024 * 1024,
        128,
        32 * 1024 * 1024,
    )
    .expect("valid policy")
}

fn context(intent: &[u8]) -> RetroPlainImportContext {
    RetroPlainImportContext::authorize(intent, INSPECTION_ID, 10_000, false, policy())
        .expect("valid context")
}

fn intent_value(
    bytes: &[u8],
    generation: u64,
    transport: &str,
    plan_suffix: &str,
    existing_entry_id: Option<&str>,
) -> Value {
    let sha256 = digest(bytes);
    let plan_id = format!("rip-33333333-{}-{plan_suffix}", &sha256[..16]);
    let (action, decision) = if existing_entry_id.is_some() {
        ("replace-existing", "replace-existing")
    } else {
        ("install-new", "install")
    };
    json!({
        "schemaVersion": 1,
        "planId": plan_id,
        "expectedLibraryGeneration": generation,
        "action": action,
        "sourceHandle": SOURCE_HANDLE,
        "sourceSha256": sha256,
        "installEntry": {
            "entryId": format!("content-{sha256}"),
            "systemId": "gb",
            "sha256": sha256,
            "sizeBytes": bytes.len(),
            "extension": ".gb",
            "title": format!("Fixture {plan_suffix}"),
            "coreId": "gambatte",
            "controllerProfile": "game-boy-standard",
            "provenance": {
                "transport": transport,
                "importSessionId": SESSION_ID,
                "entitlementStatementVersion": "vcg-user-entitled-content-v1",
                "importedAtMs": 500
            }
        },
        "existingEntryId": existing_entry_id,
        "cleanupStagingAfterTerminal": true,
        "audit": {
            "event": "retro-import-terminal-intent",
            "planId": plan_id,
            "policyId": "retro-policy",
            "policyRevision": 7,
            "sessionId": SESSION_ID,
            "transport": transport,
            "systemId": "gb",
            "contentSha256": sha256,
            "entitlementStatementVersion": "vcg-user-entitled-content-v1",
            "decision": decision
        }
    })
}

fn intent_bytes(
    bytes: &[u8],
    generation: u64,
    transport: &str,
    plan_suffix: &str,
    existing_entry_id: Option<&str>,
) -> Vec<u8> {
    serde_json::to_vec(&intent_value(
        bytes,
        generation,
        transport,
        plan_suffix,
        existing_entry_id,
    ))
    .expect("serialize intent")
}

fn cancel_intent(bytes: &[u8], generation: u64, suffix: &str) -> Vec<u8> {
    let mut value = intent_value(bytes, generation, "usb", suffix, None);
    value["action"] = json!("cancel-and-cleanup");
    value["installEntry"] = Value::Null;
    value["audit"]["decision"] = json!("cancel");
    serde_json::to_vec(&value).expect("serialize cancel intent")
}

fn reuse_intent(bytes: &[u8], generation: u64, suffix: &str, existing_entry_id: &str) -> Vec<u8> {
    let mut value = intent_value(bytes, generation, "usb", suffix, Some(existing_entry_id));
    value["action"] = json!("reuse-existing");
    value["installEntry"] = Value::Null;
    value["audit"]["decision"] = json!("use-existing");
    serde_json::to_vec(&value).expect("serialize reuse intent")
}

fn pending_for(fixture: &Fixture, bytes: &[u8], generation: u64, suffix: &str) -> PendingInstall {
    let intent_json = intent_bytes(bytes, generation, "usb", suffix, None);
    let intent = parse_commit_intent(&intent_json).expect("parse intent");
    let pending = PendingInstall {
        schema_version: SCHEMA_VERSION,
        inspection_id: INSPECTION_ID.to_owned(),
        plan_expires_at_ms: 10_000,
        policy: policy(),
        intent_authority_sha256: canonical_intent_sha256(&intent).expect("hash authorized intent"),
        intent,
    };
    fixture
        .store
        .publish_pending(&pending)
        .expect("publish pending");
    pending
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PlainInstallInteropFixture {
    fixture_version: u32,
    payload_utf8: String,
    inspection_id: String,
    plan_expires_at_ms: u64,
    now_ms: u64,
    policy: RetroPlainSystemPolicy,
    intent: Value,
}

#[test]
fn consumes_the_exact_terminal_intent_emitted_by_the_typescript_contract() {
    let shared: PlainInstallInteropFixture = serde_json::from_str(include_str!(
        "../../../../packages/retro-import-contract/fixtures/plain-install-v1.json"
    ))
    .expect("parse shared plain-install fixture");
    assert_eq!(shared.fixture_version, 1);
    let intent_json = serde_json::to_vec(&shared.intent).expect("serialize shared intent");
    let authority = RetroPlainImportContext::authorize(
        &intent_json,
        shared.inspection_id,
        shared.plan_expires_at_ms,
        false,
        shared.policy,
    )
    .expect("authorize shared intent");
    let fixture = Fixture::new();
    let mut source = fixture.source("shared-fixture.gb", shared.payload_utf8.as_bytes());
    let outcome = fixture
        .store
        .install_plain(
            &intent_json,
            &authority,
            &mut source,
            &mut FakeScanner::clean(),
            shared.now_ms,
        )
        .expect("install shared fixture");
    assert_eq!(outcome.library_generation(), 2);
    assert_eq!(
        fixture.library().entries[0].sha256,
        digest(shared.payload_utf8.as_bytes())
    );
}

#[test]
fn usb_and_paired_lan_share_exact_plain_file_transaction() {
    for (transport, suffix) in [("usb", "usb"), ("paired-lan", "lan")] {
        let fixture = Fixture::new();
        let bytes = format!("content from {transport}").into_bytes();
        let mut source = fixture.source("workstation-source.gb", &bytes);
        let mut scanner = FakeScanner::clean();
        let intent = intent_bytes(&bytes, 1, transport, suffix, None);
        let outcome = fixture
            .store
            .install_plain(&intent, &context(&intent), &mut source, &mut scanner, 1_000)
            .expect("install plain retro file");

        assert_eq!(outcome.library_generation(), 2);
        assert_eq!(scanner.calls, 1);
        assert_eq!(scanner.observed, bytes);
        assert!(!fixture.store.recovery_required().expect("state query"));
        let library = fixture.library();
        assert_eq!(library.generation, 2);
        assert_eq!(library.entries.len(), 1);
        let (recorded, session) = library.entries[0]
            .provenance
            .session()
            .expect("session-bound provenance");
        assert_eq!(
            recorded,
            if transport == "usb" {
                RetroSessionTransport::Usb
            } else {
                RetroSessionTransport::PairedLan
            }
        );
        assert_eq!(session.import_session_id, SESSION_ID);
        let objects = fixture.object_files();
        assert_eq!(objects.len(), 1);
        assert_eq!(fs::read(&objects[0]).expect("read installed object"), bytes);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&objects[0])
                    .expect("inspect installed permissions")
                    .permissions()
                    .mode()
                    & 0o777,
                0o400
            );
        }
        let audits = fixture.audit_files();
        assert_eq!(audits.len(), 1);
        let audit_text = fs::read_to_string(&audits[0]).expect("read audit");
        assert!(audit_text.contains("\"scan\""));
        assert!(!audit_text.contains("workstation-source"));
        assert!(!audit_text.contains(&fixture.root.display().to_string()));
    }
}

#[test]
fn opened_source_capability_is_not_redirected_by_path_replacement() {
    let fixture = Fixture::new();
    let source_path = fixture.root.join("replaceable-source.gb");
    let detached_path = fixture.root.join("detached-open-source.gb");
    let authorized_bytes = b"authorized opened source";
    let replacement_bytes = b"untrusted replacement path bytes";
    fs::write(&source_path, authorized_bytes).expect("write authorized source");
    let mut source = OpenOptions::new()
        .read(true)
        .open(&source_path)
        .expect("open authorized source capability");

    fs::rename(&source_path, &detached_path).expect("detach opened source path");
    fs::write(&source_path, replacement_bytes).expect("replace visible source path");

    let intent = intent_bytes(authorized_bytes, 1, "usb", "opened-capability", None);
    let outcome = fixture
        .store
        .install_plain(
            &intent,
            &context(&intent),
            &mut source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("install from retained opened capability");

    assert_eq!(outcome.library_generation(), 2);
    assert_eq!(
        fs::read(&fixture.object_files()[0]).expect("read installed object"),
        authorized_bytes
    );
    assert_eq!(
        fs::read(&source_path).expect("read replacement path"),
        replacement_bytes
    );
    assert_eq!(
        fs::read(&detached_path).expect("read detached source"),
        authorized_bytes
    );
}

#[test]
#[allow(clippy::too_many_lines)]
fn validates_intent_session_policy_and_generation_before_mutation() {
    let fixture = Fixture::new();
    let bytes = b"strict intent";
    let valid = intent_value(bytes, 1, "usb", "strict", None);
    let valid_bytes = serde_json::to_vec(&valid).expect("valid intent");
    let authority = context(&valid_bytes);
    let mut cases = Vec::new();

    let mut unknown = valid.clone();
    unknown
        .as_object_mut()
        .expect("object")
        .insert("sourcePath".to_owned(), json!("E:\\roms\\fixture.gb"));
    cases.push(serde_json::to_vec(&unknown).expect("unknown field"));

    let mut unsafe_handle = valid.clone();
    unsafe_handle["sourceHandle"] = json!("../../source.gb");
    cases.push(serde_json::to_vec(&unsafe_handle).expect("unsafe handle"));

    let mut mismatched_audit = valid.clone();
    mismatched_audit["audit"]["contentSha256"] =
        json!("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    cases.push(serde_json::to_vec(&mismatched_audit).expect("mismatched audit"));

    let mut wrong_generation = valid.clone();
    wrong_generation["expectedLibraryGeneration"] = json!(2);
    let wrong_generation_bytes = serde_json::to_vec(&wrong_generation).expect("wrong generation");
    let mut wrong_source = fixture.source("wrong-generation.gb", bytes);
    assert!(matches!(
        fixture.store.install_plain(
            &wrong_generation_bytes,
            &authority,
            &mut wrong_source,
            &mut FakeScanner::clean(),
            1_000,
        ),
        Err(RetroImportError::IntentAuthorityMismatch)
    ));
    cases.push(wrong_generation_bytes);

    for invalid in cases {
        let mut source = fixture.source(
            &format!(
                "invalid-{}.gb",
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
            ),
            bytes,
        );
        let mut scanner = FakeScanner::clean();
        assert!(
            fixture
                .store
                .install_plain(&invalid, &authority, &mut source, &mut scanner, 1_000)
                .is_err()
        );
        assert!(fixture.pending().is_none());
        assert_eq!(fixture.library().generation, 1);
        assert!(fixture.object_files().is_empty());
    }

    for invalid_context in [
        RetroPlainImportContext::authorize(&valid_bytes, INSPECTION_ID, 1_000, false, policy())
            .expect("expired context"),
        RetroPlainImportContext::authorize(&valid_bytes, INSPECTION_ID, 10_000, true, policy())
            .expect("revoked context"),
    ] {
        let mut source = fixture.source(
            &format!(
                "context-{}.gb",
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
            ),
            bytes,
        );
        assert!(
            fixture
                .store
                .install_plain(
                    &valid_bytes,
                    &invalid_context,
                    &mut source,
                    &mut FakeScanner::clean(),
                    1_000,
                )
                .is_err()
        );
        assert!(fixture.pending().is_none());
    }

    let other_policy = RetroPlainSystemPolicy::new(
        "other-policy",
        7,
        "gb",
        ".gb",
        "gambatte",
        "game-boy-standard",
        4 * 1024 * 1024,
        128,
        32 * 1024 * 1024,
    )
    .expect("other policy");
    assert!(matches!(
        RetroPlainImportContext::authorize(
            &valid_bytes,
            INSPECTION_ID,
            10_000,
            false,
            other_policy,
        ),
        Err(RetroImportError::PolicyBindingMismatch)
    ));
}

#[test]
fn changed_source_and_explicit_scan_rejection_leave_no_partial_state() {
    let fixture = Fixture::new();
    let expected = b"expected bytes";
    let intent = intent_bytes(expected, 1, "usb", "changed", None);
    let mut changed = fixture.source("changed.gb", b"xxxxxxxxxxxxxx");
    let error = fixture
        .store
        .install_plain(
            &intent,
            &context(&intent),
            &mut changed,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect_err("changed source rejected");
    assert!(matches!(error, RetroImportError::SourceHashMismatch));
    assert!(fixture.pending().is_none());
    assert!(fixture.object_files().is_empty());

    for (status, suffix) in [
        (RetroScanStatus::Blocked, "blocked"),
        (RetroScanStatus::Error, "scan-error"),
    ] {
        let rejected_intent = intent_bytes(expected, 1, "usb", suffix, None);
        let mut source = fixture.source(&format!("{suffix}.gb"), expected);
        let error = fixture
            .store
            .install_plain(
                &rejected_intent,
                &context(&rejected_intent),
                &mut source,
                &mut FakeScanner::with_status(status),
                1_000,
            )
            .expect_err("non-clean scan rejected");
        assert!(matches!(error, RetroImportError::ScanRejected(actual) if actual == status));
        assert!(fixture.pending().is_none());
        assert!(fixture.object_files().is_empty());
        assert_eq!(fixture.library().generation, 1);
    }
}

#[test]
fn scanner_unavailability_and_mismatched_evidence_require_safe_recovery() {
    for mismatch_kind in ["unavailable", "inspection", "hash"] {
        let fixture = Fixture::new();
        let bytes = format!("{mismatch_kind} fixture").into_bytes();
        let mut source = fixture.source("scanner.gb", &bytes);
        let mut scanner = FakeScanner::clean();
        match mismatch_kind {
            "unavailable" => scanner.unavailable = true,
            "inspection" => scanner.wrong_inspection = true,
            "hash" => scanner.wrong_hash = true,
            _ => unreachable!(),
        }
        let intent = intent_bytes(&bytes, 1, "usb", mismatch_kind, None);
        assert!(
            fixture
                .store
                .install_plain(&intent, &context(&intent), &mut source, &mut scanner, 1_000,)
                .is_err()
        );
        assert!(fixture.store.recovery_required().expect("pending state"));
        assert!(fixture.object_files().is_empty());

        let recovery = fixture
            .store
            .recover(&mut FakeScanner::clean())
            .expect("recover with clean scanner");
        assert!(matches!(recovery, RetroImportRecovery::Completed(_)));
        assert_eq!(fixture.library().generation, 2);
        assert!(!fixture.store.recovery_required().expect("clean state"));
    }
}

#[test]
fn incomplete_interruption_discards_only_the_bound_stage() {
    let fixture = Fixture::new();
    let bytes = b"interrupted copy";
    let pending = pending_for(&fixture, bytes, 1, "partial");
    let stage = fixture.store.stage_directory(&pending);
    fs::create_dir(&stage).expect("create stage");
    fs::write(stage.join("payload"), b"short").expect("write partial");
    let recovery = fixture
        .store
        .recover(&mut FakeScanner::clean())
        .expect("recover partial");
    assert_eq!(
        recovery,
        RetroImportRecovery::DiscardedIncomplete {
            plan_id: pending.intent.plan_id
        }
    );
    assert!(!stage.exists());
    assert!(fixture.pending().is_none());
    assert!(fixture.object_files().is_empty());
    assert_eq!(fixture.library().generation, 1);
}

#[test]
fn recovery_preserves_an_unsafe_payload_for_diagnosis() {
    let fixture = Fixture::new();
    let pending = pending_for(&fixture, b"expected payload", 1, "unsafe-payload");
    let stage = fixture.store.stage_directory(&pending);
    fs::create_dir(&stage).expect("create stage");
    fs::create_dir(stage.join("payload")).expect("create invalid payload directory");
    assert!(matches!(
        fixture.store.recover(&mut FakeScanner::clean()),
        Err(RetroImportError::UnsafePathWithKind { .. })
    ));
    assert!(fixture.pending().is_some());
    assert!(stage.join("payload").is_dir());
}

#[test]
fn bounded_state_reads_reject_directories_and_oversized_resume_files() {
    let fixture = Fixture::new();
    assert!(matches!(
        read_json_bounded::<Value>(&fixture.root, 32, "test state"),
        Err(RetroImportError::UnsafePathWithKind { .. })
    ));
    let temporary = fixture.root.join("resume.tmp");
    let final_path = fixture.root.join("published.json");
    let file = File::create(&temporary).expect("create oversized temporary file");
    file.set_len(1024 * 1024).expect("set sparse length");
    drop(file);
    assert!(matches!(
        publish_new_file_resumable(&fixture.root, &temporary, &final_path, b"{}", "test state"),
        Err(RetroImportError::StateTooLarge { maximum: 2, .. })
    ));
    assert!(!final_path.exists());
    assert_eq!(
        fs::metadata(temporary).expect("retained temporary").len(),
        1024 * 1024
    );
}

#[test]
#[cfg(unix)]
fn bounded_json_state_rejects_symlinks() {
    let fixture = Fixture::new();
    let source = fixture.root.join("source.json");
    let linked = fixture.root.join("linked.json");
    fs::write(&source, b"{}").expect("write source");
    std::os::unix::fs::symlink(&source, &linked).expect("create symlink");
    assert!(matches!(
        read_json_bounded::<Value>(&linked, 32, "test state"),
        Err(RetroImportError::UnsafePathWithKind { .. })
    ));
}

#[test]
fn complete_unscanned_stage_recovers_without_original_source() {
    let fixture = Fixture::new();
    let bytes = b"durable staged source";
    let pending = pending_for(&fixture, bytes, 1, "staged");
    let mut source = fixture.source("removed-after-copy.gb", bytes);
    fixture
        .store
        .copy_source_to_stage(&pending, &mut source)
        .expect("copy to stage");
    drop(source);
    fs::remove_file(fixture.root.join("removed-after-copy.gb")).expect("remove source");

    let mut scanner = FakeScanner::clean();
    let recovery = fixture
        .store
        .recover(&mut scanner)
        .expect("recover complete stage");
    assert!(matches!(recovery, RetroImportRecovery::Completed(_)));
    assert_eq!(scanner.observed, bytes);
    assert_eq!(fixture.library().generation, 2);
    assert_eq!(
        fs::read(&fixture.object_files()[0]).expect("read object"),
        bytes
    );
}

#[test]
fn recovery_resumes_published_object_and_resumable_library_temp() {
    let fixture = Fixture::new();
    let bytes = b"crash window";
    let pending = pending_for(&fixture, bytes, 1, "crash");
    let mut source = fixture.source("crash.gb", bytes);
    fixture
        .store
        .copy_source_to_stage(&pending, &mut source)
        .expect("copy stage");
    let stage = fixture.store.stage_directory(&pending);
    let mut payload =
        super::filesystem::StagedPayloadFile::open(&stage.join("payload")).expect("open stage");
    let scan = RetroImportStore::scan_staged(&pending, &mut payload, &mut FakeScanner::clean())
        .expect("scan stage");
    write_new_synced_file(
        &stage.join("scan.json"),
        &serialized_bounded(&scan, MAX_SCAN_RECEIPT_BYTES, "scan").expect("scan bytes"),
        "write scan",
    )
    .expect("persist scan");
    fixture
        .store
        .publish_content_object(&pending, &payload)
        .expect("publish content");
    drop(payload);

    let base = fixture.library();
    let next =
        build_next_library(&base, &pending.intent, &pending.policy).expect("build next library");
    let next_bytes =
        serialized_bounded(&next, MAX_LIBRARY_DOCUMENT_BYTES, "retro installed library")
            .expect("library bytes");
    let library_temp = fixture
        .staging
        .join(format!(".library-{}.tmp", pending.intent.plan_id));
    write_new_synced_file(&library_temp, &next_bytes, "write library temp")
        .expect("write resumable temp");

    let recovery = fixture
        .store
        .recover(&mut FakeScanner::clean())
        .expect("recover publication");
    assert!(matches!(recovery, RetroImportRecovery::Completed(_)));
    assert_eq!(fixture.library(), next);
    assert!(!library_temp.exists());
    assert!(fixture.pending().is_none());
}

#[test]
fn staged_publication_keeps_the_scanned_file_identity() {
    let fixture = Fixture::new();
    let bytes = b"authorized content";
    let pending = pending_for(&fixture, bytes, 1, "pinned-file");
    let mut source = fixture.source("pinned.gb", bytes);
    fixture
        .store
        .copy_source_to_stage(&pending, &mut source)
        .expect("stage source");
    let path = fixture.store.stage_directory(&pending).join("payload");
    let mut payload = super::filesystem::StagedPayloadFile::open(&path).expect("open payload");
    let entry = pending.intent.install_entry_required().expect("entry");
    payload
        .verify(entry.size_bytes, &entry.sha256)
        .expect("verify");
    let mut scanner = FakeScanner::clean();
    RetroImportStore::scan_staged(&pending, &mut payload, &mut scanner).expect("scan");
    assert_eq!(scanner.observed, bytes);
    #[cfg(target_os = "linux")]
    {
        fs::rename(&path, fixture.root.join("held-original")).expect("move original inode");
        fs::write(&path, b"substituted content").expect("replace staging path");
    }
    #[cfg(windows)]
    {
        assert!(fs::rename(&path, fixture.root.join("held-original")).is_err());
        assert!(fs::write(&path, b"substituted content").is_err());
    }
    payload
        .verify(entry.size_bytes, &entry.sha256)
        .expect("verify held file");
    payload.seal().expect("seal held file");
    fixture
        .store
        .publish_content_object(&pending, &payload)
        .expect("publish held file");
    assert_eq!(
        fs::read(fixture.store.final_object_path(entry)).expect("published bytes"),
        bytes
    );
}

#[test]
fn replacement_commits_new_generation_before_removing_old_object() {
    let fixture = Fixture::new();
    let old_bytes = b"old title bytes";
    let mut old_source = fixture.source("old.gb", old_bytes);
    let old_intent = intent_bytes(old_bytes, 1, "usb", "old", None);
    fixture
        .store
        .install_plain(
            &old_intent,
            &context(&old_intent),
            &mut old_source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("install old");
    let old_entry = fixture.library().entries[0].entry_id.clone();
    let old_path = fixture.object_files()[0].clone();

    let new_bytes = b"replacement title bytes";
    let mut replacement = fixture.source("replacement.gb", new_bytes);
    let replacement_intent = intent_bytes(new_bytes, 2, "usb", "replacement", Some(&old_entry));
    let outcome = fixture
        .store
        .install_plain(
            &replacement_intent,
            &context(&replacement_intent),
            &mut replacement,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("replace entry");
    assert_eq!(outcome.library_generation(), 3);
    assert_eq!(outcome.replaced_entry_id(), Some(old_entry.as_str()));
    assert!(!old_path.exists());
    let library = fixture.library();
    assert_eq!(library.generation, 3);
    assert_eq!(library.entries.len(), 1);
    assert_eq!(library.entries[0].sha256, digest(new_bytes));
    assert_eq!(fixture.object_files().len(), 1);
    assert_eq!(fixture.audit_files().len(), 2);
}

#[test]
fn reuse_revalidates_existing_object_without_copy_or_generation_change() {
    let fixture = Fixture::new();
    let bytes = b"existing duplicate";
    let install = intent_bytes(bytes, 1, "usb", "existing", None);
    let mut source = fixture.source("existing.gb", bytes);
    fixture
        .store
        .install_plain(
            &install,
            &context(&install),
            &mut source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("install existing object");
    let existing_id = fixture.library().entries[0].entry_id.clone();
    let reuse = reuse_intent(bytes, 2, "reuse", &existing_id);
    let changed_mapping = RetroPlainSystemPolicy::new(
        "retro-policy",
        7,
        "gb",
        ".gb",
        "different-core",
        "game-boy-standard",
        4 * 1024 * 1024,
        128,
        32 * 1024 * 1024,
    )
    .expect("same-revision changed mapping");
    let changed_mapping_authority =
        RetroPlainImportContext::authorize(&reuse, INSPECTION_ID, 10_000, false, changed_mapping)
            .expect("authorize same-revision changed mapping");
    assert!(matches!(
        fixture
            .store
            .commit_without_copy(&reuse, &changed_mapping_authority, 1_000),
        Err(RetroImportError::PolicyBindingMismatch)
    ));
    assert_eq!(fixture.audit_files().len(), 1);

    let authority = context(&reuse);
    let outcome = fixture
        .store
        .commit_without_copy(&reuse, &authority, 1_000)
        .expect("reuse existing object");
    assert_eq!(outcome.action(), RetroNoCopyAction::ReuseExisting);
    assert_eq!(outcome.library_generation(), 2);
    assert_eq!(outcome.existing_entry_id(), Some(existing_id.as_str()));
    assert_eq!(fixture.library().generation, 2);
    assert_eq!(fixture.object_files().len(), 1);
    assert_eq!(fixture.audit_files().len(), 2);
    assert!(
        fixture
            .audit_files()
            .iter()
            .map(|path| fs::read_to_string(path).expect("read reuse audit"))
            .any(|audit| audit.contains("\"event\":\"retro-import-reused\""))
    );

    assert_eq!(
        fixture
            .store
            .commit_without_copy(&reuse, &authority, 1_000)
            .expect("idempotent reuse"),
        outcome
    );
    assert_eq!(fixture.audit_files().len(), 2);

    let object = fixture.object_files()[0].clone();
    replace_managed_object_bytes_for_test(&object, &vec![b'x'; bytes.len()]);
    let tampered = reuse_intent(bytes, 2, "reuse-tampered", &existing_id);
    assert!(matches!(
        fixture
            .store
            .commit_without_copy(&tampered, &context(&tampered), 1_000),
        Err(RetroImportError::CommittedContentMismatch)
    ));
    assert_eq!(fixture.library().generation, 2);
    assert_eq!(fixture.audit_files().len(), 2);

    fs::remove_file(object).expect("remove managed object");
    let missing = reuse_intent(bytes, 2, "reuse-missing", &existing_id);
    assert!(
        fixture
            .store
            .commit_without_copy(&missing, &context(&missing), 1_000)
            .is_err()
    );
    assert_eq!(fixture.audit_files().len(), 2);
}

#[test]
fn cancellation_survives_expiry_and_revocation_and_cleans_only_matching_stage() {
    let fixture = Fixture::new();
    let bytes = b"cancel after expiry";
    let cancel = cancel_intent(bytes, 1, "expired-cancel");
    let expired_and_revoked =
        RetroPlainImportContext::authorize(&cancel, INSPECTION_ID, 500, true, policy())
            .expect("authorize cancellation");
    let outcome = fixture
        .store
        .commit_without_copy(&cancel, &expired_and_revoked, 1_000)
        .expect("cancel after expiry and revocation");
    assert_eq!(outcome.action(), RetroNoCopyAction::CancelAndCleanup);
    assert_eq!(outcome.library_generation(), 1);
    assert!(outcome.existing_entry_id().is_none());
    assert_eq!(fixture.library().generation, 1);
    assert!(fixture.object_files().is_empty());
    assert_eq!(fixture.audit_files().len(), 1);
    assert!(
        fs::read_to_string(&fixture.audit_files()[0])
            .expect("read cancellation audit")
            .contains("\"event\":\"retro-import-cancelled\"")
    );

    let other_bytes = b"later unrelated import";
    let other_intent = intent_bytes(other_bytes, 1, "usb", "after-cancel", None);
    let mut other_source = fixture.source("after-cancel.gb", other_bytes);
    fixture
        .store
        .install_plain(
            &other_intent,
            &context(&other_intent),
            &mut other_source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("advance library after cancellation");
    let retried = fixture
        .store
        .commit_without_copy(&cancel, &expired_and_revoked, 2_000)
        .expect("retry cancellation after library advance");
    assert_eq!(retried, outcome);
    assert_eq!(fixture.library().generation, 2);
    assert_eq!(fixture.audit_files().len(), 2);

    let staged = Fixture::new();
    let pending = pending_for(&staged, bytes, 1, "staged-cancel");
    let stage = staged.store.stage_directory(&pending);
    fs::create_dir(&stage).expect("create pending stage");
    fs::write(stage.join("payload"), b"partial").expect("write pending bytes");
    let matching_cancel = cancel_intent(bytes, 1, "staged-cancel");
    let matching_authority =
        RetroPlainImportContext::authorize(&matching_cancel, INSPECTION_ID, 10_000, true, policy())
            .expect("authorize staged cancellation");
    staged
        .store
        .commit_without_copy(&matching_cancel, &matching_authority, 20_000)
        .expect("clean exact pending stage");
    assert!(!stage.exists());
    assert!(staged.pending().is_none());
    assert_eq!(staged.audit_files().len(), 1);
    assert_eq!(staged.library().generation, 1);
}

#[test]
fn cancellation_requires_the_exact_pending_transaction_binding() {
    let fixture = Fixture::new();
    let bytes = b"exact pending cancellation";
    let pending = pending_for(&fixture, bytes, 1, "bound-cancel");
    let stage = fixture.store.stage_directory(&pending);
    fs::create_dir(&stage).expect("create pending stage");
    fs::write(stage.join("payload"), b"partial").expect("write pending bytes");
    let base: Value = serde_json::from_slice(&cancel_intent(bytes, 1, "bound-cancel"))
        .expect("parse base cancellation");
    let mut mismatches = Vec::new();

    let mut source_handle = base.clone();
    source_handle["sourceHandle"] = json!("rih-44444444444444444444444444444444");
    mismatches.push((source_handle, INSPECTION_ID, 10_000, policy()));

    let mut source_hash = base.clone();
    source_hash["sourceSha256"] =
        json!("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    source_hash["audit"]["contentSha256"] =
        json!("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    mismatches.push((source_hash, INSPECTION_ID, 10_000, policy()));

    let mut generation = base.clone();
    generation["expectedLibraryGeneration"] = json!(2);
    mismatches.push((generation, INSPECTION_ID, 10_000, policy()));

    let mut session = base.clone();
    session["audit"]["sessionId"] = json!("ris-44444444444444444444444444444444");
    mismatches.push((session, INSPECTION_ID, 10_000, policy()));

    let mut transport = base.clone();
    transport["audit"]["transport"] = json!("paired-lan");
    mismatches.push((transport, INSPECTION_ID, 10_000, policy()));

    mismatches.push((
        base.clone(),
        "rii-44444444444444444444444444444444",
        10_000,
        policy(),
    ));
    mismatches.push((base.clone(), INSPECTION_ID, 9_999, policy()));
    mismatches.push((
        base,
        INSPECTION_ID,
        10_000,
        RetroPlainSystemPolicy::new(
            "retro-policy",
            7,
            "gb",
            ".gb",
            "different-core",
            "game-boy-standard",
            4 * 1024 * 1024,
            128,
            32 * 1024 * 1024,
        )
        .expect("alternate same-revision policy"),
    ));

    for (value, inspection_id, expires_at_ms, bound_policy) in mismatches {
        let intent = serde_json::to_vec(&value).expect("serialize mismatched cancellation");
        let authority = RetroPlainImportContext::authorize(
            &intent,
            inspection_id,
            expires_at_ms,
            true,
            bound_policy,
        )
        .expect("authorize exact mismatched cancellation");
        assert!(matches!(
            fixture
                .store
                .commit_without_copy(&intent, &authority, 20_000),
            Err(RetroImportError::IntentBindingMismatch)
        ));
        assert_eq!(fixture.pending().as_ref(), Some(&pending));
        assert!(stage.exists());
        assert!(fixture.audit_files().is_empty());
    }

    let matching = cancel_intent(bytes, 1, "bound-cancel");
    let authority =
        RetroPlainImportContext::authorize(&matching, INSPECTION_ID, 10_000, true, policy())
            .expect("authorize matching cancellation");
    fixture
        .store
        .commit_without_copy(&matching, &authority, 20_000)
        .expect("cancel exact pending transaction");
    assert!(fixture.pending().is_none());
    assert!(!stage.exists());
    assert_eq!(fixture.audit_files().len(), 1);
}

#[test]
fn exact_cancel_and_operation_lock_fail_closed() {
    let fixture = Fixture::new();
    let bytes = b"cancel fixture";
    let pending = pending_for(&fixture, bytes, 1, "cancel");
    assert!(matches!(
        fixture.store.cancel_pending("rip-wrong"),
        Err(RetroImportError::PlanMismatch)
    ));
    assert!(
        fixture
            .store
            .cancel_pending(&pending.intent.plan_id)
            .expect("cancel matching")
    );
    assert!(fixture.pending().is_none());

    let published = pending_for(&fixture, b"past cancel point", 1, "published");
    let mut source = fixture.source("published.gb", b"past cancel point");
    fixture
        .store
        .copy_source_to_stage(&published, &mut source)
        .expect("stage published transaction");
    let stage = fixture.store.stage_directory(&published);
    let mut payload =
        super::filesystem::StagedPayloadFile::open(&stage.join("payload")).expect("open stage");
    let scan = RetroImportStore::scan_staged(&published, &mut payload, &mut FakeScanner::clean())
        .expect("scan published transaction");
    write_new_synced_file(
        &stage.join("scan.json"),
        &serialized_bounded(&scan, MAX_SCAN_RECEIPT_BYTES, "scan").expect("scan bytes"),
        "write scan",
    )
    .expect("persist scan");
    fixture
        .store
        .publish_content_object(&published, &payload)
        .expect("publish content");
    drop(payload);
    assert!(matches!(
        fixture.store.cancel_pending(&published.intent.plan_id),
        Err(RetroImportError::RecoveryRequired)
    ));
    assert!(matches!(
        fixture
            .store
            .recover(&mut FakeScanner::clean())
            .expect("finish published transaction"),
        RetroImportRecovery::Completed(_)
    ));

    let _held = fixture
        .store
        .acquire_operation_lock()
        .expect("hold operation lock");
    assert!(matches!(
        fixture.store.recovery_required(),
        Err(RetroImportError::Busy)
    ));
}

#[test]
fn derives_shared_storage_roots_and_exports_only_a_stable_library_snapshot() {
    let fixture = Fixture::new();
    let namespace =
        StorageNamespacePlan::new(fixture.root.join("writable")).expect("plan namespaces");
    let config = RetroImportStoreConfig::from_storage_namespace(&namespace, 4_096);
    assert_eq!(
        config.staging_root,
        fixture
            .root
            .join("writable")
            .join("staging")
            .join("retro-imports")
    );
    assert_eq!(
        config.content_root,
        fixture.root.join("writable").join("retro")
    );
    assert_eq!(config.reserve_bytes, 4_096);

    let snapshot = fixture
        .store
        .current_library_json()
        .expect("read empty library snapshot");
    let document: Value = serde_json::from_slice(&snapshot).expect("parse library snapshot");
    assert_eq!(document["schemaVersion"], 1);
    assert_eq!(document["generation"], 1);
    assert_eq!(document["entries"], json!([]));
    let text = String::from_utf8(snapshot).expect("snapshot is UTF-8");
    assert!(!text.contains(&fixture.root.display().to_string()));
    assert!(!text.contains("staging"));
    assert!(!text.contains("objects"));

    let pending = pending_for(&fixture, b"snapshot barrier", 1, "snapshot");
    assert!(matches!(
        fixture.store.current_library_json(),
        Err(RetroImportError::RecoveryRequired)
    ));
    assert!(
        fixture
            .store
            .cancel_pending(&pending.intent.plan_id)
            .expect("cancel snapshot fixture")
    );
    assert!(fixture.store.current_library_json().is_ok());
}

#[test]
fn derived_retro_transaction_preserves_other_storage_namespaces() {
    let fixture = Fixture::new();
    let namespace =
        StorageNamespacePlan::new(fixture.root.join("isolated-writable")).expect("namespaces");
    let protected_files = protected_namespace_sentinels(&namespace);
    for (path, bytes) in &protected_files {
        fs::create_dir_all(path.parent().expect("protected parent"))
            .expect("create protected namespace");
        fs::write(path, bytes).expect("write protected sentinel");
    }
    let protected_parent_counts = [
        (namespace.root_for(WritableDataClass::SystemMetadata), 1),
        (namespace.root_for(WritableDataClass::ProductionPackages), 2),
        (namespace.root_for(WritableDataClass::DeveloperPackages), 1),
        (namespace.root_for(WritableDataClass::Saves), 3),
        (namespace.root_for(WritableDataClass::Profiles), 1),
        (namespace.root_for(WritableDataClass::Logs), 1),
        (namespace.root_for(WritableDataClass::Cache), 1),
        (namespace.package_staging_root(), 1),
    ];

    let config = RetroImportStoreConfig::from_storage_namespace(&namespace, 1);
    let store = provision_test_store(&config);

    let bytes = b"isolated retro content";
    let intent = intent_bytes(bytes, 1, "usb", "namespace-isolation", None);
    let mut source = fixture.source("namespace-isolation.gb", bytes);
    store
        .install_plain(
            &intent,
            &context(&intent),
            &mut source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("install into derived retro namespace");

    for (path, expected) in protected_files {
        assert_eq!(
            fs::read(&path).expect("read protected sentinel"),
            expected,
            "changed protected sentinel {}",
            path.display()
        );
    }
    for (parent, expected_count) in protected_parent_counts {
        assert_eq!(
            fs::read_dir(parent)
                .expect("read protected namespace")
                .count(),
            expected_count
        );
    }
    assert_eq!(
        store
            .current_library()
            .expect("read derived library")
            .generation,
        2
    );
    assert_eq!(
        fs::read_dir(config.content_root.join(RETRO_CONTENT_OBJECTS_DIRECTORY))
            .expect("read derived objects")
            .count(),
        1
    );
}

#[test]
fn reported_free_space_refusal_precedes_import_mutation() {
    const TEST_RESERVE_MARGIN_BYTES: u64 = 64 * 1024 * 1024 * 1024;

    let fixture = Fixture::new();
    let reported_before =
        fs4::available_space(&fixture.staging).expect("read test filesystem capacity");
    let reserve_bytes = reported_before
        .checked_add(TEST_RESERVE_MARGIN_BYTES)
        .expect("test filesystem capacity fits u64");
    let store = RetroImportStore::open(&RetroImportStoreConfig {
        staging_root: fixture.staging.clone(),
        content_root: fixture.content.clone(),
        reserve_bytes,
    })
    .expect("reopen store with unavailable reserve");
    let bytes = b"capacity refusal";
    let intent = intent_bytes(bytes, 1, "usb", "insufficient-capacity", None);
    let mut source = fixture.source("insufficient-capacity.gb", bytes);

    let error = store
        .install_plain(
            &intent,
            &context(&intent),
            &mut source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect_err("reported free-space shortfall must reject import");
    let RetroImportError::InsufficientCapacity {
        required_bytes,
        available_bytes,
    } = error
    else {
        panic!("expected insufficient-capacity error");
    };
    assert!(required_bytes > available_bytes);
    assert!(fixture.pending().is_none());
    assert!(fixture.object_files().is_empty());
    assert!(fixture.audit_files().is_empty());
    assert_eq!(fixture.library().generation, 1);
    assert!(
        fs::read_dir(&fixture.staging)
            .expect("read staging root")
            .all(|entry| entry.expect("read staging entry").file_name() == RETRO_IMPORT_LOCK_FILE)
    );
}

#[test]
fn bounds_intent_capacity_library_and_filesystem_shapes() {
    let fixture = Fixture::new();
    let oversized_intent =
        usize::try_from(MAX_COMMIT_INTENT_BYTES + 1).expect("intent bound fits usize");
    assert!(matches!(
        parse_commit_intent(&vec![b' '; oversized_intent]),
        Err(RetroImportError::IntentTooLarge { .. })
    ));

    let huge_reserve = Fixture::with_reserve(u64::MAX);
    let bytes = b"capacity";
    let mut source = huge_reserve.source("capacity.gb", bytes);
    let intent = intent_bytes(bytes, 1, "usb", "capacity", None);
    assert!(matches!(
        huge_reserve.store.install_plain(
            &intent,
            &context(&intent),
            &mut source,
            &mut FakeScanner::clean(),
            1_000,
        ),
        Err(RetroImportError::CapacityOverflow)
    ));
    assert!(huge_reserve.pending().is_none());

    let library_path = fixture
        .content
        .join(RETRO_LIBRARY_DIRECTORY)
        .join("unexpected.json");
    fs::write(&library_path, b"{}").expect("write unexpected state");
    assert!(matches!(
        RetroImportStore::open(&RetroImportStoreConfig {
            staging_root: fixture.staging.clone(),
            content_root: fixture.content.clone(),
            reserve_bytes: 1,
        }),
        Err(RetroImportError::UnsafePath(_))
    ));

    let gap = Fixture::new();
    let generation_three = RetroInstalledLibrary {
        schema_version: SCHEMA_VERSION,
        generation: 3,
        entries: Vec::new(),
    };
    fs::write(
        gap.content
            .join(RETRO_LIBRARY_DIRECTORY)
            .join("generation-00000000000000000003.json"),
        serde_json::to_vec(&generation_three).expect("serialize gap"),
    )
    .expect("write gapped generation");
    assert!(matches!(
        RetroImportStore::open(&RetroImportStoreConfig {
            staging_root: gap.staging.clone(),
            content_root: gap.content.clone(),
            reserve_bytes: 1,
        }),
        Err(RetroImportError::InvalidLibraryHistory)
    ));
}

fn provision_policy() -> RetroOperatorProvisionPolicy {
    RetroOperatorProvisionPolicy::new(
        "retro-policy",
        7,
        "gb",
        vec![".gb".to_owned(), ".gbc".to_owned()],
        "gambatte",
        "game-boy-standard",
        4 * 1024 * 1024,
        128,
        32 * 1024 * 1024,
    )
    .expect("valid provisioning policy")
}

fn payload_bytes(value: usize) -> u64 {
    u64::try_from(value).expect("fixture size fits u64")
}

fn staged_manifest(system: &str, files: &[(&str, &[u8], &str)]) -> Value {
    let mut entries = Vec::with_capacity(files.len());
    let mut total_bytes = 0_u64;
    for (title, bytes, extension) in files {
        let sha256 = digest(bytes);
        entries.push(json!({
            "entryId": format!("content-{sha256}"),
            "systemId": system,
            "sha256": sha256,
            "sizeBytes": bytes.len(),
            "extension": extension,
            "title": title,
            "coreId": "gambatte",
            "controllerProfile": "game-boy-standard",
            "objectName": format!("{system}-content-{sha256}{extension}"),
            "container": "plain"
        }));
        total_bytes += payload_bytes(bytes.len());
    }
    json!({
        "schemaVersion": 1,
        "documentType": "vcg-operator-staged-retro-content",
        "systemId": system,
        "coreId": "gambatte",
        "controllerProfile": "game-boy-standard",
        "provenance": "operator-staged-local-collection",
        "sourceLabel": "operator collection",
        "entryCount": files.len(),
        "totalBytes": total_bytes,
        "entries": entries
    })
}

fn staged_object_name(system: &str, bytes: &[u8], extension: &str) -> String {
    format!("{system}-content-{}{extension}", digest(bytes))
}

fn write_staged_payload(
    root: &Path,
    system: &str,
    files: &[(&str, &[u8], &str)],
    manifest: &Value,
) {
    let objects = root.join(RETRO_CONTENT_OBJECTS_DIRECTORY);
    fs::create_dir_all(&objects).expect("create payload objects");
    for (_, bytes, extension) in files {
        fs::write(
            objects.join(staged_object_name(system, bytes, extension)),
            bytes,
        )
        .expect("write payload object");
    }
    fs::write(
        root.join(RETRO_STAGED_MANIFEST_FILE),
        serde_json::to_vec(manifest).expect("serialize staged manifest"),
    )
    .expect("write staged manifest");
}

fn stage_payload(fixture: &Fixture, name: &str, files: &[(&str, &[u8], &str)]) -> PathBuf {
    let root = fixture.root.join(name);
    write_staged_payload(&root, "gb", files, &staged_manifest("gb", files));
    root
}

fn staging_holds_only_the_lock(fixture: &Fixture) -> bool {
    fs::read_dir(&fixture.staging)
        .expect("read staging root")
        .all(|entry| entry.expect("read staging entry").file_name() == RETRO_IMPORT_LOCK_FILE)
}

#[test]
fn operator_provisioned_provenance_admits_no_session_or_unknown_fields() {
    let bare = json!({ "transport": RETRO_OPERATOR_PROVISIONED_TRANSPORT });
    let accepted: RetroInstalledProvenance =
        serde_json::from_value(bare).expect("bare operator provenance parses");
    assert_eq!(accepted, RetroInstalledProvenance::operator_provisioned());
    assert_eq!(
        serde_json::to_string(&accepted).expect("serialize operator provenance"),
        format!("{{\"transport\":\"{RETRO_OPERATOR_PROVISIONED_TRANSPORT}\"}}")
    );

    for value in [
        json!({
            "transport": RETRO_OPERATOR_PROVISIONED_TRANSPORT,
            "importSessionId": SESSION_ID
        }),
        json!({
            "transport": RETRO_OPERATOR_PROVISIONED_TRANSPORT,
            "entitlementStatementVersion": "vcg-user-entitled-content-v1"
        }),
        json!({
            "transport": RETRO_OPERATOR_PROVISIONED_TRANSPORT,
            "importedAtMs": 500
        }),
        json!({
            "transport": "usb",
            "importSessionId": SESSION_ID,
            "entitlementStatementVersion": "vcg-user-entitled-content-v1",
            "importedAtMs": 500,
            "sourcePath": "E:\\roms\\fixture.gb"
        }),
        json!({ "transport": "usb" }),
    ] {
        assert!(serde_json::from_value::<RetroInstalledProvenance>(value).is_err());
    }
}

#[test]
#[allow(clippy::too_many_lines)]
fn operator_provisioning_commits_entries_without_session_scan_or_entitlement_evidence() {
    let fixture = Fixture::new();
    let files: Vec<(&str, &[u8], &str)> = vec![
        ("Operator Fixture One", b"operator staged one", ".gb"),
        ("Operator Fixture Two", b"operator staged two", ".gbc"),
    ];
    let payload = stage_payload(&fixture, "payload", &files);
    let policy = provision_policy();

    let plan = fixture
        .store
        .plan_operator_content(&payload, &policy)
        .expect("plan operator payload");
    assert_eq!(plan.system_id(), "gb");
    assert_eq!(plan.payload_entries(), 2);
    assert_eq!(plan.new_entries(), 2);
    assert_eq!(plan.already_installed_entries(), 0);
    assert_eq!(plan.archive_extracted_entries(), 0);
    assert_eq!(plan.library_generation(), 1);
    assert_eq!(plan.next_library_generation(), 2);
    assert_eq!(fixture.library().generation, 1);
    assert!(fixture.object_files().is_empty());
    assert!(staging_holds_only_the_lock(&fixture));

    let outcome = fixture
        .store
        .provision_operator_content(&payload, &policy)
        .expect("provision operator payload");
    assert_eq!(outcome.provisioning_id(), plan.provisioning_id());
    assert!(outcome.provisioning_id().starts_with(PROVISION_ID_PREFIX));
    assert_eq!(outcome.library_generation(), 2);
    assert_eq!(outcome.committed_entries(), 2);
    assert_eq!(outcome.already_installed_entries(), 0);
    assert_eq!(outcome.verified_objects(), 2);
    assert_eq!(
        outcome.verified_bytes(),
        payload_bytes(b"operator staged one".len() + b"operator staged two".len())
    );

    let library = fixture.library();
    assert_eq!(library.generation, 2);
    assert_eq!(library.entries.len(), 2);
    for entry in &library.entries {
        assert_eq!(
            entry.provenance,
            RetroInstalledProvenance::operator_provisioned()
        );
        assert!(entry.provenance.session().is_none());
    }

    let snapshot = String::from_utf8(
        fixture
            .store
            .current_library_json()
            .expect("library snapshot"),
    )
    .expect("snapshot is UTF-8");
    assert!(snapshot.contains(&format!(
        "\"transport\":\"{RETRO_OPERATOR_PROVISIONED_TRANSPORT}\""
    )));
    assert!(!snapshot.contains("importSessionId"));
    assert!(!snapshot.contains("entitlementStatementVersion"));
    assert!(!snapshot.contains("importedAtMs"));
    assert!(!snapshot.contains("ris-"));
    assert!(!snapshot.contains("operator collection"));
    assert!(!snapshot.contains(&fixture.root.display().to_string()));

    let objects = fixture.object_files();
    assert_eq!(objects.len(), 2);
    assert_eq!(
        fs::read(&objects[0]).expect("read provisioned object"),
        b"operator staged one"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&objects[0])
                .expect("inspect provisioned permissions")
                .permissions()
                .mode()
                & 0o777,
            0o400
        );
    }

    let audits = fixture.audit_files();
    assert_eq!(audits.len(), 1);
    let audit_text = fs::read_to_string(&audits[0]).expect("read provisioning audit");
    assert!(audit_text.contains("\"event\":\"retro-operator-provisioned\""));
    assert!(!audit_text.contains("\"scan\""));
    assert!(!audit_text.contains("sessionId"));
    assert!(!audit_text.contains("entitlement"));
    assert!(!audit_text.contains("operator collection"));
    let published = fs::read(
        fixture
            .content
            .join(RETRO_LIBRARY_DIRECTORY)
            .join(library_generation_filename(2)),
    )
    .expect("read published generation");
    assert!(audit_text.contains(&digest(&published)));

    let again = fixture
        .store
        .provision_operator_content(&payload, &policy)
        .expect("reprovision the same payload");
    assert_eq!(again.library_generation(), 2);
    assert_eq!(again.committed_entries(), 0);
    assert_eq!(again.already_installed_entries(), 2);
    assert_eq!(again.verified_objects(), 2);
    assert_eq!(fixture.library(), library);
    assert_eq!(fixture.audit_files().len(), 1);
    assert_eq!(fixture.object_files().len(), 2);
    assert!(!fixture.store.recovery_required().expect("state query"));
    assert!(staging_holds_only_the_lock(&fixture));
}

#[test]
fn staged_digest_mismatch_fails_closed_and_a_corrected_payload_converges() {
    let fixture = Fixture::new();
    let files: Vec<(&str, &[u8], &str)> = vec![
        ("Honest", b"honest staged bytes", ".gb"),
        ("Tampered", b"declared staged bytes", ".gb"),
    ];
    let payload = stage_payload(&fixture, "tampered-payload", &files);
    let tampered = payload
        .join(RETRO_CONTENT_OBJECTS_DIRECTORY)
        .join(staged_object_name("gb", b"declared staged bytes", ".gb"));
    fs::write(&tampered, b"substituted bytes").expect("substitute staged object");
    let policy = provision_policy();

    let planned = fixture
        .store
        .plan_operator_content(&payload, &policy)
        .expect_err("planning must reject a substituted object");
    assert!(
        matches!(planned, RetroImportError::StagedContentMismatch(ref object)
            if *object == staged_object_name("gb", b"declared staged bytes", ".gb"))
    );

    let committed = fixture
        .store
        .provision_operator_content(&payload, &policy)
        .expect_err("provisioning must reject a substituted object");
    assert!(matches!(
        committed,
        RetroImportError::StagedContentMismatch(_)
    ));
    assert_eq!(fixture.library().generation, 1);
    assert!(fixture.audit_files().is_empty());
    assert!(staging_holds_only_the_lock(&fixture));

    let objects = fixture.object_files();
    assert_eq!(objects.len(), 1);
    assert_eq!(
        fs::read(&objects[0]).expect("read published object"),
        b"honest staged bytes"
    );

    fs::write(&tampered, b"declared staged bytes").expect("restore staged object");
    let outcome = fixture
        .store
        .provision_operator_content(&payload, &policy)
        .expect("corrected payload commits");
    assert_eq!(outcome.library_generation(), 2);
    assert_eq!(outcome.committed_entries(), 2);
    assert_eq!(fixture.object_files().len(), 2);
    assert_eq!(fixture.library().entries.len(), 2);
    assert_eq!(fixture.audit_files().len(), 1);
    assert!(staging_holds_only_the_lock(&fixture));
}

#[test]
fn terminal_intents_still_refuse_operator_provisioned_and_session_shaped_records() {
    let fixture = Fixture::new();
    let bytes = b"session bound content";
    let valid = intent_bytes(bytes, 1, "usb", "session-bound", None);
    let authority = context(&valid);
    let base: Value = serde_json::from_slice(&valid).expect("parse valid intent");

    let mut audit_transport = base.clone();
    audit_transport["audit"]["transport"] = json!(RETRO_OPERATOR_PROVISIONED_TRANSPORT);
    let mut entry_transport = base.clone();
    entry_transport["installEntry"]["provenance"]["transport"] =
        json!(RETRO_OPERATOR_PROVISIONED_TRANSPORT);
    let mut dropped_session = base.clone();
    dropped_session["installEntry"]["provenance"] =
        json!({ "transport": RETRO_OPERATOR_PROVISIONED_TRANSPORT });
    let mut unknown_provenance = base.clone();
    unknown_provenance["installEntry"]["provenance"]["sourcePath"] = json!("E:\\roms\\fixture.gb");
    let mut fabricated_session = base;
    fabricated_session["installEntry"]["provenance"]["importSessionId"] =
        json!("ris-44444444444444444444444444444444");

    for value in [
        audit_transport,
        entry_transport,
        dropped_session,
        unknown_provenance,
        fabricated_session,
    ] {
        let intent = serde_json::to_vec(&value).expect("serialize refused intent");
        assert!(parse_commit_intent(&intent).is_err());
        assert!(
            RetroPlainImportContext::authorize(&intent, INSPECTION_ID, 10_000, false, policy(),)
                .is_err()
        );
        let mut source = fixture.source(
            &format!(
                "refused-{}.gb",
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
            ),
            bytes,
        );
        assert!(
            fixture
                .store
                .install_plain(
                    &intent,
                    &authority,
                    &mut source,
                    &mut FakeScanner::clean(),
                    1_000,
                )
                .is_err()
        );
    }
    assert!(fixture.pending().is_none());
    assert_eq!(fixture.library().generation, 1);
    assert!(fixture.object_files().is_empty());
}

#[test]
#[allow(clippy::too_many_lines)]
fn staged_manifests_must_agree_with_policy_entries_and_derived_object_names() {
    let fixture = Fixture::new();
    let files: Vec<(&str, &[u8], &str)> = vec![("Strict", b"strict staged bytes", ".gb")];
    let sha256 = digest(b"strict staged bytes");
    let valid = staged_manifest("gb", &files);
    let policy = provision_policy();

    let mut document_type = valid.clone();
    document_type["documentType"] = json!("vcg-installed-library");
    let mut provenance = valid.clone();
    provenance["provenance"] = json!("usb");
    let mut schema = valid.clone();
    schema["schemaVersion"] = json!(2);
    let mut system = valid.clone();
    system["systemId"] = json!("snes");
    let mut core = valid.clone();
    core["coreId"] = json!("different-core");
    let mut entry_count = valid.clone();
    entry_count["entryCount"] = json!(2);
    let mut total_bytes = valid.clone();
    total_bytes["totalBytes"] = json!(1);
    let mut object_name = valid.clone();
    object_name["entries"][0]["objectName"] = json!("../../escape.gb");
    let mut entry_id = valid.clone();
    entry_id["entries"][0]["entryId"] = json!(format!("content-{}", "f".repeat(64)));
    let mut extension = valid.clone();
    extension["entries"][0]["extension"] = json!(".sfc");
    extension["entries"][0]["objectName"] = json!(format!("gb-content-{sha256}.sfc"));
    let mut oversized = valid.clone();
    oversized["entries"][0]["sizeBytes"] = json!(8 * 1024 * 1024);
    let mut unknown = valid.clone();
    unknown["entries"][0]["sourcePath"] = json!("E:\\roms\\strict.gb");
    let mut container = valid.clone();
    container["entries"][0]["container"] = json!("rar");
    let mut duplicated = valid.clone();
    duplicated["entries"] = json!([valid["entries"][0], valid["entries"][0]]);
    duplicated["entryCount"] = json!(2);
    duplicated["totalBytes"] = json!(2 * payload_bytes(b"strict staged bytes".len()));

    for (name, manifest) in [
        ("document-type", document_type),
        ("provenance", provenance),
        ("schema", schema),
        ("system", system),
        ("core", core),
        ("entry-count", entry_count),
        ("total-bytes", total_bytes),
        ("object-name", object_name),
        ("entry-id", entry_id),
        ("extension", extension),
        ("oversized", oversized),
        ("unknown-field", unknown),
        ("container", container),
        ("duplicate-entry", duplicated),
    ] {
        let root = fixture.root.join(format!("payload-{name}"));
        write_staged_payload(&root, "gb", &files, &manifest);
        assert!(
            fixture.store.plan_operator_content(&root, &policy).is_err(),
            "planning accepted an invalid manifest: {name}"
        );
        assert!(
            fixture
                .store
                .provision_operator_content(&root, &policy)
                .is_err(),
            "provisioning accepted an invalid manifest: {name}"
        );
        assert_eq!(fixture.library().generation, 1);
        assert!(fixture.object_files().is_empty());
        assert!(fixture.audit_files().is_empty());
    }

    let missing_objects = fixture.root.join("payload-missing-objects");
    fs::create_dir_all(&missing_objects).expect("create payload root");
    fs::write(
        missing_objects.join(RETRO_STAGED_MANIFEST_FILE),
        serde_json::to_vec(&valid).expect("serialize manifest"),
    )
    .expect("write manifest");
    assert!(
        fixture
            .store
            .plan_operator_content(&missing_objects, &policy)
            .is_err()
    );

    let accepted = stage_payload(&fixture, "payload-accepted", &files);
    assert_eq!(
        fixture
            .store
            .provision_operator_content(&accepted, &policy)
            .expect("valid payload commits")
            .committed_entries(),
        1
    );
}

#[test]
fn provisioning_policies_require_a_sorted_bounded_extension_set() {
    for extensions in [
        Vec::new(),
        vec![".gbc".to_owned(), ".gb".to_owned()],
        vec![".gb".to_owned(), ".gb".to_owned()],
        vec!["gb".to_owned()],
        (0..=MAX_SYSTEM_EXTENSIONS)
            .map(|index| format!(".e{index:03}"))
            .collect(),
    ] {
        assert!(
            RetroOperatorProvisionPolicy::new(
                "retro-policy",
                7,
                "gb",
                extensions,
                "gambatte",
                "game-boy-standard",
                4 * 1024 * 1024,
                128,
                32 * 1024 * 1024,
            )
            .is_err()
        );
    }
    assert_eq!(provision_policy().system_id(), "gb");
}

#[test]
fn provisioning_refuses_a_hash_installed_under_another_system_and_pending_recovery() {
    let fixture = Fixture::new();
    let bytes = b"shared content bytes";
    let install = intent_bytes(bytes, 1, "usb", "cross-system", None);
    let mut source = fixture.source("cross-system.gb", bytes);
    fixture
        .store
        .install_plain(
            &install,
            &context(&install),
            &mut source,
            &mut FakeScanner::clean(),
            1_000,
        )
        .expect("install through the session transport");

    let files: Vec<(&str, &[u8], &str)> = vec![("Shared", bytes, ".gbc")];
    let root = fixture.root.join("cross-system-payload");
    write_staged_payload(&root, "gbc", &files, &staged_manifest("gbc", &files));
    let other_system = RetroOperatorProvisionPolicy::new(
        "retro-policy",
        7,
        "gbc",
        vec![".gbc".to_owned()],
        "gambatte",
        "game-boy-standard",
        4 * 1024 * 1024,
        128,
        32 * 1024 * 1024,
    )
    .expect("other system policy");
    assert!(matches!(
        fixture.store.plan_operator_content(&root, &other_system),
        Err(RetroImportError::StagedSystemConflict(_))
    ));
    assert!(matches!(
        fixture
            .store
            .provision_operator_content(&root, &other_system),
        Err(RetroImportError::StagedSystemConflict(_))
    ));
    assert_eq!(fixture.library().generation, 2);
    assert_eq!(fixture.object_files().len(), 1);

    let pending_fixture = Fixture::new();
    let blocked: Vec<(&str, &[u8], &str)> = vec![("Blocked", b"blocked staged bytes", ".gb")];
    let staged = stage_payload(&pending_fixture, "pending-payload", &blocked);
    let _pending = pending_for(&pending_fixture, b"blocking import", 1, "provision-blocked");
    assert!(matches!(
        pending_fixture
            .store
            .plan_operator_content(&staged, &provision_policy()),
        Err(RetroImportError::RecoveryRequired)
    ));
    assert!(matches!(
        pending_fixture
            .store
            .provision_operator_content(&staged, &provision_policy()),
        Err(RetroImportError::RecoveryRequired)
    ));
    assert!(pending_fixture.object_files().is_empty());
}

#[test]
fn provisioning_resumes_published_objects_and_refuses_a_changed_audit() {
    let fixture = Fixture::new();
    let files: Vec<(&str, &[u8], &str)> = vec![("Resumed", b"resumed staged bytes", ".gb")];
    let payload = stage_payload(&fixture, "resume-payload", &files);
    let policy = provision_policy();
    let roots = staged_payload_roots(&payload).expect("payload roots");
    let (staged, _) = read_staged_payload(&roots.manifest, StagedPolicyView::Exact(&policy))
        .expect("read staged payload");

    fixture
        .store
        .publish_provisioned_object(&roots.objects, &staged.objects[0])
        .expect("publish object before the generation");
    assert_eq!(fixture.object_files().len(), 1);
    assert_eq!(fixture.library().generation, 1);

    let outcome = fixture
        .store
        .provision_operator_content(&payload, &policy)
        .expect("provisioning adopts the published object");
    assert_eq!(outcome.library_generation(), 2);
    assert_eq!(outcome.committed_entries(), 1);
    assert_eq!(fixture.object_files().len(), 1);

    let changed_mapping = RetroOperatorProvisionPolicy::new(
        "retro-policy",
        7,
        "gb",
        vec![".gb".to_owned(), ".gbc".to_owned()],
        "different-core",
        "game-boy-standard",
        4 * 1024 * 1024,
        128,
        32 * 1024 * 1024,
    )
    .expect("same-revision changed mapping");
    assert!(matches!(
        fixture
            .store
            .provision_operator_content(&payload, &changed_mapping),
        Err(RetroImportError::PolicyBindingMismatch)
    ));

    let tampered = fixture.object_files()[0].clone();
    replace_managed_object_bytes_for_test(&tampered, b"replaced managed bytes");
    assert!(matches!(
        fixture.store.provision_operator_content(&payload, &policy),
        Err(RetroImportError::CommittedContentMismatch)
    ));
    assert_eq!(fixture.library().generation, 2);
    assert_eq!(fixture.audit_files().len(), 1);
}

#[test]
fn provisioning_replay_requires_the_original_audit_bindings() {
    let fixture = Fixture::new();
    let files: Vec<(&str, &[u8], &str)> = vec![("Replay", b"replay bytes", ".gb")];
    let payload = stage_payload(&fixture, "replay-payload", &files);
    let policy = provision_policy();
    fixture
        .store
        .provision_operator_content(&payload, &policy)
        .expect("initial install");
    let audit_path = fixture.audit_files()[0].clone();
    let original = fs::read(&audit_path).expect("read audit");
    let audit: Value = serde_json::from_slice(&original).expect("parse audit");
    for (field, replacement) in [
        ("policyId", json!("other-policy")),
        ("policyRevision", json!(8)),
        ("systemId", json!("gbc")),
        ("stagedManifestSha256", json!("f".repeat(64))),
    ] {
        let mut changed = audit.clone();
        changed[field] = replacement;
        fs::write(
            &audit_path,
            serde_json::to_vec(&changed).expect("serialize audit"),
        )
        .expect("change audit");
        assert!(matches!(
            fixture.store.provision_operator_content(&payload, &policy),
            Err(RetroImportError::AuditMismatch)
        ));
    }
    fs::write(&audit_path, original).expect("restore audit");
    assert!(
        fixture
            .store
            .provision_operator_content(&payload, &policy)
            .is_ok()
    );
    assert_eq!(fixture.library().generation, 2);
}

#[test]
fn provisioning_refuses_a_reported_free_space_shortfall_before_mutation() {
    const TEST_RESERVE_MARGIN_BYTES: u64 = 64 * 1024 * 1024 * 1024;

    let fixture = Fixture::new();
    let files: Vec<(&str, &[u8], &str)> = vec![("Capacity", b"capacity staged bytes", ".gb")];
    let payload = stage_payload(&fixture, "capacity-payload", &files);
    let reserve_bytes = fs4::available_space(&fixture.staging)
        .expect("read test filesystem capacity")
        .checked_add(TEST_RESERVE_MARGIN_BYTES)
        .expect("test filesystem capacity fits u64");
    let store = RetroImportStore::open(&RetroImportStoreConfig {
        staging_root: fixture.staging.clone(),
        content_root: fixture.content.clone(),
        reserve_bytes,
    })
    .expect("reopen store with unavailable reserve");

    assert!(matches!(
        store.provision_operator_content(&payload, &provision_policy()),
        Err(RetroImportError::InsufficientCapacity { .. })
    ));
    assert_eq!(fixture.library().generation, 1);
    assert!(fixture.object_files().is_empty());
    assert!(fixture.audit_files().is_empty());
    assert!(staging_holds_only_the_lock(&fixture));
}

#[cfg(unix)]
#[test]
fn rejects_symlinked_roots_and_staging_payloads() {
    use std::os::unix::fs::symlink;

    let fixture = Fixture::new();
    let linked_content = fixture.root.join("linked-content");
    symlink(&fixture.content, &linked_content).expect("link content root");
    assert!(
        RetroImportStore::open(&RetroImportStoreConfig {
            staging_root: fixture.staging.clone(),
            content_root: linked_content,
            reserve_bytes: 1,
        })
        .is_err()
    );

    let bytes = b"symlink stage";
    let pending = pending_for(&fixture, bytes, 1, "symlink");
    let stage = fixture.store.stage_directory(&pending);
    fs::create_dir(&stage).expect("create stage");
    let outside = fixture.root.join("outside");
    fs::write(&outside, bytes).expect("write outside");
    symlink(&outside, stage.join("payload")).expect("link payload");
    assert!(fixture.store.recover(&mut FakeScanner::clean()).is_err());
    assert!(outside.exists());
    assert!(fixture.pending().is_some());
}

const POLICY_TARGET: &str = "test-target";
const POLICY_TRUSTED_TIME: u64 = 2_000_000_000;

/// One accepted update root that delegates `retro-system-policy` and
/// `installed-catalog` to two distinct keys, so a policy signed by the
/// wrong role can be exercised.
fn update_trust_fixture() -> (TrustedUpdatePolicy, SigningKey, SigningKey) {
    let root_key = SigningKey::from_bytes(&[11; 32]);
    let policy_key = SigningKey::from_bytes(&[12; 32]);
    let catalog_key = SigningKey::from_bytes(&[13; 32]);
    let root_bytes = format!(
        r#"{{"schemaVersion":1,"generation":1,"expiresUnixSeconds":{},"rootThreshold":1,"rootKeys":[{{"keyId":"root-a","publicKey":"{}"}}],"roles":[{{"channel":"stable","artifact":"installed-catalog","target":"{POLICY_TARGET}","threshold":1,"keys":[{{"keyId":"catalog-a","publicKey":"{}"}}]}},{{"channel":"stable","artifact":"retro-system-policy","target":"{POLICY_TARGET}","threshold":1,"keys":[{{"keyId":"retro-policy-a","publicKey":"{}"}}]}}]}}"#,
        POLICY_TRUSTED_TIME + 100,
        encode_hex(root_key.verifying_key().as_bytes()),
        encode_hex(catalog_key.verifying_key().as_bytes()),
        encode_hex(policy_key.verifying_key().as_bytes())
    )
    .into_bytes();
    let root_signatures = DetachedUpdateSignatures::new([DetachedUpdateSignature::from_hex(
        "root-a",
        &encode_hex(&root_key.sign(&root_signing_message(&root_bytes)).to_bytes()),
    )
    .expect("root signature")])
    .expect("root signature set");
    let anchors = RootTrustAnchorSet::new(
        1,
        [
            RootTrustAnchor::new("root-a", *root_key.verifying_key().as_bytes())
                .expect("root anchor"),
        ],
    )
    .expect("anchor set");
    let root = TrustedUpdateRoot::bootstrap(
        &root_bytes,
        &root_signatures,
        &anchors,
        1,
        POLICY_TRUSTED_TIME,
    )
    .expect("bootstrap update root");
    (
        TrustedUpdatePolicy::new(root, "stable", POLICY_TRUSTED_TIME).expect("update policy"),
        policy_key,
        catalog_key,
    )
}

fn signed_policy_signatures(
    key: &SigningKey,
    key_id: &str,
    policy_bytes: &[u8],
) -> DetachedUpdateSignatures {
    DetachedUpdateSignatures::new([DetachedUpdateSignature::from_hex(
        key_id,
        &encode_hex(
            &key.sign(&artifact_signing_message(
                UpdateArtifactKind::RetroSystemPolicy,
                policy_bytes,
            ))
            .to_bytes(),
        ),
    )
    .expect("policy signature")])
    .expect("policy signature set")
}

fn game_boy_system(system_id: &str, extensions: &Value) -> Value {
    json!({
        "systemId": system_id,
        "extensions": extensions,
        "coreId": "gambatte",
        "controllerProfile": "game-boy-standard",
        "maxContentBytes": 4 * 1024 * 1024
    })
}

fn policy_document(systems: &Value) -> Value {
    json!({
        "schemaVersion": 1,
        "policyId": "retro-policy",
        "policyRevision": 7,
        "target": POLICY_TARGET,
        "maxLibraryEntries": 128,
        "maxLibraryBytes": 32 * 1024 * 1024,
        "systems": systems
    })
}

fn load_signed_policy(
    update_policy: &TrustedUpdatePolicy,
    key: &SigningKey,
    key_id: &str,
    document: &Value,
) -> Result<RetroSignedSystemPolicy, RetroImportError> {
    let bytes = serde_json::to_vec(document).expect("serialize signed policy");
    let signatures = signed_policy_signatures(key, key_id, &bytes);
    RetroSignedSystemPolicy::load_with_update_role(
        &bytes,
        &signatures,
        update_policy,
        POLICY_TARGET,
    )
}

#[test]
fn one_signed_policy_provisions_every_system_it_binds() {
    let fixture = Fixture::new();
    let (update_policy, policy_key, _) = update_trust_fixture();
    let document = policy_document(&json!([
        game_boy_system("gb", &json!([".gb"])),
        game_boy_system("gbc", &json!([".gbc"]))
    ]));
    let policy = load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &document)
        .expect("signed policy loads");
    assert_eq!(policy.policy_id(), "retro-policy");
    assert_eq!(policy.policy_revision(), 7);
    assert_eq!(policy.target(), POLICY_TARGET);
    assert_eq!(policy.system_count(), 2);
    assert_eq!(
        policy.update_authority().artifact(),
        UpdateArtifactKind::RetroSystemPolicy
    );
    assert_eq!(policy.update_authority().channel(), "stable");
    assert_eq!(policy.system("gb").expect("bound system").system_id(), "gb");

    let color_files: Vec<(&str, &[u8], &str)> = vec![("Color Fixture", b"color bytes", ".gbc")];
    let color = fixture.root.join("payload-gbc");
    write_staged_payload(
        &color,
        "gbc",
        &color_files,
        &staged_manifest("gbc", &color_files),
    );
    let mono_files: Vec<(&str, &[u8], &str)> = vec![("Mono Fixture", b"mono bytes", ".gb")];
    let mono = stage_payload(&fixture, "payload-gb", &mono_files);

    let plan = fixture
        .store
        .plan_operator_content_with_signed_policy(&mono, &policy)
        .expect("plan under the signed policy");
    assert_eq!(plan.system_id(), "gb");
    assert_eq!(plan.new_entries(), 1);
    assert_eq!(fixture.library().generation, 1);

    assert_eq!(
        fixture
            .store
            .provision_operator_content_with_signed_policy(&mono, &policy)
            .expect("provision the plain system")
            .library_generation(),
        2
    );
    assert_eq!(
        fixture
            .store
            .provision_operator_content_with_signed_policy(&color, &policy)
            .expect("provision the second system without re-signing")
            .library_generation(),
        3
    );
    let library = fixture.library();
    assert_eq!(library.entries.len(), 2);
    assert!(library.entries.iter().any(|entry| entry.system_id == "gb"));
    assert!(library.entries.iter().any(|entry| entry.system_id == "gbc"));
    for entry in &library.entries {
        assert_eq!(
            entry.provenance,
            RetroInstalledProvenance::operator_provisioned()
        );
    }

    let audit = fixture.audit_files();
    assert_eq!(audit.len(), 2);
    let record = fs::read_to_string(&audit[0]).expect("read audit record");
    assert!(record.contains("\"policyId\":\"retro-policy\""));
    assert!(record.contains("\"policyRevision\":7"));
}

#[test]
fn signed_policies_fail_closed_before_any_mutation() {
    let fixture = Fixture::new();
    let (update_policy, policy_key, catalog_key) = update_trust_fixture();
    let document = policy_document(&json!([game_boy_system("gb", &json!([".gb", ".gbc"]))]));
    let bytes = serde_json::to_vec(&document).expect("serialize signed policy");

    let wrong_role = RetroSignedSystemPolicy::load_with_update_role(
        &bytes,
        &signed_policy_signatures(&catalog_key, "catalog-a", &bytes),
        &update_policy,
        POLICY_TARGET,
    );
    assert!(matches!(
        wrong_role,
        Err(RetroImportError::PolicyAuthority(_))
    ));
    assert!(
        wrong_role
            .expect_err("wrong role is refused")
            .to_string()
            .contains("update authority")
    );

    let unknown_key = SigningKey::from_bytes(&[99; 32]);
    assert!(matches!(
        RetroSignedSystemPolicy::load_with_update_role(
            &bytes,
            &signed_policy_signatures(&unknown_key, "retro-policy-a", &bytes),
            &update_policy,
            POLICY_TARGET,
        ),
        Err(RetroImportError::PolicyAuthority(_))
    ));

    let signatures = signed_policy_signatures(&policy_key, "retro-policy-a", &bytes);
    let mut tampered = bytes.clone();
    tampered.push(b' ');
    assert!(matches!(
        RetroSignedSystemPolicy::load_with_update_role(
            &tampered,
            &signatures,
            &update_policy,
            POLICY_TARGET,
        ),
        Err(RetroImportError::PolicyAuthority(_))
    ));
    let mut raised_ceiling = document.clone();
    raised_ceiling["systems"][0]["maxContentBytes"] = json!(64 * 1024 * 1024);
    assert!(matches!(
        RetroSignedSystemPolicy::load_with_update_role(
            &serde_json::to_vec(&raised_ceiling).expect("serialize raised ceiling"),
            &signatures,
            &update_policy,
            POLICY_TARGET,
        ),
        Err(RetroImportError::PolicyAuthority(_))
    ));

    let mut other_target = document.clone();
    other_target["target"] = json!("other-target");
    let mismatch = load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &other_target)
        .expect_err("a policy signed for another target is refused");
    assert!(matches!(
        mismatch,
        RetroImportError::PolicyTargetMismatch { .. }
    ));
    assert!(mismatch.to_string().contains("other-target"));

    let policy = load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &document)
        .expect("signed policy loads");
    let files: Vec<(&str, &[u8], &str)> = vec![("Absent System", b"absent bytes", ".gbc")];
    let payload = fixture.root.join("payload-absent");
    write_staged_payload(&payload, "gbc", &files, &staged_manifest("gbc", &files));
    let absent = fixture
        .store
        .provision_operator_content_with_signed_policy(&payload, &policy)
        .expect_err("a system outside the signed policy is refused");
    assert!(matches!(absent, RetroImportError::SystemNotInPolicy(_)));
    assert!(absent.to_string().contains("gbc"));
    assert!(matches!(
        fixture
            .store
            .plan_operator_content_with_signed_policy(&payload, &policy),
        Err(RetroImportError::SystemNotInPolicy(_))
    ));
    assert_eq!(fixture.library().generation, 1);
    assert!(fixture.object_files().is_empty());
    assert!(fixture.audit_files().is_empty());
    assert!(staging_holds_only_the_lock(&fixture));
}

#[test]
fn signed_policies_admit_only_the_closed_system_vocabulary() {
    let (update_policy, policy_key, _) = update_trust_fixture();
    let valid = policy_document(&json!([game_boy_system("gb", &json!([".gb", ".gbc"]))]));
    assert!(load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &valid).is_ok());

    // No package binds a controller profile by name, so its wider grammar
    // is unchanged by the system and core narrowing below.
    let mut dotted_controller = valid.clone();
    dotted_controller["systems"][0]["controllerProfile"] = json!("retropad.standard.v1");
    assert!(
        load_signed_policy(
            &update_policy,
            &policy_key,
            "retro-policy-a",
            &dotted_controller
        )
        .is_ok()
    );

    let mut unknown_field = valid.clone();
    unknown_field["archiveFormats"] = json!(["zip"]);
    let mut unknown_system_field = valid.clone();
    unknown_system_field["systems"][0]["biosRequired"] = json!(false);
    let mut wrong_schema = valid.clone();
    wrong_schema["schemaVersion"] = json!(2);
    let mut zero_revision = valid.clone();
    zero_revision["policyRevision"] = json!(0);
    let mut unsafe_policy_id = valid.clone();
    unsafe_policy_id["policyId"] = json!("Retro-Policy");
    let mut zero_entries = valid.clone();
    zero_entries["maxLibraryEntries"] = json!(0);
    let mut oversized_entries = valid.clone();
    oversized_entries["maxLibraryEntries"] = json!(MAX_LIBRARY_ENTRIES + 1);
    let mut zero_library_bytes = valid.clone();
    zero_library_bytes["maxLibraryBytes"] = json!(0);
    let mut unsafe_library_bytes = valid.clone();
    unsafe_library_bytes["maxLibraryBytes"] = json!(MAX_SAFE_INTEGER + 1);
    let mut zero_content_bytes = valid.clone();
    zero_content_bytes["systems"][0]["maxContentBytes"] = json!(0);
    let mut unsafe_content_bytes = valid.clone();
    unsafe_content_bytes["systems"][0]["maxContentBytes"] = json!(MAX_SAFE_INTEGER + 1);
    let mut unsafe_system_id = valid.clone();
    unsafe_system_id["systems"][0]["systemId"] = json!("GB");
    let mut unsafe_core = valid.clone();
    unsafe_core["systems"][0]["coreId"] = json!("Gambatte");
    let mut unsafe_controller = valid.clone();
    unsafe_controller["systems"][0]["controllerProfile"] = json!("game boy");
    let mut dotted_system_id = valid.clone();
    dotted_system_id["systems"][0]["systemId"] = json!("gb.color");
    let mut dotted_core = valid.clone();
    dotted_core["systems"][0]["coreId"] = json!("gambatte.core");

    let oversized_extensions = (0..=MAX_SYSTEM_EXTENSIONS)
        .map(|index| format!(".e{index:03}"))
        .collect::<Vec<_>>();
    let oversized_systems = (0..=MAX_POLICY_SYSTEMS)
        .map(|index| game_boy_system(&format!("s{index:03}"), &json!([".gb"])))
        .collect::<Vec<_>>();

    for invalid in [
        unknown_field,
        unknown_system_field,
        wrong_schema,
        zero_revision,
        unsafe_policy_id,
        zero_entries,
        oversized_entries,
        zero_library_bytes,
        unsafe_library_bytes,
        zero_content_bytes,
        unsafe_content_bytes,
        unsafe_system_id,
        unsafe_core,
        unsafe_controller,
        dotted_system_id,
        dotted_core,
        policy_document(&json!([])),
        policy_document(&json!([
            game_boy_system("gb", &json!([".gb"])),
            game_boy_system("gb", &json!([".gbc"]))
        ])),
        policy_document(&json!([
            game_boy_system("gbc", &json!([".gbc"])),
            game_boy_system("gb", &json!([".gb"]))
        ])),
        policy_document(&json!([game_boy_system("gb", &json!([".gbc", ".gb"]))])),
        policy_document(&json!([game_boy_system("gb", &json!([".gb", ".gb"]))])),
        policy_document(&json!([game_boy_system("gb", &json!(["gb"]))])),
        policy_document(&json!([game_boy_system("gb", &json!([]))])),
        policy_document(&json!([game_boy_system(
            "gb",
            &json!(oversized_extensions)
        )])),
        policy_document(&json!(oversized_systems)),
    ] {
        let refusal = load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &invalid)
            .expect_err("the closed policy vocabulary refused this document");
        assert!(
            !refusal.to_string().is_empty(),
            "every refusal must name what it refused"
        );
    }
}
