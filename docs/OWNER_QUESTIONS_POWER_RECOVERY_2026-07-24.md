# Owner Questions: Power and Recovery

These choices are intentionally not inferred by the policy prototype. The
current implementation remains safe without answers by exposing no native
power or recovery authority.

## Q-167: physical service-control design

Which physical interaction should qualify cold-boot service entry on the first
DIY enclosure?

Current conservative contract: use a dedicated service control sampled by the
privileged boot coordinator, require a qualified hold during cold boot and a
release before entering the non-destructive service environment, and never use
a controller, Motion gesture, browser action, network request, or ordinary
runtime power press as equivalent evidence.

Needed decision: exact switch/control, whether it is recessed or externally
accessible, boot timing and minimum hold, debounce/stuck-switch behavior,
visible progress/cancel feedback, and whether the same physical design is
required or merely behaviorally equivalent on the premium PC tier.

## Q-168: per-game idle disposition

What versioned manifest contract chooses between safe suspension/checkpointing
and complete game termination when the console enters quick idle?

Current conservative contract: the power coordinator accepts one
`game-stopped-or-suspended` acknowledgement but does not decide which titles
may suspend. Until a signed manifest vocabulary and adapter are qualified, a
game should be stopped and reaped rather than assumed resumable.

Needed decision: supported dispositions, default for an absent field, required
checkpoint/health evidence, timeout behavior, whether hosted pages may ever
retain a live session, and how a failed resume returns to the branded launcher
without corrupting saves or representing stale state as healthy.

## Q-169: service-environment authority

Which operations may the boot-only service environment expose, and which need
an additional credential or physical confirmation?

Current conservative contract: service entry alone is non-destructive.
Recovery requires a fresh physical service-button press and release after a
visible request. No browser, LAN, paired developer key, body/profile match, or
ordinary controller action supplies that final authority.

Needed decision: the exact read-only diagnostics allowed before
authentication; credential/recovery policy; whether network access is disabled
by default; separate confirmation for rollback, reflash, factory reset, key
destruction, or data deletion; and the permitted treatment of packages, retro
content, saves, profiles, portraits, calibration, and unassigned progress.

Related unresolved work: Q-069, Q-155 through Q-158, Q-162 through Q-166,
I-110 through I-113, I-186, and I-187.
