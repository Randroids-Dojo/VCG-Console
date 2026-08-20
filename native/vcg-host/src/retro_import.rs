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

use std::collections::HashSet;
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
        Ok(RetroLibrarySnapshot {
            generation: library.generation,
            object_root: self.object_root.clone(),
            entries,
        })
    }

    /// Reports what provisioning one staged operator payload would commit.
    ///
    /// Every object the payload names is hashed from the payload itself, so a
    /// corrupt, truncated, or substituted file is reported here. Nothing is
    /// created, copied, or published.
    ///
    /// # Errors
    ///
    /// Rejects an unsafe or incomplete payload root, a manifest that
    /// disagrees with the supplied release policy or with its own entries, a
    /// digest mismatch, a hash already installed under another system, quota
    /// or capacity shortfall, pending recovery, lock contention, or I/O
    /// failure.
    pub fn plan_operator_content(
        &self,
        payload_root: &Path,
        policy: &RetroOperatorProvisionPolicy,
    ) -> Result<RetroOperatorProvisionPlan, RetroImportError> {
        self.plan_staged_payload(payload_root, StagedPolicyView::Exact(policy))
    }

    /// Reports what provisioning one staged operator payload would commit
    /// under a signed release policy.
    ///
    /// The payload's own system selects its mapping from the signed document,
    /// so one policy serves every system a release supports.
    ///
    /// # Errors
    ///
    /// Rejects everything [`Self::plan_operator_content`] rejects, plus a
    /// system the signed policy does not describe.
    pub fn plan_operator_content_with_signed_policy(
        &self,
        payload_root: &Path,
        policy: &RetroSignedSystemPolicy,
    ) -> Result<RetroOperatorProvisionPlan, RetroImportError> {
        self.plan_staged_payload(payload_root, StagedPolicyView::Signed(policy))
    }

    fn plan_staged_payload(
        &self,
        payload_root: &Path,
        policies: StagedPolicyView<'_>,
    ) -> Result<RetroOperatorProvisionPlan, RetroImportError> {
        policies.validate()?;
        let roots = staged_payload_roots(payload_root)?;
        let (payload, policy) = read_staged_payload(&roots.manifest, policies)?;
        let _operation = self.acquire_operation_lock()?;
        if self.state_present()? {
            return Err(RetroImportError::RecoveryRequired);
        }
        let current = self.current_library()?;
        let partition = partition_staged_objects(&current, &payload.objects)?;
        let next_generation = if partition.additions.is_empty() {
            current.generation
        } else {
            let entries = cloned_entries(&partition.additions);
            let next = build_provisioned_library(&current, &entries, policy)?;
            self.admit_provision_capacity(&entries, &next)?;
            next.generation
        };
        for object in &payload.objects {
            verify_staged_object(&roots.objects, object)?;
        }
        Ok(RetroOperatorProvisionPlan {
            provisioning_id: payload.provisioning_id,
            system_id: payload.system_id,
            payload_entries: payload.objects.len(),
            archive_extracted_entries: payload.archive_extracted,
            new_entries: partition.additions.len(),
            already_installed_entries: partition.installed.len(),
            verified_bytes: payload.total_bytes,
            library_generation: current.generation,
            next_library_generation: next_generation,
        })
    }

    /// Commits one staged operator payload as a library generation.
    ///
    /// Objects are copied into the console-managed store and hashed from the
    /// copied bytes; the staged manifest's digests are never trusted. An
    /// object the payload names that is already installed is rehashed in
    /// place instead. Nothing about this transaction depends on a clock, so
    /// re-running the same payload converges: published objects are adopted
    /// after verification, and an identical audit record and library
    /// generation are recognized rather than rewritten.
    ///
    /// Entries commit with `operator-provisioned` provenance, which records
    /// no session, no entitlement acknowledgement, and no scan evidence,
    /// because provisioning produces none of them.
    ///
    /// # Errors
    ///
    /// Rejects everything [`Self::plan_operator_content`] rejects, plus a
    /// changed committed audit record, a published object whose bytes differ
    /// from their hash, and publication failure.
    pub fn provision_operator_content(
        &self,
        payload_root: &Path,
        policy: &RetroOperatorProvisionPolicy,
    ) -> Result<RetroOperatorProvisionOutcome, RetroImportError> {
        self.provision_staged_payload(payload_root, StagedPolicyView::Exact(policy))
    }

    /// Commits one staged operator payload under a signed release policy.
    ///
    /// The payload's own system selects its mapping from the signed document,
    /// so one policy serves every system a release supports.
    ///
    /// # Errors
    ///
    /// Rejects everything [`Self::provision_operator_content`] rejects, plus
    /// a system the signed policy does not describe.
    pub fn provision_operator_content_with_signed_policy(
        &self,
        payload_root: &Path,
        policy: &RetroSignedSystemPolicy,
    ) -> Result<RetroOperatorProvisionOutcome, RetroImportError> {
        self.provision_staged_payload(payload_root, StagedPolicyView::Signed(policy))
    }

    fn provision_staged_payload(
        &self,
        payload_root: &Path,
        policies: StagedPolicyView<'_>,
    ) -> Result<RetroOperatorProvisionOutcome, RetroImportError> {
        policies.validate()?;
        let roots = staged_payload_roots(payload_root)?;
        let (payload, policy) = read_staged_payload(&roots.manifest, policies)?;
        let _operation = self.acquire_operation_lock()?;
        if self.state_present()? {
            return Err(RetroImportError::RecoveryRequired);
        }
        self.discard_provision_stage()?;
        let current = self.current_library()?;
        let partition = partition_staged_objects(&current, &payload.objects)?;
        for object in &partition.installed {
            self.verify_object(&object.entry)?;
        }
        let audit_path = self.audit_path(&payload.provisioning_id);
        if partition.additions.is_empty() {
            let generation = if path_exists(&audit_path)? {
                read_provision_audit(&audit_path)?.library_generation
            } else {
                current.generation
            };
            return Ok(RetroOperatorProvisionOutcome {
                provisioning_id: payload.provisioning_id,
                system_id: payload.system_id,
                library_generation: generation,
                committed_entries: 0,
                already_installed_entries: partition.installed.len(),
                archive_extracted_entries: payload.archive_extracted,
                verified_objects: payload.objects.len(),
                verified_bytes: payload.total_bytes,
            });
        }

        let entries = cloned_entries(&partition.additions);
        let next = build_provisioned_library(&current, &entries, policy)?;
        self.admit_provision_capacity(&entries, &next)?;
        let library_bytes =
            serialized_bounded(&next, MAX_LIBRARY_DOCUMENT_BYTES, "retro installed library")?;
        let mut committed_bytes = 0_u64;
        for object in &partition.additions {
            if let Err(error) = self.publish_provisioned_object(&roots.objects, object) {
                // A stale private stage file is removed by the next run; the
                // failure that produced it is the answer the caller needs.
                let _ = self.discard_provision_stage();
                return Err(error);
            }
            committed_bytes = committed_bytes
                .checked_add(object.entry.size_bytes)
                .ok_or(RetroImportError::CapacityOverflow)?;
        }

        let audit = NativeProvisionAuditRecord {
            schema_version: SCHEMA_VERSION,
            event: NativeProvisionAuditEventKind::Provisioned,
            provisioning_id: payload.provisioning_id.clone(),
            policy_id: policy.policy_id.clone(),
            policy_revision: policy.policy_revision,
            system_id: policy.system_id.clone(),
            staged_manifest_sha256: payload.manifest_sha256,
            committed_entries: entries.len(),
            already_installed_entries: partition.installed.len(),
            committed_bytes,
            library_generation: next.generation,
            library_sha256: encode_hex(&Sha256::digest(&library_bytes)),
        };
        self.publish_provision_audit(&audit_path, &audit)?;
        self.publish_library(&next, &payload.provisioning_id)?;
        self.discard_provision_stage()?;
        Ok(RetroOperatorProvisionOutcome {
            provisioning_id: payload.provisioning_id,
            system_id: payload.system_id,
            library_generation: next.generation,
            committed_entries: entries.len(),
            already_installed_entries: partition.installed.len(),
            archive_extracted_entries: payload.archive_extracted,
            verified_objects: payload.objects.len(),
            verified_bytes: payload.total_bytes,
        })
    }

    fn admit_provision_capacity(
        &self,
        entries: &[RetroInstalledEntry],
        next: &RetroInstalledLibrary,
    ) -> Result<(), RetroImportError> {
        let content = entries.iter().try_fold(0_u64, |sum, entry| {
            sum.checked_add(entry.size_bytes)
                .ok_or(RetroImportError::CapacityOverflow)
        })?;
        let library_bytes =
            serialized_bounded(next, MAX_LIBRARY_DOCUMENT_BYTES, "retro installed library")?;
        let required = content
            .checked_add(u64::try_from(library_bytes.len()).unwrap_or(u64::MAX))
            .and_then(|value| value.checked_add(MAX_AUDIT_RECORD_BYTES))
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

    fn publish_provisioned_object(
        &self,
        payload_objects: &Path,
        object: &StagedObject,
    ) -> Result<(), RetroImportError> {
        let final_path = self.final_object_path(&object.entry);
        if path_exists(&final_path)? {
            return self.verify_object(&object.entry);
        }
        let stage = self.staging_root.join(PROVISION_STAGE_FILE);
        remove_regular_file_if_present(&stage)?;
        let source_path = payload_objects.join(&object.object_name);
        require_regular_file(&source_path, "staged retro payload object")?;
        let mut source = File::open(&source_path).map_err(|source| RetroImportError::Io {
            operation: "open staged retro payload object",
            path: source_path.clone(),
            source,
        })?;
        let mut output = create_private_new_file(&stage, "create staged retro content")?;
        let mut hasher = Sha256::new();
        let mut copied = 0_u64;
        let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|source| RetroImportError::Io {
                    operation: "read staged retro payload object",
                    path: source_path.clone(),
                    source,
                })?;
            if read == 0 {
                break;
            }
            copied = copied
                .checked_add(u64::try_from(read).unwrap_or(u64::MAX))
                .ok_or(RetroImportError::CapacityOverflow)?;
            if copied > object.entry.size_bytes {
                return Err(RetroImportError::StagedContentMismatch(
                    object.object_name.clone(),
                ));
            }
            output
                .write_all(&buffer[..read])
                .map_err(|source| RetroImportError::Io {
                    operation: "write staged retro content",
                    path: stage.clone(),
                    source,
                })?;
            hasher.update(&buffer[..read]);
        }
        output.sync_all().map_err(|source| RetroImportError::Io {
            operation: "synchronize staged retro content",
            path: stage.clone(),
            source,
        })?;
        drop(output);
        sync_directory(&self.staging_root)?;
        if copied != object.entry.size_bytes
            || encode_hex(&hasher.finalize()) != object.entry.sha256
        {
            return Err(RetroImportError::StagedContentMismatch(
                object.object_name.clone(),
            ));
        }
        seal_payload_permissions(&stage)?;
        fs::hard_link(&stage, &final_path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                RetroImportError::ContentAlreadyExists(object.entry.entry_id.clone())
            } else {
                RetroImportError::Io {
                    operation: "publish retro content object",
                    path: final_path.clone(),
                    source,
                }
            }
        })?;
        sync_directory(&self.object_root)?;
        self.verify_object(&object.entry)?;
        remove_regular_file_if_present(&stage)?;
        sync_directory(&self.staging_root)
    }

    fn publish_provision_audit(
        &self,
        path: &Path,
        audit: &NativeProvisionAuditRecord,
    ) -> Result<(), RetroImportError> {
        if path_exists(path)? {
            if read_provision_audit(path)? == *audit {
                return Ok(());
            }
            return Err(RetroImportError::AuditMismatch);
        }
        let bytes = serialized_bounded(audit, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
        let temporary = self
            .staging_root
            .join(format!(".audit-{}.tmp", audit.provisioning_id));
        publish_new_file_resumable(
            &self.audit_root,
            &temporary,
            path,
            &bytes,
            "retro import audit",
        )
    }

    fn discard_provision_stage(&self) -> Result<(), RetroImportError> {
        if remove_regular_file_if_present(&self.staging_root.join(PROVISION_STAGE_FILE))? {
            sync_directory(&self.staging_root)?;
        }
        Ok(())
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

    fn resume_pending(
        &self,
        pending: &PendingInstall,
        scanner: &mut impl RetroContentScanner,
    ) -> Result<ResumePending, RetroImportError> {
        validate_pending(pending)?;
        let current = self.current_library()?;
        let expected = pending.intent.expected_library_generation;
        let next_generation = expected
            .checked_add(1)
            .ok_or(RetroImportError::LibraryGenerationOverflow)?;
        if current.generation > next_generation || current.generation < expected {
            return Err(RetroImportError::LibraryGenerationMismatch {
                expected,
                actual: current.generation,
            });
        }

        let base = self.read_library_generation(expected)?;
        let next = build_next_library(&base, &pending.intent, &pending.policy)?;
        if current.generation == next_generation {
            if current != next {
                return Err(RetroImportError::CommittedLibraryMismatch);
            }
            self.verify_object(pending.intent.install_entry_required()?)?;
            self.publish_or_verify_audit(pending)?;
            self.cleanup_replaced_object(&base, &next, &pending.intent)?;
            self.finish_cleanup(pending)?;
            return Ok(ResumePending::Completed(outcome_from_pending(pending)?));
        }
        if current != base {
            return Err(RetroImportError::CommittedLibraryMismatch);
        }

        let stage = self.stage_directory(pending);
        if !path_exists(&stage)? {
            if path_exists(&self.final_object_path(pending.intent.install_entry_required()?))? {
                return Err(RetroImportError::MissingScanReceipt);
            }
            return Ok(ResumePending::Incomplete);
        }
        require_direct_directory(&stage, &self.staging_root, "retro import staging directory")?;
        let payload = stage.join("payload");
        if !path_exists(&payload)? {
            return Ok(ResumePending::Incomplete);
        }
        let entry = pending.intent.install_entry_required()?;
        if verify_file_hash(&payload, entry.size_bytes, &entry.sha256).is_err() {
            return Ok(ResumePending::Incomplete);
        }

        let receipt = stage.join("scan.json");
        let scan = if path_exists(&receipt)? {
            read_scan_receipt(&receipt, pending)?
        } else {
            let evidence = self.scan_staged(pending, scanner)?;
            match evidence.status {
                RetroScanStatus::Clean => {
                    let bytes = serialized_bounded(
                        &evidence,
                        MAX_SCAN_RECEIPT_BYTES,
                        "retro scan receipt",
                    )?;
                    write_new_synced_file(&receipt, &bytes, "write retro scan receipt")?;
                    sync_directory(&stage)?;
                }
                status => {
                    self.abort_pending(pending)?;
                    return Ok(ResumePending::Rejected(status));
                }
            }
            evidence
        };
        if scan.status != RetroScanStatus::Clean {
            self.abort_pending(pending)?;
            return Ok(ResumePending::Rejected(scan.status));
        }
        verify_file_hash(&payload, entry.size_bytes, &entry.sha256)?;
        seal_payload_permissions(&payload)?;
        self.publish_content_object(pending, &payload)?;
        self.publish_library(&next, &pending.intent.plan_id)?;
        self.publish_or_verify_audit_with_scan(pending, &scan)?;
        self.cleanup_replaced_object(&base, &next, &pending.intent)?;
        self.finish_cleanup(pending)?;
        Ok(ResumePending::Completed(outcome_from_pending(pending)?))
    }

    fn scan_staged(
        &self,
        pending: &PendingInstall,
        scanner: &mut impl RetroContentScanner,
    ) -> Result<RetroScanEvidence, RetroImportError> {
        let entry = pending.intent.install_entry_required()?;
        let payload = self.stage_directory(pending).join("payload");
        require_regular_file(&payload, "staged retro content")?;
        let mut file = File::open(&payload).map_err(|source| RetroImportError::Io {
            operation: "open staged retro content for scanning",
            path: payload.clone(),
            source,
        })?;
        let request = RetroScanRequest {
            inspection_id: pending.inspection_id.clone(),
            subject_sha256: entry.sha256.clone(),
            subject_bytes: entry.size_bytes,
        };
        let evidence = scanner
            .scan(&mut file, &request)
            .map_err(RetroImportError::ScannerUnavailable)?;
        validate_scan_evidence(&evidence, &request)?;
        Ok(evidence)
    }

    fn publish_content_object(
        &self,
        pending: &PendingInstall,
        payload: &Path,
    ) -> Result<(), RetroImportError> {
        let entry = pending.intent.install_entry_required()?;
        let final_path = self.final_object_path(entry);
        if path_exists(&final_path)? {
            self.verify_object(entry)?;
            return Ok(());
        }
        require_regular_file(payload, "staged retro content")?;
        fs::hard_link(payload, &final_path).map_err(|source| {
            if source.kind() == io::ErrorKind::AlreadyExists {
                RetroImportError::ContentAlreadyExists(entry.entry_id.clone())
            } else {
                RetroImportError::Io {
                    operation: "publish retro content object",
                    path: final_path.clone(),
                    source,
                }
            }
        })?;
        sync_directory(&self.object_root)?;
        self.verify_object(entry)
    }

    fn publish_library(
        &self,
        library: &RetroInstalledLibrary,
        plan_id: &str,
    ) -> Result<(), RetroImportError> {
        validate_library(library)?;
        let bytes = serialized_bounded(
            library,
            MAX_LIBRARY_DOCUMENT_BYTES,
            "retro installed library",
        )?;
        let final_path = self.library_path(library.generation);
        if path_exists(&final_path)? {
            let observed = read_library(&final_path)?;
            if observed == *library {
                return Ok(());
            }
            return Err(RetroImportError::CommittedLibraryMismatch);
        }
        let temporary = self.staging_root.join(format!(".library-{plan_id}.tmp"));
        publish_new_file_resumable(
            &self.library_root,
            &temporary,
            &final_path,
            &bytes,
            "retro installed library",
        )
    }

    fn publish_or_verify_audit(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
        let stage_receipt = self.stage_directory(pending).join("scan.json");
        if path_exists(&stage_receipt)? {
            let scan = read_scan_receipt(&stage_receipt, pending)?;
            return self.publish_or_verify_audit_with_scan(pending, &scan);
        }
        let path = self.audit_path(&pending.intent.plan_id);
        if !path_exists(&path)? {
            return Err(RetroImportError::MissingScanReceipt);
        }
        let expected = read_audit(&path)?;
        validate_audit(&expected, pending)?;
        Ok(())
    }

    fn publish_or_verify_audit_with_scan(
        &self,
        pending: &PendingInstall,
        scan: &RetroScanEvidence,
    ) -> Result<(), RetroImportError> {
        let audit = NativeAuditRecord::from_pending(pending, Some(scan))?;
        let path = self.audit_path(&pending.intent.plan_id);
        if path_exists(&path)? {
            let existing = read_audit(&path)?;
            if existing == audit {
                return Ok(());
            }
            return Err(RetroImportError::AuditMismatch);
        }
        let bytes = serialized_bounded(&audit, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
        let temporary = self
            .staging_root
            .join(format!(".audit-{}.tmp", pending.intent.plan_id));
        publish_new_file_resumable(
            &self.audit_root,
            &temporary,
            &path,
            &bytes,
            "retro import audit",
        )
    }

    fn publish_terminal_audit(
        &self,
        plan_id: &str,
        audit: &NativeAuditRecord,
    ) -> Result<(), RetroImportError> {
        let path = self.audit_path(plan_id);
        let temporary = self.staging_root.join(format!(".audit-{plan_id}.tmp"));
        if path_exists(&path)? {
            let existing = read_audit(&path)?;
            if existing == *audit {
                if remove_regular_file_if_present(&temporary)? {
                    sync_directory(&self.staging_root)?;
                }
                return Ok(());
            }
            return Err(RetroImportError::AuditMismatch);
        }
        let bytes = serialized_bounded(audit, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
        publish_new_file_resumable(
            &self.audit_root,
            &temporary,
            &path,
            &bytes,
            "retro import audit",
        )
    }

    fn cleanup_replaced_object(
        &self,
        base: &RetroInstalledLibrary,
        next: &RetroInstalledLibrary,
        intent: &RetroImportCommitIntent,
    ) -> Result<(), RetroImportError> {
        if intent.action != CommitAction::ReplaceExisting {
            return Ok(());
        }
        let target = replacement_entry(base, intent)?;
        if next
            .entries
            .iter()
            .any(|entry| entry.entry_id == target.entry_id)
        {
            return Err(RetroImportError::ReplacementStillReferenced);
        }
        let path = self.final_object_path(target);
        if !path_exists(&path)? {
            return Ok(());
        }
        self.verify_object(target)?;
        fs::remove_file(&path).map_err(|source| RetroImportError::Io {
            operation: "remove replaced retro content object",
            path: path.clone(),
            source,
        })?;
        sync_directory(&self.object_root)
    }

    fn finish_cleanup(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
        self.remove_stage_if_present(pending)?;
        for path in [
            self.staging_root
                .join(format!(".library-{}.tmp", pending.intent.plan_id)),
            self.staging_root
                .join(format!(".audit-{}.tmp", pending.intent.plan_id)),
        ] {
            remove_regular_file_if_present(&path)?;
        }
        sync_directory(&self.staging_root)?;
        let path = self.staging_root.join(PENDING_INTENT_FILE);
        require_regular_file(&path, "retro import pending state")?;
        fs::remove_file(&path).map_err(|source| RetroImportError::Io {
            operation: "remove completed retro import intent",
            path: path.clone(),
            source,
        })?;
        sync_directory(&self.staging_root)
    }

    fn abort_pending(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
        let current = self.current_library()?;
        if current.generation != pending.intent.expected_library_generation {
            return Err(RetroImportError::RecoveryRequired);
        }
        let final_path = self.final_object_path(pending.intent.install_entry_required()?);
        if path_exists(&final_path)? {
            return Err(RetroImportError::RecoveryRequired);
        }
        self.remove_stage_if_present(pending)?;
        let path = self.staging_root.join(PENDING_INTENT_FILE);
        if path_exists(&path)? {
            require_regular_file(&path, "retro import pending state")?;
            fs::remove_file(&path).map_err(|source| RetroImportError::Io {
                operation: "remove rejected retro import intent",
                path: path.clone(),
                source,
            })?;
            sync_directory(&self.staging_root)?;
        }
        self.remove_unpublished_temp_if_present()?;
        Ok(())
    }

    fn remove_stage_if_present(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
        let stage = self.stage_directory(pending);
        if !path_exists(&stage)? {
            return Ok(());
        }
        require_direct_directory(&stage, &self.staging_root, "retro import staging directory")?;
        for entry in fs::read_dir(&stage).map_err(|source| RetroImportError::Io {
            operation: "enumerate retro import staging directory",
            path: stage.clone(),
            source,
        })? {
            let entry = entry.map_err(|source| RetroImportError::Io {
                operation: "enumerate retro import staging entry",
                path: stage.clone(),
                source,
            })?;
            let name = entry.file_name();
            if name != "payload" && name != "scan.json" {
                return Err(RetroImportError::UnsafePath(entry.path()));
            }
            require_regular_file(&entry.path(), "retro import staging entry")?;
            fs::remove_file(entry.path()).map_err(|source| RetroImportError::Io {
                operation: "remove retro import staging entry",
                path: entry.path(),
                source,
            })?;
        }
        fs::remove_dir(&stage).map_err(|source| RetroImportError::Io {
            operation: "remove retro import staging directory",
            path: stage.clone(),
            source,
        })?;
        sync_directory(&self.staging_root)
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
        self.entries.iter().find(|entry| entry.entry_id == entry_id)
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PendingInstall {
    schema_version: u32,
    inspection_id: String,
    plan_expires_at_ms: u64,
    policy: RetroPlainSystemPolicy,
    intent_authority_sha256: String,
    intent: RetroImportCommitIntent,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroImportCommitIntent {
    schema_version: u32,
    plan_id: String,
    expected_library_generation: u64,
    action: CommitAction,
    source_handle: String,
    source_sha256: String,
    install_entry: Option<RetroInstalledEntry>,
    existing_entry_id: Option<String>,
    cleanup_staging_after_terminal: bool,
    audit: RetroImportAuditEvent,
}

impl RetroImportCommitIntent {
    fn install_entry_required(&self) -> Result<&RetroInstalledEntry, RetroImportError> {
        self.install_entry
            .as_ref()
            .ok_or(RetroImportError::InstallEntryRequired)
    }

    fn require_install_action(&self) -> Result<(), RetroImportError> {
        match self.action {
            CommitAction::InstallNew | CommitAction::ReplaceExisting => Ok(()),
            CommitAction::CancelAndCleanup | CommitAction::ReuseExisting => {
                Err(RetroImportError::UnsupportedAction)
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum CommitAction {
    CancelAndCleanup,
    InstallNew,
    ReplaceExisting,
    ReuseExisting,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroImportAuditEvent {
    event: AuditEventKind,
    plan_id: String,
    policy_id: String,
    policy_revision: u64,
    session_id: String,
    transport: RetroSessionTransport,
    system_id: String,
    content_sha256: String,
    entitlement_statement_version: EntitlementStatement,
    decision: AuditDecision,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AuditEventKind {
    RetroImportTerminalIntent,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AuditDecision {
    Cancel,
    Install,
    KeepBoth,
    ReplaceExisting,
    UseExisting,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroInstalledLibrary {
    schema_version: u32,
    generation: u64,
    entries: Vec<RetroInstalledEntry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroInstalledEntry {
    entry_id: String,
    system_id: String,
    sha256: String,
    size_bytes: u64,
    extension: String,
    title: String,
    core_id: String,
    controller_profile: String,
    provenance: RetroInstalledProvenance,
}

/// Path-free provenance recorded on one installed entry.
///
/// The transport tags the variant, so a record can only carry the evidence
/// its transport actually produced. An operator-provisioned entry has no
/// session, acknowledgement, or import time to state, and cannot be
/// constructed with substitutes for them.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "transport", rename_all = "kebab-case")]
enum RetroInstalledProvenance {
    OperatorProvisioned(RetroOperatorProvenance),
    PairedLan(RetroSessionProvenance),
    Usb(RetroSessionProvenance),
}

impl RetroInstalledProvenance {
    /// Provenance for content an operator staged onto the target themselves.
    ///
    /// It takes no arguments because provisioning produces no evidence to
    /// record: no session, no acknowledgement, no scan, and no time this
    /// console observed.
    const fn operator_provisioned() -> Self {
        Self::OperatorProvisioned(RetroOperatorProvenance {})
    }

    const fn session(&self) -> Option<(RetroSessionTransport, &RetroSessionProvenance)> {
        match self {
            Self::OperatorProvisioned(_) => None,
            Self::PairedLan(session) => Some((RetroSessionTransport::PairedLan, session)),
            Self::Usb(session) => Some((RetroSessionTransport::Usb, session)),
        }
    }

    fn validate(&self) -> Result<(), RetroImportError> {
        let Some((_, session)) = self.session() else {
            return Ok(());
        };
        validate_prefixed_hex_id(
            "installed session ID",
            &session.import_session_id,
            "ris-",
            32,
        )?;
        if session.imported_at_ms > MAX_SAFE_INTEGER {
            return Err(RetroImportError::InvalidLibrary(
                "import time exceeds the interoperable integer range".to_owned(),
            ));
        }
        Ok(())
    }
}

/// Evidence one operator provisioning run produced.
///
/// Deliberately empty and closed: an operator-provisioned record cannot carry
/// a session ID, an entitlement acknowledgement, or an import time, and a
/// document that supplies one is rejected rather than quietly stripped.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct RetroOperatorProvenance {}

/// Evidence one live USB or paired-LAN import session produced.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetroSessionProvenance {
    import_session_id: String,
    entitlement_statement_version: EntitlementStatement,
    imported_at_ms: u64,
}

/// Transport a terminal intent and its native audit record may name.
///
/// Operator provisioning issues no terminal intent, so it is deliberately
/// absent from this vocabulary.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum RetroSessionTransport {
    PairedLan,
    Usb,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum EntitlementStatement {
    VcgUserEntitledContentV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ScanScope {
    ContainerAndExpandedPayloads,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeAuditRecord {
    schema_version: u32,
    event: NativeAuditEventKind,
    plan_id: String,
    policy_id: String,
    policy_revision: u64,
    session_id: String,
    transport: RetroSessionTransport,
    system_id: String,
    content_sha256: String,
    entitlement_statement_version: EntitlementStatement,
    decision: AuditDecision,
    library_generation: u64,
    scan: Option<RetroScanEvidence>,
}

impl NativeAuditRecord {
    fn from_pending(
        pending: &PendingInstall,
        scan: Option<&RetroScanEvidence>,
    ) -> Result<Self, RetroImportError> {
        let generation = pending
            .intent
            .expected_library_generation
            .checked_add(1)
            .ok_or(RetroImportError::LibraryGenerationOverflow)?;
        Ok(Self {
            schema_version: SCHEMA_VERSION,
            event: NativeAuditEventKind::Committed,
            plan_id: pending.intent.plan_id.clone(),
            policy_id: pending.intent.audit.policy_id.clone(),
            policy_revision: pending.intent.audit.policy_revision,
            session_id: pending.intent.audit.session_id.clone(),
            transport: pending.intent.audit.transport,
            system_id: pending.intent.audit.system_id.clone(),
            content_sha256: pending.intent.audit.content_sha256.clone(),
            entitlement_statement_version: pending.intent.audit.entitlement_statement_version,
            decision: pending.intent.audit.decision,
            library_generation: generation,
            scan: scan.cloned(),
        })
    }

    fn from_no_copy(
        intent: &RetroImportCommitIntent,
        library_generation: u64,
    ) -> Result<Self, RetroImportError> {
        let event = match intent.action {
            CommitAction::CancelAndCleanup => NativeAuditEventKind::Cancelled,
            CommitAction::ReuseExisting => NativeAuditEventKind::Reused,
            CommitAction::InstallNew | CommitAction::ReplaceExisting => {
                return Err(RetroImportError::UnsupportedAction);
            }
        };
        Ok(Self {
            schema_version: SCHEMA_VERSION,
            event,
            plan_id: intent.plan_id.clone(),
            policy_id: intent.audit.policy_id.clone(),
            policy_revision: intent.audit.policy_revision,
            session_id: intent.audit.session_id.clone(),
            transport: intent.audit.transport,
            system_id: intent.audit.system_id.clone(),
            content_sha256: intent.audit.content_sha256.clone(),
            entitlement_statement_version: intent.audit.entitlement_statement_version,
            decision: intent.audit.decision,
            library_generation,
            scan: None,
        })
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
enum NativeAuditEventKind {
    #[serde(rename = "retro-import-cancelled")]
    Cancelled,
    #[serde(rename = "retro-import-committed")]
    Committed,
    #[serde(rename = "retro-import-reused")]
    Reused,
}

/// Path-free record of one operator provisioning run.
///
/// It carries no session, no entitlement acknowledgement, and no scan
/// evidence, because provisioning produces none of them. What it does carry
/// is checkable: the hash of the exact staged manifest that was read, and the
/// hash of the exact library generation that was published.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeProvisionAuditRecord {
    schema_version: u32,
    event: NativeProvisionAuditEventKind,
    provisioning_id: String,
    policy_id: String,
    policy_revision: u64,
    system_id: String,
    staged_manifest_sha256: String,
    committed_entries: usize,
    already_installed_entries: usize,
    committed_bytes: u64,
    library_generation: u64,
    library_sha256: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
enum NativeProvisionAuditEventKind {
    #[serde(rename = "retro-operator-provisioned")]
    Provisioned,
}

enum ResumePending {
    Completed(RetroImportOutcome),
    Incomplete,
    Rejected(RetroScanStatus),
}

/// Exact manifest written beside a staged operator payload.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedContentManifest {
    schema_version: u32,
    document_type: String,
    system_id: String,
    core_id: String,
    controller_profile: String,
    provenance: String,
    source_label: String,
    entry_count: usize,
    total_bytes: u64,
    entries: Vec<StagedContentEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedContentEntry {
    entry_id: String,
    system_id: String,
    sha256: String,
    size_bytes: u64,
    extension: String,
    title: String,
    core_id: String,
    controller_profile: String,
    object_name: String,
    container: StagedContainer,
}

#[derive(Clone, Copy, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum StagedContainer {
    Plain,
    Zip,
}

/// One validated staged object and the installed entry it would become.
struct StagedObject {
    object_name: String,
    entry: RetroInstalledEntry,
}

/// A whole staged payload, validated against one release policy.
struct StagedPayload {
    provisioning_id: String,
    manifest_sha256: String,
    system_id: String,
    objects: Vec<StagedObject>,
    archive_extracted: usize,
    total_bytes: u64,
}

struct StagedPayloadRoots {
    objects: PathBuf,
    manifest: PathBuf,
}

struct StagedPartition<'a> {
    additions: Vec<&'a StagedObject>,
    installed: Vec<&'a StagedObject>,
}

fn staged_payload_roots(payload_root: &Path) -> Result<StagedPayloadRoots, RetroImportError> {
    let root = canonical_directory("retro staged payload root", payload_root)?;
    let objects = canonical_direct_directory(
        "retro staged payload object root",
        &root,
        &root.join(RETRO_CONTENT_OBJECTS_DIRECTORY),
    )?;
    let manifest = canonical_direct_file(
        "retro staged payload manifest",
        &root,
        &root.join(RETRO_STAGED_MANIFEST_FILE),
    )?;
    Ok(StagedPayloadRoots { objects, manifest })
}

fn read_staged_payload<'policy>(
    manifest_path: &Path,
    policies: StagedPolicyView<'policy>,
) -> Result<(StagedPayload, &'policy RetroOperatorProvisionPolicy), RetroImportError> {
    let bytes = read_bytes_bounded(
        manifest_path,
        MAX_STAGED_MANIFEST_BYTES,
        "retro staged content manifest",
    )?;
    let manifest_sha256 = encode_hex(&Sha256::digest(&bytes));
    let manifest: StagedContentManifest = serde_json::from_slice(&bytes)
        .map_err(|error| RetroImportError::InvalidStagedPayload(error.to_string()))?;
    if manifest.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(manifest.schema_version));
    }
    if manifest.document_type != STAGED_DOCUMENT_TYPE {
        return Err(RetroImportError::InvalidStagedPayload(format!(
            "staged manifest document type must be {STAGED_DOCUMENT_TYPE}"
        )));
    }
    if manifest.provenance != STAGED_PROVENANCE_LABEL {
        return Err(RetroImportError::InvalidStagedPayload(format!(
            "staged manifest provenance must be {STAGED_PROVENANCE_LABEL}"
        )));
    }
    validate_bounded_text("staged source label", &manifest.source_label, 1, 120)?;
    let policy = policies.select(&manifest.system_id)?;
    if manifest.core_id != policy.core_id
        || manifest.controller_profile != policy.controller_profile
    {
        return Err(RetroImportError::PolicyBindingMismatch);
    }
    if manifest.entry_count != manifest.entries.len() {
        return Err(RetroImportError::InvalidStagedPayload(
            "staged entry count does not match the staged entries".to_owned(),
        ));
    }
    if manifest.entries.len() > MAX_LIBRARY_ENTRIES {
        return Err(RetroImportError::InvalidStagedPayload(format!(
            "staged entry count exceeds the {MAX_LIBRARY_ENTRIES}-entry installed-library schema"
        )));
    }

    let mut objects = Vec::with_capacity(manifest.entries.len());
    let mut identifiers = HashSet::with_capacity(manifest.entries.len());
    let mut archive_extracted = 0_usize;
    let mut total_bytes = 0_u64;
    for staged in manifest.entries {
        let entry = RetroInstalledEntry {
            entry_id: staged.entry_id,
            system_id: staged.system_id,
            sha256: staged.sha256,
            size_bytes: staged.size_bytes,
            extension: staged.extension,
            title: staged.title,
            core_id: staged.core_id,
            controller_profile: staged.controller_profile,
            provenance: RetroInstalledProvenance::operator_provisioned(),
        };
        validate_entry(&entry)?;
        if !policy.accepts(&entry) {
            return Err(RetroImportError::PolicyBindingMismatch);
        }
        let object_name = format!("{}-{}{}", entry.system_id, entry.entry_id, entry.extension);
        if staged.object_name != object_name {
            return Err(RetroImportError::InvalidStagedPayload(format!(
                "staged object name must be {object_name}"
            )));
        }
        if !identifiers.insert(entry.entry_id.clone()) {
            return Err(RetroImportError::InvalidStagedPayload(
                "staged entry IDs must be unique".to_owned(),
            ));
        }
        if staged.container == StagedContainer::Zip {
            archive_extracted += 1;
        }
        total_bytes = total_bytes
            .checked_add(entry.size_bytes)
            .ok_or(RetroImportError::CapacityOverflow)?;
        objects.push(StagedObject { object_name, entry });
    }
    if manifest.total_bytes != total_bytes {
        return Err(RetroImportError::InvalidStagedPayload(
            "staged total bytes do not match the staged entries".to_owned(),
        ));
    }
    Ok((
        StagedPayload {
            provisioning_id: format!(
                "{PROVISION_ID_PREFIX}{}",
                &manifest_sha256[..PROVISION_ID_HEX_LENGTH]
            ),
            manifest_sha256,
            system_id: manifest.system_id,
            objects,
            archive_extracted,
            total_bytes,
        },
        policy,
    ))
}

fn partition_staged_objects<'a>(
    current: &RetroInstalledLibrary,
    objects: &'a [StagedObject],
) -> Result<StagedPartition<'a>, RetroImportError> {
    let mut additions = Vec::new();
    let mut installed = Vec::new();
    for object in objects {
        match current
            .entries
            .iter()
            .find(|entry| entry.entry_id == object.entry.entry_id)
        {
            Some(existing) => {
                if existing.system_id != object.entry.system_id {
                    return Err(RetroImportError::StagedSystemConflict(
                        object.entry.entry_id.clone(),
                    ));
                }
                installed.push(object);
            }
            None => additions.push(object),
        }
    }
    Ok(StagedPartition {
        additions,
        installed,
    })
}

fn cloned_entries(objects: &[&StagedObject]) -> Vec<RetroInstalledEntry> {
    objects.iter().map(|object| object.entry.clone()).collect()
}

fn build_provisioned_library(
    current: &RetroInstalledLibrary,
    additions: &[RetroInstalledEntry],
    policy: &RetroOperatorProvisionPolicy,
) -> Result<RetroInstalledLibrary, RetroImportError> {
    validate_library(current)?;
    let mut entries = current.entries.clone();
    entries.extend_from_slice(additions);
    entries.sort_by(|left, right| left.entry_id.cmp(&right.entry_id));
    if entries.len() > policy.max_library_entries {
        return Err(RetroImportError::LibraryQuotaExceeded);
    }
    let total = entries.iter().try_fold(0_u64, |sum, entry| {
        sum.checked_add(entry.size_bytes)
            .ok_or(RetroImportError::CapacityOverflow)
    })?;
    if total > policy.max_library_bytes {
        return Err(RetroImportError::LibraryQuotaExceeded);
    }
    let generation = current
        .generation
        .checked_add(1)
        .ok_or(RetroImportError::LibraryGenerationOverflow)?;
    if generation > MAX_SAFE_INTEGER {
        return Err(RetroImportError::LibraryGenerationOverflow);
    }
    let next = RetroInstalledLibrary {
        schema_version: SCHEMA_VERSION,
        generation,
        entries,
    };
    validate_library(&next)?;
    Ok(next)
}

fn verify_staged_object(
    payload_objects: &Path,
    object: &StagedObject,
) -> Result<(), RetroImportError> {
    let path = payload_objects.join(&object.object_name);
    verify_file_hash(&path, object.entry.size_bytes, &object.entry.sha256).map_err(|error| {
        if matches!(error, RetroImportError::CommittedContentMismatch) {
            RetroImportError::StagedContentMismatch(object.object_name.clone())
        } else {
            error
        }
    })
}

fn parse_commit_intent(bytes: &[u8]) -> Result<RetroImportCommitIntent, RetroImportError> {
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_COMMIT_INTENT_BYTES {
        return Err(RetroImportError::IntentTooLarge {
            maximum: MAX_COMMIT_INTENT_BYTES,
        });
    }
    let intent: RetroImportCommitIntent = serde_json::from_slice(bytes)
        .map_err(|error| RetroImportError::InvalidIntent(error.to_string()))?;
    validate_commit_intent(&intent)?;
    Ok(intent)
}

fn validate_install_authority(
    intent: &RetroImportCommitIntent,
    context: &RetroPlainImportContext,
    now_ms: u64,
) -> Result<(), RetroImportError> {
    validate_terminal_authority(intent, context)?;
    validate_active_authority(context, now_ms)
}

fn validate_terminal_authority(
    intent: &RetroImportCommitIntent,
    context: &RetroPlainImportContext,
) -> Result<(), RetroImportError> {
    validate_commit_intent(intent)?;
    if canonical_intent_sha256(intent)? != context.intent_authority_sha256 {
        return Err(RetroImportError::IntentAuthorityMismatch);
    }
    context.policy.validate()?;
    validate_prefixed_hex_id("inspection ID", &context.inspection_id, "rii-", 32)?;
    validate_context_policy_binding(intent, context)
}

fn validate_active_authority(
    context: &RetroPlainImportContext,
    now_ms: u64,
) -> Result<(), RetroImportError> {
    if now_ms > MAX_SAFE_INTEGER || now_ms >= context.plan_expires_at_ms {
        return Err(RetroImportError::PlanExpired);
    }
    if context.session_revoked {
        return Err(RetroImportError::SessionRevoked);
    }
    Ok(())
}

fn validate_context_policy_binding(
    intent: &RetroImportCommitIntent,
    context: &RetroPlainImportContext,
) -> Result<(), RetroImportError> {
    let audit = &intent.audit;
    if audit.policy_id != context.policy.policy_id
        || audit.policy_revision != context.policy.policy_revision
        || audit.system_id != context.policy.system_id
    {
        return Err(RetroImportError::PolicyBindingMismatch);
    }
    if let Some(entry) = &intent.install_entry
        && (entry.system_id != context.policy.system_id
            || entry.extension != context.policy.extension
            || entry.core_id != context.policy.core_id
            || entry.controller_profile != context.policy.controller_profile
            || entry.size_bytes > context.policy.max_content_bytes)
    {
        return Err(RetroImportError::PolicyBindingMismatch);
    }
    Ok(())
}

fn validate_pending(pending: &PendingInstall) -> Result<(), RetroImportError> {
    if pending.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(pending.schema_version));
    }
    validate_prefixed_hex_id("inspection ID", &pending.inspection_id, "rii-", 32)?;
    if pending.plan_expires_at_ms > MAX_SAFE_INTEGER {
        return Err(RetroImportError::InvalidPendingState(
            "plan expiry exceeds the interoperable integer range".to_owned(),
        ));
    }
    pending.policy.validate()?;
    validate_commit_intent(&pending.intent)?;
    pending.intent.require_install_action()?;
    validate_sha256("intent authority SHA-256", &pending.intent_authority_sha256)?;
    if canonical_intent_sha256(&pending.intent)? != pending.intent_authority_sha256 {
        return Err(RetroImportError::IntentAuthorityMismatch);
    }
    let entry = pending.intent.install_entry_required()?;
    if pending.intent.audit.policy_id != pending.policy.policy_id
        || pending.intent.audit.policy_revision != pending.policy.policy_revision
        || entry.system_id != pending.policy.system_id
        || entry.extension != pending.policy.extension
        || entry.core_id != pending.policy.core_id
        || entry.controller_profile != pending.policy.controller_profile
        || entry.size_bytes > pending.policy.max_content_bytes
    {
        return Err(RetroImportError::PolicyBindingMismatch);
    }
    Ok(())
}

fn validate_pending_cancellation_binding(
    pending: &PendingInstall,
    cancellation: &RetroImportCommitIntent,
    context: &RetroPlainImportContext,
) -> Result<(), RetroImportError> {
    let pending_intent = &pending.intent;
    let pending_audit = &pending_intent.audit;
    let cancellation_audit = &cancellation.audit;
    if pending.inspection_id != context.inspection_id
        || pending.plan_expires_at_ms != context.plan_expires_at_ms
        || pending.policy != context.policy
        || pending_intent.plan_id != cancellation.plan_id
        || pending_intent.expected_library_generation != cancellation.expected_library_generation
        || pending_intent.source_handle != cancellation.source_handle
        || pending_intent.source_sha256 != cancellation.source_sha256
        || pending_intent.cleanup_staging_after_terminal
            != cancellation.cleanup_staging_after_terminal
        || pending_audit.event != cancellation_audit.event
        || pending_audit.plan_id != cancellation_audit.plan_id
        || pending_audit.policy_id != cancellation_audit.policy_id
        || pending_audit.policy_revision != cancellation_audit.policy_revision
        || pending_audit.session_id != cancellation_audit.session_id
        || pending_audit.transport != cancellation_audit.transport
        || pending_audit.system_id != cancellation_audit.system_id
        || pending_audit.content_sha256 != cancellation_audit.content_sha256
        || pending_audit.entitlement_statement_version
            != cancellation_audit.entitlement_statement_version
    {
        return Err(RetroImportError::IntentBindingMismatch);
    }
    Ok(())
}

fn canonical_intent_sha256(intent: &RetroImportCommitIntent) -> Result<String, RetroImportError> {
    let bytes = serialized_bounded(
        intent,
        MAX_COMMIT_INTENT_BYTES,
        "retro import terminal intent",
    )?;
    Ok(encode_hex(&Sha256::digest(bytes)))
}

fn validate_commit_intent(intent: &RetroImportCommitIntent) -> Result<(), RetroImportError> {
    if intent.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(intent.schema_version));
    }
    validate_safe_id("plan ID", &intent.plan_id, 80)?;
    validate_prefixed_hex_id("source handle", &intent.source_handle, "rih-", 32)?;
    validate_sha256("source SHA-256", &intent.source_sha256)?;
    if intent.expected_library_generation == 0
        || intent.expected_library_generation > MAX_SAFE_INTEGER
    {
        return Err(RetroImportError::InvalidIntent(
            "expected library generation must be a positive safe integer".to_owned(),
        ));
    }
    if !intent.cleanup_staging_after_terminal {
        return Err(RetroImportError::InvalidIntent(
            "terminal intent must require staging cleanup".to_owned(),
        ));
    }
    let audit = &intent.audit;
    if audit.plan_id != intent.plan_id
        || audit.content_sha256 != intent.source_sha256
        || audit.policy_revision == 0
        || audit.policy_revision > MAX_SAFE_INTEGER
    {
        return Err(RetroImportError::IntentBindingMismatch);
    }
    validate_safe_id("audit policy ID", &audit.policy_id, 64)?;
    validate_bindable_id("audit system ID", &audit.system_id)?;
    validate_prefixed_hex_id("audit session ID", &audit.session_id, "ris-", 32)?;
    validate_sha256("audit content SHA-256", &audit.content_sha256)?;

    match intent.action {
        CommitAction::InstallNew => {
            let entry = intent.install_entry_required()?;
            validate_install_entry_binding(intent, entry)?;
            if intent.existing_entry_id.is_some()
                || !matches!(
                    intent.audit.decision,
                    AuditDecision::Install | AuditDecision::KeepBoth
                )
            {
                return Err(RetroImportError::IntentBindingMismatch);
            }
        }
        CommitAction::ReplaceExisting => {
            let entry = intent.install_entry_required()?;
            validate_install_entry_binding(intent, entry)?;
            let existing = intent
                .existing_entry_id
                .as_deref()
                .ok_or(RetroImportError::ReplacementEntryRequired)?;
            validate_content_id(existing)?;
            if existing == entry.entry_id || intent.audit.decision != AuditDecision::ReplaceExisting
            {
                return Err(RetroImportError::IntentBindingMismatch);
            }
        }
        CommitAction::CancelAndCleanup => {
            if intent.install_entry.is_some()
                || intent.existing_entry_id.is_some()
                || intent.audit.decision != AuditDecision::Cancel
            {
                return Err(RetroImportError::IntentBindingMismatch);
            }
        }
        CommitAction::ReuseExisting => {
            let existing = intent
                .existing_entry_id
                .as_deref()
                .ok_or(RetroImportError::ExistingEntryRequired)?;
            validate_content_id(existing)?;
            if intent.install_entry.is_some() || intent.audit.decision != AuditDecision::UseExisting
            {
                return Err(RetroImportError::IntentBindingMismatch);
            }
        }
    }
    Ok(())
}

fn validate_install_entry_binding(
    intent: &RetroImportCommitIntent,
    entry: &RetroInstalledEntry,
) -> Result<(), RetroImportError> {
    validate_entry(entry)?;
    let Some((transport, session)) = entry.provenance.session() else {
        return Err(RetroImportError::TransportNotSessionBound);
    };
    let audit = &intent.audit;
    if intent.source_sha256 != entry.sha256
        || audit.system_id != entry.system_id
        || audit.transport != transport
        || audit.session_id != session.import_session_id
        || audit.entitlement_statement_version != session.entitlement_statement_version
    {
        return Err(RetroImportError::IntentBindingMismatch);
    }
    Ok(())
}

fn validate_library(library: &RetroInstalledLibrary) -> Result<(), RetroImportError> {
    if library.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(library.schema_version));
    }
    if library.generation == 0 || library.generation > MAX_SAFE_INTEGER {
        return Err(RetroImportError::InvalidLibrary(
            "generation must be a positive safe integer".to_owned(),
        ));
    }
    if library.entries.len() > MAX_LIBRARY_ENTRIES {
        return Err(RetroImportError::InvalidLibrary(
            "entry count exceeds the installed-library schema".to_owned(),
        ));
    }
    let mut ids = HashSet::with_capacity(library.entries.len());
    let mut content_keys = HashSet::with_capacity(library.entries.len());
    for entry in &library.entries {
        validate_entry(entry)?;
        if !ids.insert(entry.entry_id.clone()) {
            return Err(RetroImportError::InvalidLibrary(
                "entry IDs must be unique".to_owned(),
            ));
        }
        if !content_keys.insert((entry.system_id.clone(), entry.sha256.clone())) {
            return Err(RetroImportError::InvalidLibrary(
                "system and content hash pairs must be unique".to_owned(),
            ));
        }
    }
    Ok(())
}

fn validate_entry(entry: &RetroInstalledEntry) -> Result<(), RetroImportError> {
    validate_content_id(&entry.entry_id)?;
    validate_bindable_id("installed system ID", &entry.system_id)?;
    validate_sha256("installed SHA-256", &entry.sha256)?;
    if entry.entry_id != format!("content-{}", entry.sha256) {
        return Err(RetroImportError::InvalidLibrary(
            "entry ID must derive from the full content hash".to_owned(),
        ));
    }
    if entry.size_bytes == 0 || entry.size_bytes > MAX_SAFE_INTEGER {
        return Err(RetroImportError::InvalidLibrary(
            "entry bytes must be a positive safe integer".to_owned(),
        ));
    }
    validate_extension(&entry.extension)?;
    validate_visible_title(&entry.title)?;
    validate_bindable_id("installed core ID", &entry.core_id)?;
    validate_safe_id(
        "installed controller profile",
        &entry.controller_profile,
        64,
    )?;
    entry.provenance.validate()
}

fn build_next_library(
    current: &RetroInstalledLibrary,
    intent: &RetroImportCommitIntent,
    policy: &RetroPlainSystemPolicy,
) -> Result<RetroInstalledLibrary, RetroImportError> {
    validate_library(current)?;
    let mut entries = current.entries.clone();
    let new_entry = intent.install_entry_required()?.clone();
    if entries
        .iter()
        .any(|entry| entry.entry_id == new_entry.entry_id)
    {
        return Err(RetroImportError::ContentAlreadyExists(
            new_entry.entry_id.clone(),
        ));
    }
    if intent.action == CommitAction::ReplaceExisting {
        let target_id = intent
            .existing_entry_id
            .as_deref()
            .ok_or(RetroImportError::ReplacementEntryRequired)?;
        let index = entries
            .iter()
            .position(|entry| entry.entry_id == target_id)
            .ok_or_else(|| RetroImportError::ReplacementMissing(target_id.to_owned()))?;
        entries.remove(index);
    }
    entries.push(new_entry);
    entries.sort_by(|left, right| left.entry_id.cmp(&right.entry_id));
    if entries.len() > policy.max_library_entries {
        return Err(RetroImportError::LibraryQuotaExceeded);
    }
    let total = entries.iter().try_fold(0_u64, |sum, entry| {
        sum.checked_add(entry.size_bytes)
            .ok_or(RetroImportError::CapacityOverflow)
    })?;
    if total > policy.max_library_bytes {
        return Err(RetroImportError::LibraryQuotaExceeded);
    }
    let generation = current
        .generation
        .checked_add(1)
        .ok_or(RetroImportError::LibraryGenerationOverflow)?;
    if generation > MAX_SAFE_INTEGER {
        return Err(RetroImportError::LibraryGenerationOverflow);
    }
    let next = RetroInstalledLibrary {
        schema_version: SCHEMA_VERSION,
        generation,
        entries,
    };
    validate_library(&next)?;
    Ok(next)
}

fn replacement_entry<'a>(
    library: &'a RetroInstalledLibrary,
    intent: &RetroImportCommitIntent,
) -> Result<&'a RetroInstalledEntry, RetroImportError> {
    let id = intent
        .existing_entry_id
        .as_deref()
        .ok_or(RetroImportError::ReplacementEntryRequired)?;
    library
        .entries
        .iter()
        .find(|entry| entry.entry_id == id)
        .ok_or_else(|| RetroImportError::ReplacementMissing(id.to_owned()))
}

fn reuse_entry<'a>(
    library: &'a RetroInstalledLibrary,
    intent: &RetroImportCommitIntent,
) -> Result<&'a RetroInstalledEntry, RetroImportError> {
    let id = intent
        .existing_entry_id
        .as_deref()
        .ok_or(RetroImportError::ExistingEntryRequired)?;
    let entry = library
        .entries
        .iter()
        .find(|entry| entry.entry_id == id)
        .ok_or_else(|| RetroImportError::ExistingEntryMissing(id.to_owned()))?;
    if entry.sha256 != intent.source_sha256 || entry.system_id != intent.audit.system_id {
        return Err(RetroImportError::IntentBindingMismatch);
    }
    Ok(entry)
}

fn outcome_from_pending(pending: &PendingInstall) -> Result<RetroImportOutcome, RetroImportError> {
    let entry = pending.intent.install_entry_required()?;
    Ok(RetroImportOutcome {
        plan_id: pending.intent.plan_id.clone(),
        entry_id: entry.entry_id.clone(),
        library_generation: pending
            .intent
            .expected_library_generation
            .checked_add(1)
            .ok_or(RetroImportError::LibraryGenerationOverflow)?,
        replaced_entry_id: pending.intent.existing_entry_id.clone(),
    })
}

fn validate_scan_evidence(
    evidence: &RetroScanEvidence,
    request: &RetroScanRequest,
) -> Result<(), RetroImportError> {
    validate_safe_id("scanner engine ID", &evidence.engine_id, 64)?;
    validate_bounded_text(
        "scanner rule-set revision",
        &evidence.rule_set_revision,
        1,
        128,
    )?;
    validate_prefixed_hex_id("scan inspection ID", &evidence.inspection_id, "rii-", 32)?;
    validate_sha256("scan subject SHA-256", &evidence.subject_sha256)?;
    if evidence.inspection_id != request.inspection_id
        || evidence.subject_sha256 != request.subject_sha256
    {
        return Err(RetroImportError::ScanBindingMismatch);
    }
    Ok(())
}

fn read_scan_receipt(
    path: &Path,
    pending: &PendingInstall,
) -> Result<RetroScanEvidence, RetroImportError> {
    require_regular_file(path, "retro scan receipt")?;
    let evidence: RetroScanEvidence =
        read_json_bounded(path, MAX_SCAN_RECEIPT_BYTES, "retro scan receipt")?;
    let entry = pending.intent.install_entry_required()?;
    let request = RetroScanRequest {
        inspection_id: pending.inspection_id.clone(),
        subject_sha256: entry.sha256.clone(),
        subject_bytes: entry.size_bytes,
    };
    validate_scan_evidence(&evidence, &request)?;
    Ok(evidence)
}

fn validate_audit(
    audit: &NativeAuditRecord,
    pending: &PendingInstall,
) -> Result<(), RetroImportError> {
    let expected_without_scan = NativeAuditRecord::from_pending(pending, audit.scan.as_ref())?;
    if audit != &expected_without_scan {
        return Err(RetroImportError::AuditMismatch);
    }
    let scan = audit
        .scan
        .as_ref()
        .ok_or(RetroImportError::MissingScanReceipt)?;
    let entry = pending.intent.install_entry_required()?;
    let request = RetroScanRequest {
        inspection_id: pending.inspection_id.clone(),
        subject_sha256: entry.sha256.clone(),
        subject_bytes: entry.size_bytes,
    };
    validate_scan_evidence(scan, &request)?;
    if scan.status != RetroScanStatus::Clean {
        return Err(RetroImportError::AuditMismatch);
    }
    Ok(())
}

fn validate_content_id(value: &str) -> Result<(), RetroImportError> {
    let Some(digest) = value.strip_prefix("content-") else {
        return Err(RetroImportError::InvalidLibrary(
            "content entry ID has an invalid prefix".to_owned(),
        ));
    };
    validate_sha256("content entry ID digest", digest)
}

fn validate_sha256(label: &'static str, value: &str) -> Result<(), RetroImportError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

fn validate_prefixed_hex_id(
    label: &'static str,
    value: &str,
    prefix: &str,
    hex_length: usize,
) -> Result<(), RetroImportError> {
    let Some(suffix) = value.strip_prefix(prefix) else {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    };
    if suffix.len() != hex_length
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

/// Validates one identifier a signed catalog package must be able to name.
///
/// A library package binds the library entry it launches by system and core
/// ID, and the installed catalog spells those two IDs in its intent-ID
/// grammar: lowercase ASCII alphanumerics with interior `-`, no `.`, up to 80
/// bytes. An ID this module accepted but the catalog could not spell would
/// name a system or core no package could ever bind, so the grammar here is
/// the catalog's, not the wider one [`validate_safe_id`] allows. The
/// `MAX_BINDABLE_ID_BYTES` ceiling stays inside the catalog's, so every ID
/// this accepts is bindable.
///
/// Identifiers no package names — policy ID, controller profile, plan ID,
/// scanner engine ID — keep the wider grammar; nothing binds them by name.
fn validate_bindable_id(label: &'static str, value: &str) -> Result<(), RetroImportError> {
    validate_safe_id(label, value, MAX_BINDABLE_ID_BYTES)?;
    if value.contains('.') {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

fn validate_safe_id(
    label: &'static str,
    value: &str,
    maximum: usize,
) -> Result<(), RetroImportError> {
    if value.is_empty()
        || value.len() > maximum
        || value.starts_with(['.', '-'])
        || value.ends_with(['.', '-'])
        || value
            .as_bytes()
            .windows(2)
            .any(|pair| matches!(pair, [b'.' | b'-', b'.' | b'-']))
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b".-".contains(&byte))
    {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

fn validate_extension(value: &str) -> Result<(), RetroImportError> {
    let Some(suffix) = value.strip_prefix('.') else {
        return Err(RetroImportError::InvalidExtension(value.to_owned()));
    };
    if suffix.is_empty()
        || suffix.len() > 8
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    {
        return Err(RetroImportError::InvalidExtension(value.to_owned()));
    }
    Ok(())
}

fn validate_visible_title(value: &str) -> Result<(), RetroImportError> {
    if value.is_empty()
        || value.chars().count() > 80
        || value.trim() != value
        || !is_nfc(value)
        || value.chars().any(|character| {
            is_unsafe_display_character(character) || matches!(character, '/' | '\\')
        })
    {
        return Err(RetroImportError::InvalidLibrary(
            "installed title is not a safe NFC display value".to_owned(),
        ));
    }
    Ok(())
}

fn is_unsafe_display_character(character: char) -> bool {
    let code_point = character as u32;
    character.is_control()
        || (character.is_whitespace() && character != ' ')
        || matches!(
            code_point,
            0x00ad
                | 0x061c
                | 0x180e
                | 0x200b..=0x200f
                | 0x202a..=0x202e
                | 0x2060..=0x2064
                | 0x2066..=0x206f
                | 0xfeff
                | 0xfff9..=0xfffb
                | 0x1bca0..=0x1bca3
                | 0x1d173..=0x1d17a
                | 0xe0001
                | 0xe0020..=0xe007f
        )
}

fn validate_bounded_text(
    label: &'static str,
    value: &str,
    minimum: usize,
    maximum: usize,
) -> Result<(), RetroImportError> {
    if value.chars().count() < minimum
        || value.chars().count() > maximum
        || value.chars().any(char::is_control)
    {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

fn parse_library_filename(value: &str) -> Option<u64> {
    let digits = value.strip_prefix("generation-")?.strip_suffix(".json")?;
    if digits.len() != 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let generation = digits.parse::<u64>().ok()?;
    (generation > 0 && generation <= MAX_SAFE_INTEGER).then_some(generation)
}

fn verify_file_hash(
    path: &Path,
    expected_bytes: u64,
    expected_sha256: &str,
) -> Result<(), RetroImportError> {
    require_regular_file(path, "retro content file")?;
    let mut file = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open retro content file",
        path: path.to_owned(),
        source,
    })?;
    let metadata = file.metadata().map_err(|source| RetroImportError::Io {
        operation: "inspect retro content file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.len() != expected_bytes {
        return Err(RetroImportError::CommittedContentMismatch);
    }
    let mut hasher = Sha256::new();
    let mut observed = 0_u64;
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|source| RetroImportError::Io {
                operation: "hash retro content file",
                path: path.to_owned(),
                source,
            })?;
        if read == 0 {
            break;
        }
        observed = observed
            .checked_add(u64::try_from(read).unwrap_or(u64::MAX))
            .ok_or(RetroImportError::CapacityOverflow)?;
        hasher.update(&buffer[..read]);
    }
    if observed != expected_bytes || encode_hex(&hasher.finalize()) != expected_sha256 {
        return Err(RetroImportError::CommittedContentMismatch);
    }
    Ok(())
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    output
}

fn serialized_bounded<T: Serialize>(
    value: &T,
    maximum: u64,
    label: &'static str,
) -> Result<Vec<u8>, RetroImportError> {
    let bytes = serde_json::to_vec(value).map_err(|error| RetroImportError::InvalidState {
        label,
        detail: error.to_string(),
    })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum {
        return Err(RetroImportError::StateTooLarge { label, maximum });
    }
    Ok(bytes)
}

fn read_json_bounded<T: for<'de> Deserialize<'de>>(
    path: &Path,
    maximum: u64,
    label: &'static str,
) -> Result<T, RetroImportError> {
    let file = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open bounded JSON state",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| RetroImportError::Io {
            operation: "read bounded JSON state",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum {
        return Err(RetroImportError::StateTooLarge { label, maximum });
    }
    serde_json::from_slice(&bytes).map_err(|error| RetroImportError::InvalidState {
        label,
        detail: error.to_string(),
    })
}

fn read_library(path: &Path) -> Result<RetroInstalledLibrary, RetroImportError> {
    let library: RetroInstalledLibrary =
        read_json_bounded(path, MAX_LIBRARY_DOCUMENT_BYTES, "retro installed library")?;
    validate_library(&library)?;
    Ok(library)
}

fn read_audit(path: &Path) -> Result<NativeAuditRecord, RetroImportError> {
    let audit: NativeAuditRecord =
        read_json_bounded(path, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
    if audit.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(audit.schema_version));
    }
    Ok(audit)
}

fn read_provision_audit(path: &Path) -> Result<NativeProvisionAuditRecord, RetroImportError> {
    require_regular_file(path, "retro import audit")?;
    let audit: NativeProvisionAuditRecord =
        read_json_bounded(path, MAX_AUDIT_RECORD_BYTES, "retro import audit")?;
    if audit.schema_version != SCHEMA_VERSION {
        return Err(RetroImportError::UnsupportedSchema(audit.schema_version));
    }
    validate_prefixed_hex_id(
        "provisioning ID",
        &audit.provisioning_id,
        PROVISION_ID_PREFIX,
        PROVISION_ID_HEX_LENGTH,
    )?;
    validate_sha256("staged manifest SHA-256", &audit.staged_manifest_sha256)?;
    validate_sha256("committed library SHA-256", &audit.library_sha256)?;
    Ok(audit)
}

fn library_generation_filename(generation: u64) -> String {
    format!("generation-{generation:020}.json")
}

fn create_directory_if_missing(path: &Path) -> Result<bool, RetroImportError> {
    if path_exists(path)? {
        return Ok(false);
    }
    fs::create_dir_all(path).map_err(|source| RetroImportError::Io {
        operation: "create retro import directory",
        path: path.to_owned(),
        source,
    })?;
    Ok(true)
}

fn read_bytes_bounded(
    path: &Path,
    maximum: u64,
    label: &'static str,
) -> Result<Vec<u8>, RetroImportError> {
    require_regular_file(path, label)?;
    let file = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open bounded retro import file",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| RetroImportError::Io {
            operation: "read bounded retro import file",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum {
        return Err(RetroImportError::StateTooLarge { label, maximum });
    }
    Ok(bytes)
}

fn publish_new_file(
    parent: &Path,
    temporary: &Path,
    final_path: &Path,
    bytes: &[u8],
    label: &'static str,
) -> Result<(), RetroImportError> {
    if path_exists(temporary)? || path_exists(final_path)? {
        return Err(RetroImportError::StateAlreadyExists(label));
    }
    write_new_synced_file(temporary, bytes, "write unpublished retro import state")?;
    fs::hard_link(temporary, final_path).map_err(|source| {
        if source.kind() == io::ErrorKind::AlreadyExists {
            RetroImportError::StateAlreadyExists(label)
        } else {
            RetroImportError::Io {
                operation: "publish retro import state",
                path: final_path.to_owned(),
                source,
            }
        }
    })?;
    sync_directory(parent)?;
    fs::remove_file(temporary).map_err(|source| RetroImportError::Io {
        operation: "remove published temporary retro import state",
        path: temporary.to_owned(),
        source,
    })?;
    sync_directory(parent)
}

fn publish_new_file_resumable(
    parent: &Path,
    temporary: &Path,
    final_path: &Path,
    bytes: &[u8],
    label: &'static str,
) -> Result<(), RetroImportError> {
    if path_exists(final_path)? {
        return Err(RetroImportError::StateAlreadyExists(label));
    }
    if path_exists(temporary)? {
        require_regular_file(temporary, "resumable temporary retro import state")?;
        let observed = fs::read(temporary).map_err(|source| RetroImportError::Io {
            operation: "read resumable temporary retro import state",
            path: temporary.to_owned(),
            source,
        })?;
        if observed != bytes {
            return Err(RetroImportError::InvalidState {
                label,
                detail: "temporary bytes differ from the pending transaction".to_owned(),
            });
        }
    } else {
        write_new_synced_file(temporary, bytes, "write unpublished retro import state")?;
    }
    fs::hard_link(temporary, final_path).map_err(|source| {
        if source.kind() == io::ErrorKind::AlreadyExists {
            RetroImportError::StateAlreadyExists(label)
        } else {
            RetroImportError::Io {
                operation: "publish resumable retro import state",
                path: final_path.to_owned(),
                source,
            }
        }
    })?;
    sync_directory(parent)?;
    fs::remove_file(temporary).map_err(|source| RetroImportError::Io {
        operation: "remove published resumable retro import state",
        path: temporary.to_owned(),
        source,
    })?;
    let temporary_parent = temporary
        .parent()
        .ok_or_else(|| RetroImportError::UnsafePath(temporary.to_owned()))?;
    sync_directory(temporary_parent)
}

fn remove_regular_file_if_present(path: &Path) -> Result<bool, RetroImportError> {
    if !path_exists(path)? {
        return Ok(false);
    }
    require_regular_file(path, "temporary retro import state")?;
    fs::remove_file(path).map_err(|source| RetroImportError::Io {
        operation: "remove temporary retro import state",
        path: path.to_owned(),
        source,
    })?;
    Ok(true)
}

fn write_new_synced_file(
    path: &Path,
    bytes: &[u8],
    operation: &'static str,
) -> Result<(), RetroImportError> {
    let mut file = create_private_new_file(path, operation)?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|source| RetroImportError::Io {
            operation,
            path: path.to_owned(),
            source,
        })
}

fn create_private_new_file(path: &Path, operation: &'static str) -> Result<File, RetroImportError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|source| RetroImportError::Io {
        operation,
        path: path.to_owned(),
        source,
    })
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), RetroImportError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|source| {
        RetroImportError::Io {
            operation: "set private retro staging permissions",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn set_private_directory_permissions(_path: &Path) -> Result<(), RetroImportError> {
    Ok(())
}

#[cfg(unix)]
fn seal_payload_permissions(path: &Path) -> Result<(), RetroImportError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o400)).map_err(|source| {
        RetroImportError::Io {
            operation: "seal staged retro content permissions",
            path: path.to_owned(),
            source,
        }
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn seal_payload_permissions(_path: &Path) -> Result<(), RetroImportError> {
    Ok(())
}

#[cfg(unix)]
fn ensure_same_filesystem(left: &Path, right: &Path) -> Result<(), RetroImportError> {
    use std::os::unix::fs::MetadataExt;
    let left_metadata = fs::metadata(left).map_err(|source| RetroImportError::Io {
        operation: "inspect retro import staging filesystem",
        path: left.to_owned(),
        source,
    })?;
    let right_metadata = fs::metadata(right).map_err(|source| RetroImportError::Io {
        operation: "inspect retro content filesystem",
        path: right.to_owned(),
        source,
    })?;
    if left_metadata.dev() != right_metadata.dev() {
        return Err(RetroImportError::DifferentFilesystems);
    }
    Ok(())
}

#[cfg(not(unix))]
fn ensure_same_filesystem(left: &Path, right: &Path) -> Result<(), RetroImportError> {
    if left.components().next() != right.components().next() {
        return Err(RetroImportError::DifferentFilesystems);
    }
    Ok(())
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, RetroImportError> {
    if !path.is_absolute() {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| RetroImportError::Io {
        operation: "inspect configured retro import directory",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    fs::canonicalize(path).map_err(|source| RetroImportError::Io {
        operation: "canonicalize configured retro import directory",
        path: path.to_owned(),
        source,
    })
}

fn canonical_direct_directory(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, RetroImportError> {
    let canonical = canonical_directory(kind, path)?;
    let expected_name = path
        .file_name()
        .ok_or_else(|| RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        })?;
    if path.parent() != Some(parent)
        || canonical.parent() != Some(parent)
        || canonical.file_name() != Some(expected_name)
    {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(canonical)
}

fn canonical_direct_file(
    kind: &'static str,
    parent: &Path,
    path: &Path,
) -> Result<PathBuf, RetroImportError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| RetroImportError::Io {
        operation: "inspect configured retro import file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    let canonical = fs::canonicalize(path).map_err(|source| RetroImportError::Io {
        operation: "canonicalize configured retro import file",
        path: path.to_owned(),
        source,
    })?;
    let expected_name = path
        .file_name()
        .ok_or_else(|| RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        })?;
    if path.parent() != Some(parent)
        || canonical.parent() != Some(parent)
        || canonical.file_name() != Some(expected_name)
    {
        return Err(RetroImportError::UnsafeRoot {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(canonical)
}

fn require_direct_directory(
    path: &Path,
    parent: &Path,
    kind: &'static str,
) -> Result<(), RetroImportError> {
    let canonical = canonical_direct_directory(kind, parent, path)?;
    if canonical != path {
        return Err(RetroImportError::UnsafePath(path.to_owned()));
    }
    Ok(())
}

fn require_regular_file(path: &Path, kind: &'static str) -> Result<(), RetroImportError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| RetroImportError::Io {
        operation: "inspect retro import file",
        path: path.to_owned(),
        source,
    })?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(RetroImportError::UnsafePathWithKind {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool, RetroImportError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(RetroImportError::Io {
            operation: "inspect retro import path",
            path: path.to_owned(),
            source,
        }),
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), RetroImportError> {
    let directory = File::open(path).map_err(|source| RetroImportError::Io {
        operation: "open retro import directory for synchronization",
        path: path.to_owned(),
        source,
    })?;
    directory.sync_all().map_err(|source| RetroImportError::Io {
        operation: "synchronize retro import directory",
        path: path.to_owned(),
        source,
    })
}

#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
fn sync_directory(_path: &Path) -> Result<(), RetroImportError> {
    Ok(())
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
mod tests {
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

    fn reuse_intent(
        bytes: &[u8],
        generation: u64,
        suffix: &str,
        existing_entry_id: &str,
    ) -> Vec<u8> {
        let mut value = intent_value(bytes, generation, "usb", suffix, Some(existing_entry_id));
        value["action"] = json!("reuse-existing");
        value["installEntry"] = Value::Null;
        value["audit"]["decision"] = json!("use-existing");
        serde_json::to_vec(&value).expect("serialize reuse intent")
    }

    fn pending_for(
        fixture: &Fixture,
        bytes: &[u8],
        generation: u64,
        suffix: &str,
    ) -> PendingInstall {
        let intent_json = intent_bytes(bytes, generation, "usb", suffix, None);
        let intent = parse_commit_intent(&intent_json).expect("parse intent");
        let pending = PendingInstall {
            schema_version: SCHEMA_VERSION,
            inspection_id: INSPECTION_ID.to_owned(),
            plan_expires_at_ms: 10_000,
            policy: policy(),
            intent_authority_sha256: canonical_intent_sha256(&intent)
                .expect("hash authorized intent"),
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
            "../../../packages/retro-import-contract/fixtures/plain-install-v1.json"
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
        let wrong_generation_bytes =
            serde_json::to_vec(&wrong_generation).expect("wrong generation");
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
        let scan = fixture
            .store
            .scan_staged(&pending, &mut FakeScanner::clean())
            .expect("scan stage");
        let stage = fixture.store.stage_directory(&pending);
        write_new_synced_file(
            &stage.join("scan.json"),
            &serialized_bounded(&scan, MAX_SCAN_RECEIPT_BYTES, "scan").expect("scan bytes"),
            "write scan",
        )
        .expect("persist scan");
        fixture
            .store
            .publish_content_object(&pending, &stage.join("payload"))
            .expect("publish content");

        let base = fixture.library();
        let next = build_next_library(&base, &pending.intent, &pending.policy)
            .expect("build next library");
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
        let changed_mapping_authority = RetroPlainImportContext::authorize(
            &reuse,
            INSPECTION_ID,
            10_000,
            false,
            changed_mapping,
        )
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
        let matching_authority = RetroPlainImportContext::authorize(
            &matching_cancel,
            INSPECTION_ID,
            10_000,
            true,
            policy(),
        )
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
        let scan = fixture
            .store
            .scan_staged(&published, &mut FakeScanner::clean())
            .expect("scan published transaction");
        write_new_synced_file(
            &stage.join("scan.json"),
            &serialized_bounded(&scan, MAX_SCAN_RECEIPT_BYTES, "scan").expect("scan bytes"),
            "write scan",
        )
        .expect("persist scan");
        fixture
            .store
            .publish_content_object(&published, &stage.join("payload"))
            .expect("publish content");
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
                .all(|entry| entry.expect("read staging entry").file_name()
                    == RETRO_IMPORT_LOCK_FILE)
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
        unknown_provenance["installEntry"]["provenance"]["sourcePath"] =
            json!("E:\\roms\\fixture.gb");
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
                RetroPlainImportContext::authorize(
                    &intent,
                    INSPECTION_ID,
                    10_000,
                    false,
                    policy(),
                )
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
        let mismatch =
            load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &other_target)
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
            let refusal =
                load_signed_policy(&update_policy, &policy_key, "retro-policy-a", &invalid)
                    .expect_err("the closed policy vocabulary refused this document");
            assert!(
                !refusal.to_string().is_empty(),
                "every refusal must name what it refused"
            );
        }
    }
}
