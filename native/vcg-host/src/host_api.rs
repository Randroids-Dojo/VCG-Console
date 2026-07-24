//! Authenticated loopback status API for the trusted launcher surface.

use std::fmt;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::str;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::installed_catalog::{CatalogError, TrustedPackageCatalog};
use crate::native_launch::{
    NativeLaunchError, NativeLaunchService, NativeLaunchSnapshot, NativeLaunchState,
};
use crate::process::WatchdogPolicy;

const MAX_REQUEST_BYTES: usize = 8_192;
const MAX_LAUNCH_BODY_BYTES: usize = 1_024;
const READ_TIMEOUT: Duration = Duration::from_millis(500);
const ACCEPT_POLL_INTERVAL: Duration = Duration::from_millis(10);
const TOKEN_BYTES: usize = 32;
pub const HOST_API_PROTOCOL_VERSION: &str = "0.1.0";

/// A per-launch status server bound only to IPv4 loopback.
pub struct HostStatusServer {
    address: SocketAddr,
    allowed_origin: String,
    token: String,
    stop: Arc<AtomicBool>,
    _launch_service: Option<Arc<NativeLaunchService>>,
    worker: Option<JoinHandle<()>>,
}

impl HostStatusServer {
    /// Starts the status API for one launcher process.
    ///
    /// # Errors
    ///
    /// Returns an error when the listener, operating-system random source, or
    /// worker thread cannot be created.
    pub fn start(allowed_origin: impl Into<String>) -> Result<Self, HostApiError> {
        Self::start_internal(allowed_origin.into(), None, None)
    }

    /// Starts the status API with a signature-verified installed catalog.
    ///
    /// # Errors
    ///
    /// Returns an error when the listener, operating-system random source, or
    /// worker thread cannot be created.
    pub fn start_with_catalog(
        allowed_origin: impl Into<String>,
        catalog: TrustedPackageCatalog,
    ) -> Result<Self, HostApiError> {
        Self::start_internal(allowed_origin.into(), Some(Arc::new(catalog)), None)
    }

    /// Starts the API with signature-verified package discovery and process
    /// launch for an explicit host-owned profile allowlist.
    ///
    /// # Errors
    ///
    /// Returns an error when launch configuration, the listener,
    /// operating-system randomness, or worker creation fails.
    pub fn start_with_launch_service(
        allowed_origin: impl Into<String>,
        catalog: TrustedPackageCatalog,
        profile_ids: impl IntoIterator<Item = String>,
    ) -> Result<Self, HostApiError> {
        Self::start_with_watchdog_launch_service(
            allowed_origin,
            catalog,
            profile_ids,
            Vec::new(),
            WatchdogPolicy::local_game_defaults(),
        )
    }

    /// Starts the API with fixed-intent launching and heartbeat supervision
    /// for an explicit set of signature-verified installed games.
    ///
    /// # Errors
    ///
    /// Returns an error when launch/watchdog configuration, the listener,
    /// operating-system randomness, or worker creation fails.
    pub fn start_with_watchdog_launch_service(
        allowed_origin: impl Into<String>,
        catalog: TrustedPackageCatalog,
        profile_ids: impl IntoIterator<Item = String>,
        watchdog_game_ids: impl IntoIterator<Item = String>,
        watchdog_policy: WatchdogPolicy,
    ) -> Result<Self, HostApiError> {
        let catalog = Arc::new(catalog);
        let launch_service = Arc::new(
            NativeLaunchService::with_watchdog_games(
                Arc::clone(&catalog),
                profile_ids,
                watchdog_game_ids,
                watchdog_policy,
            )
            .map_err(HostApiError::LaunchConfiguration)?,
        );
        Self::start_internal(allowed_origin.into(), Some(catalog), Some(launch_service))
    }

    fn start_internal(
        allowed_origin: String,
        catalog: Option<Arc<TrustedPackageCatalog>>,
        launch_service: Option<Arc<NativeLaunchService>>,
    ) -> Result<Self, HostApiError> {
        let valid_origin = crate::launcher::loopback_origin(&allowed_origin)
            .is_ok_and(|origin| origin == allowed_origin);
        if !valid_origin {
            return Err(HostApiError::InvalidAllowedOrigin);
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(HostApiError::Io)?;
        listener.set_nonblocking(true).map_err(HostApiError::Io)?;
        let address = listener.local_addr().map_err(HostApiError::Io)?;
        let token = generate_token()?;
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let worker_origin = allowed_origin.clone();
        let worker_token = token.clone();
        let worker_launch_service = launch_service.clone();
        let worker = thread::Builder::new()
            .name("vcg-host-status".to_owned())
            .spawn(move || {
                serve(
                    &listener,
                    &worker_origin,
                    &worker_token,
                    catalog.as_deref(),
                    worker_launch_service.as_deref(),
                    &worker_stop,
                );
            })
            .map_err(HostApiError::Io)?;

        Ok(Self {
            address,
            allowed_origin,
            token,
            stop,
            _launch_service: launch_service,
            worker: Some(worker),
        })
    }

    /// Adds the ephemeral host endpoint and capability token to a URL fragment.
    ///
    /// Fragments are not sent to the launcher HTTP server. The Svelte client
    /// keeps the token in memory and sends it only to this loopback API.
    ///
    /// # Errors
    ///
    /// Returns an error when the base launcher URL already has a fragment.
    pub fn launcher_url(&self, base_url: &str) -> Result<String, HostApiError> {
        if base_url.contains('#') {
            return Err(HostApiError::LauncherUrlHasFragment);
        }
        Ok(format!(
            "{base_url}#vcg-host-port={}&vcg-host-token={}",
            self.address.port(),
            self.token
        ))
    }

    #[must_use]
    pub fn address(&self) -> SocketAddr {
        self.address
    }

    #[must_use]
    pub fn allowed_origin(&self) -> &str {
        &self.allowed_origin
    }
}

impl Drop for HostStatusServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.address);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn generate_token() -> Result<String, HostApiError> {
    let mut bytes = [0_u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes).map_err(HostApiError::Random)?;
    let mut output = String::with_capacity(TOKEN_BYTES * 2);
    for byte in bytes {
        use fmt::Write as _;
        write!(output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(output)
}

fn serve(
    listener: &TcpListener,
    allowed_origin: &str,
    token: &str,
    catalog: Option<&TrustedPackageCatalog>,
    launch_service: Option<&NativeLaunchService>,
    stop: &AtomicBool,
) {
    while !stop.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ =
                    handle_connection(&mut stream, allowed_origin, token, catalog, launch_service);
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(ACCEPT_POLL_INTERVAL);
            }
            Err(_) => break,
        }
    }
}

fn handle_connection(
    stream: &mut TcpStream,
    allowed_origin: &str,
    token: &str,
    catalog: Option<&TrustedPackageCatalog>,
    launch_service: Option<&NativeLaunchService>,
) -> io::Result<()> {
    stream.set_read_timeout(Some(READ_TIMEOUT))?;
    stream.set_write_timeout(Some(READ_TIMEOUT))?;
    let request = match read_request(stream) {
        Ok(request) => request,
        Err(RequestReadError::TooLarge) => {
            return write_response(stream, 413, "Payload Too Large", allowed_origin, "");
        }
        Err(RequestReadError::Invalid) => {
            return write_response(stream, 400, "Bad Request", allowed_origin, "");
        }
        Err(RequestReadError::Io(error)) => return Err(error),
    };

    if request.origin.as_deref() != Some(allowed_origin) {
        return write_response(stream, 403, "Forbidden", allowed_origin, "");
    }
    if request.method != "POST" && !request.body.is_empty() {
        return write_response(stream, 400, "Bad Request", allowed_origin, "");
    }

    match request.method.as_str() {
        "OPTIONS" => {
            if request.origin.as_deref() != Some(allowed_origin) || !valid_preflight(&request) {
                return write_response(stream, 403, "Forbidden", allowed_origin, "");
            }
            write_response(stream, 204, "No Content", allowed_origin, "")
        }
        "GET" => {
            let supplied = request
                .authorization
                .as_deref()
                .and_then(|value| value.strip_prefix("Bearer "));
            if supplied.is_none_or(|value| !constant_time_equal(value.as_bytes(), token.as_bytes()))
            {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            if request.path == "/v1/status" {
                return write_response(
                    stream,
                    200,
                    "OK",
                    allowed_origin,
                    &status_body(catalog, launch_service),
                );
            }
            if let Some(game_id) = request.path.strip_prefix("/v1/packages/") {
                return write_package_response(stream, allowed_origin, catalog, game_id);
            }
            if let Some(request_id) = request.path.strip_prefix("/v1/launches/") {
                return write_launch_status_response(
                    stream,
                    allowed_origin,
                    launch_service,
                    request_id,
                );
            }
            write_response(stream, 404, "Not Found", allowed_origin, "")
        }
        "POST" if request.path == "/v1/launches" => {
            let supplied = request
                .authorization
                .as_deref()
                .and_then(|value| value.strip_prefix("Bearer "));
            if supplied.is_none_or(|value| !constant_time_equal(value.as_bytes(), token.as_bytes()))
            {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            write_launch_response(stream, allowed_origin, launch_service, &request)
        }
        "DELETE" => {
            let supplied = request
                .authorization
                .as_deref()
                .and_then(|value| value.strip_prefix("Bearer "));
            if supplied.is_none_or(|value| !constant_time_equal(value.as_bytes(), token.as_bytes()))
            {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            let Some(request_id) = request.path.strip_prefix("/v1/launches/") else {
                return write_response(stream, 404, "Not Found", allowed_origin, "");
            };
            write_cancel_response(stream, allowed_origin, launch_service, request_id)
        }
        _ => write_response(stream, 405, "Method Not Allowed", allowed_origin, ""),
    }
}

fn valid_preflight(request: &Request) -> bool {
    let Some(method) = request.preflight_method.as_deref() else {
        return false;
    };
    let valid_target = match method {
        "GET" => {
            request.path == "/v1/status"
                || request.path.starts_with("/v1/packages/")
                || request.path.starts_with("/v1/launches/")
        }
        "POST" => request.path == "/v1/launches",
        "DELETE" => request.path.starts_with("/v1/launches/"),
        _ => false,
    };
    if !valid_target {
        return false;
    }
    let headers = request
        .preflight_headers
        .iter()
        .flat_map(|header| header.split(','))
        .map(str::trim)
        .collect::<Vec<_>>();
    headers
        .iter()
        .any(|header| header.eq_ignore_ascii_case("authorization"))
        && headers.iter().all(|header| {
            header.eq_ignore_ascii_case("authorization")
                || header.eq_ignore_ascii_case("content-type")
        })
        && (method != "POST"
            || headers
                .iter()
                .any(|header| header.eq_ignore_ascii_case("content-type")))
}

fn status_body(
    catalog: Option<&TrustedPackageCatalog>,
    launch_service: Option<&NativeLaunchService>,
) -> String {
    let mut capabilities = vec![
        "launcher-shell",
        "process-supervision",
        "game-watchdog",
        "retroarch-plan",
    ];
    if catalog.is_some() {
        capabilities.push("trusted-package-catalog");
    }
    if launch_service.is_some() {
        capabilities.push("trusted-package-launch");
    }
    serde_json::json!({
        "protocolVersion": HOST_API_PROTOCOL_VERSION,
        "hostVersion": env!("CARGO_PKG_VERSION"),
        "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
        "capabilities": capabilities,
    })
    .to_string()
}

fn write_package_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    catalog: Option<&TrustedPackageCatalog>,
    game_id: &str,
) -> io::Result<()> {
    let Some(catalog) = catalog else {
        return write_response(
            stream,
            404,
            "Not Found",
            allowed_origin,
            r#"{"code":"PACKAGE_NOT_INSTALLED"}"#,
        );
    };
    match catalog.package_summary(game_id) {
        Ok(package) => {
            let body = serde_json::json!({
                "id": package.id,
                "version": package.version,
                "runtime": package.runtime,
                "catalogGeneration": package.generation,
            })
            .to_string();
            write_response(stream, 200, "OK", allowed_origin, &body)
        }
        Err(CatalogError::PackageNotFound(_)) => write_response(
            stream,
            404,
            "Not Found",
            allowed_origin,
            r#"{"code":"PACKAGE_NOT_INSTALLED"}"#,
        ),
        Err(_) => write_response(
            stream,
            400,
            "Bad Request",
            allowed_origin,
            r#"{"code":"PACKAGE_ID_INVALID"}"#,
        ),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LaunchRequestDocument {
    protocol_version: String,
    request_id: String,
    game_id: String,
    profile_id: String,
}

fn write_launch_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    launch_service: Option<&NativeLaunchService>,
    request: &Request,
) -> io::Result<()> {
    let Some(launch_service) = launch_service else {
        return write_json_error(
            stream,
            404,
            "Not Found",
            allowed_origin,
            "PACKAGE_LAUNCH_UNAVAILABLE",
        );
    };
    if request.content_type.as_deref() != Some("application/json") {
        return write_json_error(
            stream,
            415,
            "Unsupported Media Type",
            allowed_origin,
            "CONTENT_TYPE_INVALID",
        );
    }
    if request.body.is_empty() || request.body.len() > MAX_LAUNCH_BODY_BYTES {
        return write_json_error(
            stream,
            400,
            "Bad Request",
            allowed_origin,
            "LAUNCH_REQUEST_INVALID",
        );
    }
    let document: LaunchRequestDocument = match serde_json::from_slice(&request.body) {
        Ok(document) => document,
        Err(_) => {
            return write_json_error(
                stream,
                400,
                "Bad Request",
                allowed_origin,
                "LAUNCH_REQUEST_INVALID",
            );
        }
    };
    if document.protocol_version != HOST_API_PROTOCOL_VERSION {
        return write_json_error(
            stream,
            409,
            "Conflict",
            allowed_origin,
            "HOST_PROTOCOL_MISMATCH",
        );
    }
    match launch_service.start(
        &document.request_id,
        &document.game_id,
        &document.profile_id,
    ) {
        Ok(start) => {
            let body = launch_snapshot_body(&start.snapshot, start.replayed);
            let (status, reason) = if start.replayed {
                (200, "OK")
            } else {
                match start.snapshot.state {
                    NativeLaunchState::Failed { .. } => (422, "Unprocessable Content"),
                    NativeLaunchState::Cancelled | NativeLaunchState::Completed { .. } => {
                        (200, "OK")
                    }
                    NativeLaunchState::Preparing
                    | NativeLaunchState::Running
                    | NativeLaunchState::Stopping => (202, "Accepted"),
                }
            };
            write_response(stream, status, reason, allowed_origin, &body)
        }
        Err(error) => write_launch_error(stream, allowed_origin, &error),
    }
}

fn write_launch_status_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    launch_service: Option<&NativeLaunchService>,
    request_id: &str,
) -> io::Result<()> {
    let Some(launch_service) = launch_service else {
        return write_json_error(stream, 404, "Not Found", allowed_origin, "LAUNCH_NOT_FOUND");
    };
    match launch_service.status(request_id) {
        Ok(snapshot) => write_response(
            stream,
            200,
            "OK",
            allowed_origin,
            &launch_snapshot_body(&snapshot, false),
        ),
        Err(error) => write_launch_error(stream, allowed_origin, &error),
    }
}

fn write_cancel_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    launch_service: Option<&NativeLaunchService>,
    request_id: &str,
) -> io::Result<()> {
    let Some(launch_service) = launch_service else {
        return write_json_error(stream, 404, "Not Found", allowed_origin, "LAUNCH_NOT_FOUND");
    };
    match launch_service.cancel(request_id) {
        Ok(snapshot) => {
            let (status, reason) = if snapshot.state == NativeLaunchState::Stopping {
                (202, "Accepted")
            } else {
                (200, "OK")
            };
            write_response(
                stream,
                status,
                reason,
                allowed_origin,
                &launch_snapshot_body(&snapshot, false),
            )
        }
        Err(error) => write_launch_error(stream, allowed_origin, &error),
    }
}

fn launch_snapshot_body(snapshot: &NativeLaunchSnapshot, replayed: bool) -> String {
    let mut body = serde_json::json!({
        "protocolVersion": HOST_API_PROTOCOL_VERSION,
        "requestId": snapshot.request_id,
        "gameId": snapshot.game_id,
        "profileId": snapshot.profile_id,
        "state": snapshot.state.name(),
        "sequence": snapshot.sequence,
        "detailCode": snapshot.detail_code,
        "replayed": replayed,
    });
    if matches!(
        snapshot.state,
        NativeLaunchState::Completed { .. } | NativeLaunchState::Failed { .. }
    ) {
        body["exitCode"] = serde_json::to_value(snapshot.state.exit_code())
            .expect("optional process exit code is JSON");
    }
    body.to_string()
}

fn write_launch_error(
    stream: &mut TcpStream,
    allowed_origin: &str,
    error: &NativeLaunchError,
) -> io::Result<()> {
    let (status, reason, code) = match error {
        NativeLaunchError::InvalidRequestId(_)
        | NativeLaunchError::InvalidGame(_)
        | NativeLaunchError::InvalidProfile(_) => (400, "Bad Request", "LAUNCH_REQUEST_INVALID"),
        NativeLaunchError::ProfileNotFound(_) => (404, "Not Found", "PROFILE_NOT_AVAILABLE"),
        NativeLaunchError::RequestNotFound(_) => (404, "Not Found", "LAUNCH_NOT_FOUND"),
        NativeLaunchError::Catalog(CatalogError::PackageNotFound(_)) => {
            (404, "Not Found", "PACKAGE_NOT_INSTALLED")
        }
        NativeLaunchError::RequestConflict(_) => (409, "Conflict", "REQUEST_ID_CONFLICT"),
        NativeLaunchError::AlreadyRunning(_) => (409, "Conflict", "GAME_ALREADY_RUNNING"),
        NativeLaunchError::Catalog(_) | NativeLaunchError::RetroArch(_) => {
            (409, "Conflict", "PACKAGE_VERIFICATION_FAILED")
        }
        NativeLaunchError::NoProfiles
        | NativeLaunchError::DuplicateProfile(_)
        | NativeLaunchError::InvalidWatchdogGame(_)
        | NativeLaunchError::DuplicateWatchdogGame(_)
        | NativeLaunchError::WatchdogGameNotInstalled(_)
        | NativeLaunchError::WatchdogConfiguration(_)
        | NativeLaunchError::RecordLimit
        | NativeLaunchError::Launch(_)
        | NativeLaunchError::Io { .. }
        | NativeLaunchError::StatePoisoned => {
            (500, "Internal Server Error", "PACKAGE_LAUNCH_FAILED")
        }
    };
    write_json_error(stream, status, reason, allowed_origin, code)
}

fn write_json_error(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    allowed_origin: &str,
    code: &str,
) -> io::Result<()> {
    let body = serde_json::json!({ "code": code }).to_string();
    write_response(stream, status, reason, allowed_origin, &body)
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

struct Request {
    method: String,
    path: String,
    origin: Option<String>,
    authorization: Option<String>,
    content_type: Option<String>,
    preflight_method: Option<String>,
    preflight_headers: Vec<String>,
    body: Vec<u8>,
}

enum RequestReadError {
    Io(io::Error),
    Invalid,
    TooLarge,
}

fn read_request(stream: &mut TcpStream) -> Result<Request, RequestReadError> {
    let mut bytes = Vec::with_capacity(1_024);
    let mut buffer = [0_u8; 1_024];
    let header_end = loop {
        let read = stream.read(&mut buffer).map_err(RequestReadError::Io)?;
        if read == 0 {
            return Err(RequestReadError::Invalid);
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(RequestReadError::TooLarge);
        }
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break index + 4;
        }
    };
    let text = str::from_utf8(&bytes[..header_end]).map_err(|_| RequestReadError::Invalid)?;
    let (mut request, content_length) = parse_request(text).ok_or(RequestReadError::Invalid)?;
    let expected_length = header_end
        .checked_add(content_length)
        .ok_or(RequestReadError::TooLarge)?;
    if expected_length > MAX_REQUEST_BYTES || content_length > MAX_LAUNCH_BODY_BYTES {
        return Err(RequestReadError::TooLarge);
    }
    while bytes.len() < expected_length {
        let remaining = expected_length - bytes.len();
        let read_limit = remaining.min(buffer.len());
        let read = stream
            .read(&mut buffer[..read_limit])
            .map_err(RequestReadError::Io)?;
        if read == 0 {
            return Err(RequestReadError::Invalid);
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
    if bytes.len() != expected_length {
        return Err(RequestReadError::Invalid);
    }
    request.body.extend_from_slice(&bytes[header_end..]);
    Ok(request)
}

fn parse_request(text: &str) -> Option<(Request, usize)> {
    let mut lines = text.split("\r\n");
    let mut request_line = lines.next()?.split_whitespace();
    let method = request_line.next()?;
    let path = request_line.next()?;
    if request_line.next()? != "HTTP/1.1" || request_line.next().is_some() {
        return None;
    }
    if !path.starts_with('/')
        || path.contains(['?', '#'])
        || !path.bytes().all(|byte| byte.is_ascii_graphic())
    {
        return None;
    }

    let mut request = Request {
        method: method.to_owned(),
        path: path.to_owned(),
        origin: None,
        authorization: None,
        content_type: None,
        preflight_method: None,
        preflight_headers: Vec::new(),
        body: Vec::new(),
    };
    let mut content_length = None;
    for line in lines.take_while(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':')?;
        let value = value.trim();
        if name.eq_ignore_ascii_case("origin") {
            if request.origin.is_some() {
                return None;
            }
            request.origin = Some(value.to_owned());
        } else if name.eq_ignore_ascii_case("authorization") {
            if request.authorization.is_some() {
                return None;
            }
            request.authorization = Some(value.to_owned());
        } else if name.eq_ignore_ascii_case("content-type") {
            if request.content_type.is_some() {
                return None;
            }
            request.content_type = Some(value.to_ascii_lowercase());
        } else if name.eq_ignore_ascii_case("content-length") {
            if content_length.is_some()
                || value.is_empty()
                || !value.bytes().all(|byte| byte.is_ascii_digit())
            {
                return None;
            }
            content_length = Some(value.parse().ok()?);
        } else if name.eq_ignore_ascii_case("transfer-encoding") {
            return None;
        } else if name.eq_ignore_ascii_case("access-control-request-method") {
            if request.preflight_method.is_some() {
                return None;
            }
            request.preflight_method = Some(value.to_owned());
        } else if name.eq_ignore_ascii_case("access-control-request-headers") {
            request.preflight_headers.push(value.to_owned());
        }
    }
    Some((request, content_length.unwrap_or(0)))
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    allowed_origin: &str,
    body: &str,
) -> io::Result<()> {
    let content_type = if body.is_empty() {
        "text/plain; charset=utf-8"
    } else {
        "application/json; charset=utf-8"
    };
    write!(
        stream,
        concat!(
            "HTTP/1.1 {} {}\r\n",
            "Content-Length: {}\r\n",
            "Content-Type: {}\r\n",
            "Cache-Control: no-store\r\n",
            "Connection: close\r\n",
            "Access-Control-Allow-Origin: {}\r\n",
            "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n",
            "Access-Control-Allow-Headers: Authorization, Content-Type\r\n",
            "Cross-Origin-Resource-Policy: cross-origin\r\n",
            "Vary: Origin\r\n",
            "\r\n",
            "{}"
        ),
        status,
        reason,
        body.len(),
        content_type,
        allowed_origin,
        body
    )?;
    stream.flush()
}

#[derive(Debug)]
pub enum HostApiError {
    Io(io::Error),
    Random(getrandom::Error),
    LaunchConfiguration(NativeLaunchError),
    InvalidAllowedOrigin,
    LauncherUrlHasFragment,
}

impl fmt::Display for HostApiError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "host status API I/O failed: {error}"),
            Self::Random(error) => {
                write!(
                    formatter,
                    "host status API token generation failed: {error}"
                )
            }
            Self::LaunchConfiguration(error) => {
                write!(formatter, "native launch configuration failed: {error}")
            }
            Self::InvalidAllowedOrigin => formatter.write_str(
                "host status API origin must be an exact loopback HTTP origin with an explicit port",
            ),
            Self::LauncherUrlHasFragment => {
                formatter.write_str("launcher URL must not already contain a fragment")
            }
        }
    }
}

impl std::error::Error for HostApiError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Random(error) => Some(error),
            Self::LaunchConfiguration(error) => Some(error),
            Self::InvalidAllowedOrigin | Self::LauncherUrlHasFragment => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{HOST_API_PROTOCOL_VERSION, HostStatusServer};
    use crate::installed_catalog::tests::signed_catalog;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    const ORIGIN: &str = "http://127.0.0.1:5173";

    fn request(server: &HostStatusServer, request: &str) -> String {
        let mut stream = TcpStream::connect(server.address()).expect("status server accepts");
        stream
            .write_all(request.as_bytes())
            .expect("request writes");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .expect("response reads");
        response
    }

    fn token_from(server: &HostStatusServer) -> String {
        let url = server
            .launcher_url("http://127.0.0.1:5173/")
            .expect("launcher URL builds");
        url.split("vcg-host-token=")
            .nth(1)
            .expect("token is present")
            .to_owned()
    }

    #[test]
    fn serves_authenticated_status_with_exact_origin_cors() {
        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        let token = token_from(&server);
        let response = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );

        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains(&format!("Access-Control-Allow-Origin: {ORIGIN}\r\n")));
        assert!(response.contains(&format!(
            "\"protocolVersion\":\"{HOST_API_PROTOCOL_VERSION}\""
        )));
        assert!(response.contains("\"process-supervision\""));
    }

    #[test]
    fn handles_the_browser_authorization_preflight() {
        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        let response = request(
            &server,
            &format!(
                "OPTIONS /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: GET\r\nAccess-Control-Request-Headers: authorization\r\n\r\n"
            ),
        );

        assert!(response.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(response.contains("Access-Control-Allow-Headers: Authorization, Content-Type\r\n"));
    }

    #[test]
    fn launch_preflight_allows_only_the_declared_method_path_and_headers() {
        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        let accepted = request(
            &server,
            &format!(
                "OPTIONS /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization, content-type\r\n\r\n"
            ),
        );
        let unknown_header = request(
            &server,
            &format!(
                "OPTIONS /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization, content-type, x-command\r\n\r\n"
            ),
        );
        let wrong_target = request(
            &server,
            &format!(
                "OPTIONS /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization, content-type\r\n\r\n"
            ),
        );

        assert!(accepted.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(unknown_header.starts_with("HTTP/1.1 403 Forbidden\r\n"));
        assert!(wrong_target.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    }

    #[test]
    fn rejects_wrong_tokens_and_origins_without_leaking_status() {
        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        let wrong_token = "0".repeat(64);
        let unauthorized = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {wrong_token}\r\n\r\n"
            ),
        );
        let wrong_origin = request(
            &server,
            "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://example.com\r\nAuthorization: Bearer ignored\r\n\r\n",
        );
        let missing_origin = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {wrong_token}\r\n\r\n"
            ),
        );

        assert!(unauthorized.starts_with("HTTP/1.1 401 Unauthorized\r\n"));
        assert!(!unauthorized.contains("protocolVersion"));
        assert!(wrong_origin.starts_with("HTTP/1.1 403 Forbidden\r\n"));
        assert!(!wrong_origin.contains("protocolVersion"));
        assert!(missing_origin.starts_with("HTTP/1.1 403 Forbidden\r\n"));
        assert!(!missing_origin.contains("protocolVersion"));
    }

    #[test]
    fn rejects_unsafe_origins_and_ambiguous_security_headers() {
        assert!(HostStatusServer::start("http://example.com:5173").is_err());
        assert!(HostStatusServer::start("http://127.0.0.1:5173/").is_err());

        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        let token = token_from(&server);
        let duplicate_origin = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        let duplicate_authorization = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );

        assert!(duplicate_origin.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(duplicate_authorization.starts_with("HTTP/1.1 400 Bad Request\r\n"));
    }

    #[test]
    fn rejects_ambiguous_framing_bodies_on_read_methods_and_invalid_targets() {
        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        let token = token_from(&server);
        let duplicate_length = request(
            &server,
            &format!(
                "POST /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{{}}"
            ),
        );
        let transfer_encoding = request(
            &server,
            &format!(
                "POST /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"
            ),
        );
        let get_body = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Length: 2\r\n\r\n{{}}"
            ),
        );
        let absolute_target = request(
            &server,
            &format!(
                "GET http://127.0.0.1/v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );

        for response in [
            duplicate_length,
            transfer_encoding,
            get_body,
            absolute_target,
        ] {
            assert!(response.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        }
    }

    #[test]
    fn tokens_are_per_launch_and_never_placed_in_the_query() {
        let first = HostStatusServer::start(ORIGIN).expect("first server starts");
        let second = HostStatusServer::start(ORIGIN).expect("second server starts");
        let first_url = first
            .launcher_url("http://127.0.0.1:5173/?skipBoot=1")
            .expect("first URL builds");
        assert_ne!(token_from(&first), token_from(&second));
        assert!(first_url.contains("?skipBoot=1#vcg-host-port="));
        assert_eq!(first_url.matches("vcg-host-token=").count(), 1);
        assert!(
            first
                .launcher_url("http://127.0.0.1:5173/#existing")
                .is_err()
        );
    }

    #[test]
    fn discloses_only_signed_package_metadata_by_game_id() {
        let (_fixture, catalog) = signed_catalog();
        let server =
            HostStatusServer::start_with_catalog(ORIGIN, catalog).expect("catalog server starts");
        let token = token_from(&server);
        let status = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        let installed = request(
            &server,
            &format!(
                "GET /v1/packages/retro-2048 HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        let missing = request(
            &server,
            &format!(
                "GET /v1/packages/not-installed HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        let invalid = request(
            &server,
            &format!(
                "GET /v1/packages/../escape HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );

        assert!(status.contains("\"trusted-package-catalog\""));
        assert!(installed.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(installed.contains("\"id\":\"retro-2048\""));
        assert!(installed.contains("\"runtime\":\"libretro\""));
        assert!(!installed.contains("frontend"));
        assert!(!installed.contains("sha256"));
        assert!(missing.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(missing.contains("PACKAGE_NOT_INSTALLED"));
        assert!(invalid.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(invalid.contains("PACKAGE_ID_INVALID"));
    }

    #[test]
    fn accepts_only_bounded_idempotent_host_owned_launch_intent() {
        let (_fixture, catalog) = signed_catalog();
        let server = HostStatusServer::start_with_launch_service(
            ORIGIN,
            catalog,
            vec!["local-player".to_owned()],
        )
        .expect("launch server starts");
        let token = token_from(&server);
        let status = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        assert!(status.contains("\"trusted-package-launch\""));

        let body = r#"{"protocolVersion":"0.1.0","requestId":"11111111111111111111111111111111","gameId":"retro-2048","profileId":"local-player"}"#;
        let launch_request = format!(
            "POST /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        let first = request(&server, &launch_request);
        let replay = request(&server, &launch_request);
        let lifecycle = request(
            &server,
            &format!(
                "GET /v1/launches/11111111111111111111111111111111 HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );

        assert!(first.starts_with("HTTP/1.1 422 Unprocessable Content\r\n"));
        assert!(first.contains("\"state\":\"failed\""));
        assert!(first.contains("\"detailCode\":\"PROCESS_START_FAILED\""));
        assert!(replay.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(replay.contains("\"replayed\":true"));
        assert!(lifecycle.starts_with("HTTP/1.1 200 OK\r\n"));
        for response in [&first, &replay, &lifecycle] {
            assert!(!response.contains("frontend"));
            assert!(!response.contains("sha256"));
            assert!(!response.contains("program"));
            assert!(!response.contains("command"));
            assert!(!response.contains("processId"));
        }

        let incompatible_body = r#"{"protocolVersion":"9.0.0","requestId":"22222222222222222222222222222222","gameId":"retro-2048","profileId":"local-player"}"#;
        let incompatible = request(
            &server,
            &format!(
                "POST /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{incompatible_body}",
                incompatible_body.len()
            ),
        );
        assert!(incompatible.starts_with("HTTP/1.1 409 Conflict\r\n"));
        assert!(incompatible.contains("HOST_PROTOCOL_MISMATCH"));

        let unknown_field = r#"{"protocolVersion":"0.1.0","requestId":"33333333333333333333333333333333","gameId":"retro-2048","profileId":"local-player","path":"C:\\escape"}"#;
        let rejected = request(
            &server,
            &format!(
                "POST /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{unknown_field}",
                unknown_field.len()
            ),
        );
        assert!(rejected.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(rejected.contains("LAUNCH_REQUEST_INVALID"));
    }
}
