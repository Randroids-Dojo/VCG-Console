//! Qualification-only materializer for the closed native diagnostic store.
//!
//! This example deliberately accepts only an empty/new absolute store root and
//! emits one fixed code from every native producer. It is not a diagnostic
//! export surface and accepts no event text, profile identity, or other
//! user-controlled diagnostic content.

use std::env;
use std::path::PathBuf;

use vcg_host::diagnostics::{
    DiagnosticProducer, NativeDiagnosticCode, NativeDiagnosticStore, NativeDiagnosticStoreConfig,
};

const MAXIMUM_EVENTS: usize = 16;
const MAXIMUM_BYTES: u64 = 16 * 1_024;
const MAXIMUM_BOOT_EPOCHS: usize = 2;
const FIXTURE_BOOT_EPOCH: u64 = 1;

fn main() -> Result<(), String> {
    let mut arguments = env::args_os();
    let _program = arguments.next();
    let store_root = arguments.next().map(PathBuf::from).ok_or_else(|| {
        "usage: native_diagnostics_exclusion_fixture <absolute-new-root>".to_owned()
    })?;
    if arguments.next().is_some() {
        return Err("usage: native_diagnostics_exclusion_fixture <absolute-new-root>".to_owned());
    }
    if store_root.exists() {
        return Err("native diagnostics exclusion fixture root already exists".to_owned());
    }

    let mut store = NativeDiagnosticStore::open(
        NativeDiagnosticStoreConfig {
            store_root,
            maximum_events: MAXIMUM_EVENTS,
            maximum_bytes: MAXIMUM_BYTES,
            maximum_boot_epochs: MAXIMUM_BOOT_EPOCHS,
        },
        FIXTURE_BOOT_EPOCH,
    )
    .map_err(|error| error.to_string())?;

    record(
        &mut store,
        DiagnosticProducer::AccessController,
        NativeDiagnosticCode::AccessFamilyLocked,
        10,
    )?;
    record(
        &mut store,
        DiagnosticProducer::Launcher,
        NativeDiagnosticCode::LauncherReady,
        20,
    )?;
    record(
        &mut store,
        DiagnosticProducer::PackageManager,
        NativeDiagnosticCode::PackageInventoryUnavailable,
        30,
    )?;
    record(
        &mut store,
        DiagnosticProducer::PowerCoordinator,
        NativeDiagnosticCode::PowerTransitionFailed,
        40,
    )?;
    record(
        &mut store,
        DiagnosticProducer::ProcessSupervisor,
        NativeDiagnosticCode::ProcessActivationDenied,
        50,
    )?;
    record(
        &mut store,
        DiagnosticProducer::SystemUpdate,
        NativeDiagnosticCode::UpdateHealthFailed,
        60,
    )?;

    let snapshot = store.snapshot();
    if snapshot.events().len() != 6
        || snapshot.evicted_events() != 0
        || snapshot.maximum_events() != MAXIMUM_EVENTS
        || snapshot.maximum_bytes() != MAXIMUM_BYTES
        || snapshot.maximum_boot_epochs() != MAXIMUM_BOOT_EPOCHS
    {
        return Err("native diagnostics exclusion fixture snapshot is incomplete".to_owned());
    }
    Ok(())
}

fn record(
    store: &mut NativeDiagnosticStore,
    producer: DiagnosticProducer,
    code: NativeDiagnosticCode,
    uptime_ms: u64,
) -> Result<(), String> {
    let lease = store.authorize_producer(producer);
    store
        .record(&lease, code, uptime_ms)
        .map(|_| ())
        .map_err(|error| error.to_string())
}
