//! Host-owned reserved input read straight from the controller device.
//!
//! The host opens each connected controller's own event device read-only and
//! watches for the reserved gesture itself, above the launched frontend. The
//! escape therefore survives a core that has stopped processing input, which
//! is the failure a frontend-handled button combination cannot survive.
//!
//! The host never takes an exclusive grab and never consumes or modifies an
//! event, so a running game observes the same button presses. The reserved
//! gesture is host-owned, not withheld from the game. Withholding it needs an
//! exclusive grab plus re-emission through a virtual device, which is ioctl
//! work and is not implemented here; `native/vcg-cursor-nudge` holds the
//! pattern that would keep such work outside this crate's
//! `unsafe_code = "forbid"` boundary.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt;
use std::io;

use crate::input::{
    InputContext, InputEvent, MAX_CONNECTED_CONTROLLERS, ReservedInputRouter, RoutedInputEvent,
    ShellAction,
};

/// Kernel `EV_KEY` event type. Every button this router observes arrives as
/// one of these.
const EV_KEY: u16 = 0x01;

/// First and last kernel button codes in the joystick and gamepad blocks,
/// `BTN_JOYSTICK` through `BTN_THUMBR`.
const BTN_JOYSTICK_FIRST: u16 = 0x120;
const BTN_GAMEPAD_LAST: u16 = 0x13f;

/// Kernel codes for the buttons the reserved gesture uses.
const BTN_SELECT: u16 = 0x13a;
const BTN_START: u16 = 0x13b;
const BTN_MODE: u16 = 0x13c;

/// Bytes in one kernel `input_event` record: two pointer-width timestamp
/// fields followed by `type`, `code`, and `value`.
pub const EVENT_RECORD_BYTES: usize = 2 * size_of::<usize>() + 8;

/// Bits in one sysfs capability word.
///
/// The kernel prints a capability bitmap as `unsigned long` words in
/// hexadecimal, most significant word first and unpadded, so a word's position
/// in the line rather than its digit count gives its bit offset. Only the word
/// width matters, and both reference targets run a 64-bit kernel.
const CAPABILITY_WORD_BITS: usize = 64;

/// Most capability words accepted from one sysfs bitmap. `KEY_MAX` needs
/// twelve; the rest of the allowance absorbs a kernel that widens the range.
const MAX_CAPABILITY_WORDS: usize = 32;

/// Hexadecimal digits in one capability word.
const MAX_CAPABILITY_WORD_DIGITS: usize = 16;

/// Continuous hold before the host acts on the reserved gesture.
///
/// Both reserved buttons going down within one frame is ordinary play: a
/// player mashing can produce it, and some titles bind Select plus Start
/// themselves. A full second of continuous hold is not something play produces
/// by accident, and it costs a player nothing, because leaving a game is
/// always deliberate. The gesture fires once and re-arms only after release,
/// so holding longer cannot repeat it.
pub const RESERVED_GESTURE_HOLD_MILLIS: u64 = 1_000;

/// Interval between controller rescans, which is how a controller connected or
/// disconnected during a session is picked up or dropped.
pub const CONTROLLER_RESCAN_INTERVAL_MILLIS: u64 = 500;

/// One decoded kernel input event.
///
/// `kind` carries the kernel's `type` field, renamed because `type` is a Rust
/// keyword.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EvdevEvent {
    pub kind: u16,
    pub code: u16,
    pub value: i32,
}

/// One event and the device node that produced it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NodeEvent {
    pub node: String,
    pub event: EvdevEvent,
}

/// Fixed-layout decoder for the raw byte stream an event device produces.
///
/// A read from an event device returns whole records, but the decoder keeps
/// any partial trailing record so a short read cannot desynchronize the
/// stream.
#[derive(Clone, Debug, Default)]
pub struct EvdevDecoder {
    partial: Vec<u8>,
}

impl EvdevDecoder {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Appends one raw read and returns every record it completes.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<EvdevEvent> {
        let mut events = Vec::new();
        let mut remaining = bytes;
        while !remaining.is_empty() {
            let wanted = EVENT_RECORD_BYTES - self.partial.len();
            let taken = wanted.min(remaining.len());
            self.partial.extend_from_slice(&remaining[..taken]);
            remaining = &remaining[taken..];
            if self.partial.len() < EVENT_RECORD_BYTES {
                break;
            }
            if let Some(event) = decode_record(&self.partial) {
                events.push(event);
            }
            self.partial.clear();
        }
        events
    }

    /// Bytes held from an incomplete trailing record.
    #[must_use]
    pub fn buffered(&self) -> usize {
        self.partial.len()
    }
}

fn decode_record(bytes: &[u8]) -> Option<EvdevEvent> {
    let tail: [u8; 8] = bytes.get(EVENT_RECORD_BYTES - 8..)?.try_into().ok()?;
    Some(EvdevEvent {
        kind: u16::from_ne_bytes([tail[0], tail[1]]),
        code: u16::from_ne_bytes([tail[2], tail[3]]),
        value: i32::from_ne_bytes([tail[4], tail[5], tail[6], tail[7]]),
    })
}

/// One sysfs capability bitmap.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CapabilityBitmap {
    words: Vec<u64>,
}

impl CapabilityBitmap {
    /// Parses one sysfs capability line.
    ///
    /// Returns `None` for an empty line, an excessive word count, an over-long
    /// word, or a word that is not hexadecimal.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let tokens: Vec<&str> = text.split_whitespace().collect();
        if tokens.is_empty() || tokens.len() > MAX_CAPABILITY_WORDS {
            return None;
        }
        let mut words = Vec::with_capacity(tokens.len());
        for token in tokens.iter().rev() {
            if token.len() > MAX_CAPABILITY_WORD_DIGITS
                || !token.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return None;
            }
            words.push(u64::from_str_radix(token, 16).ok()?);
        }
        Some(Self { words })
    }

    /// Reports whether the device declares one kernel event code.
    #[must_use]
    pub fn contains(&self, code: u16) -> bool {
        let index = usize::from(code) / CAPABILITY_WORD_BITS;
        let bit = usize::from(code) % CAPABILITY_WORD_BITS;
        self.words
            .get(index)
            .is_some_and(|word| (word >> bit) & 1 == 1)
    }
}

/// Reports whether a node's key bitmap identifies a controller.
///
/// The test is capability data rather than a device name: a node is a
/// controller when it declares at least one code in the kernel's joystick and
/// gamepad button blocks.
///
/// This test alone is not sufficient, and the Raspberry Pi 5 target shows why.
/// Its power button reports code 116 and its motion-sensor node reports no keys,
/// so both fall out here. Its two `vc4-hdmi` nodes do not: they declare
/// eighteen codes in `0x126..=0x137`, squarely inside the gamepad block, and
/// this test admits them. They are excluded by
/// [`produces_reserved_gesture`] instead, because they report neither
/// Select and Start nor a dedicated Home button, and only
/// [`observable_reserved_controller`] gates which nodes are opened.
#[must_use]
pub fn is_controller(key_capabilities: &CapabilityBitmap) -> bool {
    (BTN_JOYSTICK_FIRST..=BTN_GAMEPAD_LAST).any(|code| key_capabilities.contains(code))
}

/// Reports whether a controller can produce the reserved gesture.
///
/// Select plus Start is the universally producible form. A dedicated Home
/// button is an addition for pads that report one, never a replacement.
#[must_use]
pub fn produces_reserved_gesture(key_capabilities: &CapabilityBitmap) -> bool {
    (key_capabilities.contains(BTN_SELECT) && key_capabilities.contains(BTN_START))
        || key_capabilities.contains(BTN_MODE)
}

/// Reports whether a node is a controller the reserved router can rely on.
#[must_use]
pub fn observable_reserved_controller(key_capabilities: &CapabilityBitmap) -> bool {
    is_controller(key_capabilities) && produces_reserved_gesture(key_capabilities)
}

/// One reserved-gesture transition on one device node.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservedGestureChange {
    pub node: String,
    pub pressed: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
enum GesturePhase {
    #[default]
    Released,
    Holding {
        since_millis: u64,
    },
    Fired,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct GestureState {
    select_down: bool,
    start_down: bool,
    home_down: bool,
    phase: GesturePhase,
}

impl GestureState {
    const fn down(self) -> bool {
        (self.select_down && self.start_down) || self.home_down
    }
}

/// Reserved-gesture recognition over decoded events from any source.
///
/// The recognizer owns the debounce policy: the gesture must be held
/// continuously for [`RESERVED_GESTURE_HOLD_MILLIS`], fires once, and re-arms
/// only after release. Every other button is ignored, so gameplay input cannot
/// be mistaken for the reserved gesture.
#[derive(Clone, Debug)]
pub struct ReservedGestureRecognizer {
    hold_millis: u64,
    devices: BTreeMap<String, GestureState>,
}

impl ReservedGestureRecognizer {
    #[must_use]
    pub fn new(hold_millis: u64) -> Self {
        Self {
            hold_millis,
            devices: BTreeMap::new(),
        }
    }

    /// Consumes one event and returns a release when a fired gesture ends.
    ///
    /// A press never comes from here: the gesture fires on elapsed hold time,
    /// which [`ReservedGestureRecognizer::elapsed`] reports.
    pub fn observe(
        &mut self,
        node: &str,
        event: EvdevEvent,
        now_millis: u64,
    ) -> Option<ReservedGestureChange> {
        if event.kind != EV_KEY
            || !matches!(event.code, BTN_SELECT | BTN_START | BTN_MODE)
            || (self.devices.len() >= MAX_CONNECTED_CONTROLLERS && !self.devices.contains_key(node))
        {
            return None;
        }
        let down = match event.value {
            0 => false,
            1 => true,
            // Key autorepeat restates a button that is already down.
            _ => return None,
        };
        let state = self.devices.entry(node.to_owned()).or_default();
        match event.code {
            BTN_SELECT => state.select_down = down,
            BTN_START => state.start_down = down,
            _ => state.home_down = down,
        }
        if state.down() {
            if state.phase == GesturePhase::Released {
                state.phase = GesturePhase::Holding {
                    since_millis: now_millis,
                };
            }
            return None;
        }
        let was_fired = state.phase == GesturePhase::Fired;
        state.phase = GesturePhase::Released;
        was_fired.then(|| ReservedGestureChange {
            node: node.to_owned(),
            pressed: false,
        })
    }

    /// Fires every gesture whose hold is now complete.
    pub fn elapsed(&mut self, now_millis: u64) -> Vec<ReservedGestureChange> {
        let mut changes = Vec::new();
        for (node, state) in &mut self.devices {
            let GesturePhase::Holding { since_millis } = state.phase else {
                continue;
            };
            if now_millis.saturating_sub(since_millis) < self.hold_millis {
                continue;
            }
            state.phase = GesturePhase::Fired;
            changes.push(ReservedGestureChange {
                node: node.clone(),
                pressed: true,
            });
        }
        changes
    }

    /// Drops a vanished device and releases a gesture it left held.
    pub fn forget(&mut self, node: &str) -> Option<ReservedGestureChange> {
        let state = self.devices.remove(node)?;
        (state.phase == GesturePhase::Fired).then(|| ReservedGestureChange {
            node: node.to_owned(),
            pressed: false,
        })
    }
}

/// Platform source of raw controller events.
///
/// The Linux implementation reads `/dev/input/event*`. A synthetic
/// implementation drives the same seam in tests, so decoding, recognition, and
/// hotplug are covered on hosts with no Linux input devices.
pub trait ReservedInputSource {
    /// Reconciles the observed set with the controllers present now and
    /// returns every node the source currently reads, in ascending order.
    ///
    /// # Errors
    ///
    /// Returns the operating-system error when the device directory cannot be
    /// read.
    fn rescan(&mut self) -> io::Result<Vec<String>>;

    /// Returns every event pending on every observed controller.
    ///
    /// # Errors
    ///
    /// Returns the operating-system error when the observed set cannot be read
    /// at all. A single unreadable device is dropped instead.
    fn read_pending(&mut self) -> io::Result<Vec<NodeEvent>>;
}

/// Reserved-input router for one supervised session.
///
/// It fails closed: [`ReservedInputWatch::start`] refuses when no connected
/// controller can produce the reserved gesture, so a game is never started
/// with no exit.
#[derive(Debug)]
pub struct ReservedInputWatch<S> {
    source: S,
    recognizer: ReservedGestureRecognizer,
    router: ReservedInputRouter,
    device_ids: BTreeMap<String, String>,
    next_device_number: u32,
    next_rescan_millis: u64,
    rescan_interval_millis: u64,
}

impl<S: ReservedInputSource> ReservedInputWatch<S> {
    /// Starts observing before a child is launched.
    ///
    /// # Errors
    ///
    /// Returns [`ReservedInputError::Scan`] when the source cannot be read and
    /// [`ReservedInputError::NoObservableController`] when no connected
    /// controller can produce the reserved gesture.
    pub fn start(mut source: S, now_millis: u64) -> Result<Self, ReservedInputError> {
        let nodes = source.rescan().map_err(ReservedInputError::Scan)?;
        if nodes.is_empty() {
            return Err(ReservedInputError::NoObservableController);
        }
        let mut watch = Self {
            source,
            recognizer: ReservedGestureRecognizer::new(RESERVED_GESTURE_HOLD_MILLIS),
            router: ReservedInputRouter::new(InputContext::Game),
            device_ids: BTreeMap::new(),
            next_device_number: 0,
            next_rescan_millis: now_millis.saturating_add(CONTROLLER_RESCAN_INTERVAL_MILLIS),
            rescan_interval_millis: CONTROLLER_RESCAN_INTERVAL_MILLIS,
        };
        watch.reconcile(&nodes);
        Ok(watch)
    }

    /// Observes one interval and returns the routed reserved press when the
    /// gesture completes.
    ///
    /// A source failure is absorbed rather than reported, because a transient
    /// read error must not end a running game. Its consequence stays visible
    /// through [`ReservedInputWatch::observed_controllers`].
    pub fn poll(&mut self, now_millis: u64) -> Option<RoutedInputEvent> {
        if now_millis >= self.next_rescan_millis {
            self.next_rescan_millis = now_millis.saturating_add(self.rescan_interval_millis);
            if let Ok(nodes) = self.source.rescan() {
                self.reconcile(&nodes);
            }
        }

        let mut changes = Vec::new();
        for pending in self.source.read_pending().unwrap_or_default() {
            if let Some(change) = self
                .recognizer
                .observe(&pending.node, pending.event, now_millis)
            {
                changes.push(change);
            }
        }
        changes.extend(self.recognizer.elapsed(now_millis));
        self.route(changes)
    }

    /// Controllers the router currently reads.
    #[must_use]
    pub fn observed_controllers(&self) -> usize {
        self.device_ids.len()
    }

    fn reconcile(&mut self, nodes: &[String]) {
        let removed: Vec<String> = self
            .device_ids
            .keys()
            .filter(|node| !nodes.iter().any(|present| present == *node))
            .cloned()
            .collect();
        let mut released = Vec::new();
        for node in &removed {
            if let Some(change) = self.recognizer.forget(node) {
                released.push(change);
            }
        }
        // Routed while the vanished devices still hold their IDs, so the
        // router cannot keep a reserved action held for a controller that is
        // gone. A release never selects the game, so nothing is returned.
        let _ = self.route(released);
        for node in removed {
            self.device_ids.remove(&node);
        }

        for node in nodes {
            if self.device_ids.contains_key(node)
                || self.device_ids.len() >= MAX_CONNECTED_CONTROLLERS
            {
                continue;
            }
            self.next_device_number = self.next_device_number.saturating_add(1);
            let number = self.next_device_number;
            self.device_ids
                .insert(node.clone(), format!("controller-{number:04}"));
        }
    }

    fn route(&mut self, changes: Vec<ReservedGestureChange>) -> Option<RoutedInputEvent> {
        let mut press = None;
        for change in changes {
            let Some(device_id) = self.device_ids.get(&change.node) else {
                continue;
            };
            let routed = self.router.route(InputEvent {
                device_id: device_id.clone(),
                action: ShellAction::Home,
                pressed: change.pressed,
            });
            if let Ok(Some(routed)) = routed
                && routed.input.pressed
                && press.is_none()
            {
                press = Some(routed);
            }
        }
        press
    }
}

/// Reserved-input router refusal.
#[derive(Debug)]
pub enum ReservedInputError {
    Unsupported,
    Scan(io::Error),
    NoObservableController,
}

impl fmt::Display for ReservedInputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported => write!(
                formatter,
                "reserved input router requires Linux event devices"
            ),
            Self::Scan(source) => write!(
                formatter,
                "reserved input router cannot read input devices: {source}"
            ),
            Self::NoObservableController => write!(
                formatter,
                "reserved input router found no controller reporting Select and Start or a Home button"
            ),
        }
    }
}

impl Error for ReservedInputError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Unsupported | Self::NoObservableController => None,
            Self::Scan(source) => Some(source),
        }
    }
}

/// Placeholder source for a platform with no reserved-input backend.
///
/// [`start`] refuses on such a platform, so no session ever reads from it.
#[cfg(not(target_os = "linux"))]
#[derive(Debug)]
pub struct UnavailableSource(());

#[cfg(not(target_os = "linux"))]
impl ReservedInputSource for UnavailableSource {
    fn rescan(&mut self) -> io::Result<Vec<String>> {
        Ok(Vec::new())
    }

    fn read_pending(&mut self) -> io::Result<Vec<NodeEvent>> {
        Ok(Vec::new())
    }
}

#[cfg(target_os = "linux")]
pub type PlatformReservedInputWatch = ReservedInputWatch<linux::EvdevReservedInputSource>;

#[cfg(not(target_os = "linux"))]
pub type PlatformReservedInputWatch = ReservedInputWatch<UnavailableSource>;

/// Starts the platform reserved-input router for one session.
///
/// # Errors
///
/// Returns [`ReservedInputError::Scan`] when event devices cannot be
/// enumerated and [`ReservedInputError::NoObservableController`] when no
/// connected controller can produce the reserved gesture.
#[cfg(target_os = "linux")]
pub fn start(now_millis: u64) -> Result<PlatformReservedInputWatch, ReservedInputError> {
    let source = linux::EvdevReservedInputSource::open().map_err(ReservedInputError::Scan)?;
    ReservedInputWatch::start(source, now_millis)
}

/// Starts the platform reserved-input router for one session.
///
/// # Errors
///
/// Always returns [`ReservedInputError::Unsupported`]: this platform has no
/// event devices, so a launch would have no host-owned exit.
#[cfg(not(target_os = "linux"))]
pub fn start(_now_millis: u64) -> Result<PlatformReservedInputWatch, ReservedInputError> {
    Err(ReservedInputError::Unsupported)
}

#[cfg(target_os = "linux")]
pub mod linux {
    //! Read-only evdev backend.
    //!
    //! Every device node is opened read-only and non-blocking. The backend
    //! never issues `EVIOCGRAB`, never writes to a device, and never consumes
    //! an event: with no exclusive grab held, the kernel delivers each event
    //! to every reader, so the frontend keeps receiving the same input.

    use std::collections::{BTreeMap, BTreeSet};
    use std::fmt;
    use std::fs::{self, File};
    use std::io::{self, Read};
    use std::path::{Path, PathBuf};

    use super::{
        CapabilityBitmap, EVENT_RECORD_BYTES, EvdevDecoder, NodeEvent, ReservedInputSource,
        observable_reserved_controller,
    };
    use crate::input::MAX_CONNECTED_CONTROLLERS;

    /// Sysfs directory listing every input node and its capabilities.
    const INPUT_CLASS_DIRECTORY: &str = "/sys/class/input";
    /// Directory holding the character devices those nodes are read from.
    const INPUT_DEVICE_DIRECTORY: &str = "/dev/input";
    /// Path, relative to one sysfs node, holding its key capability bitmap.
    const KEY_CAPABILITY_PATH: &str = "device/capabilities/key";

    const MAX_CAPABILITY_BYTES: u64 = 4_096;
    const MAX_NODE_NAME_BYTES: usize = 16;
    const READ_BUFFER_BYTES: usize = EVENT_RECORD_BYTES * 32;
    const MAX_READS_PER_NODE: usize = 8;

    struct OpenNode {
        file: File,
        decoder: EvdevDecoder,
    }

    /// Read-only reader over every connected controller's event device.
    pub struct EvdevReservedInputSource {
        class_directory: PathBuf,
        device_directory: PathBuf,
        open: BTreeMap<String, OpenNode>,
    }

    impl fmt::Debug for EvdevReservedInputSource {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter
                .debug_struct("EvdevReservedInputSource")
                .field("class_directory", &self.class_directory)
                .field("device_directory", &self.device_directory)
                .field("observed", &self.open.len())
                .finish_non_exhaustive()
        }
    }

    impl EvdevReservedInputSource {
        /// Opens every connected controller that can produce the reserved
        /// gesture.
        ///
        /// # Errors
        ///
        /// Returns the operating-system error when the sysfs input class
        /// directory cannot be read.
        pub fn open() -> io::Result<Self> {
            Self::open_in(
                Path::new(INPUT_CLASS_DIRECTORY),
                Path::new(INPUT_DEVICE_DIRECTORY),
            )
        }

        /// Opens against explicit sysfs and device directories.
        ///
        /// # Errors
        ///
        /// Returns the operating-system error when the class directory cannot
        /// be read.
        pub fn open_in(class_directory: &Path, device_directory: &Path) -> io::Result<Self> {
            let mut source = Self {
                class_directory: class_directory.to_path_buf(),
                device_directory: device_directory.to_path_buf(),
                open: BTreeMap::new(),
            };
            source.rescan()?;
            Ok(source)
        }
    }

    impl ReservedInputSource for EvdevReservedInputSource {
        fn rescan(&mut self) -> io::Result<Vec<String>> {
            let mut present = BTreeSet::new();
            for entry in fs::read_dir(&self.class_directory)? {
                let file_name = entry?.file_name();
                let Some(node) = file_name.to_str() else {
                    continue;
                };
                if is_event_node_name(node) {
                    present.insert(node.to_owned());
                }
            }

            self.open.retain(|node, _| present.contains(node));
            for node in present {
                // Re-read on every scan rather than caching the refusal: an
                // event-node name is not a stable device identity, so a
                // replacement reusing it would inherit the prior rejection
                // and never be observed.
                if self.open.contains_key(&node) || self.open.len() >= MAX_CONNECTED_CONTROLLERS {
                    continue;
                }
                let capabilities = self.class_directory.join(&node).join(KEY_CAPABILITY_PATH);
                let Ok(text) = read_bounded(&capabilities, MAX_CAPABILITY_BYTES) else {
                    continue;
                };
                let Some(keys) = CapabilityBitmap::parse(&text) else {
                    continue;
                };
                if !observable_reserved_controller(&keys) {
                    continue;
                }
                let Ok(file) = open_event_node(&self.device_directory.join(&node)) else {
                    continue;
                };
                self.open.insert(
                    node,
                    OpenNode {
                        file,
                        decoder: EvdevDecoder::new(),
                    },
                );
            }
            Ok(self.open.keys().cloned().collect())
        }

        fn read_pending(&mut self) -> io::Result<Vec<NodeEvent>> {
            let mut events = Vec::new();
            let mut unreadable = Vec::new();
            for (node, state) in &mut self.open {
                let mut buffer = [0_u8; READ_BUFFER_BYTES];
                for _ in 0..MAX_READS_PER_NODE {
                    match state.file.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(read) => {
                            for event in state.decoder.push(&buffer[..read]) {
                                events.push(NodeEvent {
                                    node: node.clone(),
                                    event,
                                });
                            }
                            if read < buffer.len() {
                                break;
                            }
                        }
                        Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                        Err(_) => {
                            unreadable.push(node.clone());
                            break;
                        }
                    }
                }
            }
            for node in unreadable {
                self.open.remove(&node);
            }
            Ok(events)
        }
    }

    fn is_event_node_name(name: &str) -> bool {
        let Some(index) = name.strip_prefix("event") else {
            return false;
        };
        name.len() <= MAX_NODE_NAME_BYTES
            && !index.is_empty()
            && index.bytes().all(|byte| byte.is_ascii_digit())
    }

    fn read_bounded(path: &Path, limit: u64) -> io::Result<String> {
        let mut text = String::new();
        File::open(path)?.take(limit).read_to_string(&mut text)?;
        Ok(text)
    }

    fn open_event_node(path: &Path) -> io::Result<File> {
        use rustix::fs::{CWD, FileType, Mode, OFlags, fstat, openat};

        let descriptor = openat(
            CWD,
            path,
            OFlags::RDONLY | OFlags::NONBLOCK | OFlags::CLOEXEC | OFlags::NOFOLLOW,
            Mode::empty(),
        )
        .map_err(|error| io::Error::from_raw_os_error(error.raw_os_error()))?;
        let stat = fstat(&descriptor)
            .map_err(|error| io::Error::from_raw_os_error(error.raw_os_error()))?;
        if FileType::from_raw_mode(stat.st_mode) != FileType::CharacterDevice {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "input node is not a character device",
            ));
        }
        Ok(File::from(descriptor))
    }

    #[cfg(test)]
    mod tests {
        use super::is_event_node_name;

        #[test]
        fn admits_only_numbered_event_nodes() {
            assert!(is_event_node_name("event0"));
            assert!(is_event_node_name("event16"));
            assert!(!is_event_node_name("event"));
            assert!(!is_event_node_name("mice"));
            assert!(!is_event_node_name("mouse0"));
            assert!(!is_event_node_name("input5"));
            assert!(!is_event_node_name("js0"));
            assert!(!is_event_node_name("event6x"));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io;

    use super::{
        BTN_MODE, BTN_SELECT, BTN_START, CONTROLLER_RESCAN_INTERVAL_MILLIS, CapabilityBitmap,
        EV_KEY, EVENT_RECORD_BYTES, EvdevDecoder, EvdevEvent, NodeEvent,
        RESERVED_GESTURE_HOLD_MILLIS, ReservedGestureRecognizer, ReservedInputError,
        ReservedInputSource, ReservedInputWatch, is_controller, observable_reserved_controller,
        produces_reserved_gesture,
    };
    use crate::input::{InputTarget, ShellAction};

    /// Kernel codes for ordinary gameplay controls the router must ignore.
    const BTN_SOUTH: u16 = 0x130;
    const BTN_EAST: u16 = 0x131;
    const EV_ABS: u16 = 0x03;
    const ABS_X: u16 = 0x00;

    /// Word 4 of a key bitmap covers codes 256 to 319. These lines are the
    /// shape sysfs prints: hexadecimal words, most significant first.
    // Measured on the Raspberry Pi 5 target, 2026-08-19, by reading
    // /sys/class/input/event*/device/capabilities/key.
    const PS3_BUTTONS_KEYS: &str = "f00000000 0 0 0 7fdb000000000000 0 0 0 0";
    const PAD_WITHOUT_RESERVED_BUTTONS_KEYS: &str = "ff000000000000 0 0 0 0";
    const POWER_BUTTON_KEYS: &str = "10000000000000 0";
    const HDMI_NODE_KEYS: &str = "ffffc000000000 3ff 0 400000320fc200 4083";
    const PS3_MOTION_KEYS: &str = "0";

    fn record(kind: u16, code: u16, value: i32) -> Vec<u8> {
        let mut bytes = vec![0_u8; EVENT_RECORD_BYTES - 8];
        bytes.extend_from_slice(&kind.to_ne_bytes());
        bytes.extend_from_slice(&code.to_ne_bytes());
        bytes.extend_from_slice(&value.to_ne_bytes());
        bytes
    }

    fn key(code: u16, pressed: bool) -> EvdevEvent {
        EvdevEvent {
            kind: EV_KEY,
            code,
            value: i32::from(pressed),
        }
    }

    /// Synthetic controller set standing in for `/dev/input` on any host.
    #[derive(Debug, Default)]
    struct FakeSource {
        nodes: Vec<String>,
        pending: Vec<NodeEvent>,
    }

    impl FakeSource {
        fn with_nodes(nodes: &[&str]) -> Self {
            Self {
                nodes: nodes.iter().map(|node| (*node).to_owned()).collect(),
                pending: Vec::new(),
            }
        }

        fn queue(&mut self, node: &str, event: EvdevEvent) {
            self.pending.push(NodeEvent {
                node: node.to_owned(),
                event,
            });
        }
    }

    impl ReservedInputSource for FakeSource {
        fn rescan(&mut self) -> io::Result<Vec<String>> {
            Ok(self.nodes.clone())
        }

        fn read_pending(&mut self) -> io::Result<Vec<NodeEvent>> {
            Ok(std::mem::take(&mut self.pending))
        }
    }

    fn watch_with(nodes: &[&str]) -> ReservedInputWatch<FakeSource> {
        ReservedInputWatch::start(FakeSource::with_nodes(nodes), 0).expect("observable controller")
    }

    #[test]
    fn decodes_whole_and_split_event_records() {
        let mut decoder = EvdevDecoder::new();
        let mut stream = record(EV_KEY, BTN_SELECT, 1);
        stream.extend(record(EV_KEY, BTN_START, 1));
        stream.extend(record(EV_KEY, BTN_SELECT, 0));

        assert_eq!(
            decoder.push(&stream[..EVENT_RECORD_BYTES]),
            vec![key(BTN_SELECT, true)]
        );
        let split = EVENT_RECORD_BYTES + 5;
        assert!(decoder.push(&stream[EVENT_RECORD_BYTES..split]).is_empty());
        assert_eq!(decoder.buffered(), 5);
        assert_eq!(
            decoder.push(&stream[split..]),
            vec![key(BTN_START, true), key(BTN_SELECT, false)]
        );
        assert_eq!(decoder.buffered(), 0);
    }

    #[test]
    fn parses_a_capability_bitmap_by_word_position() {
        let bitmap = CapabilityBitmap::parse(PS3_BUTTONS_KEYS).expect("valid bitmap");
        assert!(bitmap.contains(BTN_SELECT));
        assert!(bitmap.contains(BTN_START));
        assert!(bitmap.contains(BTN_MODE));
        assert!(!bitmap.contains(0));
        assert_eq!(CapabilityBitmap::parse(""), None);
        assert_eq!(CapabilityBitmap::parse("nothex"), None);
        assert_eq!(CapabilityBitmap::parse("00000000000000000"), None);
    }

    #[test]
    fn admits_controllers_and_ignores_every_other_input_node() {
        let gamepad = CapabilityBitmap::parse(PS3_BUTTONS_KEYS).expect("gamepad");
        assert!(is_controller(&gamepad));
        assert!(observable_reserved_controller(&gamepad));

        // A power button reports code 116, far below the button blocks.
        let power = CapabilityBitmap::parse(POWER_BUTTON_KEYS).expect("power");
        assert!(!is_controller(&power));
        assert!(power.contains(116));

        // The pad's separate motion-sensor node reports no keys at all.
        assert!(!is_controller(
            &CapabilityBitmap::parse(PS3_MOTION_KEYS).expect("motion")
        ));

        // An HDMI node does declare codes inside the gamepad block, so the
        // button test admits it. The gesture test is what excludes it, and the
        // open path gates on that. Pinning both halves keeps a later
        // simplification of is_controller from opening these nodes.
        let hdmi = CapabilityBitmap::parse(HDMI_NODE_KEYS).expect("hdmi");
        assert!(is_controller(&hdmi));
        assert!(!produces_reserved_gesture(&hdmi));
        assert!(!observable_reserved_controller(&hdmi));
    }

    #[test]
    fn a_controller_without_the_reserved_buttons_is_not_observable() {
        let pad = CapabilityBitmap::parse(PAD_WITHOUT_RESERVED_BUTTONS_KEYS).expect("pad");
        assert!(is_controller(&pad));
        assert!(pad.contains(BTN_SOUTH));
        assert!(!observable_reserved_controller(&pad));
    }

    #[test]
    fn recognises_the_reserved_gesture_after_a_continuous_hold() {
        let mut watch = watch_with(&["event6"]);
        watch.source.queue("event6", key(BTN_SELECT, true));
        watch.source.queue("event6", key(BTN_START, true));
        assert!(watch.poll(0).is_none());
        assert!(watch.poll(RESERVED_GESTURE_HOLD_MILLIS - 1).is_none());

        let routed = watch.poll(RESERVED_GESTURE_HOLD_MILLIS).expect("reserved");
        assert_eq!(routed.target, InputTarget::Console);
        assert_eq!(routed.input.action, ShellAction::Home);
        assert!(routed.input.pressed);
        assert_eq!(routed.input.device_id, "controller-0001");
    }

    #[test]
    fn a_dedicated_home_button_produces_the_same_reserved_gesture() {
        let mut watch = watch_with(&["event6"]);
        watch.source.queue("event6", key(BTN_MODE, true));
        assert!(watch.poll(0).is_none());

        let routed = watch.poll(RESERVED_GESTURE_HOLD_MILLIS).expect("reserved");
        assert_eq!(routed.target, InputTarget::Console);
        assert_eq!(routed.input.action, ShellAction::Home);
    }

    #[test]
    fn ordinary_gameplay_input_is_never_a_reserved_gesture() {
        let mut watch = watch_with(&["event6"]);
        for held in [BTN_SOUTH, BTN_EAST] {
            watch.source.queue("event6", key(held, true));
        }
        watch.source.queue(
            "event6",
            EvdevEvent {
                kind: EV_ABS,
                code: ABS_X,
                value: 32_767,
            },
        );
        for now in [0, 500, 5_000, 60_000] {
            assert!(watch.poll(now).is_none(), "gameplay input fired at {now}");
        }

        // Select and Start pressed in turn, never overlapping, is also play.
        watch.source.queue("event6", key(BTN_SELECT, true));
        assert!(watch.poll(60_100).is_none());
        watch.source.queue("event6", key(BTN_SELECT, false));
        watch.source.queue("event6", key(BTN_START, true));
        assert!(watch.poll(60_200).is_none());
        watch.source.queue("event6", key(BTN_START, false));
        assert!(watch.poll(90_000).is_none());
    }

    #[test]
    fn a_partial_combination_released_before_the_hold_does_not_fire() {
        let mut watch = watch_with(&["event6"]);
        watch.source.queue("event6", key(BTN_SELECT, true));
        watch.source.queue("event6", key(BTN_START, true));
        assert!(watch.poll(0).is_none());

        watch.source.queue("event6", key(BTN_START, false));
        assert!(watch.poll(RESERVED_GESTURE_HOLD_MILLIS - 100).is_none());
        assert!(watch.poll(RESERVED_GESTURE_HOLD_MILLIS + 5_000).is_none());
        // Holding the remaining button alone never completes the gesture.
        assert!(watch.poll(120_000).is_none());
    }

    #[test]
    fn a_fired_gesture_rearms_only_after_release() {
        let mut recognizer = ReservedGestureRecognizer::new(RESERVED_GESTURE_HOLD_MILLIS);
        assert!(
            recognizer
                .observe("event6", key(BTN_MODE, true), 0)
                .is_none()
        );
        assert_eq!(recognizer.elapsed(RESERVED_GESTURE_HOLD_MILLIS).len(), 1);
        assert!(recognizer.elapsed(10_000).is_empty());

        let release = recognizer
            .observe("event6", key(BTN_MODE, false), 10_100)
            .expect("release");
        assert!(!release.pressed);
        assert!(
            recognizer
                .observe("event6", key(BTN_MODE, true), 10_200)
                .is_none()
        );
        assert_eq!(
            recognizer
                .elapsed(10_200 + RESERVED_GESTURE_HOLD_MILLIS)
                .len(),
            1
        );
    }

    #[test]
    fn a_controller_connected_during_a_session_is_picked_up() {
        let mut watch = watch_with(&["event6"]);
        assert_eq!(watch.observed_controllers(), 1);

        watch.source.nodes.push("event7".to_owned());
        assert!(watch.poll(CONTROLLER_RESCAN_INTERVAL_MILLIS).is_none());
        assert_eq!(watch.observed_controllers(), 2);

        watch.source.queue("event7", key(BTN_SELECT, true));
        watch.source.queue("event7", key(BTN_START, true));
        let start = CONTROLLER_RESCAN_INTERVAL_MILLIS;
        assert!(watch.poll(start).is_none());

        let routed = watch
            .poll(start + RESERVED_GESTURE_HOLD_MILLIS)
            .expect("reserved");
        assert_eq!(routed.input.device_id, "controller-0002");
    }

    #[test]
    fn a_controller_removed_during_a_session_is_dropped_with_its_held_state() {
        let mut watch = watch_with(&["event6", "event7"]);
        assert_eq!(watch.observed_controllers(), 2);
        watch.source.queue("event6", key(BTN_MODE, true));
        assert!(watch.poll(0).is_none());
        assert!(watch.poll(RESERVED_GESTURE_HOLD_MILLIS).is_some());

        watch.source.nodes.retain(|node| node != "event6");
        assert!(
            watch
                .poll(RESERVED_GESTURE_HOLD_MILLIS + CONTROLLER_RESCAN_INTERVAL_MILLIS)
                .is_none()
        );
        assert_eq!(watch.observed_controllers(), 1);

        // The vanished controller's held reserved action was released, so the
        // surviving controller still produces a fresh reserved gesture.
        watch.source.queue("event7", key(BTN_MODE, true));
        assert!(watch.poll(20_000).is_none());
        let routed = watch
            .poll(20_000 + RESERVED_GESTURE_HOLD_MILLIS)
            .expect("reserved");
        assert_eq!(routed.input.device_id, "controller-0002");
    }

    #[test]
    fn a_launch_is_refused_when_no_controller_is_observable() {
        let error = ReservedInputWatch::start(FakeSource::default(), 0).expect_err("no controller");
        assert!(matches!(error, ReservedInputError::NoObservableController));
    }

    #[test]
    fn a_launch_is_refused_when_input_devices_cannot_be_read() {
        #[derive(Debug)]
        struct BrokenSource;

        impl ReservedInputSource for BrokenSource {
            fn rescan(&mut self) -> io::Result<Vec<String>> {
                Err(io::Error::from(io::ErrorKind::PermissionDenied))
            }

            fn read_pending(&mut self) -> io::Result<Vec<NodeEvent>> {
                Ok(Vec::new())
            }
        }

        let error = ReservedInputWatch::start(BrokenSource, 0).expect_err("unreadable devices");
        assert!(matches!(error, ReservedInputError::Scan(_)));
    }

    #[cfg(not(target_os = "linux"))]
    #[test]
    fn a_platform_without_event_devices_refuses_to_start() {
        let error = super::start(0).expect_err("no platform backend");
        assert!(matches!(error, ReservedInputError::Unsupported));
    }
}
