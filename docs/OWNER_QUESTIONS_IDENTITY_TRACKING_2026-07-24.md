# Owner questions: identity tracking

Date: 2026-07-24

The deterministic appearance-free comparison is complete without these
answers. They gate real-player evidence and any expansion of the privacy
surface. No answer is assumed.

## Q-215: consented paired crossing and occlusion evidence

May the I-057 identity comparison share the adult-first room session already
proposed under Q-212 and Q-214?

The useful session needs:

- the same source exposures or synchronized detector outputs for MediaPipe and
  RTMO;
- scripted two-player crossing, overlap, crouch, short occlusion, exit, and
  re-entry after one-player safety gates pass;
- independently labeled person identity, visibility, and detector
  duplicate/miss events;
- pre-registered tracker parameters and a held-out result segment;
- no raw-video retention by default;
- explicit consent, stop, deletion, access, and retention procedures; and
- no child participation until the separate Q-212 requirements are resolved.

Safe default:

- do not schedule or capture participants yet;
- rehearse data plumbing with the generated skeleton suite;
- coordinate one minimized session rather than duplicating recordings; and
- keep raw frames ephemeral unless you approve a specific encrypted
  retention/review/deletion plan.

## Q-216: appearance-derived re-identification boundary

Should VCG treat face, clothing, color-histogram, image-crop, or learned
appearance embeddings as outside the first product's identity-tracking
boundary?

The current implementation uses only normalized skeleton geometry, confidence,
short-lived motion state, and opaque session-local IDs. It deliberately gives
a returning person a new track after bounded expiry and relies on explicit
player-session recovery before authority returns.

Safe default:

- keep all production and research baselines appearance-free;
- collect no face/body crops or appearance embeddings;
- do not persist cross-session tracker identity;
- accept explicit recovery after long absence; and
- require a separate privacy/security review, consent model, retention policy,
  deletion proof, bias assessment, and owner decision before prototyping any
  appearance-derived alternative.

If appearance is not categorically excluded, please identify the exact
household benefit that would justify the added sensitive-data surface and the
maximum permitted lifetime and scope of any derived descriptor.
