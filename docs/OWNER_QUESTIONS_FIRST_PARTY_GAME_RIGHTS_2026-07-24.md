# Owner questions: first-party game rights

Date opened: 2026-07-24

Related work: I-095, I-104, I-138, Q-051, D-013, D-051, D-056

The exact-head screen records zero games approved for offline redistribution.
Until the questions below are answered and reviewed, keep every game remote
only and do not copy its code or content into a signed VCG package.

## FPR-001: accountable authorization owner

Who has authority to approve source and content redistribution for each of the
23 first-party titles, and who performs the independent release review?

Safe default: record a named role and dated approval per exact source/artifact,
not a blanket inference from repository organization membership. Require a
different qualified reviewer for final release closure where practical.

## FPR-002: license or private authorization

Should the 20 repositories without any observed grant receive an explicit
public license, or remain privately licensed to VCG under written owner
authorization?

Safe default: use a standard SPDX-recognized repository license when public
open-source redistribution is intended. If a title must remain proprietary,
store a durable internal authorization record that identifies exact code,
content, versions, territories, permitted modifications, distribution
channels, sublicensing limits, and termination behavior.

## FPR-003: repository-wide license scope

Does a new root license apply to all historical contributions and every
tracked file, or are contributor, copied, generated, commissioned, and
third-party materials excluded?

Safe default: do not add a broad license until authorship and inbound rights
are confirmed. Use a file-level provenance inventory and explicit exclusions
where one repository-wide grant would overstate authority.

## FPR-004: VibeGear2 assets

Who owns or licenses the 156 image-like and 51 audio-like files currently
screened in VibeGear2, and which notices/source links are required?

Safe default: treat the root MIT text as code evidence only until each asset
family has authorship, source, license, modification, and attribution records.
Do not assume an asset is MIT merely because it sits beside MIT code.

## FPR-005: Clankers upstream design document

Which exact Clankers paths derive from or reproduce the upstream game design
document that the repository license explicitly excludes?

Safe default: keep the title blocked. Obtain authorization from the document
author or remove/rewrite the excluded material with documented independent
provenance, then have the resulting scope reviewed before packaging.

## FPR-006: Block Punch Kick ISC declaration

Was Block Punch Kick intended to use the standard ISC license, and may a
reviewed full license file be added at the repository root?

Safe default: treat the package string as intent, not a complete grant. Confirm
the copyright holder and year, add the exact reviewed ISC text, and separately
review assets/title/dependencies before changing redistribution status.

## FPR-007: GoDig submodule

What repository and exact revision does GoDig's `dots` submodule identify, why
is it required, and what license/content obligations follow it?

Safe default: block package closure until the submodule URL/revision is
resolved, available, reproducibly fetched, included in the SBOM, and reviewed.
Do not silently omit it or substitute another revision.

## FPR-008: title and trademark authority

Which game names, logos, characters, and presentation marks are owned,
licensed, or merely descriptive, and may they be used in a downloadable DIY
distribution?

Safe default: perform a per-title review independent of code licensing.
Rename or remove marks that lack clear authority rather than treating a code
grant as trademark permission.

## FPR-009: source-to-deployment and package binding

Who can attest that an exact reviewed source revision corresponds to the live
deployment and, later, to each signed ARM64/x86-64 package?

Safe default: require reproducible build inputs, dependency locks, asset
manifests, deployment/build identifiers, artifact hashes, and signed release
metadata. A mutable URL or current repository head is not sufficient.

## FPR-010: notices and corresponding source

Who owns generation and verification of per-game notices, source offers,
license files, dependency SBOMs, and modification disclosures?

Safe default: make this a blocking release role with deterministic gates on
both architectures. Do not rely on a README link or upstream website remaining
available.

## FPR-011: community entries

Who supplies source, rights, submitter identity, removal contact, and exact
origin/version approval for Asymptotic Bitrot, Bone Cleaver, and Vibeman
(Hangman)?

Safe default: keep them outside first-party treatment. Admit only through the
version/origin-scoped curated-community process; do not mirror or package them
without explicit distribution authority.
