//! Bounded planning for the console's system and writable-storage boundary.
//!
//! This module does not partition, format, mount, erase, reserve, or delete
//! storage. It gives a privileged platform adapter a reviewable plan with two
//! equal system slots, one writable data partition, fixed data namespaces, and
//! capacity admission that preserves recovery headroom.

use std::collections::BTreeSet;
use std::fmt;
use std::path::{Component, Path, PathBuf};

use crate::system_update::{SystemSlot, VerifiedSystemImageEvidence};

/// Nominal manufacturer capacity selected by D-048.
pub const SELECTED_CARD_NOMINAL_BYTES: u64 = 256_000_000_000;
/// Conservative partition alignment used by the software plan.
pub const PARTITION_ALIGNMENT_BYTES: u64 = 4 * 1024 * 1024;
/// Defensive ceiling for malformed or misbound capacity input.
pub const MAX_DEVICE_CAPACITY_BYTES: u64 = 16 * 1024 * 1024 * 1024 * 1024;

const DATA_CLASS_COUNT: usize = 9;
const PARTITION_ROLES: [PartitionRole; 4] = [
    PartitionRole::FirmwareBoot,
    PartitionRole::SystemA,
    PartitionRole::SystemB,
    PartitionRole::WritableData,
];
pub const WRITABLE_DATA_CLASSES: [WritableDataClass; DATA_CLASS_COUNT] = [
    WritableDataClass::SystemMetadata,
    WritableDataClass::ProductionPackages,
    WritableDataClass::DeveloperPackages,
    WritableDataClass::Saves,
    WritableDataClass::Profiles,
    WritableDataClass::RetroContent,
    WritableDataClass::Logs,
    WritableDataClass::Cache,
    WritableDataClass::Staging,
];

/// One non-overlapping storage fault and lifecycle domain.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum PartitionRole {
    FirmwareBoot,
    SystemA,
    SystemB,
    WritableData,
}

impl PartitionRole {
    #[must_use]
    pub const fn system_slot(self) -> Option<SystemSlot> {
        match self {
            Self::SystemA => Some(SystemSlot::A),
            Self::SystemB => Some(SystemSlot::B),
            Self::FirmwareBoot | Self::WritableData => None,
        }
    }

    const fn for_slot(slot: SystemSlot) -> Self {
        match slot {
            SystemSlot::A => Self::SystemA,
            SystemSlot::B => Self::SystemB,
        }
    }
}

/// Runtime write policy expected for one partition.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PartitionAccess {
    FirmwareManaged,
    ReadOnlySystem,
    WritableData,
}

/// One aligned half-open byte range `[start, end)`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PartitionExtent {
    role: PartitionRole,
    start_bytes: u64,
    length_bytes: u64,
    access: PartitionAccess,
}

impl PartitionExtent {
    #[must_use]
    pub const fn role(self) -> PartitionRole {
        self.role
    }

    #[must_use]
    pub const fn start_bytes(self) -> u64 {
        self.start_bytes
    }

    #[must_use]
    pub const fn length_bytes(self) -> u64 {
        self.length_bytes
    }

    #[must_use]
    pub const fn end_bytes(self) -> u64 {
        self.start_bytes + self.length_bytes
    }

    #[must_use]
    pub const fn access(self) -> PartitionAccess {
        self.access
    }
}

/// Pure four-partition layout for a supplied exact device capacity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageLayoutPlan {
    device_capacity_bytes: u64,
    recovery_headroom_bytes: u64,
    leading_reserved_bytes: u64,
    trailing_unallocated_bytes: u64,
    partitions: [PartitionExtent; 4],
}

impl StorageLayoutPlan {
    /// Derives an aligned boot/A/B/data layout.
    ///
    /// The caller supplies measured capacity and candidate partition sizes.
    /// This function deliberately does not select final production sizes.
    ///
    /// # Errors
    ///
    /// Rejects zero, excessive, unaligned, overflowing, or non-fitting input,
    /// and a data partition that cannot retain the requested recovery reserve.
    pub fn new(
        device_capacity_bytes: u64,
        firmware_boot_bytes: u64,
        system_slot_bytes: u64,
        recovery_headroom_bytes: u64,
    ) -> Result<Self, StorageLayoutError> {
        if device_capacity_bytes == 0
            || device_capacity_bytes > MAX_DEVICE_CAPACITY_BYTES
            || firmware_boot_bytes == 0
            || system_slot_bytes == 0
            || recovery_headroom_bytes == 0
        {
            return Err(StorageLayoutError::InvalidCapacity);
        }
        if !firmware_boot_bytes.is_multiple_of(PARTITION_ALIGNMENT_BYTES)
            || !system_slot_bytes.is_multiple_of(PARTITION_ALIGNMENT_BYTES)
        {
            return Err(StorageLayoutError::UnalignedPartitionSize);
        }

        let leading_reserved_bytes = PARTITION_ALIGNMENT_BYTES;
        let boot = make_extent(
            PartitionRole::FirmwareBoot,
            leading_reserved_bytes,
            firmware_boot_bytes,
            PartitionAccess::FirmwareManaged,
        )?;
        let system_a = make_extent(
            PartitionRole::SystemA,
            boot.end_bytes(),
            system_slot_bytes,
            PartitionAccess::ReadOnlySystem,
        )?;
        let system_b = make_extent(
            PartitionRole::SystemB,
            system_a.end_bytes(),
            system_slot_bytes,
            PartitionAccess::ReadOnlySystem,
        )?;
        let aligned_device_end = align_down(device_capacity_bytes);
        if aligned_device_end <= system_b.end_bytes() {
            return Err(StorageLayoutError::InsufficientDeviceCapacity);
        }
        let data = make_extent(
            PartitionRole::WritableData,
            system_b.end_bytes(),
            aligned_device_end - system_b.end_bytes(),
            PartitionAccess::WritableData,
        )?;
        if recovery_headroom_bytes >= data.length_bytes {
            return Err(StorageLayoutError::InsufficientDeviceCapacity);
        }
        let plan = Self {
            device_capacity_bytes,
            recovery_headroom_bytes,
            leading_reserved_bytes,
            trailing_unallocated_bytes: device_capacity_bytes - aligned_device_end,
            partitions: [boot, system_a, system_b, data],
        };
        plan.validate()?;
        Ok(plan)
    }

    #[must_use]
    pub const fn device_capacity_bytes(&self) -> u64 {
        self.device_capacity_bytes
    }

    #[must_use]
    pub const fn recovery_headroom_bytes(&self) -> u64 {
        self.recovery_headroom_bytes
    }

    #[must_use]
    pub const fn leading_reserved_bytes(&self) -> u64 {
        self.leading_reserved_bytes
    }

    #[must_use]
    pub const fn trailing_unallocated_bytes(&self) -> u64 {
        self.trailing_unallocated_bytes
    }

    #[must_use]
    pub const fn partitions(&self) -> &[PartitionExtent; 4] {
        &self.partitions
    }

    #[must_use]
    pub fn partition(&self, role: PartitionRole) -> PartitionExtent {
        let index = match role {
            PartitionRole::FirmwareBoot => 0,
            PartitionRole::SystemA => 1,
            PartitionRole::SystemB => 2,
            PartitionRole::WritableData => 3,
        };
        self.partitions[index]
    }

    #[must_use]
    pub fn writable_data_bytes(&self) -> u64 {
        self.partition(PartitionRole::WritableData).length_bytes
    }

    /// Validates current writable usage against physical data capacity.
    ///
    /// # Errors
    ///
    /// Rejects aggregate usage larger than the writable partition.
    pub fn capacity_snapshot(
        &self,
        usage: &WritableDataUsage,
    ) -> Result<DataCapacitySnapshot, StorageLayoutError> {
        let capacity_bytes = self.writable_data_bytes();
        let used_bytes = usage.total_bytes();
        if used_bytes > capacity_bytes {
            return Err(StorageLayoutError::UsageExceedsDataPartition {
                used_bytes,
                capacity_bytes,
            });
        }
        let free_bytes = capacity_bytes - used_bytes;
        Ok(DataCapacitySnapshot {
            capacity: capacity_bytes,
            used: used_bytes,
            free: free_bytes,
            recovery_headroom: self.recovery_headroom_bytes,
            ordinary_available: free_bytes.saturating_sub(self.recovery_headroom_bytes),
        })
    }

    /// Plans one ordinary persistent or transient write without consuming the
    /// recovery reserve.
    ///
    /// # Errors
    ///
    /// Rejects zero, overflowing, over-capacity, or reserve-consuming writes.
    pub fn admit_ordinary_write(
        &self,
        usage: &WritableDataUsage,
        class: WritableDataClass,
        requested_bytes: u64,
    ) -> Result<DataWriteReservation, StorageLayoutError> {
        if requested_bytes == 0 {
            return Err(StorageLayoutError::ZeroLengthRequest);
        }
        let capacity = self.capacity_snapshot(usage)?;
        if requested_bytes > capacity.ordinary_available {
            return Err(StorageLayoutError::RecoveryHeadroomWouldBeConsumed {
                requested_bytes,
                ordinary_available_bytes: capacity.ordinary_available,
            });
        }
        let prior_class_bytes = usage.bytes(class);
        let resulting_class_bytes = prior_class_bytes
            .checked_add(requested_bytes)
            .ok_or(StorageLayoutError::CapacityOverflow)?;
        let resulting_total_bytes = capacity
            .used
            .checked_add(requested_bytes)
            .ok_or(StorageLayoutError::CapacityOverflow)?;
        Ok(DataWriteReservation {
            class,
            prior_class_bytes,
            requested_bytes,
            resulting_class_bytes,
            resulting_total_bytes,
            remaining_free_bytes: capacity.capacity - resulting_total_bytes,
            preserved_recovery_headroom_bytes: self.recovery_headroom_bytes,
        })
    }

    /// Plans bounded privileged recovery workspace that may consume reserved
    /// headroom but cannot exceed physical free space.
    ///
    /// # Errors
    ///
    /// Rejects zero, over-capacity, or malformed current usage.
    pub fn admit_recovery_workspace(
        &self,
        usage: &WritableDataUsage,
        requested_bytes: u64,
    ) -> Result<RecoveryWorkspaceReservation, StorageLayoutError> {
        if requested_bytes == 0 {
            return Err(StorageLayoutError::ZeroLengthRequest);
        }
        let capacity = self.capacity_snapshot(usage)?;
        if requested_bytes > capacity.free {
            return Err(StorageLayoutError::InsufficientPhysicalSpace {
                requested_bytes,
                free_bytes: capacity.free,
            });
        }
        Ok(RecoveryWorkspaceReservation {
            requested: requested_bytes,
            headroom_consumed: requested_bytes.saturating_sub(capacity.ordinary_available),
            remaining_free: capacity.free - requested_bytes,
        })
    }

    /// Binds verified image evidence to the inactive equal-sized system slot.
    ///
    /// # Errors
    ///
    /// Rejects zero-length or oversized candidate images.
    pub fn plan_system_update(
        &self,
        active_slot: SystemSlot,
        image: &VerifiedSystemImageEvidence,
    ) -> Result<SystemUpdateStoragePlan, StorageLayoutError> {
        let image = image.image();
        let target_slot = image.slot();
        if target_slot != active_slot.other() {
            return Err(StorageLayoutError::CandidateTargetsActiveSystem);
        }
        let target_partition = self.partition(PartitionRole::for_slot(target_slot));
        let image_bytes = image.image_size_bytes();
        if image_bytes == 0 || image_bytes > target_partition.length_bytes {
            return Err(StorageLayoutError::SystemImageDoesNotFit {
                image_bytes,
                slot_bytes: target_partition.length_bytes,
            });
        }
        Ok(SystemUpdateStoragePlan {
            active_slot,
            target_slot,
            image_bytes,
            target_partition,
            writable_data_partition: self.partition(PartitionRole::WritableData),
        })
    }

    #[must_use]
    pub fn fault_isolation(&self, failed_role: PartitionRole) -> PartitionFaultPlan {
        let unaffected_roles = PARTITION_ROLES
            .into_iter()
            .filter(|role| *role != failed_role)
            .collect();
        PartitionFaultPlan {
            failed_role,
            unaffected_roles,
            requires_external_recovery: matches!(
                failed_role,
                PartitionRole::FirmwareBoot | PartitionRole::WritableData
            ),
        }
    }

    fn validate(&self) -> Result<(), StorageLayoutError> {
        for (index, partition) in self.partitions.iter().enumerate() {
            if partition.start_bytes % PARTITION_ALIGNMENT_BYTES != 0
                || partition.length_bytes == 0
                || partition.end_bytes() > self.device_capacity_bytes
                || partition.role != PARTITION_ROLES[index]
            {
                return Err(StorageLayoutError::InvalidDerivedLayout);
            }
            if index > 0 && self.partitions[index - 1].end_bytes() != partition.start_bytes {
                return Err(StorageLayoutError::InvalidDerivedLayout);
            }
        }
        let system_a = self.partition(PartitionRole::SystemA);
        let system_b = self.partition(PartitionRole::SystemB);
        if system_a.length_bytes != system_b.length_bytes
            || system_a.access != PartitionAccess::ReadOnlySystem
            || system_b.access != PartitionAccess::ReadOnlySystem
        {
            return Err(StorageLayoutError::InvalidDerivedLayout);
        }
        Ok(())
    }
}

/// One host-owned writable storage category.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum WritableDataClass {
    SystemMetadata,
    ProductionPackages,
    DeveloperPackages,
    Saves,
    Profiles,
    RetroContent,
    Logs,
    Cache,
    Staging,
}

impl WritableDataClass {
    const fn index(self) -> usize {
        match self {
            Self::SystemMetadata => 0,
            Self::ProductionPackages => 1,
            Self::DeveloperPackages => 2,
            Self::Saves => 3,
            Self::Profiles => 4,
            Self::RetroContent => 5,
            Self::Logs => 6,
            Self::Cache => 7,
            Self::Staging => 8,
        }
    }
}

/// Fixed-shape measured usage with no unbounded category names.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WritableDataUsage {
    bytes: [u64; DATA_CLASS_COUNT],
    total_bytes: u64,
}

impl WritableDataUsage {
    /// Creates a complete or sparse usage snapshot.
    ///
    /// # Errors
    ///
    /// Rejects duplicate categories and aggregate overflow.
    pub fn new(
        entries: impl IntoIterator<Item = (WritableDataClass, u64)>,
    ) -> Result<Self, StorageLayoutError> {
        let mut bytes = [0; DATA_CLASS_COUNT];
        let mut seen = BTreeSet::new();
        let mut total_bytes = 0_u64;
        for (class, class_bytes) in entries {
            if !seen.insert(class) {
                return Err(StorageLayoutError::DuplicateUsageClass(class));
            }
            total_bytes = total_bytes
                .checked_add(class_bytes)
                .ok_or(StorageLayoutError::CapacityOverflow)?;
            bytes[class.index()] = class_bytes;
        }
        Ok(Self { bytes, total_bytes })
    }

    #[must_use]
    pub const fn empty() -> Self {
        Self {
            bytes: [0; DATA_CLASS_COUNT],
            total_bytes: 0,
        }
    }

    #[must_use]
    pub const fn bytes(&self, class: WritableDataClass) -> u64 {
        self.bytes[class.index()]
    }

    #[must_use]
    pub const fn total_bytes(&self) -> u64 {
        self.total_bytes
    }
}

/// Current data-partition capacity with the recovery reserve separated.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DataCapacitySnapshot {
    capacity: u64,
    used: u64,
    free: u64,
    recovery_headroom: u64,
    ordinary_available: u64,
}

impl DataCapacitySnapshot {
    #[must_use]
    pub const fn capacity_bytes(self) -> u64 {
        self.capacity
    }

    #[must_use]
    pub const fn used_bytes(self) -> u64 {
        self.used
    }

    #[must_use]
    pub const fn free_bytes(self) -> u64 {
        self.free
    }

    #[must_use]
    pub const fn recovery_headroom_bytes(self) -> u64 {
        self.recovery_headroom
    }

    #[must_use]
    pub const fn ordinary_available_bytes(self) -> u64 {
        self.ordinary_available
    }
}

/// Admission evidence for one ordinary write.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DataWriteReservation {
    class: WritableDataClass,
    prior_class_bytes: u64,
    requested_bytes: u64,
    resulting_class_bytes: u64,
    resulting_total_bytes: u64,
    remaining_free_bytes: u64,
    preserved_recovery_headroom_bytes: u64,
}

impl DataWriteReservation {
    #[must_use]
    pub const fn class(self) -> WritableDataClass {
        self.class
    }

    #[must_use]
    pub const fn requested_bytes(self) -> u64 {
        self.requested_bytes
    }

    #[must_use]
    pub const fn prior_class_bytes(self) -> u64 {
        self.prior_class_bytes
    }

    #[must_use]
    pub const fn resulting_class_bytes(self) -> u64 {
        self.resulting_class_bytes
    }

    #[must_use]
    pub const fn resulting_total_bytes(self) -> u64 {
        self.resulting_total_bytes
    }

    #[must_use]
    pub const fn remaining_free_bytes(self) -> u64 {
        self.remaining_free_bytes
    }

    #[must_use]
    pub const fn preserved_recovery_headroom_bytes(self) -> u64 {
        self.preserved_recovery_headroom_bytes
    }
}

/// Admission evidence for privileged recovery scratch space.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RecoveryWorkspaceReservation {
    requested: u64,
    headroom_consumed: u64,
    remaining_free: u64,
}

impl RecoveryWorkspaceReservation {
    #[must_use]
    pub const fn requested_bytes(self) -> u64 {
        self.requested
    }

    #[must_use]
    pub const fn headroom_consumed_bytes(self) -> u64 {
        self.headroom_consumed
    }

    #[must_use]
    pub const fn remaining_free_bytes(self) -> u64 {
        self.remaining_free
    }
}

/// Exact inactive system-partition target for a verified image writer.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SystemUpdateStoragePlan {
    active_slot: SystemSlot,
    target_slot: SystemSlot,
    image_bytes: u64,
    target_partition: PartitionExtent,
    writable_data_partition: PartitionExtent,
}

impl SystemUpdateStoragePlan {
    #[must_use]
    pub const fn active_slot(self) -> SystemSlot {
        self.active_slot
    }

    #[must_use]
    pub const fn target_slot(self) -> SystemSlot {
        self.target_slot
    }

    #[must_use]
    pub const fn image_bytes(self) -> u64 {
        self.image_bytes
    }

    #[must_use]
    pub const fn target_partition(self) -> PartitionExtent {
        self.target_partition
    }

    #[must_use]
    pub const fn writable_data_partition(self) -> PartitionExtent {
        self.writable_data_partition
    }
}

/// Structural blast radius of one partition fault.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PartitionFaultPlan {
    failed_role: PartitionRole,
    unaffected_roles: Vec<PartitionRole>,
    requires_external_recovery: bool,
}

impl PartitionFaultPlan {
    #[must_use]
    pub const fn failed_role(&self) -> PartitionRole {
        self.failed_role
    }

    #[must_use]
    pub fn unaffected_roles(&self) -> &[PartitionRole] {
        &self.unaffected_roles
    }

    #[must_use]
    pub const fn requires_external_recovery(&self) -> bool {
        self.requires_external_recovery
    }
}

/// Automatic cleanup authority for one writable class.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CleanupDisposition {
    NeverAutomatic,
    ExplicitLifecycleOnly,
    PolicyManaged,
    RecoveryCoordinatorOnly,
}

/// Returns the narrow default automatic-cleanup boundary.
#[must_use]
pub const fn cleanup_disposition(class: WritableDataClass) -> CleanupDisposition {
    match class {
        WritableDataClass::SystemMetadata
        | WritableDataClass::Saves
        | WritableDataClass::Profiles => CleanupDisposition::NeverAutomatic,
        WritableDataClass::ProductionPackages
        | WritableDataClass::DeveloperPackages
        | WritableDataClass::RetroContent => CleanupDisposition::ExplicitLifecycleOnly,
        WritableDataClass::Logs | WritableDataClass::Cache => CleanupDisposition::PolicyManaged,
        WritableDataClass::Staging => CleanupDisposition::RecoveryCoordinatorOnly,
    }
}

/// Factory-reset handling before final installed-content policy is selected.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactoryResetDisposition {
    Delete,
    ReinitializeFromTrustedSystem,
    RequiresInstalledContentPolicy,
}

/// Makes every unresolved reset decision explicit instead of silently
/// retaining or deleting installed content.
#[must_use]
pub const fn factory_reset_disposition(class: WritableDataClass) -> FactoryResetDisposition {
    match class {
        WritableDataClass::SystemMetadata => FactoryResetDisposition::ReinitializeFromTrustedSystem,
        WritableDataClass::ProductionPackages | WritableDataClass::RetroContent => {
            FactoryResetDisposition::RequiresInstalledContentPolicy
        }
        WritableDataClass::DeveloperPackages
        | WritableDataClass::Saves
        | WritableDataClass::Profiles
        | WritableDataClass::Logs
        | WritableDataClass::Cache
        | WritableDataClass::Staging => FactoryResetDisposition::Delete,
    }
}

/// Fixed direct-child roots beneath the mounted writable data partition.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageNamespacePlan {
    writable_root: PathBuf,
    roots: [PathBuf; DATA_CLASS_COUNT],
    package_staging_root: PathBuf,
    retro_import_staging_root: PathBuf,
}

impl StorageNamespacePlan {
    /// Derives every category root from one trusted absolute writable root.
    ///
    /// # Errors
    ///
    /// Rejects relative roots and lexical `.` or `..` components.
    pub fn new(writable_root: impl AsRef<Path>) -> Result<Self, StorageLayoutError> {
        let writable_root = writable_root.as_ref();
        if !writable_root.is_absolute()
            || !writable_root
                .components()
                .any(|component| matches!(component, Component::Normal(_)))
            || writable_root
                .components()
                .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        {
            return Err(StorageLayoutError::UnsafeWritableRoot(
                writable_root.to_owned(),
            ));
        }
        let writable_root = writable_root.to_owned();
        let staging = writable_root.join("staging");
        Ok(Self {
            roots: [
                writable_root.join("system-state"),
                writable_root.join("packages"),
                writable_root.join("developer-packages"),
                writable_root.join("games"),
                writable_root.join("profiles"),
                writable_root.join("retro"),
                writable_root.join("logs"),
                writable_root.join("cache"),
                staging.clone(),
            ],
            package_staging_root: staging.join("packages"),
            retro_import_staging_root: staging.join("retro-imports"),
            writable_root,
        })
    }

    #[must_use]
    pub fn writable_root(&self) -> &Path {
        &self.writable_root
    }

    #[must_use]
    pub fn root_for(&self, class: WritableDataClass) -> &Path {
        &self.roots[class.index()]
    }

    #[must_use]
    pub fn package_staging_root(&self) -> &Path {
        &self.package_staging_root
    }

    #[must_use]
    pub fn retro_import_staging_root(&self) -> &Path {
        &self.retro_import_staging_root
    }
}

fn make_extent(
    role: PartitionRole,
    start_bytes: u64,
    length_bytes: u64,
    access: PartitionAccess,
) -> Result<PartitionExtent, StorageLayoutError> {
    start_bytes
        .checked_add(length_bytes)
        .ok_or(StorageLayoutError::CapacityOverflow)?;
    Ok(PartitionExtent {
        role,
        start_bytes,
        length_bytes,
        access,
    })
}

const fn align_down(bytes: u64) -> u64 {
    bytes - bytes % PARTITION_ALIGNMENT_BYTES
}

/// Invalid layout, namespace, usage, or admission request.
#[derive(Debug, Eq, PartialEq)]
pub enum StorageLayoutError {
    InvalidCapacity,
    UnalignedPartitionSize,
    InsufficientDeviceCapacity,
    CapacityOverflow,
    InvalidDerivedLayout,
    DuplicateUsageClass(WritableDataClass),
    UsageExceedsDataPartition {
        used_bytes: u64,
        capacity_bytes: u64,
    },
    ZeroLengthRequest,
    RecoveryHeadroomWouldBeConsumed {
        requested_bytes: u64,
        ordinary_available_bytes: u64,
    },
    InsufficientPhysicalSpace {
        requested_bytes: u64,
        free_bytes: u64,
    },
    SystemImageDoesNotFit {
        image_bytes: u64,
        slot_bytes: u64,
    },
    CandidateTargetsActiveSystem,
    UnsafeWritableRoot(PathBuf),
}

impl fmt::Display for StorageLayoutError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCapacity => formatter.write_str("storage capacity input is invalid"),
            Self::UnalignedPartitionSize => write!(
                formatter,
                "partition sizes must align to {PARTITION_ALIGNMENT_BYTES} bytes"
            ),
            Self::InsufficientDeviceCapacity => {
                formatter.write_str("device cannot fit boot, equal system slots, data, and reserve")
            }
            Self::CapacityOverflow => formatter.write_str("storage capacity arithmetic overflowed"),
            Self::InvalidDerivedLayout => {
                formatter.write_str("derived storage layout violates fixed partition invariants")
            }
            Self::DuplicateUsageClass(class) => {
                write!(formatter, "writable usage repeats category {class:?}")
            }
            Self::UsageExceedsDataPartition {
                used_bytes,
                capacity_bytes,
            } => write!(
                formatter,
                "writable usage {used_bytes} exceeds data capacity {capacity_bytes}"
            ),
            Self::ZeroLengthRequest => formatter.write_str("storage request must be nonzero"),
            Self::RecoveryHeadroomWouldBeConsumed {
                requested_bytes,
                ordinary_available_bytes,
            } => write!(
                formatter,
                "ordinary request {requested_bytes} exceeds {ordinary_available_bytes} bytes available above recovery headroom"
            ),
            Self::InsufficientPhysicalSpace {
                requested_bytes,
                free_bytes,
            } => write!(
                formatter,
                "recovery request {requested_bytes} exceeds physical free space {free_bytes}"
            ),
            Self::SystemImageDoesNotFit {
                image_bytes,
                slot_bytes,
            } => write!(
                formatter,
                "system image {image_bytes} does not fit inactive slot capacity {slot_bytes}"
            ),
            Self::CandidateTargetsActiveSystem => {
                formatter.write_str("system image evidence targets the active slot")
            }
            Self::UnsafeWritableRoot(path) => {
                write!(formatter, "writable root is unsafe: {}", path.display())
            }
        }
    }
}

impl std::error::Error for StorageLayoutError {}

#[cfg(test)]
mod tests {
    use super::*;

    const MIB: u64 = 1024 * 1024;
    const GIB: u64 = 1024 * 1024 * 1024;

    fn layout() -> StorageLayoutPlan {
        StorageLayoutPlan::new(SELECTED_CARD_NOMINAL_BYTES, 512 * MIB, 16 * GIB, 8 * GIB)
            .expect("valid illustrative layout")
    }

    fn image(slot: SystemSlot, image_size_bytes: u64) -> VerifiedSystemImageEvidence {
        VerifiedSystemImageEvidence::new(
            slot,
            2,
            "release-2",
            "stable",
            "raspberry-pi-5",
            image_size_bytes,
            ("1".repeat(64), "2".repeat(64)),
        )
        .expect("valid image evidence")
    }

    #[test]
    fn derives_aligned_equal_slots_and_one_writable_remainder() {
        let layout = layout();
        assert_eq!(layout.device_capacity_bytes(), SELECTED_CARD_NOMINAL_BYTES);
        assert_eq!(layout.leading_reserved_bytes(), PARTITION_ALIGNMENT_BYTES);
        assert!(layout.trailing_unallocated_bytes() < PARTITION_ALIGNMENT_BYTES);
        let slots = [
            layout.partition(PartitionRole::SystemA),
            layout.partition(PartitionRole::SystemB),
        ];
        assert_eq!(slots[0].length_bytes(), slots[1].length_bytes());
        assert!(
            slots
                .iter()
                .all(|slot| slot.access() == PartitionAccess::ReadOnlySystem)
        );
        assert_eq!(
            layout.partition(PartitionRole::WritableData).access(),
            PartitionAccess::WritableData
        );
        for pair in layout.partitions().windows(2) {
            assert_eq!(pair[0].end_bytes(), pair[1].start_bytes());
        }
    }

    #[test]
    fn rejects_zero_unaligned_excessive_and_nonfitting_layouts() {
        assert!(matches!(
            StorageLayoutPlan::new(0, 512 * MIB, 16 * GIB, 8 * GIB),
            Err(StorageLayoutError::InvalidCapacity)
        ));
        assert!(matches!(
            StorageLayoutPlan::new(SELECTED_CARD_NOMINAL_BYTES, 513 * MIB, 16 * GIB, 8 * GIB),
            Err(StorageLayoutError::UnalignedPartitionSize)
        ));
        assert!(matches!(
            StorageLayoutPlan::new(MAX_DEVICE_CAPACITY_BYTES + 1, 512 * MIB, 16 * GIB, 8 * GIB),
            Err(StorageLayoutError::InvalidCapacity)
        ));
        assert!(matches!(
            StorageLayoutPlan::new(8 * GIB, 512 * MIB, 4 * GIB, GIB),
            Err(StorageLayoutError::InsufficientDeviceCapacity)
        ));
    }

    #[test]
    fn usage_is_fixed_bounded_unique_and_overflow_safe() {
        let usage = WritableDataUsage::new([
            (WritableDataClass::Saves, 10),
            (WritableDataClass::Cache, 20),
        ])
        .expect("usage");
        assert_eq!(usage.bytes(WritableDataClass::Saves), 10);
        assert_eq!(usage.total_bytes(), 30);
        assert!(matches!(
            WritableDataUsage::new([(WritableDataClass::Saves, 1), (WritableDataClass::Saves, 2)]),
            Err(StorageLayoutError::DuplicateUsageClass(
                WritableDataClass::Saves
            ))
        ));
        assert!(matches!(
            WritableDataUsage::new([
                (WritableDataClass::Saves, u64::MAX),
                (WritableDataClass::Cache, 1)
            ]),
            Err(StorageLayoutError::CapacityOverflow)
        ));
    }

    #[test]
    fn ordinary_writes_preserve_recovery_headroom_at_full_threshold() {
        let layout = layout();
        let capacity = layout.writable_data_bytes();
        let reserve = layout.recovery_headroom_bytes();
        let usage = WritableDataUsage::new([(
            WritableDataClass::ProductionPackages,
            capacity - reserve - 100,
        )])
        .expect("usage");
        let reservation = layout
            .admit_ordinary_write(&usage, WritableDataClass::Saves, 100)
            .expect("write to reserve boundary");
        assert_eq!(reservation.remaining_free_bytes(), reserve);
        assert_eq!(reservation.preserved_recovery_headroom_bytes(), reserve);
        assert!(matches!(
            layout.admit_ordinary_write(&usage, WritableDataClass::Cache, 101),
            Err(StorageLayoutError::RecoveryHeadroomWouldBeConsumed { .. })
        ));
    }

    #[test]
    fn recovery_workspace_may_use_reserve_but_not_exceed_physical_space() {
        let layout = layout();
        let capacity = layout.writable_data_bytes();
        let reserve = layout.recovery_headroom_bytes();
        let usage =
            WritableDataUsage::new([(WritableDataClass::ProductionPackages, capacity - reserve)])
                .expect("usage");
        let workspace = layout
            .admit_recovery_workspace(&usage, reserve)
            .expect("consume exact reserve");
        assert_eq!(workspace.headroom_consumed_bytes(), reserve);
        assert_eq!(workspace.remaining_free_bytes(), 0);
        assert!(matches!(
            layout.admit_recovery_workspace(&usage, reserve + 1),
            Err(StorageLayoutError::InsufficientPhysicalSpace { .. })
        ));
    }

    #[test]
    fn malformed_or_overfull_usage_fails_before_admission() {
        let layout = layout();
        let usage = WritableDataUsage::new([(
            WritableDataClass::ProductionPackages,
            layout.writable_data_bytes() + 1,
        )])
        .expect("bounded arithmetic");
        assert!(matches!(
            layout.capacity_snapshot(&usage),
            Err(StorageLayoutError::UsageExceedsDataPartition { .. })
        ));
        assert!(matches!(
            layout.admit_ordinary_write(&WritableDataUsage::empty(), WritableDataClass::Logs, 0),
            Err(StorageLayoutError::ZeroLengthRequest)
        ));
    }

    #[test]
    fn system_update_targets_only_the_inactive_equal_slot() {
        let layout = layout();
        for active in [SystemSlot::A, SystemSlot::B] {
            let candidate = image(active.other(), 8 * GIB);
            let update = layout
                .plan_system_update(active, &candidate)
                .expect("image fits");
            assert_eq!(update.active_slot(), active);
            assert_eq!(update.target_slot(), active.other());
            assert_eq!(
                update.target_partition().role().system_slot(),
                Some(active.other())
            );
            assert_eq!(
                update.writable_data_partition(),
                layout.partition(PartitionRole::WritableData)
            );
        }
        let oversized = image(SystemSlot::B, 16 * GIB + 1);
        assert!(matches!(
            layout.plan_system_update(SystemSlot::A, &oversized),
            Err(StorageLayoutError::SystemImageDoesNotFit { .. })
        ));
        assert!(matches!(
            layout.plan_system_update(SystemSlot::A, &image(SystemSlot::A, 8 * GIB)),
            Err(StorageLayoutError::CandidateTargetsActiveSystem)
        ));
    }

    #[test]
    fn partition_faults_have_single_structural_blast_radius() {
        let layout = layout();
        let failed_a = layout.fault_isolation(PartitionRole::SystemA);
        assert!(
            !failed_a
                .unaffected_roles()
                .contains(&PartitionRole::SystemA)
        );
        assert!(
            failed_a
                .unaffected_roles()
                .contains(&PartitionRole::SystemB)
        );
        assert!(
            failed_a
                .unaffected_roles()
                .contains(&PartitionRole::WritableData)
        );
        assert!(!failed_a.requires_external_recovery());

        let failed_data = layout.fault_isolation(PartitionRole::WritableData);
        assert!(
            failed_data
                .unaffected_roles()
                .contains(&PartitionRole::SystemA)
        );
        assert!(
            failed_data
                .unaffected_roles()
                .contains(&PartitionRole::SystemB)
        );
        assert!(failed_data.requires_external_recovery());
        assert!(
            layout
                .fault_isolation(PartitionRole::FirmwareBoot)
                .requires_external_recovery()
        );
    }

    #[test]
    fn automatic_cleanup_excludes_identity_saves_and_installed_content() {
        for class in [
            WritableDataClass::SystemMetadata,
            WritableDataClass::Saves,
            WritableDataClass::Profiles,
        ] {
            assert_eq!(
                cleanup_disposition(class),
                CleanupDisposition::NeverAutomatic
            );
        }
        for class in [
            WritableDataClass::ProductionPackages,
            WritableDataClass::DeveloperPackages,
            WritableDataClass::RetroContent,
        ] {
            assert_eq!(
                cleanup_disposition(class),
                CleanupDisposition::ExplicitLifecycleOnly
            );
        }
        for class in [WritableDataClass::Logs, WritableDataClass::Cache] {
            assert_eq!(
                cleanup_disposition(class),
                CleanupDisposition::PolicyManaged
            );
        }
        assert_eq!(
            cleanup_disposition(WritableDataClass::Staging),
            CleanupDisposition::RecoveryCoordinatorOnly
        );
    }

    #[test]
    fn factory_reset_never_silently_decides_installed_content_policy() {
        assert_eq!(
            factory_reset_disposition(WritableDataClass::SystemMetadata),
            FactoryResetDisposition::ReinitializeFromTrustedSystem
        );
        for class in [
            WritableDataClass::ProductionPackages,
            WritableDataClass::RetroContent,
        ] {
            assert_eq!(
                factory_reset_disposition(class),
                FactoryResetDisposition::RequiresInstalledContentPolicy
            );
        }
        for class in [
            WritableDataClass::DeveloperPackages,
            WritableDataClass::Saves,
            WritableDataClass::Profiles,
            WritableDataClass::Logs,
            WritableDataClass::Cache,
            WritableDataClass::Staging,
        ] {
            assert_eq!(
                factory_reset_disposition(class),
                FactoryResetDisposition::Delete
            );
        }
    }

    #[test]
    fn namespace_roots_are_fixed_distinct_and_below_writable_data() {
        let root = if cfg!(windows) {
            PathBuf::from(r"C:\vcg-data")
        } else {
            PathBuf::from("/var/lib/vcg")
        };
        let namespaces = StorageNamespacePlan::new(&root).expect("namespaces");
        let roots = WRITABLE_DATA_CLASSES
            .into_iter()
            .map(|class| namespaces.root_for(class).to_owned())
            .collect::<BTreeSet<_>>();
        assert_eq!(roots.len(), DATA_CLASS_COUNT);
        assert!(roots.iter().all(|path| path.starts_with(&root)));
        assert!(
            namespaces
                .package_staging_root()
                .starts_with(namespaces.root_for(WritableDataClass::Staging))
        );
        assert!(
            namespaces
                .retro_import_staging_root()
                .starts_with(namespaces.root_for(WritableDataClass::Staging))
        );
    }

    #[test]
    fn unsafe_writable_roots_are_rejected_without_retention() {
        assert!(matches!(
            StorageNamespacePlan::new("relative/data"),
            Err(StorageLayoutError::UnsafeWritableRoot(_))
        ));
        let filesystem_root = if cfg!(windows) {
            PathBuf::from(r"C:\")
        } else {
            PathBuf::from("/")
        };
        assert!(matches!(
            StorageNamespacePlan::new(filesystem_root),
            Err(StorageLayoutError::UnsafeWritableRoot(_))
        ));
        let unsafe_absolute = if cfg!(windows) {
            PathBuf::from(r"C:\vcg-data\..\escape")
        } else {
            PathBuf::from("/var/lib/vcg/../escape")
        };
        assert!(matches!(
            StorageNamespacePlan::new(unsafe_absolute),
            Err(StorageLayoutError::UnsafeWritableRoot(_))
        ));
    }
}
