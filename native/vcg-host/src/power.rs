//! Privileged, fail-closed power lifecycle coordination.
//!
//! This module owns ordering and in-process capability boundaries. It closes
//! native launch admission before invoking any quiescence adapter, binds every
//! operation to one coordinator epoch and monotonically allocated identifier,
//! and retains the launch closure through idle, terminal failure, or a
//! restart/shutdown handoff. Platform and service traits are privileged adapter
//! boundaries; this module deliberately exposes no browser/JSON acknowledgement
//! protocol and does not claim a concrete OS or hardware implementation.

use std::error::Error;
use std::fmt;
use std::sync::Arc;

use crate::native_launch::{NativeLaunchError, NativeLaunchService, PowerLaunchAdmissionLease};

pub const POWER_CONFIRMATION_WINDOW_MS: u64 = 30_000;
pub const POWER_QUIESCE_WINDOW_MS: u64 = 60_000;
pub const POWER_WAKE_WINDOW_MS: u64 = 30_000;

const LAUNCH_ADMISSION_BIT: u8 = 1;
const ALL_QUIESCE_BITS: u8 = 0b0111_1111;
const ALL_WAKE_BITS: u8 = 0b0000_0111;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IdleStrategy {
    PlatformSuspend,
    LowPowerLauncherIdle,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExplicitPowerAction {
    Restart,
    Shutdown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerAction {
    Idle,
    Restart,
    Shutdown,
}

impl From<ExplicitPowerAction> for PowerAction {
    fn from(value: ExplicitPowerAction) -> Self {
        match value {
            ExplicitPowerAction::Restart => Self::Restart,
            ExplicitPowerAction::Shutdown => Self::Shutdown,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WakeSource {
    PhysicalPowerButton,
    Controller,
    Remote,
    HdmiCec,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerInputEvent {
    ShortPhysicalPowerPress,
    ControllerWake,
    RemoteWake,
    HdmiCecWake,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InputQualification {
    Qualified,
    Unsupported,
    Unavailable,
}

/// Host-selected qualification boundary for physical and platform wake input.
///
/// A production adapter must authenticate provenance, debounce/timing, device
/// eligibility, and the current platform power state. Page, game, Motion, and
/// ordinary loopback inputs must never implement or select this adapter.
pub trait PowerInputAdapter {
    fn qualify(&mut self, event: PowerInputEvent) -> InputQualification;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerQuiesceGate {
    LaunchAdmissionClosed,
    GameStoppedOrSuspended,
    TrackerStopped,
    CameraCaptureStopped,
    InputReleased,
    WritesQuiesced,
    UpdateStateSafe,
}

impl PowerQuiesceGate {
    const ALL: [Self; 7] = [
        Self::LaunchAdmissionClosed,
        Self::GameStoppedOrSuspended,
        Self::TrackerStopped,
        Self::CameraCaptureStopped,
        Self::InputReleased,
        Self::WritesQuiesced,
        Self::UpdateStateSafe,
    ];

    const fn bit(self) -> u8 {
        match self {
            Self::LaunchAdmissionClosed => LAUNCH_ADMISSION_BIT,
            Self::GameStoppedOrSuspended => 1 << 1,
            Self::TrackerStopped => 1 << 2,
            Self::CameraCaptureStopped => 1 << 3,
            Self::InputReleased => 1 << 4,
            Self::WritesQuiesced => 1 << 5,
            Self::UpdateStateSafe => 1 << 6,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerServiceGate {
    GameStoppedOrSuspended,
    TrackerStopped,
    CameraCaptureStopped,
    InputReleased,
    WritesQuiesced,
    UpdateStateSafe,
}

impl From<PowerServiceGate> for PowerQuiesceGate {
    fn from(value: PowerServiceGate) -> Self {
        match value {
            PowerServiceGate::GameStoppedOrSuspended => Self::GameStoppedOrSuspended,
            PowerServiceGate::TrackerStopped => Self::TrackerStopped,
            PowerServiceGate::CameraCaptureStopped => Self::CameraCaptureStopped,
            PowerServiceGate::InputReleased => Self::InputReleased,
            PowerServiceGate::WritesQuiesced => Self::WritesQuiesced,
            PowerServiceGate::UpdateStateSafe => Self::UpdateStateSafe,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerWakeGate {
    LauncherReady,
    DisplayReady,
    InputReady,
}

impl PowerWakeGate {
    const ALL: [Self; 3] = [Self::LauncherReady, Self::DisplayReady, Self::InputReady];

    const fn bit(self) -> u8 {
        match self {
            Self::LauncherReady => 1,
            Self::DisplayReady => 1 << 1,
            Self::InputReady => 1 << 2,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterAcknowledgement {
    Complete,
    Failed,
    Unavailable,
    UnsafeUpdateState,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimedAdapterAcknowledgement {
    pub acknowledgement: AdapterAcknowledgement,
    pub completed_at_ms: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PowerOperationRef {
    epoch: u64,
    operation_id: u64,
}

impl PowerOperationRef {
    #[must_use]
    pub const fn epoch(self) -> u64 {
        self.epoch
    }

    #[must_use]
    pub const fn operation_id(self) -> u64 {
        self.operation_id
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PowerQuiesceRequest {
    operation: PowerOperationRef,
    gate: PowerServiceGate,
    observed_at_ms: u64,
    deadline_at_ms: u64,
}

impl PowerQuiesceRequest {
    #[must_use]
    pub const fn operation(self) -> PowerOperationRef {
        self.operation
    }

    #[must_use]
    pub const fn gate(self) -> PowerServiceGate {
        self.gate
    }

    #[must_use]
    pub const fn observed_at_ms(self) -> u64 {
        self.observed_at_ms
    }

    #[must_use]
    pub const fn deadline_at_ms(self) -> u64 {
        self.deadline_at_ms
    }
}

/// Privileged adapter for one exact service quiescence gate.
///
/// Implementations must authenticate the service response and bind it to the
/// supplied operation. `Complete` is security authority. This crate does not
/// provide a network or page-facing implementation.
pub trait PowerQuiesceAdapter {
    fn quiesce(&mut self, request: PowerQuiesceRequest) -> TimedAdapterAcknowledgement;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PowerWakeRequest {
    operation: PowerOperationRef,
    gate: PowerWakeGate,
    observed_at_ms: u64,
    deadline_at_ms: u64,
}

impl PowerWakeRequest {
    #[must_use]
    pub const fn operation(self) -> PowerOperationRef {
        self.operation
    }

    #[must_use]
    pub const fn gate(self) -> PowerWakeGate {
        self.gate
    }

    #[must_use]
    pub const fn observed_at_ms(self) -> u64 {
        self.observed_at_ms
    }

    #[must_use]
    pub const fn deadline_at_ms(self) -> u64 {
        self.deadline_at_ms
    }
}

/// Privileged readiness adapter for one exact wake operation.
pub trait PowerWakeAdapter {
    fn ready(&mut self, request: PowerWakeRequest) -> TimedAdapterAcknowledgement;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlatformPowerTarget {
    PlatformSuspend,
    LowPowerLauncherIdle,
    Restart,
    Shutdown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PlatformTransitionRequest {
    operation: PowerOperationRef,
    target: PlatformPowerTarget,
    observed_at_ms: u64,
    deadline_at_ms: u64,
}

impl PlatformTransitionRequest {
    #[must_use]
    pub const fn operation(self) -> PowerOperationRef {
        self.operation
    }

    #[must_use]
    pub const fn target(self) -> PlatformPowerTarget {
        self.target
    }

    #[must_use]
    pub const fn observed_at_ms(self) -> u64 {
        self.observed_at_ms
    }

    #[must_use]
    pub const fn deadline_at_ms(self) -> u64 {
        self.deadline_at_ms
    }
}

/// Tier-selected privileged OS/firmware transition boundary.
///
/// `Complete` means the exact handoff was accepted. A production implementation
/// still requires target qualification; the coordinator never accepts a target
/// selected by browser or game input.
pub trait PlatformPowerAdapter {
    fn start_transition(
        &mut self,
        request: PlatformTransitionRequest,
    ) -> TimedAdapterAcknowledgement;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerPhase {
    Active,
    Confirming,
    Quiescing,
    TransitionReady,
    Idle,
    Waking,
    PowerTransfer,
    Fault,
    PowerLost,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerFaultCode {
    AdapterFailed,
    DeadlineExpired,
    UnsafeUpdateState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingConfirmationSnapshot {
    pub operation: PowerOperationRef,
    pub action: ExplicitPowerAction,
    pub expires_at_ms: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PendingOperationSnapshot {
    Quiesce {
        operation: PowerOperationRef,
        action: PowerAction,
        deadline_at_ms: u64,
        acknowledged: Vec<PowerQuiesceGate>,
        missing: Vec<PowerQuiesceGate>,
    },
    Wake {
        operation: PowerOperationRef,
        source: WakeSource,
        deadline_at_ms: u64,
        acknowledged: Vec<PowerWakeGate>,
        missing: Vec<PowerWakeGate>,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReadyTransitionSnapshot {
    pub operation: PowerOperationRef,
    pub target: PlatformPowerTarget,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PowerFaultSnapshot {
    pub operation: PowerOperationRef,
    pub action: PowerOperationAction,
    pub code: PowerFaultCode,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerOperationAction {
    Idle,
    Restart,
    Shutdown,
    Wake,
}

impl From<PowerAction> for PowerOperationAction {
    fn from(value: PowerAction) -> Self {
        match value {
            PowerAction::Idle => Self::Idle,
            PowerAction::Restart => Self::Restart,
            PowerAction::Shutdown => Self::Shutdown,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerSnapshot {
    pub phase: PowerPhase,
    pub idle_strategy: IdleStrategy,
    pub operation_epoch: u64,
    pub can_admit_launch: bool,
    pub pending_confirmation: Option<PendingConfirmationSnapshot>,
    pub pending_operation: Option<PendingOperationSnapshot>,
    pub ready_transition: Option<ReadyTransitionSnapshot>,
    pub platform_handoff: Option<ReadyTransitionSnapshot>,
    pub fault: Option<PowerFaultSnapshot>,
}

#[derive(Debug)]
struct OperationIdentity {
    reference: PowerOperationRef,
}

#[derive(Debug)]
struct PendingConfirmation {
    operation: PowerOperationRef,
    action: ExplicitPowerAction,
    expires_at_ms: u64,
}

#[derive(Debug)]
struct PendingPowerOperation {
    identity: Arc<OperationIdentity>,
    action: PowerAction,
    deadline_at_ms: u64,
    acknowledged: u8,
}

#[derive(Debug)]
struct PendingWakeOperation {
    identity: Arc<OperationIdentity>,
    source: WakeSource,
    deadline_at_ms: u64,
    acknowledged: u8,
}

#[derive(Debug)]
enum CoordinatorState {
    Active,
    Confirming(PendingConfirmation),
    Quiescing(PendingPowerOperation),
    TransitionReady(PendingPowerOperation),
    Idle,
    Waking(PendingWakeOperation),
    PowerTransfer {
        operation: PowerOperationRef,
        target: PlatformPowerTarget,
    },
    Fault(PowerFaultSnapshot),
    PowerLost,
}

/// Native owner of one boot/coordinator epoch's power lifecycle.
///
/// This value is intentionally not serializable or cloneable. It retains the
/// exact launch-admission closure through every non-active phase.
#[derive(Debug)]
pub struct PowerCoordinator {
    idle_strategy: IdleStrategy,
    operation_epoch: u64,
    next_operation_id: u64,
    last_observed_ms: u64,
    state: CoordinatorState,
    launch_lease: Option<PowerLaunchAdmissionLease>,
}

impl PowerCoordinator {
    /// Creates one coordinator for a positive, non-repeating boot epoch.
    ///
    /// # Errors
    ///
    /// Rejects zero identifiers and an exhausted first operation ID.
    pub fn new(
        idle_strategy: IdleStrategy,
        operation_epoch: u64,
        first_operation_id: u64,
    ) -> Result<Self, PowerCoordinatorError> {
        if operation_epoch == 0 {
            return Err(PowerCoordinatorError::InvalidEpoch);
        }
        if first_operation_id == 0 || first_operation_id == u64::MAX {
            return Err(PowerCoordinatorError::InvalidOperationId);
        }
        Ok(Self {
            idle_strategy,
            operation_epoch,
            next_operation_id: first_operation_id,
            last_observed_ms: 0,
            state: CoordinatorState::Active,
            launch_lease: None,
        })
    }

    #[must_use]
    pub fn snapshot(&self) -> PowerSnapshot {
        let phase = self.phase();
        let mut snapshot = PowerSnapshot {
            phase,
            idle_strategy: self.idle_strategy,
            operation_epoch: self.operation_epoch,
            can_admit_launch: matches!(
                self.state,
                CoordinatorState::Active | CoordinatorState::Confirming(_)
            ),
            pending_confirmation: None,
            pending_operation: None,
            ready_transition: None,
            platform_handoff: None,
            fault: None,
        };
        match &self.state {
            CoordinatorState::Confirming(confirmation) => {
                snapshot.pending_confirmation = Some(PendingConfirmationSnapshot {
                    operation: confirmation.operation,
                    action: confirmation.action,
                    expires_at_ms: confirmation.expires_at_ms,
                });
            }
            CoordinatorState::Quiescing(operation)
            | CoordinatorState::TransitionReady(operation) => {
                snapshot.pending_operation = Some(quiesce_snapshot(operation));
                if matches!(self.state, CoordinatorState::TransitionReady(_)) {
                    snapshot.ready_transition = Some(ReadyTransitionSnapshot {
                        operation: operation.identity.reference,
                        target: self.target_for(operation.action),
                    });
                }
            }
            CoordinatorState::Waking(operation) => {
                snapshot.pending_operation = Some(wake_snapshot(operation));
            }
            CoordinatorState::Fault(fault) => snapshot.fault = Some(*fault),
            CoordinatorState::PowerTransfer { operation, target } => {
                snapshot.platform_handoff = Some(ReadyTransitionSnapshot {
                    operation: *operation,
                    target: *target,
                });
            }
            CoordinatorState::Active | CoordinatorState::Idle | CoordinatorState::PowerLost => {}
        }
        snapshot
    }

    /// Advances the monotonic clock and applies bounded expiry.
    ///
    /// # Errors
    ///
    /// Rejects clock rollback.
    pub fn tick(&mut self, now_ms: u64) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_time(now_ms)?;
        self.expire(now_ms);
        Ok(self.snapshot())
    }

    /// Begins idle from a privileged local-console command.
    ///
    /// Launch admission is closed atomically before the operation becomes
    /// visible or any service adapter can run.
    ///
    /// # Errors
    ///
    /// Rejects a non-active phase, clock/deadline/identifier failure, or an
    /// unavailable/already-closed native launch boundary.
    pub fn request_local_idle(
        &mut self,
        now_ms: u64,
        launches: &NativeLaunchService,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.begin_idle(now_ms, launches)
    }

    /// Maps one platform-qualified short physical press to idle or wake.
    ///
    /// # Errors
    ///
    /// Rejects unqualified input, a transition phase, clock/deadline/identifier
    /// failure, or an unavailable native launch boundary.
    pub fn short_press_power_button(
        &mut self,
        input: &mut impl PowerInputAdapter,
        now_ms: u64,
        launches: &NativeLaunchService,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        match self.phase() {
            PowerPhase::Active => {
                require_qualified(input.qualify(PowerInputEvent::ShortPhysicalPowerPress))?;
                self.begin_idle(now_ms, launches)
            }
            PowerPhase::Idle => {
                require_qualified(input.qualify(PowerInputEvent::ShortPhysicalPowerPress))?;
                self.begin_wake(WakeSource::PhysicalPowerButton, now_ms)
            }
            _ => Err(PowerCoordinatorError::WrongPhase {
                action: "short physical power press",
                phase: self.phase(),
            }),
        }
    }

    /// Starts a distinct expiring confirmation for restart or shutdown.
    ///
    /// # Errors
    ///
    /// Rejects a non-active phase or clock/deadline/identifier failure.
    pub fn request_explicit_transition(
        &mut self,
        action: ExplicitPowerAction,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.require_phase(PowerPhase::Active, "explicit transition request")?;
        let (operation, expires_at_ms) =
            self.prepare_operation(now_ms, POWER_CONFIRMATION_WINDOW_MS)?;
        self.commit_operation_id();
        self.state = CoordinatorState::Confirming(PendingConfirmation {
            operation,
            action,
            expires_at_ms,
        });
        Ok(self.snapshot())
    }

    /// Confirms the exact live restart/shutdown request and closes admission.
    ///
    /// # Errors
    ///
    /// Rejects stale/cross-epoch evidence, expiry, clock/deadline failure, or
    /// an unavailable/already-closed native launch boundary.
    pub fn confirm_explicit_transition(
        &mut self,
        operation: PowerOperationRef,
        now_ms: u64,
        launches: &NativeLaunchService,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.validate_operation_ref(operation)?;
        let CoordinatorState::Confirming(confirmation) = &self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if confirmation.operation != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        let action = PowerAction::from(confirmation.action);
        let deadline_at_ms = Self::add_window(now_ms, POWER_QUIESCE_WINDOW_MS)?;
        let lease = launches.close_power_admission()?;
        self.launch_lease = Some(lease);
        self.state = CoordinatorState::Quiescing(PendingPowerOperation {
            identity: Arc::new(OperationIdentity {
                reference: operation,
            }),
            action,
            deadline_at_ms,
            acknowledged: LAUNCH_ADMISSION_BIT,
        });
        Ok(self.snapshot())
    }

    /// Cancels only an exact request that has not begun quiescence.
    ///
    /// # Errors
    ///
    /// Rejects clock rollback, expiry, or a stale/cross-epoch operation.
    pub fn cancel_explicit_transition(
        &mut self,
        operation: PowerOperationRef,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.validate_operation_ref(operation)?;
        let CoordinatorState::Confirming(confirmation) = &self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if confirmation.operation != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        self.state = CoordinatorState::Active;
        Ok(self.snapshot())
    }

    /// Invokes one host-selected service adapter for the exact live operation.
    ///
    /// Duplicate completed gates are idempotent and do not invoke the adapter
    /// again. Any negative or ambiguous adapter result is terminal.
    ///
    /// # Errors
    ///
    /// Rejects clock rollback, expiry, or a stale/cross-epoch operation.
    pub fn quiesce_service(
        &mut self,
        operation: PowerOperationRef,
        gate: PowerServiceGate,
        adapter: &mut impl PowerQuiesceAdapter,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.validate_operation_ref(operation)?;
        let quiesce_gate = PowerQuiesceGate::from(gate);
        let CoordinatorState::Quiescing(pending) = &self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if pending.identity.reference != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        if pending.acknowledged & quiesce_gate.bit() != 0 {
            return Ok(self.snapshot());
        }
        let action = pending.action;
        let deadline_at_ms = pending.deadline_at_ms;
        let result = adapter.quiesce(PowerQuiesceRequest {
            operation,
            gate,
            observed_at_ms: now_ms,
            deadline_at_ms,
        });
        self.observe_and_expire(result.completed_at_ms)?;
        if self.phase() == PowerPhase::Fault {
            return Ok(self.snapshot());
        }
        let CoordinatorState::Quiescing(pending) = &mut self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if pending.identity.reference != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        if result.acknowledgement == AdapterAcknowledgement::Complete {
            pending.acknowledged |= quiesce_gate.bit();
            if pending.acknowledged == ALL_QUIESCE_BITS {
                let CoordinatorState::Quiescing(ready) =
                    std::mem::replace(&mut self.state, CoordinatorState::PowerLost)
                else {
                    unreachable!("quiescing state was just matched");
                };
                self.state = CoordinatorState::TransitionReady(ready);
            }
        } else {
            let code = if result.acknowledgement == AdapterAcknowledgement::UnsafeUpdateState
                && gate == PowerServiceGate::UpdateStateSafe
            {
                PowerFaultCode::UnsafeUpdateState
            } else {
                PowerFaultCode::AdapterFailed
            };
            self.enter_fault(operation, action.into(), code);
        }
        Ok(self.snapshot())
    }

    /// Hands one exact ready target to the tier-selected privileged adapter.
    ///
    /// # Errors
    ///
    /// Rejects clock rollback, expiry, or an operation that is not exactly
    /// transition-ready.
    pub fn start_platform_transition(
        &mut self,
        operation: PowerOperationRef,
        adapter: &mut impl PlatformPowerAdapter,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.validate_operation_ref(operation)?;
        let CoordinatorState::TransitionReady(pending) = &self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if pending.identity.reference != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        let action = pending.action;
        let deadline_at_ms = pending.deadline_at_ms;
        let target = self.target_for(action);
        let result = adapter.start_transition(PlatformTransitionRequest {
            operation,
            target,
            observed_at_ms: now_ms,
            deadline_at_ms,
        });
        self.observe_and_expire(result.completed_at_ms)?;
        if self.phase() == PowerPhase::Fault {
            return Ok(self.snapshot());
        }
        if result.acknowledgement != AdapterAcknowledgement::Complete {
            self.enter_fault(operation, action.into(), PowerFaultCode::AdapterFailed);
        } else if action == PowerAction::Idle {
            self.state = CoordinatorState::Idle;
        } else {
            self.state = CoordinatorState::PowerTransfer { operation, target };
        }
        Ok(self.snapshot())
    }

    /// Begins a wake only after the host-selected source adapter qualifies it.
    ///
    /// # Errors
    ///
    /// Rejects unqualified input, a non-idle phase, or
    /// clock/deadline/identifier failure.
    pub fn request_wake(
        &mut self,
        source: WakeSource,
        input: &mut impl PowerInputAdapter,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.require_phase(PowerPhase::Idle, "wake request")?;
        require_qualified(input.qualify(wake_event(source)))?;
        self.begin_wake(source, now_ms)
    }

    /// Invokes one host-selected readiness adapter for the exact wake.
    ///
    /// Fresh launch admission reopens only after all three gates complete.
    ///
    /// # Errors
    ///
    /// Rejects clock rollback, expiry, or a stale/cross-epoch operation.
    pub fn acknowledge_wake(
        &mut self,
        operation: PowerOperationRef,
        gate: PowerWakeGate,
        adapter: &mut impl PowerWakeAdapter,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.validate_operation_ref(operation)?;
        let CoordinatorState::Waking(pending) = &self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if pending.identity.reference != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        if pending.acknowledged & gate.bit() != 0 {
            return Ok(self.snapshot());
        }
        let deadline_at_ms = pending.deadline_at_ms;
        let result = adapter.ready(PowerWakeRequest {
            operation,
            gate,
            observed_at_ms: now_ms,
            deadline_at_ms,
        });
        self.observe_and_expire(result.completed_at_ms)?;
        if self.phase() == PowerPhase::Fault {
            return Ok(self.snapshot());
        }
        let CoordinatorState::Waking(pending) = &mut self.state else {
            return Err(PowerCoordinatorError::OperationNotLive);
        };
        if pending.identity.reference != operation {
            return Err(PowerCoordinatorError::OperationNotLive);
        }
        if result.acknowledgement != AdapterAcknowledgement::Complete {
            self.enter_fault(
                operation,
                PowerOperationAction::Wake,
                PowerFaultCode::AdapterFailed,
            );
            return Ok(self.snapshot());
        }
        pending.acknowledged |= gate.bit();
        if pending.acknowledged == ALL_WAKE_BITS {
            let Some(lease) = self.launch_lease.take() else {
                self.enter_fault(
                    operation,
                    PowerOperationAction::Wake,
                    PowerFaultCode::AdapterFailed,
                );
                return Ok(self.snapshot());
            };
            if lease.reopen().is_err() {
                self.enter_fault(
                    operation,
                    PowerOperationAction::Wake,
                    PowerFaultCode::AdapterFailed,
                );
            } else {
                self.state = CoordinatorState::Active;
            }
        }
        Ok(self.snapshot())
    }

    /// Records an observed electrical loss without relabeling it as quiescence.
    ///
    /// If no power operation was active, launch admission is closed first in
    /// this still-running process. The closure is never reopened by this epoch.
    ///
    /// # Errors
    ///
    /// Returns an error when the native launch boundary cannot be closed.
    pub fn observe_unclean_power_loss(
        &mut self,
        launches: &NativeLaunchService,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        if self.launch_lease.is_none() {
            self.launch_lease = Some(launches.close_power_admission()?);
        }
        self.state = CoordinatorState::PowerLost;
        Ok(self.snapshot())
    }

    fn begin_idle(
        &mut self,
        now_ms: u64,
        launches: &NativeLaunchService,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.observe_and_expire(now_ms)?;
        self.require_phase(PowerPhase::Active, "idle request")?;
        let (operation, deadline_at_ms) =
            self.prepare_operation(now_ms, POWER_QUIESCE_WINDOW_MS)?;
        let lease = launches.close_power_admission()?;
        self.commit_operation_id();
        self.launch_lease = Some(lease);
        self.state = CoordinatorState::Quiescing(PendingPowerOperation {
            identity: Arc::new(OperationIdentity {
                reference: operation,
            }),
            action: PowerAction::Idle,
            deadline_at_ms,
            acknowledged: LAUNCH_ADMISSION_BIT,
        });
        Ok(self.snapshot())
    }

    fn begin_wake(
        &mut self,
        source: WakeSource,
        now_ms: u64,
    ) -> Result<PowerSnapshot, PowerCoordinatorError> {
        self.require_phase(PowerPhase::Idle, "wake request")?;
        let (operation, deadline_at_ms) = self.prepare_operation(now_ms, POWER_WAKE_WINDOW_MS)?;
        self.commit_operation_id();
        self.state = CoordinatorState::Waking(PendingWakeOperation {
            identity: Arc::new(OperationIdentity {
                reference: operation,
            }),
            source,
            deadline_at_ms,
            acknowledged: 0,
        });
        Ok(self.snapshot())
    }

    fn phase(&self) -> PowerPhase {
        match self.state {
            CoordinatorState::Active => PowerPhase::Active,
            CoordinatorState::Confirming(_) => PowerPhase::Confirming,
            CoordinatorState::Quiescing(_) => PowerPhase::Quiescing,
            CoordinatorState::TransitionReady(_) => PowerPhase::TransitionReady,
            CoordinatorState::Idle => PowerPhase::Idle,
            CoordinatorState::Waking(_) => PowerPhase::Waking,
            CoordinatorState::PowerTransfer { .. } => PowerPhase::PowerTransfer,
            CoordinatorState::Fault(_) => PowerPhase::Fault,
            CoordinatorState::PowerLost => PowerPhase::PowerLost,
        }
    }

    fn target_for(&self, action: PowerAction) -> PlatformPowerTarget {
        match action {
            PowerAction::Idle => match self.idle_strategy {
                IdleStrategy::PlatformSuspend => PlatformPowerTarget::PlatformSuspend,
                IdleStrategy::LowPowerLauncherIdle => PlatformPowerTarget::LowPowerLauncherIdle,
            },
            PowerAction::Restart => PlatformPowerTarget::Restart,
            PowerAction::Shutdown => PlatformPowerTarget::Shutdown,
        }
    }

    fn observe_and_expire(&mut self, now_ms: u64) -> Result<(), PowerCoordinatorError> {
        self.observe_time(now_ms)?;
        self.expire(now_ms);
        Ok(())
    }

    fn observe_time(&mut self, now_ms: u64) -> Result<(), PowerCoordinatorError> {
        if now_ms < self.last_observed_ms {
            return Err(PowerCoordinatorError::ClockRollback);
        }
        self.last_observed_ms = now_ms;
        Ok(())
    }

    fn expire(&mut self, now_ms: u64) {
        match &self.state {
            CoordinatorState::Confirming(confirmation) if now_ms >= confirmation.expires_at_ms => {
                self.state = CoordinatorState::Active;
            }
            CoordinatorState::Quiescing(operation)
            | CoordinatorState::TransitionReady(operation)
                if now_ms >= operation.deadline_at_ms =>
            {
                let operation_ref = operation.identity.reference;
                let action = operation.action.into();
                self.enter_fault(operation_ref, action, PowerFaultCode::DeadlineExpired);
            }
            CoordinatorState::Waking(operation) if now_ms >= operation.deadline_at_ms => {
                let operation_ref = operation.identity.reference;
                self.enter_fault(
                    operation_ref,
                    PowerOperationAction::Wake,
                    PowerFaultCode::DeadlineExpired,
                );
            }
            _ => {}
        }
    }

    fn enter_fault(
        &mut self,
        operation: PowerOperationRef,
        action: PowerOperationAction,
        code: PowerFaultCode,
    ) {
        self.state = CoordinatorState::Fault(PowerFaultSnapshot {
            operation,
            action,
            code,
        });
    }

    fn prepare_operation(
        &self,
        now_ms: u64,
        window_ms: u64,
    ) -> Result<(PowerOperationRef, u64), PowerCoordinatorError> {
        if self.next_operation_id == 0 || self.next_operation_id == u64::MAX {
            return Err(PowerCoordinatorError::OperationIdsExhausted);
        }
        Ok((
            PowerOperationRef {
                epoch: self.operation_epoch,
                operation_id: self.next_operation_id,
            },
            Self::add_window(now_ms, window_ms)?,
        ))
    }

    fn commit_operation_id(&mut self) {
        self.next_operation_id += 1;
    }

    fn add_window(now_ms: u64, window_ms: u64) -> Result<u64, PowerCoordinatorError> {
        now_ms
            .checked_add(window_ms)
            .ok_or(PowerCoordinatorError::DeadlineOverflow)
    }

    fn validate_operation_ref(
        &self,
        operation: PowerOperationRef,
    ) -> Result<(), PowerCoordinatorError> {
        if operation.epoch != self.operation_epoch || operation.operation_id == 0 {
            Err(PowerCoordinatorError::WrongCoordinatorEpoch)
        } else {
            Ok(())
        }
    }

    fn require_phase(
        &self,
        required: PowerPhase,
        action: &'static str,
    ) -> Result<(), PowerCoordinatorError> {
        let phase = self.phase();
        if phase == required {
            Ok(())
        } else {
            Err(PowerCoordinatorError::WrongPhase { action, phase })
        }
    }
}

fn quiesce_snapshot(operation: &PendingPowerOperation) -> PendingOperationSnapshot {
    let acknowledged = PowerQuiesceGate::ALL
        .into_iter()
        .filter(|gate| operation.acknowledged & gate.bit() != 0)
        .collect();
    let missing = PowerQuiesceGate::ALL
        .into_iter()
        .filter(|gate| operation.acknowledged & gate.bit() == 0)
        .collect();
    PendingOperationSnapshot::Quiesce {
        operation: operation.identity.reference,
        action: operation.action,
        deadline_at_ms: operation.deadline_at_ms,
        acknowledged,
        missing,
    }
}

fn wake_snapshot(operation: &PendingWakeOperation) -> PendingOperationSnapshot {
    let acknowledged = PowerWakeGate::ALL
        .into_iter()
        .filter(|gate| operation.acknowledged & gate.bit() != 0)
        .collect();
    let missing = PowerWakeGate::ALL
        .into_iter()
        .filter(|gate| operation.acknowledged & gate.bit() == 0)
        .collect();
    PendingOperationSnapshot::Wake {
        operation: operation.identity.reference,
        source: operation.source,
        deadline_at_ms: operation.deadline_at_ms,
        acknowledged,
        missing,
    }
}

fn wake_event(source: WakeSource) -> PowerInputEvent {
    match source {
        WakeSource::PhysicalPowerButton => PowerInputEvent::ShortPhysicalPowerPress,
        WakeSource::Controller => PowerInputEvent::ControllerWake,
        WakeSource::Remote => PowerInputEvent::RemoteWake,
        WakeSource::HdmiCec => PowerInputEvent::HdmiCecWake,
    }
}

fn require_qualified(qualification: InputQualification) -> Result<(), PowerCoordinatorError> {
    match qualification {
        InputQualification::Qualified => Ok(()),
        InputQualification::Unsupported => Err(PowerCoordinatorError::InputUnsupported),
        InputQualification::Unavailable => {
            Err(PowerCoordinatorError::InputQualificationUnavailable)
        }
    }
}

#[derive(Debug)]
pub enum PowerCoordinatorError {
    InvalidEpoch,
    InvalidOperationId,
    ClockRollback,
    DeadlineOverflow,
    OperationIdsExhausted,
    WrongCoordinatorEpoch,
    WrongPhase {
        action: &'static str,
        phase: PowerPhase,
    },
    OperationNotLive,
    InputUnsupported,
    InputQualificationUnavailable,
    Launch(NativeLaunchError),
}

impl fmt::Display for PowerCoordinatorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidEpoch => formatter.write_str("power coordinator epoch must be positive"),
            Self::InvalidOperationId => {
                formatter.write_str("first power operation ID is invalid or exhausted")
            }
            Self::ClockRollback => formatter.write_str("power monotonic clock moved backwards"),
            Self::DeadlineOverflow => formatter.write_str("power deadline exceeds clock range"),
            Self::OperationIdsExhausted => {
                formatter.write_str("power operation identifier space is exhausted")
            }
            Self::WrongCoordinatorEpoch => {
                formatter.write_str("power operation has the wrong coordinator epoch")
            }
            Self::WrongPhase { action, phase } => {
                write!(formatter, "{action} is unavailable in {phase:?} phase")
            }
            Self::OperationNotLive => {
                formatter.write_str("no matching live power operation exists")
            }
            Self::InputUnsupported => {
                formatter.write_str("power input source is not qualified on this platform")
            }
            Self::InputQualificationUnavailable => {
                formatter.write_str("power input qualification is unavailable")
            }
            Self::Launch(error) => write!(formatter, "launch admission closure failed: {error}"),
        }
    }
}

impl Error for PowerCoordinatorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Launch(error) => Some(error),
            _ => None,
        }
    }
}

impl From<NativeLaunchError> for PowerCoordinatorError {
    fn from(error: NativeLaunchError) -> Self {
        Self::Launch(error)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::installed_catalog::tests::signed_catalog;

    struct Input {
        result: InputQualification,
        events: Vec<PowerInputEvent>,
    }

    impl PowerInputAdapter for Input {
        fn qualify(&mut self, event: PowerInputEvent) -> InputQualification {
            self.events.push(event);
            self.result
        }
    }

    struct Quiesce {
        result: AdapterAcknowledgement,
        requests: Vec<PowerQuiesceRequest>,
    }

    impl PowerQuiesceAdapter for Quiesce {
        fn quiesce(&mut self, request: PowerQuiesceRequest) -> TimedAdapterAcknowledgement {
            self.requests.push(request);
            TimedAdapterAcknowledgement {
                acknowledgement: self.result,
                completed_at_ms: request.observed_at_ms(),
            }
        }
    }

    struct Wake {
        result: AdapterAcknowledgement,
        requests: Vec<PowerWakeRequest>,
    }

    impl PowerWakeAdapter for Wake {
        fn ready(&mut self, request: PowerWakeRequest) -> TimedAdapterAcknowledgement {
            self.requests.push(request);
            TimedAdapterAcknowledgement {
                acknowledgement: self.result,
                completed_at_ms: request.observed_at_ms(),
            }
        }
    }

    struct Platform {
        result: AdapterAcknowledgement,
        requests: Vec<PlatformTransitionRequest>,
    }

    impl PlatformPowerAdapter for Platform {
        fn start_transition(
            &mut self,
            request: PlatformTransitionRequest,
        ) -> TimedAdapterAcknowledgement {
            self.requests.push(request);
            TimedAdapterAcknowledgement {
                acknowledgement: self.result,
                completed_at_ms: request.observed_at_ms(),
            }
        }
    }

    struct LateQuiesce;

    impl PowerQuiesceAdapter for LateQuiesce {
        fn quiesce(&mut self, request: PowerQuiesceRequest) -> TimedAdapterAcknowledgement {
            TimedAdapterAcknowledgement {
                acknowledgement: AdapterAcknowledgement::Complete,
                completed_at_ms: request.deadline_at_ms(),
            }
        }
    }

    struct LateWake;

    impl PowerWakeAdapter for LateWake {
        fn ready(&mut self, request: PowerWakeRequest) -> TimedAdapterAcknowledgement {
            TimedAdapterAcknowledgement {
                acknowledgement: AdapterAcknowledgement::Complete,
                completed_at_ms: request.deadline_at_ms(),
            }
        }
    }

    struct LatePlatform;

    impl PlatformPowerAdapter for LatePlatform {
        fn start_transition(
            &mut self,
            request: PlatformTransitionRequest,
        ) -> TimedAdapterAcknowledgement {
            TimedAdapterAcknowledgement {
                acknowledgement: AdapterAcknowledgement::Complete,
                completed_at_ms: request.deadline_at_ms(),
            }
        }
    }

    fn launches() -> NativeLaunchService {
        NativeLaunchService::new(
            Arc::new(signed_catalog().1),
            vec!["local-player".to_owned()],
        )
        .expect("launch service configures")
    }

    fn complete_quiescence(
        coordinator: &mut PowerCoordinator,
        operation: PowerOperationRef,
        start_ms: u64,
    ) {
        let mut adapter = Quiesce {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        for (offset, gate) in [
            PowerServiceGate::GameStoppedOrSuspended,
            PowerServiceGate::TrackerStopped,
            PowerServiceGate::CameraCaptureStopped,
            PowerServiceGate::InputReleased,
            PowerServiceGate::WritesQuiesced,
            PowerServiceGate::UpdateStateSafe,
        ]
        .into_iter()
        .enumerate()
        {
            coordinator
                .quiesce_service(operation, gate, &mut adapter, start_ms + offset as u64)
                .expect("gate completes");
        }
        assert_eq!(adapter.requests.len(), 6);
    }

    fn enter_idle(
        strategy: IdleStrategy,
    ) -> (
        NativeLaunchService,
        PowerCoordinator,
        PowerOperationRef,
        PlatformPowerTarget,
    ) {
        let launches = launches();
        let mut coordinator =
            PowerCoordinator::new(strategy, 41, 1).expect("coordinator configures");
        let snapshot = coordinator
            .request_local_idle(10, &launches)
            .expect("idle begins");
        let PendingOperationSnapshot::Quiesce { operation, .. } =
            snapshot.pending_operation.expect("operation exists")
        else {
            panic!("quiescence expected");
        };
        complete_quiescence(&mut coordinator, operation, 11);
        let mut platform = Platform {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        coordinator
            .start_platform_transition(operation, &mut platform, 20)
            .expect("idle handoff starts");
        (
            launches,
            coordinator,
            operation,
            platform.requests[0].target(),
        )
    }

    #[test]
    fn closes_launch_admission_before_any_service_gate() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 7, 1).unwrap();
        let snapshot = coordinator.request_local_idle(100, &launches).unwrap();
        let PendingOperationSnapshot::Quiesce {
            operation,
            acknowledged,
            missing,
            ..
        } = snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        assert_eq!(acknowledged, vec![PowerQuiesceGate::LaunchAdmissionClosed]);
        assert_eq!(missing.len(), 6);
        assert!(matches!(
            launches.start(
                "01010101010101010101010101010101",
                "retro-2048",
                "local-player"
            ),
            Err(NativeLaunchError::PowerTransitionActive)
        ));

        let mut adapter = Quiesce {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        coordinator
            .quiesce_service(
                operation,
                PowerServiceGate::TrackerStopped,
                &mut adapter,
                101,
            )
            .unwrap();
        assert_eq!(adapter.requests[0].operation(), operation);
        assert_eq!(adapter.requests[0].gate(), PowerServiceGate::TrackerStopped);
        assert_eq!(adapter.requests[0].observed_at_ms(), 101);
        assert_eq!(adapter.requests[0].deadline_at_ms(), 60_100);
    }

    #[test]
    fn maps_both_idle_strategies_to_exact_adapter_targets() {
        for (strategy, target) in [
            (
                IdleStrategy::PlatformSuspend,
                PlatformPowerTarget::PlatformSuspend,
            ),
            (
                IdleStrategy::LowPowerLauncherIdle,
                PlatformPowerTarget::LowPowerLauncherIdle,
            ),
        ] {
            let (_, coordinator, _, observed_target) = enter_idle(strategy);
            assert_eq!(coordinator.snapshot().phase, PowerPhase::Idle);
            assert_eq!(coordinator.snapshot().idle_strategy, strategy);
            assert!(!coordinator.snapshot().can_admit_launch);
            assert_eq!(observed_target, target);
        }
    }

    #[test]
    fn duplicate_gate_is_idempotent_without_reinvoking_adapter() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 2, 1).unwrap();
        let snapshot = coordinator.request_local_idle(0, &launches).unwrap();
        let PendingOperationSnapshot::Quiesce { operation, .. } =
            snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        let mut adapter = Quiesce {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        coordinator
            .quiesce_service(operation, PowerServiceGate::TrackerStopped, &mut adapter, 1)
            .unwrap();
        coordinator
            .quiesce_service(operation, PowerServiceGate::TrackerStopped, &mut adapter, 2)
            .unwrap();
        assert_eq!(adapter.requests.len(), 1);
    }

    #[test]
    fn unsafe_update_or_ambiguous_adapter_is_terminal() {
        for (gate, result, code) in [
            (
                PowerServiceGate::UpdateStateSafe,
                AdapterAcknowledgement::UnsafeUpdateState,
                PowerFaultCode::UnsafeUpdateState,
            ),
            (
                PowerServiceGate::CameraCaptureStopped,
                AdapterAcknowledgement::Unavailable,
                PowerFaultCode::AdapterFailed,
            ),
        ] {
            let launches = launches();
            let mut coordinator =
                PowerCoordinator::new(IdleStrategy::PlatformSuspend, 3, 1).unwrap();
            let snapshot = coordinator.request_local_idle(0, &launches).unwrap();
            let PendingOperationSnapshot::Quiesce { operation, .. } =
                snapshot.pending_operation.unwrap()
            else {
                panic!("quiescence expected");
            };
            let mut adapter = Quiesce {
                result,
                requests: Vec::new(),
            };
            let failed = coordinator
                .quiesce_service(operation, gate, &mut adapter, 1)
                .unwrap();
            assert_eq!(failed.phase, PowerPhase::Fault);
            assert_eq!(failed.fault.unwrap().code, code);
            assert!(matches!(
                launches.start(
                    "02020202020202020202020202020202",
                    "retro-2048",
                    "local-player"
                ),
                Err(NativeLaunchError::PowerTransitionActive)
            ));
        }
    }

    #[test]
    fn restart_confirmation_is_exact_expiring_and_not_cancelable_after_quiescence() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 9, 4).unwrap();
        let requested = coordinator
            .request_explicit_transition(ExplicitPowerAction::Restart, 10)
            .unwrap();
        assert!(requested.can_admit_launch);
        let operation = requested.pending_confirmation.unwrap().operation;
        assert!(matches!(
            coordinator.confirm_explicit_transition(
                PowerOperationRef {
                    epoch: 10,
                    operation_id: 4
                },
                11,
                &launches
            ),
            Err(PowerCoordinatorError::WrongCoordinatorEpoch)
        ));
        coordinator
            .confirm_explicit_transition(operation, 12, &launches)
            .unwrap();
        assert!(matches!(
            coordinator.cancel_explicit_transition(operation, 13),
            Err(PowerCoordinatorError::OperationNotLive)
        ));

        let mut expired = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 10, 1).unwrap();
        expired
            .request_explicit_transition(ExplicitPowerAction::Shutdown, 0)
            .unwrap();
        assert_eq!(
            expired.tick(POWER_CONFIRMATION_WINDOW_MS).unwrap().phase,
            PowerPhase::Active
        );
    }

    #[test]
    fn transition_deadline_includes_platform_handoff() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 11, 1).unwrap();
        let snapshot = coordinator.request_local_idle(0, &launches).unwrap();
        let PendingOperationSnapshot::Quiesce { operation, .. } =
            snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        complete_quiescence(&mut coordinator, operation, 1);
        assert_eq!(
            coordinator.tick(POWER_QUIESCE_WINDOW_MS).unwrap().phase,
            PowerPhase::Fault
        );
        assert_eq!(
            coordinator.snapshot().fault.unwrap().code,
            PowerFaultCode::DeadlineExpired
        );
    }

    #[test]
    fn late_service_platform_and_wake_completions_cannot_advance() {
        let service_launches = launches();
        let mut service_late = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 31, 1).unwrap();
        let service_snapshot = service_late
            .request_local_idle(0, &service_launches)
            .unwrap();
        let PendingOperationSnapshot::Quiesce {
            operation: service_operation,
            ..
        } = service_snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        assert_eq!(
            service_late
                .quiesce_service(
                    service_operation,
                    PowerServiceGate::TrackerStopped,
                    &mut LateQuiesce,
                    1,
                )
                .unwrap()
                .phase,
            PowerPhase::Fault
        );

        let platform_launches = launches();
        let mut platform_late =
            PowerCoordinator::new(IdleStrategy::PlatformSuspend, 32, 1).unwrap();
        let platform_snapshot = platform_late
            .request_local_idle(0, &platform_launches)
            .unwrap();
        let PendingOperationSnapshot::Quiesce {
            operation: platform_operation,
            ..
        } = platform_snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        complete_quiescence(&mut platform_late, platform_operation, 1);
        assert_eq!(
            platform_late
                .start_platform_transition(platform_operation, &mut LatePlatform, 10)
                .unwrap()
                .phase,
            PowerPhase::Fault
        );

        let (_, mut wake_late, _, _) = enter_idle(IdleStrategy::PlatformSuspend);
        let mut input = Input {
            result: InputQualification::Qualified,
            events: Vec::new(),
        };
        let wake_snapshot = wake_late
            .request_wake(WakeSource::Controller, &mut input, 21)
            .unwrap();
        let PendingOperationSnapshot::Wake {
            operation: wake_operation,
            ..
        } = wake_snapshot.pending_operation.unwrap()
        else {
            panic!("wake expected");
        };
        assert_eq!(
            wake_late
                .acknowledge_wake(
                    wake_operation,
                    PowerWakeGate::LauncherReady,
                    &mut LateWake,
                    22,
                )
                .unwrap()
                .phase,
            PowerPhase::Fault
        );
    }

    #[test]
    fn qualified_short_press_idles_and_wakes_but_not_during_transition() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 12, 1).unwrap();
        let mut input = Input {
            result: InputQualification::Qualified,
            events: Vec::new(),
        };
        let snapshot = coordinator
            .short_press_power_button(&mut input, 0, &launches)
            .unwrap();
        assert_eq!(snapshot.phase, PowerPhase::Quiescing);
        assert!(matches!(
            coordinator.short_press_power_button(&mut input, 1, &launches),
            Err(PowerCoordinatorError::WrongPhase { .. })
        ));
        assert_eq!(input.events, vec![PowerInputEvent::ShortPhysicalPowerPress]);
    }

    #[test]
    fn wake_requires_qualification_and_all_readiness_before_reopening_launches() {
        let (launches, mut coordinator, _, _) = enter_idle(IdleStrategy::PlatformSuspend);
        let mut input = Input {
            result: InputQualification::Unsupported,
            events: Vec::new(),
        };
        assert!(matches!(
            coordinator.request_wake(WakeSource::Controller, &mut input, 21),
            Err(PowerCoordinatorError::InputUnsupported)
        ));
        assert_eq!(coordinator.snapshot().phase, PowerPhase::Idle);

        input.result = InputQualification::Qualified;
        let waking = coordinator
            .request_wake(WakeSource::Controller, &mut input, 22)
            .unwrap();
        let PendingOperationSnapshot::Wake { operation, .. } = waking.pending_operation.unwrap()
        else {
            panic!("wake expected");
        };
        let mut ready = Wake {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        coordinator
            .acknowledge_wake(operation, PowerWakeGate::LauncherReady, &mut ready, 23)
            .unwrap();
        coordinator
            .acknowledge_wake(operation, PowerWakeGate::DisplayReady, &mut ready, 24)
            .unwrap();
        assert!(matches!(
            launches.start(
                "03030303030303030303030303030303",
                "retro-2048",
                "local-player"
            ),
            Err(NativeLaunchError::PowerTransitionActive)
        ));
        let active = coordinator
            .acknowledge_wake(operation, PowerWakeGate::InputReady, &mut ready, 25)
            .unwrap();
        assert_eq!(active.phase, PowerPhase::Active);
        assert!(active.can_admit_launch);
        assert_eq!(ready.requests.len(), 3);
    }

    #[test]
    fn platform_failure_and_restart_handoff_are_terminal_and_one_shot() {
        let first_launches = launches();
        let mut failed = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 13, 1).unwrap();
        let snapshot = failed.request_local_idle(0, &first_launches).unwrap();
        let PendingOperationSnapshot::Quiesce { operation, .. } =
            snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        complete_quiescence(&mut failed, operation, 1);
        let mut platform = Platform {
            result: AdapterAcknowledgement::Failed,
            requests: Vec::new(),
        };
        assert_eq!(
            failed
                .start_platform_transition(operation, &mut platform, 10)
                .unwrap()
                .phase,
            PowerPhase::Fault
        );
        assert!(matches!(
            failed.start_platform_transition(operation, &mut platform, 11),
            Err(PowerCoordinatorError::OperationNotLive)
        ));

        let other_launches = launches();
        let mut restart = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 14, 1).unwrap();
        let confirmation = restart
            .request_explicit_transition(ExplicitPowerAction::Restart, 0)
            .unwrap()
            .pending_confirmation
            .unwrap();
        restart
            .confirm_explicit_transition(confirmation.operation, 1, &other_launches)
            .unwrap();
        complete_quiescence(&mut restart, confirmation.operation, 2);
        let mut success = Platform {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        let transferred = restart
            .start_platform_transition(confirmation.operation, &mut success, 10)
            .unwrap();
        assert_eq!(transferred.phase, PowerPhase::PowerTransfer);
        assert_eq!(
            transferred.platform_handoff,
            Some(ReadyTransitionSnapshot {
                operation: confirmation.operation,
                target: PlatformPowerTarget::Restart,
            })
        );
    }

    #[test]
    fn rejects_clock_rollback_deadline_overflow_and_identifier_exhaustion() {
        let mut rollback = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 15, 1).unwrap();
        rollback.tick(10).unwrap();
        assert!(matches!(
            rollback.tick(9),
            Err(PowerCoordinatorError::ClockRollback)
        ));

        let mut overflow = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 16, 1).unwrap();
        assert!(matches!(
            overflow.request_explicit_transition(
                ExplicitPowerAction::Restart,
                u64::MAX - POWER_CONFIRMATION_WINDOW_MS + 1
            ),
            Err(PowerCoordinatorError::DeadlineOverflow)
        ));

        assert!(matches!(
            PowerCoordinator::new(IdleStrategy::PlatformSuspend, 17, u64::MAX),
            Err(PowerCoordinatorError::InvalidOperationId)
        ));
    }

    #[test]
    fn cross_epoch_and_stale_operation_references_do_not_advance_state() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 18, 1).unwrap();
        let snapshot = coordinator.request_local_idle(0, &launches).unwrap();
        let PendingOperationSnapshot::Quiesce { operation, .. } =
            snapshot.pending_operation.unwrap()
        else {
            panic!("quiescence expected");
        };
        let mut adapter = Quiesce {
            result: AdapterAcknowledgement::Complete,
            requests: Vec::new(),
        };
        assert!(matches!(
            coordinator.quiesce_service(
                PowerOperationRef {
                    epoch: 19,
                    operation_id: operation.operation_id()
                },
                PowerServiceGate::TrackerStopped,
                &mut adapter,
                1
            ),
            Err(PowerCoordinatorError::WrongCoordinatorEpoch)
        ));
        assert!(matches!(
            coordinator.quiesce_service(
                PowerOperationRef {
                    epoch: 18,
                    operation_id: operation.operation_id() + 1
                },
                PowerServiceGate::TrackerStopped,
                &mut adapter,
                2
            ),
            Err(PowerCoordinatorError::OperationNotLive)
        ));
        assert!(adapter.requests.is_empty());
    }

    #[test]
    fn unclean_loss_closes_admission_without_claiming_quiescence() {
        let launches = launches();
        let mut coordinator = PowerCoordinator::new(IdleStrategy::PlatformSuspend, 20, 1).unwrap();
        assert_eq!(
            coordinator
                .observe_unclean_power_loss(&launches)
                .unwrap()
                .phase,
            PowerPhase::PowerLost
        );
        assert!(coordinator.snapshot().pending_operation.is_none());
        assert!(matches!(
            launches.start(
                "04040404040404040404040404040404",
                "retro-2048",
                "local-player"
            ),
            Err(NativeLaunchError::PowerTransitionActive)
        ));
    }
}
