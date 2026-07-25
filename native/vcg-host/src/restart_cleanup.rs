//! Privileged proof boundary for native-launch restart cleanup.
//!
//! A recovered launch barrier may be cleared only with an in-memory proof tied
//! to that exact service instance. The platform adapter remains responsible
//! for terminating and inspecting the prior game process scope.

use std::error::Error;
use std::fmt;
use std::sync::Arc;

/// Closed result from a privileged process-scope cleanup adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestartCleanupInspection {
    /// The adapter terminated any survivors and proved the prior scope empty.
    Empty,
    /// At least one prior descendant remains.
    NotEmpty,
    /// Scope ownership or inspection is unavailable or ambiguous.
    Unavailable,
}

/// Target-specific privileged boundary that owns the prior game process scope.
///
/// A production implementation must use a qualified service-manager/cgroup or
/// equivalent operating-system primitive. Returning `Empty` is security
/// authority; browser, game, hosted-content, and ordinary loopback inputs must
/// never implement or select this adapter.
pub trait RestartCleanupAdapter {
    fn terminate_and_inspect_prior_scope(&mut self) -> RestartCleanupInspection;
}

#[derive(Debug)]
pub(crate) struct RestartCleanupBarrierIdentity {
    _private: (),
}

impl RestartCleanupBarrierIdentity {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self { _private: () })
    }
}

/// Opaque request for cleanup proof of one exact recovered barrier.
///
/// The request is non-cloneable and non-serializable. Another request may be
/// issued for retry while the same barrier remains active.
#[derive(Debug)]
pub struct RestartCleanupRequest {
    identity: Arc<RestartCleanupBarrierIdentity>,
}

impl RestartCleanupRequest {
    pub(crate) fn new(identity: &Arc<RestartCleanupBarrierIdentity>) -> Self {
        Self {
            identity: Arc::clone(identity),
        }
    }
}

/// Non-serializable proof that one privileged adapter reported the exact
/// request's prior process scope empty.
#[derive(Debug)]
pub struct VerifiedRestartCleanup {
    identity: Arc<RestartCleanupBarrierIdentity>,
}

impl VerifiedRestartCleanup {
    pub(crate) fn into_identity(self) -> Arc<RestartCleanupBarrierIdentity> {
        self.identity
    }
}

/// Invokes the privileged adapter exactly once for one opaque cleanup request.
///
/// # Errors
///
/// Returns a closed error when descendants remain or inspection is ambiguous.
pub fn verify_restart_cleanup(
    request: RestartCleanupRequest,
    adapter: &mut impl RestartCleanupAdapter,
) -> Result<VerifiedRestartCleanup, RestartCleanupVerificationError> {
    match adapter.terminate_and_inspect_prior_scope() {
        RestartCleanupInspection::Empty => Ok(VerifiedRestartCleanup {
            identity: request.identity,
        }),
        RestartCleanupInspection::NotEmpty => {
            Err(RestartCleanupVerificationError::DescendantsRemain)
        }
        RestartCleanupInspection::Unavailable => {
            Err(RestartCleanupVerificationError::InspectionUnavailable)
        }
    }
}

/// Closed privileged cleanup-verification failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestartCleanupVerificationError {
    DescendantsRemain,
    InspectionUnavailable,
}

impl fmt::Display for RestartCleanupVerificationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DescendantsRemain => {
                formatter.write_str("prior native launch descendants remain")
            }
            Self::InspectionUnavailable => {
                formatter.write_str("prior native launch scope inspection is unavailable")
            }
        }
    }
}

impl Error for RestartCleanupVerificationError {}
