//! Retro import validation.

use super::{
    AuditDecision, CONTENT_ENTRY_ID_PREFIX, CommitAction, Digest, HashSet, MAX_BINDABLE_ID_BYTES,
    MAX_COMMIT_INTENT_BYTES, MAX_LIBRARY_ENTRIES, MAX_SAFE_INTEGER, MAX_SCAN_RECEIPT_BYTES,
    NativeAuditRecord, Path, PendingInstall, RetroImportCommitIntent, RetroImportError,
    RetroImportOutcome, RetroInstalledEntry, RetroInstalledLibrary, RetroPlainImportContext,
    RetroPlainSystemPolicy, RetroScanEvidence, RetroScanRequest, RetroScanStatus, SCHEMA_VERSION,
    Sha256, encode_hex, is_nfc, read_json_bounded, require_regular_file, serialized_bounded,
};

pub(super) fn parse_commit_intent(
    bytes: &[u8],
) -> Result<RetroImportCommitIntent, RetroImportError> {
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

pub(super) fn validate_install_authority(
    intent: &RetroImportCommitIntent,
    context: &RetroPlainImportContext,
    now_ms: u64,
) -> Result<(), RetroImportError> {
    validate_terminal_authority(intent, context)?;
    validate_active_authority(context, now_ms)
}

pub(super) fn validate_terminal_authority(
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

pub(super) fn validate_active_authority(
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

pub(super) fn validate_context_policy_binding(
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

pub(super) fn validate_pending(pending: &PendingInstall) -> Result<(), RetroImportError> {
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

pub(super) fn validate_pending_cancellation_binding(
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

pub(super) fn canonical_intent_sha256(
    intent: &RetroImportCommitIntent,
) -> Result<String, RetroImportError> {
    let bytes = serialized_bounded(
        intent,
        MAX_COMMIT_INTENT_BYTES,
        "retro import terminal intent",
    )?;
    Ok(encode_hex(&Sha256::digest(bytes)))
}

pub(super) fn validate_commit_intent(
    intent: &RetroImportCommitIntent,
) -> Result<(), RetroImportError> {
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

pub(super) fn validate_install_entry_binding(
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

pub(super) fn validate_library(library: &RetroInstalledLibrary) -> Result<(), RetroImportError> {
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

pub(super) fn validate_entry(entry: &RetroInstalledEntry) -> Result<(), RetroImportError> {
    validate_content_id(&entry.entry_id)?;
    validate_bindable_id("installed system ID", &entry.system_id)?;
    validate_sha256("installed SHA-256", &entry.sha256)?;
    if entry.entry_id != format!("{CONTENT_ENTRY_ID_PREFIX}{}", entry.sha256) {
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

pub(super) fn build_next_library(
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

pub(super) fn replacement_entry<'a>(
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

pub(super) fn reuse_entry<'a>(
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

pub(super) fn outcome_from_pending(
    pending: &PendingInstall,
) -> Result<RetroImportOutcome, RetroImportError> {
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

pub(super) fn validate_scan_evidence(
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

pub(super) fn read_scan_receipt(
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

pub(super) fn validate_audit(
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

/// Reports whether a value is a library entry ID.
///
/// The grammar lives here because this module owns both the prefix and the
/// object naming that derives from it. The launch and replay paths admit a
/// browser-supplied string with it, so a second spelling elsewhere could admit
/// a launch the store then refuses.
#[must_use]
pub fn is_library_entry_id(value: &str) -> bool {
    value
        .strip_prefix(CONTENT_ENTRY_ID_PREFIX)
        .is_some_and(is_sha256_hex)
}

pub(super) fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub(super) fn validate_content_id(value: &str) -> Result<(), RetroImportError> {
    let Some(digest) = value.strip_prefix(CONTENT_ENTRY_ID_PREFIX) else {
        return Err(RetroImportError::InvalidLibrary(
            "content entry ID has an invalid prefix".to_owned(),
        ));
    };
    validate_sha256("content entry ID digest", digest)
}

pub(super) fn validate_sha256(label: &'static str, value: &str) -> Result<(), RetroImportError> {
    if !is_sha256_hex(value) {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

pub(super) fn validate_prefixed_hex_id(
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
pub(super) fn validate_bindable_id(
    label: &'static str,
    value: &str,
) -> Result<(), RetroImportError> {
    validate_safe_id(label, value, MAX_BINDABLE_ID_BYTES)?;
    if value.contains('.') {
        return Err(RetroImportError::InvalidIdentifier {
            label,
            value: value.to_owned(),
        });
    }
    Ok(())
}

pub(super) fn validate_safe_id(
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

pub(super) fn validate_extension(value: &str) -> Result<(), RetroImportError> {
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

pub(super) fn validate_visible_title(value: &str) -> Result<(), RetroImportError> {
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

pub(super) fn is_unsafe_display_character(character: char) -> bool {
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

pub(super) fn validate_bounded_text(
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
