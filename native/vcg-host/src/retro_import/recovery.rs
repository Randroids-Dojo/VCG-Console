//! Retro import recovery.

use super::filesystem::StagedPayloadFile;
use super::{
    CommitAction, MAX_AUDIT_RECORD_BYTES, MAX_LIBRARY_DOCUMENT_BYTES, MAX_SCAN_RECEIPT_BYTES,
    NativeAuditRecord, PENDING_INTENT_FILE, PendingInstall, ResumePending, RetroContentScanner,
    RetroImportCommitIntent, RetroImportError, RetroImportStore, RetroInstalledLibrary,
    RetroScanEvidence, RetroScanRequest, RetroScanStatus, build_next_library, fs, io,
    outcome_from_pending, path_exists, publish_new_file_resumable, read_audit, read_library,
    read_scan_receipt, remove_regular_file_if_present, replacement_entry, require_direct_directory,
    require_regular_file, serialized_bounded, sync_directory, validate_audit, validate_library,
    validate_pending, validate_scan_evidence, write_new_synced_file,
};

impl RetroImportStore {
    pub(super) fn resume_pending(
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
        let mut payload_file = StagedPayloadFile::open(&payload)?;
        match payload_file.verify(entry.size_bytes, &entry.sha256) {
            Ok(()) => {}
            Err(RetroImportError::CommittedContentMismatch) => {
                return Ok(ResumePending::Incomplete);
            }
            Err(error) => return Err(error),
        }

        let receipt = stage.join("scan.json");
        let scan = if path_exists(&receipt)? {
            read_scan_receipt(&receipt, pending)?
        } else {
            let evidence = Self::scan_staged(pending, &mut payload_file, scanner)?;
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
                    drop(payload_file);
                    self.abort_pending(pending)?;
                    return Ok(ResumePending::Rejected(status));
                }
            }
            evidence
        };
        if scan.status != RetroScanStatus::Clean {
            drop(payload_file);
            self.abort_pending(pending)?;
            return Ok(ResumePending::Rejected(scan.status));
        }
        payload_file.verify(entry.size_bytes, &entry.sha256)?;
        payload_file.make_read_only()?;
        self.publish_content_object(pending, &payload_file)?;
        drop(payload_file);
        self.publish_library(&next, &pending.intent.plan_id)?;
        self.publish_or_verify_audit_with_scan(pending, &scan)?;
        self.cleanup_replaced_object(&base, &next, &pending.intent)?;
        self.finish_cleanup(pending)?;
        Ok(ResumePending::Completed(outcome_from_pending(pending)?))
    }

    pub(super) fn scan_staged(
        pending: &PendingInstall,
        payload: &mut StagedPayloadFile,
        scanner: &mut impl RetroContentScanner,
    ) -> Result<RetroScanEvidence, RetroImportError> {
        let entry = pending.intent.install_entry_required()?;
        payload.rewind()?;
        let request = RetroScanRequest {
            inspection_id: pending.inspection_id.clone(),
            subject_sha256: entry.sha256.clone(),
            subject_bytes: entry.size_bytes,
        };
        let evidence = scanner
            .scan(&mut payload.file, &request)
            .map_err(RetroImportError::ScannerUnavailable)?;
        validate_scan_evidence(&evidence, &request)?;
        Ok(evidence)
    }

    pub(super) fn publish_content_object(
        &self,
        pending: &PendingInstall,
        payload: &StagedPayloadFile,
    ) -> Result<(), RetroImportError> {
        let entry = pending.intent.install_entry_required()?;
        let final_path = self.final_object_path(entry);
        if path_exists(&final_path)? {
            self.verify_object(entry)?;
            return Ok(());
        }
        payload.publish(&final_path).map_err(|source| {
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

    pub(super) fn publish_library(
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

    pub(super) fn publish_or_verify_audit(
        &self,
        pending: &PendingInstall,
    ) -> Result<(), RetroImportError> {
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

    pub(super) fn publish_or_verify_audit_with_scan(
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

    pub(super) fn publish_terminal_audit(
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

    pub(super) fn cleanup_replaced_object(
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

    pub(super) fn finish_cleanup(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
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

    pub(super) fn abort_pending(&self, pending: &PendingInstall) -> Result<(), RetroImportError> {
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

    pub(super) fn remove_stage_if_present(
        &self,
        pending: &PendingInstall,
    ) -> Result<(), RetroImportError> {
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
}
