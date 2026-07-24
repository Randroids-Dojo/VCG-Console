# Child and family privacy review brief

Status: engineering product facts and launch blockers for counsel review; no
legal conclusion

Date: 2026-07-24

Authority: I-140, Q-075, Q-098, Q-099

VCG explicitly targets school-age children and adults for its first complete
body-play experience. A networked family beta therefore cannot rely on a
general-audience assumption or a generic privacy policy. This brief freezes
the current product facts, data flows, third parties, and safe beta boundary
for qualified legal/privacy review.

The exact operator, business model, jurisdictions, distribution markets, age
range, school use, and hosted-game relationships are not selected. Those facts
can change which rules apply. Nothing below is legal advice.

## Current official-reference baseline

As of this review:

- The US FTC's current
  [COPPA six-step plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
  says covered child-directed or actual-knowledge online services must address
  notice, verifiable parental consent, parental review/deletion rights,
  security, data minimization, and a written retention/deletion policy. It
  lists internet-enabled gaming platforms and network-connected games as
  online services and includes a child's image/voice and qualifying biometric
  identifiers in personal information.
- The FTC's
  [2025 final-rule summary](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data)
  records separate opt-in consent for targeted-advertising/other third-party
  disclosures, explicit limits against indefinite retention, and expansion
  of personal information to biometric identifiers. The final amendments were
  published at
  [90 FR 16918](https://www.govinfo.gov/app/details/FR-2025-04-22/2025-05904);
  current counsel must verify operative dates and exact text rather than rely
  on a project summary.
- The UK ICO says its
  [Children's code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/)
  applies to online services likely to be accessed by children and emphasizes
  best interests, DPIAs, age-appropriate application, high-privacy defaults,
  minimization, limited sharing, profiling controls, transparent parental
  controls, and avoiding nudges that weaken privacy.
- The European Commission's
  [children's-data guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en)
  says consent-based online processing can require parent/guardian consent
  below a Member-State threshold between 13 and 16, reasonable verification,
  and child-accessible plain language. The exact Member State and lawful basis
  still require review.

These references are issue spotters. US state, Canadian, UK/EU national,
consumer, biometric, health/fitness, education, advertising, communications,
security-breach, accessibility, and child-safety obligations require
market-specific counsel.

## Frozen product facts

| Fact | Current state |
|---|---|
| Intended users | School-age children and adults primarily playing standing; seated/limited-range remains an explicit accessibility lane |
| Appliance model | Shared living-room console with guest/local profiles; no per-profile credential; body matching is not authentication |
| Core availability | Launcher, local profiles, Motion, installed packages, and retro mode are required to work offline without Steam/cloud account |
| Camera | Wide RGB camera baseline; microphone capture disabled by default; application requests `audio: false` |
| Motion processing | Browser prototype processes locally and projects derived skeleton/actions; active synthetic-camera evidence finds no external/mutating request or persistent browser store |
| Raw pixels | Volatile application path only in normal mode; no application serialization/export/network edge; native/OS/GPU/crash/swap guarantees remain unqualified |
| Skeletons | Current frame plus bounded 600-frame/128-health-event volatile trace; explicit developer-style local export exists |
| Portrait | Planned deliberately captured local still per profile; browser rehearsal uses synthetic handles and no camera/storage |
| Body matching | Planned local automatic appearance-free calibration/body-profile prediction with mandatory visible confirmation; biometric-like privacy risk; not implemented |
| Calibration/accessibility | Persistent calibration planned; accessibility prototype stores six device-wide preferences separately and does not grant game/host authority |
| Profiles | Opaque IDs; duplicate display names allowed; any local console user may enter management and deliberately delete; no credential or body-match authentication |
| Saves | Device-local; no console backup/export/migration/cloud; compatible saves intended to become unassigned on profile deletion; hosted-service data remains separate |
| Diagnostics | Current browser buffer is newest 256 stable codes, volatile, path/ID/free-text-free; exact local export requires admin confirmation; no upload |
| Accounts/social | Core VCG requires no account. Some hosted games may use Clerk, leaderboards, messages, generation, notifications, or other service data |
| Advertising/analytics | No VCG advertising, behavioral targeting, or automatic analytics/telemetry path is implemented or authorized |
| Network | Hosted games use exact remote origins; local shell assets are same-origin; paired-LAN developer/import and update services are planned separately |
| Data sale/sharing | No sale or targeted-advertising disclosure is selected; service/provider roles and contracts remain unclassified |
| Support | No remote support agent, listener, uploader, or reusable support credential; current exports are user-selected local files |

## Data and purpose inventory for review

| Data | Proposed purpose | Local/remote | Current beta disposition |
|---|---|---|---|
| Raw camera frames | Real-time pose inference | Local volatile | May be used only after native/target no-retention proof; never uploaded or logged |
| Derived skeleton/actions | Gameplay/control | Local; exact cooperative projection only | Volatile normal play; no general hosted-game access |
| Skeleton trace export | Developer diagnosis | User-managed local file | Developer/admin mode only pending final policy |
| Profile ID/display name | Local player selection | Device local | Opaque ID and optional bounded name; no network identifier reuse |
| Portrait | Profile recognition by household | Device-local planned vault | Disabled for networked beta until consent/legal/vault/deletion gates pass |
| Calibration/body-profile features | Adaptation and returning-player prediction | Device-local planned vault | Persistent automatic matching disabled for beta until accuracy/privacy/legal gates pass |
| Saves/scores | Local progress | Device local; hosted service separately | Local only by default; hosted title-specific facts and controls required |
| Diagnostic codes | Reliability/support | Device local/user export | Volatile closed-code buffer only; no automatic upload |
| IP/request/service account data | Deliver hosted games | Remote hosted service | Each service needs operator/provider role, purpose, retention, deletion, security, and child-access review |
| Update/import metadata | Appliance maintenance and user-entitled content | Local/approved update or paired LAN | Separate authority, minimization, retention, and notice required |

No purpose may silently expand into advertising, model training, generalized
analytics, social discovery, identity proof, or cross-title profiling.

## Safe networked-beta boundary

Until counsel approves a broader design, the networked family beta must:

1. keep core local play accountless and functional with the network removed;
2. disable real portraits and persistent automatic body-profile matching;
3. keep camera processing local, microphone capture disabled, and normal raw
   frame/skeleton persistence and egress absent;
4. expose no child profile, portrait, body/calibration feature, skeleton,
   local save, or diagnostic identifier to hosted games;
5. ship no VCG ads, targeted advertising, third-party analytics, social feed,
   chat, open posting, public leaderboard identity, push engagement, or
   automatic support/telemetry upload;
6. allow hosted titles only after a title-specific data/service inventory,
   audience classification, contract/role review, child-access decision,
   parent/child notice, deletion path, retention policy, and security review;
7. use high-privacy defaults, data minimization, short purpose-bound
   retention, no preselected optional sharing, and no nudge that weakens a
   privacy setting;
8. provide clear adult and age-appropriate child explanations before any
   collection plus persistent access to local controls;
9. keep profile management credential-free only if counsel accepts the
   household threat model; never represent body matching as parental
   authentication;
10. provide tested local reset/delete and accurate hosted-service guidance,
    without claiming that one deletes the other;
11. maintain one current processor/service/subprocessor and data-transfer
    register; and
12. block the beta if an intended market, age range, operator, lawful basis,
    consent method, or parent-rights workflow is unresolved.

This boundary does not itself establish compliance.

## Counsel fact requests

Counsel needs exact answers and evidence for:

- legal operator/controller/business identity, contact, and responsible
  privacy/security roles;
- commercial/nonprofit model, price/subscription/support/advertising facts,
  app-store/distributor roles, and schools/educational use;
- intended and reasonably likely ages by feature, marketing, visuals,
  language, catalog, and research recruitment;
- launch and support countries/states, cross-border data locations, and
  applicable age thresholds;
- every first/third-party service, SDK, endpoint, cookie/storage identifier,
  IP/log field, account, leaderboard, notification, email, payment, and
  support path;
- whether VCG or each hosted-game operator determines purpose/means and which
  agreements, assurances, deletion flows, and subprocessors apply;
- lawful basis for every purpose and exact parent/child notice/consent/assent,
  access, correction, deletion, withdrawal, appeal, and complaint flow;
- age/parent verification method and its own minimization/deletion/security
  burden;
- written retention schedules, security program, incident response, DPIA/
  child best-interests assessment, and vendor due diligence;
- biometric/portrait/body-feature classification and prohibitions by market;
  and
- exact product claims about health, fitness, accessibility, safety,
  development, learning, or child protection.

## Required engineering evidence before beta

- production native camera no-persistence/no-egress campaign including
  crashes, swap, GPU/driver, support bundles, and target Linux;
- data-flow and network observation on both targets with every service
  endpoint and request field reviewed;
- protected local profile/vault/save implementation with durable deletion and
  factory-reset evidence;
- child/adult-readable notice and consent/decline/withdraw/delete prototypes
  tested with safe focus and no coercive patterns;
- exact hosted-service account/leaderboard/message/notification behavior
  tested under child, guest, offline, account removal, and service failure;
- written retention/deletion table matching implemented timers, quotas,
  journals, backups, logs, and provider contracts;
- security threat model validation, breach/incident workflow, dependency and
  update ownership, and abuse-reporting/safety paths if interaction ships;
- research consent/assent and data-handling protocol separate from product
  telemetry; and
- dated qualified counsel approval for the exact release candidate, markets,
  data flows, notices, agreements, and operational procedures.

## Requalification triggers

Repeat legal/privacy review before adding or changing any account, cloud save,
social/chat/leaderboard identity, ad/analytics SDK, notification, email,
payment, voice input, portrait, body matching, health/fitness inference,
recording, persistent skeleton, support upload, remote administration,
school deployment, market, age range, service/provider, retention rule,
consent method, or privacy claim.
