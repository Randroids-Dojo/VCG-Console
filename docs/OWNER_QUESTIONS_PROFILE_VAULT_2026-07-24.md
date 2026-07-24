# Owner questions: console-bound profile vault

Last updated: 2026-07-24

These answers do not block the common encrypted-record design or synthetic
desk tests. They block hardware selection, production provisioning, and any
claim that I-187 is qualified on the Raspberry Pi or Steam Machine.

## Q-162: Raspberry Pi key-protector branch

Should the selected Pi 5 assembly require an enclosure-integrated SPI TPM 2.0,
or may it use Raspberry Pi secure boot plus the BCM2712 device-private-key
service for removed-card confidentiality while another mechanism supplies
protected monotonic vault state?

Safe default: require an exact qualified TPM 2.0 module before persistent
portrait, calibration, or matching data enters a family build. Raspberry Pi
explicitly documents that Pi 5 has no hardware-protected key store; its OTP
path may still be tested as a lower-cost comparison but must not inherit TPM
or compromised-kernel claims. Do not purchase a module until AI HAT, 40-pin
electrical, driver, enclosure, certification, endurance, and total-BOM effects
are reviewed.

## Q-163: delivered Steam Machine trust capabilities

May VCG depend on TPM 2.0, owner-usable Secure Boot, a measured boot event log,
custom PCR policy enrollment, and persistence across stock SteamOS
update/repair on the delivered Steam Machine?

Safe default: treat every capability as absent until the exact delivered unit
and current SteamOS prove it. Valve's published product specifications do not
identify the TPM or its policy surface, and generic Steam TPM detection is not
hardware qualification. If stock SteamOS cannot preserve the required
protector across supported updates, keep device-only profiles unavailable on
that lane rather than replacing the OS or weakening boot policy implicitly.

## Q-164: vault policy-signing and protected-state authority

Which offline role authorizes new TPM boot measurements, and which privileged
platform component owns atomic compare-and-swap for vault, accepted-root,
package-generation, and system-update protected state?

Safe default: use a distinct offline vault-policy signing role under the
existing threshold update-root ceremony and one narrow platform adapter with
fixed independent state slots and a global lock order. Admit both the retained
healthy and candidate A/B measurements before candidate boot, then retire an
old policy only after rollback no longer depends on it. Browser, profile,
package, and ordinary update inputs never select measurements or lower state.

## Q-165: destructive reset and service response

What physical/controller ceremony may destroy the only vault key, and what
should the console show after key-device loss, protected-state mismatch, or an
unrecoverable vault?

Safe default: require a deliberate local maintenance flow that names permanent
profile loss, unassigns preserved saves, destroys protector state before
filesystem cleanup, and then creates a visibly empty vault. A service center
may diagnose hardware but receives no recovery key and cannot restore
profiles. Rollback/substitution mismatches remain quarantined until that
explicit destructive flow; never lower protected state or silently adopt an
older card.

## Q-166: cryptographic compliance target

Must the first family build use a FIPS-validated cryptographic module or meet
another procurement/regulatory cryptographic profile beyond the selected
RFC 5869 HKDF-SHA-256 and RFC 8452 AES-256-GCM-SIV construction?

Safe default: require independent security review, published algorithm test
vectors, pinned maintained dependencies, constant-time verification, and
software-composition evidence, but do not claim FIPS validation. If a launch
customer or jurisdiction requires a validated module, select that constraint
before implementing the on-disk format because it may require another
versioned algorithm suite and platform library.
