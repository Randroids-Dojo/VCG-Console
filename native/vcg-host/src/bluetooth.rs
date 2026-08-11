//! Privacy-preserving `BlueZ` controller discovery and pairing.

use std::collections::BTreeMap;
use std::fmt;
use std::io::{self, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const MAX_DEVICES: usize = 16;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(20);
const QUICK_COMMAND_TIMEOUT: Duration = Duration::from_secs(1);
const SCAN_COMMAND_TIMEOUT: Duration = Duration::from_secs(10);
const PAIR_COMMAND_TIMEOUT: Duration = Duration::from_secs(28);
const SCAN_SECONDS: &str = "8";
const PAIR_SECONDS: &str = "25";

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothController {
    pub id: String,
    pub paired: bool,
    pub connected: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothSnapshot {
    pub protocol_version: &'static str,
    pub devices: Vec<BluetoothController>,
}

#[derive(Clone, Copy)]
struct DeviceState {
    paired: bool,
    connected: bool,
}

#[derive(Default)]
struct PairingState {
    addresses_by_id: BTreeMap<String, String>,
    ids_by_address: BTreeMap<String, String>,
    device_states: BTreeMap<String, DeviceState>,
    next_id: u32,
}

trait BluetoothCommandRunner: Send + Sync {
    fn run(&self, arguments: &[&str]) -> Result<String, BluetoothError>;
}

struct ProcessCommandRunner {
    executable: PathBuf,
}

impl BluetoothCommandRunner for ProcessCommandRunner {
    fn run(&self, arguments: &[&str]) -> Result<String, BluetoothError> {
        let mut child = Command::new(&self.executable)
            .args(arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| BluetoothError::CommandUnavailable)?;
        let stdout = child.stdout.take().ok_or(BluetoothError::CommandFailed)?;
        let stderr = child.stderr.take().ok_or(BluetoothError::CommandFailed)?;
        let stdout_worker = thread::spawn(move || read_bounded(stdout));
        let stderr_worker = thread::spawn(move || read_bounded(stderr));
        let deadline = Instant::now() + command_timeout(arguments);
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if Instant::now() < deadline => thread::sleep(COMMAND_POLL_INTERVAL),
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_worker.join();
                    let _ = stderr_worker.join();
                    return Err(BluetoothError::CommandTimedOut);
                }
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_worker.join();
                    let _ = stderr_worker.join();
                    return Err(BluetoothError::CommandFailed);
                }
            }
        };
        let stdout = stdout_worker
            .join()
            .map_err(|_| BluetoothError::CommandFailed)??;
        let _stderr = stderr_worker
            .join()
            .map_err(|_| BluetoothError::CommandFailed)??;
        if !status.success() {
            return Err(BluetoothError::CommandFailed);
        }
        String::from_utf8(stdout).map_err(|_| BluetoothError::CommandOutputInvalid)
    }
}

fn read_bounded(mut input: impl Read) -> Result<Vec<u8>, BluetoothError> {
    let mut retained = Vec::new();
    let mut exceeded = false;
    let mut buffer = [0_u8; 4096];
    loop {
        let read = input.read(&mut buffer).map_err(BluetoothError::Io)?;
        if read == 0 {
            break;
        }
        let remaining = MAX_OUTPUT_BYTES.saturating_sub(retained.len());
        retained.extend_from_slice(&buffer[..read.min(remaining)]);
        exceeded |= read > remaining;
    }
    if exceeded {
        return Err(BluetoothError::CommandOutputTooLarge);
    }
    Ok(retained)
}

fn command_timeout(arguments: &[&str]) -> Duration {
    if arguments.contains(&"pair") {
        PAIR_COMMAND_TIMEOUT
    } else if arguments.contains(&"scan") {
        SCAN_COMMAND_TIMEOUT
    } else {
        QUICK_COMMAND_TIMEOUT
    }
}

pub struct BluetoothPairingService {
    runner: Arc<dyn BluetoothCommandRunner>,
    state: Mutex<PairingState>,
}

impl BluetoothPairingService {
    /// Creates a service around one fixed, absolute `bluetoothctl` executable.
    ///
    /// # Errors
    ///
    /// Returns an error when the executable path is not absolute.
    pub fn new(executable: impl Into<PathBuf>) -> Result<Self, BluetoothError> {
        let executable = executable.into();
        if !executable.is_absolute() {
            return Err(BluetoothError::ExecutablePathInvalid);
        }
        Ok(Self {
            runner: Arc::new(ProcessCommandRunner { executable }),
            state: Mutex::new(PairingState::default()),
        })
    }

    /// Returns known gaming controllers without performing discovery.
    ///
    /// # Errors
    ///
    /// Returns a stable error when `BlueZ` is unavailable or returns invalid data.
    pub fn snapshot(
        &self,
        protocol_version: &'static str,
    ) -> Result<BluetoothSnapshot, BluetoothError> {
        self.refresh(protocol_version)
    }

    /// Powers on the adapter, performs a bounded scan, and returns gaming controllers.
    ///
    /// # Errors
    ///
    /// Returns a stable error when `BlueZ` is unavailable or discovery fails.
    pub fn scan(
        &self,
        protocol_version: &'static str,
    ) -> Result<BluetoothSnapshot, BluetoothError> {
        self.runner.run(&["power", "on"])?;
        self.runner.run(&[
            "--agent",
            "NoInputNoOutput",
            "--timeout",
            SCAN_SECONDS,
            "scan",
            "on",
        ])?;
        self.refresh(protocol_version)
    }

    /// Pairs or reconnects one controller selected by its session-local identifier.
    ///
    /// # Errors
    ///
    /// Returns a stable error when the identifier is unknown or `BlueZ` rejects the operation.
    pub fn pair(
        &self,
        id: &str,
        protocol_version: &'static str,
    ) -> Result<BluetoothSnapshot, BluetoothError> {
        let address = self.address_for(id)?;
        let current = parse_device_info(&self.runner.run(&["info", &address])?)
            .ok_or(BluetoothError::DeviceUnavailable)?;
        if current.paired {
            self.runner.run(&["connect", &address])?;
        } else {
            self.runner.run(&[
                "--agent",
                "NoInputNoOutput",
                "--timeout",
                PAIR_SECONDS,
                "pair",
                &address,
            ])?;
        }
        let updated = parse_device_info(&self.runner.run(&["info", &address])?)
            .ok_or(BluetoothError::DeviceUnavailable)?;
        self.update_device(id, updated, protocol_version)
    }

    /// Removes one controller bond selected by its session-local identifier.
    ///
    /// # Errors
    ///
    /// Returns a stable error when the identifier is unknown or `BlueZ` rejects the operation.
    pub fn forget(
        &self,
        id: &str,
        protocol_version: &'static str,
    ) -> Result<BluetoothSnapshot, BluetoothError> {
        let address = self.address_for(id)?;
        self.runner.run(&["remove", &address])?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| BluetoothError::StatePoisoned)?;
        state.addresses_by_id.remove(id);
        state.ids_by_address.remove(&address);
        state.device_states.remove(id);
        Ok(snapshot_from_state(&state, protocol_version))
    }

    fn address_for(&self, id: &str) -> Result<String, BluetoothError> {
        if !valid_session_id(id) {
            return Err(BluetoothError::DeviceUnavailable);
        }
        self.state
            .lock()
            .map_err(|_| BluetoothError::StatePoisoned)?
            .addresses_by_id
            .get(id)
            .cloned()
            .ok_or(BluetoothError::DeviceUnavailable)
    }

    fn refresh(&self, protocol_version: &'static str) -> Result<BluetoothSnapshot, BluetoothError> {
        let listed = self.runner.run(&["devices"])?;
        let mut discovered = Vec::new();
        for address in parse_device_addresses(&listed)
            .into_iter()
            .take(MAX_DEVICES)
        {
            let info = self.runner.run(&["info", &address])?;
            let Some(device) = parse_device_info(&info) else {
                continue;
            };
            discovered.push((address, device));
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| BluetoothError::StatePoisoned)?;
        let visible_addresses: Vec<&str> = discovered
            .iter()
            .map(|(address, _)| address.as_str())
            .collect();
        state
            .addresses_by_id
            .retain(|_, address| visible_addresses.contains(&address.as_str()));
        state
            .ids_by_address
            .retain(|address, _| visible_addresses.contains(&address.as_str()));
        drop(visible_addresses);
        let mut devices = Vec::with_capacity(discovered.len());
        let mut visible_ids = Vec::with_capacity(discovered.len());
        for (address, device) in discovered {
            let id = if let Some(existing) = state.ids_by_address.get(&address) {
                existing.clone()
            } else {
                if state.ids_by_address.len() >= MAX_DEVICES {
                    return Err(BluetoothError::DeviceLimit);
                }
                state.next_id = state
                    .next_id
                    .checked_add(1)
                    .ok_or(BluetoothError::DeviceLimit)?;
                let id = format!("controller-{}", state.next_id);
                state.ids_by_address.insert(address.clone(), id.clone());
                state.addresses_by_id.insert(id.clone(), address);
                id
            };
            state.device_states.insert(id.clone(), device);
            visible_ids.push(id);
        }
        state
            .device_states
            .retain(|id, _| visible_ids.iter().any(|visible| visible == id));
        devices.extend(snapshot_from_state(&state, protocol_version).devices);
        Ok(BluetoothSnapshot {
            protocol_version,
            devices,
        })
    }

    fn update_device(
        &self,
        id: &str,
        device: DeviceState,
        protocol_version: &'static str,
    ) -> Result<BluetoothSnapshot, BluetoothError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| BluetoothError::StatePoisoned)?;
        state.device_states.insert(id.to_owned(), device);
        Ok(snapshot_from_state(&state, protocol_version))
    }
}

fn snapshot_from_state(state: &PairingState, protocol_version: &'static str) -> BluetoothSnapshot {
    let mut devices: Vec<_> = state
        .device_states
        .iter()
        .map(|(id, device)| BluetoothController {
            id: id.clone(),
            paired: device.paired,
            connected: device.connected,
        })
        .collect();
    devices.sort_by_key(|device| session_id_number(&device.id).unwrap_or(u32::MAX));
    BluetoothSnapshot {
        protocol_version,
        devices,
    }
}

fn valid_session_id(value: &str) -> bool {
    session_id_number(value).is_some()
}

fn session_id_number(value: &str) -> Option<u32> {
    let suffix = value.strip_prefix("controller-")?;
    if suffix.starts_with('0') {
        return None;
    }
    suffix.parse().ok()
}

fn parse_device_addresses(output: &str) -> Vec<String> {
    let mut addresses = Vec::new();
    for line in output.lines() {
        let mut fields = line.split_whitespace();
        if fields.next() != Some("Device") {
            continue;
        }
        let Some(address) = fields.next() else {
            continue;
        };
        let address = address.to_ascii_uppercase();
        if valid_address(&address) && !addresses.contains(&address) {
            addresses.push(address);
        }
    }
    addresses
}

fn valid_address(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 17
        && bytes.iter().enumerate().all(|(index, byte)| {
            if matches!(index, 2 | 5 | 8 | 11 | 14) {
                *byte == b':'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn parse_device_info(output: &str) -> Option<DeviceState> {
    let gaming = output.lines().any(|line| {
        let value = line.trim().to_ascii_lowercase();
        value == "icon: input-gaming"
            || value.contains("00001124-0000-1000-8000-00805f9b34fb")
            || value.contains("00001812-0000-1000-8000-00805f9b34fb")
    });
    if !gaming {
        return None;
    }
    Some(DeviceState {
        paired: has_yes_field(output, "Paired"),
        connected: has_yes_field(output, "Connected"),
    })
}

fn has_yes_field(output: &str, name: &str) -> bool {
    output.lines().any(|line| {
        line.trim()
            .split_once(':')
            .is_some_and(|(field, value)| field == name && value.trim() == "yes")
    })
}

#[derive(Debug)]
pub enum BluetoothError {
    ExecutablePathInvalid,
    CommandUnavailable,
    CommandFailed,
    CommandTimedOut,
    CommandOutputInvalid,
    CommandOutputTooLarge,
    DeviceUnavailable,
    DeviceLimit,
    StatePoisoned,
    Io(io::Error),
}

impl BluetoothError {
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::ExecutablePathInvalid => "BLUETOOTH_CONFIGURATION_INVALID",
            Self::CommandUnavailable => "BLUETOOTH_SERVICE_UNAVAILABLE",
            Self::CommandFailed => "BLUETOOTH_OPERATION_FAILED",
            Self::CommandTimedOut => "BLUETOOTH_OPERATION_TIMED_OUT",
            Self::CommandOutputInvalid | Self::CommandOutputTooLarge => {
                "BLUETOOTH_RESPONSE_INVALID"
            }
            Self::DeviceUnavailable => "BLUETOOTH_DEVICE_UNAVAILABLE",
            Self::DeviceLimit => "BLUETOOTH_DEVICE_LIMIT",
            Self::StatePoisoned | Self::Io(_) => "BLUETOOTH_SERVICE_FAILED",
        }
    }
}

impl fmt::Display for BluetoothError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for BluetoothError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type FakeResponse = (Vec<String>, Result<String, BluetoothError>);

    struct FakeRunner {
        responses: Mutex<Vec<FakeResponse>>,
    }

    impl BluetoothCommandRunner for FakeRunner {
        fn run(&self, arguments: &[&str]) -> Result<String, BluetoothError> {
            let mut responses = self.responses.lock().expect("fake runner locks");
            let (expected, response) = responses.remove(0);
            assert_eq!(arguments, expected);
            response
        }
    }

    fn service(responses: Vec<(Vec<&str>, &str)>) -> BluetoothPairingService {
        BluetoothPairingService {
            runner: Arc::new(FakeRunner {
                responses: Mutex::new(
                    responses
                        .into_iter()
                        .map(|(arguments, response)| {
                            (
                                arguments.into_iter().map(str::to_owned).collect(),
                                Ok(response.to_owned()),
                            )
                        })
                        .collect(),
                ),
            }),
            state: Mutex::new(PairingState::default()),
        }
    }

    #[test]
    fn exposes_only_opaque_controller_ids() {
        let address = "AA:BB:CC:DD:EE:FF";
        let service = service(vec![
            (vec!["devices"], "Device AA:BB:CC:DD:EE:FF Secret Name\n"),
            (
                vec!["info", address],
                "Name: Secret Name\nIcon: input-gaming\nPaired: yes\nConnected: no\n",
            ),
        ]);
        let snapshot = service.snapshot("0.1.0").expect("snapshot succeeds");
        let serialized = serde_json::to_string(&snapshot).expect("snapshot serializes");

        assert_eq!(snapshot.devices[0].id, "controller-1");
        assert!(snapshot.devices[0].paired);
        assert!(!serialized.contains(address));
        assert!(!serialized.contains("Secret"));
    }

    #[test]
    fn ignores_non_gaming_bluetooth_devices() {
        let service = service(vec![
            (vec!["devices"], "Device 11:22:33:44:55:66 Headphones\n"),
            (
                vec!["info", "11:22:33:44:55:66"],
                "Icon: audio-card\nPaired: yes\nConnected: yes\n",
            ),
        ]);

        assert!(
            service
                .snapshot("0.1.0")
                .expect("snapshot succeeds")
                .devices
                .is_empty()
        );
    }

    #[test]
    fn removes_private_mappings_for_devices_no_longer_reported_by_bluez() {
        let address = "AA:BB:CC:DD:EE:FF";
        let service = service(vec![
            (vec!["devices"], "Device AA:BB:CC:DD:EE:FF Gamepad\n"),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: no\nConnected: no\n",
            ),
            (vec!["devices"], ""),
        ]);

        assert_eq!(
            service
                .snapshot("0.1.0")
                .expect("first snapshot")
                .devices
                .len(),
            1
        );
        assert!(
            service
                .snapshot("0.1.0")
                .expect("empty snapshot")
                .devices
                .is_empty()
        );
        let state = service.state.lock().expect("state locks");
        assert!(state.addresses_by_id.is_empty());
        assert!(state.ids_by_address.is_empty());
        assert!(state.device_states.is_empty());
    }

    #[test]
    fn reconnects_a_paired_device_without_repairing_it() {
        let address = "AA:BB:CC:DD:EE:FF";
        let service = service(vec![
            (vec!["devices"], "Device AA:BB:CC:DD:EE:FF Gamepad\n"),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: yes\nConnected: no\n",
            ),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: yes\nConnected: no\n",
            ),
            (vec!["connect", address], "Connection successful\n"),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: yes\nConnected: yes\n",
            ),
        ]);
        let first = service.snapshot("0.1.0").expect("snapshot succeeds");
        let paired = service
            .pair(&first.devices[0].id, "0.1.0")
            .expect("connect succeeds");

        assert!(paired.devices[0].connected);
    }

    #[test]
    fn pairs_and_forgets_only_the_selected_opaque_controller() {
        let address = "12:34:56:78:9A:BC";
        let service = service(vec![
            (vec!["devices"], "Device 12:34:56:78:9A:BC Controller\n"),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: no\nConnected: no\n",
            ),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: no\nConnected: no\n",
            ),
            (
                vec![
                    "--agent",
                    "NoInputNoOutput",
                    "--timeout",
                    PAIR_SECONDS,
                    "pair",
                    address,
                ],
                "Pairing successful\n",
            ),
            (
                vec!["info", address],
                "Icon: input-gaming\nPaired: yes\nConnected: yes\n",
            ),
            (vec!["remove", address], "Device has been removed\n"),
        ]);
        let first = service.snapshot("0.1.0").expect("snapshot succeeds");
        let id = &first.devices[0].id;
        let paired = service.pair(id, "0.1.0").expect("pair succeeds");
        assert!(paired.devices[0].paired);
        assert!(paired.devices[0].connected);
        let forgotten = service.forget(id, "0.1.0").expect("forget succeeds");
        assert!(forgotten.devices.is_empty());
    }

    #[test]
    fn validates_addresses_and_session_ids() {
        assert!(valid_address("AA:bb:01:23:45:67"));
        assert!(!valid_address("AA:BB:CC:DD:EE:FF;reboot"));
        assert!(valid_session_id("controller-12"));
        assert!(!valid_session_id("controller-0"));
        assert!(!valid_session_id("controller-1/forget"));
    }

    #[test]
    fn deduplicates_addresses_case_insensitively_and_sorts_ids_numerically() {
        assert_eq!(
            parse_device_addresses(
                "Device aa:bb:cc:dd:ee:ff Gamepad\nDevice AA:BB:CC:DD:EE:FF Gamepad\n"
            ),
            vec!["AA:BB:CC:DD:EE:FF"]
        );

        let mut state = PairingState::default();
        for id in ["controller-10", "controller-2", "controller-1"] {
            state.device_states.insert(
                id.to_owned(),
                DeviceState {
                    paired: false,
                    connected: false,
                },
            );
        }
        let ids: Vec<_> = snapshot_from_state(&state, "0.1.0")
            .devices
            .into_iter()
            .map(|device| device.id)
            .collect();
        assert_eq!(ids, ["controller-1", "controller-2", "controller-10"]);
    }

    #[test]
    fn command_deadlines_fit_the_console_request_budget() {
        assert_eq!(command_timeout(&["devices"]), Duration::from_secs(1));
        assert_eq!(command_timeout(&["scan", "on"]), Duration::from_secs(10));
        assert_eq!(
            command_timeout(&["pair", "AA:BB:CC:DD:EE:FF"]),
            Duration::from_secs(28)
        );

        let max_devices = u32::try_from(MAX_DEVICES).expect("device limit fits u32");
        let worst_case_scan = QUICK_COMMAND_TIMEOUT
            + SCAN_COMMAND_TIMEOUT
            + QUICK_COMMAND_TIMEOUT
            + QUICK_COMMAND_TIMEOUT * max_devices;
        assert!(worst_case_scan < Duration::from_secs(35));
    }
}
