# Owner questions: microphone disablement — 2026-07-25

The I-179 plan is safely blocked without these answers. None of the defaults
below authorizes hardware purchase, OS mutation, microphone access, or audio
collection.

## Exact target images and hardware

Which Raspberry Pi OS image, SteamOS build and machine, Windows build and host,
and exact bundled-camera revision should form the three qualification rows?

Safe default:

- use immutable image/build identifiers and normalized configuration digests;
- bind the received camera part number, revision, USB descriptors, and cable or
  hub path before changing policy;
- rerun the complete row when the camera firmware, USB identity, OS image,
  kernel, audio stack, sandbox, browser, or package runtime changes; and
- do not treat evidence from an owned Windows desk host as SteamOS or Pi proof.

## Enforcement mechanism per platform

Must the microphone function be disabled at USB/driver discovery, hidden from
the ordinary account, denied by the audio service, denied by the sandbox, or
all of these layers?

Safe default:

- apply defense in depth and require every planned layer to pass;
- prefer a platform-supported device or policy denial that takes effect before
  ordinary login;
- treat browser and package permissions as additional containment, not the OS
  boundary required by D-046;
- keep microphone access unavailable even when a hostile page receives a
  site-level permission grant; and
- reject mute-only, silence-only, UI-only, or application-request-only proof.

## Administrative diagnostic path

Should the bundled microphone ever be available to a local administrator for
hardware diagnostics?

Safe default:

- provide no bundled-microphone diagnostic path in version 1;
- prefer a separate explicitly attached service microphone if audio diagnosis
  later becomes necessary;
- never let developer mode, a game, a profile, or a remote support session
  enable capture;
- if an exception is later approved, require local physical confirmation,
  visible disclosure and indication, a short fixed expiry, no persistence
  across reboot, and a path-free audit record; and
- rerun update, rollback, recovery, and reset abuse cases for that exception.

## Attempts, timeouts, and campaign duration

How many valid attempts per one of the 192 cells are required, what bounded
timeout proves denial, and is a sustained soak required?

Safe default:

- require repeated cold and warm attempts rather than one UI observation;
- pre-register one timeout per platform API before execution;
- count timeouts, crashes, missing probes, and harness errors as incomplete,
  never as denied capture;
- include a sustained ordinary-user probe window after the discrete matrix; and
- do not choose counts from an early run or stop after the first passing result.

## Failed-protection handling

What must the harness do if a probe unexpectedly receives an audio track or
buffer?

Safe default:

- stop at the first returned buffer;
- record only the target/cell identity, bounded denial-failure code, byte count,
  monotonic timing, and hash-bound configuration;
- do not inspect, play, persist, transmit, transcribe, fingerprint, or include
  the bytes in crash/support evidence;
- invalidate the cell and target row until the policy and harness are reviewed;
  and
- assume household speech may have been exposed even when the buffer appears
  silent.

## Update and recovery ownership

Which service owns reapplying and checking the policy during update, rollback,
recovery, factory reset, and camera replug?

Safe default:

- make the privileged OS configuration service the sole owner;
- apply and verify the denial before ordinary login, launcher start, tracker
  start, or game launch;
- fail closed with a visible bounded diagnostic when the policy cannot be
  verified;
- do not let a recovery image or factory reset silently restore the vendor
  microphone default; and
- bind policy state into update qualification and rollback evidence.

## Evidence publication

May internal evidence contain platform paths, device names, user names, command
output, or captured provider messages?

Safe default:

- release only closed target/cell identifiers, normalized configuration
  digests, bounded codes, counters, timings, and zero-byte assertions;
- retain no raw audio, PCM hashes, transcripts, voiceprints, identifiers, free
  text, absolute paths, or arbitrary provider text; and
- keep any necessary privileged command transcript in a separately reviewed,
  access-controlled internal record rather than the product evidence artifact.
