# Owner Questions: Storage Layout

The I-111 software planner can advance without these answers. They remain visible here so implementation does not silently decide product behavior.

## 1. Factory-reset installed content

Should a household factory reset delete signed production games and installed retro content, or may either library remain while profiles, saves, unassigned progress, portraits, calibration, developer builds, logs, caches, and staging are destroyed?

Safe default for a literal factory reset: return to a base-only trusted state, delete all writable installed content, and disclose that device-local saves and entitled retro copies are permanently lost. If offline reinstallation burden is unacceptable, define a separately named “Reset Personal Data” operation that may retain independently verified production packages while still deleting every player-linked or developer domain. Do not call the narrower operation a factory reset.

This affects I-111, I-113, I-185 through I-191, and I-200.

## 2. Low-space cleanup experience

When ordinary writes reach reserved recovery headroom, should the console only block the operation and offer reviewed cleanup choices, or may it automatically trim bounded logs and disposable caches first?

Safe default: policy-manage logs and caches within declared caps, recover only abandoned staging through its owning transaction coordinator, and never automatically delete saves, profiles, production packages, developer packages, or retro content. If space is still insufficient, show the exact required/available class and controller-accessible choices rather than silently reclaiming durable content.

The byte thresholds should come from the selected card, measured update peaks, and real household content rather than preference.
