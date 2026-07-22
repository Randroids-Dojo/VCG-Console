use std::env;
use std::ffi::OsString;
use std::process::ExitCode;

use vcg_host::process::{LaunchSpec, ProcessSupervisor};

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
            println!("sdl3-input: adapter pending target-Linux qualification");
            Ok(ExitCode::SUCCESS)
        }
        "supervise" => supervise(&arguments[1..]),
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
    "usage:\n  vcg-host doctor\n  vcg-host supervise [--dry-run] -- <program> [arguments...]"
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::{supervise, supervise_plan};
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
}
