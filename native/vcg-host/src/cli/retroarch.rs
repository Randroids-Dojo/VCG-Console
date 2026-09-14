//! Command composition and parsing for retroarch.

use super::{
    ContentlessStart, Duration, ExitCode, ExpectedSha256, Instant, OsString, PathBuf,
    ProcessSupervisor, RESERVED_GESTURE_HOLD_MILLIS, RetroArchRequest, plan_retroarch,
    required_path, required_text, set_parsed_option, set_path_option, set_text_option,
    start_reserved_input_router, thread,
};

pub(super) fn retroarch(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, request) = retroarch_request(arguments)?;
    let plan = plan_retroarch(&request).map_err(|error| error.to_string())?;
    if dry_run {
        println!("retroarch:plan mode=dry-run");
        println!("program: {}", plan.launch().program().display());
        for argument in plan.launch().arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        println!("session: {}", plan.storage().session.display());
        println!("session-config: {}", plan.storage().config.display());
        println!("saves: {}", plan.storage().saves.display());
        println!("states: {}", plan.storage().states.display());
        println!("contentless: {}", plan.contentless());
        println!(
            "contentless-start: {}",
            plan.contentless_start()
                .map_or("not-applicable", ContentlessStart::as_str)
        );
        return Ok(ExitCode::SUCCESS);
    }

    plan.prepare().map_err(|error| error.to_string())?;
    println!(
        "retroarch:prepared game={} profile={} config={}",
        request.game_id,
        request.profile_id,
        plan.storage().config.display()
    );
    // Started before the child, and a refusal aborts the launch: a game the
    // player cannot leave is worse than a game that did not start.
    let observed_at = Instant::now();
    let mut reserved_input = start_reserved_input_router(0).map_err(|error| error.to_string())?;
    println!(
        "retroarch:reserved-input controllers={} hold-ms={RESERVED_GESTURE_HOLD_MILLIS}",
        reserved_input.observed_controllers()
    );

    let mut child = ProcessSupervisor
        .launch(plan.launch())
        .map_err(|error| error.to_string())?;
    println!("retroarch:started pid={}", child.id());
    let mut reserved_exit = false;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            break status;
        }
        let elapsed = u64::try_from(observed_at.elapsed().as_millis()).unwrap_or(u64::MAX);
        if reserved_input.poll(elapsed).is_some() {
            reserved_exit = true;
            println!("retroarch:reserved-exit");
            // The same termination the watchdog uses for a cancelled child.
            break child.terminate().map_err(|error| error.to_string())?;
        }
        thread::sleep(RESERVED_INPUT_POLL_INTERVAL);
    };
    println!(
        "retroarch:completed exit_code={}",
        status
            .code()
            .map_or_else(|| "signal".to_owned(), |code| code.to_string())
    );
    Ok(if reserved_exit || status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

/// Interval between reserved-input observations while a child runs.
pub(super) const RESERVED_INPUT_POLL_INTERVAL: Duration = Duration::from_millis(8);

#[derive(Default)]
pub(super) struct RetroArchOptions {
    pub(super) dry_run: bool,
    pub(super) install_root: Option<PathBuf>,
    pub(super) content_root: Option<PathBuf>,
    pub(super) runtime_root: Option<PathBuf>,
    pub(super) data_root: Option<PathBuf>,
    pub(super) frontend: Option<PathBuf>,
    pub(super) frontend_sha256: Option<ExpectedSha256>,
    pub(super) core: Option<PathBuf>,
    pub(super) core_sha256: Option<ExpectedSha256>,
    pub(super) content: Option<PathBuf>,
    pub(super) content_sha256: Option<ExpectedSha256>,
    pub(super) base_config: Option<PathBuf>,
    pub(super) base_config_sha256: Option<ExpectedSha256>,
    pub(super) profile_id: Option<String>,
    pub(super) game_id: Option<String>,
    pub(super) contentless_start: Option<ContentlessStart>,
}

pub(super) fn retroarch_request(
    arguments: &[OsString],
) -> Result<(bool, RetroArchRequest), String> {
    let mut options = RetroArchOptions::default();
    let mut cursor = 0;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "retroarch options must be UTF-8".to_owned())?;
        parse_retroarch_option(arguments, &mut cursor, option, &mut options)?;
        cursor += 1;
    }

    let dry_run = options.dry_run;
    Ok((
        dry_run,
        RetroArchRequest {
            install_root: options
                .install_root
                .ok_or_else(|| "retroarch requires --install-root".to_owned())?,
            content_root: options.content_root,
            runtime_root: options
                .runtime_root
                .ok_or_else(|| "retroarch requires --runtime-root".to_owned())?,
            data_root: options
                .data_root
                .ok_or_else(|| "retroarch requires --data-root".to_owned())?,
            frontend: options
                .frontend
                .ok_or_else(|| "retroarch requires --frontend".to_owned())?,
            frontend_sha256: options
                .frontend_sha256
                .ok_or_else(|| "retroarch requires --frontend-sha256".to_owned())?,
            core: options
                .core
                .ok_or_else(|| "retroarch requires --core".to_owned())?,
            core_sha256: options
                .core_sha256
                .ok_or_else(|| "retroarch requires --core-sha256".to_owned())?,
            content: options.content,
            content_sha256: options.content_sha256,
            base_config: options
                .base_config
                .ok_or_else(|| "retroarch requires --base-config".to_owned())?,
            base_config_sha256: options
                .base_config_sha256
                .ok_or_else(|| "retroarch requires --base-config-sha256".to_owned())?,
            auxiliary: Vec::new(),
            profile_id: options
                .profile_id
                .ok_or_else(|| "retroarch requires --profile".to_owned())?,
            game_id: options
                .game_id
                .ok_or_else(|| "retroarch requires --game".to_owned())?,
            contentless_start: options.contentless_start,
        },
    ))
}

pub(super) fn parse_retroarch_option(
    arguments: &[OsString],
    cursor: &mut usize,
    option: &str,
    output: &mut RetroArchOptions,
) -> Result<(), String> {
    if option == "--dry-run" {
        output.dry_run = true;
        return Ok(());
    }
    *cursor += 1;
    match option {
        "--install-root" => set_path_option(
            &mut output.install_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--content-root" => set_path_option(
            &mut output.content_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--runtime-root" => set_path_option(
            &mut output.runtime_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--data-root" => set_path_option(
            &mut output.data_root,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--frontend" => set_path_option(
            &mut output.frontend,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--frontend-sha256" => set_parsed_option(
            &mut output.frontend_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--core" => set_path_option(
            &mut output.core,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--core-sha256" => set_parsed_option(
            &mut output.core_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--content" => set_path_option(
            &mut output.content,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--content-sha256" => set_parsed_option(
            &mut output.content_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--base-config" => set_path_option(
            &mut output.base_config,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--base-config-sha256" => set_parsed_option(
            &mut output.base_config_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--profile" => set_text_option(
            &mut output.profile_id,
            required_text(arguments, *cursor, option)?,
            option,
        ),
        "--game" => set_text_option(
            &mut output.game_id,
            required_text(arguments, *cursor, option)?,
            option,
        ),
        "--contentless-start" => set_parsed_option(
            &mut output.contentless_start,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        value => Err(format!("unknown retroarch option: {value}")),
    }
}
