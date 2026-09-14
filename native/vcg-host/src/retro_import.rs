//! Crash-recoverable installation of already-authorized plain retro files.
//!
//! USB and paired-LAN transports terminate at this same filesystem boundary.
//! The caller supplies an opened source file rather than a source path. This
//! module revalidates a strict terminal intent, copies and hashes the exact
//! bytes, requires scan evidence over the staged file, publishes content
//! without replacement, commits an append-only installed-library generation,
//! and writes a path-free audit record.
//!
//! A third transport, `operator-provisioned`, commits content an operator
//! staged themselves onto the target. It has no import session, no
//! entitlement acknowledgement, and no scan evidence, so its provenance
//! variant carries none of those fields rather than plausible substitutes for
//! them. Every object it publishes is hashed by this module from the bytes it
//! copies; the staged manifest's own digests are never trusted.
//!
//! This module deliberately does not enumerate USB media, expose a LAN
//! listener, decode archives, select product system policy, implement a
//! scanner, or launch `RetroArch`.

mod filesystem;
use filesystem::{
    canonical_direct_directory, canonical_direct_file, canonical_directory,
    create_directory_if_missing, create_private_new_file, encode_hex, ensure_same_filesystem,
    library_generation_filename, path_exists, publish_new_file, publish_new_file_resumable,
    read_audit, read_bytes_bounded, read_json_bounded, read_library, read_provision_audit,
    remove_regular_file_if_present, require_direct_directory, require_regular_file,
    seal_payload_permissions, serialized_bounded, set_private_directory_permissions, sync_directory,
    verify_file_hash, write_new_synced_file,
};

mod validation;
use validation::{
    build_next_library, canonical_intent_sha256, outcome_from_pending, parse_commit_intent,
    read_scan_receipt, replacement_entry, reuse_entry, validate_active_authority, validate_audit,
    validate_bindable_id, validate_bounded_text, validate_context_policy_binding, validate_entry,
    validate_extension, validate_install_authority, validate_library, validate_pending,
    validate_pending_cancellation_binding, validate_prefixed_hex_id, validate_safe_id,
    validate_scan_evidence, validate_sha256, validate_terminal_authority,
};

mod formats;
use formats::{
    AuditDecision, CommitAction, NativeAuditRecord, NativeProvisionAuditEventKind,
    NativeProvisionAuditRecord, PendingInstall, ResumePending, RetroImportCommitIntent,
    RetroInstalledEntry, RetroInstalledLibrary, RetroInstalledProvenance, ScanScope,
    StagedContainer, StagedContentManifest, StagedObject, StagedPartition, StagedPayload,
    StagedPayloadRoots,
};

mod provisioning;
#[cfg(test)]
use provisioning::*;

mod recovery;

pub use validation::is_library_entry_id;

use std::collections::{BTreeMap, HashSet};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use fs4::TryLockError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use unicode_normalization::is_nfc;

use crate::storage_layout::{StorageNamespacePlan, WritableDataClass};
use crate::update_trust::{
    DetachedUpdateSignatures, TrustedUpdatePolicy, UpdateArtifactKind, VerifiedUpdateRole,
};

/// Preprovisioned lock file required in the dedicated staging root.
pub const RETRO_IMPORT_LOCK_FILE: &str = "retro-import.lock";
/// Required direct child of the console-managed retro-content root.
pub const RETRO_CONTENT_OBJECTS_DIRECTORY: &str = "objects";
/// Required direct child containing immutable library generations.
pub const RETRO_LIBRARY_DIRECTORY: &str = "libraries";
/// Required direct child containing path-free terminal audit records.
pub const RETRO_AUDIT_DIRECTORY: &str = "audit";
/// Required direct child of a staged operator payload root.
pub const RETRO_STAGED_MANIFEST_FILE: &str = "staged-content.json";
/// Provenance label recorded on every operator-provisioned library entry.
pub const RETRO_OPERATOR_PROVISIONED_TRANSPORT: &str = "operator-provisioned";
/// Prefix every installed library entry ID carries before its content digest.
pub const CONTENT_ENTRY_ID_PREFIX: &str = "content-";

const SCHEMA_VERSION: u32 = 1;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_COMMIT_INTENT_BYTES: u64 = 64 * 1024;
const MAX_PENDING_STATE_BYTES: u64 = 128 * 1024;
const MAX_LIBRARY_DOCUMENT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_SCAN_RECEIPT_BYTES: u64 = 8 * 1024;
const MAX_AUDIT_RECORD_BYTES: u64 = 8 * 1024;
const MAX_LIBRARY_ENTRIES: usize = 100_000;
const MAX_LIBRARY_GENERATIONS: usize = 4_096;
const COPY_BUFFER_BYTES: usize = 64 * 1024;
const FILESYSTEM_METADATA_HEADROOM_BYTES: u64 = 64 * 1024;
const PENDING_INTENT_FILE: &str = "retro-import.intent.json";
const PENDING_INTENT_TEMP_FILE: &str = ".retro-import.intent.tmp";
const MAX_STAGED_MANIFEST_BYTES: u64 = 64 * 1024 * 1024;
const MAX_BINDABLE_ID_BYTES: usize = 64;
const MAX_SYSTEM_EXTENSIONS: usize = 16;
const MAX_POLICY_SYSTEMS: usize = 64;
const PROVISION_STAGE_FILE: &str = ".retro-provision.payload.tmp";
const PROVISION_ID_PREFIX: &str = "rop-";
const PROVISION_ID_HEX_LENGTH: usize = 32;
const STAGED_DOCUMENT_TYPE: &str = "vcg-operator-staged-retro-content";
const STAGED_PROVENANCE_LABEL: &str = "operator-staged-local-collection";

/// Trusted roots and recovery reserve for the native import store.
#[derive(Clone, Debug)]
pub struct RetroImportStoreConfig {
    pub staging_root: PathBuf,
    pub content_root: PathBuf,
    pub reserve_bytes: u64,
}

impl RetroImportStoreConfig {
    /// Derives the dedicated roots from the shared writable namespace plan.
    ///
    /// The returned configuration does not provision directories. A trusted
    /// image/install step must create the roots, fixed children, initial
    /// library generation, and operation lock before [`RetroImportStore::open`].
    #[must_use]
    pub fn from_storage_namespace(storage: &StorageNamespacePlan, reserve_bytes: u64) -> Self {
        Self {
            staging_root: storage.retro_import_staging_root().to_owned(),
            content_root: storage.root_for(WritableDataClass::RetroContent).to_owned(),
            reserve_bytes,
        }
    }
}

/// Release-bound system mapping used to revalidate a terminal intent.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetroPlainSystemPolicy {
    policy_id: String,
    policy_revision: u64,
    system_id: String,
    extension: String,
    core_id: String,
    controller_profile: String,
    max_content_bytes: u64,
    max_library_entries: usize,
    max_library_bytes: u64,
}

impl RetroPlainSystemPolicy {
    /// Constructs one exact plain-file mapping from trusted release policy.
    ///
    /// # Errors
    ///
    /// Rejects unsafe identifiers, extensions, zero/unsafe limits, and a
    /// library-entry limit above the closed installed-library schema.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        policy_id: impl Into<String>,
        policy_revision: u64,
        system_id: impl Into<String>,
        extension: impl Into<String>,
        core_id: impl Into<String>,
        controller_profile: impl Into<String>,
        max_content_bytes: u64,
        max_library_entries: usize,
        max_library_bytes: u64,
    ) -> Result<Self, RetroImportError> {
        let policy = Self {
            policy_id: policy_id.into(),
            policy_revision,
            system_id: system_id.into(),
            extension: extension.into(),
            core_id: core_id.into(),
            controller_profile: controller_profile.into(),
            max_content_bytes,
            max_library_entries,
            max_library_bytes,
        };
        policy.validate()?;
        Ok(policy)
    }

    fn validate(&self) -> Result<(), RetroImportError> {
        validate_safe_id("policy ID", &self.policy_id, 64)?;
        validate_bindable_id("system ID", &self.system_id)?;
        validate_bindable_id("core ID", &self.core_id)?;
        validate_safe_id("controller profile", &self.controller_profile, 64)?;
        validate_extension(&self.extension)?;
        if self.policy_revision == 0 || self.policy_revision > MAX_SAFE_INTEGER {
            return Err(RetroImportError::InvalidPolicy(
                "policy revision must be a positive safe integer".to_owned(),
            ));
        }
        if self.max_content_bytes == 0
            || self.max_content_bytes > MAX_SAFE_INTEGER
            || self.max_library_bytes == 0
            || self.max_library_bytes > MAX_SAFE_INTEGER
            || self.max_library_entries == 0
            || self.max_library_entries > MAX_LIBRARY_ENTRIES
        {
            return Err(RetroImportError::InvalidPolicy(
                "plain-file and library limits must be bounded positive values".to_owned(),
            ));
        }
        Ok(())
    }
}

/// Release-bound system mapping used to provision operator-staged content.
///
/// One staged payload can carry every canonical extension its system accepts,
/// so this policy holds the sorted extension set that
/// [`RetroPlainSystemPolicy`] projects one member of.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroOperatorProvisionPolicy {
    policy_id: String,
    policy_revision: u64,
    system_id: String,
    extensions: Vec<String>,
    core_id: String,
    controller_profile: String,
    max_content_bytes: u64,
    max_library_entries: usize,
    max_library_bytes: u64,
}

impl RetroOperatorProvisionPolicy {
    /// Constructs one system mapping from trusted release policy.
    ///
    /// # Errors
    ///
    /// Rejects unsafe identifiers, an empty, unsorted, duplicated, or
    /// oversized extension set, and zero or unsafe limits.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        policy_id: impl Into<String>,
        policy_revision: u64,
        system_id: impl Into<String>,
        extensions: Vec<String>,
        core_id: impl Into<String>,
        controller_profile: impl Into<String>,
        max_content_bytes: u64,
        max_library_entries: usize,
        max_library_bytes: u64,
    ) -> Result<Self, RetroImportError> {
        let policy = Self {
            policy_id: policy_id.into(),
            policy_revision,
            system_id: system_id.into(),
            extensions,
            core_id: core_id.into(),
            controller_profile: controller_profile.into(),
            max_content_bytes,
            max_library_entries,
            max_library_bytes,
        };
        policy.validate()?;
        Ok(policy)
    }

    /// Returns the exact system this policy provisions.
    #[must_use]
    pub fn system_id(&self) -> &str {
        &self.system_id
    }

    fn validate(&self) -> Result<(), RetroImportError> {
        validate_safe_id("policy ID", &self.policy_id, 64)?;
        validate_bindable_id("system ID", &self.system_id)?;
        validate_bindable_id("core ID", &self.core_id)?;
        validate_safe_id("controller profile", &self.controller_profile, 64)?;
        if self.extensions.is_empty() || self.extensions.len() > MAX_SYSTEM_EXTENSIONS {
            return Err(RetroImportError::InvalidPolicy(format!(
                "system policy must list 1..={MAX_SYSTEM_EXTENSIONS} canonical extensions"
            )));
        }
        for extension in &self.extensions {
            validate_extension(extension)?;
        }
        if self
            .extensions
            .windows(2)
            .any(|pair| pair[0].as_str() >= pair[1].as_str())
        {
            return Err(RetroImportError::InvalidPolicy(
                "system policy extensions must be sorted and unique".to_owned(),
            ));
        }
        if self.policy_revision == 0 || self.policy_revision > MAX_SAFE_INTEGER {
            return Err(RetroImportError::InvalidPolicy(
                "policy revision must be a positive safe integer".to_owned(),
            ));
        }
        if self.max_content_bytes == 0
            || self.max_content_bytes > MAX_SAFE_INTEGER
            || self.max_library_bytes == 0
            || self.max_library_bytes > MAX_SAFE_INTEGER
            || self.max_library_entries == 0
            || self.max_library_entries > MAX_LIBRARY_ENTRIES
        {
            return Err(RetroImportError::InvalidPolicy(
                "plain-file and library limits must be bounded positive values".to_owned(),
            ));
        }
        Ok(())
    }

    fn accepts(&self, entry: &RetroInstalledEntry) -> bool {
        entry.system_id == self.system_id
            && entry.core_id == self.core_id
            && entry.controller_profile == self.controller_profile
            && entry.size_bytes <= self.max_content_bytes
            && self.extensions.contains(&entry.extension)
    }
}

/// One signature-verified, release-bound system policy for a target.
///
/// The mapping from a system to its core, controller profile, canonical
/// extensions, and ceilings is a release artifact rather than an operator
/// claim: it is verified through the same delegated update role, detached
/// signature bundle, and domain-separated signing message as the installed
/// catalog, under [`UpdateArtifactKind::RetroSystemPolicy`]. Adding a system
/// or raising a ceiling therefore requires re-signing the document.
///
/// One document describes every system a release supports, so provisioning
/// two systems needs one policy rather than two.
#[derive(Clone, Debug)]
pub struct RetroSignedSystemPolicy {
    policy_id: String,
    policy_revision: u64,
    target: String,
    systems: Vec<RetroOperatorProvisionPolicy>,
    update_authority: VerifiedUpdateRole,
}

impl RetroSignedSystemPolicy {
    /// Verifies exact policy bytes through current delegated update authority
    /// and then parses the closed system vocabulary they carry.
    ///
    /// Signature verification precedes JSON parsing, and the document must
    /// name the same target the role authorized.
    ///
    /// # Errors
    ///
    /// Rejects missing/expired authority, insufficient signatures, an
    /// unsupported schema, the wrong target, an empty or excessive system
    /// list, unsorted or duplicate systems, and every mapping this module
    /// already refuses: unsafe identifiers, unsorted/duplicate/invalid
    /// extensions, and zero or unsafe ceilings.
    pub fn load_with_update_role(
        policy_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        update_policy: &TrustedUpdatePolicy,
        expected_target: &str,
    ) -> Result<Self, RetroImportError> {
        let update_authority = update_policy
            .verify(
                UpdateArtifactKind::RetroSystemPolicy,
                expected_target,
                policy_bytes,
                signatures,
            )
            .map_err(|error| RetroImportError::PolicyAuthority(error.to_string()))?;
        let document: RetroSystemPolicyDocument = serde_json::from_slice(policy_bytes)
            .map_err(|error| RetroImportError::InvalidPolicy(error.to_string()))?;
        if document.schema_version != SCHEMA_VERSION {
            return Err(RetroImportError::UnsupportedSchema(document.schema_version));
        }
        if document.target != expected_target {
            return Err(RetroImportError::PolicyTargetMismatch {
                expected: expected_target.to_owned(),
                actual: document.target,
            });
        }
        if document.systems.is_empty() || document.systems.len() > MAX_POLICY_SYSTEMS {
            return Err(RetroImportError::InvalidPolicy(format!(
                "signed system policy must list 1..={MAX_POLICY_SYSTEMS} systems"
            )));
        }
        let mut systems = Vec::with_capacity(document.systems.len());
        for system in document.systems {
            systems.push(RetroOperatorProvisionPolicy::new(
                document.policy_id.clone(),
                document.policy_revision,
                system.system_id,
                system.extensions,
                system.core_id,
                system.controller_profile,
                system.max_content_bytes,
                document.max_library_entries,
                document.max_library_bytes,
            )?);
        }
        if systems
            .windows(2)
            .any(|pair| pair[0].system_id >= pair[1].system_id)
        {
            return Err(RetroImportError::InvalidPolicy(
                "signed system policy systems must be sorted and unique".to_owned(),
            ));
        }
        Ok(Self {
            policy_id: document.policy_id,
            policy_revision: document.policy_revision,
            target: document.target,
            systems,
            update_authority,
        })
    }

    /// Returns the exact mapping this policy binds for one system.
    ///
    /// # Errors
    ///
    /// Rejects a system the signed policy does not describe.
    pub fn system(
        &self,
        system_id: &str,
    ) -> Result<&RetroOperatorProvisionPolicy, RetroImportError> {
        self.systems
            .iter()
            .find(|system| system.system_id == system_id)
            .ok_or_else(|| RetroImportError::SystemNotInPolicy(system_id.to_owned()))
    }

    #[must_use]
    pub fn policy_id(&self) -> &str {
        &self.policy_id
    }

    #[must_use]
    pub const fn policy_revision(&self) -> u64 {
        self.policy_revision
    }

    /// The target this policy was signed for.
    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    /// How many systems the policy describes.
    #[must_use]
    pub fn system_count(&self) -> usize {
        self.systems.len()
    }

    /// The verified channel, artifact, target, and root generation that
    /// authorized these exact bytes.
    #[must_use]
    pub const fn update_authority(&self) -> &VerifiedUpdateRole {
        &self.update_authority
    }

    fn validate(&self) -> Result<(), RetroImportError> {
        for system in &self.systems {
            system.validate()?;
        }
        Ok(())
    }
}

/// The release-bound mappings one staged payload is validated against.
#[derive(Clone, Copy)]
enum StagedPolicyView<'a> {
    /// One exact mapping supplied by the caller.
    Exact(&'a RetroOperatorProvisionPolicy),
    /// Every mapping one signed policy document binds.
    Signed(&'a RetroSignedSystemPolicy),
}

impl<'a> StagedPolicyView<'a> {
    fn validate(self) -> Result<(), RetroImportError> {
        match self {
            Self::Exact(policy) => policy.validate(),
            Self::Signed(policy) => policy.validate(),
        }
    }

    fn select(self, system_id: &str) -> Result<&'a RetroOperatorProvisionPolicy, RetroImportError> {
        match self {
            Self::Exact(policy) => {
                if policy.system_id == system_id {
                    Ok(policy)
                } else {
                    Err(RetroImportError::PolicyBindingMismatch)
                }
            }
            Self::Signed(policy) => policy.system(system_id),
        }
    }
}

/// Exact signed document one release publishes for its supported systems.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroSystemPolicyDocument {
    schema_version: u32,
    policy_id: String,
    policy_revision: u64,
    target: String,
    max_library_entries: usize,
    max_library_bytes: u64,
    systems: Vec<RetroSystemPolicyEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroSystemPolicyEntry {
    system_id: String,
    extensions: Vec<String>,
    core_id: String,
    controller_profile: String,
    max_content_bytes: u64,
}

/// Native-only context omitted from the pure terminal intent.
#[derive(Clone, Debug)]
pub struct RetroPlainImportContext {
    inspection_id: String,
    plan_expires_at_ms: u64,
    session_revoked: bool,
    policy: RetroPlainSystemPolicy,
    intent_authority_sha256: String,
}

impl RetroPlainImportContext {
    /// Authorizes one exact terminal-intent document against native context.
    ///
    /// The canonical digest retained here prevents an install caller from
    /// swapping any plan, source, entry, replacement, or audit field after
    /// native authorization.
    ///
    /// # Errors
    ///
    /// Rejects a malformed intent, unsafe inspection ID, invalid
    /// expiry/policy, or policy-to-intent mismatch.
    pub fn authorize(
        commit_intent_json: &[u8],
        inspection_id: impl Into<String>,
        plan_expires_at_ms: u64,
        session_revoked: bool,
        policy: RetroPlainSystemPolicy,
    ) -> Result<Self, RetroImportError> {
        let intent = parse_commit_intent(commit_intent_json)?;
        let context = Self {
            inspection_id: inspection_id.into(),
            plan_expires_at_ms,
            session_revoked,
            policy,
            intent_authority_sha256: canonical_intent_sha256(&intent)?,
        };
        validate_prefixed_hex_id("inspection ID", &context.inspection_id, "rii-", 32)?;
        if context.plan_expires_at_ms > MAX_SAFE_INTEGER {
            return Err(RetroImportError::InvalidContext(
                "plan expiry exceeds the interoperable integer range".to_owned(),
            ));
        }
        context.policy.validate()?;
        validate_context_policy_binding(&intent, &context)?;
        Ok(context)
    }
}

/// Read-only request passed to the selected scanner.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroScanRequest {
    inspection_id: String,
    subject_sha256: String,
    subject_bytes: u64,
}

impl RetroScanRequest {
    #[must_use]
    pub fn inspection_id(&self) -> &str {
        &self.inspection_id
    }

    #[must_use]
    pub fn subject_sha256(&self) -> &str {
        &self.subject_sha256
    }

    #[must_use]
    pub const fn subject_bytes(&self) -> u64 {
        self.subject_bytes
    }
}

/// Scanner disposition for the exact staged subject.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RetroScanStatus {
    Clean,
    Blocked,
    Error,
}

/// Evidence returned by an independently selected offline scanner.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetroScanEvidence {
    engine_id: String,
    rule_set_revision: String,
    inspection_id: String,
    subject_sha256: String,
    scope: ScanScope,
    status: RetroScanStatus,
}

impl RetroScanEvidence {
    #[must_use]
    pub fn new(
        engine_id: impl Into<String>,
        rule_set_revision: impl Into<String>,
        inspection_id: impl Into<String>,
        subject_sha256: impl Into<String>,
        status: RetroScanStatus,
    ) -> Self {
        Self {
            engine_id: engine_id.into(),
            rule_set_revision: rule_set_revision.into(),
            inspection_id: inspection_id.into(),
            subject_sha256: subject_sha256.into(),
            scope: ScanScope::ContainerAndExpandedPayloads,
            status,
        }
    }
}

/// Pluggable scanner for an already-copied read-only plain file.
pub trait RetroContentScanner {
    /// Scans the exact subject from byte zero through EOF.
    ///
    /// Returning `Err` represents scanner transport/process unavailability.
    /// A successfully reached scanner returns explicit clean, blocked, or
    /// error evidence.
    ///
    /// # Errors
    ///
    /// Returns a path-free description when the scanner cannot complete its
    /// operation. Content dispositions belong in the returned evidence.
    fn scan(
        &mut self,
        subject: &mut dyn Read,
        request: &RetroScanRequest,
    ) -> Result<RetroScanEvidence, String>;
}

/// Successful installation of one content object and library generation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroImportOutcome {
    plan_id: String,
    entry_id: String,
    library_generation: u64,
    replaced_entry_id: Option<String>,
}

impl RetroImportOutcome {
    #[must_use]
    pub fn plan_id(&self) -> &str {
        &self.plan_id
    }

    #[must_use]
    pub fn entry_id(&self) -> &str {
        &self.entry_id
    }

    #[must_use]
    pub const fn library_generation(&self) -> u64 {
        self.library_generation
    }

    #[must_use]
    pub fn replaced_entry_id(&self) -> Option<&str> {
        self.replaced_entry_id.as_deref()
    }
}

/// What provisioning one staged operator payload would commit.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroOperatorProvisionPlan {
    provisioning_id: String,
    system_id: String,
    payload_entries: usize,
    archive_extracted_entries: usize,
    new_entries: usize,
    already_installed_entries: usize,
    verified_bytes: u64,
    library_generation: u64,
    next_library_generation: u64,
}

impl RetroOperatorProvisionPlan {
    #[must_use]
    pub fn provisioning_id(&self) -> &str {
        &self.provisioning_id
    }

    #[must_use]
    pub fn system_id(&self) -> &str {
        &self.system_id
    }

    #[must_use]
    pub const fn payload_entries(&self) -> usize {
        self.payload_entries
    }

    /// Entries the payload reports were extracted from a ZIP container.
    ///
    /// The console hashed the extracted object, never the container, so this
    /// is what the payload claims rather than what this store verified.
    #[must_use]
    pub const fn archive_extracted_entries(&self) -> usize {
        self.archive_extracted_entries
    }

    #[must_use]
    pub const fn new_entries(&self) -> usize {
        self.new_entries
    }

    #[must_use]
    pub const fn already_installed_entries(&self) -> usize {
        self.already_installed_entries
    }

    #[must_use]
    pub const fn verified_bytes(&self) -> u64 {
        self.verified_bytes
    }

    #[must_use]
    pub const fn library_generation(&self) -> u64 {
        self.library_generation
    }

    /// The generation a commit would publish, or the current one when the
    /// payload adds nothing.
    #[must_use]
    pub const fn next_library_generation(&self) -> u64 {
        self.next_library_generation
    }
}

/// Durable result of provisioning one staged operator payload.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroOperatorProvisionOutcome {
    provisioning_id: String,
    system_id: String,
    library_generation: u64,
    committed_entries: usize,
    already_installed_entries: usize,
    archive_extracted_entries: usize,
    verified_objects: usize,
    verified_bytes: u64,
}

impl RetroOperatorProvisionOutcome {
    #[must_use]
    pub fn provisioning_id(&self) -> &str {
        &self.provisioning_id
    }

    #[must_use]
    pub fn system_id(&self) -> &str {
        &self.system_id
    }

    /// Entries the payload reports were extracted from a ZIP container.
    ///
    /// The console hashed the extracted object, never the container, so this
    /// is what the payload claims rather than what this store verified.
    #[must_use]
    pub const fn archive_extracted_entries(&self) -> usize {
        self.archive_extracted_entries
    }

    /// The generation this run left the installed library at.
    #[must_use]
    pub const fn library_generation(&self) -> u64 {
        self.library_generation
    }

    #[must_use]
    pub const fn committed_entries(&self) -> usize {
        self.committed_entries
    }

    #[must_use]
    pub const fn already_installed_entries(&self) -> usize {
        self.already_installed_entries
    }

    /// Objects this run hashed: every object the payload names.
    ///
    /// A committed entry was hashed from the bytes copied into the store; an
    /// already-installed entry was rehashed in the store. The staged payload
    /// file behind an already-installed entry is not reread, because the
    /// installed object is the one the library refers to.
    #[must_use]
    pub const fn verified_objects(&self) -> usize {
        self.verified_objects
    }

    #[must_use]
    pub const fn verified_bytes(&self) -> u64 {
        self.verified_bytes
    }
}

/// No-copy terminal action committed by the native store.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetroNoCopyAction {
    CancelAndCleanup,
    ReuseExisting,
}

/// Durable result of cancellation or reuse without a library generation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroNoCopyOutcome {
    plan_id: String,
    action: RetroNoCopyAction,
    library_generation: u64,
    existing_entry_id: Option<String>,
}

impl RetroNoCopyOutcome {
    #[must_use]
    pub fn plan_id(&self) -> &str {
        &self.plan_id
    }

    #[must_use]
    pub const fn action(&self) -> RetroNoCopyAction {
        self.action
    }

    #[must_use]
    pub const fn library_generation(&self) -> u64 {
        self.library_generation
    }

    #[must_use]
    pub fn existing_entry_id(&self) -> Option<&str> {
        self.existing_entry_id.as_deref()
    }
}

/// Result of an explicit interrupted-import recovery pass.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RetroImportRecovery {
    Clean,
    DiscardedUnpublishedState,
    DiscardedIncomplete {
        plan_id: String,
    },
    DiscardedRejected {
        plan_id: String,
        status: RetroScanStatus,
    },
    Completed(RetroImportOutcome),
}

/// Console-managed plain-file transaction store.
#[derive(Clone, Debug)]
pub struct RetroImportStore {
    staging_root: PathBuf,
    object_root: PathBuf,
    library_root: PathBuf,
    audit_root: PathBuf,
    operation_lock: PathBuf,
    reserve_bytes: u64,
}

impl RetroImportStore {
    /// Creates the fixed roots, operation lock, and first library generation.
    ///
    /// Idempotent: an existing root, lock, or generation is left exactly as it
    /// is. Returns whether anything was created. This provisions structure
    /// only; it never writes, removes, or rewrites an installed entry.
    ///
    /// # Errors
    ///
    /// Rejects relative or unsafe roots, roots on separate filesystems, a
    /// library root holding anything other than a contiguous generation
    /// history, and I/O failure.
    pub fn provision_roots(config: &RetroImportStoreConfig) -> Result<bool, RetroImportError> {
        for root in [&config.staging_root, &config.content_root] {
            if !root.is_absolute() {
                return Err(RetroImportError::UnsafeRoot {
                    kind: "retro import root",
                    path: root.clone(),
                });
            }
        }
        let mut created = create_directory_if_missing(&config.staging_root)?;
        created |= create_directory_if_missing(&config.content_root)?;
        let staging_root = canonical_directory("retro import staging root", &config.staging_root)?;
        let content_root = canonical_directory("retro content root", &config.content_root)?;
        if staging_root == content_root
            || staging_root.starts_with(&content_root)
            || content_root.starts_with(&staging_root)
        {
            return Err(RetroImportError::OverlappingRoots);
        }
        ensure_same_filesystem(&staging_root, &content_root)?;
        for child in [
            RETRO_CONTENT_OBJECTS_DIRECTORY,
            RETRO_LIBRARY_DIRECTORY,
            RETRO_AUDIT_DIRECTORY,
        ] {
            created |= create_directory_if_missing(&content_root.join(child))?;
        }
        let lock = staging_root.join(RETRO_IMPORT_LOCK_FILE);
        if !path_exists(&lock)? {
            write_new_synced_file(&lock, &[], "create retro import operation lock")?;
            sync_directory(&staging_root)?;
            created = true;
        }
        let library_root = content_root.join(RETRO_LIBRARY_DIRECTORY);
        let first = library_root.join(library_generation_filename(1));
        if !path_exists(&first)? {
            if fs::read_dir(&library_root)
                .map_err(|source| RetroImportError::Io {
                    operation: "enumerate retro library generations",
                    path: library_root.clone(),
                    source,
                })?
                .next()
                .is_some()
            {
                return Err(RetroImportError::InvalidLibraryHistory);
            }
            let initial = RetroInstalledLibrary {
                schema_version: SCHEMA_VERSION,
                generation: 1,
                entries: Vec::new(),
            };
            let bytes = serialized_bounded(
                &initial,
                MAX_LIBRARY_DOCUMENT_BYTES,
                "retro installed library",
            )?;
            let temporary = staging_root.join(".retro-provision-library.tmp");
            remove_regular_file_if_present(&temporary)?;
            publish_new_file(
                &library_root,
                &temporary,
                &first,
                &bytes,
                "retro installed library",
            )?;
            created = true;
        }
        Ok(created)
    }

    /// Opens preprovisioned, mutually disjoint staging and content roots.
    ///
    /// The content root must already contain regular direct `objects`,
    /// `libraries`, and `audit` directories. The staging root must contain a
    /// regular direct [`RETRO_IMPORT_LOCK_FILE`]. No directories or state are
    /// created before all roots and the current library are validated.
    ///
    /// # Errors
    ///
    /// Rejects missing, relative, symlinked, overlapping, or malformed roots;
    /// a zero reserve; and missing or invalid current library state.
    pub fn open(config: &RetroImportStoreConfig) -> Result<Self, RetroImportError> {
        if config.reserve_bytes == 0 {
            return Err(RetroImportError::InvalidReserve);
        }
        let staging_root = canonical_directory("retro import staging root", &config.staging_root)?;
        let content_root = canonical_directory("retro content root", &config.content_root)?;
        if staging_root == content_root
            || staging_root.starts_with(&content_root)
            || content_root.starts_with(&staging_root)
        {
            return Err(RetroImportError::OverlappingRoots);
        }
        ensure_same_filesystem(&staging_root, &content_root)?;
        let object_root = canonical_direct_directory(
            "retro content object root",
            &content_root,
            &content_root.join(RETRO_CONTENT_OBJECTS_DIRECTORY),
        )?;
        let library_root = canonical_direct_directory(
            "retro library root",
            &content_root,
            &content_root.join(RETRO_LIBRARY_DIRECTORY),
        )?;
        let audit_root = canonical_direct_directory(
            "retro audit root",
            &content_root,
            &content_root.join(RETRO_AUDIT_DIRECTORY),
        )?;
        let operation_lock = canonical_direct_file(
            "retro import operation lock",
            &staging_root,
            &staging_root.join(RETRO_IMPORT_LOCK_FILE),
        )?;
        let store = Self {
            staging_root,
            object_root,
            library_root,
            audit_root,
            operation_lock,
            reserve_bytes: config.reserve_bytes,
        };
        let _ = store.current_library()?;
        Ok(store)
    }

    /// Copies, scans, publishes, and commits one authorized plain file.
    ///
    /// `source` is an already-opened host-owned handle. No source path is
    /// accepted, retained, returned, or written to durable state. A durable
    /// intent is published before staging begins; post-intent failure leaves
    /// enough path-free state for [`Self::recover`] unless the failure is an
    /// expected content/scan rejection that can be safely cleaned at once.
    ///
    /// # Errors
    ///
    /// Rejects malformed or stale intent, changed library/policy/session
    /// binding, insufficient capacity, changed source bytes, non-clean scan
    /// evidence, unsafe filesystem state, lock contention, or I/O failure.
    pub fn install_plain(
        &self,
        commit_intent_json: &[u8],
        context: &RetroPlainImportContext,
        source: &mut File,
        scanner: &mut impl RetroContentScanner,
        now_ms: u64,
    ) -> Result<RetroImportOutcome, RetroImportError> {
        let intent = parse_commit_intent(commit_intent_json)?;
        validate_install_authority(&intent, context, now_ms)?;
        intent.require_install_action()?;
        let _operation = self.acquire_operation_lock()?;
        if self.state_present()? {
            return Err(RetroImportError::RecoveryRequired);
        }
        let current = self.current_library()?;
        let next = build_next_library(&current, &intent, &context.policy)?;
        self.validate_preconditions(&intent, &current, &next)?;
        let pending = PendingInstall {
            schema_version: SCHEMA_VERSION,
            inspection_id: context.inspection_id.clone(),
            plan_expires_at_ms: context.plan_expires_at_ms,
            policy: context.policy.clone(),
            intent_authority_sha256: context.intent_authority_sha256.clone(),
            intent,
        };
        self.admit_capacity(&pending, &next)?;
        self.publish_pending(&pending)?;
        if let Err(error) = self.copy_source_to_stage(&pending, source) {
            if matches!(
                error,
                RetroImportError::SourceLengthMismatch { .. }
                    | RetroImportError::SourceHashMismatch
                    | RetroImportError::SourceNotRegular
            ) {
                self.abort_pending(&pending)?;
            }
            return Err(error);
        }
        match self.resume_pending(&pending, scanner)? {
            ResumePending::Completed(outcome) => Ok(outcome),
            ResumePending::Incomplete => Err(RetroImportError::IncompleteStaging),
            ResumePending::Rejected(status) => Err(RetroImportError::ScanRejected(status)),
        }
    }

    /// Commits an exact reuse or cancellation intent without copying bytes.
    ///
    /// Reuse revalidates the current library generation, exact existing
    /// entry, and console-managed object hash before writing a path-free
    /// audit record. Cancellation may execute after plan expiry or session
    /// revocation, removes only a matching pre-publication pending stage, and
    /// never advances the installed library. Both records publish atomically
    /// without replacement and are idempotently verifiable on retry.
    ///
    /// # Errors
    ///
    /// Rejects mutating actions, changed native authorization, inactive reuse
    /// authority, mismatched library/object state, another pending plan,
    /// unsafe paths, lock contention, or persistence failure.
    pub fn commit_without_copy(
        &self,
        commit_intent_json: &[u8],
        context: &RetroPlainImportContext,
        now_ms: u64,
    ) -> Result<RetroNoCopyOutcome, RetroImportError> {
        let intent = parse_commit_intent(commit_intent_json)?;
        validate_terminal_authority(&intent, context)?;
        if now_ms > MAX_SAFE_INTEGER {
            return Err(RetroImportError::PlanExpired);
        }
        let action = match intent.action {
            CommitAction::CancelAndCleanup => RetroNoCopyAction::CancelAndCleanup,
            CommitAction::ReuseExisting => {
                validate_active_authority(context, now_ms)?;
                RetroNoCopyAction::ReuseExisting
            }
            CommitAction::InstallNew | CommitAction::ReplaceExisting => {
                return Err(RetroImportError::UnsupportedAction);
            }
        };

        let _operation = self.acquire_operation_lock()?;
        if let Some(pending) = self.read_pending()? {
            if action != RetroNoCopyAction::CancelAndCleanup {
                return Err(RetroImportError::RecoveryRequired);
            }
            validate_pending_cancellation_binding(&pending, &intent, context)?;
            self.abort_pending(&pending)?;
        } else {
            self.remove_unpublished_temp_if_present()?;
        }

        let audit_path = self.audit_path(&intent.plan_id);
        if path_exists(&audit_path)? {
            let existing_audit = read_audit(&audit_path)?;
            let expected_audit =
                NativeAuditRecord::from_no_copy(&intent, existing_audit.library_generation)?;
            if existing_audit != expected_audit {
                return Err(RetroImportError::AuditMismatch);
            }
            self.publish_terminal_audit(&intent.plan_id, &expected_audit)?;
            return Ok(RetroNoCopyOutcome {
                plan_id: intent.plan_id,
                action,
                library_generation: existing_audit.library_generation,
                existing_entry_id: intent.existing_entry_id,
            });
        }

        let current = self.current_library()?;
        if action == RetroNoCopyAction::ReuseExisting
            && current.generation != intent.expected_library_generation
        {
            return Err(RetroImportError::LibraryGenerationMismatch {
                expected: intent.expected_library_generation,
                actual: current.generation,
            });
        }
        if action == RetroNoCopyAction::ReuseExisting {
            let existing = reuse_entry(&current, &intent)?;
            if existing.system_id != context.policy.system_id
                || existing.extension != context.policy.extension
                || existing.core_id != context.policy.core_id
                || existing.controller_profile != context.policy.controller_profile
                || existing.size_bytes > context.policy.max_content_bytes
            {
                return Err(RetroImportError::PolicyBindingMismatch);
            }
            self.verify_object(existing)?;
        }
        let audit = NativeAuditRecord::from_no_copy(&intent, current.generation)?;
        self.publish_terminal_audit(&intent.plan_id, &audit)?;
        Ok(RetroNoCopyOutcome {
            plan_id: intent.plan_id,
            action,
            library_generation: current.generation,
            existing_entry_id: intent.existing_entry_id,
        })
    }

    /// Completes or safely discards the one durable pending transaction.
    ///
    /// Recovery never needs the original USB/LAN source. An incomplete or
    /// changed staged file is discarded. A complete unscanned file is scanned
    /// again. Once a content object or new library generation is published,
    /// recovery only moves the same authoritative transaction forward.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, malformed/tampered state, ambiguous
    /// generation changes, unsafe paths, changed committed bytes, or I/O
    /// failure.
    pub fn recover(
        &self,
        scanner: &mut impl RetroContentScanner,
    ) -> Result<RetroImportRecovery, RetroImportError> {
        let _operation = self.acquire_operation_lock()?;
        let Some(pending) = self.read_pending()? else {
            if self.remove_unpublished_temp_if_present()? {
                return Ok(RetroImportRecovery::DiscardedUnpublishedState);
            }
            return Ok(RetroImportRecovery::Clean);
        };
        self.remove_unpublished_temp_if_present()?;
        match self.resume_pending(&pending, scanner)? {
            ResumePending::Completed(outcome) => Ok(RetroImportRecovery::Completed(outcome)),
            ResumePending::Incomplete => {
                let plan_id = pending.intent.plan_id.clone();
                self.abort_pending(&pending)?;
                Ok(RetroImportRecovery::DiscardedIncomplete { plan_id })
            }
            ResumePending::Rejected(status) => {
                let plan_id = pending.intent.plan_id.clone();
                Ok(RetroImportRecovery::DiscardedRejected { plan_id, status })
            }
        }
    }

    /// Cancels exactly one not-yet-published pending plan.
    ///
    /// Cancellation is denied after content publication or a library
    /// generation advance; those states require forward recovery.
    ///
    /// # Errors
    ///
    /// Rejects an unsafe or mismatched plan ID, mutation already in progress,
    /// lock contention, unsafe state, or cleanup failure.
    #[cfg(test)]
    fn cancel_pending(&self, plan_id: &str) -> Result<bool, RetroImportError> {
        validate_safe_id("plan ID", plan_id, 80)?;
        let _operation = self.acquire_operation_lock()?;
        let Some(pending) = self.read_pending()? else {
            self.remove_unpublished_temp_if_present()?;
            return Ok(false);
        };
        if pending.intent.plan_id != plan_id {
            return Err(RetroImportError::PlanMismatch);
        }
        let current = self.current_library()?;
        if current.generation != pending.intent.expected_library_generation
            || path_exists(&self.final_object_path(pending.intent.install_entry_required()?))?
        {
            return Err(RetroImportError::RecoveryRequired);
        }
        self.abort_pending(&pending)?;
        Ok(true)
    }

    /// Reports whether authoritative or unpublished native transaction state
    /// requires recovery.
    ///
    /// # Errors
    ///
    /// Rejects lock contention or unsafe state entries.
    pub fn recovery_required(&self) -> Result<bool, RetroImportError> {
        let _operation = self.acquire_operation_lock()?;
        self.state_present()
    }

    /// Returns the strict current installed-library document without paths.
    ///
    /// A pending or unpublished transaction blocks the snapshot so a planner
    /// cannot issue new work from a generation that first requires recovery.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, pending recovery, malformed generation
    /// history, unsafe filesystem state, oversized output, or I/O failure.
    pub fn current_library_json(&self) -> Result<Vec<u8>, RetroImportError> {
        let _operation = self.acquire_operation_lock()?;
        if self.state_present()? {
            return Err(RetroImportError::RecoveryRequired);
        }
        let library = self.current_library()?;
        serialized_bounded(
            &library,
            MAX_LIBRARY_DOCUMENT_BYTES,
            "retro installed library",
        )
    }

    /// Returns the current library generation as a path-free entry view.
    ///
    /// The snapshot is taken once and never follows a later generation, so a
    /// reader that pages through it sees one coherent library. Entries are
    /// ordered by system, then title, then entry ID.
    ///
    /// # Errors
    ///
    /// Rejects lock contention, pending recovery, malformed generation
    /// history, unsafe filesystem state, or I/O failure.
    pub fn library_snapshot(&self) -> Result<RetroLibrarySnapshot, RetroImportError> {
        let _operation = self.acquire_operation_lock()?;
        if self.state_present()? {
            return Err(RetroImportError::RecoveryRequired);
        }
        let library = self.current_library()?;
        let mut entries = library
            .entries
            .into_iter()
            .map(|entry| RetroLibraryEntry {
                entry_id: entry.entry_id,
                system_id: entry.system_id,
                core_id: entry.core_id,
                extension: entry.extension,
                title: entry.title,
                size_bytes: entry.size_bytes,
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            left.system_id
                .cmp(&right.system_id)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.entry_id.cmp(&right.entry_id))
        });
        let by_entry_id = entries
            .iter()
            .enumerate()
            .map(|(index, entry)| (entry.entry_id.clone(), index))
            .collect();
        Ok(RetroLibrarySnapshot {
            generation: library.generation,
            object_root: self.object_root.clone(),
            entries,
            by_entry_id,
        })
    }

    fn validate_preconditions(
        &self,
        intent: &RetroImportCommitIntent,
        current: &RetroInstalledLibrary,
        next: &RetroInstalledLibrary,
    ) -> Result<(), RetroImportError> {
        if current.generation != intent.expected_library_generation {
            return Err(RetroImportError::LibraryGenerationMismatch {
                expected: intent.expected_library_generation,
                actual: current.generation,
            });
        }
        let entry = intent.install_entry_required()?;
        let final_path = self.final_object_path(entry);
        if path_exists(&final_path)? {
            return Err(RetroImportError::ContentAlreadyExists(
                entry.entry_id.clone(),
            ));
        }
        if intent.action == CommitAction::ReplaceExisting {
            let target = replacement_entry(current, intent)?;
            self.verify_object(target)?;
        }
        validate_library(next)
    }

    fn admit_capacity(
        &self,
        pending: &PendingInstall,
        next: &RetroInstalledLibrary,
    ) -> Result<(), RetroImportError> {
        let entry = pending.intent.install_entry_required()?;
        let state_bytes = serialized_bounded(
            pending,
            MAX_PENDING_STATE_BYTES,
            "retro import pending state",
        )?;
        let library_bytes =
            serialized_bounded(next, MAX_LIBRARY_DOCUMENT_BYTES, "retro installed library")?;
        let audit = NativeAuditRecord::from_pending(pending, None)?;
        let audit_bytes = serialized_bounded(&audit, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
        let required = entry
            .size_bytes
            .checked_add(u64::try_from(state_bytes.len()).unwrap_or(u64::MAX))
            .and_then(|value| {
                value.checked_add(u64::try_from(library_bytes.len()).unwrap_or(u64::MAX))
            })
            .and_then(|value| {
                value.checked_add(u64::try_from(audit_bytes.len()).unwrap_or(u64::MAX))
            })
            .and_then(|value| value.checked_add(MAX_SCAN_RECEIPT_BYTES))
            .and_then(|value| value.checked_add(FILESYSTEM_METADATA_HEADROOM_BYTES))
            .and_then(|value| value.checked_add(self.reserve_bytes))
            .ok_or(RetroImportError::CapacityOverflow)?;
        let available =
            fs4::available_space(&self.staging_root).map_err(|source| RetroImportError::Io {
                operation: "read retro import staging capacity",
                path: self.staging_root.clone(),
                source,
            })?;
        if available < required {
            return Err(RetroImportError::InsufficientCapacity {
                required_bytes: required,
                available_bytes: available,
            });
        }
        Ok(())
    }

    fn publish_pending(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
        let bytes = serialized_bounded(
            pending,
            MAX_PENDING_STATE_BYTES,
            "retro import pending state",
        )?;
        publish_new_file(
            &self.staging_root,
            &self.staging_root.join(PENDING_INTENT_TEMP_FILE),
            &self.staging_root.join(PENDING_INTENT_FILE),
            &bytes,
            "retro import pending state",
        )
    }

    fn copy_source_to_stage(
        &self,
        pending: &PendingInstall,
        source: &mut File,
    ) -> Result<(), RetroImportError> {
        let entry = pending.intent.install_entry_required()?;
        let metadata = source
            .metadata()
            .map_err(|source_error| RetroImportError::SourceIo(source_error.to_string()))?;
        if !metadata.file_type().is_file() {
            return Err(RetroImportError::SourceNotRegular);
        }
        if metadata.len() != entry.size_bytes {
            return Err(RetroImportError::SourceLengthMismatch {
                expected: entry.size_bytes,
                actual: metadata.len(),
            });
        }
        source
            .seek(SeekFrom::Start(0))
            .map_err(|source_error| RetroImportError::SourceIo(source_error.to_string()))?;

        let stage = self.stage_directory(pending);
        fs::create_dir(&stage).map_err(|source_error| RetroImportError::Io {
            operation: "create retro import staging directory",
            path: stage.clone(),
            source: source_error,
        })?;
        set_private_directory_permissions(&stage)?;
        sync_directory(&self.staging_root)?;
        let payload = stage.join("payload");
        let mut output = create_private_new_file(&payload, "create staged retro content")?;
        let mut hasher = Sha256::new();
        let mut copied = 0_u64;
        let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|source_error| RetroImportError::SourceIo(source_error.to_string()))?;
            if read == 0 {
                break;
            }
            copied = copied
                .checked_add(u64::try_from(read).unwrap_or(u64::MAX))
                .ok_or(RetroImportError::CapacityOverflow)?;
            if copied > entry.size_bytes {
                return Err(RetroImportError::SourceLengthMismatch {
                    expected: entry.size_bytes,
                    actual: copied,
                });
            }
            output
                .write_all(&buffer[..read])
                .map_err(|source_error| RetroImportError::Io {
                    operation: "write staged retro content",
                    path: payload.clone(),
                    source: source_error,
                })?;
            hasher.update(&buffer[..read]);
        }
        output
            .sync_all()
            .map_err(|source_error| RetroImportError::Io {
                operation: "synchronize staged retro content",
                path: payload.clone(),
                source: source_error,
            })?;
        drop(output);
        sync_directory(&stage)?;
        if copied != entry.size_bytes {
            return Err(RetroImportError::SourceLengthMismatch {
                expected: entry.size_bytes,
                actual: copied,
            });
        }
        let observed = encode_hex(&hasher.finalize());
        if observed != pending.intent.source_sha256 || observed != entry.sha256 {
            return Err(RetroImportError::SourceHashMismatch);
        }
        let final_metadata = source
            .metadata()
            .map_err(|source_error| RetroImportError::SourceIo(source_error.to_string()))?;
        if final_metadata.len() != entry.size_bytes {
            return Err(RetroImportError::SourceLengthMismatch {
                expected: entry.size_bytes,
                actual: final_metadata.len(),
            });
        }
        Ok(())
    }

    fn current_library(&self) -> Result<RetroInstalledLibrary, RetroImportError> {
        let mut generations = Vec::new();
        for item in fs::read_dir(&self.library_root).map_err(|source| RetroImportError::Io {
            operation: "enumerate retro library generations",
            path: self.library_root.clone(),
            source,
        })? {
            let item = item.map_err(|source| RetroImportError::Io {
                operation: "enumerate retro library entry",
                path: self.library_root.clone(),
                source,
            })?;
            let path = item.path();
            require_regular_file(&path, "retro library generation")?;
            let name = item
                .file_name()
                .into_string()
                .map_err(|_| RetroImportError::UnsafePath(path.clone()))?;
            let generation = parse_library_filename(&name)
                .ok_or_else(|| RetroImportError::UnsafePath(path.clone()))?;
            generations.push(generation);
            if generations.len() > MAX_LIBRARY_GENERATIONS {
                return Err(RetroImportError::TooManyLibraryGenerations {
                    maximum: MAX_LIBRARY_GENERATIONS,
                });
            }
        }
        generations.sort_unstable();
        generations.dedup();
        if generations.first() != Some(&1)
            || generations
                .windows(2)
                .any(|pair| pair[1] != pair[0].saturating_add(1))
        {
            return Err(RetroImportError::InvalidLibraryHistory);
        }
        let generation = generations
            .last()
            .copied()
            .ok_or(RetroImportError::MissingLibrary)?;
        let library = self.read_library_generation(generation)?;
        if library.generation != generation {
            return Err(RetroImportError::LibraryFilenameMismatch);
        }
        Ok(library)
    }

    fn read_library_generation(
        &self,
        generation: u64,
    ) -> Result<RetroInstalledLibrary, RetroImportError> {
        let path = self.library_path(generation);
        require_regular_file(&path, "retro library generation")?;
        let library = read_library(&path)?;
        if library.generation != generation {
            return Err(RetroImportError::LibraryFilenameMismatch);
        }
        Ok(library)
    }

    fn read_pending(&self) -> Result<Option<PendingInstall>, RetroImportError> {
        let path = self.staging_root.join(PENDING_INTENT_FILE);
        if !path_exists(&path)? {
            return Ok(None);
        }
        require_regular_file(&path, "retro import pending state")?;
        let pending: PendingInstall =
            read_json_bounded(&path, MAX_PENDING_STATE_BYTES, "retro import pending state")?;
        validate_pending(&pending)?;
        Ok(Some(pending))
    }

    fn remove_unpublished_temp_if_present(&self) -> Result<bool, RetroImportError> {
        let path = self.staging_root.join(PENDING_INTENT_TEMP_FILE);
        if !path_exists(&path)? {
            return Ok(false);
        }
        require_regular_file(&path, "temporary retro import pending state")?;
        fs::remove_file(&path).map_err(|source| RetroImportError::Io {
            operation: "remove unpublished retro import state",
            path: path.clone(),
            source,
        })?;
        sync_directory(&self.staging_root)?;
        Ok(true)
    }

    fn state_present(&self) -> Result<bool, RetroImportError> {
        let mut present = false;
        for (name, kind) in [
            (PENDING_INTENT_FILE, "retro import pending state"),
            (
                PENDING_INTENT_TEMP_FILE,
                "temporary retro import pending state",
            ),
        ] {
            let path = self.staging_root.join(name);
            if path_exists(&path)? {
                require_regular_file(&path, kind)?;
                present = true;
            }
        }
        Ok(present)
    }

    fn acquire_operation_lock(&self) -> Result<RetroImportOperationLock, RetroImportError> {
        let path = canonical_direct_file(
            "retro import operation lock",
            &self.staging_root,
            &self.operation_lock,
        )?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|source| RetroImportError::Io {
                operation: "open retro import operation lock",
                path: path.clone(),
                source,
            })?;
        match fs4::FileExt::try_lock(&file) {
            Ok(()) => Ok(RetroImportOperationLock { file }),
            Err(TryLockError::WouldBlock) => Err(RetroImportError::Busy),
            Err(TryLockError::Error(source)) => Err(RetroImportError::Io {
                operation: "lock retro import operation",
                path,
                source,
            }),
        }
    }

    fn stage_directory(&self, pending: &PendingInstall) -> PathBuf {
        self.staging_root
            .join(format!("stage-{}", pending.intent.plan_id))
    }

    fn final_object_path(&self, entry: &RetroInstalledEntry) -> PathBuf {
        self.object_root.join(object_file_name(
            &entry.system_id,
            &entry.entry_id,
            &entry.extension,
        ))
    }

    fn library_path(&self, generation: u64) -> PathBuf {
        self.library_root
            .join(library_generation_filename(generation))
    }

    fn audit_path(&self, plan_id: &str) -> PathBuf {
        self.audit_root.join(format!("{plan_id}.json"))
    }

    fn verify_object(&self, entry: &RetroInstalledEntry) -> Result<(), RetroImportError> {
        verify_file_hash(
            &self.final_object_path(entry),
            entry.size_bytes,
            &entry.sha256,
        )
    }
}

/// One installed library entry, carrying no filesystem path.
///
/// The entry ID derives from the full content digest, so a reader that never
/// sees a path can still name exactly one installed object.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetroLibraryEntry {
    entry_id: String,
    system_id: String,
    core_id: String,
    extension: String,
    title: String,
    size_bytes: u64,
}

impl RetroLibraryEntry {
    #[must_use]
    pub fn entry_id(&self) -> &str {
        &self.entry_id
    }

    #[must_use]
    pub fn system_id(&self) -> &str {
        &self.system_id
    }

    #[must_use]
    pub fn core_id(&self) -> &str {
        &self.core_id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub const fn size_bytes(&self) -> u64 {
        self.size_bytes
    }

    /// Returns the content digest this entry's ID derives from.
    ///
    /// # Panics
    ///
    /// Panics when the entry ID does not carry the content prefix, which
    /// library validation already rejects before a snapshot exists.
    #[must_use]
    pub fn sha256(&self) -> &str {
        self.entry_id
            .strip_prefix(CONTENT_ENTRY_ID_PREFIX)
            .expect("validated entry IDs derive from the full content hash")
    }
}

/// One immutable view of the current installed-library generation.
#[derive(Clone, Debug)]
pub struct RetroLibrarySnapshot {
    generation: u64,
    object_root: PathBuf,
    entries: Vec<RetroLibraryEntry>,
    /// Entry ID to its index in the sorted entry list.
    ///
    /// The snapshot is immutable and outlives every launch that reads it, so
    /// this is built once rather than scanning up to `MAX_LIBRARY_ENTRIES` on
    /// each admission.
    by_entry_id: BTreeMap<String, usize>,
}

impl RetroLibrarySnapshot {
    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub fn entries(&self) -> &[RetroLibraryEntry] {
        &self.entries
    }

    /// Returns the entry one content ID names.
    #[must_use]
    pub fn entry(&self, entry_id: &str) -> Option<&RetroLibraryEntry> {
        self.by_entry_id
            .get(entry_id)
            .and_then(|index| self.entries.get(*index))
    }

    /// Returns the console-managed root every library object lives beneath.
    #[must_use]
    pub fn object_root(&self) -> &Path {
        &self.object_root
    }

    /// Returns the host-owned object path for one entry of this snapshot.
    #[must_use]
    pub fn object_path(&self, entry: &RetroLibraryEntry) -> PathBuf {
        self.object_root.join(object_file_name(
            &entry.system_id,
            &entry.entry_id,
            &entry.extension,
        ))
    }
}

fn object_file_name(system_id: &str, entry_id: &str, extension: &str) -> String {
    format!("{system_id}-{entry_id}{extension}")
}

#[derive(Debug)]
struct RetroImportOperationLock {
    file: File,
}

impl Drop for RetroImportOperationLock {
    fn drop(&mut self) {
        let _ = fs4::FileExt::unlock(&self.file);
    }
}

fn parse_library_filename(value: &str) -> Option<u64> {
    let digits = value.strip_prefix("generation-")?.strip_suffix(".json")?;
    if digits.len() != 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let generation = digits.parse::<u64>().ok()?;
    (generation > 0 && generation <= MAX_SAFE_INTEGER).then_some(generation)
}

/// Strict native retro-import failure.
#[derive(Debug)]
pub enum RetroImportError {
    InvalidReserve,
    OverlappingRoots,
    DifferentFilesystems,
    UnsafeRoot {
        kind: &'static str,
        path: PathBuf,
    },
    UnsafePath(PathBuf),
    UnsafePathWithKind {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidIdentifier {
        label: &'static str,
        value: String,
    },
    InvalidExtension(String),
    InvalidPolicy(String),
    PolicyAuthority(String),
    PolicyTargetMismatch {
        expected: String,
        actual: String,
    },
    SystemNotInPolicy(String),
    InvalidContext(String),
    InvalidIntent(String),
    InvalidPendingState(String),
    InvalidLibrary(String),
    InvalidStagedPayload(String),
    StagedContentMismatch(String),
    StagedSystemConflict(String),
    TransportNotSessionBound,
    InvalidState {
        label: &'static str,
        detail: String,
    },
    UnsupportedSchema(u32),
    UnsupportedAction,
    IntentTooLarge {
        maximum: u64,
    },
    StateTooLarge {
        label: &'static str,
        maximum: u64,
    },
    StateAlreadyExists(&'static str),
    MissingLibrary,
    LibraryFilenameMismatch,
    InvalidLibraryHistory,
    TooManyLibraryGenerations {
        maximum: usize,
    },
    LibraryGenerationMismatch {
        expected: u64,
        actual: u64,
    },
    LibraryGenerationOverflow,
    LibraryQuotaExceeded,
    CommittedLibraryMismatch,
    InstallEntryRequired,
    ExistingEntryRequired,
    ExistingEntryMissing(String),
    ReplacementEntryRequired,
    ReplacementMissing(String),
    ReplacementStillReferenced,
    IntentBindingMismatch,
    IntentAuthorityMismatch,
    PolicyBindingMismatch,
    PlanMismatch,
    PlanExpired,
    SessionRevoked,
    ContentAlreadyExists(String),
    CapacityOverflow,
    InsufficientCapacity {
        required_bytes: u64,
        available_bytes: u64,
    },
    SourceNotRegular,
    SourceLengthMismatch {
        expected: u64,
        actual: u64,
    },
    SourceHashMismatch,
    SourceIo(String),
    ScannerUnavailable(String),
    ScanBindingMismatch,
    ScanRejected(RetroScanStatus),
    MissingScanReceipt,
    CommittedContentMismatch,
    AuditMismatch,
    IncompleteStaging,
    RecoveryRequired,
    Busy,
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for RetroImportError {
    #[allow(clippy::too_many_lines)]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidReserve => formatter.write_str("retro import reserve must be nonzero"),
            Self::OverlappingRoots => {
                formatter.write_str("retro import staging and content roots overlap")
            }
            Self::DifferentFilesystems => formatter
                .write_str("retro import staging and content roots are not on one filesystem"),
            Self::UnsafeRoot { kind, path } | Self::UnsafePathWithKind { kind, path } => {
                write!(formatter, "{kind} is unsafe: {}", path.display())
            }
            Self::UnsafePath(path) => {
                write!(formatter, "retro import path is unsafe: {}", path.display())
            }
            Self::InvalidIdentifier { label, value } => {
                write!(formatter, "{label} is invalid: {value}")
            }
            Self::InvalidExtension(value) => {
                write!(formatter, "retro extension is invalid: {value}")
            }
            Self::InvalidPolicy(detail) => {
                write!(formatter, "retro import policy is invalid: {detail}")
            }
            Self::PolicyAuthority(detail) => {
                write!(
                    formatter,
                    "retro system policy is not signed by current update authority: {detail}"
                )
            }
            Self::PolicyTargetMismatch { expected, actual } => {
                write!(
                    formatter,
                    "retro system policy targets {actual}, not {expected}"
                )
            }
            Self::SystemNotInPolicy(system_id) => {
                write!(
                    formatter,
                    "signed retro system policy describes no system {system_id}"
                )
            }
            Self::InvalidContext(detail) => {
                write!(formatter, "retro import context is invalid: {detail}")
            }
            Self::InvalidIntent(detail) => {
                write!(formatter, "retro import intent is invalid: {detail}")
            }
            Self::InvalidPendingState(detail) => {
                write!(formatter, "retro import pending state is invalid: {detail}")
            }
            Self::InvalidLibrary(detail) => {
                write!(formatter, "retro installed library is invalid: {detail}")
            }
            Self::InvalidStagedPayload(detail) => {
                write!(formatter, "staged retro payload is invalid: {detail}")
            }
            Self::StagedContentMismatch(object) => {
                write!(
                    formatter,
                    "staged retro object differs from its declared length or hash: {object}"
                )
            }
            Self::StagedSystemConflict(entry) => {
                write!(
                    formatter,
                    "staged retro content is already installed under another system: {entry}"
                )
            }
            Self::TransportNotSessionBound => formatter
                .write_str("terminal intent requires an entry imported through a live session"),
            Self::InvalidState { label, detail } => {
                write!(formatter, "{label} is invalid: {detail}")
            }
            Self::UnsupportedSchema(schema) => {
                write!(formatter, "retro import schema {schema} is unsupported")
            }
            Self::UnsupportedAction => {
                formatter.write_str("terminal intent is not a plain-file installation action")
            }
            Self::IntentTooLarge { maximum } => {
                write!(formatter, "retro import intent exceeds {maximum} bytes")
            }
            Self::StateTooLarge { label, maximum } => {
                write!(formatter, "{label} exceeds {maximum} bytes")
            }
            Self::StateAlreadyExists(label) => write!(formatter, "{label} already exists"),
            Self::MissingLibrary => {
                formatter.write_str("retro installed library has no generation")
            }
            Self::LibraryFilenameMismatch => {
                formatter.write_str("retro library generation does not match its filename")
            }
            Self::InvalidLibraryHistory => formatter
                .write_str("retro library generations are not contiguous from generation one"),
            Self::TooManyLibraryGenerations { maximum } => {
                write!(
                    formatter,
                    "retro library exceeds {maximum} retained generations"
                )
            }
            Self::LibraryGenerationMismatch { expected, actual } => {
                write!(
                    formatter,
                    "retro library generation {actual} does not match expected {expected}"
                )
            }
            Self::LibraryGenerationOverflow => {
                formatter.write_str("retro library generation overflowed")
            }
            Self::LibraryQuotaExceeded => {
                formatter.write_str("retro installed-library quota would be exceeded")
            }
            Self::CommittedLibraryMismatch => {
                formatter.write_str("committed retro library differs from pending intent")
            }
            Self::InstallEntryRequired => {
                formatter.write_str("plain install intent has no installed entry")
            }
            Self::ExistingEntryRequired => {
                formatter.write_str("reuse intent has no existing entry")
            }
            Self::ExistingEntryMissing(entry) => {
                write!(formatter, "reuse entry does not exist: {entry}")
            }
            Self::ReplacementEntryRequired => {
                formatter.write_str("replacement intent has no existing entry")
            }
            Self::ReplacementMissing(entry) => {
                write!(formatter, "replacement entry does not exist: {entry}")
            }
            Self::ReplacementStillReferenced => {
                formatter.write_str("replacement entry remains referenced")
            }
            Self::IntentBindingMismatch => {
                formatter.write_str("retro import terminal intent bindings disagree")
            }
            Self::IntentAuthorityMismatch => {
                formatter.write_str("retro import intent differs from native authorization")
            }
            Self::PolicyBindingMismatch => {
                formatter.write_str("retro import intent differs from native release policy")
            }
            Self::PlanMismatch => {
                formatter.write_str("pending retro import belongs to another plan")
            }
            Self::PlanExpired => formatter.write_str("retro import plan is expired"),
            Self::SessionRevoked => formatter.write_str("retro import session was revoked"),
            Self::ContentAlreadyExists(entry) => {
                write!(formatter, "retro content already exists: {entry}")
            }
            Self::CapacityOverflow => {
                formatter.write_str("retro import capacity arithmetic overflowed")
            }
            Self::InsufficientCapacity {
                required_bytes,
                available_bytes,
            } => write!(
                formatter,
                "retro import requires {required_bytes} free bytes but only {available_bytes} are available"
            ),
            Self::SourceNotRegular => {
                formatter.write_str("retro import source handle is not a regular file")
            }
            Self::SourceLengthMismatch { expected, actual } => write!(
                formatter,
                "retro source length {actual} does not match expected {expected}"
            ),
            Self::SourceHashMismatch => {
                formatter.write_str("retro source hash differs from terminal intent")
            }
            Self::SourceIo(detail) => write!(formatter, "retro source handle failed: {detail}"),
            Self::ScannerUnavailable(detail) => {
                write!(formatter, "retro scanner is unavailable: {detail}")
            }
            Self::ScanBindingMismatch => {
                formatter.write_str("retro scan evidence is bound to different bytes or inspection")
            }
            Self::ScanRejected(status) => write!(
                formatter,
                "retro scan did not return clean evidence: {status:?}"
            ),
            Self::MissingScanReceipt => {
                formatter.write_str("retro import has no durable clean scan receipt")
            }
            Self::CommittedContentMismatch => {
                formatter.write_str("console-managed retro content differs from its hash binding")
            }
            Self::AuditMismatch => {
                formatter.write_str("retro import audit differs from pending intent")
            }
            Self::IncompleteStaging => formatter.write_str("retro import staging is incomplete"),
            Self::RecoveryRequired => formatter.write_str("retro import recovery is required"),
            Self::Busy => formatter.write_str("another retro import operation holds the lock"),
            Self::Io {
                operation,
                path,
                source,
            } => {
                write!(
                    formatter,
                    "{operation} failed for {}: {source}",
                    path.display()
                )
            }
        }
    }
}

impl std::error::Error for RetroImportError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests;
