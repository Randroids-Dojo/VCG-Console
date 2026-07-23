use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use vcg_host::process::{FileHealthProbe, LaunchSpec, ProcessSupervisor, WatchdogPolicy};

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
            println!("process-supervision: available");
            println!("game-watchdog: heartbeat-and-bounded-restart");
            println!("resource-fault-detection: adapter-required");
            println!("sdl3-input: adapter pending target-Linux qualification");
            Ok(ExitCode::SUCCESS)
        }
        "supervise" => supervise(&arguments[1..]),
        "watchdog" => watchdog(&arguments[1..]),
        "help" | "--help" | "-h" => {
            println!("{}", usage());
            Ok(ExitCode::SUCCESS)
        }
        _ => Err(usage()),
    }
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
    "usage:\n  vcg-host doctor\n  vcg-host supervise [--dry-run] -- <program> [arguments...]\n  vcg-host watchdog [options] --heartbeat-file <path> [--fault-file <path>] -- <program> [arguments...]"
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::{supervise, supervise_plan, watchdog_plan};
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
