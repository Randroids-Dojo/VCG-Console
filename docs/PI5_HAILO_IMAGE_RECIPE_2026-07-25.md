# Raspberry Pi 5 and Hailo image recipe boundary

Date: 2026-07-25

Investigation: I-157

Machine-checkable plan:
`benchmarks/pi-image/pi5-hailo-image-plan-v1.json`

Status: blocked recipe; no download, image build, media write or hardware result

## Outcome

The first image candidate is now pinned to one public Raspberry Pi OS artifact
and one Hailo Apps release identity. This closes source ambiguity only. It does
not constitute the version-locked appliance image required by I-157 or Q-087.

The candidate base is Raspberry Pi OS with desktop, 64-bit, released
2026-06-18: Debian 13 Trixie, nominal kernel 6.18, and compressed SHA-256
`123287c05f27b0eebd8f65456f6369b8f6635fa50a3d440a4f9f6223bf58c8e2`.
The exact download URL and digest are fixed in the plan. “Kernel 6.18” is the
download-page family label, not evidence of the exact installed kernel after
package updates.

The Hailo Apps candidate is tag `26.03.1`, tag object
`8887f6057fd570ff182134a5a0a66ca3d914e603`, peeled commit
`891ce701c2ebe239a5d277759eb75a30f76678a9`. Its installation guide names
HailoRT 4.23 and TAPPAS Core 5.1.0 as the supported Hailo-8/Hailo-8L family.
Those are candidate compatibility families, not observed Raspberry Pi package
versions.

## Primary sources

- [Raspberry Pi OS downloads](https://www.raspberrypi.com/software/operating-systems/)
- [Pinned Raspberry Pi OS image](https://downloads.raspberrypi.com/raspios_arm64/images/raspios_arm64-2026-06-19/2026-06-18-raspios-trixie-arm64.img.xz)
- [Raspberry Pi AI software guide](https://www.raspberrypi.com/documentation/computers/ai.html)
- [Hailo Apps `26.03.1`](https://github.com/hailo-ai/hailo-apps/tree/891ce701c2ebe239a5d277759eb75a30f76678a9)
- [Pinned Hailo install guide](https://github.com/hailo-ai/hailo-apps/blob/891ce701c2ebe239a5d277759eb75a30f76678a9/doc/user_guide/installation.md)

Raspberry Pi currently requires 64-bit Raspberry Pi OS Trixie for the AI HAT
path and directs AI HAT+ users to install `dkms` and `hailo-all`, reboot, and
verify with `hailortcli fw-control identify`. The same documentation warns that
models, packages and drivers must be compatible. Hailo Apps additionally
downloads resources and compiles post-processing libraries, so pinning only a
Git commit would leave material runtime inputs mutable.

## Why the plan remains blocked

The source ledger intentionally leaves these fields null:

- received Pi, EEPROM, AI HAT part/revision and firmware identity;
- selected UVC camera part, USB identity, firmware and device path;
- locally verified compressed and expanded image hashes;
- exact apt repository snapshot and installed package manifest;
- exact HailoRT, PCIe driver, TAPPAS Core and Python-binding versions;
- Hailo resource, pose HEF and compiled post-processor hashes;
- browser, VCG release, build-recipe and data-exclusion digests; and
- all download, build, removable-media-write and destructive-test authority.

The quoted HAT listing still exposes `SC1791` and `SC1468`; the plan refuses to
choose between them. The camera contract remains 1080p60 wide-angle UVC, not a
selected part. Q-254 therefore blocks the camera tuple independently of Q-087.

## Reproducible build sequence

### Phase 1 — immutable input admission

1. Approve the base flavor under Q-257; do not silently replace desktop with
   Lite, Full, 32-bit, Legacy or a newer “latest” image.
2. Download the exact URL to an empty build workspace and verify the compressed
   SHA-256 before decompression. Record byte length and retrieval timestamp.
3. Decompress through a bounded tool and record the expanded-image SHA-256.
4. Fetch Hailo Apps tag `26.03.1`; require both the tag object and peeled commit
   above, a clean tree and a recorded source-tree/archive digest.
5. Freeze signed apt repository metadata and every package/version/architecture
   before installation. Cache the exact packages and Python inputs required for
   an offline cold rebuild; do not rely on `apt install hailo-all` continuing to
   resolve to the same tuple.
6. Resolve Hailo resources without a moving network dependency. Record every
   downloaded model, HEF, configuration and compiled post-processing library
   with origin, length, license and SHA-256.
7. Bind the exact VCG release, graphical session/browser, system services,
   partition layout, mount policy and build script to digests.

### Phase 2 — target build and capture

1. Verify received board/HAT/camera identity before writing media. A mismatch
   stops the run and creates a new candidate plan; it does not edit evidence to
   match the hardware after the fact.
2. Write only to an explicitly authorized non-system card using the destructive
   confirmation and read-back boundary in `RECOVERY_IMAGE_BUNDLE.md`.
3. Boot once with network available only for the frozen build inputs. Capture
   EEPROM, firmware, kernel, apt, Hailo, PCIe, Python, camera, browser and VCG
   identities named by `requiredBootCapture` in the plan.
4. Verify the Hailo device and package tuple, then enumerate the exact UVC
   1920x1080@60 format and controls. Example output in vendor documentation is
   not accepted as the received device's identity.
5. Hash the installed HEF, resource and post-processor bytes actually loaded by
   the pose pipeline. A filename or package version alone is insufficient.
6. Remove build credentials and caches not approved for the appliance, scan for
   all prohibited image data, and produce the immutable image manifest.

### Phase 3 — qualification and recovery

1. Cold-build again from only the retained image, apt, Python, Hailo resource,
   VCG and build-recipe inputs; compare manifests and explain every allowed
   nondeterministic field.
2. Boot offline and prove launcher, tracker, exact camera, controller and local
   package operation without fetching models or packages.
3. Exercise A/B update, failed-health rollback, package/runtime mismatch,
   interrupted update and blank-card recovery without weakening D-050.
4. Reflash a blank replacement card from the signed recovery bundle, perform
   full read-back verification, and confirm the image contains none of the
   prohibited household, profile, save, key or diagnostic classes.
5. Publish the exact tuple only after the physical Pi/HAT/camera, performance,
   thermal, storage and recovery gates pass. A successful boot alone is not a
   qualification result.

## Validation

`node scripts/validate-pi5-hailo-image-plan.mjs` checks the exact source pins,
ordered blockers, null unverified inputs, false authority flags, required boot
capture, prohibited image-data classes, field order, canonical JSON, UTF-8 and
a 64 KiB input ceiling. Focused adversarial tests reject source substitution,
fabricated hardware, hidden authority, blocker drift, sensitive keys and
noncanonical or malformed input.

## Evidence boundary

This work proves that one blocked source plan is exact and tamper-evident in
the repository. It does not authenticate a future download, apt repository,
package cache, Git tag signature, hardware, firmware, camera, HEF, compiled
library, installed image or result. It authorizes no network download, media
write, destructive test, purchase, package promotion or release claim.
