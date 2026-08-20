//! Bounded update-signing roles and root-key rotation.
//!
//! This is a small TUF-inspired trust primitive, not a TUF or Uptane client.
//! It verifies root metadata under an out-of-band threshold before parsing,
//! requires exact-generation dual-threshold root rotation, and authorizes
//! artifact bytes only through exact channel/artifact/target roles.

use std::collections::BTreeSet;
use std::fmt;

use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;

const ROOT_SCHEMA_VERSION: u32 = 1;
const ROOT_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-UPDATE-TRUST-ROOT-V1\0";
const SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-SYSTEM-IMAGE-MANIFEST-V1\0";
const RECOVERY_IMAGE_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-RECOVERY-IMAGE-MANIFEST-V1\0";
const INSTALLED_CATALOG_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-INSTALLED-CATALOG-V1\0";
const PACKAGE_RELEASE_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-PACKAGE-RELEASE-V1\0";
const RETRO_SYSTEM_POLICY_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-RETRO-SYSTEM-POLICY-V1\0";
/// Maximum accepted root-metadata payload before signature verification.
pub const MAX_UPDATE_ROOT_METADATA_BYTES: usize = 64 * 1_024;
/// Maximum accepted signed retro system-policy payload.
pub const MAX_RETRO_SYSTEM_POLICY_BYTES: usize = 64 * 1_024;
/// Maximum accepted serialized detached-signature bundle.
pub const MAX_UPDATE_SIGNATURE_BUNDLE_BYTES: usize = 32 * 1_024;
/// Maximum accepted serialized out-of-band root-anchor set.
pub const MAX_UPDATE_ROOT_ANCHOR_BYTES: usize = 16 * 1_024;
const MAX_ROOT_KEYS: usize = 16;
const MAX_ROLES: usize = 32;
const MAX_ROLE_KEYS: usize = 16;
const MAX_SIGNATURES: usize = 32;

/// Artifact families with distinct signature domains.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum UpdateArtifactKind {
    SystemImage,
    RecoveryImage,
    InstalledCatalog,
    PackageRelease,
    RetroSystemPolicy,
}

impl UpdateArtifactKind {
    const fn signed_message_prefix(self) -> &'static [u8] {
        match self {
            Self::SystemImage => SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
            Self::RecoveryImage => RECOVERY_IMAGE_SIGNED_MESSAGE_PREFIX,
            Self::InstalledCatalog => INSTALLED_CATALOG_SIGNED_MESSAGE_PREFIX,
            Self::PackageRelease => PACKAGE_RELEASE_SIGNED_MESSAGE_PREFIX,
            Self::RetroSystemPolicy => RETRO_SYSTEM_POLICY_SIGNED_MESSAGE_PREFIX,
        }
    }

    const fn maximum_payload_bytes(self) -> usize {
        match self {
            Self::SystemImage | Self::RecoveryImage | Self::PackageRelease => 64 * 1_024,
            Self::RetroSystemPolicy => MAX_RETRO_SYSTEM_POLICY_BYTES,
            Self::InstalledCatalog => 1_048_576,
        }
    }
}

/// Builds the exact domain-separated message signed for one delegated
/// artifact. Development tooling uses this helper so it cannot drift from the
/// verifier's protocol prefix.
#[must_use]
pub fn artifact_signing_message(artifact: UpdateArtifactKind, payload: &[u8]) -> Vec<u8> {
    let prefix = artifact.signed_message_prefix();
    let mut message = Vec::with_capacity(prefix.len() + payload.len());
    message.extend_from_slice(prefix);
    message.extend_from_slice(payload);
    message
}

/// Builds the exact domain-separated message signed by update-root keys.
#[must_use]
pub fn root_signing_message(payload: &[u8]) -> Vec<u8> {
    let mut message = Vec::with_capacity(ROOT_SIGNED_MESSAGE_PREFIX.len() + payload.len());
    message.extend_from_slice(ROOT_SIGNED_MESSAGE_PREFIX);
    message.extend_from_slice(payload);
    message
}

/// One host-provisioned offline root public key.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootTrustAnchor {
    key_id: String,
    public_key: [u8; 32],
}

impl RootTrustAnchor {
    /// Creates one validated root trust anchor.
    ///
    /// # Errors
    ///
    /// Rejects unsafe identifiers and invalid Ed25519 public keys.
    pub fn new(key_id: impl Into<String>, public_key: [u8; 32]) -> Result<Self, UpdateTrustError> {
        let key_id = key_id.into();
        validate_identifier("root key ID", &key_id, 64)?;
        validate_public_key(&public_key)?;
        Ok(Self { key_id, public_key })
    }

    #[must_use]
    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    #[must_use]
    pub const fn public_key(&self) -> [u8; 32] {
        self.public_key
    }
}

/// Out-of-band root anchors and their required signature threshold.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootTrustAnchorSet {
    threshold: u8,
    anchors: Vec<RootTrustAnchor>,
}

impl RootTrustAnchorSet {
    /// Creates a bounded, unique root-anchor set.
    ///
    /// # Errors
    ///
    /// Rejects an empty/excessive set, impossible threshold, duplicate key ID,
    /// or duplicate public key.
    pub fn new(
        threshold: u8,
        anchors: impl IntoIterator<Item = RootTrustAnchor>,
    ) -> Result<Self, UpdateTrustError> {
        let anchors = anchors.into_iter().collect::<Vec<_>>();
        validate_key_set(
            "root anchors",
            threshold,
            &anchors
                .iter()
                .map(|anchor| UpdateKey {
                    key_id: anchor.key_id.clone(),
                    public_key: anchor.public_key,
                })
                .collect::<Vec<_>>(),
            MAX_ROOT_KEYS,
        )?;
        Ok(Self { threshold, anchors })
    }

    /// Decodes one bounded, strict JSON root-anchor set.
    ///
    /// Root anchors remain out-of-band host configuration. This parser only
    /// gives that configuration a deterministic on-disk representation; it
    /// does not make the file self-authenticating.
    ///
    /// # Errors
    ///
    /// Rejects empty/oversized or malformed input, unknown fields, an
    /// unsupported schema, invalid keys, duplicate keys, or an impossible
    /// threshold.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, UpdateTrustError> {
        if bytes.is_empty() || bytes.len() > MAX_UPDATE_ROOT_ANCHOR_BYTES {
            return Err(UpdateTrustError::RootAnchorMetadataSize {
                maximum_bytes: MAX_UPDATE_ROOT_ANCHOR_BYTES,
            });
        }
        let document: RootAnchorSetDocument = serde_json::from_slice(bytes)
            .map_err(|error| UpdateTrustError::InvalidDocument(error.to_string()))?;
        if document.schema_version != ROOT_SCHEMA_VERSION {
            return Err(UpdateTrustError::UnsupportedSchema(document.schema_version));
        }
        let anchors = document
            .anchors
            .into_iter()
            .map(|anchor| {
                let public_key = decode_canonical_hex::<32>(
                    anchor.public_key.as_bytes(),
                    "root anchor public key",
                )?;
                RootTrustAnchor::new(anchor.key_id, public_key)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Self::new(document.threshold, anchors)
    }

    #[must_use]
    pub const fn threshold(&self) -> u8 {
        self.threshold
    }

    #[must_use]
    pub fn anchors(&self) -> &[RootTrustAnchor] {
        &self.anchors
    }
}

/// One detached Ed25519 signature labeled by its authorized key ID.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DetachedUpdateSignature {
    key_id: String,
    signature: [u8; 64],
}

impl DetachedUpdateSignature {
    /// Decodes one canonical lowercase hexadecimal detached signature.
    ///
    /// # Errors
    ///
    /// Rejects an unsafe key ID or noncanonical/wrong-length signature.
    pub fn from_hex(
        key_id: impl Into<String>,
        signature_hex: &str,
    ) -> Result<Self, UpdateTrustError> {
        let key_id = key_id.into();
        validate_identifier("signature key ID", &key_id, 64)?;
        let signature = decode_canonical_hex::<64>(signature_hex.as_bytes(), "detached signature")?;
        Ok(Self { key_id, signature })
    }

    #[must_use]
    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    #[must_use]
    pub const fn signature(&self) -> [u8; 64] {
        self.signature
    }
}

/// Bounded detached signatures for one exact byte document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DetachedUpdateSignatures {
    signatures: Vec<DetachedUpdateSignature>,
}

impl DetachedUpdateSignatures {
    /// Creates a bounded signature set with unique key IDs.
    ///
    /// # Errors
    ///
    /// Rejects an empty/excessive set or repeated key ID.
    pub fn new(
        signatures: impl IntoIterator<Item = DetachedUpdateSignature>,
    ) -> Result<Self, UpdateTrustError> {
        let signatures = signatures.into_iter().collect::<Vec<_>>();
        if signatures.is_empty() || signatures.len() > MAX_SIGNATURES {
            return Err(UpdateTrustError::InvalidSignatureSet);
        }
        let mut key_ids = BTreeSet::new();
        for signature in &signatures {
            if !key_ids.insert(signature.key_id.clone()) {
                return Err(UpdateTrustError::DuplicateSignatureKey(
                    signature.key_id.clone(),
                ));
            }
        }
        Ok(Self { signatures })
    }

    /// Decodes one bounded, strict JSON detached-signature bundle.
    ///
    /// # Errors
    ///
    /// Rejects empty/oversized or malformed input, unknown fields, an
    /// unsupported schema, invalid signature encodings, duplicate key IDs, or
    /// an empty/excessive set.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, UpdateTrustError> {
        if bytes.is_empty() || bytes.len() > MAX_UPDATE_SIGNATURE_BUNDLE_BYTES {
            return Err(UpdateTrustError::SignatureMetadataSize {
                maximum_bytes: MAX_UPDATE_SIGNATURE_BUNDLE_BYTES,
            });
        }
        let document: SignatureSetDocument = serde_json::from_slice(bytes)
            .map_err(|error| UpdateTrustError::InvalidDocument(error.to_string()))?;
        if document.schema_version != ROOT_SCHEMA_VERSION {
            return Err(UpdateTrustError::UnsupportedSchema(document.schema_version));
        }
        let signatures = document
            .signatures
            .into_iter()
            .map(|signature| {
                DetachedUpdateSignature::from_hex(signature.key_id, &signature.signature)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Self::new(signatures)
    }

    #[must_use]
    pub fn signatures(&self) -> &[DetachedUpdateSignature] {
        &self.signatures
    }
}

/// Signature-verified update-role authority for one exact payload.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedUpdateRole {
    root_generation: u64,
    channel: String,
    artifact: UpdateArtifactKind,
    target: String,
    signing_key_ids: Vec<String>,
}

impl VerifiedUpdateRole {
    #[must_use]
    pub const fn root_generation(&self) -> u64 {
        self.root_generation
    }

    #[must_use]
    pub fn channel(&self) -> &str {
        &self.channel
    }

    #[must_use]
    pub const fn artifact(&self) -> UpdateArtifactKind {
        self.artifact
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    #[must_use]
    pub fn signing_key_ids(&self) -> &[String] {
        &self.signing_key_ids
    }
}

/// One current root policy accepted through threshold verification.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrustedUpdateRoot {
    generation: u64,
    expires_unix_seconds: u64,
    root_threshold: u8,
    root_keys: Vec<UpdateKey>,
    roles: Vec<UpdateRole>,
}

/// Current delegated update policy carried by host-owned package workflows.
///
/// Trusted time and the accepted root generation still have to come from a
/// protected platform adapter. Keeping them with the root prevents downstream
/// catalog and package code from silently selecting a different channel or
/// time basis.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrustedUpdatePolicy {
    root: TrustedUpdateRoot,
    channel: String,
    trusted_unix_seconds: u64,
}

impl TrustedUpdatePolicy {
    /// Binds one accepted root to an exact update channel and trusted time.
    ///
    /// # Errors
    ///
    /// Rejects an unsafe channel or a root already expired at the supplied
    /// trusted time.
    pub fn new(
        root: TrustedUpdateRoot,
        channel: impl Into<String>,
        trusted_unix_seconds: u64,
    ) -> Result<Self, UpdateTrustError> {
        let channel = channel.into();
        validate_identifier("update channel", &channel, 64)?;
        root.ensure_current(trusted_unix_seconds)?;
        Ok(Self {
            root,
            channel,
            trusted_unix_seconds,
        })
    }

    /// Verifies exact bytes under the policy's channel and trusted-time basis.
    ///
    /// # Errors
    ///
    /// Returns the underlying root or role-verification failure.
    pub fn verify(
        &self,
        artifact: UpdateArtifactKind,
        target: &str,
        artifact_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
    ) -> Result<VerifiedUpdateRole, UpdateTrustError> {
        self.root.verify_role(
            &self.channel,
            artifact,
            target,
            artifact_bytes,
            signatures,
            self.trusted_unix_seconds,
        )
    }

    #[must_use]
    pub const fn root(&self) -> &TrustedUpdateRoot {
        &self.root
    }

    #[must_use]
    pub fn channel(&self) -> &str {
        &self.channel
    }

    #[must_use]
    pub const fn trusted_unix_seconds(&self) -> u64 {
        self.trusted_unix_seconds
    }
}

impl TrustedUpdateRoot {
    /// Bootstraps root metadata from host-provisioned offline anchors.
    ///
    /// The exact root bytes are threshold-verified before JSON parsing. The
    /// parsed document must also meet its own root threshold, be unexpired,
    /// and not fall below the caller's persisted generation floor.
    ///
    /// # Errors
    ///
    /// Rejects oversized/tampered/malformed metadata, threshold failures,
    /// invalid key/role structure, rollback, or expiry.
    pub fn bootstrap(
        root_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
        trusted_unix_seconds: u64,
    ) -> Result<Self, UpdateTrustError> {
        Self::bootstrap_internal(
            root_bytes,
            signatures,
            anchors,
            minimum_generation,
            Some(trusted_unix_seconds),
        )
    }

    /// Replays a previously accepted bootstrap record.
    ///
    /// Historical roots may have expired since publication. Callers must
    /// verify the final replayed root with [`Self::require_current`] before
    /// using it for artifact authorization.
    pub(crate) fn bootstrap_stored(
        root_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
    ) -> Result<Self, UpdateTrustError> {
        Self::bootstrap_internal(root_bytes, signatures, anchors, minimum_generation, None)
    }

    fn bootstrap_internal(
        root_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        anchors: &RootTrustAnchorSet,
        minimum_generation: u64,
        trusted_unix_seconds: Option<u64>,
    ) -> Result<Self, UpdateTrustError> {
        require_bounded_root(root_bytes)?;
        let anchor_keys = anchors
            .anchors
            .iter()
            .map(|anchor| UpdateKey {
                key_id: anchor.key_id.clone(),
                public_key: anchor.public_key,
            })
            .collect::<Vec<_>>();
        verify_threshold(
            ROOT_SIGNED_MESSAGE_PREFIX,
            root_bytes,
            signatures,
            &anchor_keys,
            anchors.threshold,
            ThresholdKind::Bootstrap,
        )?;

        let root = Self::parse_verified(root_bytes)?;
        if root.generation < minimum_generation {
            return Err(UpdateTrustError::RootRollback {
                minimum_generation,
                actual_generation: root.generation,
            });
        }
        root.ensure_roles_distinct_from_roots(&anchor_keys)?;
        if let Some(trusted_unix_seconds) = trusted_unix_seconds {
            root.ensure_current(trusted_unix_seconds)?;
        }
        verify_threshold(
            ROOT_SIGNED_MESSAGE_PREFIX,
            root_bytes,
            signatures,
            &root.root_keys,
            root.root_threshold,
            ThresholdKind::CandidateRoot,
        )?;
        Ok(root)
    }

    /// Advances root authority by exactly one generation.
    ///
    /// Candidate bytes are first threshold-verified by the current root before
    /// parsing. The candidate must then be signed by its own root threshold.
    /// This models key replacement/revocation as an authenticated chain.
    ///
    /// # Errors
    ///
    /// Rejects old-threshold or new-threshold failure, skipped/rolled-back
    /// generation, invalid candidate structure, or candidate expiry.
    pub fn rotate(
        &self,
        candidate_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        trusted_unix_seconds: u64,
    ) -> Result<Self, UpdateTrustError> {
        self.rotate_internal(candidate_bytes, signatures, Some(trusted_unix_seconds))
    }

    /// Replays one previously accepted consecutive rotation record.
    ///
    /// This preserves every signature and structural check while deferring
    /// expiry validation until the final root in the stored chain.
    pub(crate) fn rotate_stored(
        &self,
        candidate_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
    ) -> Result<Self, UpdateTrustError> {
        self.rotate_internal(candidate_bytes, signatures, None)
    }

    fn rotate_internal(
        &self,
        candidate_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        trusted_unix_seconds: Option<u64>,
    ) -> Result<Self, UpdateTrustError> {
        require_bounded_root(candidate_bytes)?;
        verify_threshold(
            ROOT_SIGNED_MESSAGE_PREFIX,
            candidate_bytes,
            signatures,
            &self.root_keys,
            self.root_threshold,
            ThresholdKind::CurrentRoot,
        )?;
        let candidate = Self::parse_verified(candidate_bytes)?;
        let expected_generation = self
            .generation
            .checked_add(1)
            .ok_or(UpdateTrustError::GenerationOverflow)?;
        if candidate.generation != expected_generation {
            return Err(UpdateTrustError::NonConsecutiveRoot {
                expected_generation,
                actual_generation: candidate.generation,
            });
        }
        candidate.ensure_roles_distinct_from_roots(&self.root_keys)?;
        verify_threshold(
            ROOT_SIGNED_MESSAGE_PREFIX,
            candidate_bytes,
            signatures,
            &candidate.root_keys,
            candidate.root_threshold,
            ThresholdKind::CandidateRoot,
        )?;
        if let Some(trusted_unix_seconds) = trusted_unix_seconds {
            candidate.ensure_current(trusted_unix_seconds)?;
        }
        Ok(candidate)
    }

    /// Verifies exact artifact bytes under one channel/artifact/target role.
    ///
    /// Callers must parse and validate the artifact only after this returns,
    /// and must independently bind the target facts inside that document.
    ///
    /// # Errors
    ///
    /// Rejects an expired root, unsafe selector, absent role, or insufficient
    /// distinct valid signatures in the artifact's fixed protocol domain.
    pub fn verify_role(
        &self,
        channel: &str,
        artifact: UpdateArtifactKind,
        target: &str,
        artifact_bytes: &[u8],
        signatures: &DetachedUpdateSignatures,
        trusted_unix_seconds: u64,
    ) -> Result<VerifiedUpdateRole, UpdateTrustError> {
        self.ensure_current(trusted_unix_seconds)?;
        validate_identifier("update channel", channel, 64)?;
        validate_identifier("update target", target, 64)?;
        let maximum_bytes = artifact.maximum_payload_bytes();
        if artifact_bytes.is_empty() || artifact_bytes.len() > maximum_bytes {
            return Err(UpdateTrustError::ArtifactPayloadSize {
                artifact,
                maximum_bytes,
            });
        }
        let role = self
            .roles
            .iter()
            .find(|role| {
                role.channel == channel && role.artifact == artifact && role.target == target
            })
            .ok_or_else(|| UpdateTrustError::RoleNotFound {
                channel: channel.to_owned(),
                artifact,
                target: target.to_owned(),
            })?;
        let signing_key_ids = verify_threshold(
            artifact.signed_message_prefix(),
            artifact_bytes,
            signatures,
            &role.keys,
            role.threshold,
            ThresholdKind::ArtifactRole,
        )?;
        Ok(VerifiedUpdateRole {
            root_generation: self.generation,
            channel: channel.to_owned(),
            artifact,
            target: target.to_owned(),
            signing_key_ids,
        })
    }

    fn parse_verified(root_bytes: &[u8]) -> Result<Self, UpdateTrustError> {
        let document: RootDocument = serde_json::from_slice(root_bytes)
            .map_err(|error| UpdateTrustError::InvalidDocument(error.to_string()))?;
        if document.schema_version != ROOT_SCHEMA_VERSION {
            return Err(UpdateTrustError::UnsupportedSchema(document.schema_version));
        }
        if document.generation == 0 || document.expires_unix_seconds == 0 {
            return Err(UpdateTrustError::InvalidRootRecord(
                "generation and expiration must be greater than zero".to_owned(),
            ));
        }
        if document.roles.is_empty() || document.roles.len() > MAX_ROLES {
            return Err(UpdateTrustError::InvalidRootRecord(format!(
                "roles must contain 1..={MAX_ROLES} entries"
            )));
        }

        let root_keys = decode_keys(
            "root keys",
            document.root_threshold,
            document.root_keys,
            MAX_ROOT_KEYS,
        )?;
        let mut all_key_ids = root_keys
            .iter()
            .map(|key| key.key_id.clone())
            .collect::<BTreeSet<_>>();
        let mut all_public_keys = root_keys
            .iter()
            .map(|key| key.public_key)
            .collect::<BTreeSet<_>>();
        let mut role_ids = BTreeSet::new();
        let mut roles = Vec::with_capacity(document.roles.len());
        for document_role in document.roles {
            validate_identifier("update channel", &document_role.channel, 64)?;
            validate_identifier("update target", &document_role.target, 64)?;
            let artifact = document_role.artifact.into();
            let role_id = (
                document_role.channel.clone(),
                artifact,
                document_role.target.clone(),
            );
            if !role_ids.insert(role_id) {
                return Err(UpdateTrustError::DuplicateRole);
            }
            let keys = decode_keys(
                "role keys",
                document_role.threshold,
                document_role.keys,
                MAX_ROLE_KEYS,
            )?;
            for key in &keys {
                if !all_key_ids.insert(key.key_id.clone()) {
                    return Err(UpdateTrustError::DuplicateKeyId(key.key_id.clone()));
                }
                if !all_public_keys.insert(key.public_key) {
                    return Err(UpdateTrustError::DuplicatePublicKey);
                }
            }
            roles.push(UpdateRole {
                channel: document_role.channel,
                artifact,
                target: document_role.target,
                threshold: document_role.threshold,
                keys,
            });
        }

        Ok(Self {
            generation: document.generation,
            expires_unix_seconds: document.expires_unix_seconds,
            root_threshold: document.root_threshold,
            root_keys,
            roles,
        })
    }

    pub(crate) fn require_current(
        &self,
        trusted_unix_seconds: u64,
    ) -> Result<(), UpdateTrustError> {
        self.ensure_current(trusted_unix_seconds)
    }

    fn ensure_current(&self, trusted_unix_seconds: u64) -> Result<(), UpdateTrustError> {
        if trusted_unix_seconds >= self.expires_unix_seconds {
            return Err(UpdateTrustError::RootExpired {
                expires_unix_seconds: self.expires_unix_seconds,
                trusted_unix_seconds,
            });
        }
        Ok(())
    }

    fn ensure_roles_distinct_from_roots(
        &self,
        roots: &[UpdateKey],
    ) -> Result<(), UpdateTrustError> {
        for role_key in self.roles.iter().flat_map(|role| &role.keys) {
            if roots
                .iter()
                .any(|root_key| root_key.key_id == role_key.key_id)
            {
                return Err(UpdateTrustError::DuplicateKeyId(role_key.key_id.clone()));
            }
            if roots
                .iter()
                .any(|root_key| root_key.public_key == role_key.public_key)
            {
                return Err(UpdateTrustError::DuplicatePublicKey);
            }
        }
        Ok(())
    }

    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub const fn expires_unix_seconds(&self) -> u64 {
        self.expires_unix_seconds
    }

    #[must_use]
    pub const fn root_threshold(&self) -> u8 {
        self.root_threshold
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct UpdateKey {
    key_id: String,
    public_key: [u8; 32],
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct UpdateRole {
    channel: String,
    artifact: UpdateArtifactKind,
    target: String,
    threshold: u8,
    keys: Vec<UpdateKey>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootDocument {
    schema_version: u32,
    generation: u64,
    expires_unix_seconds: u64,
    root_threshold: u8,
    root_keys: Vec<KeyDocument>,
    roles: Vec<RoleDocument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootAnchorSetDocument {
    schema_version: u32,
    threshold: u8,
    anchors: Vec<KeyDocument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignatureSetDocument {
    schema_version: u32,
    signatures: Vec<SignatureDocument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignatureDocument {
    key_id: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct KeyDocument {
    key_id: String,
    public_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RoleDocument {
    channel: String,
    artifact: ArtifactDocument,
    target: String,
    threshold: u8,
    keys: Vec<KeyDocument>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum ArtifactDocument {
    SystemImage,
    RecoveryImage,
    InstalledCatalog,
    PackageRelease,
    RetroSystemPolicy,
}

impl From<ArtifactDocument> for UpdateArtifactKind {
    fn from(value: ArtifactDocument) -> Self {
        match value {
            ArtifactDocument::SystemImage => Self::SystemImage,
            ArtifactDocument::RecoveryImage => Self::RecoveryImage,
            ArtifactDocument::InstalledCatalog => Self::InstalledCatalog,
            ArtifactDocument::PackageRelease => Self::PackageRelease,
            ArtifactDocument::RetroSystemPolicy => Self::RetroSystemPolicy,
        }
    }
}

#[derive(Clone, Copy)]
enum ThresholdKind {
    Bootstrap,
    CurrentRoot,
    CandidateRoot,
    ArtifactRole,
}

fn require_bounded_root(root_bytes: &[u8]) -> Result<(), UpdateTrustError> {
    if root_bytes.is_empty() || root_bytes.len() > MAX_UPDATE_ROOT_METADATA_BYTES {
        return Err(UpdateTrustError::RootMetadataSize {
            maximum_bytes: MAX_UPDATE_ROOT_METADATA_BYTES,
        });
    }
    Ok(())
}

fn decode_keys(
    kind: &'static str,
    threshold: u8,
    documents: Vec<KeyDocument>,
    maximum_keys: usize,
) -> Result<Vec<UpdateKey>, UpdateTrustError> {
    let mut keys = Vec::with_capacity(documents.len());
    for document in documents {
        validate_identifier("update key ID", &document.key_id, 64)?;
        let public_key =
            decode_canonical_hex::<32>(document.public_key.as_bytes(), "update public key")?;
        validate_public_key(&public_key)?;
        keys.push(UpdateKey {
            key_id: document.key_id,
            public_key,
        });
    }
    validate_key_set(kind, threshold, &keys, maximum_keys)?;
    Ok(keys)
}

fn validate_key_set(
    kind: &'static str,
    threshold: u8,
    keys: &[UpdateKey],
    maximum_keys: usize,
) -> Result<(), UpdateTrustError> {
    if keys.is_empty() || keys.len() > maximum_keys || usize::from(threshold) > keys.len() {
        return Err(UpdateTrustError::InvalidThreshold {
            kind,
            threshold,
            key_count: keys.len(),
        });
    }
    if threshold == 0 {
        return Err(UpdateTrustError::InvalidThreshold {
            kind,
            threshold,
            key_count: keys.len(),
        });
    }
    let mut key_ids = BTreeSet::new();
    let mut public_keys = BTreeSet::new();
    for key in keys {
        if !key_ids.insert(key.key_id.clone()) {
            return Err(UpdateTrustError::DuplicateKeyId(key.key_id.clone()));
        }
        if !public_keys.insert(key.public_key) {
            return Err(UpdateTrustError::DuplicatePublicKey);
        }
    }
    Ok(())
}

fn verify_threshold(
    domain: &[u8],
    payload: &[u8],
    signatures: &DetachedUpdateSignatures,
    keys: &[UpdateKey],
    threshold: u8,
    threshold_kind: ThresholdKind,
) -> Result<Vec<String>, UpdateTrustError> {
    let mut signed_message = Vec::with_capacity(domain.len() + payload.len());
    signed_message.extend_from_slice(domain);
    signed_message.extend_from_slice(payload);
    let mut valid_key_ids = Vec::new();
    for key in keys {
        let Some(candidate) = signatures
            .signatures
            .iter()
            .find(|signature| signature.key_id == key.key_id)
        else {
            continue;
        };
        let verifying_key = VerifyingKey::from_bytes(&key.public_key)
            .map_err(|_| UpdateTrustError::InvalidEncoding("update public key"))?;
        let signature = Signature::from_bytes(&candidate.signature);
        if verifying_key
            .verify_strict(&signed_message, &signature)
            .is_ok()
        {
            valid_key_ids.push(key.key_id.clone());
        }
    }
    if valid_key_ids.len() < usize::from(threshold) {
        return Err(match threshold_kind {
            ThresholdKind::Bootstrap => UpdateTrustError::BootstrapThresholdNotMet {
                required: threshold,
                valid: valid_key_ids.len(),
            },
            ThresholdKind::CurrentRoot => UpdateTrustError::CurrentRootThresholdNotMet {
                required: threshold,
                valid: valid_key_ids.len(),
            },
            ThresholdKind::CandidateRoot => UpdateTrustError::CandidateRootThresholdNotMet {
                required: threshold,
                valid: valid_key_ids.len(),
            },
            ThresholdKind::ArtifactRole => UpdateTrustError::RoleThresholdNotMet {
                required: threshold,
                valid: valid_key_ids.len(),
            },
        });
    }
    Ok(valid_key_ids)
}

fn validate_identifier(
    kind: &'static str,
    value: &str,
    maximum_bytes: usize,
) -> Result<(), UpdateTrustError> {
    if value.is_empty()
        || value.len() > maximum_bytes
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(UpdateTrustError::InvalidIdentifier {
            kind,
            maximum_bytes,
        });
    }
    Ok(())
}

fn validate_public_key(public_key: &[u8; 32]) -> Result<(), UpdateTrustError> {
    VerifyingKey::from_bytes(public_key)
        .map(|_| ())
        .map_err(|_| UpdateTrustError::InvalidEncoding("update public key"))
}

fn decode_canonical_hex<const N: usize>(
    bytes: &[u8],
    kind: &'static str,
) -> Result<[u8; N], UpdateTrustError> {
    if bytes.len() != N * 2 {
        return Err(UpdateTrustError::InvalidEncoding(kind));
    }
    let mut output = [0_u8; N];
    for (index, pair) in bytes.chunks_exact(2).enumerate() {
        output[index] = (decode_nibble(pair[0], kind)? << 4) | decode_nibble(pair[1], kind)?;
    }
    Ok(output)
}

fn decode_nibble(byte: u8, kind: &'static str) -> Result<u8, UpdateTrustError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(UpdateTrustError::InvalidEncoding(kind)),
    }
}

/// Invalid root authority, role policy, or detached-signature evidence.
#[derive(Debug, Eq, PartialEq)]
pub enum UpdateTrustError {
    RootMetadataSize {
        maximum_bytes: usize,
    },
    RootAnchorMetadataSize {
        maximum_bytes: usize,
    },
    SignatureMetadataSize {
        maximum_bytes: usize,
    },
    InvalidSignatureSet,
    DuplicateSignatureKey(String),
    InvalidIdentifier {
        kind: &'static str,
        maximum_bytes: usize,
    },
    InvalidEncoding(&'static str),
    InvalidDocument(String),
    UnsupportedSchema(u32),
    InvalidRootRecord(String),
    InvalidThreshold {
        kind: &'static str,
        threshold: u8,
        key_count: usize,
    },
    DuplicateKeyId(String),
    DuplicatePublicKey,
    DuplicateRole,
    BootstrapThresholdNotMet {
        required: u8,
        valid: usize,
    },
    CurrentRootThresholdNotMet {
        required: u8,
        valid: usize,
    },
    CandidateRootThresholdNotMet {
        required: u8,
        valid: usize,
    },
    RoleThresholdNotMet {
        required: u8,
        valid: usize,
    },
    RootRollback {
        minimum_generation: u64,
        actual_generation: u64,
    },
    NonConsecutiveRoot {
        expected_generation: u64,
        actual_generation: u64,
    },
    GenerationOverflow,
    RootExpired {
        expires_unix_seconds: u64,
        trusted_unix_seconds: u64,
    },
    RoleNotFound {
        channel: String,
        artifact: UpdateArtifactKind,
        target: String,
    },
    ArtifactPayloadSize {
        artifact: UpdateArtifactKind,
        maximum_bytes: usize,
    },
}

impl fmt::Display for UpdateTrustError {
    #[allow(
        clippy::too_many_lines,
        reason = "each bounded trust failure has one explicit operator-facing message"
    )]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RootMetadataSize { maximum_bytes } => {
                write!(formatter, "root metadata must be 1..={maximum_bytes} bytes")
            }
            Self::RootAnchorMetadataSize { maximum_bytes } => {
                write!(
                    formatter,
                    "root-anchor metadata must be 1..={maximum_bytes} bytes"
                )
            }
            Self::SignatureMetadataSize { maximum_bytes } => {
                write!(
                    formatter,
                    "detached-signature metadata must be 1..={maximum_bytes} bytes"
                )
            }
            Self::InvalidSignatureSet => formatter.write_str("signature set size is invalid"),
            Self::DuplicateSignatureKey(key_id) => {
                write!(formatter, "signature key ID is duplicated: {key_id}")
            }
            Self::InvalidIdentifier {
                kind,
                maximum_bytes,
            } => write!(
                formatter,
                "{kind} must be 1..={maximum_bytes} safe ASCII identifier bytes"
            ),
            Self::InvalidEncoding(kind) => write!(formatter, "{kind} encoding is invalid"),
            Self::InvalidDocument(error) => {
                write!(formatter, "update trust document is invalid: {error}")
            }
            Self::UnsupportedSchema(version) => {
                write!(formatter, "update trust schema {version} is unsupported")
            }
            Self::InvalidRootRecord(error) => {
                write!(formatter, "update root record is invalid: {error}")
            }
            Self::InvalidThreshold {
                kind,
                threshold,
                key_count,
            } => write!(
                formatter,
                "{kind} threshold {threshold} is invalid for {key_count} keys"
            ),
            Self::DuplicateKeyId(key_id) => {
                write!(formatter, "update key ID is duplicated: {key_id}")
            }
            Self::DuplicatePublicKey => {
                formatter.write_str("update public key is reused across trust roles")
            }
            Self::DuplicateRole => formatter.write_str("update trust role is duplicated"),
            Self::BootstrapThresholdNotMet { required, valid } => write!(
                formatter,
                "bootstrap root threshold requires {required} signatures but {valid} are valid"
            ),
            Self::CurrentRootThresholdNotMet { required, valid } => write!(
                formatter,
                "current root threshold requires {required} signatures but {valid} are valid"
            ),
            Self::CandidateRootThresholdNotMet { required, valid } => write!(
                formatter,
                "candidate root threshold requires {required} signatures but {valid} are valid"
            ),
            Self::RoleThresholdNotMet { required, valid } => write!(
                formatter,
                "artifact role threshold requires {required} signatures but {valid} are valid"
            ),
            Self::RootRollback {
                minimum_generation,
                actual_generation,
            } => write!(
                formatter,
                "root generation {actual_generation} is below persisted floor {minimum_generation}"
            ),
            Self::NonConsecutiveRoot {
                expected_generation,
                actual_generation,
            } => write!(
                formatter,
                "root rotation requires generation {expected_generation}, got {actual_generation}"
            ),
            Self::GenerationOverflow => formatter.write_str("root generation overflow"),
            Self::RootExpired {
                expires_unix_seconds,
                trusted_unix_seconds,
            } => write!(
                formatter,
                "root expired at {expires_unix_seconds} under trusted time {trusted_unix_seconds}"
            ),
            Self::RoleNotFound {
                channel,
                artifact,
                target,
            } => write!(
                formatter,
                "no update trust role for {channel}/{artifact:?}/{target}"
            ),
            Self::ArtifactPayloadSize {
                artifact,
                maximum_bytes,
            } => write!(
                formatter,
                "{artifact:?} payload must be 1..={maximum_bytes} bytes"
            ),
        }
    }
}

impl std::error::Error for UpdateTrustError {}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const NOW: u64 = 2_000_000_000;
    const TARGET: &str = "raspberry-pi-5";

    fn signing_key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    fn hex(bytes: &[u8]) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut encoded = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            encoded.push(char::from(HEX[usize::from(byte >> 4)]));
            encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
        encoded
    }

    fn key_document(key_id: &str, key: &SigningKey) -> String {
        format!(
            r#"{{"keyId":"{key_id}","publicKey":"{}"}}"#,
            hex(key.verifying_key().as_bytes())
        )
    }

    fn role_document(
        channel: &str,
        artifact: &str,
        target: &str,
        threshold: u8,
        keys: &[(&str, &SigningKey)],
    ) -> String {
        let keys = keys
            .iter()
            .map(|(key_id, key)| key_document(key_id, key))
            .collect::<Vec<_>>()
            .join(",");
        format!(
            r#"{{"channel":"{channel}","artifact":"{artifact}","target":"{target}","threshold":{threshold},"keys":[{keys}]}}"#
        )
    }

    fn root_document(
        generation: u64,
        expires: u64,
        root_threshold: u8,
        root_keys: &[(&str, &SigningKey)],
        roles: &[String],
    ) -> Vec<u8> {
        let root_keys = root_keys
            .iter()
            .map(|(key_id, key)| key_document(key_id, key))
            .collect::<Vec<_>>()
            .join(",");
        format!(
            r#"{{"schemaVersion":1,"generation":{generation},"expiresUnixSeconds":{expires},"rootThreshold":{root_threshold},"rootKeys":[{root_keys}],"roles":[{}]}}"#,
            roles.join(",")
        )
        .into_bytes()
    }

    fn sign(
        key_id: &str,
        key: &SigningKey,
        domain: &[u8],
        payload: &[u8],
    ) -> DetachedUpdateSignature {
        let mut message = Vec::from(domain);
        message.extend_from_slice(payload);
        let signature = key.sign(&message);
        DetachedUpdateSignature::from_hex(key_id, &hex(&signature.to_bytes())).expect("signature")
    }

    fn signatures(entries: Vec<DetachedUpdateSignature>) -> DetachedUpdateSignatures {
        DetachedUpdateSignatures::new(entries).expect("signature set")
    }

    fn anchors(threshold: u8, entries: &[(&str, &SigningKey)]) -> RootTrustAnchorSet {
        RootTrustAnchorSet::new(
            threshold,
            entries.iter().map(|(key_id, key)| {
                RootTrustAnchor::new(*key_id, *key.verifying_key().as_bytes()).expect("root anchor")
            }),
        )
        .expect("anchor set")
    }

    fn bootstrap_fixture() -> (
        TrustedUpdateRoot,
        SigningKey,
        SigningKey,
        SigningKey,
        Vec<u8>,
    ) {
        let root_a = signing_key(1);
        let root_b = signing_key(2);
        let system = signing_key(3);
        let document = root_document(
            7,
            NOW + 10_000,
            2,
            &[("root-a", &root_a), ("root-b", &root_b)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system-stable", &system)],
            )],
        );
        let signature_set = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &document),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &document),
        ]);
        let root = TrustedUpdateRoot::bootstrap(
            &document,
            &signature_set,
            &anchors(2, &[("root-a", &root_a), ("root-b", &root_b)]),
            7,
            NOW,
        )
        .expect("bootstrap");
        (root, root_a, root_b, system, document)
    }

    #[test]
    fn bootstrap_verifies_threshold_before_parsing() {
        let root_a = signing_key(1);
        let root_b = signing_key(2);
        let malformed = b"[not-json".to_vec();
        let signatures = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &malformed),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &malformed),
        ]);
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &malformed,
                &signatures,
                &anchors(2, &[("root-a", &root_a), ("root-b", &root_b)]),
                0,
                NOW
            ),
            Err(UpdateTrustError::InvalidDocument(_))
        ));

        let mut changed = malformed.clone();
        changed[0] = b'{';
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &changed,
                &signatures,
                &anchors(2, &[("root-a", &root_a), ("root-b", &root_b)]),
                0,
                NOW
            ),
            Err(UpdateTrustError::BootstrapThresholdNotMet { .. })
        ));
    }

    #[test]
    fn bootstrap_requires_pinned_and_candidate_root_thresholds() {
        let root_a = signing_key(1);
        let root_b = signing_key(2);
        let document = root_document(
            1,
            NOW + 100,
            2,
            &[("root-a", &root_a), ("root-b", &root_b)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system", &signing_key(3))],
            )],
        );
        let only_a = signatures(vec![sign(
            "root-a",
            &root_a,
            ROOT_SIGNED_MESSAGE_PREFIX,
            &document,
        )]);
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &document,
                &only_a,
                &anchors(1, &[("root-a", &root_a)]),
                0,
                NOW
            ),
            Err(UpdateTrustError::CandidateRootThresholdNotMet {
                required: 2,
                valid: 1
            })
        ));
    }

    #[test]
    fn exact_next_root_requires_old_and_new_thresholds() {
        let (current, root_a, root_b, _system, _) = bootstrap_fixture();
        let root_c = signing_key(4);
        let root_d = signing_key(5);
        let next = root_document(
            8,
            NOW + 20_000,
            2,
            &[("root-c", &root_c), ("root-d", &root_d)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system-next", &signing_key(6))],
            )],
        );
        let all = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-c", &root_c, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-d", &root_d, ROOT_SIGNED_MESSAGE_PREFIX, &next),
        ]);
        let rotated = current.rotate(&next, &all, NOW).expect("rotate");
        assert_eq!(rotated.generation(), 8);

        let old_only = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &next),
        ]);
        assert!(matches!(
            current.rotate(&next, &old_only, NOW),
            Err(UpdateTrustError::CandidateRootThresholdNotMet { .. })
        ));
        let new_only = signatures(vec![
            sign("root-c", &root_c, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-d", &root_d, ROOT_SIGNED_MESSAGE_PREFIX, &next),
        ]);
        assert!(matches!(
            current.rotate(&next, &new_only, NOW),
            Err(UpdateTrustError::CurrentRootThresholdNotMet { .. })
        ));
    }

    #[test]
    fn rotation_rejects_skips_and_rollbacks() {
        let (current, root_a, root_b, _system, _) = bootstrap_fixture();
        for generation in [6, 7, 9] {
            let document = root_document(
                generation,
                NOW + 20_000,
                2,
                &[("root-a", &root_a), ("root-b", &root_b)],
                &[role_document(
                    "stable",
                    "system-image",
                    TARGET,
                    1,
                    &[("system", &signing_key(3))],
                )],
            );
            let signatures = signatures(vec![
                sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &document),
                sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &document),
            ]);
            assert!(matches!(
                current.rotate(&document, &signatures, NOW),
                Err(UpdateTrustError::NonConsecutiveRoot {
                    expected_generation: 8,
                    actual_generation
                }) if actual_generation == generation
            ));
        }
    }

    #[test]
    fn generation_floor_and_expiration_fail_closed() {
        let (_root, root_a, root_b, _system, document) = bootstrap_fixture();
        let signatures = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &document),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &document),
        ]);
        let anchors = anchors(2, &[("root-a", &root_a), ("root-b", &root_b)]);
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(&document, &signatures, &anchors, 8, NOW),
            Err(UpdateTrustError::RootRollback { .. })
        ));
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(&document, &signatures, &anchors, 7, NOW + 10_000),
            Err(UpdateTrustError::RootExpired { .. })
        ));
    }

    #[test]
    fn exact_role_and_threshold_authorize_artifact_bytes() {
        let root_a = signing_key(1);
        let root_b = signing_key(2);
        let role_a = signing_key(3);
        let role_b = signing_key(4);
        let document = root_document(
            1,
            NOW + 100,
            2,
            &[("root-a", &root_a), ("root-b", &root_b)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                2,
                &[("system-a", &role_a), ("system-b", &role_b)],
            )],
        );
        let root_signatures = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &document),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &document),
        ]);
        let root = TrustedUpdateRoot::bootstrap(
            &document,
            &root_signatures,
            &anchors(2, &[("root-a", &root_a), ("root-b", &root_b)]),
            1,
            NOW,
        )
        .expect("root");
        let artifact = b"{signed system image manifest}";
        let role_signatures = signatures(vec![
            sign(
                "system-a",
                &role_a,
                SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
                artifact,
            ),
            sign(
                "system-b",
                &role_b,
                SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
                artifact,
            ),
        ]);
        let authority = root
            .verify_role(
                "stable",
                UpdateArtifactKind::SystemImage,
                TARGET,
                artifact,
                &role_signatures,
                NOW,
            )
            .expect("role authority");
        assert_eq!(authority.root_generation(), 1);
        assert_eq!(authority.signing_key_ids(), ["system-a", "system-b"]);

        let one_signature = signatures(vec![sign(
            "system-a",
            &role_a,
            SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
            artifact,
        )]);
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::SystemImage,
                TARGET,
                artifact,
                &one_signature,
                NOW
            ),
            Err(UpdateTrustError::RoleThresholdNotMet {
                required: 2,
                valid: 1
            })
        ));
    }

    #[test]
    fn roles_are_exact_and_cross_protocol_signatures_fail() {
        let (root, _root_a, _root_b, system, _) = bootstrap_fixture();
        let artifact = b"payload";
        let wrong_domain = signatures(vec![sign(
            "system-stable",
            &system,
            PACKAGE_RELEASE_SIGNED_MESSAGE_PREFIX,
            artifact,
        )]);
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::SystemImage,
                TARGET,
                artifact,
                &wrong_domain,
                NOW
            ),
            Err(UpdateTrustError::RoleThresholdNotMet { valid: 0, .. })
        ));
        assert!(matches!(
            root.verify_role(
                "beta",
                UpdateArtifactKind::SystemImage,
                TARGET,
                artifact,
                &wrong_domain,
                NOW
            ),
            Err(UpdateTrustError::RoleNotFound { .. })
        ));
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::PackageRelease,
                TARGET,
                artifact,
                &wrong_domain,
                NOW
            ),
            Err(UpdateTrustError::RoleNotFound { .. })
        ));
    }

    /// One root that delegates the installed catalog and the retro system
    /// policy to two distinct keys, returned as `(root, catalog, policy)`.
    fn retro_policy_root_fixture() -> (TrustedUpdateRoot, SigningKey, SigningKey) {
        let root_key = signing_key(1);
        let catalog_key = signing_key(2);
        let policy_key = signing_key(3);
        let document = root_document(
            1,
            NOW + 100,
            1,
            &[("root-a", &root_key)],
            &[
                role_document(
                    "stable",
                    "installed-catalog",
                    TARGET,
                    1,
                    &[("catalog-a", &catalog_key)],
                ),
                role_document(
                    "stable",
                    "retro-system-policy",
                    TARGET,
                    1,
                    &[("retro-policy-a", &policy_key)],
                ),
            ],
        );
        let root = TrustedUpdateRoot::bootstrap(
            &document,
            &signatures(vec![sign(
                "root-a",
                &root_key,
                ROOT_SIGNED_MESSAGE_PREFIX,
                &document,
            )]),
            &anchors(1, &[("root-a", &root_key)]),
            1,
            NOW,
        )
        .expect("root");
        (root, catalog_key, policy_key)
    }

    #[test]
    fn retro_system_policy_role_authorizes_its_own_artifact() {
        let (root, _catalog_key, policy_key) = retro_policy_root_fixture();
        let artifact = b"{signed retro system policy}";
        let authority = root
            .verify_role(
                "stable",
                UpdateArtifactKind::RetroSystemPolicy,
                TARGET,
                artifact,
                &signatures(vec![sign(
                    "retro-policy-a",
                    &policy_key,
                    RETRO_SYSTEM_POLICY_SIGNED_MESSAGE_PREFIX,
                    artifact,
                )]),
                NOW,
            )
            .expect("retro system policy authority");
        assert_eq!(authority.artifact(), UpdateArtifactKind::RetroSystemPolicy);
        assert_eq!(authority.signing_key_ids(), ["retro-policy-a"]);
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::RetroSystemPolicy,
                TARGET,
                &vec![b'-'; MAX_RETRO_SYSTEM_POLICY_BYTES + 1],
                &signatures(vec![sign(
                    "retro-policy-a",
                    &policy_key,
                    RETRO_SYSTEM_POLICY_SIGNED_MESSAGE_PREFIX,
                    artifact,
                )]),
                NOW,
            ),
            Err(UpdateTrustError::ArtifactPayloadSize {
                artifact: UpdateArtifactKind::RetroSystemPolicy,
                ..
            })
        ));
    }

    #[test]
    fn retro_system_policy_signatures_are_role_and_domain_separated() {
        let (root, catalog_key, policy_key) = retro_policy_root_fixture();
        let artifact = b"{signed retro system policy}";

        // The catalog role key is trusted for catalogs and nothing else.
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::RetroSystemPolicy,
                TARGET,
                artifact,
                &signatures(vec![sign(
                    "catalog-a",
                    &catalog_key,
                    RETRO_SYSTEM_POLICY_SIGNED_MESSAGE_PREFIX,
                    artifact,
                )]),
                NOW,
            ),
            Err(UpdateTrustError::RoleThresholdNotMet { valid: 0, .. })
        ));
        // A policy signature made in the catalog domain does not verify here,
        // and the policy key cannot authorize a catalog.
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::RetroSystemPolicy,
                TARGET,
                artifact,
                &signatures(vec![sign(
                    "retro-policy-a",
                    &policy_key,
                    INSTALLED_CATALOG_SIGNED_MESSAGE_PREFIX,
                    artifact,
                )]),
                NOW,
            ),
            Err(UpdateTrustError::RoleThresholdNotMet { valid: 0, .. })
        ));
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::InstalledCatalog,
                TARGET,
                artifact,
                &signatures(vec![sign(
                    "retro-policy-a",
                    &policy_key,
                    INSTALLED_CATALOG_SIGNED_MESSAGE_PREFIX,
                    artifact,
                )]),
                NOW,
            ),
            Err(UpdateTrustError::RoleThresholdNotMet { valid: 0, .. })
        ));
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::RetroSystemPolicy,
                "other-target",
                artifact,
                &signatures(vec![sign(
                    "retro-policy-a",
                    &policy_key,
                    RETRO_SYSTEM_POLICY_SIGNED_MESSAGE_PREFIX,
                    artifact,
                )]),
                NOW,
            ),
            Err(UpdateTrustError::RoleNotFound { .. })
        ));
    }

    #[test]
    fn offline_recovery_channel_is_independent_from_stable_authority() {
        let root_key = signing_key(1);
        let stable_key = signing_key(2);
        let recovery_key = signing_key(3);
        let document = root_document(
            1,
            NOW + 100,
            1,
            &[("offline-root", &root_key)],
            &[
                role_document(
                    "stable",
                    "system-image",
                    TARGET,
                    1,
                    &[("system-stable", &stable_key)],
                ),
                role_document(
                    "recovery",
                    "recovery-image",
                    TARGET,
                    1,
                    &[("recovery-image", &recovery_key)],
                ),
            ],
        );
        let root_signatures = signatures(vec![sign(
            "offline-root",
            &root_key,
            ROOT_SIGNED_MESSAGE_PREFIX,
            &document,
        )]);
        let root = TrustedUpdateRoot::bootstrap(
            &document,
            &root_signatures,
            &anchors(1, &[("offline-root", &root_key)]),
            1,
            NOW,
        )
        .expect("root");
        let recovery_manifest = b"{offline recovery manifest}";
        let stable_signature = signatures(vec![sign(
            "system-stable",
            &stable_key,
            RECOVERY_IMAGE_SIGNED_MESSAGE_PREFIX,
            recovery_manifest,
        )]);
        assert!(matches!(
            root.verify_role(
                "recovery",
                UpdateArtifactKind::RecoveryImage,
                TARGET,
                recovery_manifest,
                &stable_signature,
                NOW,
            ),
            Err(UpdateTrustError::RoleThresholdNotMet { valid: 0, .. })
        ));
        let recovery_signature = signatures(vec![sign(
            "recovery-image",
            &recovery_key,
            RECOVERY_IMAGE_SIGNED_MESSAGE_PREFIX,
            recovery_manifest,
        )]);
        let authority = root
            .verify_role(
                "recovery",
                UpdateArtifactKind::RecoveryImage,
                TARGET,
                recovery_manifest,
                &recovery_signature,
                NOW,
            )
            .expect("independent recovery authority");
        assert_eq!(authority.channel(), "recovery");
        assert_eq!(authority.signing_key_ids(), ["recovery-image"]);
    }

    #[test]
    fn rotated_omission_revokes_old_role_key() {
        let (current, root_a, root_b, old_system, _) = bootstrap_fixture();
        let new_system = signing_key(7);
        let next = root_document(
            8,
            NOW + 20_000,
            2,
            &[("root-a", &root_a), ("root-b", &root_b)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system-new", &new_system)],
            )],
        );
        let root_signatures = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &next),
        ]);
        let rotated = current
            .rotate(&next, &root_signatures, NOW)
            .expect("rotate");
        let artifact = b"image manifest";
        let revoked = signatures(vec![sign(
            "system-stable",
            &old_system,
            SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
            artifact,
        )]);
        assert!(matches!(
            rotated.verify_role(
                "stable",
                UpdateArtifactKind::SystemImage,
                TARGET,
                artifact,
                &revoked,
                NOW
            ),
            Err(UpdateTrustError::RoleThresholdNotMet { valid: 0, .. })
        ));
    }

    #[test]
    fn dual_signed_artifact_survives_an_exact_role_key_cutover() {
        let (current, root_a, root_b, old_system, _) = bootstrap_fixture();
        let new_system = signing_key(7);
        let next = root_document(
            8,
            NOW + 20_000,
            2,
            &[("root-a", &root_a), ("root-b", &root_b)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system-new", &new_system)],
            )],
        );
        let rotated = current
            .rotate(
                &next,
                &signatures(vec![
                    sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &next),
                    sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &next),
                ]),
                NOW,
            )
            .expect("root rotates");
        let artifact = b"dual-authorized manifest";
        let dual_signatures = signatures(vec![
            sign(
                "system-stable",
                &old_system,
                SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
                artifact,
            ),
            sign(
                "system-new",
                &new_system,
                SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
                artifact,
            ),
        ]);

        assert_eq!(
            current
                .verify_role(
                    "stable",
                    UpdateArtifactKind::SystemImage,
                    TARGET,
                    artifact,
                    &dual_signatures,
                    NOW,
                )
                .expect("current role verifies")
                .signing_key_ids(),
            ["system-stable"]
        );
        assert_eq!(
            rotated
                .verify_role(
                    "stable",
                    UpdateArtifactKind::SystemImage,
                    TARGET,
                    artifact,
                    &dual_signatures,
                    NOW,
                )
                .expect("candidate role verifies")
                .signing_key_ids(),
            ["system-new"]
        );
    }

    #[test]
    fn duplicate_role_key_or_public_key_is_rejected() {
        let root_a = signing_key(1);
        let role = signing_key(3);
        let duplicate_role = root_document(
            1,
            NOW + 100,
            1,
            &[("root-a", &root_a)],
            &[
                role_document("stable", "system-image", TARGET, 1, &[("system-a", &role)]),
                role_document(
                    "stable",
                    "system-image",
                    TARGET,
                    1,
                    &[("system-b", &signing_key(4))],
                ),
            ],
        );
        let duplicate_role_signatures = signatures(vec![sign(
            "root-a",
            &root_a,
            ROOT_SIGNED_MESSAGE_PREFIX,
            &duplicate_role,
        )]);
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &duplicate_role,
                &duplicate_role_signatures,
                &anchors(1, &[("root-a", &root_a)]),
                0,
                NOW
            ),
            Err(UpdateTrustError::DuplicateRole)
        ));

        let reused_key = root_document(
            1,
            NOW + 100,
            1,
            &[("root-a", &root_a)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system-a", &root_a)],
            )],
        );
        let reused_key_signatures = signatures(vec![sign(
            "root-a",
            &root_a,
            ROOT_SIGNED_MESSAGE_PREFIX,
            &reused_key,
        )]);
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &reused_key,
                &reused_key_signatures,
                &anchors(1, &[("root-a", &root_a)]),
                0,
                NOW
            ),
            Err(UpdateTrustError::DuplicatePublicKey)
        ));
    }

    #[test]
    fn retired_or_bootstrap_root_key_cannot_become_a_delegated_key() {
        let bootstrap_root = signing_key(1);
        let candidate_root = signing_key(2);
        let document = root_document(
            1,
            NOW + 100,
            1,
            &[("candidate-root", &candidate_root)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("former-root-as-role", &bootstrap_root)],
            )],
        );
        let signature_set = signatures(vec![
            sign(
                "bootstrap-root",
                &bootstrap_root,
                ROOT_SIGNED_MESSAGE_PREFIX,
                &document,
            ),
            sign(
                "candidate-root",
                &candidate_root,
                ROOT_SIGNED_MESSAGE_PREFIX,
                &document,
            ),
        ]);
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &document,
                &signature_set,
                &anchors(1, &[("bootstrap-root", &bootstrap_root)]),
                0,
                NOW
            ),
            Err(UpdateTrustError::DuplicatePublicKey)
        ));

        let (current, root_a, root_b, _system, _) = bootstrap_fixture();
        let next_root = signing_key(8);
        let next = root_document(
            8,
            NOW + 20_000,
            1,
            &[("next-root", &next_root)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("retired-root-as-role", &root_a)],
            )],
        );
        let rotation_signatures = signatures(vec![
            sign("root-a", &root_a, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("root-b", &root_b, ROOT_SIGNED_MESSAGE_PREFIX, &next),
            sign("next-root", &next_root, ROOT_SIGNED_MESSAGE_PREFIX, &next),
        ]);
        assert!(matches!(
            current.rotate(&next, &rotation_signatures, NOW),
            Err(UpdateTrustError::DuplicatePublicKey)
        ));
    }

    #[test]
    fn unknown_fields_noncanonical_encodings_and_bad_bounds_fail() {
        let root_a = signing_key(1);
        let system = signing_key(3);
        let valid = root_document(
            1,
            NOW + 100,
            1,
            &[("root-a", &root_a)],
            &[role_document(
                "stable",
                "system-image",
                TARGET,
                1,
                &[("system", &system)],
            )],
        );
        for changed in [
            String::from_utf8(valid.clone()).expect("UTF-8").replace(
                "\"schemaVersion\":1",
                "\"schemaVersion\":1,\"unknown\":true",
            ),
            String::from_utf8(valid.clone())
                .expect("UTF-8")
                .replace("\"rootThreshold\":1", "\"rootThreshold\":0"),
            String::from_utf8(valid.clone())
                .expect("UTF-8")
                .replace("\"stable\"", "\"../stable\""),
            String::from_utf8(valid.clone())
                .expect("UTF-8")
                .replace(&hex(root_a.verifying_key().as_bytes()), &"A".repeat(64)),
        ] {
            let bytes = changed.into_bytes();
            let signatures = signatures(vec![sign(
                "root-a",
                &root_a,
                ROOT_SIGNED_MESSAGE_PREFIX,
                &bytes,
            )]);
            assert!(
                TrustedUpdateRoot::bootstrap(
                    &bytes,
                    &signatures,
                    &anchors(1, &[("root-a", &root_a)]),
                    0,
                    NOW
                )
                .is_err()
            );
        }
    }

    #[test]
    fn detached_signature_set_is_canonical_bounded_and_unique() {
        let key = signing_key(1);
        let signature = sign("root", &key, ROOT_SIGNED_MESSAGE_PREFIX, b"bytes");
        assert!(matches!(
            DetachedUpdateSignatures::new([signature.clone(), signature]),
            Err(UpdateTrustError::DuplicateSignatureKey(_))
        ));
        assert!(matches!(
            DetachedUpdateSignature::from_hex("root", &"A".repeat(128)),
            Err(UpdateTrustError::InvalidEncoding("detached signature"))
        ));
        assert!(matches!(
            DetachedUpdateSignatures::new(Vec::new()),
            Err(UpdateTrustError::InvalidSignatureSet)
        ));
    }

    #[test]
    fn serialized_trust_inputs_are_strict_bounded_and_equivalent() {
        let root = signing_key(1);
        let detached = sign("root-one", &root, ROOT_SIGNED_MESSAGE_PREFIX, b"bytes");
        let signature_json = format!(
            r#"{{"schemaVersion":1,"signatures":[{{"keyId":"root-one","signature":"{}"}}]}}"#,
            hex(&detached.signature())
        );
        let parsed_signatures =
            DetachedUpdateSignatures::from_json_bytes(signature_json.as_bytes())
                .expect("signature bundle parses");
        assert_eq!(parsed_signatures.signatures(), [detached]);

        let anchors_json = format!(
            r#"{{"schemaVersion":1,"threshold":1,"anchors":[{{"keyId":"root-one","publicKey":"{}"}}]}}"#,
            hex(root.verifying_key().as_bytes())
        );
        let parsed_anchors = RootTrustAnchorSet::from_json_bytes(anchors_json.as_bytes())
            .expect("anchor set parses");
        assert_eq!(parsed_anchors.threshold(), 1);
        assert_eq!(parsed_anchors.anchors()[0].key_id(), "root-one");

        assert!(matches!(
            DetachedUpdateSignatures::from_json_bytes(
                signature_json
                    .replace(
                        "\"schemaVersion\":1",
                        "\"schemaVersion\":1,\"unknown\":true"
                    )
                    .as_bytes()
            ),
            Err(UpdateTrustError::InvalidDocument(_))
        ));
        assert!(matches!(
            RootTrustAnchorSet::from_json_bytes(&vec![b' '; MAX_UPDATE_ROOT_ANCHOR_BYTES + 1]),
            Err(UpdateTrustError::RootAnchorMetadataSize { .. })
        ));
        assert!(matches!(
            DetachedUpdateSignatures::from_json_bytes(&vec![
                b' ';
                MAX_UPDATE_SIGNATURE_BUNDLE_BYTES + 1
            ]),
            Err(UpdateTrustError::SignatureMetadataSize { .. })
        ));
    }

    #[test]
    fn update_policy_rejects_unsafe_channels_and_expired_roots() {
        let (root, _root_a, _root_b, _system, _) = bootstrap_fixture();
        assert!(matches!(
            TrustedUpdatePolicy::new(root.clone(), "../stable", NOW),
            Err(UpdateTrustError::InvalidIdentifier {
                kind: "update channel",
                ..
            })
        ));
        assert!(matches!(
            TrustedUpdatePolicy::new(root, "stable", NOW + 10_000),
            Err(UpdateTrustError::RootExpired { .. })
        ));
    }

    #[test]
    fn root_and_artifact_payloads_are_bounded_before_signature_allocation() {
        let (root, _root_a, _root_b, system, _) = bootstrap_fixture();
        let oversized = vec![0_u8; UpdateArtifactKind::SystemImage.maximum_payload_bytes() + 1];
        let signature_set = signatures(vec![sign(
            "system-stable",
            &system,
            SYSTEM_IMAGE_SIGNED_MESSAGE_PREFIX,
            &oversized,
        )]);
        assert!(matches!(
            root.verify_role(
                "stable",
                UpdateArtifactKind::SystemImage,
                TARGET,
                &oversized,
                &signature_set,
                NOW
            ),
            Err(UpdateTrustError::ArtifactPayloadSize { .. })
        ));
        assert!(matches!(
            TrustedUpdateRoot::bootstrap(
                &vec![0_u8; MAX_UPDATE_ROOT_METADATA_BYTES + 1],
                &signature_set,
                &anchors(1, &[("root", &signing_key(1))]),
                0,
                NOW
            ),
            Err(UpdateTrustError::RootMetadataSize { .. })
        ));
    }
}
