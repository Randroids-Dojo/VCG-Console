//! One launch-plan boundary shared by package health and live execution.

use std::fmt;
use std::path::Path;

use crate::installed_catalog::ResolvedPackage;
use crate::native_package::{NativePackageError, NativePackagePlan, plan as plan_native};
use crate::process::LaunchSpec;
use crate::retroarch::{RetroArchError, RetroArchPlan, plan as plan_retroarch};

/// Fully verified runtime-specific plan for one installed package.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PackageLaunchPlan {
    Libretro(Box<RetroArchPlan>),
    Native(Box<NativePackagePlan>),
}

impl PackageLaunchPlan {
    #[must_use]
    pub fn launch(&self) -> &LaunchSpec {
        match self {
            Self::Libretro(plan) => plan.launch(),
            Self::Native(plan) => plan.launch(),
        }
    }

    #[must_use]
    pub fn session_root(&self) -> &Path {
        match self {
            Self::Libretro(plan) => &plan.storage().session,
            Self::Native(plan) => &plan.storage().session,
        }
    }

    /// Creates runtime-specific host-owned storage.
    ///
    /// # Errors
    ///
    /// Returns the runtime-specific preparation failure.
    pub fn prepare(&self) -> Result<(), PackageLaunchError> {
        match self {
            Self::Libretro(plan) => plan.prepare().map_err(PackageLaunchError::Libretro),
            Self::Native(plan) => plan.prepare().map_err(PackageLaunchError::Native),
        }
    }
}

/// Converts catalog-resolved trusted inputs into one verified launch plan.
///
/// # Errors
///
/// Returns runtime-specific verification or planning failure.
pub fn plan(resolved: &ResolvedPackage) -> Result<PackageLaunchPlan, PackageLaunchError> {
    match resolved {
        ResolvedPackage::Libretro(request) => plan_retroarch(request)
            .map(Box::new)
            .map(PackageLaunchPlan::Libretro)
            .map_err(PackageLaunchError::Libretro),
        ResolvedPackage::Native(request) => plan_native(request)
            .map(Box::new)
            .map(PackageLaunchPlan::Native)
            .map_err(PackageLaunchError::Native),
    }
}

/// Runtime-specific package planning failure.
#[derive(Debug)]
pub enum PackageLaunchError {
    Libretro(RetroArchError),
    Native(NativePackageError),
}

impl fmt::Display for PackageLaunchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Libretro(error) => write!(formatter, "{error}"),
            Self::Native(error) => write!(formatter, "{error}"),
        }
    }
}

impl std::error::Error for PackageLaunchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Libretro(error) => Some(error),
            Self::Native(error) => Some(error),
        }
    }
}
