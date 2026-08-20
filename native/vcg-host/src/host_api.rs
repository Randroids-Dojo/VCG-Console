//! Authenticated loopback status API for the trusted launcher surface.

use std::fmt;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::str;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::bluetooth::{BluetoothError, BluetoothPairingService, BluetoothSnapshot};
use crate::installed_catalog::{CatalogError, TrustedPackageCatalog};
use crate::native_launch::{
    NativeLaunchError, NativeLaunchService, NativeLaunchSnapshot, NativeLaunchState,
};
use crate::process::WatchdogPolicy;
use crate::retro_import::{RetroLibraryEntry, RetroLibrarySnapshot};

const MAX_REQUEST_BYTES: usize = 8_192;
const MAX_LAUNCH_BODY_BYTES: usize = 1_024;
const MAX_LIBRARY_PAGE_ENTRIES: usize = 256;
const MAX_LIBRARY_PAGE_BYTES: usize = 65_536;
const LIBRARY_CURSOR_BYTES: usize = 16;
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
    _bluetooth_service: Option<Arc<BluetoothPairingService>>,
    worker: Option<JoinHandle<()>>,
}

/// The host-owned launch policy for one launcher process: which profiles may
/// launch, which installed games the watchdog supervises, and where durable
/// replay state is kept.
pub struct HostLaunchPolicy {
    profile_ids: Vec<String>,
    watchdog_game_ids: Vec<String>,
    watchdog_policy: WatchdogPolicy,
    journal_root: Option<PathBuf>,
}

impl HostLaunchPolicy {
    /// Launches installed packages for an explicit host-owned profile
    /// allowlist, with no watchdog games and in-memory replay only.
    #[must_use]
    pub fn new(profile_ids: impl IntoIterator<Item = String>) -> Self {
        Self {
            profile_ids: profile_ids.into_iter().collect(),
            watchdog_game_ids: Vec::new(),
            watchdog_policy: WatchdogPolicy::local_game_defaults(),
            journal_root: None,
        }
    }

    /// Supervises the named installed games with heartbeat watchdog policy.
    #[must_use]
    pub fn with_watchdog_games(
        mut self,
        watchdog_game_ids: impl IntoIterator<Item = String>,
        watchdog_policy: WatchdogPolicy,
    ) -> Self {
        self.watchdog_game_ids = watchdog_game_ids.into_iter().collect();
        self.watchdog_policy = watchdog_policy;
        self
    }

    /// Keeps launch replay state in a host-owned durable journal.
    #[must_use]
    pub fn with_replay_journal(mut self, journal_root: &Path) -> Self {
        self.journal_root = Some(journal_root.to_path_buf());
        self
    }
}

/// The signature-verified installed catalog, and the launch policy when this
/// process also launches from it.
struct CatalogCapability {
    catalog: TrustedPackageCatalog,
    launch: Option<HostLaunchPolicy>,
}

/// Every optional capability one launcher process serves. The status endpoint
/// requires none of them; each one configured here is served and advertised,
/// and the combination is free.
#[derive(Default)]
pub struct HostCapabilities {
    catalog: Option<CatalogCapability>,
    bluetooth_service: Option<BluetoothPairingService>,
    library: Option<RetroLibrarySnapshot>,
}

impl HostCapabilities {
    /// Discloses a signature-verified installed catalog, read-only.
    #[must_use]
    pub fn with_catalog(catalog: TrustedPackageCatalog) -> Self {
        Self {
            catalog: Some(CatalogCapability {
                catalog,
                launch: None,
            }),
            bluetooth_service: None,
            library: None,
        }
    }

    /// Discloses the catalog and launches from it under one host-owned launch
    /// policy.
    #[must_use]
    pub fn with_launch_service(catalog: TrustedPackageCatalog, launch: HostLaunchPolicy) -> Self {
        Self {
            catalog: Some(CatalogCapability {
                catalog,
                launch: Some(launch),
            }),
            bluetooth_service: None,
            library: None,
        }
    }

    /// Adds privacy-preserving Bluetooth controller pairing.
    #[must_use]
    pub fn and_bluetooth(mut self, bluetooth_service: BluetoothPairingService) -> Self {
        self.bluetooth_service = Some(bluetooth_service);
        self
    }

    /// Adds the read-only installed retro library. A package whose signed
    /// catalog record accepts library content can then be launched with one
    /// library entry the host itself published.
    #[must_use]
    pub fn and_library(mut self, library: RetroLibrarySnapshot) -> Self {
        self.library = Some(library);
        self
    }
}

impl HostStatusServer {
    /// Starts the status API serving exactly the capabilities configured.
    ///
    /// # Errors
    ///
    /// Returns an error when launch/watchdog configuration or replay state is
    /// invalid, the journal is already locked, or the listener,
    /// operating-system random source, or worker thread cannot be created.
    pub fn start_with_capabilities(
        allowed_origin: impl Into<String>,
        capabilities: HostCapabilities,
    ) -> Result<Self, HostApiError> {
        let HostCapabilities {
            catalog,
            bluetooth_service,
            library,
        } = capabilities;
        let library = library.map(Arc::new);
        let mut catalog_service = None;
        let mut launch_service = None;
        if let Some(configured) = catalog {
            let catalog = Arc::new(configured.catalog);
            launch_service = configured
                .launch
                .map(|launch| {
                    NativeLaunchService::with_optional_replay(
                        Arc::clone(&catalog),
                        launch.profile_ids,
                        launch.watchdog_game_ids,
                        launch.watchdog_policy,
                        launch.journal_root.as_deref(),
                        library.clone(),
                    )
                    .map(Arc::new)
                    .map_err(HostApiError::LaunchConfiguration)
                })
                .transpose()?;
            catalog_service = Some(catalog);
        }
        Self::start_internal(
            allowed_origin.into(),
            catalog_service,
            launch_service,
            bluetooth_service.map(Arc::new),
            library,
        )
    }

    /// Starts the status API for one launcher process.
    ///
    /// # Errors
    ///
    /// Returns an error when the listener, operating-system random source, or
    /// worker thread cannot be created.
    pub fn start(allowed_origin: impl Into<String>) -> Result<Self, HostApiError> {
        Self::start_with_capabilities(allowed_origin, HostCapabilities::default())
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
        Self::start_with_capabilities(allowed_origin, HostCapabilities::with_catalog(catalog))
    }

    /// Starts the API with privacy-preserving Bluetooth controller pairing.
    ///
    /// # Errors
    ///
    /// Returns an error when the listener, operating-system random source, or
    /// worker thread cannot be created.
    pub fn start_with_bluetooth(
        allowed_origin: impl Into<String>,
        bluetooth_service: BluetoothPairingService,
    ) -> Result<Self, HostApiError> {
        Self::start_with_capabilities(
            allowed_origin,
            HostCapabilities::default().and_bluetooth(bluetooth_service),
        )
    }

    /// Starts the catalog API with a read-only installed retro library.
    ///
    /// # Errors
    ///
    /// Returns an error when the listener, operating-system random source, or
    /// worker thread cannot be created.
    pub fn start_with_catalog_and_library(
        allowed_origin: impl Into<String>,
        catalog: TrustedPackageCatalog,
        library: RetroLibrarySnapshot,
    ) -> Result<Self, HostApiError> {
        Self::start_with_capabilities(
            allowed_origin,
            HostCapabilities::with_catalog(catalog).and_library(library),
        )
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
        Self::start_with_capabilities(
            allowed_origin,
            HostCapabilities::with_launch_service(catalog, HostLaunchPolicy::new(profile_ids)),
        )
    }

    /// Starts the launch API with a read-only installed retro library.
    ///
    /// A package whose signed catalog record accepts library content can then
    /// be launched with one library entry the host itself published.
    ///
    /// # Errors
    ///
    /// Returns an error when launch configuration, the listener,
    /// operating-system randomness, or worker creation fails.
    pub fn start_with_library_launch_service(
        allowed_origin: impl Into<String>,
        catalog: TrustedPackageCatalog,
        profile_ids: impl IntoIterator<Item = String>,
        library: RetroLibrarySnapshot,
    ) -> Result<Self, HostApiError> {
        Self::start_with_capabilities(
            allowed_origin,
            HostCapabilities::with_launch_service(catalog, HostLaunchPolicy::new(profile_ids))
                .and_library(library),
        )
    }

    fn start_internal(
        allowed_origin: String,
        catalog: Option<Arc<TrustedPackageCatalog>>,
        launch_service: Option<Arc<NativeLaunchService>>,
        bluetooth_service: Option<Arc<BluetoothPairingService>>,
        library: Option<Arc<RetroLibrarySnapshot>>,
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
        let worker_bluetooth_service = bluetooth_service.clone();
        let worker_library = library.map(HostLibrary::new).transpose()?;
        let worker = thread::Builder::new()
            .name("vcg-host-status".to_owned())
            .spawn(move || {
                serve(
                    &listener,
                    &worker_origin,
                    &worker_token,
                    &HostServices {
                        catalog: catalog.as_deref(),
                        launch_service: worker_launch_service.as_deref(),
                        bluetooth_service: worker_bluetooth_service.as_deref(),
                        library: worker_library.as_ref(),
                    },
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
            _bluetooth_service: bluetooth_service,
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
    Ok(encode_hex(&bytes))
}

fn encode_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use fmt::Write as _;
        write!(output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    output
}

/// Every optional host capability one launcher process exposes.
struct HostServices<'a> {
    catalog: Option<&'a TrustedPackageCatalog>,
    launch_service: Option<&'a NativeLaunchService>,
    bluetooth_service: Option<&'a BluetoothPairingService>,
    library: Option<&'a HostLibrary>,
}

fn serve(
    listener: &TcpListener,
    allowed_origin: &str,
    token: &str,
    services: &HostServices<'_>,
    stop: &AtomicBool,
) {
    while !stop.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = handle_connection(&mut stream, allowed_origin, token, services);
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
    services: &HostServices<'_>,
) -> io::Result<()> {
    let HostServices {
        launch_service,
        bluetooth_service,
        ..
    } = *services;
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
            if !authorized(&request, token) {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            handle_read(stream, allowed_origin, services, &request.path)
        }
        "POST" if request.path == "/v1/launches" => {
            if !authorized(&request, token) {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            write_launch_response(stream, allowed_origin, launch_service, &request)
        }
        "POST"
            if request.path == "/v1/bluetooth/scan"
                || bluetooth_device_path(&request.path, "/pair").is_some() =>
        {
            if !authorized(&request, token) {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            write_bluetooth_post_response(stream, allowed_origin, bluetooth_service, &request)
        }
        "DELETE" => {
            if !authorized(&request, token) {
                return write_response(stream, 401, "Unauthorized", allowed_origin, "");
            }
            if let Some(request_id) = request.path.strip_prefix("/v1/launches/") {
                return write_cancel_response(stream, allowed_origin, launch_service, request_id);
            }
            if let Some(id) = bluetooth_device_path(&request.path, "") {
                return write_bluetooth_forget_response(
                    stream,
                    allowed_origin,
                    bluetooth_service,
                    id,
                );
            }
            write_response(stream, 404, "Not Found", allowed_origin, "")
        }
        _ => write_response(stream, 405, "Method Not Allowed", allowed_origin, ""),
    }
}

fn handle_read(
    stream: &mut TcpStream,
    allowed_origin: &str,
    services: &HostServices<'_>,
    path: &str,
) -> io::Result<()> {
    let HostServices {
        catalog,
        launch_service,
        bluetooth_service,
        library,
    } = *services;
    if path == "/v1/status" {
        return write_response(stream, 200, "OK", allowed_origin, &status_body(services));
    }
    if path == "/v1/library" {
        return write_library_response(stream, allowed_origin, library, None);
    }
    if let Some(cursor) = path.strip_prefix("/v1/library/") {
        return write_library_response(stream, allowed_origin, library, Some(cursor));
    }
    if path == "/v1/bluetooth" {
        return write_bluetooth_snapshot_response(stream, allowed_origin, bluetooth_service);
    }
    if path == "/v1/packages" {
        return write_package_inventory_response(stream, allowed_origin, catalog);
    }
    if let Some(game_id) = path.strip_prefix("/v1/packages/") {
        return write_package_response(stream, allowed_origin, catalog, game_id);
    }
    if let Some(request_id) = path.strip_prefix("/v1/launches/") {
        return write_launch_status_response(stream, allowed_origin, launch_service, request_id);
    }
    write_response(stream, 404, "Not Found", allowed_origin, "")
}

fn authorized(request: &Request, token: &str) -> bool {
    request
        .authorization
        .as_deref()
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|value| constant_time_equal(value.as_bytes(), token.as_bytes()))
}

fn valid_preflight(request: &Request) -> bool {
    let Some(method) = request.preflight_method.as_deref() else {
        return false;
    };
    let valid_target = match method {
        "GET" => {
            request.path == "/v1/status"
                || request.path == "/v1/packages"
                || request.path.starts_with("/v1/packages/")
                || request.path.starts_with("/v1/launches/")
                || request.path == "/v1/library"
                || request.path.starts_with("/v1/library/")
                || request.path == "/v1/bluetooth"
        }
        "POST" => {
            request.path == "/v1/launches"
                || request.path == "/v1/bluetooth/scan"
                || bluetooth_device_path(&request.path, "/pair").is_some()
        }
        "DELETE" => {
            request.path.starts_with("/v1/launches/")
                || bluetooth_device_path(&request.path, "").is_some()
        }
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

fn status_body(services: &HostServices<'_>) -> String {
    let mut capabilities = vec![
        "launcher-shell",
        "process-supervision",
        "game-watchdog",
        "retroarch-plan",
    ];
    if services.catalog.is_some() {
        capabilities.push("trusted-package-catalog");
    }
    if services.launch_service.is_some() {
        capabilities.push("trusted-package-launch");
    }
    if services.library.is_some() {
        capabilities.push("retro-library");
    }
    if services.bluetooth_service.is_some() {
        capabilities.push("bluetooth-controller-pairing");
    }
    serde_json::json!({
        "protocolVersion": HOST_API_PROTOCOL_VERSION,
        "hostVersion": env!("CARGO_PKG_VERSION"),
        "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
        "capabilities": capabilities,
    })
    .to_string()
}

/// One bounded page of the installed retro library.
///
/// The cursor is a per-launch random token, not an offset: it names a page of
/// this exact snapshot and cannot be constructed, decoded, or reused by the
/// browser. The first page has none.
struct LibraryPage {
    cursor: Option<String>,
    start: usize,
    end: usize,
}

/// The installed retro library this launcher process discloses, already split
/// into pages that satisfy both the entry-count and response-byte bounds.
struct HostLibrary {
    snapshot: Arc<RetroLibrarySnapshot>,
    pages: Vec<LibraryPage>,
}

impl HostLibrary {
    fn new(snapshot: Arc<RetroLibrarySnapshot>) -> Result<Self, HostApiError> {
        let entries = snapshot.entries();
        let mut boundaries = Vec::new();
        let mut start = 0;
        while start < entries.len() {
            let mut end = start;
            // The two brackets of the serialized entries array, so this
            // accumulator is exactly the length the response will write.
            let mut bytes = 2;
            while end < entries.len() && end - start < MAX_LIBRARY_PAGE_ENTRIES {
                let entry_bytes =
                    library_entry_bytes(&entries[end]).saturating_add(usize::from(end > start));
                if end > start && bytes + entry_bytes > MAX_LIBRARY_PAGE_BYTES {
                    break;
                }
                bytes += entry_bytes;
                end += 1;
            }
            boundaries.push((start, end));
            start = end;
        }
        if boundaries.is_empty() {
            boundaries.push((0, 0));
        }
        let mut cursor_bytes =
            vec![0_u8; boundaries.len().saturating_sub(1) * LIBRARY_CURSOR_BYTES];
        getrandom::fill(&mut cursor_bytes).map_err(HostApiError::Random)?;
        let pages = boundaries
            .into_iter()
            .enumerate()
            .map(|(index, (start, end))| LibraryPage {
                cursor: index.checked_sub(1).map(|prior| {
                    encode_hex(
                        &cursor_bytes[prior * LIBRARY_CURSOR_BYTES..][..LIBRARY_CURSOR_BYTES],
                    )
                }),
                start,
                end,
            })
            .collect();
        Ok(Self { snapshot, pages })
    }

    fn page(&self, cursor: Option<&str>) -> Option<&LibraryPage> {
        match cursor {
            None => self.pages.first(),
            Some(cursor) => self
                .pages
                .iter()
                .find(|page| page.cursor.as_deref() == Some(cursor)),
        }
    }

    fn next_cursor(&self, page: &LibraryPage) -> Option<&str> {
        self.pages
            .iter()
            .find(|candidate| candidate.start == page.end && candidate.end > page.end)
            .and_then(|candidate| candidate.cursor.as_deref())
    }
}

fn library_entry_document(entry: &RetroLibraryEntry) -> serde_json::Value {
    serde_json::json!({
        "entryId": entry.entry_id(),
        "title": entry.title(),
        "systemId": entry.system_id(),
        "coreId": entry.core_id(),
        "sizeBytes": entry.size_bytes(),
    })
}

fn library_entry_bytes(entry: &RetroLibraryEntry) -> usize {
    // Measuring the exact document the response writes is what makes the page
    // byte bound real rather than an estimate.
    serde_json::to_string(&library_entry_document(entry))
        .map_or(MAX_LIBRARY_PAGE_BYTES, |text| text.len())
}

fn write_library_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    library: Option<&HostLibrary>,
    cursor: Option<&str>,
) -> io::Result<()> {
    let Some(library) = library else {
        return write_json_error(
            stream,
            404,
            "Not Found",
            allowed_origin,
            "LIBRARY_UNAVAILABLE",
        );
    };
    let Some(page) = library.page(cursor) else {
        return write_json_error(
            stream,
            400,
            "Bad Request",
            allowed_origin,
            "LIBRARY_CURSOR_INVALID",
        );
    };
    let entries = library.snapshot.entries()[page.start..page.end]
        .iter()
        .map(library_entry_document)
        .collect::<Vec<_>>();
    let mut body = serde_json::json!({
        "protocolVersion": HOST_API_PROTOCOL_VERSION,
        "libraryGeneration": library.snapshot.generation(),
        "entryCount": library.snapshot.entries().len(),
        "entries": entries,
    });
    if let Some(next) = library.next_cursor(page) {
        body["nextCursor"] = serde_json::Value::String(next.to_owned());
    }
    write_response(stream, 200, "OK", allowed_origin, &body.to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BluetoothRequestDocument {
    protocol_version: String,
}

fn bluetooth_device_path<'a>(path: &'a str, suffix: &str) -> Option<&'a str> {
    let value = path.strip_prefix("/v1/bluetooth/devices/")?;
    let id = value.strip_suffix(suffix)?;
    if id.is_empty() || id.contains('/') {
        return None;
    }
    Some(id)
}

fn write_bluetooth_snapshot_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    bluetooth_service: Option<&BluetoothPairingService>,
) -> io::Result<()> {
    let Some(service) = bluetooth_service else {
        return write_json_error(
            stream,
            404,
            "Not Found",
            allowed_origin,
            "BLUETOOTH_SERVICE_UNAVAILABLE",
        );
    };
    write_bluetooth_result(
        stream,
        allowed_origin,
        service.snapshot(HOST_API_PROTOCOL_VERSION),
    )
}

fn write_bluetooth_post_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    bluetooth_service: Option<&BluetoothPairingService>,
    request: &Request,
) -> io::Result<()> {
    let Some(service) = bluetooth_service else {
        return write_json_error(
            stream,
            404,
            "Not Found",
            allowed_origin,
            "BLUETOOTH_SERVICE_UNAVAILABLE",
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
    let document: BluetoothRequestDocument = match serde_json::from_slice(&request.body) {
        Ok(document) => document,
        Err(_) => {
            return write_json_error(
                stream,
                400,
                "Bad Request",
                allowed_origin,
                "BLUETOOTH_REQUEST_INVALID",
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
    let result = if request.path == "/v1/bluetooth/scan" {
        service.scan(HOST_API_PROTOCOL_VERSION)
    } else if let Some(id) = bluetooth_device_path(&request.path, "/pair") {
        service.pair(id, HOST_API_PROTOCOL_VERSION)
    } else {
        return write_response(stream, 404, "Not Found", allowed_origin, "");
    };
    write_bluetooth_result(stream, allowed_origin, result)
}

fn write_bluetooth_forget_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    bluetooth_service: Option<&BluetoothPairingService>,
    id: &str,
) -> io::Result<()> {
    let Some(service) = bluetooth_service else {
        return write_json_error(
            stream,
            404,
            "Not Found",
            allowed_origin,
            "BLUETOOTH_SERVICE_UNAVAILABLE",
        );
    };
    write_bluetooth_result(
        stream,
        allowed_origin,
        service.forget(id, HOST_API_PROTOCOL_VERSION),
    )
}

fn write_bluetooth_result(
    stream: &mut TcpStream,
    allowed_origin: &str,
    result: Result<BluetoothSnapshot, BluetoothError>,
) -> io::Result<()> {
    match result {
        Ok(snapshot) => match serde_json::to_string(&snapshot) {
            Ok(body) => write_response(stream, 200, "OK", allowed_origin, &body),
            Err(_) => write_json_error(
                stream,
                503,
                "Service Unavailable",
                allowed_origin,
                "BLUETOOTH_SERVICE_FAILED",
            ),
        },
        Err(error) => {
            let status = if matches!(error, BluetoothError::DeviceUnavailable) {
                404
            } else {
                503
            };
            write_json_error(
                stream,
                status,
                if status == 404 {
                    "Not Found"
                } else {
                    "Service Unavailable"
                },
                allowed_origin,
                error.code(),
            )
        }
    }
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

fn write_package_inventory_response(
    stream: &mut TcpStream,
    allowed_origin: &str,
    catalog: Option<&TrustedPackageCatalog>,
) -> io::Result<()> {
    let Some(catalog) = catalog else {
        return write_response(
            stream,
            404,
            "Not Found",
            allowed_origin,
            r#"{"code":"PACKAGE_CATALOG_NOT_CONFIGURED"}"#,
        );
    };
    let packages = catalog
        .package_summaries()
        .into_iter()
        .map(|package| {
            serde_json::json!({
                "id": package.id,
                "version": package.version,
                "runtime": package.runtime,
            })
        })
        .collect::<Vec<_>>();
    let body = serde_json::json!({
        "protocolVersion": HOST_API_PROTOCOL_VERSION,
        "catalogGeneration": catalog.generation(),
        "packages": packages,
    })
    .to_string();
    write_response(stream, 200, "OK", allowed_origin, &body)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LaunchRequestDocument {
    protocol_version: String,
    request_id: String,
    game_id: String,
    profile_id: String,
    /// One installed library entry the host itself published.
    ///
    /// Absent for every package that binds fixed content, which is every
    /// package this field predates.
    #[serde(default)]
    entry_id: Option<String>,
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
    match launch_service.start_with_library_entry(
        &document.request_id,
        &document.game_id,
        &document.profile_id,
        document.entry_id.as_deref(),
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
        | NativeLaunchError::InvalidProfile(_)
        | NativeLaunchError::InvalidLibraryEntry(_) => {
            (400, "Bad Request", "LAUNCH_REQUEST_INVALID")
        }
        NativeLaunchError::LibraryUnavailable => (404, "Not Found", "LIBRARY_UNAVAILABLE"),
        NativeLaunchError::LibraryEntryNotFound(_) => (404, "Not Found", "LIBRARY_ENTRY_NOT_FOUND"),
        NativeLaunchError::LibraryEntryIncompatible(_) => {
            (409, "Conflict", "LIBRARY_ENTRY_INCOMPATIBLE")
        }
        NativeLaunchError::LibraryContentRejected(_) => {
            (409, "Conflict", "PACKAGE_REJECTS_LIBRARY_CONTENT")
        }
        NativeLaunchError::ProfileNotFound(_) => (404, "Not Found", "PROFILE_NOT_AVAILABLE"),
        NativeLaunchError::RequestNotFound(_) => (404, "Not Found", "LAUNCH_NOT_FOUND"),
        NativeLaunchError::Catalog(CatalogError::PackageNotFound(_)) => {
            (404, "Not Found", "PACKAGE_NOT_INSTALLED")
        }
        NativeLaunchError::RequestConflict(_) => (409, "Conflict", "REQUEST_ID_CONFLICT"),
        NativeLaunchError::AlreadyRunning(_) => (409, "Conflict", "GAME_ALREADY_RUNNING"),
        NativeLaunchError::Replay(_)
        | NativeLaunchError::ReplayUnavailable
        | NativeLaunchError::RestartCleanupProofMismatch => {
            (503, "Service Unavailable", "LAUNCH_REPLAY_UNAVAILABLE")
        }
        NativeLaunchError::RestartCleanupRequired => (
            503,
            "Service Unavailable",
            "LAUNCH_RESTART_CLEANUP_REQUIRED",
        ),
        NativeLaunchError::PowerTransitionActive => {
            (503, "Service Unavailable", "LAUNCH_POWER_TRANSITION_ACTIVE")
        }
        NativeLaunchError::Catalog(_) | NativeLaunchError::Package(_) => {
            (409, "Conflict", "PACKAGE_VERIFICATION_FAILED")
        }
        NativeLaunchError::NoProfiles
        | NativeLaunchError::DuplicateProfile(_)
        | NativeLaunchError::InvalidWatchdogGame(_)
        | NativeLaunchError::DuplicateWatchdogGame(_)
        | NativeLaunchError::WatchdogGameNotInstalled(_)
        | NativeLaunchError::WatchdogConfiguration(_)
        | NativeLaunchError::WatchdogRestartLimit(_)
        | NativeLaunchError::RecordLimit
        | NativeLaunchError::PowerAdmissionProofMismatch
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
    use super::{
        HOST_API_PROTOCOL_VERSION, HostCapabilities, HostLaunchPolicy, HostStatusServer,
        MAX_LIBRARY_PAGE_BYTES, MAX_LIBRARY_PAGE_ENTRIES,
    };
    use crate::bluetooth::BluetoothPairingService;
    use crate::installed_catalog::tests::{signed_catalog, signed_library_catalog};
    use crate::process::WatchdogPolicy;
    use crate::retro_import::{
        RETRO_CONTENT_OBJECTS_DIRECTORY, RETRO_LIBRARY_DIRECTORY, RetroImportStore,
        RetroImportStoreConfig, RetroLibrarySnapshot,
    };
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    const ORIGIN: &str = "http://127.0.0.1:5173";
    const LIBRARY_RESERVE_BYTES: u64 = 1_048_576;
    static LIBRARY_FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    /// One provisioned retro store holding exactly the named entries.
    struct LibraryFixture {
        root: PathBuf,
        staging_root: PathBuf,
        content_root: PathBuf,
    }

    impl LibraryFixture {
        /// Each entry is `(system id, core id, title, content bytes)`.
        fn new(entries: &[(&str, &str, String, Vec<u8>)]) -> Self {
            let sequence = LIBRARY_FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "vcg-host-api-library-{}-{unique}-{sequence}",
                std::process::id()
            ));
            let fixture = Self {
                staging_root: root.join("staging"),
                content_root: root.join("retro"),
                root,
            };
            RetroImportStore::provision_roots(&fixture.config()).expect("retro roots provision");
            let objects = fixture.content_root.join(RETRO_CONTENT_OBJECTS_DIRECTORY);
            let documents = entries
                .iter()
                .map(|(system_id, core_id, title, bytes)| {
                    let sha256 = digest(bytes);
                    fs::write(
                        objects.join(format!("{system_id}-content-{sha256}.nes")),
                        bytes,
                    )
                    .expect("library object writes");
                    serde_json::json!({
                        "entryId": format!("content-{sha256}"),
                        "systemId": system_id,
                        "sha256": sha256,
                        "sizeBytes": bytes.len(),
                        "extension": ".nes",
                        "title": title,
                        "coreId": core_id,
                        "controllerProfile": "retro-standard",
                        "provenance": { "transport": "operator-provisioned" },
                    })
                })
                .collect::<Vec<_>>();
            fs::write(
                fixture
                    .content_root
                    .join(RETRO_LIBRARY_DIRECTORY)
                    .join("generation-00000000000000000002.json"),
                serde_json::to_vec(&serde_json::json!({
                    "schemaVersion": 1,
                    "generation": 2,
                    "entries": documents,
                }))
                .expect("library generation serializes"),
            )
            .expect("library generation writes");
            fixture
        }

        fn config(&self) -> RetroImportStoreConfig {
            RetroImportStoreConfig {
                staging_root: self.staging_root.clone(),
                content_root: self.content_root.clone(),
                reserve_bytes: LIBRARY_RESERVE_BYTES,
            }
        }

        fn snapshot(&self) -> RetroLibrarySnapshot {
            RetroImportStore::open(&self.config())
                .expect("retro import store opens")
                .library_snapshot()
                .expect("library snapshot reads")
        }

        fn object(&self, system_id: &str, bytes: &[u8]) -> PathBuf {
            self.content_root
                .join(RETRO_CONTENT_OBJECTS_DIRECTORY)
                .join(format!("{system_id}-content-{}.nes", digest(bytes)))
        }
    }

    impl Drop for LibraryFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn digest(bytes: &[u8]) -> String {
        let mut output = String::with_capacity(64);
        for byte in Sha256::digest(bytes) {
            use std::fmt::Write as _;
            write!(output, "{byte:02x}").expect("writing hex to a String cannot fail");
        }
        output
    }

    fn entry_id(bytes: &[u8]) -> String {
        format!("content-{}", digest(bytes))
    }

    fn library_entries(
        count: usize,
        title: &str,
    ) -> Vec<(&'static str, &'static str, String, Vec<u8>)> {
        (0..count)
            .map(|index| {
                (
                    "nes",
                    "mesen",
                    format!("{title}{index:04}"),
                    format!("library object {index}").into_bytes(),
                )
            })
            .collect()
    }

    fn library_page(server: &HostStatusServer, token: &str, cursor: Option<&str>) -> String {
        let path = cursor.map_or_else(
            || "/v1/library".to_owned(),
            |cursor| format!("/v1/library/{cursor}"),
        );
        request(
            server,
            &format!(
                "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        )
    }

    fn page_document(response: &str) -> serde_json::Value {
        let body = response
            .split_once("\r\n\r\n")
            .expect("response has a body")
            .1;
        serde_json::from_str(body).expect("library page is JSON")
    }

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

        let inventory = request(
            &server,
            &format!(
                "GET /v1/packages HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        assert!(inventory.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(inventory.contains("PACKAGE_CATALOG_NOT_CONFIGURED"));
        assert!(!inventory.contains("\"packages\""));
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
    fn advertises_only_configured_bluetooth_pairing_and_returns_stable_failures() {
        let missing = std::env::current_dir()
            .expect("current directory exists")
            .join("missing-bluetoothctl");
        let service = BluetoothPairingService::new(&missing).expect("absolute path is accepted");
        let server =
            HostStatusServer::start_with_bluetooth(ORIGIN, service).expect("Bluetooth host starts");
        let token = token_from(&server);
        let status = request(
            &server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        let snapshot = request(
            &server,
            &format!(
                "GET /v1/bluetooth HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        let invalid_body = r"{}";
        let invalid_scan = request(
            &server,
            &format!(
                "POST /v1/bluetooth/scan HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{invalid_body}",
                invalid_body.len()
            ),
        );
        let pair_body = format!(r#"{{"protocolVersion":"{HOST_API_PROTOCOL_VERSION}"}}"#);
        let unknown_pair = request(
            &server,
            &format!(
                "POST /v1/bluetooth/devices/controller-999/pair HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{pair_body}",
                pair_body.len()
            ),
        );
        let unknown_forget = request(
            &server,
            &format!(
                "DELETE /v1/bluetooth/devices/controller-999 HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );

        assert!(status.contains("\"bluetooth-controller-pairing\""));
        assert!(snapshot.starts_with("HTTP/1.1 503 Service Unavailable\r\n"));
        assert!(snapshot.contains("BLUETOOTH_SERVICE_UNAVAILABLE"));
        assert!(!snapshot.contains(&missing.to_string_lossy().to_string()));
        assert!(invalid_scan.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(invalid_scan.contains("BLUETOOTH_REQUEST_INVALID"));
        assert!(unknown_pair.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(unknown_pair.contains("BLUETOOTH_DEVICE_UNAVAILABLE"));
        assert!(unknown_forget.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(unknown_forget.contains("BLUETOOTH_DEVICE_UNAVAILABLE"));
    }

    #[test]
    fn bluetooth_preflight_allows_only_fixed_intent_routes() {
        let server = HostStatusServer::start(ORIGIN).expect("server starts");
        for (method, path) in [
            ("GET", "/v1/bluetooth"),
            ("POST", "/v1/bluetooth/scan"),
            ("POST", "/v1/bluetooth/devices/controller-1/pair"),
            ("DELETE", "/v1/bluetooth/devices/controller-1"),
        ] {
            let content_type = if method == "POST" {
                ", content-type"
            } else {
                ""
            };
            let response = request(
                &server,
                &format!(
                    "OPTIONS {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: {method}\r\nAccess-Control-Request-Headers: authorization{content_type}\r\n\r\n"
                ),
            );
            assert!(
                response.starts_with("HTTP/1.1 204 No Content\r\n"),
                "{method} {path}"
            );
        }
        let rejected = request(
            &server,
            &format!(
                "OPTIONS /v1/bluetooth/devices/controller-1/pair/extra HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization, content-type\r\n\r\n"
            ),
        );
        assert!(rejected.starts_with("HTTP/1.1 403 Forbidden\r\n"));
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
        let inventory = request(
            &server,
            &format!(
                "GET /v1/packages HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
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
        assert!(inventory.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(inventory.contains(&format!(
            "\"protocolVersion\":\"{HOST_API_PROTOCOL_VERSION}\""
        )));
        assert!(inventory.contains("\"catalogGeneration\":7"));
        assert!(inventory.contains(
            r#""packages":[{"id":"retro-2048","runtime":"libretro","version":"1.0.0"}]"#
        ));
        assert!(!inventory.contains("frontend"));
        assert!(!inventory.contains("sha256"));
        assert!(!inventory.contains("install"));
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

    #[test]
    fn library_pages_are_bounded_by_entry_count_and_disclose_no_paths() {
        let entries = library_entries(300, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_catalog();
        let server =
            HostStatusServer::start_with_catalog_and_library(ORIGIN, catalog, fixture.snapshot())
                .expect("library host starts");
        let token = token_from(&server);
        let status = library_status(&server, &token);
        assert!(status.contains("\"retro-library\""));

        let mut cursor = None;
        let mut seen = Vec::new();
        let mut pages = 0;
        loop {
            let response = library_page(&server, &token, cursor.as_deref());
            assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
            assert!(response.contains("Cache-Control: no-store\r\n"));
            for disclosure in [
                "sha256",
                "extension",
                "controllerProfile",
                "provenance",
                "objects",
                "generation-0000",
                &fixture.content_root.to_string_lossy(),
            ] {
                assert!(
                    !response.contains(disclosure),
                    "library page disclosed {disclosure}"
                );
            }
            let document = page_document(&response);
            assert_eq!(document["protocolVersion"], HOST_API_PROTOCOL_VERSION);
            assert_eq!(document["libraryGeneration"], 2);
            assert_eq!(document["entryCount"], 300);
            let page = document["entries"]
                .as_array()
                .expect("entries is an array")
                .clone();
            assert!(page.len() <= MAX_LIBRARY_PAGE_ENTRIES);
            assert!(
                serde_json::to_string(&document["entries"])
                    .expect("entries serialize")
                    .len()
                    <= MAX_LIBRARY_PAGE_BYTES
            );
            for entry in &page {
                let object = entry.as_object().expect("entry is an object");
                assert_eq!(
                    object.keys().map(String::as_str).collect::<Vec<_>>(),
                    ["coreId", "entryId", "sizeBytes", "systemId", "title"]
                );
                seen.push(
                    object["entryId"]
                        .as_str()
                        .expect("entry ID is text")
                        .to_owned(),
                );
            }
            pages += 1;
            match document.get("nextCursor") {
                Some(next) => {
                    cursor = Some(next.as_str().expect("cursor is text").to_owned());
                }
                None => break,
            }
        }

        assert_eq!(pages, 2);
        assert_eq!(seen.len(), 300);
        let mut unique = seen.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), 300);
        assert_eq!(
            seen.first(),
            Some(&entry_id(&entries[0].3)),
            "the first page must start at the first entry in browse order"
        );
    }

    #[test]
    fn library_pages_are_bounded_by_response_bytes() {
        let title = "\u{3042}".repeat(74);
        let entries = library_entries(200, &title);
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_catalog();
        let server =
            HostStatusServer::start_with_catalog_and_library(ORIGIN, catalog, fixture.snapshot())
                .expect("library host starts");
        let token = token_from(&server);

        let document = page_document(&library_page(&server, &token, None));
        let page = document["entries"].as_array().expect("entries is an array");
        assert!(
            page.len() < MAX_LIBRARY_PAGE_ENTRIES,
            "long titles must close a page before the entry-count bound"
        );
        assert!(
            serde_json::to_string(&document["entries"])
                .expect("entries serialize")
                .len()
                <= MAX_LIBRARY_PAGE_BYTES
        );
        assert!(document.get("nextCursor").is_some());
    }

    #[test]
    fn library_reads_require_configuration_authority_and_a_known_cursor() {
        let entries = library_entries(2, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_catalog();
        let (_absent_fixture, absent_catalog) = signed_catalog();
        let absent = HostStatusServer::start_with_catalog(ORIGIN, absent_catalog)
            .expect("catalog host starts");
        let absent_token = token_from(&absent);
        let unavailable = library_page(&absent, &absent_token, None);
        assert!(unavailable.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(unavailable.contains("LIBRARY_UNAVAILABLE"));
        assert!(!library_status(&absent, &absent_token).contains("\"retro-library\""));

        let server =
            HostStatusServer::start_with_catalog_and_library(ORIGIN, catalog, fixture.snapshot())
                .expect("library host starts");
        let token = token_from(&server);
        let unauthorized = library_page(&server, &"0".repeat(64), None);
        assert!(unauthorized.starts_with("HTTP/1.1 401 Unauthorized\r\n"));
        assert!(!unauthorized.contains("entries"));

        let unknown_cursor = library_page(&server, &token, Some(&"0".repeat(32)));
        assert!(unknown_cursor.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(unknown_cursor.contains("LIBRARY_CURSOR_INVALID"));

        let single_page = page_document(&library_page(&server, &token, None));
        assert_eq!(single_page["entryCount"], 2);
        assert!(single_page.get("nextCursor").is_none());

        let empty_fixture = LibraryFixture::new(&[]);
        let (_empty_catalog_fixture, empty_catalog) = signed_catalog();
        let empty_server = HostStatusServer::start_with_catalog_and_library(
            ORIGIN,
            empty_catalog,
            empty_fixture.snapshot(),
        )
        .expect("empty library host starts");
        let empty_token = token_from(&empty_server);
        let empty = page_document(&library_page(&empty_server, &empty_token, None));
        assert_eq!(empty["entryCount"], 0);
        assert_eq!(
            empty["entries"]
                .as_array()
                .expect("entries is an array")
                .len(),
            0
        );
        assert!(empty.get("nextCursor").is_none());

        for path in [
            "/v1/library",
            "/v1/library/00000000000000000000000000000000",
        ] {
            let preflight = request(
                &server,
                &format!(
                    "OPTIONS {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAccess-Control-Request-Method: GET\r\nAccess-Control-Request-Headers: authorization\r\n\r\n"
                ),
            );
            assert!(
                preflight.starts_with("HTTP/1.1 204 No Content\r\n"),
                "{path}"
            );
        }
    }

    #[test]
    fn library_launch_resolves_one_host_published_entry() {
        let entries = library_entries(2, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_library_catalog("nes", "mesen");
        let server = HostStatusServer::start_with_library_launch_service(
            ORIGIN,
            catalog,
            vec!["local-player".to_owned()],
            fixture.snapshot(),
        )
        .expect("library launch host starts");
        let token = token_from(&server);
        let selected = entry_id(&entries[0].3);

        let launched = launch(
            &server,
            &token,
            "11111111111111111111111111111111",
            &format!(",\"entryId\":\"{selected}\""),
        );
        assert!(launched.starts_with("HTTP/1.1 422 Unprocessable Content\r\n"));
        assert!(
            launched.contains("\"detailCode\":\"PROCESS_START_FAILED\""),
            "library content must resolve, verify, and plan before process start: {launched}"
        );
        for disclosure in ["sha256", "objects", &fixture.content_root.to_string_lossy()] {
            assert!(
                !launched.contains(disclosure),
                "launch disclosed {disclosure}"
            );
        }

        let replayed = launch(
            &server,
            &token,
            "11111111111111111111111111111111",
            &format!(",\"entryId\":\"{selected}\""),
        );
        assert!(replayed.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(replayed.contains("\"replayed\":true"));

        let other = entry_id(&entries[1].3);
        let conflict = launch(
            &server,
            &token,
            "11111111111111111111111111111111",
            &format!(",\"entryId\":\"{other}\""),
        );
        assert!(conflict.starts_with("HTTP/1.1 409 Conflict\r\n"));
        assert!(conflict.contains("REQUEST_ID_CONFLICT"));

        let without_entry = launch(&server, &token, "22222222222222222222222222222222", "");
        assert!(without_entry.starts_with("HTTP/1.1 422 Unprocessable Content\r\n"));
        assert!(
            without_entry.contains("\"detailCode\":\"PACKAGE_RESOLUTION_FAILED\""),
            "a library package must not start without an entry: {without_entry}"
        );

        fs::write(
            fixture.object("nes", &entries[0].3),
            b"changed library object",
        )
        .expect("library object tamper writes");
        let tampered = launch(
            &server,
            &token,
            "33333333333333333333333333333333",
            &format!(",\"entryId\":\"{selected}\""),
        );
        assert!(tampered.starts_with("HTTP/1.1 422 Unprocessable Content\r\n"));
        assert!(
            tampered.contains("\"detailCode\":\"PACKAGE_PLAN_FAILED\""),
            "library content must be re-verified immediately before launch: {tampered}"
        );
    }

    #[test]
    fn library_launch_rejects_entries_the_package_does_not_accept() {
        let entries = [
            ("nes", "mesen", "Accepted".to_owned(), b"accepted".to_vec()),
            (
                "gb",
                "mesen",
                "Other System".to_owned(),
                b"other system".to_vec(),
            ),
            (
                "nes",
                "snes9x",
                "Other Core".to_owned(),
                b"other core".to_vec(),
            ),
        ];
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_library_catalog("nes", "mesen");
        let server = HostStatusServer::start_with_library_launch_service(
            ORIGIN,
            catalog,
            vec!["local-player".to_owned()],
            fixture.snapshot(),
        )
        .expect("library launch host starts");
        let token = token_from(&server);

        for (index, bytes) in [&entries[1].3, &entries[2].3].into_iter().enumerate() {
            let response = launch(
                &server,
                &token,
                &("3".repeat(31) + &index.to_string()),
                &format!(",\"entryId\":\"{}\"", entry_id(bytes)),
            );
            assert!(
                response.starts_with("HTTP/1.1 409 Conflict\r\n"),
                "{response}"
            );
            assert!(response.contains("LIBRARY_ENTRY_INCOMPATIBLE"));
        }

        let unknown = launch(
            &server,
            &token,
            "44444444444444444444444444444444",
            &format!(",\"entryId\":\"content-{}\"", "0".repeat(64)),
        );
        assert!(unknown.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(unknown.contains("LIBRARY_ENTRY_NOT_FOUND"));

        let malformed = launch(
            &server,
            &token,
            "55555555555555555555555555555555",
            ",\"entryId\":\"../escape\"",
        );
        assert!(malformed.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(malformed.contains("LAUNCH_REQUEST_INVALID"));
    }

    #[test]
    fn a_fixed_content_package_rejects_an_entry_and_is_unchanged_without_one() {
        let entries = library_entries(1, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_catalog();
        let server = HostStatusServer::start_with_library_launch_service(
            ORIGIN,
            catalog,
            vec!["local-player".to_owned()],
            fixture.snapshot(),
        )
        .expect("library launch host starts");
        let token = token_from(&server);

        let rejected = launch(
            &server,
            &token,
            "66666666666666666666666666666666",
            &format!(",\"entryId\":\"{}\"", entry_id(&entries[0].3)),
        );
        assert!(rejected.starts_with("HTTP/1.1 409 Conflict\r\n"));
        assert!(rejected.contains("PACKAGE_REJECTS_LIBRARY_CONTENT"));

        let unchanged = launch(&server, &token, "77777777777777777777777777777777", "");
        assert!(unchanged.starts_with("HTTP/1.1 422 Unprocessable Content\r\n"));
        assert!(unchanged.contains("\"detailCode\":\"PROCESS_START_FAILED\""));
        assert!(!unchanged.contains("entryId"));

        let unknown_field = launch(
            &server,
            &token,
            "88888888888888888888888888888888",
            ",\"contentPath\":\"escape\"",
        );
        assert!(unknown_field.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(unknown_field.contains("LAUNCH_REQUEST_INVALID"));
    }

    fn library_status(server: &HostStatusServer, token: &str) -> String {
        request(
            server,
            &format!(
                "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        )
    }

    fn launch(server: &HostStatusServer, token: &str, request_id: &str, extra: &str) -> String {
        let body = format!(
            r#"{{"protocolVersion":"{HOST_API_PROTOCOL_VERSION}","requestId":"{request_id}","gameId":"retro-2048","profileId":"local-player"{extra}}}"#
        );
        request(
            server,
            &format!(
                "POST /v1/launches HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            ),
        )
    }

    /// A pairing service whose executable is absent: pairing is configured and
    /// advertised, and every pairing call fails the same stable way.
    fn pairing_service() -> BluetoothPairingService {
        let missing = std::env::current_dir()
            .expect("current directory exists")
            .join("missing-bluetoothctl");
        BluetoothPairingService::new(&missing).expect("absolute path is accepted")
    }

    /// One durable replay journal root, discarded with the test.
    struct JournalFixture {
        root: PathBuf,
    }

    impl JournalFixture {
        fn new() -> Self {
            let sequence = LIBRARY_FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            Self {
                root: std::env::temp_dir().join(format!(
                    "vcg-host-api-journal-{}-{unique}-{sequence}",
                    std::process::id()
                )),
            }
        }
    }

    impl Drop for JournalFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn bluetooth_snapshot(server: &HostStatusServer, token: &str) -> String {
        request(
            server,
            &format!(
                "GET /v1/bluetooth HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        )
    }

    /// The appliance always configures controller pairing, and a retro game
    /// cannot be played without a controller.
    #[test]
    fn a_library_and_controller_pairing_are_served_together() {
        let entries = library_entries(2, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_catalog();
        let server = HostStatusServer::start_with_capabilities(
            ORIGIN,
            HostCapabilities::with_catalog(catalog)
                .and_library(fixture.snapshot())
                .and_bluetooth(pairing_service()),
        )
        .expect("library and pairing host starts");
        let token = token_from(&server);

        let status = library_status(&server, &token);
        assert!(status.contains("\"trusted-package-catalog\""));
        assert!(status.contains("\"retro-library\""));
        assert!(status.contains("\"bluetooth-controller-pairing\""));

        let page = library_page(&server, &token, None);
        assert!(page.starts_with("HTTP/1.1 200 OK\r\n"));
        assert_eq!(
            page_document(&page)["entries"]
                .as_array()
                .expect("entries is an array")
                .len(),
            entries.len()
        );

        let snapshot = bluetooth_snapshot(&server, &token);
        assert!(snapshot.starts_with("HTTP/1.1 503 Service Unavailable\r\n"));
        assert!(snapshot.contains("BLUETOOTH_SERVICE_UNAVAILABLE"));
    }

    #[test]
    fn a_library_and_watchdog_games_are_served_together() {
        let entries = library_entries(1, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let (_catalog_fixture, catalog) = signed_library_catalog("nes", "mesen");
        let server = HostStatusServer::start_with_capabilities(
            ORIGIN,
            HostCapabilities::with_launch_service(
                catalog,
                HostLaunchPolicy::new(vec!["local-player".to_owned()]).with_watchdog_games(
                    vec!["retro-2048".to_owned()],
                    WatchdogPolicy::local_game_defaults(),
                ),
            )
            .and_library(fixture.snapshot()),
        )
        .expect("library and watchdog host starts");
        let token = token_from(&server);

        let status = library_status(&server, &token);
        assert!(status.contains("\"trusted-package-launch\""));
        assert!(status.contains("\"retro-library\""));
        assert!(!status.contains("bluetooth-controller-pairing"));

        let page = library_page(&server, &token, None);
        assert!(page.starts_with("HTTP/1.1 200 OK\r\n"));
        assert_eq!(
            page_document(&page)["entries"]
                .as_array()
                .expect("entries is an array")
                .len(),
            entries.len()
        );
    }

    /// The appliance configuration: a library, controller pairing, launch
    /// profiles, watchdog games, and durable replay in one process.
    #[test]
    fn every_capability_is_served_by_one_launcher_process() {
        let entries = library_entries(1, "Library Title ");
        let fixture = LibraryFixture::new(&entries);
        let journal = JournalFixture::new();
        let (_catalog_fixture, catalog) = signed_library_catalog("nes", "mesen");
        let server = HostStatusServer::start_with_capabilities(
            ORIGIN,
            HostCapabilities::with_launch_service(
                catalog,
                HostLaunchPolicy::new(vec!["local-player".to_owned()])
                    .with_watchdog_games(
                        vec!["retro-2048".to_owned()],
                        WatchdogPolicy::local_game_defaults(),
                    )
                    .with_replay_journal(&journal.root),
            )
            .and_library(fixture.snapshot())
            .and_bluetooth(pairing_service()),
        )
        .expect("every capability starts in one process");
        let token = token_from(&server);

        let status = library_status(&server, &token);
        for capability in [
            "trusted-package-catalog",
            "trusted-package-launch",
            "retro-library",
            "bluetooth-controller-pairing",
        ] {
            assert!(
                status.contains(&format!("\"{capability}\"")),
                "{capability}"
            );
        }

        let page = library_page(&server, &token, None);
        assert!(page.starts_with("HTTP/1.1 200 OK\r\n"));
        let snapshot = bluetooth_snapshot(&server, &token);
        assert!(snapshot.starts_with("HTTP/1.1 503 Service Unavailable\r\n"));

        let launched = launch(
            &server,
            &token,
            "12121212121212121212121212121212",
            &format!(",\"entryId\":\"{}\"", entry_id(&entries[0].3)),
        );
        assert!(launched.starts_with("HTTP/1.1 202 Accepted\r\n"));
        assert!(launched.contains("\"state\":\"preparing\""));
        drop(server);

        assert!(journal.root.join("journal.lock").exists());
    }
}
