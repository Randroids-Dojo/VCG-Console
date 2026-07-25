//! Bounded persistent launch-profile authority.
//!
//! This registry contains opaque host IDs only. It intentionally excludes
//! display names, portraits, body-derived data, save paths, and deletion or
//! reassignment commands.

use std::collections::HashSet;
use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::installed_catalog::validate_intent_id;

/// Maximum serialized registry accepted from host-owned persistent state.
pub const MAX_PROFILE_REGISTRY_BYTES: usize = 16 * 1_024;
/// Maximum launchable profiles in one host registry.
pub const MAX_PROFILE_REGISTRY_ENTRIES: usize = 64;
/// Maximum serialized protected-state adapter document.
pub const MAX_PROTECTED_PROFILE_REGISTRY_STATE_BYTES: usize = 512;

const PROTECTED_PROFILE_REGISTRY_SCHEMA_VERSION: u32 = 2;
const PROFILE_REGISTRY_STATE_SCHEMA_VERSION: u32 = 1;
const REGISTRY_ID_HEX_BYTES: usize = 16;
const SHA256_HEX_BYTES: usize = 32;

/// Exact externally protected high-water state for one profile registry.
///
/// The JSON representation is an adapter contract. Storing it beside the
/// writable registry does not provide rollback protection.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectedProfileRegistryState {
    schema_version: u32,
    registry_id: Option<String>,
    generation: u64,
    registry_sha256: Option<String>,
}

impl ProtectedProfileRegistryState {
    /// Returns the only valid unprovisioned state.
    #[must_use]
    pub const fn uninitialized() -> Self {
        Self {
            schema_version: PROFILE_REGISTRY_STATE_SCHEMA_VERSION,
            registry_id: None,
            generation: 0,
            registry_sha256: None,
        }
    }

    /// Parses one strict canonical protected-state adapter document.
    ///
    /// # Errors
    ///
    /// Rejects oversized, malformed, noncanonical, open, or internally
    /// inconsistent state.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, ProfileRegistryError> {
        if bytes.len() > MAX_PROTECTED_PROFILE_REGISTRY_STATE_BYTES {
            return Err(ProfileRegistryError::InvalidProtectedState(format!(
                "document exceeds {MAX_PROTECTED_PROFILE_REGISTRY_STATE_BYTES} bytes"
            )));
        }
        let state: Self = serde_json::from_slice(bytes)
            .map_err(|error| ProfileRegistryError::InvalidProtectedState(error.to_string()))?;
        state.validate()?;
        if state.to_json_bytes()? != bytes {
            return Err(ProfileRegistryError::InvalidProtectedState(
                "document is not canonical JSON".to_owned(),
            ));
        }
        Ok(state)
    }

    /// Serializes the exact canonical adapter document.
    ///
    /// # Errors
    ///
    /// Returns an error only if the in-memory state is invalid or serialization
    /// unexpectedly fails.
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, ProfileRegistryError> {
        self.validate()?;
        serde_json::to_vec(self)
            .map_err(|error| ProfileRegistryError::InvalidProtectedState(error.to_string()))
    }

    /// Returns the protected monotonic registry generation.
    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    /// Returns the protected opaque registry identity after provisioning.
    #[must_use]
    pub fn registry_id(&self) -> Option<&str> {
        self.registry_id.as_deref()
    }

    /// Returns the protected exact registry digest after provisioning.
    #[must_use]
    pub fn registry_sha256(&self) -> Option<&str> {
        self.registry_sha256.as_deref()
    }

    fn for_registry(registry_id: &str, generation: u64, bytes: &[u8]) -> Self {
        Self {
            schema_version: PROFILE_REGISTRY_STATE_SCHEMA_VERSION,
            registry_id: Some(registry_id.to_owned()),
            generation,
            registry_sha256: Some(sha256_hex(bytes)),
        }
    }

    fn validate(&self) -> Result<(), ProfileRegistryError> {
        if self.schema_version != PROFILE_REGISTRY_STATE_SCHEMA_VERSION {
            return Err(ProfileRegistryError::InvalidProtectedState(format!(
                "schema {} is unsupported",
                self.schema_version
            )));
        }
        match (
            self.generation,
            self.registry_id.as_deref(),
            self.registry_sha256.as_deref(),
        ) {
            (0, None, None) => Ok(()),
            (0, _, _) => Err(ProfileRegistryError::InvalidProtectedState(
                "generation zero must not bind a registry identity or digest".to_owned(),
            )),
            (_, Some(registry_id), Some(digest))
                if valid_registry_id(registry_id) && valid_sha256_hex(digest) =>
            {
                Ok(())
            }
            (_, Some(_), Some(_)) => Err(ProfileRegistryError::InvalidProtectedState(
                "registry identity or digest is invalid".to_owned(),
            )),
            _ => Err(ProfileRegistryError::InvalidProtectedState(
                "a nonzero generation requires both registry identity and digest".to_owned(),
            )),
        }
    }
}

/// Result of comparing a canonical writable registry with protected state.
#[derive(Debug, Eq, PartialEq)]
pub enum ProtectedProfileRegistryLoad {
    /// Writable and protected state match exactly and the IDs may be used.
    Active(HostProfileRegistry),
    /// One exact next registry is published but cannot be used until the
    /// returned state is committed by the platform protector.
    ProtectionCommitRequired(ProtectedProfileRegistryState),
}

/// Validated opaque profile IDs that may enter privileged launch intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostProfileRegistry {
    profile_ids: Vec<String>,
}

impl HostProfileRegistry {
    /// Parses one strict bounded v1 registry document.
    ///
    /// # Errors
    ///
    /// Rejects oversized or malformed JSON, unsupported schemas, unknown
    /// fields, excessive entries, unsafe IDs, and duplicate IDs.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, ProfileRegistryError> {
        validate_registry_size(bytes)?;
        let document: ProfileRegistryDocument = serde_json::from_slice(bytes)
            .map_err(|error| ProfileRegistryError::InvalidDocument(error.to_string()))?;
        if document.schema_version != 1 {
            return Err(ProfileRegistryError::UnsupportedSchema(
                document.schema_version,
            ));
        }
        validate_profiles(document.profiles)
    }

    /// Loads one canonical protected v2 registry against exact externally
    /// protected high-water state.
    ///
    /// # Errors
    ///
    /// Rejects malformed or noncanonical bytes, invalid profile IDs, rollback,
    /// same-generation substitution, generation jumps, registry-scope drift,
    /// or a broken predecessor chain.
    pub fn load_protected(
        bytes: &[u8],
        protected_state: &ProtectedProfileRegistryState,
    ) -> Result<ProtectedProfileRegistryLoad, ProfileRegistryError> {
        validate_registry_size(bytes)?;
        protected_state.validate()?;
        let document: ProtectedProfileRegistryDocument = serde_json::from_slice(bytes)
            .map_err(|error| ProfileRegistryError::InvalidDocument(error.to_string()))?;
        if document.schema_version != PROTECTED_PROFILE_REGISTRY_SCHEMA_VERSION {
            return Err(ProfileRegistryError::UnsupportedSchema(
                document.schema_version,
            ));
        }
        document.validate()?;
        let canonical = serde_json::to_vec(&document)
            .map_err(|error| ProfileRegistryError::InvalidDocument(error.to_string()))?;
        if canonical != bytes {
            return Err(ProfileRegistryError::NonCanonicalProtectedRegistry);
        }
        let registry = validate_profiles(document.profiles.clone())?;

        if document.generation < protected_state.generation {
            return Err(ProfileRegistryError::ProtectedStateRollback {
                writable_generation: document.generation,
                protected_generation: protected_state.generation,
            });
        }
        if document.generation == protected_state.generation {
            if document.generation == 0 {
                return Ok(ProtectedProfileRegistryLoad::Active(registry));
            }
            if document.registry_id.as_deref() != protected_state.registry_id() {
                return Err(ProfileRegistryError::ProtectedStateScopeMismatch);
            }
            let expected = ProtectedProfileRegistryState::for_registry(
                document
                    .registry_id
                    .as_deref()
                    .ok_or(ProfileRegistryError::ProtectedStateScopeMismatch)?,
                document.generation,
                bytes,
            );
            if &expected != protected_state {
                return Err(ProfileRegistryError::ProtectedStateDigestMismatch);
            }
            return Ok(ProtectedProfileRegistryLoad::Active(registry));
        }

        let next_generation = protected_state
            .generation
            .checked_add(1)
            .ok_or(ProfileRegistryError::ProtectedStateGenerationOverflow)?;
        if document.generation != next_generation {
            return Err(ProfileRegistryError::ProtectedStateJump {
                writable_generation: document.generation,
                protected_generation: protected_state.generation,
            });
        }
        if protected_state.generation > 0
            && document.registry_id.as_deref() != protected_state.registry_id()
        {
            return Err(ProfileRegistryError::ProtectedStateScopeMismatch);
        }
        let expected_predecessor = if protected_state.generation == 0 {
            sha256_hex(&empty_protected_registry_bytes()?)
        } else {
            protected_state
                .registry_sha256()
                .ok_or(ProfileRegistryError::ProtectedStatePredecessorMismatch)?
                .to_owned()
        };
        if document.previous_registry_sha256.as_deref() != Some(&expected_predecessor) {
            return Err(ProfileRegistryError::ProtectedStatePredecessorMismatch);
        }
        let registry_id = document
            .registry_id
            .as_deref()
            .ok_or(ProfileRegistryError::ProtectedStateScopeMismatch)?;
        Ok(ProtectedProfileRegistryLoad::ProtectionCommitRequired(
            ProtectedProfileRegistryState::for_registry(registry_id, document.generation, bytes),
        ))
    }

    /// Returns the registry IDs in their host-authored order.
    #[must_use]
    pub fn profile_ids(&self) -> &[String] {
        &self.profile_ids
    }

    /// Consumes the registry into the launch-service allowlist.
    #[must_use]
    pub fn into_profile_ids(self) -> Vec<String> {
        self.profile_ids
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileRegistryDocument {
    schema_version: u32,
    profiles: Vec<ProfileRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileRecord {
    id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtectedProfileRegistryDocument {
    schema_version: u32,
    registry_id: Option<String>,
    generation: u64,
    previous_registry_sha256: Option<String>,
    profiles: Vec<ProfileRecord>,
}

impl ProtectedProfileRegistryDocument {
    fn validate(&self) -> Result<(), ProfileRegistryError> {
        match (
            self.generation,
            self.registry_id.as_deref(),
            self.previous_registry_sha256.as_deref(),
        ) {
            (0, None, None) if self.profiles.is_empty() => Ok(()),
            (0, _, _) => Err(ProfileRegistryError::InvalidDocument(
                "protected registry generation zero must be the canonical empty registry"
                    .to_owned(),
            )),
            (_, Some(registry_id), Some(previous))
                if valid_registry_id(registry_id) && valid_sha256_hex(previous) =>
            {
                Ok(())
            }
            (_, Some(_), Some(_)) => Err(ProfileRegistryError::InvalidDocument(
                "protected registry identity or predecessor digest is invalid".to_owned(),
            )),
            _ => Err(ProfileRegistryError::InvalidDocument(
                "nonzero protected registry generation requires identity and predecessor digest"
                    .to_owned(),
            )),
        }
    }
}

/// Strict profile-registry validation failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProfileRegistryError {
    TooLarge {
        maximum: usize,
    },
    InvalidDocument(String),
    UnsupportedSchema(u32),
    TooManyProfiles {
        maximum: usize,
        actual: usize,
    },
    InvalidProfileId(String),
    DuplicateProfileId(String),
    InvalidProtectedState(String),
    NonCanonicalProtectedRegistry,
    ProtectedStateRollback {
        writable_generation: u64,
        protected_generation: u64,
    },
    ProtectedStateJump {
        writable_generation: u64,
        protected_generation: u64,
    },
    ProtectedStateGenerationOverflow,
    ProtectedStateScopeMismatch,
    ProtectedStateDigestMismatch,
    ProtectedStatePredecessorMismatch,
}

impl fmt::Display for ProfileRegistryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge { maximum } => {
                write!(formatter, "profile registry exceeds {maximum} bytes")
            }
            Self::InvalidDocument(error) => {
                write!(formatter, "profile registry is malformed: {error}")
            }
            Self::UnsupportedSchema(schema) => {
                write!(formatter, "profile registry schema {schema} is unsupported")
            }
            Self::TooManyProfiles { maximum, actual } => write!(
                formatter,
                "profile registry contains {actual} entries; maximum is {maximum}"
            ),
            Self::InvalidProfileId(profile_id) => {
                write!(formatter, "profile registry ID is invalid: {profile_id}")
            }
            Self::DuplicateProfileId(profile_id) => {
                write!(formatter, "profile registry ID is duplicated: {profile_id}")
            }
            Self::InvalidProtectedState(error) => {
                write!(
                    formatter,
                    "profile registry protected state is invalid: {error}"
                )
            }
            Self::NonCanonicalProtectedRegistry => {
                formatter.write_str("protected profile registry is not canonical JSON")
            }
            Self::ProtectedStateRollback {
                writable_generation,
                protected_generation,
            } => write!(
                formatter,
                "profile registry generation {writable_generation} is behind protected generation {protected_generation}"
            ),
            Self::ProtectedStateJump {
                writable_generation,
                protected_generation,
            } => write!(
                formatter,
                "profile registry generation {writable_generation} is more than one step ahead of protected generation {protected_generation}"
            ),
            Self::ProtectedStateGenerationOverflow => {
                formatter.write_str("profile registry protected generation overflowed")
            }
            Self::ProtectedStateScopeMismatch => {
                formatter.write_str("profile registry identity does not match protected state")
            }
            Self::ProtectedStateDigestMismatch => {
                formatter.write_str("profile registry digest does not match protected state")
            }
            Self::ProtectedStatePredecessorMismatch => formatter
                .write_str("profile registry predecessor digest does not match protected state"),
        }
    }
}

impl std::error::Error for ProfileRegistryError {}

fn validate_registry_size(bytes: &[u8]) -> Result<(), ProfileRegistryError> {
    if bytes.len() > MAX_PROFILE_REGISTRY_BYTES {
        return Err(ProfileRegistryError::TooLarge {
            maximum: MAX_PROFILE_REGISTRY_BYTES,
        });
    }
    Ok(())
}

fn validate_profiles(
    profiles: Vec<ProfileRecord>,
) -> Result<HostProfileRegistry, ProfileRegistryError> {
    if profiles.len() > MAX_PROFILE_REGISTRY_ENTRIES {
        return Err(ProfileRegistryError::TooManyProfiles {
            maximum: MAX_PROFILE_REGISTRY_ENTRIES,
            actual: profiles.len(),
        });
    }

    let mut seen = HashSet::with_capacity(profiles.len());
    let mut profile_ids = Vec::with_capacity(profiles.len());
    for profile in profiles {
        validate_intent_id("profile", &profile.id)
            .map_err(|_| ProfileRegistryError::InvalidProfileId(profile.id.clone()))?;
        if !seen.insert(profile.id.clone()) {
            return Err(ProfileRegistryError::DuplicateProfileId(profile.id));
        }
        profile_ids.push(profile.id);
    }
    Ok(HostProfileRegistry { profile_ids })
}

fn empty_protected_registry_bytes() -> Result<Vec<u8>, ProfileRegistryError> {
    serde_json::to_vec(&ProtectedProfileRegistryDocument {
        schema_version: PROTECTED_PROFILE_REGISTRY_SCHEMA_VERSION,
        registry_id: None,
        generation: 0,
        previous_registry_sha256: None,
        profiles: Vec::new(),
    })
    .map_err(|error| ProfileRegistryError::InvalidDocument(error.to_string()))
}

fn valid_registry_id(value: &str) -> bool {
    valid_lower_hex(value, REGISTRY_ID_HEX_BYTES)
}

fn valid_sha256_hex(value: &str) -> bool {
    valid_lower_hex(value, SHA256_HEX_BYTES)
}

fn valid_lower_hex(value: &str, byte_length: usize) -> bool {
    value.len() == byte_length.saturating_mul(2)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(SHA256_HEX_BYTES * 2);
    for byte in digest {
        use fmt::Write as _;
        write!(&mut output, "{byte:02x}").expect("writing to String cannot fail");
    }
    output
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    use super::*;
    use crate::host_api::HostStatusServer;
    use crate::installed_catalog::tests::signed_catalog;

    #[test]
    fn accepts_ordered_opaque_ids_and_an_empty_registry() {
        let registry = HostProfileRegistry::from_json_bytes(
            br#"{"schemaVersion":1,"profiles":[{"id":"profile-randy"},{"id":"guest-01"}]}"#,
        )
        .expect("registry parses");
        assert_eq!(registry.profile_ids(), ["profile-randy", "guest-01"]);
        assert!(
            HostProfileRegistry::from_json_bytes(br#"{"schemaVersion":1,"profiles":[]}"#)
                .expect("empty registry parses")
                .profile_ids()
                .is_empty()
        );
    }

    #[test]
    fn rejects_unknown_fields_bad_ids_duplicates_and_bounds() {
        for invalid in [
            br#"{"schemaVersion":2,"profiles":[]}"#.as_slice(),
            br#"{"schemaVersion":1,"profiles":[],"displayName":"Family"}"#.as_slice(),
            br#"{"schemaVersion":1,"profiles":[{"id":"../escape"}]}"#.as_slice(),
            br#"{"schemaVersion":1,"profiles":[{"id":"guest"},{"id":"guest"}]}"#.as_slice(),
            br#"{"schemaVersion":1,"profiles":[{"id":"guest","name":"Guest"}]}"#.as_slice(),
        ] {
            assert!(HostProfileRegistry::from_json_bytes(invalid).is_err());
        }

        let entries = (0..=MAX_PROFILE_REGISTRY_ENTRIES)
            .map(|index| format!(r#"{{"id":"profile-{index}"}}"#))
            .collect::<Vec<_>>()
            .join(",");
        let excessive = format!(r#"{{"schemaVersion":1,"profiles":[{entries}]}}"#);
        assert!(matches!(
            HostProfileRegistry::from_json_bytes(excessive.as_bytes()),
            Err(ProfileRegistryError::TooManyProfiles { .. })
        ));
        assert!(matches!(
            HostProfileRegistry::from_json_bytes(&vec![b' '; MAX_PROFILE_REGISTRY_BYTES + 1]),
            Err(ProfileRegistryError::TooLarge { .. })
        ));
    }

    #[test]
    fn validated_registry_enables_only_the_existing_launch_capability_path() {
        const ORIGIN: &str = "http://127.0.0.1:5173";
        let registry = HostProfileRegistry::from_json_bytes(
            br#"{"schemaVersion":1,"profiles":[{"id":"profile-randy"}]}"#,
        )
        .expect("registry parses");
        let (_fixture, catalog) = signed_catalog();
        let server = HostStatusServer::start_with_launch_service(
            ORIGIN,
            catalog,
            registry.into_profile_ids(),
        )
        .expect("launch API starts from registry IDs");
        let launcher_url = server
            .launcher_url("http://127.0.0.1:5173/")
            .expect("launcher URL");
        let token = launcher_url.split("vcg-host-token=").nth(1).expect("token");
        let mut stream = TcpStream::connect(server.address()).expect("connect API");
        write!(
            stream,
            "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {token}\r\n\r\n"
        )
        .expect("write status request");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .expect("read status response");
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains("\"trusted-package-launch\""));
    }

    const REGISTRY_ONE: &str = "11111111111111111111111111111111";
    const REGISTRY_TWO: &str = "22222222222222222222222222222222";

    fn protected_registry_bytes(
        registry_id: Option<&str>,
        generation: u64,
        previous_registry_sha256: Option<&str>,
        profile_ids: &[&str],
    ) -> Vec<u8> {
        serde_json::to_vec(&ProtectedProfileRegistryDocument {
            schema_version: PROTECTED_PROFILE_REGISTRY_SCHEMA_VERSION,
            registry_id: registry_id.map(str::to_owned),
            generation,
            previous_registry_sha256: previous_registry_sha256.map(str::to_owned),
            profiles: profile_ids
                .iter()
                .map(|id| ProfileRecord {
                    id: (*id).to_owned(),
                })
                .collect(),
        })
        .expect("protected registry serializes")
    }

    fn first_registry(profile_ids: &[&str]) -> Vec<u8> {
        protected_registry_bytes(
            Some(REGISTRY_ONE),
            1,
            Some(&sha256_hex(
                &empty_protected_registry_bytes().expect("empty registry serializes"),
            )),
            profile_ids,
        )
    }

    #[test]
    fn protected_state_is_closed_bounded_and_canonical() {
        let initial = ProtectedProfileRegistryState::uninitialized();
        let initial_bytes = initial.to_json_bytes().expect("initial state serializes");
        assert_eq!(
            initial_bytes,
            br#"{"schemaVersion":1,"registryId":null,"generation":0,"registrySha256":null}"#
        );
        assert_eq!(
            ProtectedProfileRegistryState::from_json_bytes(&initial_bytes)
                .expect("initial state parses"),
            initial
        );

        let mut padded = initial_bytes.clone();
        padded.push(b'\n');
        assert!(ProtectedProfileRegistryState::from_json_bytes(&padded).is_err());
        assert!(
            ProtectedProfileRegistryState::from_json_bytes(
                br#"{"schemaVersion":1,"registryId":null,"generation":0,"registrySha256":null,"path":"profiles.json"}"#
            )
            .is_err()
        );
        assert!(
            ProtectedProfileRegistryState::from_json_bytes(
                br#"{"schemaVersion":2,"registryId":null,"generation":0,"registrySha256":null}"#
            )
            .is_err()
        );
        assert!(
            ProtectedProfileRegistryState::from_json_bytes(
                br#"{"schemaVersion":1,"registryId":"11111111111111111111111111111111","generation":0,"registrySha256":null}"#
            )
            .is_err()
        );
        assert!(
            ProtectedProfileRegistryState::from_json_bytes(&vec![
                b' ';
                MAX_PROTECTED_PROFILE_REGISTRY_STATE_BYTES
                    + 1
            ])
            .is_err()
        );
    }

    #[test]
    fn protected_registry_grants_no_authority_before_exact_commit() {
        let initial = ProtectedProfileRegistryState::uninitialized();
        let empty = empty_protected_registry_bytes().expect("empty registry serializes");
        assert!(matches!(
            HostProfileRegistry::load_protected(&empty, &initial)
                .expect("empty unprovisioned registry is safe"),
            ProtectedProfileRegistryLoad::Active(registry) if registry.profile_ids().is_empty()
        ));

        let first = first_registry(&["profile-randy", "guest-01"]);
        let next_state = match HostProfileRegistry::load_protected(&first, &initial)
            .expect("one exact publication is recoverable")
        {
            ProtectedProfileRegistryLoad::ProtectionCommitRequired(state) => state,
            ProtectedProfileRegistryLoad::Active(_) => {
                panic!("published profile IDs must not be active before protected commit")
            }
        };
        assert_eq!(next_state.generation(), 1);
        assert_eq!(next_state.registry_id(), Some(REGISTRY_ONE));
        assert_eq!(
            next_state.registry_sha256(),
            Some(sha256_hex(&first).as_str())
        );

        let active = match HostProfileRegistry::load_protected(&first, &next_state)
            .expect("exact protected commit activates registry")
        {
            ProtectedProfileRegistryLoad::Active(registry) => registry,
            ProtectedProfileRegistryLoad::ProtectionCommitRequired(_) => {
                panic!("matching protected state must be active")
            }
        };
        assert_eq!(active.profile_ids(), ["profile-randy", "guest-01"]);
    }

    #[test]
    fn protected_registry_rejects_noncanonical_or_sensitive_documents() {
        let initial = ProtectedProfileRegistryState::uninitialized();
        let first = first_registry(&["profile-randy"]);
        let mut padded = first.clone();
        padded.push(b'\n');
        assert!(matches!(
            HostProfileRegistry::load_protected(&padded, &initial),
            Err(ProfileRegistryError::NonCanonicalProtectedRegistry)
        ));

        for invalid in [
            br#"{"schemaVersion":2,"registryId":null,"generation":0,"previousRegistrySha256":null,"profiles":[{"id":"profile-randy"}]}"#.as_slice(),
            br#"{"schemaVersion":2,"registryId":"11111111111111111111111111111111","generation":1,"previousRegistrySha256":"0000000000000000000000000000000000000000000000000000000000000000","profiles":[{"id":"../escape"}]}"#.as_slice(),
            br#"{"schemaVersion":2,"registryId":"11111111111111111111111111111111","generation":1,"previousRegistrySha256":"0000000000000000000000000000000000000000000000000000000000000000","profiles":[{"id":"profile-randy","displayName":"Randy"}]}"#.as_slice(),
            br#"{"schemaVersion":2,"registryId":"11111111111111111111111111111111","generation":1,"previousRegistrySha256":"0000000000000000000000000000000000000000000000000000000000000000","profiles":[],"portrait":"bytes"}"#.as_slice(),
        ] {
            assert!(HostProfileRegistry::load_protected(invalid, &initial).is_err());
        }
    }

    #[test]
    fn protected_registry_rejects_rollback_substitution_jump_and_chain_drift() {
        let initial = ProtectedProfileRegistryState::uninitialized();
        let first = first_registry(&["profile-randy"]);
        let committed = match HostProfileRegistry::load_protected(&first, &initial)
            .expect("first publication validates")
        {
            ProtectedProfileRegistryLoad::ProtectionCommitRequired(state) => state,
            ProtectedProfileRegistryLoad::Active(_) => panic!("commit must be required"),
        };

        let empty = empty_protected_registry_bytes().expect("empty registry serializes");
        assert!(matches!(
            HostProfileRegistry::load_protected(&empty, &committed),
            Err(ProfileRegistryError::ProtectedStateRollback { .. })
        ));

        let substituted = first_registry(&["profile-other"]);
        assert!(matches!(
            HostProfileRegistry::load_protected(&substituted, &committed),
            Err(ProfileRegistryError::ProtectedStateDigestMismatch)
        ));

        let jump = protected_registry_bytes(
            Some(REGISTRY_ONE),
            3,
            committed.registry_sha256(),
            &["profile-randy"],
        );
        assert!(matches!(
            HostProfileRegistry::load_protected(&jump, &committed),
            Err(ProfileRegistryError::ProtectedStateJump { .. })
        ));

        let wrong_scope = protected_registry_bytes(
            Some(REGISTRY_TWO),
            2,
            committed.registry_sha256(),
            &["profile-randy"],
        );
        assert!(matches!(
            HostProfileRegistry::load_protected(&wrong_scope, &committed),
            Err(ProfileRegistryError::ProtectedStateScopeMismatch)
        ));

        let wrong_predecessor = protected_registry_bytes(
            Some(REGISTRY_ONE),
            2,
            Some(&"00".repeat(SHA256_HEX_BYTES)),
            &["profile-randy"],
        );
        assert!(matches!(
            HostProfileRegistry::load_protected(&wrong_predecessor, &committed),
            Err(ProfileRegistryError::ProtectedStatePredecessorMismatch)
        ));

        let second = protected_registry_bytes(
            Some(REGISTRY_ONE),
            2,
            committed.registry_sha256(),
            &["profile-randy", "guest-01"],
        );
        let second_state = match HostProfileRegistry::load_protected(&second, &committed)
            .expect("one chained next publication validates")
        {
            ProtectedProfileRegistryLoad::ProtectionCommitRequired(state) => state,
            ProtectedProfileRegistryLoad::Active(_) => panic!("second commit must be required"),
        };
        assert_eq!(second_state.generation(), 2);
        assert!(matches!(
            HostProfileRegistry::load_protected(&second, &second_state)
                .expect("second exact commit activates"),
            ProtectedProfileRegistryLoad::Active(registry)
                if registry.profile_ids() == ["profile-randy", "guest-01"]
        ));
    }
}
