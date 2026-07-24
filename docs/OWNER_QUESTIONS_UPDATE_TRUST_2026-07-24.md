# Owner Questions: Update Trust

The I-112 verifier can advance safely without these selections. Production provisioning and a physical recovery drill cannot.

## 1. Production channels

Should the first supported release expose only `stable` plus a separately signed offline `recovery` channel, or is a user-selectable preview/beta channel required?

Safe default: ship only `stable` and operator-only `recovery`. Do not add a preview channel until its downgrade, support, data-migration, rollback, and user-disclosure behavior is independently defined.

## 2. Root and online thresholds

How many independent root custodians exist, what threshold can they reliably assemble during an incident, and which online roles require more than one signer?

Safe default: use multiple independently held offline root keys with a threshold greater than one, keep each private key and backup physically separate, and use distinct online keys for system images, catalogs, package releases, and recovery. Choose exact counts only after a witnessed recovery rehearsal proves the team can meet them without sharing custody or bypassing checks.

## 3. Protected generation and time evidence

Which qualified hardware or verified-boot mechanism will protect the highest accepted root/artifact generations and trustworthy time floor on both Raspberry Pi and x86-64 tiers?

Safe default: treat ordinary writable files and browser/OS wall clocks as untrusted. When protected time is unavailable, deny new update acceptance while continuing the last healthy installed version. Do not select a secure element, TPM, or remote time-attestation design until it is supported on both target images and survives replacement-card recovery.

These remain owner/security/operations selections under Q-069, I-112, I-113, and I-141.
