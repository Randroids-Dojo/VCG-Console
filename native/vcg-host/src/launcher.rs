//! Native launcher-shell planning for the local VCG Console surface.

use std::fmt;
use std::net::IpAddr;
use std::path::{Path, PathBuf};

use crate::process::{LaunchError, LaunchSpec};

/// Trusted inputs for starting the local launcher in Chromium app mode.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LauncherRequest {
    browser: PathBuf,
    profile_dir: PathBuf,
    url: String,
    fullscreen: bool,
}

impl LauncherRequest {
    #[must_use]
    pub fn new(
        browser: impl Into<PathBuf>,
        profile_dir: impl Into<PathBuf>,
        url: impl Into<String>,
    ) -> Self {
        Self {
            browser: browser.into(),
            profile_dir: profile_dir.into(),
            url: url.into(),
            fullscreen: true,
        }
    }

    #[must_use]
    pub fn windowed(mut self) -> Self {
        self.fullscreen = false;
        self
    }

    #[must_use]
    pub fn with_url(mut self, url: impl Into<String>) -> Self {
        self.url = url.into();
        self
    }

    #[must_use]
    pub fn profile_dir(&self) -> &Path {
        &self.profile_dir
    }

    #[must_use]
    pub fn url(&self) -> &str {
        &self.url
    }
}

/// Builds a direct browser launch owned by the Rust host.
///
/// The launcher surface must use plain HTTP on an explicit loopback port. This
/// keeps the desk prototype local and prevents this adapter from becoming an
/// unrestricted browser launcher.
///
/// # Errors
///
/// Returns an error when paths are not absolute, the profile path is not UTF-8,
/// the URL is not an explicit loopback HTTP origin, or the launch spec is invalid.
pub fn plan(request: &LauncherRequest) -> Result<LaunchSpec, LauncherError> {
    if !request.browser.is_absolute() {
        return Err(LauncherError::BrowserPathNotAbsolute);
    }
    if !request.profile_dir.is_absolute() {
        return Err(LauncherError::ProfilePathNotAbsolute);
    }
    let profile_dir = request
        .profile_dir
        .to_str()
        .ok_or(LauncherError::ProfilePathNotUtf8)?;
    loopback_origin(&request.url)?;

    let mut arguments = vec![
        format!("--app={}", request.url),
        format!("--user-data-dir={profile_dir}"),
        "--no-first-run".to_owned(),
        "--disable-background-mode".to_owned(),
        "--disable-session-crashed-bubble".to_owned(),
        // Without an explicit hint, Chromium's Ozone backend defaults to X11 on
        // Linux even when only a Wayland session is available (no XWayland
        // fallback), and fails outright with "Missing X server or $DISPLAY".
        // `auto` selects Wayland when the environment advertises it and falls
        // back to X11 otherwise; non-Linux browsers ignore the unrecognized flag.
        "--ozone-platform-hint=auto".to_owned(),
        // Without this, Chromium tries to store its encrypted-storage key in
        // the OS keyring (GNOME Keyring/KWallet) and blocks the entire
        // fullscreen session behind a "Choose password for new keyring" modal
        // on a fresh appliance profile, since no keyring is configured for
        // this non-desktop session. `basic` skips OS keyring integration
        // entirely, appropriate for a kiosk with no persistent user login --
        // but it stores anything Chromium's password manager saves as
        // effectively plaintext in the persistent profile. Disable the
        // password manager outright rather than rely on this surface never
        // being reached: unknown --disable-features entries are silently
        // ignored, so this is safe even if the exact name ever changes
        // upstream.
        "--password-store=basic".to_owned(),
        "--disable-features=PasswordManager".to_owned(),
    ];
    if request.fullscreen {
        arguments.push("--start-fullscreen".to_owned());
    }

    LaunchSpec::new(&request.browser)
        .map(|spec| spec.args(arguments))
        .map_err(LauncherError::Launch)
}

/// Returns the validated launcher origin for exact-origin host API checks.
///
/// # Errors
///
/// Returns an error unless the URL uses HTTP, an explicit port, and a
/// loopback-only host.
pub fn loopback_origin(url: &str) -> Result<String, LauncherError> {
    let remainder = url
        .strip_prefix("http://")
        .ok_or(LauncherError::UnsafeUrl)?;
    let authority = remainder
        .split(['/', '?', '#'])
        .next()
        .filter(|value| !value.is_empty())
        .ok_or(LauncherError::UnsafeUrl)?;
    if authority.contains('@') {
        return Err(LauncherError::UnsafeUrl);
    }

    let (host, port) = authority.rsplit_once(':').ok_or(LauncherError::UnsafeUrl)?;
    port.parse::<u16>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or(LauncherError::UnsafeUrl)?;
    let loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .is_ok_and(|address| address.is_loopback());
    if !loopback {
        return Err(LauncherError::UnsafeUrl);
    }
    Ok(format!("http://{authority}"))
}

#[derive(Debug)]
pub enum LauncherError {
    BrowserPathNotAbsolute,
    ProfilePathNotAbsolute,
    ProfilePathNotUtf8,
    UnsafeUrl,
    Launch(LaunchError),
}

impl fmt::Display for LauncherError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BrowserPathNotAbsolute => {
                formatter.write_str("launcher browser path must be absolute")
            }
            Self::ProfilePathNotAbsolute => {
                formatter.write_str("launcher profile path must be absolute")
            }
            Self::ProfilePathNotUtf8 => {
                formatter.write_str("launcher profile path must be valid UTF-8")
            }
            Self::UnsafeUrl => formatter.write_str(
                "launcher URL must use http://localhost:<port> or an explicit loopback IP and port",
            ),
            Self::Launch(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for LauncherError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Launch(error) => Some(error),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LauncherRequest, plan};
    use std::path::PathBuf;

    fn absolute_path(name: &str) -> PathBuf {
        std::env::current_dir()
            .expect("current directory is available")
            .join(name)
    }

    #[test]
    fn plans_a_fullscreen_loopback_app_with_a_private_profile() {
        let browser = absolute_path("browser");
        let profile = absolute_path("profile");
        let spec = plan(&LauncherRequest::new(
            &browser,
            &profile,
            "http://127.0.0.1:5173/",
        ))
        .expect("loopback launcher should plan");
        let arguments = spec
            .arguments()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(spec.program(), browser);
        assert_eq!(arguments[0], "--app=http://127.0.0.1:5173/");
        assert_eq!(
            arguments[1],
            format!("--user-data-dir={}", profile.display())
        );
        assert!(arguments.contains(&"--start-fullscreen".to_owned()));
        assert!(arguments.contains(&"--ozone-platform-hint=auto".to_owned()));
        assert!(arguments.contains(&"--password-store=basic".to_owned()));
        assert!(arguments.contains(&"--disable-features=PasswordManager".to_owned()));
    }

    #[test]
    fn permits_a_windowed_localhost_launcher() {
        let spec = plan(
            &LauncherRequest::new(
                absolute_path("browser"),
                absolute_path("profile"),
                "http://localhost:4173/launcher",
            )
            .windowed(),
        )
        .expect("windowed loopback launcher should plan");

        assert!(
            !spec
                .arguments()
                .any(|argument| argument == "--start-fullscreen")
        );
    }

    #[test]
    fn rejects_remote_secure_and_implicit_port_urls() {
        for url in [
            "https://127.0.0.1:5173/",
            "http://example.com:5173/",
            "http://localhost/",
            "http://user@localhost:5173/",
        ] {
            assert!(
                plan(&LauncherRequest::new(
                    absolute_path("browser"),
                    absolute_path("profile"),
                    url,
                ))
                .is_err(),
                "{url} should be rejected"
            );
        }
    }

    #[test]
    fn requires_absolute_browser_and_profile_paths() {
        assert!(
            plan(&LauncherRequest::new(
                "browser",
                absolute_path("profile"),
                "http://127.0.0.1:5173/",
            ))
            .is_err()
        );
        assert!(
            plan(&LauncherRequest::new(
                absolute_path("browser"),
                "profile",
                "http://127.0.0.1:5173/",
            ))
            .is_err()
        );
    }
}
