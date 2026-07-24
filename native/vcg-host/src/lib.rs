//! Native appliance boundaries for VCG Console.

pub mod host_api;
pub mod input;
pub mod installed_catalog;
pub mod launcher;
pub mod native_launch;
mod native_launch_replay;
pub mod native_package;
pub mod package_generation;
pub mod package_health;
pub mod package_intake;
pub mod package_launch;
pub mod package_transfer;
pub mod process;
pub mod profile_registry;
pub mod recovery_image;
pub mod retroarch;
pub mod save_lifecycle;
pub mod save_reset;
pub mod storage_layout;
pub mod system_image;
pub mod system_update;
pub mod update_root_store;
pub mod update_trust;
