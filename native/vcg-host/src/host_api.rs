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

const MAX_REQUEST_BYTES: usize = 8_192;
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
        Self::start_internal(allowed_origin.into(), None)
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
        Self::start_internal(allowed_origin.into(), Some(Arc::new(catalog)))
    }

    fn start_internal(
        allowed_origin: String,
        catalog: Option<Arc<TrustedPackageCatalog>>,
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
        let worker = thread::Builder::new()
            .name("vcg-host-status".to_owned())
            .spawn(move || {
                serve(
                    &listener,
                    &worker_origin,
                    &worker_token,
                    catalog.as_deref(),
                    &worker_stop,
                );
            })
            .map_err(HostApiError::Io)?;

        Ok(Self {
            address,
            allowed_origin,
            token,
            stop,
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
    stop: &AtomicBool,
) {
    while !stop.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = handle_connection(&mut stream, allowed_origin, token, catalog);
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

    match request.method.as_str() {
        "OPTIONS" => {
            if request.origin.as_deref() != Some(allowed_origin)
                || request.preflight_method.as_deref() != Some("GET")
                || !request.preflight_headers.iter().any(|header| {
                    header
                        .split(',')
                        .any(|value| value.trim().eq_ignore_ascii_case("authorization"))
                })
            {
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
                return write_response(stream, 200, "OK", allowed_origin, &status_body(catalog));
            }
            if let Some(game_id) = request.path.strip_prefix("/v1/packages/") {
                return write_package_response(stream, allowed_origin, catalog, game_id);
            }
            write_response(stream, 404, "Not Found", allowed_origin, "")
        }
        _ => write_response(stream, 405, "Method Not Allowed", allowed_origin, ""),
    }
}

fn status_body(catalog: Option<&TrustedPackageCatalog>) -> String {
    let mut capabilities = vec![
        "launcher-shell",
        "process-supervision",
        "game-watchdog",
        "retroarch-plan",
    ];
    if catalog.is_some() {
        capabilities.push("trusted-package-catalog");
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
    preflight_method: Option<String>,
    preflight_headers: Vec<String>,
}

enum RequestReadError {
    Io(io::Error),
    Invalid,
    TooLarge,
}

fn read_request(stream: &mut TcpStream) -> Result<Request, RequestReadError> {
    let mut bytes = Vec::with_capacity(1_024);
    let mut buffer = [0_u8; 1_024];
    loop {
        let read = stream.read(&mut buffer).map_err(RequestReadError::Io)?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(RequestReadError::TooLarge);
        }
        if bytes.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }

    if !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
        return Err(RequestReadError::Invalid);
    }
    let text = str::from_utf8(&bytes).map_err(|_| RequestReadError::Invalid)?;
    parse_request(text).ok_or(RequestReadError::Invalid)
}

fn parse_request(text: &str) -> Option<Request> {
    let mut lines = text.split("\r\n");
    let mut request_line = lines.next()?.split_whitespace();
    let method = request_line.next()?;
    let path = request_line.next()?;
    if request_line.next()? != "HTTP/1.1" || request_line.next().is_some() {
        return None;
    }

    let mut request = Request {
        method: method.to_owned(),
        path: path.to_owned(),
        origin: None,
        authorization: None,
        preflight_method: None,
        preflight_headers: Vec::new(),
    };
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
        } else if name.eq_ignore_ascii_case("access-control-request-method") {
            if request.preflight_method.is_some() {
                return None;
            }
            request.preflight_method = Some(value.to_owned());
        } else if name.eq_ignore_ascii_case("access-control-request-headers") {
            request.preflight_headers.push(value.to_owned());
        }
    }
    Some(request)
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
            "Access-Control-Allow-Methods: GET, OPTIONS\r\n",
            "Access-Control-Allow-Headers: Authorization\r\n",
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
        assert!(response.contains("Access-Control-Allow-Headers: Authorization\r\n"));
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
}
