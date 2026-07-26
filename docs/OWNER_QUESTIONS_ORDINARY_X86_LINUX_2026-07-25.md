# Owner questions: ordinary x86-64 Linux premium reference — 2026-07-25

I-207 now has a strict blocked qualification plan. These questions control the
choices that cannot be inferred safely. Q-203 separately retains authority over
any disk, partition, boot-order, Secure Boot, or native-Linux installation
change.

## Q-267: exact ordinary x86-64 Linux reference host

Which exact physical machine should become the ordinary x86-64 native-Linux
premium reference?

Candidate paths:

1. reuse the owned Ryzen 9 5900X / RTX 3080 Ti workstation with a separately
   reviewed disk and recovery plan;
2. select or borrow another already-owned ordinary x86-64 PC; or
3. authorize a later purchase only after the current end-to-end x86 workload
   gate and a separate delivered-cost comparison.

Proposed default:

- leave the reference unselected;
- retain the Ryzen/RTX machine as development evidence only;
- do not count Windows or WSL2 as native Linux;
- do not substitute the optional Steam Machine; and
- perform no purchase, disk, boot, firmware, or operating-system mutation.

After a host is selected, Q-203 still requires review of its exact disk role,
backups, recovery media, image, partition plan, boot order, and Secure Boot
state before a separate mutation authorization.

## Q-268: exact native-Linux and living-room runtime tuple

Which exact native-Linux tuple should be frozen for the selected host?

The answer needs to name or delegate selection of:

- distribution/release and installation-image SHA-256;
- kernel, firmware, bootloader, and Secure Boot policy;
- GPU driver, display server, compositor, browser, and service manager;
- SDL build and controller database;
- Node, pnpm, Rust, launcher, native-host, tracker/model, and package-runtime
  versions; and
- the supported rebuild/update channel and retention window.

Proposed default:

- do not select versions before Q-267 identifies the hardware;
- prepare a reproducible pinned manifest and cold-rebuild procedure after that
  selection;
- require an accountless boot-to-VCG path independent of Steam; and
- compare candidate compositor/browser lanes under Q-047 rather than choosing
  one from desk load evidence.

## Q-269: premium-tier performance, power, thermal, acoustic, and recovery gates

What numeric gates and repetition counts should qualify the premium ordinary-PC
row beyond the already-fixed D-106, D-110, D-130, and 100-cycle suspend rules?

The missing values are:

- minimum pose FPS and game FPS;
- maximum game-frame p95 and capture/pose drop ratios;
- maximum sustained wall, idle, and suspend power;
- maximum sustained CPU and GPU temperatures plus throttle policy;
- maximum one-metre acoustic output and tonal/vibration rejection criteria; and
- minimum update-interruption, rollback, blank-drive recovery, and fault
  attempts per class.

Proposed default:

- keep every missing value `null` and make execution ineligible;
- do not apply D-108's 35 dBA lower-cost-enclosure limit to the premium PC;
- freeze all thresholds, repetitions, invalid-attempt handling, and uncertainty
  rules before observing qualification results; and
- require each workload/fault cell to pass without aggregate rescue.
