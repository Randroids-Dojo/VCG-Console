# Owner questions: display and audio settings — 2026-07-25

The controller-first browser rehearsal is complete without these answers. It
does not authorize a native settings service, persist hardware choices, or
qualify any physical display or audio path.

## Supported display modes and rollback

Which exact output modes may the console offer on each tier, and what automatic
rollback interval applies when the television does not visibly confirm a
change?

Safe default:

- prefer the current known-working mode and do not expose arbitrary modelines;
- require an authenticated native service to enumerate a closed supported set;
- preview, apply provisionally, require controller confirmation, and roll back
  automatically after a short bounded interval;
- preserve a controller-operable low-risk recovery mode after reboot; and
- record requested/applied/confirmed as separate states without claiming the
  physical screen displayed them.

## Resolution, refresh, HDR, color, and overscan scope

Should version 1 expose resolution/refresh selection, HDR/color controls,
overscan/safe-area adjustment, or only report a qualified automatic choice?

Safe default:

- start with one qualified automatic output per target television class;
- keep HDR disabled unless end-to-end color and latency tests justify it;
- use overscan adjustment only after the exact TV path proves it is needed;
- keep the 5% browser guide a diagnostic preview rather than a stored crop; and
- do not treat EDID, compositor state, screenshots, or capture cards alone as
  proof of physical-TV appearance.

## Audio output and volume ownership

Which outputs may be selected—HDMI television, receiver, USB, Bluetooth, or
analog—and which layer owns master volume and mute?

Safe default:

- begin with the platform system-default output and a visible unverified label;
- avoid output switching until reconnect, wake, HDMI hot-plug, and failure
  recovery are controller-safe;
- cap test cues conservatively and do not use them as loudness calibration;
- never infer speaker/channel presence from successful Web Audio playback; and
- keep game, UI cue, and future accessibility speech levels distinct.

## Channel and latency qualification

Is stereo the only version-1 contract, and what lip-sync/gameplay latency gates
apply to HDMI, receivers, televisions, and Bluetooth paths?

Safe default:

- qualify stereo first on the exact target TV and any supported receiver path;
- leave surround and Bluetooth audio unsupported until channel mapping,
  reconnect, drift, and latency are measured;
- publish audio latency separately from camera-to-action and display latency;
  and
- include silence, clipping, left/right swap, wake, hot-plug, and 60-minute soak
  cases.

## Persistence and privilege

Are display and audio choices device-wide, profile-specific, or deliberately
nonpersistent, and which changes require local administration?

Safe default:

- keep hardware routing and display mode device-wide;
- let accessibility cue preferences remain independently available before
  profile selection;
- require local administrative confirmation for risky mode/output changes;
- persist only closed versioned values through the native service; and
- make rejected, stale, or unavailable stored values visible before restoring
  safe defaults.

No equipment has been ordered and no physical TV or audio session has been
scheduled.
