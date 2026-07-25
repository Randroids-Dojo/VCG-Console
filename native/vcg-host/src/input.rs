//! Canonical console input independent of any controller library.

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

pub const MAX_CONNECTED_CONTROLLERS: usize = 16;

/// A shell action that privileged input adapters can publish.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ShellAction {
    Up,
    Down,
    Left,
    Right,
    Select,
    Back,
    Home,
    Pause,
}

/// One semantic action from a session-local input device.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InputEvent {
    pub device_id: String,
    pub action: ShellAction,
    pub pressed: bool,
}

/// Mapping confidence reported by a privileged native adapter.
///
/// Ambiguous devices remain visible for controller-accessible mapping UX but
/// cannot emit semantic shell actions until the adapter has an approved
/// mapping.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ControllerMapping {
    Standard,
    Ambiguous,
}

/// One complete native-adapter observation for a connected controller.
///
/// `backend_instance_id` and `connection_epoch` are volatile adapter metadata.
/// They are never returned to the launcher or used as player/profile identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ControllerSnapshot {
    pub backend_instance_id: u32,
    pub connection_epoch: u64,
    pub mapping: ControllerMapping,
    pub pressed_actions: Vec<ShellAction>,
}

/// Press threshold for a standard primary direction axis.
pub const STANDARD_AXIS_PRESS_THRESHOLD: f32 = 0.55;
/// Release threshold for a previously pressed standard primary direction
/// axis.
pub const STANDARD_AXIS_RELEASE_THRESHOLD: f32 = 0.35;

/// Closed standard-gamepad buttons that map to canonical shell actions.
///
/// This is deliberately not a complete gameplay input vocabulary. A future
/// SDL3 producer must identify a controller as standard before using these
/// names, and a separate privileged runtime path must decide which non-shell
/// gameplay controls a child may receive.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum StandardGamepadButton {
    South,
    East,
    Start,
    Guide,
    DpadUp,
    DpadDown,
    DpadLeft,
    DpadRight,
}

/// One complete raw observation from a future native standard-gamepad
/// producer.
///
/// Axis values use the conventional `[-1.0, 1.0]` range. Ambiguous mappings
/// must not supply standardized buttons or non-neutral axes.
#[derive(Clone, Debug, PartialEq)]
pub struct StandardGamepadObservation {
    pub backend_instance_id: u32,
    pub connection_epoch: u64,
    pub mapping: ControllerMapping,
    pub pressed_buttons: Vec<StandardGamepadButton>,
    pub primary_x: f32,
    pub primary_y: f32,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
enum AxisDirection {
    Negative,
    #[default]
    Neutral,
    Positive,
}

#[derive(Clone, Copy, Debug, Default)]
struct AxisLatch {
    horizontal: AxisDirection,
    vertical: AxisDirection,
}

#[derive(Clone)]
struct ValidatedStandardObservation {
    connection_epoch: u64,
    mapping: ControllerMapping,
    pressed_buttons: BTreeSet<StandardGamepadButton>,
    primary_x: f32,
    primary_y: f32,
}

/// Stateful standard-gamepad conversion into complete semantic snapshots.
///
/// The mapper validates an entire poll before changing its hysteresis state.
/// It emits only complete [`ControllerSnapshot`] values; edge assignment,
/// opaque device IDs, disconnect synthesis, and replacement ordering remain
/// the responsibility of [`ControllerRegistry`].
#[derive(Debug, Default)]
pub struct StandardShellControllerMapper {
    axis_latches: BTreeMap<(u32, u64), AxisLatch>,
}

impl StandardShellControllerMapper {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Maps one complete standard-gamepad observation.
    ///
    /// # Errors
    ///
    /// Rejects excessive or duplicate devices, zero connection epochs,
    /// duplicate buttons, non-finite or out-of-range axes, and standardized
    /// signals from an ambiguous mapping. Rejection leaves all hysteresis
    /// state unchanged.
    pub fn map(
        &mut self,
        observations: &[StandardGamepadObservation],
    ) -> Result<Vec<ControllerSnapshot>, StandardShellMappingError> {
        let validated = validate_standard_observations(observations)?;
        let mut next_latches = BTreeMap::new();
        let mut snapshots = Vec::with_capacity(validated.len());

        for (backend_instance_id, observation) in validated {
            if observation.mapping == ControllerMapping::Ambiguous {
                snapshots.push(ControllerSnapshot {
                    backend_instance_id,
                    connection_epoch: observation.connection_epoch,
                    mapping: observation.mapping,
                    pressed_actions: Vec::new(),
                });
                continue;
            }

            let key = (backend_instance_id, observation.connection_epoch);
            let prior = self.axis_latches.get(&key).copied().unwrap_or_default();
            let latch = AxisLatch {
                horizontal: axis_direction(observation.primary_x, prior.horizontal),
                vertical: axis_direction(observation.primary_y, prior.vertical),
            };
            let mut actions = observation
                .pressed_buttons
                .iter()
                .copied()
                .map(button_action)
                .collect::<BTreeSet<_>>();
            for (active, action) in [
                (latch.vertical == AxisDirection::Negative, ShellAction::Up),
                (latch.vertical == AxisDirection::Positive, ShellAction::Down),
                (
                    latch.horizontal == AxisDirection::Negative,
                    ShellAction::Left,
                ),
                (
                    latch.horizontal == AxisDirection::Positive,
                    ShellAction::Right,
                ),
            ] {
                if active {
                    actions.insert(action);
                }
            }
            next_latches.insert(key, latch);
            snapshots.push(ControllerSnapshot {
                backend_instance_id,
                connection_epoch: observation.connection_epoch,
                mapping: observation.mapping,
                pressed_actions: actions.into_iter().collect(),
            });
        }

        self.axis_latches = next_latches;
        Ok(snapshots)
    }

    /// Clears every axis latch after adapter shutdown, sleep, or a declared
    /// backend fault.
    pub fn reset(&mut self) {
        self.axis_latches.clear();
    }
}

fn validate_standard_observations(
    observations: &[StandardGamepadObservation],
) -> Result<BTreeMap<u32, ValidatedStandardObservation>, StandardShellMappingError> {
    if observations.len() > MAX_CONNECTED_CONTROLLERS {
        return Err(StandardShellMappingError::TooManyControllers(
            observations.len(),
        ));
    }
    let mut validated = BTreeMap::new();
    for observation in observations {
        if observation.connection_epoch == 0 {
            return Err(StandardShellMappingError::InvalidConnectionEpoch(
                observation.backend_instance_id,
            ));
        }
        if !valid_standard_axis(observation.primary_x)
            || !valid_standard_axis(observation.primary_y)
        {
            return Err(StandardShellMappingError::InvalidAxis(
                observation.backend_instance_id,
            ));
        }
        let pressed_buttons = observation
            .pressed_buttons
            .iter()
            .copied()
            .collect::<BTreeSet<_>>();
        if pressed_buttons.len() != observation.pressed_buttons.len() {
            return Err(StandardShellMappingError::DuplicateButton(
                observation.backend_instance_id,
            ));
        }
        if observation.mapping == ControllerMapping::Ambiguous
            && (!pressed_buttons.is_empty()
                || observation.primary_x != 0.0
                || observation.primary_y != 0.0)
        {
            return Err(StandardShellMappingError::AmbiguousMappingSignal(
                observation.backend_instance_id,
            ));
        }
        if validated
            .insert(
                observation.backend_instance_id,
                ValidatedStandardObservation {
                    connection_epoch: observation.connection_epoch,
                    mapping: observation.mapping,
                    pressed_buttons,
                    primary_x: observation.primary_x,
                    primary_y: observation.primary_y,
                },
            )
            .is_some()
        {
            return Err(StandardShellMappingError::DuplicateController(
                observation.backend_instance_id,
            ));
        }
    }
    Ok(validated)
}

fn valid_standard_axis(value: f32) -> bool {
    value.is_finite() && (-1.0..=1.0).contains(&value)
}

fn axis_direction(value: f32, previous: AxisDirection) -> AxisDirection {
    if value <= -STANDARD_AXIS_PRESS_THRESHOLD
        || (previous == AxisDirection::Negative && value <= -STANDARD_AXIS_RELEASE_THRESHOLD)
    {
        AxisDirection::Negative
    } else if value >= STANDARD_AXIS_PRESS_THRESHOLD
        || (previous == AxisDirection::Positive && value >= STANDARD_AXIS_RELEASE_THRESHOLD)
    {
        AxisDirection::Positive
    } else {
        AxisDirection::Neutral
    }
}

const fn button_action(button: StandardGamepadButton) -> ShellAction {
    match button {
        StandardGamepadButton::South => ShellAction::Select,
        StandardGamepadButton::East => ShellAction::Back,
        StandardGamepadButton::Start => ShellAction::Pause,
        StandardGamepadButton::Guide => ShellAction::Home,
        StandardGamepadButton::DpadUp => ShellAction::Up,
        StandardGamepadButton::DpadDown => ShellAction::Down,
        StandardGamepadButton::DpadLeft => ShellAction::Left,
        StandardGamepadButton::DpadRight => ShellAction::Right,
    }
}

/// Invalid or ambiguous standard-gamepad observation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StandardShellMappingError {
    TooManyControllers(usize),
    DuplicateController(u32),
    InvalidConnectionEpoch(u32),
    DuplicateButton(u32),
    InvalidAxis(u32),
    AmbiguousMappingSignal(u32),
}

impl fmt::Display for StandardShellMappingError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooManyControllers(count) => write!(
                formatter,
                "standard controller observation count {count} exceeds {MAX_CONNECTED_CONTROLLERS}"
            ),
            Self::DuplicateController(instance_id) => write!(
                formatter,
                "standard controller backend instance {instance_id} is duplicated"
            ),
            Self::InvalidConnectionEpoch(instance_id) => write!(
                formatter,
                "standard controller backend instance {instance_id} has an invalid connection epoch"
            ),
            Self::DuplicateButton(instance_id) => write!(
                formatter,
                "standard controller backend instance {instance_id} repeats a button"
            ),
            Self::InvalidAxis(instance_id) => write!(
                formatter,
                "standard controller backend instance {instance_id} has an invalid primary axis"
            ),
            Self::AmbiguousMappingSignal(instance_id) => write!(
                formatter,
                "ambiguous controller backend instance {instance_id} cannot supply standardized signals"
            ),
        }
    }
}

impl Error for StandardShellMappingError {}

/// Complete-observation source implemented by a future SDL3 adapter.
///
/// SDL handles, controller names, serials, paths, and binding-specific types
/// stay behind this boundary. The trusted host passes each successful poll to
/// [`ControllerRegistry::reconcile`].
pub trait ControllerSnapshotSource {
    /// Returns every controller currently observed by the adapter.
    ///
    /// # Errors
    ///
    /// Returns an adapter-specific error when the native input system cannot
    /// provide a complete observation. Callers must retain the prior registry
    /// state or explicitly invoke [`ControllerRegistry::disconnect_all`] after
    /// declaring the backend fault.
    fn poll_controllers(&mut self)
    -> Result<Vec<ControllerSnapshot>, Box<dyn Error + Send + Sync>>;
}

/// Connection lifecycle visible to trusted shell coordination.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ControllerConnectionState {
    Connected,
    Disconnected,
}

/// Path-free controller lifecycle metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ControllerConnectionEvent {
    pub device_id: String,
    pub state: ControllerConnectionState,
    pub mapping: ControllerMapping,
}

/// One deterministically ordered controller reconciliation event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ControllerEvent {
    Connection(ControllerConnectionEvent),
    Input(InputEvent),
}

#[derive(Clone, Debug)]
struct ConnectedController {
    device_id: String,
    connection_epoch: u64,
    mapping: ControllerMapping,
    pressed_actions: BTreeSet<ShellAction>,
}

/// Bounded, platform-neutral controller connection and edge state.
///
/// A future SDL3 adapter supplies complete snapshots. Reconciliation validates
/// the entire observation before changing state, assigns opaque session-local
/// IDs, orders replacements as disconnect then connect, and synthesizes
/// releases so a vanished controller cannot leave a privileged action held.
#[derive(Debug)]
pub struct ControllerRegistry {
    connected: BTreeMap<u32, ConnectedController>,
    next_device_ordinal: u64,
}

impl Default for ControllerRegistry {
    fn default() -> Self {
        Self {
            connected: BTreeMap::new(),
            next_device_ordinal: 1,
        }
    }
}

impl ControllerRegistry {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Reconciles one complete adapter observation.
    ///
    /// Existing connections retain their opaque ID only while backend instance,
    /// connection epoch, and mapping all agree. Reconnects and replacements
    /// receive a new ID and a fresh action-edge epoch.
    ///
    /// # Errors
    ///
    /// Rejects excessive or duplicate devices, a zero connection epoch,
    /// duplicate actions, semantic input from an ambiguous mapping, and opaque
    /// ID exhaustion. Any rejection leaves existing state unchanged.
    pub fn reconcile(
        &mut self,
        snapshots: &[ControllerSnapshot],
    ) -> Result<Vec<ControllerEvent>, ControllerRegistryError> {
        let observed = validate_snapshots(snapshots)?;
        let replacements = observed
            .iter()
            .filter(|(instance_id, snapshot)| {
                self.connected.get(instance_id).is_none_or(|connected| {
                    connected.connection_epoch != snapshot.connection_epoch
                        || connected.mapping != snapshot.mapping
                })
            })
            .count();
        let replacement_count =
            u64::try_from(replacements).map_err(|_| ControllerRegistryError::DeviceIdExhausted)?;
        self.next_device_ordinal
            .checked_add(replacement_count)
            .ok_or(ControllerRegistryError::DeviceIdExhausted)?;

        let mut events = Vec::new();
        for (instance_id, connected) in &self.connected {
            let retained = observed.get(instance_id).is_some_and(|snapshot| {
                connected.connection_epoch == snapshot.connection_epoch
                    && connected.mapping == snapshot.mapping
            });
            if !retained {
                append_disconnection(&mut events, connected);
            }
        }

        let mut next_connected = BTreeMap::new();
        let mut next_device_ordinal = self.next_device_ordinal;
        for (instance_id, snapshot) in observed {
            let retained = self.connected.get(&instance_id).filter(|connected| {
                connected.connection_epoch == snapshot.connection_epoch
                    && connected.mapping == snapshot.mapping
            });
            let connected = if let Some(previous) = retained {
                append_action_changes(
                    &mut events,
                    &previous.device_id,
                    &previous.pressed_actions,
                    &snapshot.pressed_actions,
                );
                ConnectedController {
                    device_id: previous.device_id.clone(),
                    connection_epoch: previous.connection_epoch,
                    mapping: previous.mapping,
                    pressed_actions: snapshot.pressed_actions,
                }
            } else {
                let device_id = format!("controller-{next_device_ordinal:04}");
                next_device_ordinal = next_device_ordinal
                    .checked_add(1)
                    .ok_or(ControllerRegistryError::DeviceIdExhausted)?;
                events.push(ControllerEvent::Connection(ControllerConnectionEvent {
                    device_id: device_id.clone(),
                    state: ControllerConnectionState::Connected,
                    mapping: snapshot.mapping,
                }));
                append_action_changes(
                    &mut events,
                    &device_id,
                    &BTreeSet::new(),
                    &snapshot.pressed_actions,
                );
                ConnectedController {
                    device_id,
                    connection_epoch: snapshot.connection_epoch,
                    mapping: snapshot.mapping,
                    pressed_actions: snapshot.pressed_actions,
                }
            };
            next_connected.insert(instance_id, connected);
        }

        self.connected = next_connected;
        self.next_device_ordinal = next_device_ordinal;
        Ok(events)
    }

    /// Ends every current connection and clears held actions.
    ///
    /// This is suitable for adapter shutdown, sleep, or a backend fault. A
    /// later observation creates new opaque IDs and fresh press edges.
    pub fn disconnect_all(&mut self) -> Vec<ControllerEvent> {
        let mut events = Vec::new();
        for connected in self.connected.values() {
            append_disconnection(&mut events, connected);
        }
        self.connected.clear();
        events
    }

    #[must_use]
    pub fn connected_count(&self) -> usize {
        self.connected.len()
    }
}

#[derive(Clone)]
struct ValidatedSnapshot {
    connection_epoch: u64,
    mapping: ControllerMapping,
    pressed_actions: BTreeSet<ShellAction>,
}

fn validate_snapshots(
    snapshots: &[ControllerSnapshot],
) -> Result<BTreeMap<u32, ValidatedSnapshot>, ControllerRegistryError> {
    if snapshots.len() > MAX_CONNECTED_CONTROLLERS {
        return Err(ControllerRegistryError::TooManyControllers(snapshots.len()));
    }
    let mut observed = BTreeMap::new();
    for snapshot in snapshots {
        if snapshot.connection_epoch == 0 {
            return Err(ControllerRegistryError::InvalidConnectionEpoch(
                snapshot.backend_instance_id,
            ));
        }
        let pressed_actions = snapshot
            .pressed_actions
            .iter()
            .copied()
            .collect::<BTreeSet<_>>();
        if pressed_actions.len() != snapshot.pressed_actions.len() {
            return Err(ControllerRegistryError::DuplicateAction(
                snapshot.backend_instance_id,
            ));
        }
        if snapshot.mapping == ControllerMapping::Ambiguous && !pressed_actions.is_empty() {
            return Err(ControllerRegistryError::AmbiguousMappingInput(
                snapshot.backend_instance_id,
            ));
        }
        if observed
            .insert(
                snapshot.backend_instance_id,
                ValidatedSnapshot {
                    connection_epoch: snapshot.connection_epoch,
                    mapping: snapshot.mapping,
                    pressed_actions,
                },
            )
            .is_some()
        {
            return Err(ControllerRegistryError::DuplicateController(
                snapshot.backend_instance_id,
            ));
        }
    }
    Ok(observed)
}

fn append_disconnection(events: &mut Vec<ControllerEvent>, connected: &ConnectedController) {
    append_action_changes(
        events,
        &connected.device_id,
        &connected.pressed_actions,
        &BTreeSet::new(),
    );
    events.push(ControllerEvent::Connection(ControllerConnectionEvent {
        device_id: connected.device_id.clone(),
        state: ControllerConnectionState::Disconnected,
        mapping: connected.mapping,
    }));
}

fn append_action_changes(
    events: &mut Vec<ControllerEvent>,
    device_id: &str,
    previous: &BTreeSet<ShellAction>,
    current: &BTreeSet<ShellAction>,
) {
    for action in previous.difference(current) {
        events.push(ControllerEvent::Input(InputEvent {
            device_id: device_id.to_owned(),
            action: *action,
            pressed: false,
        }));
    }
    for action in current.difference(previous) {
        events.push(ControllerEvent::Input(InputEvent {
            device_id: device_id.to_owned(),
            action: *action,
            pressed: true,
        }));
    }
}

/// Invalid or ambiguous native controller observation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ControllerRegistryError {
    TooManyControllers(usize),
    DuplicateController(u32),
    InvalidConnectionEpoch(u32),
    DuplicateAction(u32),
    AmbiguousMappingInput(u32),
    DeviceIdExhausted,
}

impl fmt::Display for ControllerRegistryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooManyControllers(count) => write!(
                formatter,
                "controller observation count {count} exceeds {MAX_CONNECTED_CONTROLLERS}"
            ),
            Self::DuplicateController(instance_id) => {
                write!(
                    formatter,
                    "controller backend instance {instance_id} is duplicated"
                )
            }
            Self::InvalidConnectionEpoch(instance_id) => write!(
                formatter,
                "controller backend instance {instance_id} has an invalid connection epoch"
            ),
            Self::DuplicateAction(instance_id) => write!(
                formatter,
                "controller backend instance {instance_id} repeats a semantic action"
            ),
            Self::AmbiguousMappingInput(instance_id) => write!(
                formatter,
                "ambiguous controller backend instance {instance_id} cannot emit semantic input"
            ),
            Self::DeviceIdExhausted => {
                formatter.write_str("controller session-local device IDs are exhausted")
            }
        }
    }
}

impl Error for ControllerRegistryError {}

/// Console surface that currently owns ordinary, non-reserved input.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InputContext {
    Launcher,
    Game,
    ConsoleOverlay,
}

/// Trusted recipient selected by [`ReservedInputRouter`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InputTarget {
    Console,
    Game,
}

/// One canonical event after privileged target selection.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoutedInputEvent {
    pub target: InputTarget,
    pub input: InputEvent,
}

/// Maximum held-edge state accepted from trusted semantic input producers.
///
/// The controller registry admits at most sixteen controllers and each can
/// hold at most the eight distinct [`ShellAction`] values.
pub const MAX_ROUTED_HELD_ACTIONS: usize = MAX_CONNECTED_CONTROLLERS * 8;
pub const MAX_INPUT_DEVICE_ID_BYTES: usize = 64;

/// Privileged input routing that never delivers console-owned actions to a
/// game and never carries a held edge across a surface transition.
///
/// This is platform-independent policy for a future SDL/compositor adapter.
/// It is not evidence that a browser, native game, or target compositor can
/// already be prevented from reading the underlying physical input.
#[derive(Debug)]
pub struct ReservedInputRouter {
    context: InputContext,
    held_targets: BTreeMap<(String, ShellAction), InputTarget>,
}

impl ReservedInputRouter {
    #[must_use]
    pub fn new(context: InputContext) -> Self {
        Self {
            context,
            held_targets: BTreeMap::new(),
        }
    }

    #[must_use]
    pub fn context(&self) -> InputContext {
        self.context
    }

    #[must_use]
    pub fn held_count(&self) -> usize {
        self.held_targets.len()
    }

    /// Routes one edge. Duplicate presses and releases without a matching
    /// routed press are ignored so a surface cannot receive an orphan edge.
    ///
    /// Home, Back, and Pause are always console-owned. All other actions follow
    /// the current surface. A release returns to the target that received its
    /// press, even if a caller has not yet declared a context transition.
    ///
    /// # Errors
    ///
    /// Rejects a new distinct press when bounded held-edge state is full. The
    /// existing state remains unchanged.
    pub fn route(
        &mut self,
        input: InputEvent,
    ) -> Result<Option<RoutedInputEvent>, ReservedInputRouterError> {
        if !valid_input_device_id(&input.device_id) {
            return Err(ReservedInputRouterError::InvalidDeviceId);
        }
        let key = (input.device_id.clone(), input.action);
        if input.pressed {
            if self.held_targets.contains_key(&key) {
                return Ok(None);
            }
            if self.held_targets.len() >= MAX_ROUTED_HELD_ACTIONS {
                return Err(ReservedInputRouterError::HeldActionCapacityExceeded);
            }
            let target = self.target_for_press(input.action);
            self.held_targets.insert(key, target);
            return Ok(Some(RoutedInputEvent { target, input }));
        }

        let Some(target) = self.held_targets.remove(&key) else {
            return Ok(None);
        };
        Ok(Some(RoutedInputEvent { target, input }))
    }

    /// Changes surface ownership and releases every held action to its prior
    /// recipient before accepting input in the new context.
    ///
    /// Physical buttons that remain held must release and be pressed again;
    /// their later unmatched release is ignored. This prevents navigation,
    /// selection, or movement from leaking through an overlay transition.
    pub fn set_context(&mut self, context: InputContext) -> Vec<RoutedInputEvent> {
        if context == self.context {
            return Vec::new();
        }
        let releases = self.release_all();
        self.context = context;
        releases
    }

    /// Clears held state for shutdown, backend failure, or an authority reset.
    pub fn release_all(&mut self) -> Vec<RoutedInputEvent> {
        let held_targets = std::mem::take(&mut self.held_targets);
        held_targets
            .into_iter()
            .map(|((device_id, action), target)| RoutedInputEvent {
                target,
                input: InputEvent {
                    device_id,
                    action,
                    pressed: false,
                },
            })
            .collect()
    }

    fn target_for_press(&self, action: ShellAction) -> InputTarget {
        if matches!(
            action,
            ShellAction::Home | ShellAction::Back | ShellAction::Pause
        ) || self.context != InputContext::Game
        {
            InputTarget::Console
        } else {
            InputTarget::Game
        }
    }
}

fn valid_input_device_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_INPUT_DEVICE_ID_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReservedInputRouterError {
    InvalidDeviceId,
    HeldActionCapacityExceeded,
}

impl fmt::Display for ReservedInputRouterError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDeviceId => write!(
                formatter,
                "input device ID must be 1 to {MAX_INPUT_DEVICE_ID_BYTES} ASCII letters, digits, hyphens, or underscores"
            ),
            Self::HeldActionCapacityExceeded => write!(
                formatter,
                "routed held-action count exceeds {MAX_ROUTED_HELD_ACTIONS}"
            ),
        }
    }
}

impl Error for ReservedInputRouterError {}

/// Source of already canonical privileged shell input.
///
/// Native controller discovery should use [`ControllerSnapshotSource`] plus
/// [`ControllerRegistry`]. This narrower trait remains suitable for another
/// trusted producer that already owns semantic edge/release behavior.
pub trait InputSource {
    /// Returns all currently pending semantic input events.
    ///
    /// # Errors
    ///
    /// Returns an adapter-specific error when the underlying input system cannot be polled.
    fn poll(&mut self) -> Result<Vec<InputEvent>, Box<dyn Error + Send + Sync>>;
}

#[cfg(test)]
mod tests {
    use super::{
        ControllerConnectionEvent, ControllerConnectionState, ControllerEvent, ControllerMapping,
        ControllerRegistry, ControllerRegistryError, ControllerSnapshot, InputContext, InputEvent,
        InputTarget, MAX_CONNECTED_CONTROLLERS, MAX_INPUT_DEVICE_ID_BYTES, MAX_ROUTED_HELD_ACTIONS,
        ReservedInputRouter, ReservedInputRouterError, RoutedInputEvent, ShellAction,
        StandardGamepadButton, StandardGamepadObservation, StandardShellControllerMapper,
        StandardShellMappingError,
    };

    fn snapshot(
        backend_instance_id: u32,
        connection_epoch: u64,
        mapping: ControllerMapping,
        pressed_actions: &[ShellAction],
    ) -> ControllerSnapshot {
        ControllerSnapshot {
            backend_instance_id,
            connection_epoch,
            mapping,
            pressed_actions: pressed_actions.to_vec(),
        }
    }

    fn connected(device_id: &str, mapping: ControllerMapping) -> ControllerEvent {
        ControllerEvent::Connection(ControllerConnectionEvent {
            device_id: device_id.to_owned(),
            state: ControllerConnectionState::Connected,
            mapping,
        })
    }

    fn disconnected(device_id: &str, mapping: ControllerMapping) -> ControllerEvent {
        ControllerEvent::Connection(ControllerConnectionEvent {
            device_id: device_id.to_owned(),
            state: ControllerConnectionState::Disconnected,
            mapping,
        })
    }

    fn input(device_id: &str, action: ShellAction, pressed: bool) -> ControllerEvent {
        ControllerEvent::Input(InputEvent {
            device_id: device_id.to_owned(),
            action,
            pressed,
        })
    }

    fn routed(
        device_id: &str,
        action: ShellAction,
        pressed: bool,
        target: InputTarget,
    ) -> RoutedInputEvent {
        RoutedInputEvent {
            target,
            input: InputEvent {
                device_id: device_id.to_owned(),
                action,
                pressed,
            },
        }
    }

    fn standard_observation(
        backend_instance_id: u32,
        connection_epoch: u64,
        mapping: ControllerMapping,
        pressed_buttons: &[StandardGamepadButton],
        primary_x: f32,
        primary_y: f32,
    ) -> StandardGamepadObservation {
        StandardGamepadObservation {
            backend_instance_id,
            connection_epoch,
            mapping,
            pressed_buttons: pressed_buttons.to_vec(),
            primary_x,
            primary_y,
        }
    }

    fn mapped_actions(
        mapper: &mut StandardShellControllerMapper,
        observation: StandardGamepadObservation,
    ) -> Vec<ShellAction> {
        mapper
            .map(&[observation])
            .expect("standard observation maps")
            .into_iter()
            .next()
            .expect("one snapshot")
            .pressed_actions
    }

    #[test]
    fn standard_shell_mapping_is_closed_complete_and_deterministic() {
        let mut mapper = StandardShellControllerMapper::new();
        let observations = [
            standard_observation(
                9,
                1,
                ControllerMapping::Standard,
                &[
                    StandardGamepadButton::Start,
                    StandardGamepadButton::DpadRight,
                    StandardGamepadButton::South,
                ],
                -0.8,
                -0.8,
            ),
            standard_observation(
                2,
                4,
                ControllerMapping::Standard,
                &[
                    StandardGamepadButton::Guide,
                    StandardGamepadButton::East,
                    StandardGamepadButton::DpadDown,
                    StandardGamepadButton::DpadLeft,
                ],
                0.8,
                0.0,
            ),
        ];
        let snapshots = mapper.map(&observations).expect("complete poll maps");
        assert_eq!(
            snapshots,
            [
                snapshot(
                    2,
                    4,
                    ControllerMapping::Standard,
                    &[
                        ShellAction::Down,
                        ShellAction::Left,
                        ShellAction::Right,
                        ShellAction::Back,
                        ShellAction::Home,
                    ],
                ),
                snapshot(
                    9,
                    1,
                    ControllerMapping::Standard,
                    &[
                        ShellAction::Up,
                        ShellAction::Left,
                        ShellAction::Right,
                        ShellAction::Select,
                        ShellAction::Pause,
                    ],
                ),
            ]
        );
    }

    #[test]
    fn standard_axes_use_hysteresis_and_fresh_connection_epochs() {
        let mut mapper = StandardShellControllerMapper::new();
        for (axis, expected) in [
            (0.56, vec![ShellAction::Right]),
            (0.40, vec![ShellAction::Right]),
            (0.34, Vec::new()),
            (-0.56, vec![ShellAction::Left]),
            (-0.40, vec![ShellAction::Left]),
            (-0.34, Vec::new()),
        ] {
            assert_eq!(
                mapped_actions(
                    &mut mapper,
                    standard_observation(3, 7, ControllerMapping::Standard, &[], axis, 0.0,),
                ),
                expected
            );
        }
        assert!(
            mapped_actions(
                &mut mapper,
                standard_observation(3, 8, ControllerMapping::Standard, &[], 0.40, 0.0),
            )
            .is_empty()
        );

        let _ = mapped_actions(
            &mut mapper,
            standard_observation(3, 8, ControllerMapping::Standard, &[], 0.70, 0.0),
        );
        mapper.reset();
        assert!(
            mapped_actions(
                &mut mapper,
                standard_observation(3, 8, ControllerMapping::Standard, &[], 0.40, 0.0),
            )
            .is_empty()
        );
    }

    #[test]
    fn invalid_standard_poll_leaves_hysteresis_transactionally_unchanged() {
        let mut mapper = StandardShellControllerMapper::new();
        assert_eq!(
            mapped_actions(
                &mut mapper,
                standard_observation(1, 1, ControllerMapping::Standard, &[], 0.70, 0.0),
            ),
            [ShellAction::Right]
        );

        let duplicate = standard_observation(
            1,
            1,
            ControllerMapping::Standard,
            &[StandardGamepadButton::South, StandardGamepadButton::South],
            0.0,
            0.0,
        );
        assert!(matches!(
            mapper.map(&[duplicate]),
            Err(StandardShellMappingError::DuplicateButton(1))
        ));
        assert_eq!(
            mapped_actions(
                &mut mapper,
                standard_observation(1, 1, ControllerMapping::Standard, &[], 0.40, 0.0),
            ),
            [ShellAction::Right]
        );

        assert!(
            mapper
                .map(&[])
                .expect("empty complete poll maps")
                .is_empty()
        );
        assert!(
            mapped_actions(
                &mut mapper,
                standard_observation(1, 1, ControllerMapping::Standard, &[], 0.40, 0.0),
            )
            .is_empty()
        );
    }

    #[test]
    fn ambiguous_standard_mapping_is_visible_but_has_no_signal_authority() {
        let mut mapper = StandardShellControllerMapper::new();
        assert_eq!(
            mapper
                .map(&[standard_observation(
                    5,
                    2,
                    ControllerMapping::Ambiguous,
                    &[],
                    0.0,
                    0.0,
                )])
                .expect("neutral ambiguous device remains visible"),
            [snapshot(5, 2, ControllerMapping::Ambiguous, &[])]
        );
        for invalid in [
            standard_observation(
                5,
                2,
                ControllerMapping::Ambiguous,
                &[StandardGamepadButton::South],
                0.0,
                0.0,
            ),
            standard_observation(5, 2, ControllerMapping::Ambiguous, &[], 0.7, 0.0),
        ] {
            assert!(matches!(
                mapper.map(&[invalid]),
                Err(StandardShellMappingError::AmbiguousMappingSignal(5))
            ));
        }
    }

    #[test]
    fn standard_mapping_rejects_bounds_duplicates_epochs_and_invalid_axes() {
        let mut mapper = StandardShellControllerMapper::new();
        let normal = standard_observation(1, 1, ControllerMapping::Standard, &[], 0.0, 0.0);
        let excessive = vec![normal.clone(); MAX_CONNECTED_CONTROLLERS + 1];
        assert!(matches!(
            mapper.map(&excessive),
            Err(StandardShellMappingError::TooManyControllers(_))
        ));
        assert!(matches!(
            mapper.map(&[normal.clone(), normal.clone()]),
            Err(StandardShellMappingError::DuplicateController(1))
        ));
        assert!(matches!(
            mapper.map(&[standard_observation(
                1,
                0,
                ControllerMapping::Standard,
                &[],
                0.0,
                0.0,
            )]),
            Err(StandardShellMappingError::InvalidConnectionEpoch(1))
        ));
        for invalid_axis in [f32::NAN, f32::INFINITY, -1.01, 1.01] {
            assert!(matches!(
                mapper.map(&[standard_observation(
                    1,
                    1,
                    ControllerMapping::Standard,
                    &[],
                    invalid_axis,
                    0.0,
                )]),
                Err(StandardShellMappingError::InvalidAxis(1))
            ));
        }
    }

    #[test]
    fn reserved_actions_never_route_to_a_game() {
        let mut router = ReservedInputRouter::new(InputContext::Game);
        for action in [ShellAction::Home, ShellAction::Back, ShellAction::Pause] {
            assert_eq!(
                router
                    .route(InputEvent {
                        device_id: "controller-0001".to_owned(),
                        action,
                        pressed: true,
                    })
                    .expect("reserved press"),
                Some(routed(
                    "controller-0001",
                    action,
                    true,
                    InputTarget::Console
                ))
            );
            assert_eq!(
                router
                    .route(InputEvent {
                        device_id: "controller-0001".to_owned(),
                        action,
                        pressed: false,
                    })
                    .expect("reserved release"),
                Some(routed(
                    "controller-0001",
                    action,
                    false,
                    InputTarget::Console
                ))
            );
        }
    }

    #[test]
    fn ordinary_game_input_routes_only_while_game_context_owns_it() {
        let mut router = ReservedInputRouter::new(InputContext::Game);
        for action in [
            ShellAction::Up,
            ShellAction::Down,
            ShellAction::Left,
            ShellAction::Right,
            ShellAction::Select,
        ] {
            assert_eq!(
                router
                    .route(InputEvent {
                        device_id: "controller-0001".to_owned(),
                        action,
                        pressed: true,
                    })
                    .expect("game press"),
                Some(routed("controller-0001", action, true, InputTarget::Game))
            );
            assert_eq!(
                router
                    .route(InputEvent {
                        device_id: "controller-0001".to_owned(),
                        action,
                        pressed: false,
                    })
                    .expect("game release"),
                Some(routed("controller-0001", action, false, InputTarget::Game))
            );
        }

        router.set_context(InputContext::Launcher);
        assert_eq!(
            router
                .route(InputEvent {
                    device_id: "controller-0001".to_owned(),
                    action: ShellAction::Select,
                    pressed: true,
                })
                .expect("launcher press"),
            Some(routed(
                "controller-0001",
                ShellAction::Select,
                true,
                InputTarget::Console
            ))
        );
    }

    #[test]
    fn context_change_releases_prior_targets_and_requires_rearming() {
        let mut router = ReservedInputRouter::new(InputContext::Game);
        for action in [ShellAction::Left, ShellAction::Home] {
            router
                .route(InputEvent {
                    device_id: "controller-0001".to_owned(),
                    action,
                    pressed: true,
                })
                .expect("press");
        }

        assert_eq!(
            router.set_context(InputContext::ConsoleOverlay),
            vec![
                RoutedInputEvent {
                    target: InputTarget::Game,
                    input: InputEvent {
                        device_id: "controller-0001".to_owned(),
                        action: ShellAction::Left,
                        pressed: false,
                    },
                },
                RoutedInputEvent {
                    target: InputTarget::Console,
                    input: InputEvent {
                        device_id: "controller-0001".to_owned(),
                        action: ShellAction::Home,
                        pressed: false,
                    },
                },
            ]
        );
        assert_eq!(router.held_count(), 0);
        assert_eq!(
            router
                .route(InputEvent {
                    device_id: "controller-0001".to_owned(),
                    action: ShellAction::Left,
                    pressed: false,
                })
                .expect("orphan release"),
            None
        );
        assert_eq!(
            router
                .route(InputEvent {
                    device_id: "controller-0001".to_owned(),
                    action: ShellAction::Left,
                    pressed: true,
                })
                .expect("rearmed press"),
            Some(routed(
                "controller-0001",
                ShellAction::Left,
                true,
                InputTarget::Console
            ))
        );
    }

    #[test]
    fn duplicate_presses_and_orphan_releases_do_not_fabricate_edges() {
        let mut router = ReservedInputRouter::new(InputContext::Launcher);
        let press = InputEvent {
            device_id: "controller-0001".to_owned(),
            action: ShellAction::Select,
            pressed: true,
        };
        assert!(router.route(press.clone()).expect("first press").is_some());
        assert_eq!(router.route(press).expect("duplicate press"), None);
        assert_eq!(
            router
                .route(InputEvent {
                    device_id: "controller-9999".to_owned(),
                    action: ShellAction::Select,
                    pressed: false,
                })
                .expect("orphan release"),
            None
        );
        assert_eq!(router.held_count(), 1);
    }

    #[test]
    fn invalid_device_ids_are_rejected_before_entering_held_state() {
        let mut router = ReservedInputRouter::new(InputContext::Game);
        for device_id in [
            String::new(),
            "controller/escape".to_owned(),
            "x".repeat(MAX_INPUT_DEVICE_ID_BYTES + 1),
        ] {
            assert_eq!(
                router.route(InputEvent {
                    device_id,
                    action: ShellAction::Select,
                    pressed: true,
                }),
                Err(ReservedInputRouterError::InvalidDeviceId)
            );
        }
        assert_eq!(router.held_count(), 0);
    }

    #[test]
    fn routed_held_state_is_bounded_and_rejection_is_transactional() {
        let mut router = ReservedInputRouter::new(InputContext::Game);
        let actions = [
            ShellAction::Up,
            ShellAction::Down,
            ShellAction::Left,
            ShellAction::Right,
            ShellAction::Select,
            ShellAction::Back,
            ShellAction::Home,
            ShellAction::Pause,
        ];
        for controller in 0..MAX_CONNECTED_CONTROLLERS {
            for action in actions {
                router
                    .route(InputEvent {
                        device_id: format!("controller-{controller:04}"),
                        action,
                        pressed: true,
                    })
                    .expect("bounded press");
            }
        }
        assert_eq!(router.held_count(), MAX_ROUTED_HELD_ACTIONS);
        assert_eq!(
            router.route(InputEvent {
                device_id: "controller-overflow".to_owned(),
                action: ShellAction::Select,
                pressed: true,
            }),
            Err(ReservedInputRouterError::HeldActionCapacityExceeded)
        );
        assert_eq!(router.held_count(), MAX_ROUTED_HELD_ACTIONS);
        assert_eq!(router.release_all().len(), MAX_ROUTED_HELD_ACTIONS);
        assert_eq!(router.held_count(), 0);
    }

    #[test]
    fn registry_disconnect_release_returns_to_the_original_game_target() {
        let mut registry = ControllerRegistry::new();
        let mut router = ReservedInputRouter::new(InputContext::Game);
        let connected = registry
            .reconcile(&[snapshot(
                7,
                1,
                ControllerMapping::Standard,
                &[ShellAction::Select],
            )])
            .expect("connect");
        let press = connected
            .into_iter()
            .find_map(|event| match event {
                ControllerEvent::Input(input) => Some(input),
                ControllerEvent::Connection(_) => None,
            })
            .expect("press");
        assert_eq!(
            router.route(press).expect("route press"),
            Some(routed(
                "controller-0001",
                ShellAction::Select,
                true,
                InputTarget::Game
            ))
        );

        let disconnected = registry.reconcile(&[]).expect("disconnect");
        let release = disconnected
            .into_iter()
            .find_map(|event| match event {
                ControllerEvent::Input(input) => Some(input),
                ControllerEvent::Connection(_) => None,
            })
            .expect("release");
        assert_eq!(
            router.route(release).expect("route release"),
            Some(routed(
                "controller-0001",
                ShellAction::Select,
                false,
                InputTarget::Game
            ))
        );
        assert_eq!(router.held_count(), 0);
    }

    #[test]
    fn home_and_back_are_distinct_privileged_actions() {
        let home = InputEvent {
            device_id: "controller-1".to_owned(),
            action: ShellAction::Home,
            pressed: true,
        };
        let back = InputEvent {
            action: ShellAction::Back,
            ..home.clone()
        };

        assert_ne!(home, back);
    }

    #[test]
    fn discovers_in_backend_order_independent_form_and_emits_only_edges() {
        let mut registry = ControllerRegistry::new();
        assert_eq!(
            registry
                .reconcile(&[
                    snapshot(9, 1, ControllerMapping::Standard, &[ShellAction::Select]),
                    snapshot(3, 1, ControllerMapping::Standard, &[ShellAction::Back]),
                ])
                .expect("controllers reconcile"),
            vec![
                connected("controller-0001", ControllerMapping::Standard),
                input("controller-0001", ShellAction::Back, true),
                connected("controller-0002", ControllerMapping::Standard),
                input("controller-0002", ShellAction::Select, true),
            ]
        );
        assert!(
            registry
                .reconcile(&[
                    snapshot(3, 1, ControllerMapping::Standard, &[ShellAction::Back]),
                    snapshot(9, 1, ControllerMapping::Standard, &[ShellAction::Select]),
                ])
                .expect("unchanged observation reconciles")
                .is_empty()
        );
        assert_eq!(
            registry
                .reconcile(&[
                    snapshot(3, 1, ControllerMapping::Standard, &[]),
                    snapshot(9, 1, ControllerMapping::Standard, &[ShellAction::Home]),
                ])
                .expect("changed actions reconcile"),
            vec![
                input("controller-0001", ShellAction::Back, false),
                input("controller-0002", ShellAction::Select, false),
                input("controller-0002", ShellAction::Home, true),
            ]
        );
    }

    #[test]
    fn disappearance_synthesizes_release_and_reconnect_rearms_a_new_identity() {
        let mut registry = ControllerRegistry::new();
        registry
            .reconcile(&[snapshot(
                4,
                1,
                ControllerMapping::Standard,
                &[ShellAction::Home],
            )])
            .expect("controller connects");
        assert_eq!(
            registry.reconcile(&[]).expect("disconnect reconciles"),
            vec![
                input("controller-0001", ShellAction::Home, false),
                disconnected("controller-0001", ControllerMapping::Standard),
            ]
        );
        assert_eq!(
            registry
                .reconcile(&[snapshot(
                    4,
                    2,
                    ControllerMapping::Standard,
                    &[ShellAction::Home],
                )])
                .expect("controller reconnects"),
            vec![
                connected("controller-0002", ControllerMapping::Standard),
                input("controller-0002", ShellAction::Home, true),
            ]
        );
    }

    #[test]
    fn same_instance_replacement_disconnects_before_new_press_epoch() {
        let mut registry = ControllerRegistry::new();
        registry
            .reconcile(&[snapshot(
                7,
                10,
                ControllerMapping::Standard,
                &[ShellAction::Pause],
            )])
            .expect("first controller connects");

        assert_eq!(
            registry
                .reconcile(&[snapshot(
                    7,
                    11,
                    ControllerMapping::Standard,
                    &[ShellAction::Pause],
                )])
                .expect("replacement reconciles"),
            vec![
                input("controller-0001", ShellAction::Pause, false),
                disconnected("controller-0001", ControllerMapping::Standard),
                connected("controller-0002", ControllerMapping::Standard),
                input("controller-0002", ShellAction::Pause, true),
            ]
        );
    }

    #[test]
    fn ambiguous_mapping_is_visible_but_cannot_publish_semantic_input() {
        let mut registry = ControllerRegistry::new();
        assert_eq!(
            registry
                .reconcile(&[snapshot(2, 1, ControllerMapping::Ambiguous, &[])])
                .expect("ambiguous controller remains visible"),
            vec![connected("controller-0001", ControllerMapping::Ambiguous)]
        );
        assert!(matches!(
            registry.reconcile(&[snapshot(
                2,
                1,
                ControllerMapping::Ambiguous,
                &[ShellAction::Select],
            )]),
            Err(ControllerRegistryError::AmbiguousMappingInput(2))
        ));
        assert_eq!(registry.connected_count(), 1);
        assert_eq!(
            registry
                .reconcile(&[snapshot(
                    2,
                    1,
                    ControllerMapping::Standard,
                    &[ShellAction::Select],
                )])
                .expect("approved mapping replaces ambiguous connection"),
            vec![
                disconnected("controller-0001", ControllerMapping::Ambiguous),
                connected("controller-0002", ControllerMapping::Standard),
                input("controller-0002", ShellAction::Select, true),
            ]
        );
    }

    #[test]
    fn invalid_complete_observation_leaves_existing_state_unchanged() {
        let mut registry = ControllerRegistry::new();
        registry
            .reconcile(&[snapshot(
                1,
                1,
                ControllerMapping::Standard,
                &[ShellAction::Back],
            )])
            .expect("controller connects");

        for (observations, expected) in [
            (
                vec![
                    snapshot(1, 1, ControllerMapping::Standard, &[]),
                    snapshot(1, 2, ControllerMapping::Standard, &[]),
                ],
                ControllerRegistryError::DuplicateController(1),
            ),
            (
                vec![snapshot(1, 0, ControllerMapping::Standard, &[])],
                ControllerRegistryError::InvalidConnectionEpoch(1),
            ),
            (
                vec![snapshot(
                    1,
                    1,
                    ControllerMapping::Standard,
                    &[ShellAction::Back, ShellAction::Back],
                )],
                ControllerRegistryError::DuplicateAction(1),
            ),
        ] {
            assert_eq!(registry.reconcile(&observations), Err(expected));
            assert_eq!(registry.connected_count(), 1);
        }
        let too_many = (0..=MAX_CONNECTED_CONTROLLERS)
            .map(|index| {
                snapshot(
                    u32::try_from(index).expect("test instance fits"),
                    1,
                    ControllerMapping::Standard,
                    &[],
                )
            })
            .collect::<Vec<_>>();
        assert!(matches!(
            registry.reconcile(&too_many),
            Err(ControllerRegistryError::TooManyControllers(count))
                if count == MAX_CONNECTED_CONTROLLERS + 1
        ));
        assert_eq!(registry.connected_count(), 1);
        assert!(
            registry
                .reconcile(&[snapshot(
                    1,
                    1,
                    ControllerMapping::Standard,
                    &[ShellAction::Back],
                )])
                .expect("unchanged valid state remains")
                .is_empty()
        );
    }

    #[test]
    fn shutdown_releases_every_action_before_disconnect_and_rearms() {
        let mut registry = ControllerRegistry::new();
        registry
            .reconcile(&[
                snapshot(5, 1, ControllerMapping::Standard, &[ShellAction::Select]),
                snapshot(8, 1, ControllerMapping::Ambiguous, &[]),
            ])
            .expect("controllers connect");

        assert_eq!(
            registry.disconnect_all(),
            vec![
                input("controller-0001", ShellAction::Select, false),
                disconnected("controller-0001", ControllerMapping::Standard),
                disconnected("controller-0002", ControllerMapping::Ambiguous),
            ]
        );
        assert_eq!(registry.connected_count(), 0);
        assert!(registry.disconnect_all().is_empty());
        assert_eq!(
            registry
                .reconcile(&[snapshot(
                    5,
                    2,
                    ControllerMapping::Standard,
                    &[ShellAction::Select],
                )])
                .expect("controller reconnects after shutdown"),
            vec![
                connected("controller-0003", ControllerMapping::Standard),
                input("controller-0003", ShellAction::Select, true),
            ]
        );
    }
}
