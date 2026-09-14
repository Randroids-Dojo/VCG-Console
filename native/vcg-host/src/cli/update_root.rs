//! Command composition and parsing for update root.

use super::{
    ExitCode, MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES, MAX_UPDATE_ROOT_ANCHOR_BYTES,
    MAX_UPDATE_ROOT_METADATA_BYTES, MAX_UPDATE_SIGNATURE_BUNDLE_BYTES, OsString, PathBuf,
    ProtectedUpdateRootState, RootAcceptance, RootTrustAnchorSet, UpdateRootStore,
    UpdateRootStoreConfig, read_bounded_host_file, required_next_number, required_next_path,
    set_number_option, set_path_option, usage,
};

#[derive(Clone, Copy)]
pub(super) enum UpdateRootAction {
    Bootstrap,
    Rotate,
    Recover,
}

#[derive(Default)]
pub(super) struct UpdateRootOptions {
    pub(super) store_root: Option<PathBuf>,
    pub(super) root: Option<PathBuf>,
    pub(super) root_signatures: Option<PathBuf>,
    pub(super) root_anchors: Option<PathBuf>,
    pub(super) protected_state: Option<PathBuf>,
    pub(super) trusted_unix_seconds: Option<u64>,
}

pub(super) fn update_root(arguments: &[OsString]) -> Result<ExitCode, String> {
    let action = match arguments.first().and_then(|argument| argument.to_str()) {
        Some("bootstrap") => UpdateRootAction::Bootstrap,
        Some("rotate") => UpdateRootAction::Rotate,
        Some("recover") => UpdateRootAction::Recover,
        _ => return Err(usage()),
    };
    let mut options = UpdateRootOptions::default();
    let mut cursor = 1;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "update-root options must be UTF-8".to_owned())?;
        parse_update_root_option(arguments, &mut cursor, option, &mut options)?;
        cursor += 1;
    }
    let store_root = options
        .store_root
        .ok_or_else(|| "update-root requires --store-root".to_owned())?;
    let store = UpdateRootStore::open(UpdateRootStoreConfig { store_root })
        .map_err(|error| error.to_string())?;

    if matches!(action, UpdateRootAction::Recover) {
        if options.root.is_some()
            || options.root_signatures.is_some()
            || options.root_anchors.is_some()
            || options.protected_state.is_some()
            || options.trusted_unix_seconds.is_some()
        {
            return Err("update-root recover accepts only --store-root".to_owned());
        }
        let removed = store.recover().map_err(|error| error.to_string())?;
        println!("update-root:recovered removed-unpublished={removed}");
        return Ok(ExitCode::SUCCESS);
    }

    let root = read_bounded_host_file(
        &options
            .root
            .ok_or_else(|| "update-root requires --root".to_owned())?,
        MAX_UPDATE_ROOT_METADATA_BYTES,
        "update root metadata",
    )?;
    let root_signatures = read_bounded_host_file(
        &options
            .root_signatures
            .ok_or_else(|| "update-root requires --root-signatures".to_owned())?,
        MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
        "update root signature bundle",
    )?;
    let anchors = RootTrustAnchorSet::from_json_bytes(&read_bounded_host_file(
        &options
            .root_anchors
            .ok_or_else(|| "update-root requires --root-anchors".to_owned())?,
        MAX_UPDATE_ROOT_ANCHOR_BYTES,
        "update root anchors",
    )?)
    .map_err(|error| error.to_string())?;
    let protected_state = ProtectedUpdateRootState::from_json_bytes(&read_bounded_host_file(
        &options
            .protected_state
            .ok_or_else(|| "update-root requires --protected-state".to_owned())?,
        MAX_PROTECTED_UPDATE_ROOT_STATE_BYTES,
        "protected update root state",
    )?)
    .map_err(|error| error.to_string())?;
    let trusted_unix_seconds = options
        .trusted_unix_seconds
        .ok_or_else(|| "update-root requires --trusted-unix-seconds".to_owned())?;
    let accepted = match action {
        UpdateRootAction::Bootstrap => store.bootstrap(
            &root,
            &root_signatures,
            &anchors,
            &protected_state,
            trusted_unix_seconds,
        ),
        UpdateRootAction::Rotate => store.rotate(
            &root,
            &root_signatures,
            &anchors,
            &protected_state,
            trusted_unix_seconds,
        ),
        UpdateRootAction::Recover => unreachable!("recover returned above"),
    }
    .map_err(|error| error.to_string())?;
    report_root_acceptance(action, accepted);
    Ok(ExitCode::SUCCESS)
}

pub(super) fn report_root_acceptance(action: UpdateRootAction, accepted: RootAcceptance) {
    let operation = match action {
        UpdateRootAction::Bootstrap => "bootstrap",
        UpdateRootAction::Rotate => "rotate",
        UpdateRootAction::Recover => unreachable!("recover returned above"),
    };
    let (status, state) = match accepted {
        RootAcceptance::Active(state) => ("active", state),
        RootAcceptance::ProtectionCommitRequired(state) => ("protected-commit-required", state),
    };
    println!(
        "update-root:accepted operation={operation} status={status} generation={} root_sha256={}",
        state.generation(),
        state
            .root_metadata_sha256()
            .expect("an accepted root state always has a digest")
    );
}

pub(super) fn parse_update_root_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut UpdateRootOptions,
) -> Result<(), String> {
    if option == "--trusted-unix-seconds" {
        return set_number_option(
            &mut output.trusted_unix_seconds,
            required_next_number(arguments, cursor, option)?,
            option,
        );
    }
    let slot = match option {
        "--store-root" => &mut output.store_root,
        "--root" => &mut output.root,
        "--root-signatures" => &mut output.root_signatures,
        "--root-anchors" => &mut output.root_anchors,
        "--protected-state" => &mut output.protected_state,
        value => return Err(format!("unknown update-root option: {value}")),
    };
    set_path_option(slot, required_next_path(arguments, cursor, option)?, option)
}
