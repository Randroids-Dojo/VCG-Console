//! Command composition and parsing for provision.

use super::{
    ExitCode, HostUpdateTrustOptions, MAX_RETRO_SYSTEM_POLICY_BYTES, OsString, PathBuf,
    RETRO_OPERATOR_PROVISIONED_TRANSPORT, RetroImportStore, RetroImportStoreConfig,
    RetroSignedSystemPolicy, StorageNamespacePlan, current_target, load_update_signatures,
    read_bounded_host_file, required_number, required_path, required_text, set_number_option,
    set_path_option, set_text_option,
};

#[derive(Default)]
pub(super) struct RetroProvisionOptions {
    pub(super) dry_run: bool,
    pub(super) writable_root: Option<PathBuf>,
    pub(super) payload: Option<PathBuf>,
    pub(super) system_policy: Option<PathBuf>,
    pub(super) system_policy_signature: Option<PathBuf>,
    pub(super) update_root_store: Option<PathBuf>,
    pub(super) update_root_anchors: Option<PathBuf>,
    pub(super) update_root_protected_state: Option<PathBuf>,
    pub(super) update_channel: Option<String>,
    pub(super) trusted_unix_seconds: Option<u64>,
    pub(super) reserve_bytes: Option<u64>,
}

/// The signed policy document, its detached signatures, and the update trust
/// they are verified under.
pub(super) struct RetroSystemPolicySource {
    pub(super) document: PathBuf,
    pub(super) signature: PathBuf,
    pub(super) update_trust: HostUpdateTrustOptions,
}

impl RetroSystemPolicySource {
    /// Verifies the policy bytes before anything on disk is created.
    ///
    /// The accepted-root store is replayed read-only. A store awaiting
    /// recovery fails here rather than being repaired by a provisioning run.
    pub(super) fn load(self) -> Result<RetroSignedSystemPolicy, String> {
        let (update_policy, _) = self.update_trust.load(false)?;
        let document = read_bounded_host_file(
            &self.document,
            MAX_RETRO_SYSTEM_POLICY_BYTES,
            "retro system policy",
        )?;
        let signatures =
            load_update_signatures(&self.signature, "retro system policy signature bundle")?;
        RetroSignedSystemPolicy::load_with_update_role(
            &document,
            &signatures,
            &update_policy,
            &current_target(),
        )
        .map_err(|error| error.to_string())
    }
}

pub(super) struct RetroProvisionRequest {
    pub(super) dry_run: bool,
    pub(super) payload: PathBuf,
    pub(super) policy_source: RetroSystemPolicySource,
    pub(super) config: RetroImportStoreConfig,
}

pub(super) fn retro_provision(arguments: &[OsString]) -> Result<ExitCode, String> {
    let RetroProvisionRequest {
        dry_run,
        payload,
        policy_source,
        config,
    } = retro_provision_request(arguments)?;
    let policy = policy_source.load()?;
    println!(
        "retro-provision:policy id={} revision={} systems={} channel={} root-generation={}",
        policy.policy_id(),
        policy.policy_revision(),
        policy.system_count(),
        policy.update_authority().channel(),
        policy.update_authority().root_generation()
    );

    if dry_run {
        if !config.staging_root.is_dir() || !config.content_root.is_dir() {
            return Err(
                "retro-provision --dry-run requires provisioned roots; run without --dry-run to create them"
                    .to_owned(),
            );
        }
        let store = RetroImportStore::open(&config).map_err(|error| error.to_string())?;
        let plan = store
            .plan_operator_content_with_signed_policy(&payload, &policy)
            .map_err(|error| error.to_string())?;
        println!(
            "retro-provision:plan mode=dry-run id={}",
            plan.provisioning_id()
        );
        println!(
            "retro-provision:payload system={} entries={} archive-extracted={}",
            plan.system_id(),
            plan.payload_entries(),
            plan.archive_extracted_entries()
        );
        println!(
            "retro-provision:verified staged={} bytes={}",
            plan.payload_entries(),
            plan.verified_bytes()
        );
        println!(
            "retro-provision:library generation={} next-generation={} new={} already-installed={}",
            plan.library_generation(),
            plan.next_library_generation(),
            plan.new_entries(),
            plan.already_installed_entries()
        );
        return Ok(ExitCode::SUCCESS);
    }

    let created = RetroImportStore::provision_roots(&config).map_err(|error| error.to_string())?;
    println!("retro-provision:roots created={created}");
    let store = RetroImportStore::open(&config).map_err(|error| error.to_string())?;
    let outcome = store
        .provision_operator_content_with_signed_policy(&payload, &policy)
        .map_err(|error| error.to_string())?;
    println!(
        "retro-provision:payload system={} entries={} archive-extracted={}",
        outcome.system_id(),
        outcome.verified_objects(),
        outcome.archive_extracted_entries()
    );
    println!(
        "retro-provision:verified copied={} installed={} bytes={}",
        outcome.committed_entries(),
        outcome.already_installed_entries(),
        outcome.verified_bytes()
    );
    println!(
        "retro-provision:committed id={} generation={} entries={} already-installed={} transport={RETRO_OPERATOR_PROVISIONED_TRANSPORT}",
        outcome.provisioning_id(),
        outcome.library_generation(),
        outcome.committed_entries(),
        outcome.already_installed_entries()
    );
    println!("Verified digests are not a qualified install. Nothing here proves");
    println!("a core loads a title, that saves persist, or that any of it runs.");
    Ok(ExitCode::SUCCESS)
}

pub(super) fn retro_provision_request(arguments: &[OsString]) -> Result<RetroProvisionRequest, String> {
    let mut options = RetroProvisionOptions::default();
    let mut cursor = 0;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "retro-provision options must be UTF-8".to_owned())?;
        parse_retro_provision_option(arguments, &mut cursor, option, &mut options)?;
        cursor += 1;
    }

    let namespace = StorageNamespacePlan::new(
        options
            .writable_root
            .ok_or_else(|| "retro-provision requires --writable-root".to_owned())?,
    )
    .map_err(|error| error.to_string())?;
    let reserve_bytes = options
        .reserve_bytes
        .ok_or_else(|| "retro-provision requires --reserve-bytes".to_owned())?;
    let config = RetroImportStoreConfig::from_storage_namespace(&namespace, reserve_bytes);

    let policy_source = RetroSystemPolicySource {
        document: options
            .system_policy
            .ok_or_else(|| "retro-provision requires --system-policy".to_owned())?,
        signature: options
            .system_policy_signature
            .ok_or_else(|| "retro-provision requires --system-policy-signature".to_owned())?,
        update_trust: HostUpdateTrustOptions {
            store_root: options
                .update_root_store
                .ok_or_else(|| "retro-provision requires --update-root-store".to_owned())?,
            root_anchors: options
                .update_root_anchors
                .ok_or_else(|| "retro-provision requires --update-root-anchors".to_owned())?,
            protected_state: options.update_root_protected_state.ok_or_else(|| {
                "retro-provision requires --update-root-protected-state".to_owned()
            })?,
            channel: options
                .update_channel
                .ok_or_else(|| "retro-provision requires --update-channel".to_owned())?,
            trusted_unix_seconds: options
                .trusted_unix_seconds
                .ok_or_else(|| "retro-provision requires --trusted-unix-seconds".to_owned())?,
        },
    };

    Ok(RetroProvisionRequest {
        dry_run: options.dry_run,
        payload: options
            .payload
            .ok_or_else(|| "retro-provision requires --payload".to_owned())?,
        policy_source,
        config,
    })
}

pub(super) fn parse_retro_provision_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut RetroProvisionOptions,
) -> Result<(), String> {
    if option == "--dry-run" {
        output.dry_run = true;
        return Ok(());
    }
    *cursor += 1;
    match option {
        "--writable-root" => set_path_option(
            &mut output.writable_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--payload" => set_path_option(
            &mut output.payload,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--system-policy" => set_path_option(
            &mut output.system_policy,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--system-policy-signature" => set_path_option(
            &mut output.system_policy_signature,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--update-root-store" => set_path_option(
            &mut output.update_root_store,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--update-root-anchors" => set_path_option(
            &mut output.update_root_anchors,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--update-root-protected-state" => set_path_option(
            &mut output.update_root_protected_state,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--update-channel" => set_text_option(
            &mut output.update_channel,
            required_text(arguments, *cursor, option)?,
            option,
        ),
        "--trusted-unix-seconds" => set_number_option(
            &mut output.trusted_unix_seconds,
            required_number(arguments, *cursor, option)?,
            option,
        ),
        "--reserve-bytes" => set_number_option(
            &mut output.reserve_bytes,
            required_number(arguments, *cursor, option)?,
            option,
        ),
        value => Err(format!("unknown retro-provision option: {value}")),
    }
}
