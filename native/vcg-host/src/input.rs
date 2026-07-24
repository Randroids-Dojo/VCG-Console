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
