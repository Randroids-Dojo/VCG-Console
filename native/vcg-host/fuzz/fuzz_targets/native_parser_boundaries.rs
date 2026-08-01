#![no_main]

use std::str::FromStr;

use libfuzzer_sys::fuzz_target;
use vcg_host::accessibility::AccessibilityPreferences;
use vcg_host::developer_pairing::{DeveloperTrustRegistry, ProtectedDeveloperTrustState};
use vcg_host::launcher::loopback_origin;
use vcg_host::package_generation::ProtectedPackageGenerationState;
use vcg_host::retroarch::ExpectedSha256;
use vcg_host::system_update::ProtectedSystemUpdateState;
use vcg_host::update_root_store::ProtectedUpdateRootState;
use vcg_host::update_trust::{DetachedUpdateSignatures, RootTrustAnchorSet};

fuzz_target!(|data: &[u8]| {
    let _ = AccessibilityPreferences::from_json_bytes(data);
    let _ = RootTrustAnchorSet::from_json_bytes(data);
    let _ = DetachedUpdateSignatures::from_json_bytes(data);
    let _ = ProtectedDeveloperTrustState::from_json_bytes(data);
    let _ = DeveloperTrustRegistry::load(data, &ProtectedDeveloperTrustState::uninitialized());
    let _ = ProtectedPackageGenerationState::from_json_bytes(data);
    let _ = ProtectedSystemUpdateState::from_json_bytes(data);
    let _ = ProtectedUpdateRootState::from_json_bytes(data);

    if let Ok(text) = std::str::from_utf8(data) {
        let _ = loopback_origin(text);
        let _ = ExpectedSha256::from_str(text);
    }
});
