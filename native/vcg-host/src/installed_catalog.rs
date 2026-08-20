//! Signed, host-owned resolution of installed game packages.

use std::collections::HashSet;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

#[cfg(test)]
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::native_package::NativePackageRequest;
use crate::retroarch::{ExpectedSha256, RetroArchRequest};
use crate::update_trust::{
    DetachedUpdateSignatures, TrustedUpdatePolicy, UpdateArtifactKind, VerifiedUpdateRole,
};

const CATALOG_SCHEMA_VERSION: u32 = 1;

/// `documentType` every bound installed-root game manifest must declare.
///
/// Two different v1 documents are written to the filename `vcg-game.json`: the
/// public curated-shelf manifest and the installed-root manifest a signed
/// package binds by SHA-256. The host reads only the installed-root document,
/// so it requires that document to say so from its own bytes.
pub const INSTALLED_MANIFEST_DOCUMENT_TYPE: &str = "vcg-installed-game-manifest";

const MAX_CATALOG_BYTES: u64 = 1_048_576;
const MAX_PACKAGES: usize = 1_024;
const MAX_LIBRETRO_AUXILIARY_FILES: usize = 256;
#[cfg(test)]
const SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-INSTALLED-CATALOG-V1\0";

/// Host-owned roots used to resolve signed relative package paths.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CatalogRoots {
    pub install_root: PathBuf,
    pub content_root: Option<PathBuf>,
    pub runtime_root: PathBuf,
    pub data_root: PathBuf,
}

/// A signature-verified catalog whose package paths can be resolved only
/// beneath host-configured roots.
#[derive(Clone, Debug)]
pub struct TrustedPackageCatalog {
    generation: u64,
    target: String,
    roots: CatalogRoots,
    packages: Vec<InstalledPackage>,
    update_authority: Option<VerifiedUpdateRole>,
}

impl TrustedPackageCatalog {
    /// Loads one installed catalog through current delegated update authority.
    ///
    /// Exact channel/catalog/target threshold verification precedes JSON
    /// parsing.
    ///
    /// # Errors
    ///
    /// Rejects unsafe paths, oversized input, missing/expired authority,
    /// insufficient signatures, unsupported schemas/targets, and invalid
    /// package records.
    pub fn load_with_update_role(
        catalog_path: &Path,
        signatures: &DetachedUpdateSignatures,
        update_policy: &TrustedUpdatePolicy,
        expected_target: &str,
        roots: CatalogRoots,
    ) -> Result<Self, CatalogError> {
        require_absolute_regular_file("catalog", catalog_path)?;
        let roots = validate_catalog_roots(roots)?;
        let catalog_bytes = read_bounded(catalog_path, MAX_CATALOG_BYTES, "catalog")?;
        let update_authority = update_policy
            .verify(
                UpdateArtifactKind::InstalledCatalog,
                expected_target,
                &catalog_bytes,
                signatures,
            )
            .map_err(|error| CatalogError::UpdateAuthority(error.to_string()))?;
        let document: CatalogDocument = serde_json::from_slice(&catalog_bytes)
            .map_err(|error| CatalogError::InvalidDocument(error.to_string()))?;
        let admission = if update_authority.channel() == "development" {
            CatalogAdmission::Development
        } else {
            CatalogAdmission::QualifiedOnly
        };
        let mut catalog = Self::from_document(document, roots, expected_target, admission)?;
        catalog.update_authority = Some(update_authority);
        Ok(catalog)
    }

    /// Loads and verifies one installed-package catalog.
    ///
    /// Signature verification happens before JSON parsing. The trusted public
    /// key and all catalog paths are host configuration, never launcher input.
    ///
    /// # Errors
    ///
    /// Rejects unsafe paths, oversized input, malformed keys/signatures,
    /// invalid signatures, unsupported schemas/targets, and invalid package
    /// records.
    #[cfg(test)]
    fn load(
        catalog_path: &Path,
        signature_path: &Path,
        public_key_path: &Path,
        roots: CatalogRoots,
    ) -> Result<Self, CatalogError> {
        for (kind, path) in [
            ("catalog", catalog_path),
            ("catalog signature", signature_path),
            ("catalog public key", public_key_path),
        ] {
            require_absolute_path(kind, path)?;
        }
        let roots = validate_catalog_roots(roots)?;

        let catalog_bytes = read_bounded(catalog_path, MAX_CATALOG_BYTES, "catalog")?;
        let signature_text = read_bounded(signature_path, 256, "catalog signature")?;
        let public_key_text = read_bounded(public_key_path, 128, "catalog public key")?;
        let signature_bytes = decode_canonical_hex::<64>(
            trim_single_line(&signature_text, "catalog signature")?,
            "catalog signature",
        )?;
        let public_key_bytes = decode_canonical_hex::<32>(
            trim_single_line(&public_key_text, "catalog public key")?,
            "catalog public key",
        )?;
        let signature = Signature::from_bytes(&signature_bytes);
        let verifying_key = VerifyingKey::from_bytes(&public_key_bytes)
            .map_err(|_| CatalogError::InvalidEncoding("catalog public key"))?;
        let mut signed_message =
            Vec::with_capacity(SIGNED_MESSAGE_PREFIX.len() + catalog_bytes.len());
        signed_message.extend_from_slice(SIGNED_MESSAGE_PREFIX);
        signed_message.extend_from_slice(&catalog_bytes);
        verifying_key
            .verify_strict(&signed_message, &signature)
            .map_err(|_| CatalogError::SignatureRejected)?;

        let document: CatalogDocument = serde_json::from_slice(&catalog_bytes)
            .map_err(|error| CatalogError::InvalidDocument(error.to_string()))?;
        Self::from_document(
            document,
            roots,
            &current_target(),
            CatalogAdmission::QualifiedOnly,
        )
    }

    fn from_document(
        document: CatalogDocument,
        roots: CatalogRoots,
        expected_target: &str,
        admission: CatalogAdmission,
    ) -> Result<Self, CatalogError> {
        if document.schema_version != CATALOG_SCHEMA_VERSION {
            return Err(CatalogError::UnsupportedSchema(document.schema_version));
        }
        if document.generation == 0 {
            return Err(CatalogError::InvalidRecord(
                "catalog generation must be greater than zero".to_owned(),
            ));
        }
        if document.target != expected_target {
            return Err(CatalogError::WrongTarget {
                expected: expected_target.to_owned(),
                actual: document.target,
            });
        }
        if document.packages.len() > MAX_PACKAGES {
            return Err(CatalogError::InvalidRecord(format!(
                "catalog exceeds the {MAX_PACKAGES} package limit"
            )));
        }

        let mut ids = HashSet::with_capacity(document.packages.len());
        let mut packages = Vec::with_capacity(document.packages.len());
        for package in document.packages {
            validate_intent_id("game", &package.id)?;
            validate_version(&package.version)?;
            if !ids.insert(package.id.clone()) {
                return Err(CatalogError::InvalidRecord(format!(
                    "duplicate package id {}",
                    package.id
                )));
            }
            if package.qualification == Qualification::Development
                && admission != CatalogAdmission::Development
            {
                return Err(CatalogError::InvalidRecord(format!(
                    "development package {} requires the development update channel",
                    package.id
                )));
            }
            validate_relative_file("manifest", &package.manifest.path)?;
            let manifest_sha256 = parse_hash("manifest", &package.manifest.sha256)?;
            let installed_runtime = parse_installed_runtime(
                &package.id,
                package.qualification,
                package.runtime,
                package.libretro,
                package.native,
                roots.content_root.is_some(),
            )?;
            packages.push(InstalledPackage {
                id: package.id,
                version: package.version,
                qualification: package.qualification,
                manifest: InstalledFile {
                    path: package.manifest.path,
                    sha256: manifest_sha256,
                },
                runtime: installed_runtime,
            });
        }

        Ok(Self {
            generation: document.generation,
            target: expected_target.to_owned(),
            roots,
            packages,
            update_authority: None,
        })
    }

    #[must_use]
    pub fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub fn target(&self) -> &str {
        &self.target
    }

    /// Returns the delegated update role that authorized this catalog.
    #[must_use]
    pub const fn update_authority(&self) -> Option<&VerifiedUpdateRole> {
        self.update_authority.as_ref()
    }

    /// Verifies every artifact referenced by this signed catalog without
    /// creating runtime or save state.
    ///
    /// This is the installer/promotion boundary. Launch resolution repeats the
    /// relevant checks at use time so a successful staging verification never
    /// becomes a permanent trust grant.
    ///
    /// # Errors
    ///
    /// Rejects missing, changed, misbound, or root-escaping package artifacts.
    pub fn verify_all_artifacts(&self) -> Result<(), CatalogError> {
        for package in &self.packages {
            let manifest =
                resolve_managed_file("manifest", &self.roots.install_root, &package.manifest.path)?;
            verify_sha256("manifest", &manifest, &package.manifest.sha256)?;
            verify_manifest_identity(&manifest, package)?;

            match &package.runtime {
                InstalledRuntime::Libretro(libretro) => {
                    for (kind, file) in [
                        ("frontend", &libretro.frontend),
                        ("core", &libretro.core),
                        ("base configuration", &libretro.base_config),
                    ] {
                        let path =
                            resolve_managed_file(kind, &self.roots.install_root, &file.path)?;
                        verify_sha256(kind, &path, &file.sha256)?;
                    }
                    for file in &libretro.auxiliary {
                        let path = resolve_managed_file(
                            "frontend auxiliary artifact",
                            &self.roots.install_root,
                            &file.file.path,
                        )?;
                        verify_sha256("frontend auxiliary artifact", &path, &file.file.sha256)?;
                    }
                    match &libretro.content {
                        LibretroContent::Managed(content) => {
                            let root = self.roots.content_root.as_ref().ok_or_else(|| {
                                CatalogError::InvalidRecord(format!(
                                    "package {} requires a content root",
                                    package.id
                                ))
                            })?;
                            let path = resolve_managed_file("content", root, &content.path)?;
                            verify_sha256("content", &path, &content.sha256)?;
                        }
                        // A library package binds no content file, so promotion
                        // has nothing to verify. Its per-launch entry is
                        // verified when that launch resolves.
                        LibretroContent::None | LibretroContent::Library(_) => {}
                    }
                }
                InstalledRuntime::Native(native) => {
                    let path = resolve_managed_file(
                        "native executable",
                        &self.roots.install_root,
                        &native.executable.path,
                    )?;
                    verify_sha256("native executable", &path, &native.executable.sha256)?;
                }
            }
        }
        Ok(())
    }

    /// Returns the signed launch-health policy for one verified package.
    ///
    /// The manifest hash and identity are checked before its health fields are
    /// interpreted. This policy is native authority; public/browser parsing
    /// cannot select a timeout or readiness mechanism.
    ///
    /// # Errors
    ///
    /// Rejects invalid IDs, missing packages, changed/misbound manifests, and
    /// unsupported or out-of-range health policies.
    pub fn package_health_policy(
        &self,
        game_id: &str,
    ) -> Result<PackageHealthPolicy, CatalogError> {
        validate_intent_id("game", game_id)?;
        let package = self
            .packages
            .iter()
            .find(|package| package.id == game_id)
            .ok_or_else(|| CatalogError::PackageNotFound(game_id.to_owned()))?;
        let manifest =
            resolve_managed_file("manifest", &self.roots.install_root, &package.manifest.path)?;
        verify_sha256("manifest", &manifest, &package.manifest.sha256)?;
        verify_bound_manifest(&manifest, package)
    }

    /// Returns every package's signed health policy after verifying each bound
    /// manifest.
    ///
    /// # Errors
    ///
    /// Rejects any changed, misbound, or unsupported package manifest.
    pub fn package_health_policies(
        &self,
    ) -> Result<Vec<VerifiedPackageHealthPolicy>, CatalogError> {
        self.packages
            .iter()
            .map(|package| {
                let manifest = resolve_managed_file(
                    "manifest",
                    &self.roots.install_root,
                    &package.manifest.path,
                )?;
                verify_sha256("manifest", &manifest, &package.manifest.sha256)?;
                Ok(VerifiedPackageHealthPolicy {
                    game_id: package.id.clone(),
                    policy: verify_bound_manifest(&manifest, package)?,
                })
            })
            .collect()
    }

    /// Returns signed, non-path package metadata for launcher presentation.
    ///
    /// # Errors
    ///
    /// Rejects malformed or unknown game identifiers.
    pub fn package_summary(&self, game_id: &str) -> Result<PackageSummary<'_>, CatalogError> {
        validate_intent_id("game", game_id)?;
        let package = self
            .packages
            .iter()
            .find(|package| package.id == game_id)
            .ok_or_else(|| CatalogError::PackageNotFound(game_id.to_owned()))?;
        Ok(PackageSummary {
            id: &package.id,
            version: &package.version,
            runtime: match package.runtime {
                InstalledRuntime::Libretro(_) => "libretro",
                InstalledRuntime::Native(_) => "native",
            },
            generation: self.generation,
        })
    }

    /// Returns every signed package's non-path launcher metadata in canonical
    /// game-ID order.
    ///
    /// The catalog is already signature-verified and bounded to 1,024 package
    /// records at load time. This view exposes no artifact, key, command,
    /// environment, permission, or writable-root authority.
    #[must_use]
    pub fn package_summaries(&self) -> Vec<PackageSummary<'_>> {
        let mut summaries = self
            .packages
            .iter()
            .map(|package| PackageSummary {
                id: package.id.as_str(),
                version: package.version.as_str(),
                runtime: match package.runtime {
                    InstalledRuntime::Libretro(_) => "libretro",
                    InstalledRuntime::Native(_) => "native",
                },
                generation: self.generation,
            })
            .collect::<Vec<_>>();
        summaries.sort_unstable_by_key(|package| package.id);
        summaries
    }

    /// Returns the library system and core one signed package accepts.
    ///
    /// A package that binds fixed content, or none, returns `None`. That is
    /// what makes a library entry inadmissible for it.
    ///
    /// # Errors
    ///
    /// Rejects malformed or unknown game identifiers.
    pub fn package_library_binding(
        &self,
        game_id: &str,
    ) -> Result<Option<PackageLibraryBinding<'_>>, CatalogError> {
        validate_intent_id("game", game_id)?;
        let package = self
            .packages
            .iter()
            .find(|package| package.id == game_id)
            .ok_or_else(|| CatalogError::PackageNotFound(game_id.to_owned()))?;
        Ok(match &package.runtime {
            InstalledRuntime::Libretro(libretro) => match &libretro.content {
                LibretroContent::Library(binding) => Some(PackageLibraryBinding {
                    system_id: &binding.system_id,
                    core_id: &binding.core_id,
                }),
                LibretroContent::None | LibretroContent::Managed(_) => None,
            },
            InstalledRuntime::Native(_) => None,
        })
    }

    /// Resolves a browser-safe `{game_id, profile_id}` intent into trusted
    /// native adapter inputs.
    ///
    /// # Errors
    ///
    /// Rejects invalid IDs, unknown packages, changed bound manifests or base
    /// configurations, manifest identities that do not match the signed
    /// catalog, and a package that requires a library entry.
    pub fn resolve(
        &self,
        game_id: &str,
        profile_id: &str,
    ) -> Result<ResolvedPackage, CatalogError> {
        self.resolve_with_library_content(game_id, profile_id, None)
    }

    /// Resolves the same intent with one host-selected library entry.
    ///
    /// The entry comes from the host's own installed library; the browser
    /// contributes only the entry ID that selected it. A package that binds
    /// fixed content, or none, rejects an entry outright, and a package that
    /// accepts library content rejects an entry from another system or core.
    ///
    /// # Errors
    ///
    /// Rejects everything [`Self::resolve`] rejects, plus a library entry
    /// offered to a package that does not accept one, a missing entry for a
    /// package that requires one, and an entry whose system or core disagrees
    /// with the signed package.
    pub fn resolve_with_library_content(
        &self,
        game_id: &str,
        profile_id: &str,
        library: Option<LibraryContentRequest<'_>>,
    ) -> Result<ResolvedPackage, CatalogError> {
        validate_intent_id("game", game_id)?;
        validate_intent_id("profile", profile_id)?;
        let package = self
            .packages
            .iter()
            .find(|package| package.id == game_id)
            .ok_or_else(|| CatalogError::PackageNotFound(game_id.to_owned()))?;
        let manifest_path =
            resolve_managed_file("manifest", &self.roots.install_root, &package.manifest.path)?;
        verify_sha256("manifest", &manifest_path, &package.manifest.sha256)?;
        verify_manifest_identity(&manifest_path, package)?;

        match &package.runtime {
            InstalledRuntime::Libretro(libretro) => {
                let frontend = self.roots.install_root.join(&libretro.frontend.path);
                let core = self.roots.install_root.join(&libretro.core.path);
                let base_config = resolve_managed_file(
                    "base configuration",
                    &self.roots.install_root,
                    &libretro.base_config.path,
                )?;
                verify_sha256(
                    "base configuration",
                    &base_config,
                    &libretro.base_config.sha256,
                )?;
                let auxiliary = libretro
                    .auxiliary
                    .iter()
                    .map(|file| crate::retroarch::RetroArchAuxiliaryArtifact {
                        path: self.roots.install_root.join(&file.file.path),
                        sha256: file.file.sha256,
                        runtime_name: file.runtime_name.clone(),
                    })
                    .collect();
                let content =
                    self.resolve_libretro_content(&package.id, &libretro.content, library)?;
                Ok(ResolvedPackage::Libretro(Box::new(RetroArchRequest {
                    install_root: self.roots.install_root.clone(),
                    content_root: content.root,
                    runtime_root: self.roots.runtime_root.clone(),
                    data_root: self.roots.data_root.clone(),
                    frontend,
                    frontend_sha256: libretro.frontend.sha256,
                    core,
                    core_sha256: libretro.core.sha256,
                    content: content.path,
                    content_sha256: content.sha256,
                    base_config,
                    base_config_sha256: libretro.base_config.sha256,
                    auxiliary,
                    profile_id: profile_id.to_owned(),
                    game_id: package.id.clone(),
                    // Catalog-resolved launches always take the console default
                    // start policy; the menu handoff stays a CLI-only diagnostic.
                    contentless_start: None,
                })))
            }
            InstalledRuntime::Native(_) if library.is_some() => {
                Err(CatalogError::LibraryContentRejected(package.id.clone()))
            }
            InstalledRuntime::Native(native) => Ok(ResolvedPackage::Native(NativePackageRequest {
                install_root: self.roots.install_root.clone(),
                runtime_root: self.roots.runtime_root.clone(),
                data_root: self.roots.data_root.clone(),
                executable: self.roots.install_root.join(&native.executable.path),
                executable_sha256: native.executable.sha256,
                profile_id: profile_id.to_owned(),
                game_id: package.id.clone(),
            })),
        }
    }

    /// Resolves which content file, if any, one libretro launch carries.
    ///
    /// The returned root is what the adapter requires the content to stay
    /// beneath: the managed content root for a fixed file, and the
    /// console-managed object root for one library entry.
    fn resolve_libretro_content(
        &self,
        package_id: &str,
        content: &LibretroContent,
        library: Option<LibraryContentRequest<'_>>,
    ) -> Result<ResolvedContent, CatalogError> {
        match (content, library) {
            (LibretroContent::None, None) => Ok(ResolvedContent {
                root: self.roots.content_root.clone(),
                path: None,
                sha256: None,
            }),
            (LibretroContent::Managed(content), None) => {
                let root = self.roots.content_root.as_ref().ok_or_else(|| {
                    CatalogError::InvalidRecord(format!(
                        "package {package_id} requires a content root"
                    ))
                })?;
                Ok(ResolvedContent {
                    root: Some(root.clone()),
                    path: Some(root.join(&content.path)),
                    sha256: Some(content.sha256),
                })
            }
            (LibretroContent::Library(binding), Some(entry)) => {
                if entry.system_id != binding.system_id || entry.core_id != binding.core_id {
                    return Err(CatalogError::LibraryEntryIncompatible {
                        game_id: package_id.to_owned(),
                        entry_id: entry.entry_id.to_owned(),
                    });
                }
                Ok(ResolvedContent {
                    root: Some(entry.object_root.to_owned()),
                    path: Some(entry.object_path.to_owned()),
                    sha256: Some(parse_hash("library content", entry.sha256)?),
                })
            }
            (LibretroContent::Library(_), None) => {
                Err(CatalogError::LibraryContentRequired(package_id.to_owned()))
            }
            (LibretroContent::None | LibretroContent::Managed(_), Some(_)) => {
                Err(CatalogError::LibraryContentRejected(package_id.to_owned()))
            }
        }
    }
}

/// The content file, if any, one resolved libretro launch carries.
struct ResolvedContent {
    root: Option<PathBuf>,
    path: Option<PathBuf>,
    sha256: Option<ExpectedSha256>,
}

/// Trusted native adapter request derived from an installed package.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolvedPackage {
    Libretro(Box<RetroArchRequest>),
    Native(NativePackageRequest),
}

/// One host-selected library entry offered to a library-content package.
///
/// Every field is host state read from the console-managed retro library. The
/// browser contributes only the entry ID that selected it, never a path, a
/// digest, a core, or an argument.
#[derive(Clone, Copy, Debug)]
pub struct LibraryContentRequest<'a> {
    pub entry_id: &'a str,
    pub system_id: &'a str,
    pub core_id: &'a str,
    pub sha256: &'a str,
    pub object_root: &'a Path,
    pub object_path: &'a Path,
}

/// The library system and core one signed package accepts.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageLibraryBinding<'a> {
    pub system_id: &'a str,
    pub core_id: &'a str,
}

/// Signed package metadata safe to disclose to the trusted launcher.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageSummary<'a> {
    pub id: &'a str,
    pub version: &'a str,
    pub runtime: &'static str,
    pub generation: u64,
}

/// Native launch-health mechanism bound by a signed package manifest.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PackageHealthCheck {
    /// Compatibility smoke check: the direct child must remain running for the
    /// signed observation window. It does not prove visible readiness.
    Process,
    /// A qualified trusted producer must explicitly signal readiness.
    ExplicitReady,
}

/// Bounded launch-health policy from one verified signed manifest.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PackageHealthPolicy {
    pub timeout: Duration,
    pub check: PackageHealthCheck,
}

/// One verified package identity and its signed health policy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedPackageHealthPolicy {
    pub game_id: String,
    pub policy: PackageHealthPolicy,
}

#[derive(Clone, Debug)]
struct InstalledPackage {
    id: String,
    version: String,
    qualification: Qualification,
    manifest: InstalledFile,
    runtime: InstalledRuntime,
}

#[derive(Clone, Debug)]
enum InstalledRuntime {
    // Boxed so the enum is not sized by its largest variant. `LibretroPackage`
    // holds five `PathBuf`-bearing records, which on Windows (32-byte
    // `PathBuf`) exceeds clippy's `large_enum_variant` threshold.
    Libretro(Box<LibretroPackage>),
    Native(NativePackage),
}

#[derive(Clone, Debug)]
struct LibretroPackage {
    frontend: InstalledFile,
    core: InstalledFile,
    base_config: InstalledFile,
    auxiliary: Vec<InstalledAuxiliary>,
    content: LibretroContent,
}

/// What content, if any, one signed libretro package may load.
#[derive(Clone, Debug)]
enum LibretroContent {
    /// The package starts its core with no content file.
    None,
    /// The package binds exactly one content file by signed path and digest.
    Managed(ManagedContent),
    /// The package accepts one entry of the host's installed retro library,
    /// selected per launch, restricted to the signed system and core.
    Library(LibraryBinding),
}

/// The exact library system and core one signed package accepts.
#[derive(Clone, Debug)]
struct LibraryBinding {
    system_id: String,
    core_id: String,
}

#[derive(Clone, Debug)]
struct NativePackage {
    executable: InstalledFile,
}

#[derive(Clone, Debug)]
struct InstalledFile {
    path: PathBuf,
    sha256: ExpectedSha256,
}

#[derive(Clone, Debug)]
struct InstalledAuxiliary {
    file: InstalledFile,
    runtime_name: Option<String>,
}

#[derive(Clone, Debug)]
struct ManagedContent {
    path: PathBuf,
    sha256: ExpectedSha256,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CatalogDocument {
    schema_version: u32,
    generation: u64,
    target: String,
    packages: Vec<PackageDocument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageDocument {
    id: String,
    version: String,
    qualification: Qualification,
    runtime: RuntimeKind,
    manifest: FileDocument,
    libretro: Option<LibretroDocument>,
    native: Option<NativeDocument>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum Qualification {
    Qualified,
    Development,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CatalogAdmission {
    QualifiedOnly,
    Development,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum RuntimeKind {
    Libretro,
    Native,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileDocument {
    path: PathBuf,
    sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LibretroDocument {
    frontend: FileDocument,
    core: FileDocument,
    base_config: FileDocument,
    #[serde(default)]
    auxiliary: Vec<AuxiliaryDocument>,
    content: ContentDocument,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuxiliaryDocument {
    path: PathBuf,
    sha256: String,
    #[serde(default)]
    runtime_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeDocument {
    executable: FileDocument,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "kebab-case", deny_unknown_fields)]
enum ContentDocument {
    None,
    Managed {
        path: PathBuf,
        sha256: String,
    },
    Library {
        #[serde(rename = "systemId")]
        system_id: String,
        #[serde(rename = "coreId")]
        core_id: String,
    },
}

fn parse_installed_runtime(
    package_id: &str,
    qualification: Qualification,
    runtime: RuntimeKind,
    libretro: Option<LibretroDocument>,
    native: Option<NativeDocument>,
    has_content_root: bool,
) -> Result<InstalledRuntime, CatalogError> {
    match runtime {
        RuntimeKind::Libretro => parse_libretro_runtime(
            package_id,
            qualification,
            libretro,
            native.as_ref(),
            has_content_root,
        ),
        RuntimeKind::Native => parse_native_runtime(package_id, libretro.as_ref(), native),
    }
}

fn parse_libretro_runtime(
    package_id: &str,
    qualification: Qualification,
    libretro: Option<LibretroDocument>,
    native: Option<&NativeDocument>,
    has_content_root: bool,
) -> Result<InstalledRuntime, CatalogError> {
    if native.is_some() {
        return Err(CatalogError::InvalidRecord(format!(
            "libretro package {package_id} has a native launch record"
        )));
    }
    let libretro = libretro.ok_or_else(|| {
        CatalogError::InvalidRecord(format!(
            "libretro package {package_id} is missing its launch record"
        ))
    })?;
    validate_relative_file("frontend", &libretro.frontend.path)?;
    validate_relative_file("core", &libretro.core.path)?;
    validate_relative_file("base configuration", &libretro.base_config.path)?;
    if libretro.auxiliary.len() > MAX_LIBRETRO_AUXILIARY_FILES {
        return Err(CatalogError::InvalidRecord(format!(
            "libretro package {package_id} exceeds the {MAX_LIBRETRO_AUXILIARY_FILES} auxiliary-file limit"
        )));
    }
    let artifact_paths = HashSet::from([
        libretro.frontend.path.clone(),
        libretro.core.path.clone(),
        libretro.base_config.path.clone(),
    ]);
    let auxiliary = parse_libretro_auxiliary(
        package_id,
        qualification,
        libretro.auxiliary,
        artifact_paths,
    )?;
    let content = parse_libretro_content(package_id, libretro.content, has_content_root)?;
    Ok(InstalledRuntime::Libretro(Box::new(LibretroPackage {
        frontend: InstalledFile {
            path: libretro.frontend.path,
            sha256: parse_hash("frontend", &libretro.frontend.sha256)?,
        },
        core: InstalledFile {
            path: libretro.core.path,
            sha256: parse_hash("core", &libretro.core.sha256)?,
        },
        base_config: InstalledFile {
            path: libretro.base_config.path,
            sha256: parse_hash("base configuration", &libretro.base_config.sha256)?,
        },
        auxiliary,
        content,
    })))
}

fn parse_libretro_auxiliary(
    package_id: &str,
    qualification: Qualification,
    files: Vec<AuxiliaryDocument>,
    mut artifact_paths: HashSet<PathBuf>,
) -> Result<Vec<InstalledAuxiliary>, CatalogError> {
    let mut runtime_names = HashSet::new();
    let mut auxiliary = Vec::with_capacity(files.len());
    for file in files {
        validate_relative_file("frontend auxiliary artifact", &file.path)?;
        if !artifact_paths.insert(file.path.clone()) {
            return Err(CatalogError::InvalidRecord(format!(
                "libretro package {package_id} repeats artifact path {}",
                file.path.display()
            )));
        }
        if file.runtime_name.is_some() && qualification != Qualification::Development {
            return Err(CatalogError::InvalidRecord(format!(
                "libretro package {package_id} may use runtimeName only in the development channel"
            )));
        }
        if let Some(runtime_name) = file.runtime_name.as_deref() {
            validate_runtime_name(package_id, runtime_name)?;
        }
        let runtime_name = file.runtime_name.as_deref().unwrap_or_else(|| {
            file.path
                .file_name()
                .and_then(|name| name.to_str())
                .expect("validated relative artifact paths have a UTF-8 filename")
        });
        if !runtime_names.insert(runtime_name.to_ascii_lowercase()) {
            return Err(CatalogError::InvalidRecord(format!(
                "libretro package {package_id} repeats runtime filename {runtime_name}"
            )));
        }
        auxiliary.push(InstalledAuxiliary {
            file: InstalledFile {
                path: file.path,
                sha256: parse_hash("frontend auxiliary artifact", &file.sha256)?,
            },
            runtime_name: file.runtime_name,
        });
    }
    Ok(auxiliary)
}

fn parse_libretro_content(
    package_id: &str,
    content: ContentDocument,
    has_content_root: bool,
) -> Result<LibretroContent, CatalogError> {
    match content {
        ContentDocument::None => Ok(LibretroContent::None),
        ContentDocument::Managed { path, sha256 } => {
            if !has_content_root {
                return Err(CatalogError::InvalidRecord(format!(
                    "package {package_id} requires a content root"
                )));
            }
            validate_relative_file("content", &path)?;
            Ok(LibretroContent::Managed(ManagedContent {
                path,
                sha256: parse_hash("content", &sha256)?,
            }))
        }
        // Library content lives in the console-managed retro object store, not
        // beneath the catalog's managed content root, so this mode does not
        // require that root. It names no file: the host selects one library
        // entry per launch and rejects any entry outside this system and core.
        ContentDocument::Library { system_id, core_id } => {
            validate_intent_id("library system", &system_id)?;
            validate_intent_id("library core", &core_id)?;
            Ok(LibretroContent::Library(LibraryBinding {
                system_id,
                core_id,
            }))
        }
    }
}

fn parse_native_runtime(
    package_id: &str,
    libretro: Option<&LibretroDocument>,
    native: Option<NativeDocument>,
) -> Result<InstalledRuntime, CatalogError> {
    if libretro.is_some() {
        return Err(CatalogError::InvalidRecord(format!(
            "native package {package_id} has a libretro launch record"
        )));
    }
    let native = native.ok_or_else(|| {
        CatalogError::InvalidRecord(format!(
            "native package {package_id} is missing its launch record"
        ))
    })?;
    validate_relative_file("native executable", &native.executable.path)?;
    Ok(InstalledRuntime::Native(NativePackage {
        executable: InstalledFile {
            path: native.executable.path,
            sha256: parse_hash("native executable", &native.executable.sha256)?,
        },
    }))
}

fn validate_runtime_name(package_id: &str, name: &str) -> Result<(), CatalogError> {
    let valid = !name.is_empty()
        && name.len() <= 128
        && !name.ends_with(['.', ' '])
        && name != "."
        && name != ".."
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'+'));
    if valid {
        Ok(())
    } else {
        Err(CatalogError::InvalidRecord(format!(
            "libretro package {package_id} has an unsafe runtime filename {name}"
        )))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoundManifest {
    /// Absent on the public curated-shelf document, which is never a bound
    /// installed manifest. `Option` keeps the rejection diagnostic host-owned
    /// instead of a serde missing-field string that cannot name the package.
    document_type: Option<String>,
    schema_version: u32,
    id: String,
    version: String,
    runtime: String,
    compatibility_status: String,
    launch: BoundLaunchPolicy,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoundLaunchPolicy {
    timeout_ms: u64,
    health_check: BoundHealthCheck,
}

#[derive(Debug, Deserialize)]
struct BoundHealthCheck {
    #[serde(rename = "type")]
    kind: String,
}

fn verify_manifest_identity(path: &Path, package: &InstalledPackage) -> Result<(), CatalogError> {
    verify_bound_manifest(path, package).map(|_| ())
}

fn verify_bound_manifest(
    path: &Path,
    package: &InstalledPackage,
) -> Result<PackageHealthPolicy, CatalogError> {
    let bytes = read_bounded(path, MAX_CATALOG_BYTES, "bound game manifest")?;
    let manifest: BoundManifest = serde_json::from_slice(&bytes)
        .map_err(|error| CatalogError::InvalidBoundManifest(error.to_string()))?;
    if manifest.document_type.as_deref() != Some(INSTALLED_MANIFEST_DOCUMENT_TYPE) {
        return Err(CatalogError::InvalidBoundManifest(format!(
            "installed package {} must bind a manifest declaring documentType {INSTALLED_MANIFEST_DOCUMENT_TYPE}",
            package.id
        )));
    }
    let expected_runtime = match package.runtime {
        InstalledRuntime::Libretro(_) => "libretro",
        InstalledRuntime::Native(_) => "native",
    };
    let expected_compatibility = match package.qualification {
        Qualification::Qualified => "qualified",
        Qualification::Development => "unverified",
    };
    if manifest.schema_version != 1
        || manifest.id != package.id
        || manifest.version != package.version
        || manifest.runtime != expected_runtime
        || manifest.compatibility_status != expected_compatibility
    {
        return Err(CatalogError::InvalidBoundManifest(format!(
            "manifest identity or qualification does not match signed package {}",
            package.id
        )));
    }
    if !(1_000..=120_000).contains(&manifest.launch.timeout_ms) {
        return Err(CatalogError::InvalidBoundManifest(format!(
            "manifest launch timeout for {} must be 1000-120000 milliseconds",
            package.id
        )));
    }
    let check = match manifest.launch.health_check.kind.as_str() {
        "process" => PackageHealthCheck::Process,
        "explicit-ready" => PackageHealthCheck::ExplicitReady,
        health_check => {
            return Err(CatalogError::InvalidBoundManifest(format!(
                "manifest health check {health_check} is unsupported for installed package {}",
                package.id
            )));
        }
    };
    Ok(PackageHealthPolicy {
        timeout: Duration::from_millis(manifest.launch.timeout_ms),
        check,
    })
}

#[cfg(test)]
fn current_target() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}

fn validate_catalog_roots(roots: CatalogRoots) -> Result<CatalogRoots, CatalogError> {
    validate_owned_root("runtime root", &roots.runtime_root)?;
    validate_owned_root("data root", &roots.data_root)?;
    let install_root = canonical_directory("install root", &roots.install_root)?;
    let content_root = roots
        .content_root
        .as_deref()
        .map(|path| canonical_directory("content root", path))
        .transpose()?;
    Ok(CatalogRoots {
        install_root,
        content_root,
        runtime_root: roots.runtime_root,
        data_root: roots.data_root,
    })
}

fn require_absolute_path(kind: &'static str, path: &Path) -> Result<(), CatalogError> {
    if path.is_absolute() {
        Ok(())
    } else {
        Err(CatalogError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn require_absolute_regular_file(kind: &'static str, path: &Path) -> Result<(), CatalogError> {
    require_absolute_path(kind, path)?;
    let metadata = fs::symlink_metadata(path).map_err(|source| CatalogError::Io {
        operation: "inspect regular file",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(CatalogError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn validate_owned_root(kind: &'static str, path: &Path) -> Result<(), CatalogError> {
    if path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        Ok(())
    } else {
        Err(CatalogError::UnsafePath {
            kind,
            path: path.to_owned(),
        })
    }
}

fn canonical_directory(kind: &'static str, path: &Path) -> Result<PathBuf, CatalogError> {
    require_absolute_path(kind, path)?;
    let canonical = fs::canonicalize(path).map_err(|source| CatalogError::Io {
        operation: "resolve directory",
        path: path.to_owned(),
        source,
    })?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(CatalogError::UnsafePath {
            kind,
            path: canonical,
        })
    }
}

fn validate_relative_file(kind: &'static str, path: &Path) -> Result<(), CatalogError> {
    let mut component_count = 0;
    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(CatalogError::UnsafePath {
                kind,
                path: path.to_owned(),
            });
        }
        component_count += 1;
    }
    if component_count == 0 || path.is_absolute() {
        return Err(CatalogError::UnsafePath {
            kind,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn resolve_managed_file(
    kind: &'static str,
    root: &Path,
    relative: &Path,
) -> Result<PathBuf, CatalogError> {
    validate_relative_file(kind, relative)?;
    let joined = root.join(relative);
    let canonical = fs::canonicalize(&joined).map_err(|source| CatalogError::Io {
        operation: "resolve managed file",
        path: joined,
        source,
    })?;
    if !canonical.is_file() || !canonical.starts_with(root) {
        return Err(CatalogError::UnsafePath {
            kind,
            path: canonical,
        });
    }
    Ok(canonical)
}

pub(crate) fn validate_intent_id(kind: &'static str, value: &str) -> Result<(), CatalogError> {
    let valid = !value.is_empty()
        && value.len() <= 80
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || (byte == b'-' && index > 0)
        })
        && !value.ends_with('-')
        && !value.contains("--");
    if valid {
        Ok(())
    } else {
        Err(CatalogError::InvalidRecord(format!(
            "{kind} id is invalid: {value}"
        )))
    }
}

fn validate_version(value: &str) -> Result<(), CatalogError> {
    if !value.is_empty() && value.len() <= 128 && value.bytes().all(|byte| byte.is_ascii_graphic())
    {
        Ok(())
    } else {
        Err(CatalogError::InvalidRecord(
            "package version must be 1-128 visible ASCII characters".to_owned(),
        ))
    }
}

fn parse_hash(kind: &'static str, value: &str) -> Result<ExpectedSha256, CatalogError> {
    ExpectedSha256::from_str(value).map_err(|_| {
        CatalogError::InvalidRecord(format!("{kind} SHA-256 is not canonical lowercase hex"))
    })
}

fn verify_sha256(
    kind: &'static str,
    path: &Path,
    expected: &ExpectedSha256,
) -> Result<(), CatalogError> {
    let mut file = File::open(path).map_err(|source| CatalogError::Io {
        operation: "open file for integrity verification",
        path: path.to_owned(),
        source,
    })?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 8 * 1_024];
    loop {
        let read = file.read(&mut buffer).map_err(|source| CatalogError::Io {
            operation: "read file for integrity verification",
            path: path.to_owned(),
            source,
        })?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    let actual: [u8; 32] = digest.finalize().into();
    if &actual == expected.as_bytes() {
        Ok(())
    } else {
        Err(CatalogError::IntegrityMismatch {
            kind,
            path: path.to_owned(),
            expected: *expected,
            actual: ExpectedSha256::from_bytes(actual),
        })
    }
}

fn read_bounded(path: &Path, limit: u64, kind: &'static str) -> Result<Vec<u8>, CatalogError> {
    let file = File::open(path).map_err(|source| CatalogError::Io {
        operation: "open bounded file",
        path: path.to_owned(),
        source,
    })?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|source| CatalogError::Io {
            operation: "read bounded file",
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).is_ok_and(|length| length <= limit) {
        Ok(bytes)
    } else {
        Err(CatalogError::TooLarge { kind, limit })
    }
}

#[cfg(test)]
fn trim_single_line<'a>(bytes: &'a [u8], kind: &'static str) -> Result<&'a str, CatalogError> {
    let text = std::str::from_utf8(bytes).map_err(|_| CatalogError::InvalidEncoding(kind))?;
    let text = text
        .strip_suffix("\r\n")
        .or_else(|| text.strip_suffix('\n'))
        .unwrap_or(text);
    if text.contains(['\r', '\n']) {
        return Err(CatalogError::InvalidEncoding(kind));
    }
    Ok(text)
}

#[cfg(test)]
fn decode_canonical_hex<const N: usize>(
    value: &str,
    kind: &'static str,
) -> Result<[u8; N], CatalogError> {
    if value.len() != N * 2 {
        return Err(CatalogError::InvalidEncoding(kind));
    }
    let mut output = [0_u8; N];
    for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
        let high = decode_hex(pair[0]).ok_or(CatalogError::InvalidEncoding(kind))?;
        let low = decode_hex(pair[1]).ok_or(CatalogError::InvalidEncoding(kind))?;
        output[index] = (high << 4) | low;
    }
    Ok(output)
}

#[cfg(test)]
fn decode_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}

/// Installed-catalog validation or resolution failure.
#[derive(Debug)]
pub enum CatalogError {
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    TooLarge {
        kind: &'static str,
        limit: u64,
    },
    UnsafePath {
        kind: &'static str,
        path: PathBuf,
    },
    InvalidEncoding(&'static str),
    SignatureRejected,
    UpdateAuthority(String),
    InvalidDocument(String),
    UnsupportedSchema(u32),
    WrongTarget {
        expected: String,
        actual: String,
    },
    InvalidRecord(String),
    PackageNotFound(String),
    IntegrityMismatch {
        kind: &'static str,
        path: PathBuf,
        expected: ExpectedSha256,
        actual: ExpectedSha256,
    },
    InvalidBoundManifest(String),
    LibraryContentRejected(String),
    LibraryContentRequired(String),
    LibraryEntryIncompatible {
        game_id: String,
        entry_id: String,
    },
}

impl fmt::Display for CatalogError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                operation,
                path,
                source,
            } => write!(
                formatter,
                "{operation} failed for {}: {source}",
                path.display()
            ),
            Self::TooLarge { kind, limit } => {
                write!(formatter, "{kind} exceeds the {limit}-byte limit")
            }
            Self::UnsafePath { kind, path } => {
                write!(formatter, "{kind} path is unsafe: {}", path.display())
            }
            Self::InvalidEncoding(kind) => {
                write!(
                    formatter,
                    "{kind} must use canonical lowercase hexadecimal text"
                )
            }
            Self::SignatureRejected => {
                formatter.write_str("installed catalog signature verification failed")
            }
            Self::UpdateAuthority(error) => {
                write!(
                    formatter,
                    "installed catalog update authority rejected: {error}"
                )
            }
            Self::InvalidDocument(error) => {
                write!(formatter, "installed catalog is invalid: {error}")
            }
            Self::UnsupportedSchema(version) => {
                write!(
                    formatter,
                    "installed catalog schema {version} is not supported"
                )
            }
            Self::WrongTarget { expected, actual } => {
                write!(
                    formatter,
                    "installed catalog target {actual} does not match {expected}"
                )
            }
            Self::InvalidRecord(error) => {
                write!(formatter, "installed catalog record is invalid: {error}")
            }
            Self::PackageNotFound(id) => write!(formatter, "installed package not found: {id}"),
            Self::IntegrityMismatch {
                kind,
                path,
                expected,
                actual,
            } => {
                write!(
                    formatter,
                    "{kind} SHA-256 mismatch at {}: expected {expected}, got {actual}",
                    path.display()
                )
            }
            Self::InvalidBoundManifest(error) => {
                write!(formatter, "bound game manifest is invalid: {error}")
            }
            Self::LibraryContentRejected(id) => {
                write!(
                    formatter,
                    "installed package {id} does not accept library content"
                )
            }
            Self::LibraryContentRequired(id) => {
                write!(
                    formatter,
                    "installed package {id} requires one library entry"
                )
            }
            Self::LibraryEntryIncompatible { game_id, entry_id } => {
                write!(
                    formatter,
                    "library entry {entry_id} does not match the system and core of installed package {game_id}"
                )
            }
        }
    }
}

impl std::error::Error for CatalogError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;
    use sha2::{Digest, Sha256};

    use super::{
        CatalogError, CatalogRoots, INSTALLED_MANIFEST_DOCUMENT_TYPE, LibraryContentRequest,
        MAX_CATALOG_BYTES, PackageHealthCheck, PackageHealthPolicy, PackageLibraryBinding,
        PackageSummary, ResolvedPackage, SIGNED_MESSAGE_PREFIX, TrustedPackageCatalog,
        current_target,
    };
    use crate::native_package::{NativePackageError, plan as plan_native};
    use crate::package_launch::{PackageLaunchPlan, plan as plan_package};
    use crate::retroarch::{RetroArchError, plan as plan_retroarch};
    use crate::update_trust::{
        DetachedUpdateSignature, DetachedUpdateSignatures, RootTrustAnchor, RootTrustAnchorSet,
        TrustedUpdatePolicy, TrustedUpdateRoot, UpdateArtifactKind,
    };

    const TRUSTED_TIME: u64 = 2_000_000_000;
    const ROOT_SIGNED_MESSAGE_PREFIX: &[u8] = b"VCG-UPDATE-TRUST-ROOT-V1\0";
    static CATALOG_FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    pub(crate) struct Fixture {
        root: PathBuf,
        install: PathBuf,
        runtime: PathBuf,
        data: PathBuf,
        catalog: PathBuf,
        signature: PathBuf,
        public_key: PathBuf,
        manifest: PathBuf,
        frontend: PathBuf,
        core: PathBuf,
        base_config: PathBuf,
        signing_key: SigningKey,
    }

    impl Fixture {
        pub(crate) fn new() -> Self {
            let sequence = CATALOG_FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "vcg-installed-catalog-test-{}-{unique}-{sequence}",
                std::process::id()
            ));
            let install = root.join("installed");
            let runtime = root.join("runtime");
            let data = root.join("data");
            let package = install.join("packages").join("retro-2048");
            let retroarch = install.join("retroarch");
            let cores = install.join("cores");
            fs::create_dir_all(&package).expect("create package directory");
            fs::create_dir_all(&retroarch).expect("create frontend directory");
            fs::create_dir_all(&cores).expect("create core directory");

            let manifest = package.join("vcg-game.json");
            let frontend = retroarch.join(format!("retroarch{}", std::env::consts::EXE_SUFFIX));
            let core = cores.join("2048_libretro.so");
            let base_config = retroarch.join("vcg-base.cfg");
            fs::write(
                &manifest,
                br#"{"documentType":"vcg-installed-game-manifest","schemaVersion":1,"id":"retro-2048","version":"1.0.0","runtime":"libretro","compatibilityStatus":"qualified","launch":{"timeoutMs":15000,"healthCheck":{"type":"process"}}}"#,
            )
            .expect("write manifest");
            fs::write(&frontend, b"frontend fixture").expect("write frontend");
            fs::write(&core, b"core fixture").expect("write core");
            fs::write(&base_config, b"config_save_on_exit = \"false\"\n")
                .expect("write base configuration");

            let catalog = root.join("installed-catalog.json");
            let signature = root.join("installed-catalog.sig");
            let public_key = root.join("installed-catalog.pub");
            let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
            fs::write(
                &public_key,
                format!("{}\n", encode_hex(signing_key.verifying_key().as_bytes())),
            )
            .expect("write public key");

            let fixture = Self {
                root,
                install,
                runtime,
                data,
                catalog,
                signature,
                public_key,
                manifest,
                frontend,
                core,
                base_config,
                signing_key,
            };
            fixture.sign_catalog(
                &fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
            );
            fixture
        }

        fn roots(&self) -> CatalogRoots {
            CatalogRoots {
                install_root: self.install.clone(),
                content_root: None,
                runtime_root: self.runtime.clone(),
                data_root: self.data.clone(),
            }
        }

        fn document(&self, target: &str, manifest_path: &str) -> Vec<u8> {
            format!(
                concat!(
                    "{{",
                    "\"schemaVersion\":1,",
                    "\"generation\":7,",
                    "\"target\":\"{}\",",
                    "\"packages\":[{{",
                    "\"id\":\"retro-2048\",",
                    "\"version\":\"1.0.0\",",
                    "\"qualification\":\"qualified\",",
                    "\"runtime\":\"libretro\",",
                    "\"manifest\":{{\"path\":\"{}\",\"sha256\":\"{}\"}},",
                    "\"libretro\":{{",
                    "\"frontend\":{{\"path\":\"{}\",\"sha256\":\"{}\"}},",
                    "\"core\":{{\"path\":\"cores/2048_libretro.so\",\"sha256\":\"{}\"}},",
                    "\"baseConfig\":{{\"path\":\"retroarch/vcg-base.cfg\",\"sha256\":\"{}\"}},",
                    "\"content\":{{\"mode\":\"none\"}}",
                    "}}",
                    "}}]",
                    "}}"
                ),
                target,
                manifest_path,
                digest_path(&self.manifest),
                self.frontend
                    .strip_prefix(&self.install)
                    .expect("frontend is inside install root")
                    .to_string_lossy()
                    .replace('\\', "/"),
                digest_path(&self.frontend),
                digest_path(&self.core),
                digest_path(&self.base_config),
            )
            .into_bytes()
        }

        fn native_document(&self) -> Vec<u8> {
            let executable = self
                .frontend
                .strip_prefix(&self.install)
                .expect("native executable is inside install root")
                .to_string_lossy()
                .replace('\\', "/");
            serde_json::to_vec(&json!({
                "schemaVersion": 1,
                "generation": 7,
                "target": current_target(),
                "packages": [{
                    "id": "retro-2048",
                    "version": "1.0.0",
                    "qualification": "qualified",
                    "runtime": "native",
                    "manifest": {
                        "path": "packages/retro-2048/vcg-game.json",
                        "sha256": digest_path(&self.manifest),
                    },
                    "native": {
                        "executable": {
                            "path": executable,
                            "sha256": digest_path(&self.frontend),
                        },
                    },
                }],
            }))
            .expect("native catalog serializes")
        }

        fn publish_native(&self) {
            fs::write(
                &self.manifest,
                br#"{"documentType":"vcg-installed-game-manifest","schemaVersion":1,"id":"retro-2048","version":"1.0.0","runtime":"native","compatibilityStatus":"qualified","launch":{"timeoutMs":15000,"healthCheck":{"type":"process"}}}"#,
            )
            .expect("write native manifest");
            self.sign_catalog(&self.native_document());
        }

        fn publish_library(&self, system_id: &str, core_id: &str) {
            let document = String::from_utf8(
                self.document(&current_target(), "packages/retro-2048/vcg-game.json"),
            )
            .expect("catalog document is UTF-8")
            .replace(
                "\"content\":{\"mode\":\"none\"}",
                &format!(
                    "\"content\":{{\"mode\":\"library\",\"systemId\":\"{system_id}\",\"coreId\":\"{core_id}\"}}"
                ),
            );
            self.sign_catalog(document.as_bytes());
        }

        fn publish_development(&self) {
            self.publish_development_with_status("unverified");
        }

        fn publish_development_with_status(&self, compatibility_status: &str) {
            fs::write(
                &self.manifest,
                format!(
                    "{{\"documentType\":\"{INSTALLED_MANIFEST_DOCUMENT_TYPE}\",\"schemaVersion\":1,\"id\":\"retro-2048\",\"version\":\"1.0.0\",\"runtime\":\"libretro\",\"compatibilityStatus\":\"{compatibility_status}\",\"launch\":{{\"timeoutMs\":15000,\"healthCheck\":{{\"type\":\"process\"}}}}}}"
                ),
            )
            .expect("write development manifest");
            let document = String::from_utf8(
                self.document(&current_target(), "packages/retro-2048/vcg-game.json"),
            )
            .expect("catalog document is UTF-8")
            .replace(
                "\"qualification\":\"qualified\"",
                "\"qualification\":\"development\"",
            );
            self.sign_catalog(document.as_bytes());
        }

        /// Republishes the bound manifest with the supplied `documentType`
        /// declaration, or with none when `document_type` is `None`.
        fn publish_manifest_document_type(&self, document_type: Option<&str>) {
            let declaration = document_type
                .map(|value| format!("\"documentType\":\"{value}\","))
                .unwrap_or_default();
            fs::write(
                &self.manifest,
                format!(
                    "{{{declaration}\"schemaVersion\":1,\"id\":\"retro-2048\",\
                     \"version\":\"1.0.0\",\"runtime\":\"libretro\",\
                     \"compatibilityStatus\":\"qualified\",\
                     \"launch\":{{\"timeoutMs\":15000,\"healthCheck\":{{\"type\":\"process\"}}}}}}"
                ),
            )
            .expect("write manifest document type");
            self.sign_catalog(
                &self.document(&current_target(), "packages/retro-2048/vcg-game.json"),
            );
        }

        fn sign_catalog(&self, bytes: &[u8]) {
            fs::write(&self.catalog, bytes).expect("write catalog");
            let mut message = Vec::with_capacity(SIGNED_MESSAGE_PREFIX.len() + bytes.len());
            message.extend_from_slice(SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(bytes);
            let signature = self.signing_key.sign(&message);
            fs::write(
                &self.signature,
                format!("{}\n", encode_hex(&signature.to_bytes())),
            )
            .expect("write signature");
        }

        pub(crate) fn load(&self) -> Result<TrustedPackageCatalog, CatalogError> {
            TrustedPackageCatalog::load(
                &self.catalog,
                &self.signature,
                &self.public_key,
                self.roots(),
            )
        }
    }

    pub(crate) fn signed_catalog() -> (Fixture, TrustedPackageCatalog) {
        let fixture = Fixture::new();
        let catalog = fixture.load().expect("signed fixture catalog loads");
        (fixture, catalog)
    }

    pub(crate) fn signed_launch_catalog() -> (Fixture, TrustedPackageCatalog) {
        let fixture = Fixture::new();
        fs::copy(
            std::env::current_exe().expect("test executable path resolves"),
            &fixture.frontend,
        )
        .expect("copy launchable test executable");
        fixture.sign_catalog(
            &fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
        );
        let catalog = fixture
            .load()
            .expect("launchable signed fixture catalog loads");
        (fixture, catalog)
    }

    /// A signed catalog whose one package accepts library content for exactly
    /// the named system and core.
    pub(crate) fn signed_library_catalog(
        system_id: &str,
        core_id: &str,
    ) -> (Fixture, TrustedPackageCatalog) {
        let fixture = Fixture::new();
        fixture.publish_library(system_id, core_id);
        let catalog = fixture.load().expect("signed library catalog loads");
        (fixture, catalog)
    }

    pub(crate) fn signed_native_catalog() -> (Fixture, TrustedPackageCatalog) {
        let fixture = Fixture::new();
        fixture.publish_native();
        let catalog = fixture.load().expect("signed native fixture catalog loads");
        (fixture, catalog)
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn digest_path(path: &Path) -> String {
        encode_hex(&Sha256::digest(fs::read(path).expect("read fixture")))
    }

    fn encode_hex(bytes: &[u8]) -> String {
        let mut output = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            use std::fmt::Write as _;
            write!(output, "{byte:02x}").expect("write hex");
        }
        output
    }

    fn delegated_policy(role_key: &SigningKey) -> TrustedUpdatePolicy {
        delegated_policy_for_channel(role_key, "stable")
    }

    fn delegated_policy_for_channel(role_key: &SigningKey, channel: &str) -> TrustedUpdatePolicy {
        let root_key = SigningKey::from_bytes(&[41_u8; 32]);
        let root_bytes = serde_json::to_vec(&json!({
            "schemaVersion": 1,
            "generation": 3,
            "expiresUnixSeconds": TRUSTED_TIME + 10_000,
            "rootThreshold": 1,
            "rootKeys": [{
                "keyId": "root-catalog",
                "publicKey": encode_hex(root_key.verifying_key().as_bytes()),
            }],
            "roles": [{
                "channel": channel,
                "artifact": "installed-catalog",
                "target": current_target(),
                "threshold": 1,
                "keys": [{
                    "keyId": "catalog-role",
                    "publicKey": encode_hex(role_key.verifying_key().as_bytes()),
                }],
            }],
        }))
        .expect("root serializes");
        let mut message = Vec::from(ROOT_SIGNED_MESSAGE_PREFIX);
        message.extend_from_slice(&root_bytes);
        let signatures = DetachedUpdateSignatures::new([DetachedUpdateSignature::from_hex(
            "root-catalog",
            &encode_hex(&root_key.sign(&message).to_bytes()),
        )
        .expect("root signature decodes")])
        .expect("root signatures create");
        let anchors = RootTrustAnchorSet::new(
            1,
            [
                RootTrustAnchor::new("root-catalog", root_key.verifying_key().to_bytes())
                    .expect("root anchor creates"),
            ],
        )
        .expect("root anchors create");
        let root =
            TrustedUpdateRoot::bootstrap(&root_bytes, &signatures, &anchors, 3, TRUSTED_TIME)
                .expect("root bootstraps");
        TrustedUpdatePolicy::new(root, channel, TRUSTED_TIME).expect("policy creates")
    }

    fn delegated_catalog_signatures(fixture: &Fixture) -> DetachedUpdateSignatures {
        let catalog_bytes = fs::read(&fixture.catalog).expect("catalog reads");
        let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
        message.extend_from_slice(&catalog_bytes);
        DetachedUpdateSignatures::new([DetachedUpdateSignature::from_hex(
            "catalog-role",
            &encode_hex(&fixture.signing_key.sign(&message).to_bytes()),
        )
        .expect("catalog signature decodes")])
        .expect("catalog signatures create")
    }

    #[test]
    fn development_packages_require_development_authority_and_unverified_manifest() {
        let fixture = Fixture::new();
        fixture.publish_development();
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::InvalidRecord(message))
                if message.contains("requires the development update channel")
        ));

        let signatures = delegated_catalog_signatures(&fixture);
        let stable = delegated_policy_for_channel(&fixture.signing_key, "stable");
        assert!(matches!(
            TrustedPackageCatalog::load_with_update_role(
                &fixture.catalog,
                &signatures,
                &stable,
                &current_target(),
                fixture.roots(),
            ),
            Err(CatalogError::InvalidRecord(message))
                if message.contains("requires the development update channel")
        ));

        let development = delegated_policy_for_channel(&fixture.signing_key, "development");
        let catalog = TrustedPackageCatalog::load_with_update_role(
            &fixture.catalog,
            &signatures,
            &development,
            &current_target(),
            fixture.roots(),
        )
        .expect("development-authorized package loads");
        catalog
            .verify_all_artifacts()
            .expect("development package artifacts verify");
        assert_eq!(
            catalog
                .update_authority()
                .expect("development authority retained")
                .channel(),
            "development"
        );

        fixture.publish_development_with_status("qualified");
        let signatures = delegated_catalog_signatures(&fixture);
        let catalog = TrustedPackageCatalog::load_with_update_role(
            &fixture.catalog,
            &signatures,
            &development,
            &current_target(),
            fixture.roots(),
        )
        .expect("development catalog parses before bound-manifest verification");
        assert!(matches!(
            catalog.verify_all_artifacts(),
            Err(CatalogError::InvalidBoundManifest(_))
        ));
    }

    #[test]
    fn runtime_filename_alias_is_development_only() {
        let fixture = Fixture::new();
        let auxiliary = fixture.install.join("retroarch/libstdcxx-6.dll");
        fs::write(&auxiliary, b"loader dependency").expect("write auxiliary");
        let document = String::from_utf8(
            fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
        )
        .expect("catalog document is UTF-8")
        .replace(
            "\"content\":{\"mode\":\"none\"}",
            &format!(
                "\"auxiliary\":[{{\"path\":\"retroarch/libstdcxx-6.dll\",\"sha256\":\"{}\",\"runtimeName\":\"libstdc++-6.dll\"}}],\"content\":{{\"mode\":\"none\"}}",
                digest_path(&auxiliary)
            ),
        );
        fixture.sign_catalog(document.as_bytes());
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::InvalidRecord(message))
                if message.contains("runtimeName only in the development channel")
        ));
    }

    #[test]
    fn delegated_catalog_authority_precedes_parsing_and_is_retained() {
        let fixture = Fixture::new();
        let catalog_bytes = fs::read(&fixture.catalog).expect("catalog reads");
        let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
        message.extend_from_slice(&catalog_bytes);
        let signatures = DetachedUpdateSignatures::new([DetachedUpdateSignature::from_hex(
            "catalog-role",
            &encode_hex(&fixture.signing_key.sign(&message).to_bytes()),
        )
        .expect("catalog signature decodes")])
        .expect("catalog signatures create");
        let policy = delegated_policy(&fixture.signing_key);

        let catalog = TrustedPackageCatalog::load_with_update_role(
            &fixture.catalog,
            &signatures,
            &policy,
            &current_target(),
            fixture.roots(),
        )
        .expect("delegated catalog loads");
        let authority = catalog
            .update_authority()
            .expect("delegated authority retained");
        assert_eq!(authority.root_generation(), 3);
        assert_eq!(authority.channel(), "stable");
        assert_eq!(authority.artifact(), UpdateArtifactKind::InstalledCatalog);
        assert_eq!(authority.signing_key_ids(), ["catalog-role"]);

        fs::write(&fixture.catalog, b"{").expect("catalog becomes malformed");
        assert!(matches!(
            TrustedPackageCatalog::load_with_update_role(
                &fixture.catalog,
                &signatures,
                &policy,
                &current_target(),
                fixture.roots(),
            ),
            Err(CatalogError::UpdateAuthority(_))
        ));
    }

    #[test]
    fn verifies_and_resolves_a_signed_qualified_package() {
        let fixture = Fixture::new();
        let catalog = fixture.load().expect("catalog loads");
        assert_eq!(catalog.generation(), 7);
        assert_eq!(catalog.target(), current_target());
        assert_eq!(
            catalog.package_summaries(),
            vec![PackageSummary {
                id: "retro-2048",
                version: "1.0.0",
                runtime: "libretro",
                generation: 7,
            }]
        );
        assert_eq!(
            catalog
                .package_health_policy("retro-2048")
                .expect("signed health policy resolves"),
            PackageHealthPolicy {
                timeout: Duration::from_secs(15),
                check: PackageHealthCheck::Process,
            }
        );

        let ResolvedPackage::Libretro(request) = catalog
            .resolve("retro-2048", "player-one")
            .expect("package resolves")
        else {
            panic!("fixture must resolve as libretro");
        };
        assert_eq!(request.game_id, "retro-2048");
        assert_eq!(request.profile_id, "player-one");
        assert_eq!(
            request.base_config,
            fs::canonicalize(&fixture.base_config).expect("base configuration canonicalizes")
        );
        plan_retroarch(&request).expect("resolved request passes the adapter");
    }

    #[test]
    fn verifies_and_resolves_a_signed_native_package() {
        let fixture = Fixture::new();
        fixture.publish_native();
        let catalog = fixture.load().expect("native catalog loads");

        assert_eq!(
            catalog.package_summaries(),
            vec![PackageSummary {
                id: "retro-2048",
                version: "1.0.0",
                runtime: "native",
                generation: 7,
            }]
        );
        catalog
            .verify_all_artifacts()
            .expect("native artifacts verify");
        let resolved = catalog
            .resolve("retro-2048", "player-one")
            .expect("native package resolves");
        let PackageLaunchPlan::Native(plan) =
            plan_package(&resolved).expect("shared package planner accepts native runtime")
        else {
            panic!("shared planner must dispatch to native");
        };
        assert_eq!(
            plan.launch().program(),
            fs::canonicalize(&fixture.frontend).expect("native executable canonicalizes")
        );
        assert_eq!(plan.launch().arguments().count(), 0);

        let ResolvedPackage::Native(request) = resolved else {
            panic!("fixture must resolve as native");
        };
        fs::write(&fixture.frontend, b"changed native executable")
            .expect("tamper native executable");
        assert!(matches!(
            plan_native(&request),
            Err(NativePackageError::HashMismatch { .. })
        ));
    }

    #[test]
    fn rejects_native_runtime_confusion_and_manifest_misbinding() {
        let fixture = Fixture::new();
        fixture.publish_native();
        let mut document: serde_json::Value =
            serde_json::from_slice(&fixture.native_document()).expect("native catalog parses");
        let libretro: serde_json::Value = serde_json::from_slice(
            &fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
        )
        .expect("libretro catalog parses");
        document["packages"][0]["libretro"] = libretro["packages"][0]["libretro"].clone();
        fixture.sign_catalog(&serde_json::to_vec(&document).expect("catalog serializes"));
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::InvalidRecord(_))
        ));

        let fixture = Fixture::new();
        fixture.publish_native();
        let mut document: serde_json::Value =
            serde_json::from_slice(&fixture.native_document()).expect("native catalog parses");
        document["packages"][0]
            .as_object_mut()
            .expect("package is an object")
            .remove("native");
        fixture.sign_catalog(&serde_json::to_vec(&document).expect("catalog serializes"));
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::InvalidRecord(_))
        ));

        let fixture = Fixture::new();
        let document = {
            let executable = fixture
                .frontend
                .strip_prefix(&fixture.install)
                .expect("executable is installed")
                .to_string_lossy()
                .replace('\\', "/");
            serde_json::to_vec(&json!({
                "schemaVersion": 1,
                "generation": 7,
                "target": current_target(),
                "packages": [{
                    "id": "retro-2048",
                    "version": "1.0.0",
                    "qualification": "qualified",
                    "runtime": "native",
                    "manifest": {
                        "path": "packages/retro-2048/vcg-game.json",
                        "sha256": digest_path(&fixture.manifest),
                    },
                    "native": {
                        "executable": {
                            "path": executable,
                            "sha256": digest_path(&fixture.frontend),
                        },
                    },
                }],
            }))
            .expect("catalog serializes")
        };
        fixture.sign_catalog(&document);
        let catalog = fixture.load().expect("catalog envelope loads");
        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::InvalidBoundManifest(_))
        ));
    }

    #[test]
    fn rejects_tampered_signatures_wrong_targets_and_unsafe_paths() {
        let fixture = Fixture::new();
        fs::write(&fixture.signature, format!("{}\n", "00".repeat(64))).expect("replace signature");
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::SignatureRejected)
        ));

        let fixture = Fixture::new();
        fixture
            .sign_catalog(&fixture.document("wrong-target", "packages/retro-2048/vcg-game.json"));
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::WrongTarget { .. })
        ));

        let fixture = Fixture::new();
        fixture.sign_catalog(&fixture.document(&current_target(), "../vcg-game.json"));
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::UnsafePath {
                kind: "manifest",
                ..
            })
        ));
    }

    #[test]
    fn detects_manifest_and_base_configuration_changes_at_their_use_boundaries() {
        let fixture = Fixture::new();
        let catalog = fixture.load().expect("catalog loads");
        fs::write(&fixture.manifest, b"tampered manifest").expect("tamper manifest");
        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::IntegrityMismatch {
                kind: "manifest",
                ..
            })
        ));

        let fixture = Fixture::new();
        let catalog = fixture.load().expect("catalog loads");
        let ResolvedPackage::Libretro(request) = catalog
            .resolve("retro-2048", "player-one")
            .expect("package resolves")
        else {
            panic!("fixture must resolve as libretro");
        };
        fs::write(&fixture.base_config, b"tampered configuration").expect("tamper config");
        assert!(matches!(
            plan_retroarch(&request),
            Err(RetroArchError::HashMismatch {
                kind: "base configuration",
                ..
            })
        ));
    }

    #[test]
    fn verifies_every_referenced_artifact_before_promotion() {
        for (kind, tampered_path) in [
            ("frontend", Fixture::new()),
            ("core", Fixture::new()),
            ("base configuration", Fixture::new()),
        ] {
            let path = match kind {
                "frontend" => &tampered_path.frontend,
                "core" => &tampered_path.core,
                "base configuration" => &tampered_path.base_config,
                _ => unreachable!("test cases are exhaustive"),
            };
            let catalog = tampered_path.load().expect("catalog loads before tamper");
            fs::write(path, b"tampered artifact").expect("tamper artifact");
            assert!(matches!(
                catalog.verify_all_artifacts(),
                Err(CatalogError::IntegrityMismatch {
                    kind: actual_kind,
                    ..
                }) if actual_kind == kind
            ));
        }
    }

    #[test]
    fn rejects_unsigned_defaults_and_unsupported_local_health_policies() {
        let fixture = Fixture::new();
        fs::write(
            &fixture.manifest,
            br#"{"documentType":"vcg-installed-game-manifest","schemaVersion":1,"id":"retro-2048","version":"1.0.0","runtime":"libretro","compatibilityStatus":"qualified","launch":{"timeoutMs":8000,"healthCheck":{"type":"explicit-ready"}}}"#,
        )
        .expect("replace signed health policy");
        fixture.sign_catalog(
            &fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
        );
        let catalog = fixture.load().expect("catalog with ready policy loads");
        assert_eq!(
            catalog
                .package_health_policy("retro-2048")
                .expect("explicit-ready policy resolves"),
            PackageHealthPolicy {
                timeout: Duration::from_secs(8),
                check: PackageHealthCheck::ExplicitReady,
            }
        );

        for launch in [
            r#""timeoutMs":999,"healthCheck":{"type":"process"}"#,
            r#""timeoutMs":15000,"healthCheck":{"type":"http","path":"/"}"#,
        ] {
            let fixture = Fixture::new();
            fs::write(
                &fixture.manifest,
                format!(
                    "{{\"documentType\":\"{INSTALLED_MANIFEST_DOCUMENT_TYPE}\",\
                     \"schemaVersion\":1,\"id\":\"retro-2048\",\"version\":\"1.0.0\",\
                     \"runtime\":\"libretro\",\"compatibilityStatus\":\"qualified\",\
                     \"launch\":{{{launch}}}}}"
                ),
            )
            .expect("replace invalid health policy");
            fixture.sign_catalog(
                &fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
            );
            let catalog = fixture
                .load()
                .expect("catalog signature remains independently valid");
            assert!(matches!(
                catalog.package_health_policy("retro-2048"),
                Err(CatalogError::InvalidBoundManifest(_))
            ));
            assert!(matches!(
                catalog.verify_all_artifacts(),
                Err(CatalogError::InvalidBoundManifest(_))
            ));
        }
    }

    #[test]
    fn rejects_invalid_browser_intents_and_bound_manifest_identity() {
        let fixture = Fixture::new();
        let catalog = fixture.load().expect("catalog loads");
        assert!(matches!(
            catalog.resolve("../retro-2048", "player-one"),
            Err(CatalogError::InvalidRecord(_))
        ));
        assert!(matches!(
            catalog.resolve("retro-2048", "../profile"),
            Err(CatalogError::InvalidRecord(_))
        ));
        assert!(matches!(
            catalog.resolve("not-installed", "player-one"),
            Err(CatalogError::PackageNotFound(_))
        ));

        let fixture = Fixture::new();
        fs::write(
            &fixture.manifest,
            br#"{"documentType":"vcg-installed-game-manifest","schemaVersion":1,"id":"another-game","version":"1.0.0","runtime":"libretro","compatibilityStatus":"qualified","launch":{"timeoutMs":15000,"healthCheck":{"type":"process"}}}"#,
        )
        .expect("replace manifest identity");
        fixture.sign_catalog(
            &fixture.document(&current_target(), "packages/retro-2048/vcg-game.json"),
        );
        let catalog = fixture.load().expect("catalog loads");
        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::InvalidBoundManifest(_))
        ));
    }

    #[test]
    fn bound_manifests_must_declare_the_installed_document_type() {
        let fixture = Fixture::new();
        fixture.publish_manifest_document_type(Some(INSTALLED_MANIFEST_DOCUMENT_TYPE));
        let catalog = fixture.load().expect("catalog loads");
        assert_eq!(
            catalog
                .package_health_policy("retro-2048")
                .expect("installed document type resolves"),
            PackageHealthPolicy {
                timeout: Duration::from_secs(15),
                check: PackageHealthCheck::Process,
            }
        );
        catalog
            .verify_all_artifacts()
            .expect("installed document type verifies");

        for document_type in [None, Some("vcg-game-manifest")] {
            let fixture = Fixture::new();
            fixture.publish_manifest_document_type(document_type);
            let catalog = fixture
                .load()
                .expect("catalog signature remains independently valid");
            let Err(CatalogError::InvalidBoundManifest(message)) =
                catalog.package_health_policy("retro-2048")
            else {
                panic!("{document_type:?} is not an installed-root manifest and must be rejected");
            };
            assert!(
                message.contains("retro-2048")
                    && message.contains(INSTALLED_MANIFEST_DOCUMENT_TYPE),
                "rejection names the package and the required document type: {message}"
            );
            assert!(matches!(
                catalog.verify_all_artifacts(),
                Err(CatalogError::InvalidBoundManifest(_))
            ));
            assert!(matches!(
                catalog.resolve("retro-2048", "player-one"),
                Err(CatalogError::InvalidBoundManifest(_))
            ));
        }
    }

    #[test]
    fn library_packages_accept_only_their_signed_system_and_core() {
        let (fixture, catalog) = signed_library_catalog("nes", "mesen");
        assert_eq!(
            catalog
                .package_library_binding("retro-2048")
                .expect("library binding reads"),
            Some(PackageLibraryBinding {
                system_id: "nes",
                core_id: "mesen",
            })
        );

        let object_root = fixture.root.join("objects");
        fs::create_dir_all(&object_root).expect("object root creates");
        let object = object_root.join("nes-library-object.nes");
        fs::write(&object, b"library content fixture").expect("library object writes");
        let sha256 = digest_path(&object);
        let entry_id = format!("content-{sha256}");
        let entry = LibraryContentRequest {
            entry_id: &entry_id,
            system_id: "nes",
            core_id: "mesen",
            sha256: &sha256,
            object_root: &object_root,
            object_path: &object,
        };

        let ResolvedPackage::Libretro(request) = catalog
            .resolve_with_library_content("retro-2048", "player-one", Some(entry))
            .expect("library entry resolves")
        else {
            panic!("library fixture must resolve as libretro");
        };
        assert_eq!(request.content, Some(object.clone()));
        assert_eq!(request.content_root, Some(object_root.clone()));
        assert!(request.content_sha256.is_some());
        plan_retroarch(&request).expect("resolved library content passes the adapter");

        fs::write(&object, b"changed library content").expect("library object tamper writes");
        assert!(matches!(
            plan_retroarch(&request),
            Err(RetroArchError::HashMismatch {
                kind: "content",
                ..
            })
        ));

        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::LibraryContentRequired(_))
        ));
        let foreign = LibraryContentRequest {
            system_id: "gb",
            ..entry
        };
        assert!(matches!(
            catalog.resolve_with_library_content("retro-2048", "player-one", Some(foreign)),
            Err(CatalogError::LibraryEntryIncompatible { .. })
        ));
        let other_core = LibraryContentRequest {
            core_id: "snes9x",
            ..entry
        };
        assert!(matches!(
            catalog.resolve_with_library_content("retro-2048", "player-one", Some(other_core)),
            Err(CatalogError::LibraryEntryIncompatible { .. })
        ));

        let (_fixed, fixed) = signed_catalog();
        assert_eq!(
            fixed
                .package_library_binding("retro-2048")
                .expect("fixed binding reads"),
            None
        );
        assert!(matches!(
            fixed.resolve_with_library_content("retro-2048", "player-one", Some(entry)),
            Err(CatalogError::LibraryContentRejected(_))
        ));

        let (_native_fixture, native) = signed_native_catalog();
        assert!(matches!(
            native.resolve_with_library_content("retro-2048", "player-one", Some(entry)),
            Err(CatalogError::LibraryContentRejected(_))
        ));
    }

    #[test]
    fn rejects_oversized_catalogs_and_noncanonical_key_material() {
        let fixture = Fixture::new();
        fs::write(
            &fixture.catalog,
            vec![b' '; usize::try_from(MAX_CATALOG_BYTES + 1).expect("limit fits")],
        )
        .expect("write oversized catalog");
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::TooLarge {
                kind: "catalog",
                ..
            })
        ));

        let fixture = Fixture::new();
        fs::write(
            &fixture.public_key,
            encode_hex(fixture.signing_key.verifying_key().as_bytes()).to_uppercase(),
        )
        .expect("write noncanonical key");
        assert!(matches!(
            fixture.load(),
            Err(CatalogError::InvalidEncoding("catalog public key"))
        ));
    }
}

#[cfg(test)]
mod more_tests {
    use super::{
        CatalogError, CatalogRoots, INSTALLED_MANIFEST_DOCUMENT_TYPE, LibraryContentRequest,
        ResolvedPackage, SIGNED_MESSAGE_PREFIX, TrustedPackageCatalog, current_target,
    };
    use crate::retroarch::plan as plan_retroarch;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        root: PathBuf,
        install_root: PathBuf,
        content_root: PathBuf,
        runtime_root: PathBuf,
        data_root: PathBuf,
        catalog_path: PathBuf,
        signature_path: PathBuf,
        public_key_path: PathBuf,
        manifest_path: PathBuf,
        base_config_path: PathBuf,
        signing_key: SigningKey,
    }

    impl Fixture {
        fn new() -> Self {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "vcg-installed-catalog-{}-{sequence}",
                std::process::id()
            ));
            let install_root = root.join("installed");
            let content_root = root.join("content");
            let runtime_root = root.join("runtime");
            let data_root = root.join("data");
            let metadata_root = root.join("metadata");
            let package_root = install_root.join("games").join("retro-2048");
            let frontend_path = install_root
                .join("runtimes")
                .join("retroarch")
                .join(executable_name("retroarch"));
            let core_path = install_root
                .join("cores")
                .join(library_name("2048_libretro"));
            let base_config_path = install_root
                .join("runtimes")
                .join("retroarch")
                .join("vcg-base.cfg");
            let manifest_path = package_root.join("vcg-game.json");
            for directory in [
                package_root,
                frontend_path
                    .parent()
                    .expect("frontend fixture has a parent")
                    .to_owned(),
                core_path
                    .parent()
                    .expect("core fixture has a parent")
                    .to_owned(),
                content_root.clone(),
                runtime_root.clone(),
                data_root.clone(),
                metadata_root.clone(),
            ] {
                fs::create_dir_all(directory).expect("fixture directory creates");
            }
            fs::write(&frontend_path, b"frontend fixture").expect("frontend fixture writes");
            fs::write(&core_path, b"core fixture").expect("core fixture writes");
            fs::write(&base_config_path, b"menu_driver = \"rgui\"\n")
                .expect("base configuration fixture writes");
            fs::write(
                &manifest_path,
                manifest_bytes("retro-2048", "1.0.0", "qualified"),
            )
            .expect("manifest fixture writes");

            let catalog_path = metadata_root.join("installed-catalog.json");
            let signature_path = metadata_root.join("installed-catalog.sig");
            let public_key_path = metadata_root.join("catalog-public-key.hex");
            let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
            fs::write(
                &public_key_path,
                encode_hex(&signing_key.verifying_key().to_bytes()),
            )
            .expect("public key fixture writes");

            Self {
                root,
                install_root,
                content_root,
                runtime_root,
                data_root,
                catalog_path,
                signature_path,
                public_key_path,
                manifest_path,
                base_config_path,
                signing_key,
            }
        }

        fn roots(&self) -> CatalogRoots {
            CatalogRoots {
                install_root: self.install_root.clone(),
                content_root: Some(self.content_root.clone()),
                runtime_root: self.runtime_root.clone(),
                data_root: self.data_root.clone(),
            }
        }

        fn document(&self) -> Value {
            let frontend_path = self
                .install_root
                .join("runtimes")
                .join("retroarch")
                .join(executable_name("retroarch"));
            let core_path = self
                .install_root
                .join("cores")
                .join(library_name("2048_libretro"));
            json!({
                "schemaVersion": 1,
                "generation": 7,
                "target": current_target(),
                "packages": [{
                    "id": "retro-2048",
                    "version": "1.0.0",
                    "qualification": "qualified",
                    "runtime": "libretro",
                    "manifest": {
                        "path": relative_text(&self.install_root, &self.manifest_path),
                        "sha256": file_hash(&self.manifest_path),
                    },
                    "libretro": {
                        "frontend": {
                            "path": relative_text(&self.install_root, &frontend_path),
                            "sha256": file_hash(&frontend_path),
                        },
                        "core": {
                            "path": relative_text(&self.install_root, &core_path),
                            "sha256": file_hash(&core_path),
                        },
                        "baseConfig": {
                            "path": relative_text(&self.install_root, &self.base_config_path),
                            "sha256": file_hash(&self.base_config_path),
                        },
                        "content": { "mode": "none" },
                    },
                }],
            })
        }

        fn publish(&self, document: &Value) {
            let bytes = serde_json::to_vec_pretty(document).expect("catalog fixture serializes");
            fs::write(&self.catalog_path, &bytes).expect("catalog fixture writes");
            let mut message = Vec::from(SIGNED_MESSAGE_PREFIX);
            message.extend_from_slice(&bytes);
            let signature = self.signing_key.sign(&message);
            fs::write(&self.signature_path, encode_hex(&signature.to_bytes()))
                .expect("signature fixture writes");
        }

        fn load(&self) -> Result<TrustedPackageCatalog, CatalogError> {
            TrustedPackageCatalog::load(
                &self.catalog_path,
                &self.signature_path,
                &self.public_key_path,
                self.roots(),
            )
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn verifies_and_resolves_only_host_owned_launch_inputs() {
        let fixture = Fixture::new();
        fixture.publish(&fixture.document());

        let catalog = fixture.load().expect("signed catalog loads");
        assert_eq!(catalog.generation(), 7);
        assert_eq!(catalog.target(), current_target());
        let ResolvedPackage::Libretro(request) = catalog
            .resolve("retro-2048", "player-one")
            .expect("qualified package resolves")
        else {
            panic!("fixture must resolve as libretro");
        };

        assert_eq!(request.game_id, "retro-2048");
        assert_eq!(request.profile_id, "player-one");
        let canonical_install =
            fs::canonicalize(&fixture.install_root).expect("install root canonicalizes");
        assert!(request.frontend.starts_with(&canonical_install));
        assert!(request.core.starts_with(&canonical_install));
        assert!(request.content.is_none());
        plan_retroarch(&request).expect("resolved package passes the native adapter");
    }

    #[test]
    fn verifies_signature_before_parsing_catalog_json() {
        let fixture = Fixture::new();
        fixture.publish(&fixture.document());
        fs::write(&fixture.catalog_path, b"{not-json").expect("tampered catalog fixture writes");

        assert!(matches!(
            fixture.load(),
            Err(CatalogError::SignatureRejected)
        ));
    }

    #[test]
    fn rejects_unknown_fields_wrong_targets_duplicates_and_unsafe_paths() {
        let cases = [
            {
                let fixture = Fixture::new();
                let mut document = fixture.document();
                document["surprise"] = json!(true);
                (fixture, document)
            },
            {
                let fixture = Fixture::new();
                let mut document = fixture.document();
                document["target"] = json!("wrong-target");
                (fixture, document)
            },
            {
                let fixture = Fixture::new();
                let mut document = fixture.document();
                let duplicate = document["packages"][0].clone();
                document["packages"]
                    .as_array_mut()
                    .expect("packages is an array")
                    .push(duplicate);
                (fixture, document)
            },
            {
                let fixture = Fixture::new();
                let mut document = fixture.document();
                document["packages"][0]["libretro"]["frontend"]["path"] = json!("../outside");
                (fixture, document)
            },
        ];

        for (fixture, document) in cases {
            fixture.publish(&document);
            assert!(fixture.load().is_err(), "{document} should be rejected");
        }
    }

    #[test]
    fn rejects_changed_or_misbound_game_manifests() {
        let fixture = Fixture::new();
        fixture.publish(&fixture.document());
        let catalog = fixture.load().expect("signed catalog loads");
        fs::write(&fixture.manifest_path, b"changed").expect("manifest tamper writes");
        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::IntegrityMismatch {
                kind: "manifest",
                ..
            })
        ));

        let fixture = Fixture::new();
        fs::write(
            &fixture.manifest_path,
            manifest_bytes("another-game", "1.0.0", "qualified"),
        )
        .expect("misbound manifest writes");
        fixture.publish(&fixture.document());
        let catalog = fixture.load().expect("misbound catalog signature is valid");
        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::InvalidBoundManifest(_))
        ));
    }

    #[test]
    fn verifies_managed_content_before_promotion() {
        let fixture = Fixture::new();
        let content_path = fixture.content_root.join("retro/2048.rom");
        fs::create_dir_all(content_path.parent().expect("content has a parent"))
            .expect("content directory creates");
        fs::write(&content_path, b"managed content").expect("managed content writes");
        let mut document = fixture.document();
        document["packages"][0]["libretro"]["content"] = json!({
            "mode": "managed",
            "path": relative_text(&fixture.content_root, &content_path),
            "sha256": file_hash(&content_path),
        });
        fixture.publish(&document);
        let catalog = fixture.load().expect("managed-content catalog loads");
        catalog
            .verify_all_artifacts()
            .expect("managed content verifies");

        fs::write(&content_path, b"changed content").expect("managed content tamper writes");
        assert!(matches!(
            catalog.verify_all_artifacts(),
            Err(CatalogError::IntegrityMismatch {
                kind: "content",
                ..
            })
        ));
    }

    #[test]
    fn a_fixed_managed_content_package_rejects_every_library_entry() {
        let fixture = Fixture::new();
        let content_path = fixture.content_root.join("retro/2048.rom");
        fs::create_dir_all(content_path.parent().expect("content has a parent"))
            .expect("content directory creates");
        fs::write(&content_path, b"managed content").expect("managed content writes");
        let mut document = fixture.document();
        document["packages"][0]["libretro"]["content"] = json!({
            "mode": "managed",
            "path": relative_text(&fixture.content_root, &content_path),
            "sha256": file_hash(&content_path),
        });
        fixture.publish(&document);
        let catalog = fixture.load().expect("managed-content catalog loads");

        assert_eq!(
            catalog
                .package_library_binding("retro-2048")
                .expect("managed binding reads"),
            None
        );
        assert!(matches!(
            catalog.resolve_with_library_content(
                "retro-2048",
                "player-one",
                Some(LibraryContentRequest {
                    entry_id: "content-0000000000000000000000000000000000000000000000000000000000000000",
                    system_id: "nes",
                    core_id: "mesen",
                    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
                    object_root: &fixture.content_root,
                    object_path: &content_path,
                }),
            ),
            Err(CatalogError::LibraryContentRejected(_))
        ));
    }

    #[test]
    fn rejects_unknown_packages_invalid_profiles_and_changed_base_config() {
        let fixture = Fixture::new();
        fixture.publish(&fixture.document());
        let catalog = fixture.load().expect("signed catalog loads");

        assert!(matches!(
            catalog.resolve("missing", "player-one"),
            Err(CatalogError::PackageNotFound(_))
        ));
        assert!(matches!(
            catalog.resolve("retro-2048", "../escape"),
            Err(CatalogError::InvalidRecord(_))
        ));
        fs::write(&fixture.base_config_path, b"changed").expect("base configuration tamper writes");
        assert!(matches!(
            catalog.resolve("retro-2048", "player-one"),
            Err(CatalogError::IntegrityMismatch {
                kind: "base configuration",
                ..
            })
        ));
    }

    fn executable_name(base: &str) -> String {
        format!("{base}{}", std::env::consts::EXE_SUFFIX)
    }

    fn library_name(base: &str) -> String {
        format!(
            "{}{base}{}",
            std::env::consts::DLL_PREFIX,
            std::env::consts::DLL_SUFFIX
        )
    }

    fn manifest_bytes(id: &str, version: &str, status: &str) -> Vec<u8> {
        serde_json::to_vec_pretty(&json!({
            "documentType": INSTALLED_MANIFEST_DOCUMENT_TYPE,
            "schemaVersion": 1,
            "id": id,
            "version": version,
            "runtime": "libretro",
            "compatibilityStatus": status,
            "launch": {
                "timeoutMs": 15000,
                "healthCheck": { "type": "process" },
            },
        }))
        .expect("manifest fixture serializes")
    }

    fn relative_text(root: &Path, path: &Path) -> String {
        path.strip_prefix(root)
            .expect("fixture path is below root")
            .to_string_lossy()
            .replace('\\', "/")
    }

    fn file_hash(path: &Path) -> String {
        let bytes = fs::read(path).expect("fixture file reads");
        encode_hex(&Sha256::digest(bytes))
    }

    fn encode_hex(bytes: &[u8]) -> String {
        let mut output = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            use std::fmt::Write as _;
            write!(output, "{byte:02x}").expect("writing hex to String succeeds");
        }
        output
    }
}
