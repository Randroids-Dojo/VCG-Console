//! Persistent workstation trust and volatile developer-session admission.
//!
//! This module deliberately stops before network transport, key storage, and
//! package installation. A privileged adapter owns those boundaries. The
//! primitives here ensure that writable workstation trust cannot silently roll
//! back, that every live session proves possession of one currently trusted
//! Ed25519 key, and that only a bounded closed developer operation can leave
//! the admission layer.

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;
use std::sync::{Arc, Mutex};

use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MAX_DEVELOPER_TRUST_BYTES: usize = 16 * 1_024;
pub const MAX_PROTECTED_DEVELOPER_TRUST_BYTES: usize = 4 * 1_024;
pub const MAX_TRUSTED_WORKSTATIONS: usize = 32;
pub const MAX_DEVELOPER_OPERATION_IDS: usize = 1_024;
pub const MAX_DEVELOPER_SESSION_MS: u64 = 15 * 60 * 1_000;
pub const MAX_DEVELOPER_CHALLENGE_MS: u64 = 60 * 1_000;
pub const MAX_DEVELOPER_ARTIFACT_BYTES: u64 = 8 * 1_024 * 1_024 * 1_024;

const TRUST_SCHEMA_VERSION: u32 = 1;
const SESSION_PROTOCOL_VERSION: u32 = 1;
const SESSION_DOMAIN: &[u8] = b"vcg-developer-session-v1\0";

/// Exact workstation-trust identity held by protected platform state.
///
/// JSON is only an adapter representation. Persisting it beside the writable
/// registry does not protect it from rollback or substitution.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedDeveloperTrustState {
    schema_version: u32,
    generation: u64,
    registry_sha256: Option<String>,
}

impl ProtectedDeveloperTrustState {
    #[must_use]
    pub const fn uninitialized() -> Self {
        Self {
            schema_version: TRUST_SCHEMA_VERSION,
            generation: 0,
            registry_sha256: None,
        }
    }

    /// Parses one strict bounded protected-state adapter document.
    ///
    /// # Errors
    ///
    /// Rejects malformed, noncanonical, unknown, oversized, or inconsistent
    /// state.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, DeveloperPairingError> {
        require_bounded(
            bytes,
            MAX_PROTECTED_DEVELOPER_TRUST_BYTES,
            "protected trust state",
        )?;
        let state: Self = serde_json::from_slice(bytes).map_err(|error| {
            DeveloperPairingError::InvalidProtectedState(format!(
                "protected trust state is malformed: {error}"
            ))
        })?;
        state.validate()?;
        let canonical = serde_json::to_vec(&state)
            .map_err(|error| DeveloperPairingError::InvalidProtectedState(error.to_string()))?;
        if canonical != bytes {
            return Err(DeveloperPairingError::InvalidProtectedState(
                "protected trust state must be canonical JSON".to_owned(),
            ));
        }
        Ok(state)
    }

    /// Serializes the exact canonical adapter document.
    ///
    /// # Errors
    ///
    /// Returns an error only if serialization of the fixed schema fails.
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, DeveloperPairingError> {
        serde_json::to_vec(self)
            .map_err(|error| DeveloperPairingError::InvalidProtectedState(error.to_string()))
    }

    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub fn registry_sha256(&self) -> Option<&str> {
        self.registry_sha256.as_deref()
    }

    fn for_registry(generation: u64, registry_bytes: &[u8]) -> Self {
        Self {
            schema_version: TRUST_SCHEMA_VERSION,
            generation,
            registry_sha256: Some(sha256_hex(registry_bytes)),
        }
    }

    fn validate(&self) -> Result<(), DeveloperPairingError> {
        if self.schema_version != TRUST_SCHEMA_VERSION {
            return Err(DeveloperPairingError::InvalidProtectedState(format!(
                "protected trust schema {} is unsupported",
                self.schema_version
            )));
        }
        match (self.generation, self.registry_sha256.as_deref()) {
            (0, None) => Ok(()),
            (0, Some(_)) => Err(DeveloperPairingError::InvalidProtectedState(
                "generation zero must not contain a registry digest".to_owned(),
            )),
            (_, None) => Err(DeveloperPairingError::InvalidProtectedState(
                "an initialized generation requires a registry digest".to_owned(),
            )),
            (_, Some(digest)) if is_canonical_sha256(digest) => Ok(()),
            (_, Some(_)) => Err(DeveloperPairingError::InvalidProtectedState(
                "registry digest must be canonical lowercase SHA-256".to_owned(),
            )),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeveloperTrustDocument {
    schema_version: u32,
    generation: u64,
    previous_registry_sha256: Option<String>,
    workstations: Vec<DeveloperWorkstationDocument>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeveloperWorkstationDocument {
    id: String,
    public_key: String,
}

/// A registry that exactly matches protected platform state and may authorize
/// developer-session challenges.
#[derive(Debug)]
pub struct DeveloperTrustRegistry {
    document: DeveloperTrustDocument,
    canonical_bytes: Vec<u8>,
    public_keys: BTreeMap<String, [u8; 32]>,
}

/// Result of validating writable registry bytes against protected state.
#[derive(Debug)]
pub enum DeveloperTrustLoad {
    Active(DeveloperTrustRegistry),
    /// Writable bytes are exactly one generation ahead. They remain unusable;
    /// a privileged recovery ceremony must decide whether to commit or discard
    /// the pending state.
    ProtectionCommitRequired(ProtectedDeveloperTrustState),
}

/// One locally authorized registry transition before its two durable commits.
#[derive(Clone, Debug)]
pub struct PendingDeveloperTrustRegistry {
    registry_bytes: Vec<u8>,
    next_protected_state: ProtectedDeveloperTrustState,
}

impl PendingDeveloperTrustRegistry {
    #[must_use]
    pub fn registry_bytes(&self) -> &[u8] {
        &self.registry_bytes
    }

    #[must_use]
    pub const fn next_protected_state(&self) -> &ProtectedDeveloperTrustState {
        &self.next_protected_state
    }
}

impl DeveloperTrustRegistry {
    /// Returns the only valid generation-zero registry.
    ///
    /// # Errors
    ///
    /// Returns an error only if serialization of the fixed schema fails.
    pub fn empty_json_bytes() -> Result<Vec<u8>, DeveloperPairingError> {
        canonical_registry_bytes(&DeveloperTrustDocument {
            schema_version: TRUST_SCHEMA_VERSION,
            generation: 0,
            previous_registry_sha256: None,
            workstations: Vec::new(),
        })
    }

    /// Loads strict writable registry bytes against exact protected state.
    ///
    /// # Errors
    ///
    /// Rejects malformed or noncanonical JSON, unsafe keys or identities,
    /// duplicates, excessive entries, rollback, substitution, unexplained
    /// generation jumps, and broken predecessor binding.
    pub fn load(
        bytes: &[u8],
        protected_state: &ProtectedDeveloperTrustState,
    ) -> Result<DeveloperTrustLoad, DeveloperPairingError> {
        protected_state.validate()?;
        require_bounded(bytes, MAX_DEVELOPER_TRUST_BYTES, "developer trust registry")?;
        let document: DeveloperTrustDocument = serde_json::from_slice(bytes).map_err(|error| {
            DeveloperPairingError::InvalidTrustRegistry(format!(
                "developer trust registry is malformed: {error}"
            ))
        })?;
        let canonical_bytes = canonical_registry_bytes(&document)?;
        if canonical_bytes != bytes {
            return Err(DeveloperPairingError::InvalidTrustRegistry(
                "developer trust registry must be canonical JSON".to_owned(),
            ));
        }
        let public_keys = validate_registry_document(&document)?;
        let digest = sha256_hex(bytes);

        if document.generation < protected_state.generation {
            return Err(DeveloperPairingError::TrustRollback {
                protected_generation: protected_state.generation,
                writable_generation: document.generation,
            });
        }
        if document.generation == protected_state.generation {
            if document.generation == 0 {
                return Ok(DeveloperTrustLoad::Active(Self {
                    document,
                    canonical_bytes,
                    public_keys,
                }));
            }
            if protected_state.registry_sha256.as_deref() != Some(digest.as_str()) {
                return Err(DeveloperPairingError::TrustSubstitution);
            }
            return Ok(DeveloperTrustLoad::Active(Self {
                document,
                canonical_bytes,
                public_keys,
            }));
        }

        let expected_generation = protected_state
            .generation
            .checked_add(1)
            .ok_or(DeveloperPairingError::GenerationExhausted)?;
        if document.generation != expected_generation {
            return Err(DeveloperPairingError::UnexplainedTrustAdvance {
                protected_generation: protected_state.generation,
                writable_generation: document.generation,
            });
        }
        let expected_predecessor = if protected_state.generation == 0 {
            sha256_hex(&Self::empty_json_bytes()?)
        } else {
            protected_state.registry_sha256.clone().ok_or_else(|| {
                DeveloperPairingError::InvalidProtectedState(
                    "an initialized generation requires a registry digest".to_owned(),
                )
            })?
        };
        if document.previous_registry_sha256.as_deref() != Some(expected_predecessor.as_str()) {
            return Err(DeveloperPairingError::BrokenTrustPredecessor);
        }
        Ok(DeveloperTrustLoad::ProtectionCommitRequired(
            ProtectedDeveloperTrustState::for_registry(document.generation, bytes),
        ))
    }

    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.document.generation
    }

    pub fn workstation_ids(&self) -> impl Iterator<Item = &str> {
        self.document
            .workstations
            .iter()
            .map(|workstation| workstation.id.as_str())
    }

    #[must_use]
    pub fn contains_workstation(&self, workstation_id: &str) -> bool {
        self.public_keys.contains_key(workstation_id)
    }

    /// Creates the next registry after a privileged local pairing
    /// confirmation. The caller must publish the returned registry bytes
    /// before atomically committing the exact returned protected state.
    ///
    /// # Errors
    ///
    /// Rejects an invalid key, duplicate key, exhausted generation, or full
    /// registry.
    pub fn pair_after_local_confirmation(
        &self,
        public_key: [u8; 32],
    ) -> Result<PendingDeveloperTrustRegistry, DeveloperPairingError> {
        VerifyingKey::from_bytes(&public_key)
            .map_err(|_| DeveloperPairingError::InvalidWorkstationKey)?;
        let workstation_id = workstation_id(&public_key);
        if self.public_keys.contains_key(&workstation_id) {
            return Err(DeveloperPairingError::WorkstationAlreadyTrusted(
                workstation_id,
            ));
        }
        if self.public_keys.len() >= MAX_TRUSTED_WORKSTATIONS {
            return Err(DeveloperPairingError::TooManyWorkstations {
                maximum: MAX_TRUSTED_WORKSTATIONS,
            });
        }
        let mut workstations = self.document.workstations.clone();
        workstations.push(DeveloperWorkstationDocument {
            id: workstation_id,
            public_key: encode_hex(&public_key),
        });
        workstations.sort_by(|left, right| left.id.cmp(&right.id));
        self.next_registry(workstations)
    }

    /// Creates the next registry after privileged local revocation.
    ///
    /// Revocation deletes the usable key from the next exact registry.
    /// Protected generation/digest advancement prevents an older registry from
    /// silently restoring it.
    ///
    /// # Errors
    ///
    /// Rejects an unknown workstation or exhausted generation.
    pub fn revoke_after_local_confirmation(
        &self,
        workstation_id: &str,
    ) -> Result<PendingDeveloperTrustRegistry, DeveloperPairingError> {
        if !self.public_keys.contains_key(workstation_id) {
            return Err(DeveloperPairingError::UnknownWorkstation(
                workstation_id.to_owned(),
            ));
        }
        let workstations = self
            .document
            .workstations
            .iter()
            .filter(|workstation| workstation.id != workstation_id)
            .cloned()
            .collect();
        self.next_registry(workstations)
    }

    fn next_registry(
        &self,
        workstations: Vec<DeveloperWorkstationDocument>,
    ) -> Result<PendingDeveloperTrustRegistry, DeveloperPairingError> {
        let generation = self
            .document
            .generation
            .checked_add(1)
            .ok_or(DeveloperPairingError::GenerationExhausted)?;
        let document = DeveloperTrustDocument {
            schema_version: TRUST_SCHEMA_VERSION,
            generation,
            previous_registry_sha256: Some(sha256_hex(&self.canonical_bytes)),
            workstations,
        };
        validate_registry_document(&document)?;
        let registry_bytes = canonical_registry_bytes(&document)?;
        let next_protected_state =
            ProtectedDeveloperTrustState::for_registry(generation, &registry_bytes);
        Ok(PendingDeveloperTrustRegistry {
            registry_bytes,
            next_protected_state,
        })
    }

    fn public_key(&self, workstation_id: &str) -> Option<[u8; 32]> {
        self.public_keys.get(workstation_id).copied()
    }
}

fn validate_registry_document(
    document: &DeveloperTrustDocument,
) -> Result<BTreeMap<String, [u8; 32]>, DeveloperPairingError> {
    if document.schema_version != TRUST_SCHEMA_VERSION {
        return Err(DeveloperPairingError::InvalidTrustRegistry(format!(
            "developer trust schema {} is unsupported",
            document.schema_version
        )));
    }
    match (
        document.generation,
        document.previous_registry_sha256.as_deref(),
        document.workstations.is_empty(),
    ) {
        (0, None, true) => {}
        (0, _, _) => {
            return Err(DeveloperPairingError::InvalidTrustRegistry(
                "generation zero must be empty and have no predecessor".to_owned(),
            ));
        }
        (_, Some(digest), _) if is_canonical_sha256(digest) => {}
        (_, Some(_), _) => {
            return Err(DeveloperPairingError::InvalidTrustRegistry(
                "predecessor digest must be canonical lowercase SHA-256".to_owned(),
            ));
        }
        (_, None, _) => {
            return Err(DeveloperPairingError::InvalidTrustRegistry(
                "initialized registry requires a predecessor digest".to_owned(),
            ));
        }
    }
    if document.workstations.len() > MAX_TRUSTED_WORKSTATIONS {
        return Err(DeveloperPairingError::TooManyWorkstations {
            maximum: MAX_TRUSTED_WORKSTATIONS,
        });
    }
    let mut previous_id: Option<&str> = None;
    let mut public_keys = BTreeMap::new();
    let mut unique_keys = BTreeSet::new();
    for workstation in &document.workstations {
        if previous_id.is_some_and(|previous| previous >= workstation.id.as_str()) {
            return Err(DeveloperPairingError::InvalidTrustRegistry(
                "workstations must be strictly sorted by derived ID".to_owned(),
            ));
        }
        let public_key = decode_hex::<32>(&workstation.public_key)
            .ok_or(DeveloperPairingError::InvalidWorkstationKey)?;
        VerifyingKey::from_bytes(&public_key)
            .map_err(|_| DeveloperPairingError::InvalidWorkstationKey)?;
        if workstation.id != workstation_id(&public_key) {
            return Err(DeveloperPairingError::InvalidWorkstationId(
                workstation.id.clone(),
            ));
        }
        if !unique_keys.insert(public_key) {
            return Err(DeveloperPairingError::DuplicateWorkstationKey);
        }
        previous_id = Some(&workstation.id);
        public_keys.insert(workstation.id.clone(), public_key);
    }
    Ok(public_keys)
}

fn canonical_registry_bytes(
    document: &DeveloperTrustDocument,
) -> Result<Vec<u8>, DeveloperPairingError> {
    serde_json::to_vec(document)
        .map_err(|error| DeveloperPairingError::InvalidTrustRegistry(error.to_string()))
}

/// Exact challenge signed by one trusted workstation for one volatile
/// developer-mode epoch.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeveloperSessionChallenge {
    workstation_id: String,
    session_ordinal: u64,
    session_epoch: [u8; 32],
    challenge_nonce: [u8; 32],
    expires_at_ms: u64,
}

impl DeveloperSessionChallenge {
    #[must_use]
    pub fn workstation_id(&self) -> &str {
        &self.workstation_id
    }

    #[must_use]
    pub const fn expires_at_ms(&self) -> u64 {
        self.expires_at_ms
    }

    /// Returns the exact domain-separated bytes the workstation must sign.
    #[must_use]
    pub fn signing_message(&self) -> Vec<u8> {
        let mut message = Vec::with_capacity(SESSION_DOMAIN.len() + 4 + 8 + 32 + 32);
        message.extend_from_slice(SESSION_DOMAIN);
        message.extend_from_slice(&SESSION_PROTOCOL_VERSION.to_be_bytes());
        message.extend_from_slice(&self.session_ordinal.to_be_bytes());
        message.extend_from_slice(&self.session_epoch);
        message.extend_from_slice(&self.challenge_nonce);
        message.extend_from_slice(&self.expires_at_ms.to_be_bytes());
        message
    }
}

#[derive(Debug)]
struct ActiveDeveloperSession {
    workstation_id: String,
    session_ordinal: u64,
}

#[derive(Debug)]
struct DeveloperSessionLiveness {
    active: bool,
    expires_at_ms: u64,
}

/// Unforgeable-by-data capability returned only after successful signature
/// verification. It is deliberately non-serializable.
#[derive(Debug)]
pub struct DeveloperSessionCapability {
    workstation_id: String,
    session_ordinal: u64,
    session_epoch: [u8; 32],
    expires_at_ms: u64,
}

/// Volatile admission authority for one visibly enabled developer-mode epoch.
///
/// Constructing this type is the privileged adapter boundary: the caller must
/// already have a fresh reserved-local-input confirmation. Dropping or closing
/// it invalidates every challenge and capability. It is never reconstructed
/// from disk after reboot.
#[derive(Debug)]
pub struct DeveloperSessionAuthority {
    registry: DeveloperTrustRegistry,
    session_epoch: [u8; 32],
    expires_at_ms: u64,
    next_session_ordinal: u64,
    pending_challenge: Option<DeveloperSessionChallenge>,
    active_session: Option<ActiveDeveloperSession>,
    used_request_ids: BTreeSet<String>,
    liveness: Arc<Mutex<DeveloperSessionLiveness>>,
    closed: bool,
}

impl DeveloperSessionAuthority {
    /// Starts one developer-mode epoch after privileged local confirmation.
    ///
    /// `session_epoch` must come from the operating-system random source and
    /// must not be persisted. `now_ms` and `expires_at_ms` share one monotonic
    /// clock.
    ///
    /// # Errors
    ///
    /// Rejects zero randomness and invalid or excessive session lifetimes.
    pub fn new_after_local_confirmation(
        registry: DeveloperTrustRegistry,
        session_epoch: [u8; 32],
        now_ms: u64,
        expires_at_ms: u64,
    ) -> Result<Self, DeveloperPairingError> {
        if session_epoch == [0; 32] {
            return Err(DeveloperPairingError::InvalidSessionRandomness);
        }
        let duration = expires_at_ms
            .checked_sub(now_ms)
            .ok_or(DeveloperPairingError::InvalidSessionDeadline)?;
        if duration == 0 || duration > MAX_DEVELOPER_SESSION_MS {
            return Err(DeveloperPairingError::InvalidSessionDeadline);
        }
        Ok(Self {
            registry,
            session_epoch,
            expires_at_ms,
            next_session_ordinal: 1,
            pending_challenge: None,
            active_session: None,
            used_request_ids: BTreeSet::new(),
            liveness: Arc::new(Mutex::new(DeveloperSessionLiveness {
                active: true,
                expires_at_ms,
            })),
            closed: false,
        })
    }

    /// Opens one possession challenge for an exact trusted workstation.
    ///
    /// # Errors
    ///
    /// Rejects closed/expired authority, unknown workstations, zero random
    /// nonces, an existing challenge/session, or invalid deadlines.
    pub fn begin_challenge(
        &mut self,
        workstation_id: &str,
        challenge_nonce: [u8; 32],
        now_ms: u64,
        expires_at_ms: u64,
    ) -> Result<DeveloperSessionChallenge, DeveloperPairingError> {
        self.require_open(now_ms)?;
        if challenge_nonce == [0; 32] {
            return Err(DeveloperPairingError::InvalidSessionRandomness);
        }
        if self.pending_challenge.is_some() || self.active_session.is_some() {
            return Err(DeveloperPairingError::DeveloperSessionBusy);
        }
        if !self.registry.contains_workstation(workstation_id) {
            return Err(DeveloperPairingError::UnknownWorkstation(
                workstation_id.to_owned(),
            ));
        }
        let duration = expires_at_ms
            .checked_sub(now_ms)
            .ok_or(DeveloperPairingError::InvalidChallengeDeadline)?;
        if duration == 0
            || duration > MAX_DEVELOPER_CHALLENGE_MS
            || expires_at_ms > self.expires_at_ms
        {
            return Err(DeveloperPairingError::InvalidChallengeDeadline);
        }
        let session_ordinal = self.next_session_ordinal;
        self.next_session_ordinal = self
            .next_session_ordinal
            .checked_add(1)
            .ok_or(DeveloperPairingError::SessionOrdinalExhausted)?;
        let challenge = DeveloperSessionChallenge {
            workstation_id: workstation_id.to_owned(),
            session_ordinal,
            session_epoch: self.session_epoch,
            challenge_nonce,
            expires_at_ms,
        };
        self.pending_challenge = Some(challenge.clone());
        Ok(challenge)
    }

    /// Verifies the exact pending challenge and opens one live capability.
    ///
    /// # Errors
    ///
    /// Rejects nonmatching, expired, substituted, or invalid signatures and
    /// any closed authority.
    pub fn authenticate(
        &mut self,
        challenge: &DeveloperSessionChallenge,
        signature_bytes: [u8; 64],
        now_ms: u64,
    ) -> Result<DeveloperSessionCapability, DeveloperPairingError> {
        self.require_open(now_ms)?;
        let pending = self
            .pending_challenge
            .as_ref()
            .ok_or(DeveloperPairingError::NoPendingChallenge)?;
        if pending != challenge {
            return Err(DeveloperPairingError::ChallengeSubstitution);
        }
        if now_ms >= challenge.expires_at_ms {
            self.pending_challenge = None;
            return Err(DeveloperPairingError::ChallengeExpired);
        }
        let public_key = self
            .registry
            .public_key(&challenge.workstation_id)
            .ok_or_else(|| {
                DeveloperPairingError::UnknownWorkstation(challenge.workstation_id.clone())
            })?;
        let verifying_key = VerifyingKey::from_bytes(&public_key)
            .map_err(|_| DeveloperPairingError::InvalidWorkstationKey)?;
        let signature = Signature::from_bytes(&signature_bytes);
        verifying_key
            .verify_strict(&challenge.signing_message(), &signature)
            .map_err(|_| DeveloperPairingError::InvalidSessionSignature)?;

        let capability = DeveloperSessionCapability {
            workstation_id: challenge.workstation_id.clone(),
            session_ordinal: challenge.session_ordinal,
            session_epoch: challenge.session_epoch,
            expires_at_ms: self.expires_at_ms,
        };
        self.pending_challenge = None;
        self.active_session = Some(ActiveDeveloperSession {
            workstation_id: capability.workstation_id.clone(),
            session_ordinal: capability.session_ordinal,
        });
        Ok(capability)
    }

    /// Admits one closed developer operation under the live capability.
    ///
    /// # Errors
    ///
    /// Rejects closed/expired/stale capability, invalid operation fields,
    /// replayed request IDs, and exhausted replay state.
    pub fn authorize_operation(
        &mut self,
        capability: &DeveloperSessionCapability,
        request: DeveloperOperationRequest,
        now_ms: u64,
    ) -> Result<AuthorizedDeveloperOperation, DeveloperPairingError> {
        self.require_open(now_ms)?;
        if now_ms >= capability.expires_at_ms
            || capability.session_epoch != self.session_epoch
            || self.active_session.as_ref().is_none_or(|active| {
                active.workstation_id != capability.workstation_id
                    || active.session_ordinal != capability.session_ordinal
            })
        {
            return Err(DeveloperPairingError::StaleSessionCapability);
        }
        request.validate()?;
        if self.used_request_ids.contains(&request.request_id) {
            return Err(DeveloperPairingError::DuplicateOperationRequest(
                request.request_id,
            ));
        }
        if self.used_request_ids.len() >= MAX_DEVELOPER_OPERATION_IDS {
            return Err(DeveloperPairingError::OperationReplayCapacityExceeded);
        }
        self.used_request_ids.insert(request.request_id.clone());
        Ok(AuthorizedDeveloperOperation {
            workstation_id: capability.workstation_id.clone(),
            session_ordinal: capability.session_ordinal,
            request,
            liveness: Arc::clone(&self.liveness),
        })
    }

    /// Prepares a pairing transition and invalidates the entire current
    /// developer-mode epoch before returning it.
    ///
    /// A caller must publish and protect the returned registry, then require a
    /// fresh local developer-mode confirmation before opening another session.
    ///
    /// # Errors
    ///
    /// Returns the same invalid-key, duplicate, capacity, or generation errors
    /// as [`DeveloperTrustRegistry::pair_after_local_confirmation`].
    pub fn pair_and_close_after_local_confirmation(
        &mut self,
        public_key: [u8; 32],
    ) -> Result<PendingDeveloperTrustRegistry, DeveloperPairingError> {
        self.close();
        self.registry.pair_after_local_confirmation(public_key)
    }

    /// Prepares a revocation transition and invalidates every current
    /// capability before returning it.
    ///
    /// The caller must publish and protect the returned registry. Even if that
    /// external commit fails, this in-memory authority remains closed and
    /// cannot restore the revoked workstation's session.
    ///
    /// # Errors
    ///
    /// Returns an unknown-workstation or generation-exhaustion error.
    pub fn revoke_and_close_after_local_confirmation(
        &mut self,
        workstation_id: &str,
    ) -> Result<PendingDeveloperTrustRegistry, DeveloperPairingError> {
        self.close();
        self.registry
            .revoke_after_local_confirmation(workstation_id)
    }

    /// Closes developer mode and invalidates every challenge/capability.
    pub fn close(&mut self) {
        match self.liveness.lock() {
            Ok(mut liveness) => liveness.active = false,
            Err(poisoned) => poisoned.into_inner().active = false,
        }
        self.closed = true;
        self.pending_challenge = None;
        self.active_session = None;
        self.used_request_ids.clear();
    }

    fn require_open(&mut self, now_ms: u64) -> Result<(), DeveloperPairingError> {
        if self.closed {
            return Err(DeveloperPairingError::DeveloperSessionClosed);
        }
        let liveness_active = self
            .liveness
            .lock()
            .map_err(|_| DeveloperPairingError::SessionStatePoisoned)?
            .active;
        if !liveness_active {
            self.close();
            return Err(DeveloperPairingError::DeveloperSessionExpired);
        }
        if now_ms >= self.expires_at_ms {
            self.close();
            return Err(DeveloperPairingError::DeveloperSessionExpired);
        }
        Ok(())
    }
}

impl Drop for DeveloperSessionAuthority {
    fn drop(&mut self) {
        self.close();
    }
}

/// Closed developer operation vocabulary. It does not contain paths, command
/// lines, environment variables, URLs, credentials, or arbitrary log text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DeveloperOperation {
    Push {
        deployment_id: String,
        artifact_sha256: String,
        artifact_bytes: u64,
    },
    Launch {
        deployment_id: String,
    },
    ReadLogs {
        deployment_id: String,
    },
    Restart {
        deployment_id: String,
    },
    Rollback {
        deployment_id: String,
    },
}

/// One replay-bounded operation request from an authenticated workstation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeveloperOperationRequest {
    request_id: String,
    operation: DeveloperOperation,
}

impl DeveloperOperationRequest {
    /// Creates a request and validates every closed field.
    ///
    /// # Errors
    ///
    /// Rejects unsafe IDs, invalid digests, and empty/excessive artifacts.
    pub fn new(
        request_id: impl Into<String>,
        operation: DeveloperOperation,
    ) -> Result<Self, DeveloperPairingError> {
        let request = Self {
            request_id: request_id.into(),
            operation,
        };
        request.validate()?;
        Ok(request)
    }

    fn validate(&self) -> Result<(), DeveloperPairingError> {
        validate_safe_id("operation request", &self.request_id)?;
        match &self.operation {
            DeveloperOperation::Push {
                deployment_id,
                artifact_sha256,
                artifact_bytes,
            } => {
                validate_safe_id("deployment", deployment_id)?;
                if !is_canonical_sha256(artifact_sha256) {
                    return Err(DeveloperPairingError::InvalidArtifactDigest);
                }
                if *artifact_bytes == 0 || *artifact_bytes > MAX_DEVELOPER_ARTIFACT_BYTES {
                    return Err(DeveloperPairingError::InvalidArtifactSize);
                }
            }
            DeveloperOperation::Launch { deployment_id }
            | DeveloperOperation::ReadLogs { deployment_id }
            | DeveloperOperation::Restart { deployment_id }
            | DeveloperOperation::Rollback { deployment_id } => {
                validate_safe_id("deployment", deployment_id)?;
            }
        }
        Ok(())
    }

    #[must_use]
    pub fn request_id(&self) -> &str {
        &self.request_id
    }

    #[must_use]
    pub const fn operation(&self) -> &DeveloperOperation {
        &self.operation
    }
}

/// Exact operation admitted by one live developer session.
#[derive(Debug)]
pub struct AuthorizedDeveloperOperation {
    workstation_id: String,
    session_ordinal: u64,
    request: DeveloperOperationRequest,
    liveness: Arc<Mutex<DeveloperSessionLiveness>>,
}

impl AuthorizedDeveloperOperation {
    #[must_use]
    pub fn workstation_id(&self) -> &str {
        &self.workstation_id
    }

    #[must_use]
    pub const fn session_ordinal(&self) -> u64 {
        self.session_ordinal
    }

    #[must_use]
    pub const fn request(&self) -> &DeveloperOperationRequest {
        &self.request
    }

    pub(crate) fn with_live_session<T>(
        &self,
        now_ms: u64,
        operation: impl FnOnce() -> T,
    ) -> Result<T, DeveloperPairingError> {
        let mut liveness = self
            .liveness
            .lock()
            .map_err(|_| DeveloperPairingError::SessionStatePoisoned)?;
        if now_ms >= liveness.expires_at_ms {
            liveness.active = false;
        }
        if !liveness.active {
            return Err(DeveloperPairingError::StaleSessionCapability);
        }
        Ok(operation())
    }
}

fn workstation_id(public_key: &[u8; 32]) -> String {
    let digest = Sha256::digest(public_key);
    format!("workstation-{}", encode_hex(&digest[..16]))
}

fn validate_safe_id(kind: &'static str, value: &str) -> Result<(), DeveloperPairingError> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(DeveloperPairingError::InvalidIdentifier {
            kind,
            value: value.to_owned(),
        });
    }
    Ok(())
}

fn require_bounded(
    bytes: &[u8],
    maximum: usize,
    kind: &'static str,
) -> Result<(), DeveloperPairingError> {
    if bytes.is_empty() {
        return Err(DeveloperPairingError::EmptyDocument(kind));
    }
    if bytes.len() > maximum {
        return Err(DeveloperPairingError::DocumentTooLarge { kind, maximum });
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    encode_hex(&Sha256::digest(bytes))
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    output
}

fn decode_hex<const N: usize>(value: &str) -> Option<[u8; N]> {
    if value.len() != N * 2 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    if value.bytes().any(|byte| byte.is_ascii_uppercase()) {
        return None;
    }
    let mut output = [0_u8; N];
    for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
        output[index] = (decode_nibble(pair[0])? << 4) | decode_nibble(pair[1])?;
    }
    Some(output)
}

fn decode_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

fn is_canonical_sha256(value: &str) -> bool {
    decode_hex::<32>(value).is_some()
}

/// Strict developer-pairing admission failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DeveloperPairingError {
    EmptyDocument(&'static str),
    DocumentTooLarge {
        kind: &'static str,
        maximum: usize,
    },
    InvalidProtectedState(String),
    InvalidTrustRegistry(String),
    InvalidWorkstationKey,
    InvalidWorkstationId(String),
    DuplicateWorkstationKey,
    TooManyWorkstations {
        maximum: usize,
    },
    WorkstationAlreadyTrusted(String),
    UnknownWorkstation(String),
    GenerationExhausted,
    TrustRollback {
        protected_generation: u64,
        writable_generation: u64,
    },
    TrustSubstitution,
    UnexplainedTrustAdvance {
        protected_generation: u64,
        writable_generation: u64,
    },
    BrokenTrustPredecessor,
    InvalidSessionRandomness,
    InvalidSessionDeadline,
    InvalidChallengeDeadline,
    SessionOrdinalExhausted,
    DeveloperSessionBusy,
    DeveloperSessionClosed,
    DeveloperSessionExpired,
    NoPendingChallenge,
    ChallengeSubstitution,
    ChallengeExpired,
    InvalidSessionSignature,
    StaleSessionCapability,
    SessionStatePoisoned,
    InvalidIdentifier {
        kind: &'static str,
        value: String,
    },
    InvalidArtifactDigest,
    InvalidArtifactSize,
    DuplicateOperationRequest(String),
    OperationReplayCapacityExceeded,
}

impl fmt::Display for DeveloperPairingError {
    #[allow(
        clippy::too_many_lines,
        reason = "the closed error vocabulary keeps one exhaustive user-facing formatter"
    )]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyDocument(kind) => write!(formatter, "{kind} is empty"),
            Self::DocumentTooLarge { kind, maximum } => {
                write!(formatter, "{kind} exceeds {maximum} bytes")
            }
            Self::InvalidProtectedState(detail) => {
                write!(
                    formatter,
                    "protected developer trust state is invalid: {detail}"
                )
            }
            Self::InvalidTrustRegistry(detail) => {
                write!(formatter, "developer trust registry is invalid: {detail}")
            }
            Self::InvalidWorkstationKey => {
                formatter.write_str("developer workstation public key is invalid")
            }
            Self::InvalidWorkstationId(id) => {
                write!(
                    formatter,
                    "developer workstation ID is not key-derived: {id}"
                )
            }
            Self::DuplicateWorkstationKey => {
                formatter.write_str("developer workstation public key is duplicated")
            }
            Self::TooManyWorkstations { maximum } => {
                write!(
                    formatter,
                    "developer trust registry exceeds {maximum} workstations"
                )
            }
            Self::WorkstationAlreadyTrusted(id) => {
                write!(formatter, "developer workstation is already trusted: {id}")
            }
            Self::UnknownWorkstation(id) => {
                write!(formatter, "developer workstation is not trusted: {id}")
            }
            Self::GenerationExhausted => {
                formatter.write_str("developer trust generation is exhausted")
            }
            Self::TrustRollback {
                protected_generation,
                writable_generation,
            } => write!(
                formatter,
                "developer trust rollback: protected generation {protected_generation}, writable generation {writable_generation}"
            ),
            Self::TrustSubstitution => formatter
                .write_str("developer trust registry digest does not match protected state"),
            Self::UnexplainedTrustAdvance {
                protected_generation,
                writable_generation,
            } => write!(
                formatter,
                "developer trust registry advanced from protected generation {protected_generation} to unexplained writable generation {writable_generation}"
            ),
            Self::BrokenTrustPredecessor => {
                formatter.write_str("developer trust registry predecessor binding is invalid")
            }
            Self::InvalidSessionRandomness => {
                formatter.write_str("developer session randomness is invalid")
            }
            Self::InvalidSessionDeadline => {
                formatter.write_str("developer session deadline is invalid")
            }
            Self::InvalidChallengeDeadline => {
                formatter.write_str("developer challenge deadline is invalid")
            }
            Self::SessionOrdinalExhausted => {
                formatter.write_str("developer session ordinal is exhausted")
            }
            Self::DeveloperSessionBusy => {
                formatter.write_str("developer session already has pending or active authority")
            }
            Self::DeveloperSessionClosed => formatter.write_str("developer session is closed"),
            Self::DeveloperSessionExpired => formatter.write_str("developer session expired"),
            Self::NoPendingChallenge => {
                formatter.write_str("developer session has no pending challenge")
            }
            Self::ChallengeSubstitution => {
                formatter.write_str("developer session challenge was substituted")
            }
            Self::ChallengeExpired => formatter.write_str("developer session challenge expired"),
            Self::InvalidSessionSignature => {
                formatter.write_str("developer session signature is invalid")
            }
            Self::StaleSessionCapability => {
                formatter.write_str("developer session capability is stale")
            }
            Self::SessionStatePoisoned => {
                formatter.write_str("developer session liveness state is unavailable")
            }
            Self::InvalidIdentifier { kind, value } => {
                write!(formatter, "{kind} ID is invalid: {value}")
            }
            Self::InvalidArtifactDigest => {
                formatter.write_str("developer artifact digest is invalid")
            }
            Self::InvalidArtifactSize => formatter.write_str("developer artifact size is invalid"),
            Self::DuplicateOperationRequest(id) => {
                write!(formatter, "developer operation request was replayed: {id}")
            }
            Self::OperationReplayCapacityExceeded => {
                formatter.write_str("developer operation replay capacity is exhausted")
            }
        }
    }
}

impl Error for DeveloperPairingError {}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::thread;

    use ed25519_dalek::{Signer, SigningKey};

    use super::*;

    fn active_empty_registry() -> DeveloperTrustRegistry {
        match DeveloperTrustRegistry::load(
            &DeveloperTrustRegistry::empty_json_bytes().expect("empty registry"),
            &ProtectedDeveloperTrustState::uninitialized(),
        )
        .expect("empty registry loads")
        {
            DeveloperTrustLoad::Active(registry) => registry,
            DeveloperTrustLoad::ProtectionCommitRequired(_) => {
                panic!("empty registry must be active")
            }
        }
    }

    fn activate_pending(pending: &PendingDeveloperTrustRegistry) -> DeveloperTrustRegistry {
        match DeveloperTrustRegistry::load(pending.registry_bytes(), pending.next_protected_state())
            .expect("pending registry activates")
        {
            DeveloperTrustLoad::Active(registry) => registry,
            DeveloperTrustLoad::ProtectionCommitRequired(_) => {
                panic!("matching protected state must activate")
            }
        }
    }

    fn registry_with_key(key: &SigningKey) -> DeveloperTrustRegistry {
        let pending = active_empty_registry()
            .pair_after_local_confirmation(*key.verifying_key().as_bytes())
            .expect("pairing transition");
        activate_pending(&pending)
    }

    fn authenticated_session(
        key: &SigningKey,
    ) -> (
        DeveloperSessionAuthority,
        DeveloperSessionCapability,
        String,
    ) {
        let registry = registry_with_key(key);
        let workstation_id = registry
            .workstation_ids()
            .next()
            .expect("trusted workstation")
            .to_owned();
        let mut authority =
            DeveloperSessionAuthority::new_after_local_confirmation(registry, [3; 32], 100, 1_000)
                .expect("session starts");
        let challenge = authority
            .begin_challenge(&workstation_id, [4; 32], 110, 200)
            .expect("challenge opens");
        let signature = key.sign(&challenge.signing_message()).to_bytes();
        let capability = authority
            .authenticate(&challenge, signature, 120)
            .expect("session authenticates");
        (authority, capability, workstation_id)
    }

    #[test]
    fn accepts_only_the_canonical_empty_generation_zero_registry() {
        let bytes = DeveloperTrustRegistry::empty_json_bytes().expect("empty registry");
        assert_eq!(
            bytes,
            br#"{"schemaVersion":1,"generation":0,"previousRegistrySha256":null,"workstations":[]}"#
        );
        assert!(matches!(
            DeveloperTrustRegistry::load(&bytes, &ProtectedDeveloperTrustState::uninitialized()),
            Ok(DeveloperTrustLoad::Active(_))
        ));
        let mut padded = bytes.clone();
        padded.push(b'\n');
        assert!(matches!(
            DeveloperTrustRegistry::load(&padded, &ProtectedDeveloperTrustState::uninitialized()),
            Err(DeveloperPairingError::InvalidTrustRegistry(_))
        ));
        assert!(DeveloperTrustRegistry::load(
            br#"{"schemaVersion":1,"generation":0,"previousRegistrySha256":null,"workstations":[],"name":"unsafe"}"#,
            &ProtectedDeveloperTrustState::uninitialized()
        )
        .is_err());
    }

    #[test]
    fn pairing_is_two_phase_and_exactly_protected_before_use() {
        let key = SigningKey::from_bytes(&[11; 32]);
        let pending = active_empty_registry()
            .pair_after_local_confirmation(*key.verifying_key().as_bytes())
            .expect("pairing transition");
        let workstation_id = workstation_id(key.verifying_key().as_bytes());

        assert!(matches!(
            DeveloperTrustRegistry::load(
                pending.registry_bytes(),
                &ProtectedDeveloperTrustState::uninitialized()
            ),
            Ok(DeveloperTrustLoad::ProtectionCommitRequired(state))
                if state == *pending.next_protected_state()
        ));
        let active = activate_pending(&pending);
        assert_eq!(active.generation(), 1);
        assert_eq!(
            active.workstation_ids().collect::<Vec<_>>(),
            vec![workstation_id]
        );
        assert!(
            active
                .pair_after_local_confirmation(*key.verifying_key().as_bytes())
                .is_err()
        );
    }

    #[test]
    fn registry_rejects_invalid_key_identity_entry_and_byte_bounds() {
        let key = SigningKey::from_bytes(&[15; 32]);
        let public_key = encode_hex(key.verifying_key().as_bytes());
        let predecessor = "0".repeat(64);
        let invalid_id = format!(
            r#"{{"schemaVersion":1,"generation":1,"previousRegistrySha256":"{predecessor}","workstations":[{{"id":"workstation-wrong","publicKey":"{public_key}"}}]}}"#
        );
        assert!(matches!(
            DeveloperTrustRegistry::load(
                invalid_id.as_bytes(),
                &ProtectedDeveloperTrustState::uninitialized()
            ),
            Err(DeveloperPairingError::InvalidWorkstationId(_))
        ));

        let record = format!(
            r#"{{"id":"{}","publicKey":"{public_key}"}}"#,
            workstation_id(key.verifying_key().as_bytes())
        );
        let excessive = format!(
            r#"{{"schemaVersion":1,"generation":1,"previousRegistrySha256":"{predecessor}","workstations":[{}]}}"#,
            std::iter::repeat_n(record, MAX_TRUSTED_WORKSTATIONS + 1)
                .collect::<Vec<_>>()
                .join(",")
        );
        assert!(matches!(
            DeveloperTrustRegistry::load(
                excessive.as_bytes(),
                &ProtectedDeveloperTrustState::uninitialized()
            ),
            Err(DeveloperPairingError::TooManyWorkstations { .. })
        ));
        assert!(matches!(
            DeveloperTrustRegistry::load(
                &vec![b'x'; MAX_DEVELOPER_TRUST_BYTES + 1],
                &ProtectedDeveloperTrustState::uninitialized()
            ),
            Err(DeveloperPairingError::DocumentTooLarge { .. })
        ));
    }

    #[test]
    fn rejects_registry_rollback_substitution_jump_and_broken_predecessor() {
        let key = SigningKey::from_bytes(&[12; 32]);
        let pending = active_empty_registry()
            .pair_after_local_confirmation(*key.verifying_key().as_bytes())
            .expect("pairing transition");
        let protected = pending.next_protected_state().clone();
        assert!(matches!(
            DeveloperTrustRegistry::load(
                &DeveloperTrustRegistry::empty_json_bytes().expect("empty"),
                &protected
            ),
            Err(DeveloperPairingError::TrustRollback { .. })
        ));

        let mut substituted = pending.registry_bytes().to_vec();
        let key_text = encode_hex(key.verifying_key().as_bytes());
        let replacement = encode_hex(SigningKey::from_bytes(&[13; 32]).verifying_key().as_bytes());
        let replaced = String::from_utf8(substituted)
            .expect("registry UTF-8")
            .replace(&key_text, &replacement);
        substituted = replaced.into_bytes();
        assert!(matches!(
            DeveloperTrustRegistry::load(&substituted, &protected),
            Err(DeveloperPairingError::InvalidWorkstationId(_)
                | DeveloperPairingError::TrustSubstitution)
        ));

        let jump = pending.registry_bytes().to_vec();
        let jump = String::from_utf8(jump)
            .expect("registry UTF-8")
            .replace("\"generation\":1", "\"generation\":2");
        assert!(matches!(
            DeveloperTrustRegistry::load(
                jump.as_bytes(),
                &ProtectedDeveloperTrustState::uninitialized()
            ),
            Err(DeveloperPairingError::UnexplainedTrustAdvance { .. })
        ));

        let broken = String::from_utf8(pending.registry_bytes().to_vec())
            .expect("registry UTF-8")
            .replace(
                pending
                    .registry_bytes()
                    .windows(64)
                    .find_map(|window| {
                        let value = std::str::from_utf8(window).ok()?;
                        is_canonical_sha256(value).then_some(value)
                    })
                    .expect("predecessor digest"),
                &"0".repeat(64),
            );
        assert!(matches!(
            DeveloperTrustRegistry::load(
                broken.as_bytes(),
                &ProtectedDeveloperTrustState::uninitialized()
            ),
            Err(DeveloperPairingError::BrokenTrustPredecessor)
        ));
    }

    #[test]
    fn revocation_requires_the_same_two_phase_protected_commit() {
        let key = SigningKey::from_bytes(&[14; 32]);
        let registry = registry_with_key(&key);
        let id = registry
            .workstation_ids()
            .next()
            .expect("workstation")
            .to_owned();
        let pending = registry
            .revoke_after_local_confirmation(&id)
            .expect("revocation transition");
        assert!(matches!(
            DeveloperTrustRegistry::load(
                pending.registry_bytes(),
                &ProtectedDeveloperTrustState {
                    schema_version: 1,
                    generation: 1,
                    registry_sha256: registry
                        .document
                        .generation
                        .checked_sub(0)
                        .map(|_| sha256_hex(&registry.canonical_bytes)),
                }
            ),
            Ok(DeveloperTrustLoad::ProtectionCommitRequired(_))
        ));
        let active = activate_pending(&pending);
        assert_eq!(active.generation(), 2);
        assert!(!active.contains_workstation(&id));
    }

    #[test]
    fn protected_state_is_strict_canonical_and_bounded() {
        let state = ProtectedDeveloperTrustState::uninitialized();
        let bytes = state.to_json_bytes().expect("state serializes");
        assert_eq!(
            ProtectedDeveloperTrustState::from_json_bytes(&bytes).expect("state parses"),
            state
        );
        let mut padded = bytes;
        padded.push(b' ');
        assert!(ProtectedDeveloperTrustState::from_json_bytes(&padded).is_err());
        assert!(ProtectedDeveloperTrustState::from_json_bytes(
            br#"{"schemaVersion":1,"generation":0,"registrySha256":"0000000000000000000000000000000000000000000000000000000000000000"}"#
        )
        .is_err());
        assert!(
            ProtectedDeveloperTrustState::from_json_bytes(&vec![
                b'x';
                MAX_PROTECTED_DEVELOPER_TRUST_BYTES
                    + 1
            ])
            .is_err()
        );
    }

    #[test]
    fn trusted_key_signature_opens_one_volatile_session() {
        let key = SigningKey::from_bytes(&[21; 32]);
        let (mut authority, capability, workstation_id) = authenticated_session(&key);
        let request = DeveloperOperationRequest::new(
            "request-1",
            DeveloperOperation::Push {
                deployment_id: "build-1".to_owned(),
                artifact_sha256: "ab".repeat(32),
                artifact_bytes: 4_096,
            },
        )
        .expect("request");
        let authorized = authority
            .authorize_operation(&capability, request, 130)
            .expect("operation admitted");
        assert_eq!(authorized.workstation_id(), workstation_id);
        assert_eq!(authorized.session_ordinal(), 1);
    }

    #[test]
    fn authorized_operations_share_volatile_close_drop_and_expiry_state() {
        for mode in ["close", "drop", "expiry"] {
            let key = SigningKey::from_bytes(&[27; 32]);
            let (mut authority, capability, _) = authenticated_session(&key);
            let authorized = authority
                .authorize_operation(
                    &capability,
                    DeveloperOperationRequest::new(
                        format!("request-{mode}"),
                        DeveloperOperation::Launch {
                            deployment_id: "build-1".to_owned(),
                        },
                    )
                    .expect("request"),
                    130,
                )
                .expect("operation admitted");
            assert_eq!(
                authorized
                    .with_live_session(140, || "live")
                    .expect("session live"),
                "live"
            );
            let now_ms = match mode {
                "close" => {
                    authority.close();
                    141
                }
                "drop" => {
                    drop(authority);
                    141
                }
                "expiry" => 1_000,
                _ => unreachable!(),
            };
            assert!(matches!(
                authorized.with_live_session(now_ms, || ()),
                Err(DeveloperPairingError::StaleSessionCapability)
            ));
        }
    }

    #[test]
    fn authority_close_linearizes_after_current_operation_use() {
        let key = SigningKey::from_bytes(&[28; 32]);
        let (mut authority, capability, _) = authenticated_session(&key);
        let authorized = authority
            .authorize_operation(
                &capability,
                DeveloperOperationRequest::new(
                    "request-linearized-close",
                    DeveloperOperation::Push {
                        deployment_id: "build-1".to_owned(),
                        artifact_sha256: "ab".repeat(32),
                        artifact_bytes: 1,
                    },
                )
                .expect("request"),
                130,
            )
            .expect("operation admitted");
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let (closed_for_worker_tx, closed_for_worker_rx) = mpsc::channel();
        let (stale_tx, stale_rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            authorized
                .with_live_session(140, || {
                    entered_tx.send(()).expect("report entered gate");
                    release_rx.recv().expect("release gate");
                })
                .expect("current operation finishes");
            closed_for_worker_rx
                .recv()
                .expect("close completion reaches worker");
            stale_tx
                .send(matches!(
                    authorized.with_live_session(141, || ()),
                    Err(DeveloperPairingError::StaleSessionCapability)
                ))
                .expect("report stale");
        });
        entered_rx.recv().expect("operation holds gate");

        let (attempting_tx, attempting_rx) = mpsc::channel();
        let (closed_tx, closed_rx) = mpsc::channel();
        let closer = thread::spawn(move || {
            attempting_tx.send(()).expect("report close attempt");
            authority.close();
            closed_tx.send(()).expect("report close");
        });
        attempting_rx.recv().expect("close attempted");
        assert!(matches!(
            closed_rx.try_recv(),
            Err(mpsc::TryRecvError::Empty)
        ));
        release_tx.send(()).expect("release current operation");
        closed_rx.recv().expect("close completes after release");
        closed_for_worker_tx
            .send(())
            .expect("report close completion to worker");
        assert!(stale_rx.recv().expect("stale result"));
        worker.join().expect("worker");
        closer.join().expect("closer");
    }

    #[test]
    fn rejects_unknown_wrong_substituted_and_expired_challenges() {
        let key = SigningKey::from_bytes(&[22; 32]);
        let other = SigningKey::from_bytes(&[23; 32]);
        let registry = registry_with_key(&key);
        let workstation_id = registry
            .workstation_ids()
            .next()
            .expect("workstation")
            .to_owned();
        let mut authority =
            DeveloperSessionAuthority::new_after_local_confirmation(registry, [5; 32], 10, 500)
                .expect("session");
        assert!(matches!(
            authority.begin_challenge("workstation-unknown", [6; 32], 20, 40),
            Err(DeveloperPairingError::UnknownWorkstation(_))
        ));
        let challenge = authority
            .begin_challenge(&workstation_id, [6; 32], 20, 40)
            .expect("challenge");
        let substituted = DeveloperSessionChallenge {
            challenge_nonce: [7; 32],
            ..challenge.clone()
        };
        assert!(matches!(
            authority.authenticate(
                &substituted,
                key.sign(&substituted.signing_message()).to_bytes(),
                30
            ),
            Err(DeveloperPairingError::ChallengeSubstitution)
        ));
        assert!(matches!(
            authority.authenticate(
                &challenge,
                other.sign(&challenge.signing_message()).to_bytes(),
                30
            ),
            Err(DeveloperPairingError::InvalidSessionSignature)
        ));
        assert!(matches!(
            authority.authenticate(
                &challenge,
                key.sign(&challenge.signing_message()).to_bytes(),
                40
            ),
            Err(DeveloperPairingError::ChallengeExpired)
        ));
    }

    #[test]
    fn close_expiry_and_epoch_change_invalidate_capabilities() {
        let key = SigningKey::from_bytes(&[24; 32]);
        let (mut authority, capability, _) = authenticated_session(&key);
        authority.close();
        let request = DeveloperOperationRequest::new(
            "request-close",
            DeveloperOperation::Launch {
                deployment_id: "build-1".to_owned(),
            },
        )
        .expect("request");
        assert!(matches!(
            authority.authorize_operation(&capability, request, 130),
            Err(DeveloperPairingError::DeveloperSessionClosed)
        ));

        let registry = registry_with_key(&key);
        assert!(matches!(
            DeveloperSessionAuthority::new_after_local_confirmation(
                registry_with_key(&key),
                [0; 32],
                0,
                10
            ),
            Err(DeveloperPairingError::InvalidSessionRandomness)
        ));
        assert!(
            DeveloperSessionAuthority::new_after_local_confirmation(
                registry,
                [1; 32],
                0,
                MAX_DEVELOPER_SESSION_MS + 1
            )
            .is_err()
        );
    }

    #[test]
    fn trust_mutation_closes_an_existing_capability_before_publication() {
        let key = SigningKey::from_bytes(&[26; 32]);
        let (mut authority, capability, workstation_id) = authenticated_session(&key);
        let pending = authority
            .revoke_and_close_after_local_confirmation(&workstation_id)
            .expect("revocation transition");
        assert_eq!(pending.next_protected_state().generation(), 2);
        let request = DeveloperOperationRequest::new(
            "request-after-revoke",
            DeveloperOperation::Launch {
                deployment_id: "build-1".to_owned(),
            },
        )
        .expect("request");
        assert!(matches!(
            authority.authorize_operation(&capability, request, 130),
            Err(DeveloperPairingError::DeveloperSessionClosed)
        ));
    }

    #[test]
    fn operation_vocabulary_is_closed_bounded_and_replay_safe() {
        let key = SigningKey::from_bytes(&[25; 32]);
        let (mut authority, capability, _) = authenticated_session(&key);
        for (index, operation) in [
            DeveloperOperation::Launch {
                deployment_id: "build-1".to_owned(),
            },
            DeveloperOperation::ReadLogs {
                deployment_id: "build-1".to_owned(),
            },
            DeveloperOperation::Restart {
                deployment_id: "build-1".to_owned(),
            },
            DeveloperOperation::Rollback {
                deployment_id: "build-1".to_owned(),
            },
        ]
        .into_iter()
        .enumerate()
        {
            let request = DeveloperOperationRequest::new(format!("request-{index}"), operation)
                .expect("valid operation");
            authority
                .authorize_operation(&capability, request, 130)
                .expect("operation admitted");
        }
        let replay = DeveloperOperationRequest::new(
            "request-0",
            DeveloperOperation::Launch {
                deployment_id: "build-1".to_owned(),
            },
        )
        .expect("replay request shape");
        assert!(matches!(
            authority.authorize_operation(&capability, replay, 130),
            Err(DeveloperPairingError::DuplicateOperationRequest(_))
        ));
        for index in 4..MAX_DEVELOPER_OPERATION_IDS {
            authority
                .authorize_operation(
                    &capability,
                    DeveloperOperationRequest::new(
                        format!("request-{index}"),
                        DeveloperOperation::Launch {
                            deployment_id: "build-1".to_owned(),
                        },
                    )
                    .expect("bounded replay request"),
                    130,
                )
                .expect("request fits replay bound");
        }
        assert!(matches!(
            authority.authorize_operation(
                &capability,
                DeveloperOperationRequest::new(
                    "request-overflow",
                    DeveloperOperation::Launch {
                        deployment_id: "build-1".to_owned(),
                    },
                )
                .expect("overflow request shape"),
                130,
            ),
            Err(DeveloperPairingError::OperationReplayCapacityExceeded)
        ));
        for invalid in [
            DeveloperOperationRequest::new(
                "../escape",
                DeveloperOperation::Launch {
                    deployment_id: "build-1".to_owned(),
                },
            ),
            DeveloperOperationRequest::new(
                "request-bad-path",
                DeveloperOperation::Launch {
                    deployment_id: "../escape".to_owned(),
                },
            ),
            DeveloperOperationRequest::new(
                "request-bad-hash",
                DeveloperOperation::Push {
                    deployment_id: "build-1".to_owned(),
                    artifact_sha256: "AA".repeat(32),
                    artifact_bytes: 1,
                },
            ),
            DeveloperOperationRequest::new(
                "request-empty",
                DeveloperOperation::Push {
                    deployment_id: "build-1".to_owned(),
                    artifact_sha256: "aa".repeat(32),
                    artifact_bytes: 0,
                },
            ),
        ] {
            assert!(invalid.is_err());
        }
    }
}
