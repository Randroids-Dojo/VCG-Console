//! Bounded persistent launch-profile authority.
//!
//! This registry contains opaque host IDs only. It intentionally excludes
//! display names, portraits, body-derived data, save paths, and deletion or
//! reassignment commands.

use std::collections::HashSet;
use std::fmt;

use serde::Deserialize;

use crate::installed_catalog::validate_intent_id;

/// Maximum serialized registry accepted from host-owned persistent state.
pub const MAX_PROFILE_REGISTRY_BYTES: usize = 16 * 1_024;
/// Maximum launchable profiles in one host registry.
pub const MAX_PROFILE_REGISTRY_ENTRIES: usize = 64;

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
        if bytes.len() > MAX_PROFILE_REGISTRY_BYTES {
            return Err(ProfileRegistryError::TooLarge {
                maximum: MAX_PROFILE_REGISTRY_BYTES,
            });
        }
        let document: ProfileRegistryDocument = serde_json::from_slice(bytes)
            .map_err(|error| ProfileRegistryError::InvalidDocument(error.to_string()))?;
        if document.schema_version != 1 {
            return Err(ProfileRegistryError::UnsupportedSchema(
                document.schema_version,
            ));
        }
        if document.profiles.len() > MAX_PROFILE_REGISTRY_ENTRIES {
            return Err(ProfileRegistryError::TooManyProfiles {
                maximum: MAX_PROFILE_REGISTRY_ENTRIES,
                actual: document.profiles.len(),
            });
        }

        let mut seen = HashSet::with_capacity(document.profiles.len());
        let mut profile_ids = Vec::with_capacity(document.profiles.len());
        for profile in document.profiles {
            validate_intent_id("profile", &profile.id)
                .map_err(|_| ProfileRegistryError::InvalidProfileId(profile.id.clone()))?;
            if !seen.insert(profile.id.clone()) {
                return Err(ProfileRegistryError::DuplicateProfileId(profile.id));
            }
            profile_ids.push(profile.id);
        }
        Ok(Self { profile_ids })
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileRegistryDocument {
    schema_version: u32,
    profiles: Vec<ProfileRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileRecord {
    id: String,
}

/// Strict profile-registry validation failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProfileRegistryError {
    TooLarge { maximum: usize },
    InvalidDocument(String),
    UnsupportedSchema(u32),
    TooManyProfiles { maximum: usize, actual: usize },
    InvalidProfileId(String),
    DuplicateProfileId(String),
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
        }
    }
}

impl std::error::Error for ProfileRegistryError {}

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
}
