# Owner questions: Pi HDMI video, audio and CEC

Date: 2026-07-25

Status: non-blocking for plan validation; blocking for I-027/I-028 execution

## PHDMI-001: exact physical chain

Which primary TV model/revision/firmware, HDMI port/settings, certified cable,
and optional receiver/soundbar are available? Record exact Pi/display/audio/
CEC software and room/viewing geometry without publishing stable serials.

## PHDMI-002: version-1 modes and rollback

Should 1080p60 SDR be the baseline, with 720p60 recovery and 4K60 SDR only a
headroom row? What visible confirmation and automatic rollback interval govern
mode changes? HDR remains disabled unless separately authorized and qualified.

## PHDMI-003: audio and physical-observation gates

What overscan, missed-frame/frame-time, audio-latency/drift, CEC command/wake,
hot-plug, FPS, temperature and power thresholds apply? Which pattern generator,
capture/timing, audio loopback, channel observer and uncertainty establish
physical video/audio rather than EDID, compositor or Web Audio inference?

## PHDMI-004: CEC policy and mutation authority

Which power, active-source, input, standby, volume and mute commands may the Pi
transmit, and when must it avoid fighting another source? Who may authorize
1,000 CEC cycles and TV mutations? Define bounded retries, address freshness,
fallback controls and stop conditions before execution.
