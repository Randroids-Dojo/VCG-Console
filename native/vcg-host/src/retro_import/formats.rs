//! Retro import formats.

use super::{
    Deserialize, MAX_SAFE_INTEGER, PathBuf, RetroImportError, RetroImportOutcome,
    RetroPlainSystemPolicy, RetroScanEvidence, RetroScanStatus, SCHEMA_VERSION, Serialize,
    validate_prefixed_hex_id,
};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PendingInstall {
    pub(super) schema_version: u32,
    pub(super) inspection_id: String,
    pub(super) plan_expires_at_ms: u64,
    pub(super) policy: RetroPlainSystemPolicy,
    pub(super) intent_authority_sha256: String,
    pub(super) intent: RetroImportCommitIntent,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RetroImportCommitIntent {
    pub(super) schema_version: u32,
    pub(super) plan_id: String,
    pub(super) expected_library_generation: u64,
    pub(super) action: CommitAction,
    pub(super) source_handle: String,
    pub(super) source_sha256: String,
    pub(super) install_entry: Option<RetroInstalledEntry>,
    pub(super) existing_entry_id: Option<String>,
    pub(super) cleanup_staging_after_terminal: bool,
    pub(super) audit: RetroImportAuditEvent,
}

impl RetroImportCommitIntent {
    pub(super) fn install_entry_required(&self) -> Result<&RetroInstalledEntry, RetroImportError> {
        self.install_entry
            .as_ref()
            .ok_or(RetroImportError::InstallEntryRequired)
    }

    pub(super) fn require_install_action(&self) -> Result<(), RetroImportError> {
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
pub(super) enum CommitAction {
    CancelAndCleanup,
    InstallNew,
    ReplaceExisting,
    ReuseExisting,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RetroImportAuditEvent {
    pub(super) event: AuditEventKind,
    pub(super) plan_id: String,
    pub(super) policy_id: String,
    pub(super) policy_revision: u64,
    pub(super) session_id: String,
    pub(super) transport: RetroSessionTransport,
    pub(super) system_id: String,
    pub(super) content_sha256: String,
    pub(super) entitlement_statement_version: EntitlementStatement,
    pub(super) decision: AuditDecision,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum AuditEventKind {
    RetroImportTerminalIntent,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum AuditDecision {
    Cancel,
    Install,
    KeepBoth,
    ReplaceExisting,
    UseExisting,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RetroInstalledLibrary {
    pub(super) schema_version: u32,
    pub(super) generation: u64,
    pub(super) entries: Vec<RetroInstalledEntry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RetroInstalledEntry {
    pub(super) entry_id: String,
    pub(super) system_id: String,
    pub(super) sha256: String,
    pub(super) size_bytes: u64,
    pub(super) extension: String,
    pub(super) title: String,
    pub(super) core_id: String,
    pub(super) controller_profile: String,
    pub(super) provenance: RetroInstalledProvenance,
}

/// Path-free provenance recorded on one installed entry.
///
/// The transport tags the variant, so a record can only carry the evidence
/// its transport actually produced. An operator-provisioned entry has no
/// session, acknowledgement, or import time to state, and cannot be
/// constructed with substitutes for them.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "transport", rename_all = "kebab-case")]
pub(super) enum RetroInstalledProvenance {
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
    pub(super) const fn operator_provisioned() -> Self {
        Self::OperatorProvisioned(RetroOperatorProvenance {})
    }

    pub(super) const fn session(&self) -> Option<(RetroSessionTransport, &RetroSessionProvenance)> {
        match self {
            Self::OperatorProvisioned(_) => None,
            Self::PairedLan(session) => Some((RetroSessionTransport::PairedLan, session)),
            Self::Usb(session) => Some((RetroSessionTransport::Usb, session)),
        }
    }

    pub(super) fn validate(&self) -> Result<(), RetroImportError> {
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
pub(super) struct RetroOperatorProvenance {}

/// Evidence one live USB or paired-LAN import session produced.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RetroSessionProvenance {
    pub(super) import_session_id: String,
    pub(super) entitlement_statement_version: EntitlementStatement,
    pub(super) imported_at_ms: u64,
}

/// Transport a terminal intent and its native audit record may name.
///
/// Operator provisioning issues no terminal intent, so it is deliberately
/// absent from this vocabulary.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum RetroSessionTransport {
    PairedLan,
    Usb,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum EntitlementStatement {
    VcgUserEntitledContentV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum ScanScope {
    ContainerAndExpandedPayloads,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NativeAuditRecord {
    pub(super) schema_version: u32,
    pub(super) event: NativeAuditEventKind,
    pub(super) plan_id: String,
    pub(super) policy_id: String,
    pub(super) policy_revision: u64,
    pub(super) session_id: String,
    pub(super) transport: RetroSessionTransport,
    pub(super) system_id: String,
    pub(super) content_sha256: String,
    pub(super) entitlement_statement_version: EntitlementStatement,
    pub(super) decision: AuditDecision,
    pub(super) library_generation: u64,
    pub(super) scan: Option<RetroScanEvidence>,
}

impl NativeAuditRecord {
    pub(super) fn from_pending(
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

    pub(super) fn from_no_copy(
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
pub(super) enum NativeAuditEventKind {
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
pub(super) struct NativeProvisionAuditRecord {
    pub(super) schema_version: u32,
    pub(super) event: NativeProvisionAuditEventKind,
    pub(super) provisioning_id: String,
    pub(super) policy_id: String,
    pub(super) policy_revision: u64,
    pub(super) system_id: String,
    pub(super) staged_manifest_sha256: String,
    pub(super) committed_entries: usize,
    pub(super) already_installed_entries: usize,
    pub(super) committed_bytes: u64,
    pub(super) library_generation: u64,
    pub(super) library_sha256: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub(super) enum NativeProvisionAuditEventKind {
    #[serde(rename = "retro-operator-provisioned")]
    Provisioned,
}

pub(super) enum ResumePending {
    Completed(RetroImportOutcome),
    Incomplete,
    Rejected(RetroScanStatus),
}

/// Exact manifest written beside a staged operator payload.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StagedContentManifest {
    pub(super) schema_version: u32,
    pub(super) document_type: String,
    pub(super) system_id: String,
    pub(super) core_id: String,
    pub(super) controller_profile: String,
    pub(super) provenance: String,
    pub(super) source_label: String,
    pub(super) entry_count: usize,
    pub(super) total_bytes: u64,
    pub(super) entries: Vec<StagedContentEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StagedContentEntry {
    pub(super) entry_id: String,
    pub(super) system_id: String,
    pub(super) sha256: String,
    pub(super) size_bytes: u64,
    pub(super) extension: String,
    pub(super) title: String,
    pub(super) core_id: String,
    pub(super) controller_profile: String,
    pub(super) object_name: String,
    pub(super) container: StagedContainer,
}

#[derive(Clone, Copy, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub(super) enum StagedContainer {
    Plain,
    Zip,
}

/// One validated staged object and the installed entry it would become.
pub(super) struct StagedObject {
    pub(super) object_name: String,
    pub(super) entry: RetroInstalledEntry,
}

/// A whole staged payload, validated against one release policy.
pub(super) struct StagedPayload {
    pub(super) provisioning_id: String,
    pub(super) manifest_sha256: String,
    pub(super) system_id: String,
    pub(super) objects: Vec<StagedObject>,
    pub(super) archive_extracted: usize,
    pub(super) total_bytes: u64,
}

pub(super) struct StagedPayloadRoots {
    pub(super) objects: PathBuf,
    pub(super) manifest: PathBuf,
}

pub(super) struct StagedPartition<'a> {
    pub(super) additions: Vec<&'a StagedObject>,
    pub(super) installed: Vec<&'a StagedObject>,
}
