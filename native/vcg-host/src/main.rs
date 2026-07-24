use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use vcg_host::host_api::{HOST_API_PROTOCOL_VERSION, HostStatusServer};
use vcg_host::launcher::{LauncherRequest, loopback_origin, plan as plan_launcher};
use vcg_host::process::{FileHealthProbe, LaunchSpec, ProcessSupervisor, WatchdogPolicy};
use vcg_host::retroarch::{ExpectedSha256, RetroArchRequest, plan as plan_retroarch};

fn main() -> ExitCode {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    match run(&arguments) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("vcg-host: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run(arguments: &[OsString]) -> Result<ExitCode, String> {
    let Some(command) = arguments.first().and_then(|argument| argument.to_str()) else {
        return Err(usage());
    };

    match command {
        "doctor" => {
            println!("vcg-host {}", env!("CARGO_PKG_VERSION"));
            println!("target: {}-{}", env::consts::ARCH, env::consts::OS);
            println!("launcher-shell: loopback-chromium-app-mode");
            println!("process-supervision: available");
            println!("game-watchdog: heartbeat-and-bounded-restart");
            println!("retroarch-adapter: plan-and-direct-launch");
            println!("retroarch-integrity: sha256-required");
            println!("retroarch-readiness: compositor-adapter-pending");
            println!("resource-fault-detection: adapter-required");
            println!("sdl3-input: adapter pending target-Linux qualification");
            Ok(ExitCode::SUCCESS)
        }
        "launcher" => launcher(&arguments[1..]),
        "supervise" => supervise(&arguments[1..]),
        "watchdog" => watchdog(&arguments[1..]),
        "retroarch" => retroarch(&arguments[1..]),
        "help" | "--help" | "-h" => {
            println!("{}", usage());
            Ok(ExitCode::SUCCESS)
        }
        _ => Err(usage()),
    }
}

#[derive(Default)]
struct LauncherOptions {
    dry_run: bool,
    windowed: bool,
    browser: Option<PathBuf>,
    profile_dir: Option<PathBuf>,
    url: Option<String>,
}

fn launcher(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, request) = launcher_request(arguments)?;
    if dry_run {
        let spec = plan_launcher(&request).map_err(|error| error.to_string())?;
        println!("launcher:plan mode=dry-run");
        println!("program: {}", spec.program().display());
        for argument in spec.arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        return Ok(ExitCode::SUCCESS);
    }

    let origin = loopback_origin(request.url()).map_err(|error| error.to_string())?;
    let host_api = HostStatusServer::start(origin).map_err(|error| error.to_string())?;
    let launcher_url = host_api
        .launcher_url(request.url())
        .map_err(|error| error.to_string())?;
    let request = request.with_url(launcher_url);
    let spec = plan_launcher(&request).map_err(|error| error.to_string())?;
    fs::create_dir_all(request.profile_dir())
        .map_err(|error| format!("failed to create launcher profile directory: {error}"))?;
    println!(
        "launcher:host-api address={} protocol={}",
        host_api.address(),
        HOST_API_PROTOCOL_VERSION
    );
    let child = ProcessSupervisor
        .launch(&spec)
        .map_err(|error| error.to_string())?;
    println!(
        "launcher:started pid={} origin={}",
        child.id(),
        host_api.allowed_origin()
    );
    let status = child.wait().map_err(|error| error.to_string())?;
    println!(
        "launcher:completed exit_code={}",
        status
            .code()
            .map_or_else(|| "signal".to_owned(), |code| code.to_string())
    );
    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

fn launcher_request(arguments: &[OsString]) -> Result<(bool, LauncherRequest), String> {
    let mut options = LauncherOptions::default();
    let mut cursor = 0;
    while let Some(argument) = arguments.get(cursor) {
        let option = argument
            .to_str()
            .ok_or_else(|| "launcher options must be UTF-8".to_owned())?;
        match option {
            "--dry-run" => options.dry_run = true,
            "--windowed" => options.windowed = true,
            "--browser" => {
                cursor += 1;
                set_path_option(
                    &mut options.browser,
                    required_path(arguments, cursor, option)?,
                    option,
                )?;
            }
            "--profile-dir" => {
                cursor += 1;
                set_path_option(
                    &mut options.profile_dir,
                    required_path(arguments, cursor, option)?,
                    option,
                )?;
            }
            "--url" => {
                cursor += 1;
                set_text_option(
                    &mut options.url,
                    required_text(arguments, cursor, option)?,
                    option,
                )?;
            }
            value => return Err(format!("unknown launcher option: {value}")),
        }
        cursor += 1;
    }

    let mut request = LauncherRequest::new(
        options
            .browser
            .ok_or_else(|| "launcher requires --browser".to_owned())?,
        options
            .profile_dir
            .ok_or_else(|| "launcher requires --profile-dir".to_owned())?,
        options
            .url
            .ok_or_else(|| "launcher requires --url".to_owned())?,
    );
    if options.windowed {
        request = request.windowed();
    }
    Ok((options.dry_run, request))
}

fn retroarch(arguments: &[OsString]) -> Result<ExitCode, String> {
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
        return Ok(ExitCode::SUCCESS);
    }

    plan.prepare().map_err(|error| error.to_string())?;
    println!(
        "retroarch:prepared game={} profile={} config={}",
        request.game_id,
        request.profile_id,
        plan.storage().config.display()
    );
    let child = ProcessSupervisor
        .launch(plan.launch())
        .map_err(|error| error.to_string())?;
    println!("retroarch:started pid={}", child.id());
    let status = child.wait().map_err(|error| error.to_string())?;
    println!(
        "retroarch:completed exit_code={}",
        status
            .code()
            .map_or_else(|| "signal".to_owned(), |code| code.to_string())
    );
    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

#[derive(Default)]
struct RetroArchOptions {
    dry_run: bool,
    install_root: Option<PathBuf>,
    content_root: Option<PathBuf>,
    runtime_root: Option<PathBuf>,
    data_root: Option<PathBuf>,
    frontend: Option<PathBuf>,
    frontend_sha256: Option<ExpectedSha256>,
    core: Option<PathBuf>,
    core_sha256: Option<ExpectedSha256>,
    content: Option<PathBuf>,
    content_sha256: Option<ExpectedSha256>,
    base_config: Option<PathBuf>,
    profile_id: Option<String>,
    game_id: Option<String>,
}

fn retroarch_request(arguments: &[OsString]) -> Result<(bool, RetroArchRequest), String> {
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
            profile_id: options
                .profile_id
                .ok_or_else(|| "retroarch requires --profile".to_owned())?,
            game_id: options
                .game_id
                .ok_or_else(|| "retroarch requires --game".to_owned())?,
        },
    ))
}

fn parse_retroarch_option(
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
        "--frontend-sha256" => set_hash_option(
            &mut output.frontend_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--core" => set_path_option(
            &mut output.core,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--core-sha256" => set_hash_option(
            &mut output.core_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--content" => set_path_option(
            &mut output.content,
            required_path(arguments, *cursor, option)?,
            option,
        ),
        "--content-sha256" => set_hash_option(
            &mut output.content_sha256,
            &required_text(arguments, *cursor, option)?,
            option,
        ),
        "--base-config" => set_path_option(
            &mut output.base_config,
            required_path(arguments, *cursor, option)?,
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
        value => Err(format!("unknown retroarch option: {value}")),
    }
}

fn set_path_option(slot: &mut Option<PathBuf>, value: PathBuf, option: &str) -> Result<(), String> {
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

fn set_text_option(slot: &mut Option<String>, value: String, option: &str) -> Result<(), String> {
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

fn set_hash_option(
    slot: &mut Option<ExpectedSha256>,
    value: &str,
    option: &str,
) -> Result<(), String> {
    let value = value
        .parse()
        .map_err(|error| format!("{option}: {error}"))?;
    if slot.replace(value).is_some() {
        Err(format!("{option} may only be supplied once"))
    } else {
        Ok(())
    }
}

fn required_text(arguments: &[OsString], cursor: usize, option: &str) -> Result<String, String> {
    arguments
        .get(cursor)
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("{option} requires a non-empty UTF-8 value"))
}

fn supervise(arguments: &[OsString]) -> Result<ExitCode, String> {
    let (dry_run, spec) = supervise_plan(arguments)?;

    if dry_run {
        println!("program: {}", spec.program().display());
        for argument in spec.arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        return Ok(ExitCode::SUCCESS);
    }

    let child = ProcessSupervisor
        .launch(&spec)
        .map_err(|error| error.to_string())?;
    println!("started: {}", child.id());
    let status = child.wait().map_err(|error| error.to_string())?;
    println!("exited: {status}");

    Ok(if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

#[derive(Debug)]
struct WatchdogPlan {
    dry_run: bool,
    spec: LaunchSpec,
    policy: WatchdogPolicy,
    heartbeat_file: PathBuf,
    fault_file: Option<PathBuf>,
}

fn watchdog(arguments: &[OsString]) -> Result<ExitCode, String> {
    let plan = watchdog_plan(arguments)?;
    if plan.dry_run {
        println!("program: {}", plan.spec.program().display());
        for argument in plan.spec.arguments() {
            println!("argument: {}", argument.to_string_lossy());
        }
        println!("heartbeat-file: {}", plan.heartbeat_file.display());
        if let Some(path) = &plan.fault_file {
            println!("fault-file: {}", path.display());
        }
        println!(
            "watchdog: startup={}ms heartbeat={}ms poll={}ms backoff={}ms restarts={}",
            plan.policy.startup_timeout.as_millis(),
            plan.policy.heartbeat_timeout.as_millis(),
            plan.policy.poll_interval.as_millis(),
            plan.policy.restart_backoff.as_millis(),
            plan.policy.max_restarts
        );
        return Ok(ExitCode::SUCCESS);
    }

    let probe = FileHealthProbe::new(plan.heartbeat_file, plan.fault_file)
        .map_err(|error| error.to_string())?;
    ProcessSupervisor
        .watch(&plan.spec, &plan.policy, probe, |event| println!("{event}"))
        .map_err(|error| error.to_string())?;
    Ok(ExitCode::SUCCESS)
}

fn watchdog_plan(arguments: &[OsString]) -> Result<WatchdogPlan, String> {
    let mut dry_run = false;
    let mut policy = WatchdogPolicy::local_game_defaults();
    let mut heartbeat_file = None;
    let mut fault_file = None;
    let mut cursor = 0;

    while let Some(argument) = arguments.get(cursor) {
        let Some(option) = argument.to_str() else {
            break;
        };
        match option {
            "--dry-run" => dry_run = true,
            "--heartbeat-file" => {
                cursor += 1;
                heartbeat_file = Some(required_path(arguments, cursor, option)?);
            }
            "--fault-file" => {
                cursor += 1;
                fault_file = Some(required_path(arguments, cursor, option)?);
            }
            "--startup-timeout-ms" => {
                cursor += 1;
                policy.startup_timeout =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--heartbeat-timeout-ms" => {
                cursor += 1;
                policy.heartbeat_timeout =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--poll-ms" => {
                cursor += 1;
                policy.poll_interval =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--restart-backoff-ms" => {
                cursor += 1;
                policy.restart_backoff =
                    Duration::from_millis(required_number(arguments, cursor, option)?);
            }
            "--max-restarts" => {
                cursor += 1;
                policy.max_restarts = required_number(arguments, cursor, option)?
                    .try_into()
                    .map_err(|_| "--max-restarts exceeds the supported range".to_owned())?;
            }
            "--" => {
                cursor += 1;
                break;
            }
            value if value.starts_with("--") => {
                return Err(format!("unknown watchdog option: {value}"));
            }
            _ => break,
        }
        cursor += 1;
    }

    let heartbeat_file =
        heartbeat_file.ok_or_else(|| "watchdog requires --heartbeat-file".to_owned())?;
    FileHealthProbe::new(heartbeat_file.clone(), fault_file.clone())
        .map_err(|error| error.to_string())?;
    let program = arguments
        .get(cursor)
        .ok_or_else(|| "watchdog requires an executable after `--`".to_owned())?;
    policy.validate().map_err(|error| error.to_string())?;
    let spec = LaunchSpec::new(program)
        .map_err(|error| error.to_string())?
        .args(arguments[cursor + 1..].iter().cloned())
        .env("VCG_HEARTBEAT_FILE", heartbeat_file.as_os_str());

    Ok(WatchdogPlan {
        dry_run,
        spec,
        policy,
        heartbeat_file,
        fault_file,
    })
}

fn required_path(arguments: &[OsString], cursor: usize, option: &str) -> Result<PathBuf, String> {
    let value = arguments
        .get(cursor)
        .ok_or_else(|| format!("{option} requires a path"))?;
    if value.is_empty() {
        return Err(format!("{option} requires a non-empty path"));
    }
    Ok(PathBuf::from(value))
}

fn required_number(arguments: &[OsString], cursor: usize, option: &str) -> Result<u64, String> {
    arguments
        .get(cursor)
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("{option} requires an integer"))?
        .parse()
        .map_err(|_| format!("{option} requires an integer"))
}

fn supervise_plan(arguments: &[OsString]) -> Result<(bool, LaunchSpec), String> {
    let mut dry_run = false;
    let mut cursor = 0;

    if arguments
        .get(cursor)
        .is_some_and(|value| value == "--dry-run")
    {
        dry_run = true;
        cursor += 1;
    }
    if arguments.get(cursor).is_some_and(|value| value == "--") {
        cursor += 1;
    }

    let program = arguments
        .get(cursor)
        .ok_or_else(|| "supervise requires an executable after `--`".to_owned())?;
    let spec = LaunchSpec::new(program)
        .map_err(|error| error.to_string())?
        .args(arguments[cursor + 1..].iter().cloned());
    Ok((dry_run, spec))
}

fn usage() -> String {
    "usage:\n  vcg-host doctor\n  vcg-host launcher [--dry-run] [--windowed] --browser <path> --profile-dir <path> --url <loopback-http-url>\n  vcg-host supervise [--dry-run] -- <program> [arguments...]\n  vcg-host watchdog [options] --heartbeat-file <path> [--fault-file <path>] -- <program> [arguments...]\n  vcg-host retroarch [--dry-run] --install-root <path> --runtime-root <path> --data-root <path> --frontend <path> --frontend-sha256 <hex> --core <path> --core-sha256 <hex> --base-config <path> --profile <id> --game <id> [--content-root <path> --content <path> --content-sha256 <hex>]"
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        launcher_request, plan_launcher, retroarch_request, supervise, supervise_plan,
        watchdog_plan,
    };
    use std::ffi::OsString;

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    #[test]
    fn supervise_requires_a_program() {
        assert!(supervise(&[]).is_err());
        assert!(supervise(&args(&["--dry-run"])).is_err());
    }

    #[test]
    fn parses_a_windowed_launcher_request() {
        let browser = std::env::current_dir()
            .expect("current directory is available")
            .join("browser");
        let profile = std::env::current_dir()
            .expect("current directory is available")
            .join("profile");
        let arguments = vec![
            OsString::from("--dry-run"),
            OsString::from("--windowed"),
            OsString::from("--browser"),
            browser.into_os_string(),
            OsString::from("--profile-dir"),
            profile.into_os_string(),
            OsString::from("--url"),
            OsString::from("http://127.0.0.1:5173/"),
        ];
        let (dry_run, request) = launcher_request(&arguments).expect("launcher request parses");

        assert!(dry_run);
        let spec = plan_launcher(&request).expect("launcher request plans");
        assert!(
            !spec
                .arguments()
                .any(|argument| argument == "--start-fullscreen")
        );
    }

    #[test]
    fn launcher_requires_all_explicit_inputs() {
        assert!(launcher_request(&[]).is_err());
        assert!(launcher_request(&args(&["--browser", "browser"])).is_err());
        assert!(
            launcher_request(&args(&["--browser", "browser", "--profile-dir", "profile"])).is_err()
        );
    }

    #[test]
    fn parses_a_normal_program_invocation() {
        let (dry_run, spec) =
            supervise_plan(&args(&["program", "argument"])).expect("normal invocation parses");
        assert!(!dry_run);
        assert_eq!(spec.program(), std::path::Path::new("program"));
        assert_eq!(
            spec.arguments().collect::<Vec<_>>(),
            vec![std::ffi::OsStr::new("argument")]
        );
    }

    #[test]
    fn parses_dry_run_separator_and_arguments() {
        let (dry_run, spec) = supervise_plan(&args(&[
            "--dry-run",
            "--",
            "program",
            "--child-option",
            "value",
        ]))
        .expect("dry run parses");
        assert!(dry_run);
        assert_eq!(spec.program(), std::path::Path::new("program"));
        assert_eq!(
            spec.arguments().collect::<Vec<_>>(),
            vec![
                std::ffi::OsStr::new("--child-option"),
                std::ffi::OsStr::new("value")
            ]
        );
    }

    #[test]
    fn preserves_child_arguments_that_begin_with_dashes() {
        let (_, spec) = supervise_plan(&args(&["program", "--", "--child-option"]))
            .expect("child arguments parse");
        assert_eq!(
            spec.arguments().collect::<Vec<_>>(),
            vec![
                std::ffi::OsStr::new("--"),
                std::ffi::OsStr::new("--child-option")
            ]
        );
    }

    #[test]
    fn watchdog_requires_a_heartbeat_file_and_program() {
        assert!(watchdog_plan(&args(&["--", "program"])).is_err());
        assert!(watchdog_plan(&args(&["--heartbeat-file", "heartbeat"])).is_err());
        assert!(
            watchdog_plan(&args(&[
                "--heartbeat-file",
                "signal",
                "--fault-file",
                "signal",
                "--",
                "program"
            ]))
            .is_err()
        );
    }

    #[test]
    fn retroarch_requires_all_trusted_roots_and_artifacts() {
        assert!(retroarch_request(&[]).is_err());
        assert!(
            retroarch_request(&args(&[
                "--install-root",
                "/installed",
                "--runtime-root",
                "/runtime",
                "--data-root",
                "/data",
                "--frontend",
                "/installed/retroarch",
                "--core",
                "/installed/core.so",
                "--base-config",
                "/installed/base.cfg",
                "--profile",
                "player-one",
            ]))
            .is_err()
        );
    }

    #[test]
    fn retroarch_parser_rejects_duplicate_and_unknown_options() {
        assert!(
            retroarch_request(&args(&["--install-root", "/one", "--install-root", "/two"]))
                .is_err()
        );
        assert!(retroarch_request(&args(&["--surprise"])).is_err());
        assert!(
            retroarch_request(&args(&[
                "--frontend-sha256",
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            ]))
            .is_err()
        );
    }

    #[test]
    fn retroarch_parser_accepts_exact_manifest_hashes() {
        let hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let (_, request) = retroarch_request(&args(&[
            "--dry-run",
            "--install-root",
            "/installed",
            "--runtime-root",
            "/runtime",
            "--data-root",
            "/data",
            "--frontend",
            "/installed/retroarch",
            "--frontend-sha256",
            hash,
            "--core",
            "/installed/core.so",
            "--core-sha256",
            hash,
            "--base-config",
            "/installed/base.cfg",
            "--profile",
            "player-one",
            "--game",
            "retro-2048",
        ]))
        .expect("complete request parses");
        assert_eq!(request.frontend_sha256.to_string(), hash);
        assert_eq!(request.core_sha256.to_string(), hash);
        assert!(request.content_sha256.is_none());
    }

    #[test]
    fn parses_a_bounded_watchdog_plan() {
        let plan = watchdog_plan(&args(&[
            "--dry-run",
            "--heartbeat-file",
            "heartbeat",
            "--fault-file",
            "fault",
            "--startup-timeout-ms",
            "25",
            "--heartbeat-timeout-ms",
            "10",
            "--poll-ms",
            "2",
            "--restart-backoff-ms",
            "0",
            "--max-restarts",
            "2",
            "--",
            "program",
            "--child-option",
        ]))
        .expect("watchdog invocation parses");
        assert!(plan.dry_run);
        assert_eq!(plan.heartbeat_file, std::path::Path::new("heartbeat"));
        assert_eq!(
            plan.fault_file.as_deref(),
            Some(std::path::Path::new("fault"))
        );
        assert_eq!(
            plan.policy.startup_timeout,
            std::time::Duration::from_millis(25)
        );
        assert_eq!(
            plan.policy.heartbeat_timeout,
            std::time::Duration::from_millis(10)
        );
        assert_eq!(
            plan.policy.poll_interval,
            std::time::Duration::from_millis(2)
        );
        assert_eq!(plan.policy.restart_backoff, std::time::Duration::ZERO);
        assert_eq!(plan.policy.max_restarts, 2);
        assert_eq!(plan.spec.program(), std::path::Path::new("program"));
        assert_eq!(
            plan.spec.arguments().collect::<Vec<_>>(),
            vec![std::ffi::OsStr::new("--child-option")]
        );
    }
}
