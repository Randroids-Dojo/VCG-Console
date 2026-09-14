//! Retro import provisioning.

use super::{
    COPY_BUFFER_BYTES, Digest, FILESYSTEM_METADATA_HEADROOM_BYTES, File, HashSet,
    MAX_AUDIT_RECORD_BYTES, MAX_LIBRARY_DOCUMENT_BYTES, MAX_LIBRARY_ENTRIES, MAX_SAFE_INTEGER,
    MAX_STAGED_MANIFEST_BYTES, NativeProvisionAuditEventKind, NativeProvisionAuditRecord,
    PROVISION_ID_HEX_LENGTH, PROVISION_ID_PREFIX, PROVISION_STAGE_FILE, Path,
    RETRO_CONTENT_OBJECTS_DIRECTORY, RETRO_STAGED_MANIFEST_FILE, Read, RetroImportError,
    RetroImportStore, RetroInstalledEntry, RetroInstalledLibrary, RetroInstalledProvenance,
    RetroOperatorProvisionOutcome, RetroOperatorProvisionPlan, RetroOperatorProvisionPolicy,
    RetroSignedSystemPolicy, SCHEMA_VERSION, STAGED_DOCUMENT_TYPE, STAGED_PROVENANCE_LABEL, Sha256,
    StagedContainer, StagedContentManifest, StagedObject, StagedPartition, StagedPayload,
    StagedPayloadRoots, StagedPolicyView, Write, canonical_direct_directory, canonical_direct_file,
    canonical_directory, create_private_new_file, encode_hex, fs, io, path_exists,
    publish_new_file_resumable, read_bytes_bounded, read_provision_audit,
    remove_regular_file_if_present, require_regular_file, seal_payload_permissions,
    serialized_bounded, sync_directory, validate_bounded_text, validate_entry, validate_library,
    verify_file_hash,
};

pub(super) fn staged_payload_roots(payload_root: &Path) -> Result<StagedPayloadRoots, RetroImportError> {
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

pub(super) fn read_staged_payload<'policy>(
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

pub(super) fn partition_staged_objects<'a>(
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

pub(super) fn cloned_entries(objects: &[&StagedObject]) -> Vec<RetroInstalledEntry> {
    objects.iter().map(|object| object.entry.clone()).collect()
}

pub(super) fn build_provisioned_library(
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

pub(super) fn verify_staged_object(
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

impl RetroImportStore {
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

    pub(super) fn plan_staged_payload(
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

    pub(super) fn provision_staged_payload(
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

    pub(super) fn admit_provision_capacity(
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

    pub(super) fn publish_provisioned_object(
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

    pub(super) fn publish_provision_audit(
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

    pub(super) fn discard_provision_stage(&self) -> Result<(), RetroImportError> {
        if remove_regular_file_if_present(&self.staging_root.join(PROVISION_STAGE_FILE))? {
            sync_directory(&self.staging_root)?;
        }
        Ok(())
    }

}
