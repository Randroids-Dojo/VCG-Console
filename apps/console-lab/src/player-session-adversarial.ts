import {
  PlayerSessionController,
  type PlayerSessionEvent,
  type PlayerSessionSnapshot,
  type PlayerSlot,
  type TrackActionCompletion,
} from "./player-session";

export const PLAYER_SESSION_ADVERSARIAL_FIXTURE_VERSION =
  "player-session-adversarial-synthetic/v1" as const;

export const PLAYER_SESSION_INTERFERENCE_CLASSES = [
  "spectator",
  "pet",
  "mirror",
  "television-person",
  "passerby",
] as const;

export type PlayerSessionInterferenceClass =
  (typeof PLAYER_SESSION_INTERFERENCE_CLASSES)[number];

type ActorRole =
  | "primary-player"
  | "second-player"
  | "replacement-player"
  | PlayerSessionInterferenceClass;

export interface PlayerSessionAdversarialCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface PlayerSessionAdversarialMetrics {
  falseCandidateObservations: number;
  falseJoins: number;
  falseControls: number;
  unintendedTakeovers: number;
  falseActions: number;
  explicitTakeovers: number;
}

export interface PlayerSessionAdversarialScenario {
  id: string;
  title: string;
  interferenceClasses: PlayerSessionInterferenceClass[];
  checks: PlayerSessionAdversarialCheck[];
  metrics: PlayerSessionAdversarialMetrics;
  finalPhase: PlayerSessionSnapshot["phase"];
}

export interface PlayerSessionAdversarialReport {
  schemaVersion: typeof PLAYER_SESSION_ADVERSARIAL_FIXTURE_VERSION;
  source: "camera-free synthetic tracks";
  scenarios: PlayerSessionAdversarialScenario[];
  coveredInterferenceClasses: PlayerSessionInterferenceClass[];
  totals: PlayerSessionAdversarialMetrics;
  passed: boolean;
  qualificationBoundary: string;
}

const TRACKS = {
  primary: "fixture-player-primary",
  second: "fixture-player-second",
  replacement: "fixture-player-replacement",
  spectator: "fixture-spectator",
  pet: "fixture-pet",
  mirror: "fixture-mirror",
  televisionPerson: "fixture-television-person",
  passerby: "fixture-passerby",
} as const;

const ACTOR_ROLES = new Map<string, ActorRole>([
  [TRACKS.primary, "primary-player"],
  [TRACKS.second, "second-player"],
  [TRACKS.replacement, "replacement-player"],
  [TRACKS.spectator, "spectator"],
  [TRACKS.pet, "pet"],
  [TRACKS.mirror, "mirror"],
  [TRACKS.televisionPerson, "television-person"],
  [TRACKS.passerby, "passerby"],
]);

export function runPlayerSessionAdversarialRehearsal():
  PlayerSessionAdversarialReport {
  const scenarios = [
    passiveSpectatorScenario(),
    householdInterferenceScenario(),
    lossAndPasserbyScenario(),
    deliberateReplacementScenario(),
    multiplayerRecoveryScenario(),
  ];
  const coveredInterferenceClasses = PLAYER_SESSION_INTERFERENCE_CLASSES.filter(
    (interferenceClass) =>
      scenarios.some((scenario) =>
        scenario.interferenceClasses.includes(interferenceClass),
      ),
  );
  const totals = scenarios.reduce<PlayerSessionAdversarialMetrics>(
    (total, scenario) => addMetrics(total, scenario.metrics),
    emptyMetrics(),
  );
  return {
    schemaVersion: PLAYER_SESSION_ADVERSARIAL_FIXTURE_VERSION,
    source: "camera-free synthetic tracks",
    scenarios,
    coveredInterferenceClasses,
    totals,
    passed:
      coveredInterferenceClasses.length ===
        PLAYER_SESSION_INTERFERENCE_CLASSES.length &&
      scenarios.every(
        (scenario) =>
          scenario.checks.every((check) => check.passed) &&
          hasNoAuthorityFailures(scenario.metrics),
      ),
    qualificationBoundary:
      "Synthetic state-machine evidence only; no person, animal, mirror, television, room, camera, tracker, or target-hardware qualification has run.",
  };
}

class ScenarioProbe {
  readonly session: PlayerSessionController;
  readonly checks: PlayerSessionAdversarialCheck[] = [];
  readonly interferenceClasses = new Set<PlayerSessionInterferenceClass>();
  readonly metrics = emptyMetrics();

  constructor(maxPlayers: 1 | 2 = 1) {
    this.session = new PlayerSessionController({ maxPlayers });
  }

  observe(nowMs: number, trackIds: readonly string[]): PlayerSessionEvent[] {
    for (const trackId of trackIds) {
      const role = actorRole(trackId);
      if (isInterference(role)) {
        this.interferenceClasses.add(role);
        this.metrics.falseCandidateObservations += 1;
      }
    }
    const before = joinedTracks(this.session.snapshot());
    const events = this.session.observe(nowMs, trackIds);
    const after = joinedTracks(this.session.snapshot());
    if (!sameJoinedTracks(before, after)) {
      this.metrics.unintendedTakeovers += 1;
    }
    this.auditJoinedActors();
    return events;
  }

  join(trackId: string): PlayerSessionEvent {
    const event = this.session.join(trackId);
    this.auditJoinedActors();
    return event;
  }

  authority(trackId: string): PlayerSlot | undefined {
    const slot = this.session.authorizeGameplayAction(trackId);
    if (slot !== undefined && isInterference(actorRole(trackId))) {
      this.metrics.falseControls += 1;
    }
    return slot;
  }

  openPauseForTracks(
    completions: readonly TrackActionCompletion[],
  ): PlayerSessionEvent | undefined {
    const interferenceOnly =
      completions.length > 0 &&
      completions.every(({ trackId }) => isInterference(actorRole(trackId)));
    const event = this.session.openPauseForTracks(completions);
    if (interferenceOnly && event?.type === "pause-opened") {
      this.metrics.falseActions += 1;
    }
    return event;
  }

  resumeExplicit(
    trackId: string,
    keepSlots?: readonly PlayerSlot[],
  ): PlayerSessionEvent {
    const event =
      keepSlots === undefined
        ? this.session.resumeRecovery(trackId)
        : this.session.resumeRecovery(trackId, keepSlots);
    if (event.type === "recovery-resumed" && event.takeover) {
      this.metrics.explicitTakeovers += 1;
    }
    this.auditJoinedActors();
    return event;
  }

  check(id: string, passed: boolean, detail: string): void {
    this.checks.push({ id, passed, detail });
  }

  result(
    id: string,
    title: string,
  ): PlayerSessionAdversarialScenario {
    return {
      id,
      title,
      interferenceClasses: PLAYER_SESSION_INTERFERENCE_CLASSES.filter(
        (interferenceClass) =>
          this.interferenceClasses.has(interferenceClass),
      ),
      checks: [...this.checks],
      metrics: { ...this.metrics },
      finalPhase: this.session.snapshot().phase,
    };
  }

  auditJoinedActors(): void {
    const falseJoins = this.session
      .snapshot()
      .players.filter(({ trackId }) => isInterference(actorRole(trackId)))
      .length;
    this.metrics.falseJoins = Math.max(this.metrics.falseJoins, falseJoins);
  }
}

function passiveSpectatorScenario(): PlayerSessionAdversarialScenario {
  const probe = new ScenarioProbe();
  probe.observe(0, [TRACKS.spectator]);
  probe.check(
    "passive-detection-no-join",
    probe.session.snapshot().players.length === 0,
    "A visible spectator remains an unassigned candidate.",
  );
  probe.check(
    "spectator-no-control",
    probe.authority(TRACKS.spectator) === undefined,
    "The spectator has no gameplay slot.",
  );
  probe.check(
    "spectator-action-ignored",
    probe.openPauseForTracks([
      { trackId: TRACKS.spectator, completedAtMs: 10 },
    ]) === undefined,
    "A spectator-only pause completion cannot open the overlay.",
  );
  return probe.result(
    "passive-spectator",
    "Passive spectator detection grants no authority",
  );
}

function householdInterferenceScenario(): PlayerSessionAdversarialScenario {
  const probe = new ScenarioProbe();
  probe.observe(0, [TRACKS.primary]);
  probe.join(TRACKS.primary);
  probe.observe(100, [
    TRACKS.primary,
    TRACKS.pet,
    TRACKS.mirror,
    TRACKS.televisionPerson,
  ]);
  const outsiders = [
    TRACKS.pet,
    TRACKS.mirror,
    TRACKS.televisionPerson,
  ];
  probe.check(
    "joined-track-stable",
    probe.session.snapshot().players[0]?.trackId === TRACKS.primary,
    "Pet, mirror, and television detections do not replace Player 1.",
  );
  probe.check(
    "outsiders-no-control",
    outsiders.every((trackId) => probe.authority(trackId) === undefined),
    "No household interference track receives gameplay authority.",
  );
  probe.check(
    "outsider-actions-ignored",
    probe.openPauseForTracks(
      outsiders.map((trackId, index) => ({
        trackId,
        completedAtMs: 110 + index,
      })),
    ) === undefined,
    "Interference-only action completions cannot open Pause.",
  );
  probe.check(
    "joined-action-wins",
    probe.openPauseForTracks([
      { trackId: TRACKS.pet, completedAtMs: 100 },
      { trackId: TRACKS.primary, completedAtMs: 120 },
    ])?.type === "pause-opened",
    "The exact joined player can still open Pause while interference is visible.",
  );
  return probe.result(
    "pet-mirror-television",
    "Household interference cannot act for a joined player",
  );
}

function lossAndPasserbyScenario(): PlayerSessionAdversarialScenario {
  const probe = new ScenarioProbe();
  probe.observe(0, [TRACKS.primary]);
  probe.join(TRACKS.primary);
  probe.observe(100, []);
  probe.observe(400, []);
  probe.observe(1_000, [TRACKS.passerby]);
  probe.check(
    "passerby-no-silent-recovery",
    probe.session.snapshot().phase === "frozen",
    "A different visible track cannot satisfy silent reacquisition.",
  );
  probe.observe(2_400, [TRACKS.passerby]);
  probe.check(
    "recovery-stays-frozen",
    probe.session.snapshot().phase === "recovery",
    "Recovery requires an explicit Resume after the same-track window.",
  );
  probe.check(
    "passerby-no-recovery-control",
    probe.authority(TRACKS.passerby) === undefined,
    "A passerby has no gameplay authority while recovery is open.",
  );
  probe.observe(2_500, [TRACKS.primary, TRACKS.passerby]);
  const resumed = probe.resumeExplicit(TRACKS.primary);
  probe.check(
    "original-player-explicit-resume",
    resumed.type === "recovery-resumed" &&
      !resumed.takeover &&
      probe.session.snapshot().players[0]?.trackId === TRACKS.primary,
    "Explicit Resume restores the selected original track without takeover.",
  );
  return probe.result(
    "passerby-during-loss",
    "A passerby cannot silently recover or control a lost session",
  );
}

function deliberateReplacementScenario(): PlayerSessionAdversarialScenario {
  const probe = new ScenarioProbe();
  probe.observe(0, [TRACKS.primary]);
  probe.join(TRACKS.primary);
  probe.observe(100, []);
  probe.observe(400, []);
  probe.observe(2_400, [TRACKS.replacement, TRACKS.spectator]);
  probe.check(
    "replacement-does-not-auto-takeover",
    probe.session.snapshot().players[0]?.trackId === TRACKS.primary &&
      probe.session.snapshot().phase === "recovery",
    "A replacement player remains a candidate until Resume.",
  );
  const resumed = probe.resumeExplicit(TRACKS.replacement);
  probe.check(
    "explicit-one-player-takeover",
    resumed.type === "recovery-resumed" &&
      resumed.takeover &&
      probe.session.snapshot().players[0]?.trackId === TRACKS.replacement,
    "Explicit Resume transfers the one-player slot to the selected replacement.",
  );
  return probe.result(
    "deliberate-one-player-takeover",
    "Only explicit Resume transfers a one-player session",
  );
}

function multiplayerRecoveryScenario(): PlayerSessionAdversarialScenario {
  const probe = new ScenarioProbe(2);
  probe.observe(0, [TRACKS.primary, TRACKS.second]);
  probe.join(TRACKS.primary);
  probe.join(TRACKS.second);
  probe.observe(100, [TRACKS.primary, TRACKS.spectator]);
  probe.observe(400, [TRACKS.primary, TRACKS.spectator]);
  probe.observe(2_400, [
    TRACKS.primary,
    TRACKS.spectator,
    TRACKS.passerby,
  ]);
  let retainedRosterRejected = false;
  try {
    probe.resumeExplicit(TRACKS.primary);
  } catch {
    retainedRosterRejected = true;
  }
  probe.check(
    "missing-player-not-substituted",
    retainedRosterRejected &&
      probe.session.snapshot().players[1]?.trackId === TRACKS.second,
    "Spectator and passerby tracks cannot substitute for retained Player 2.",
  );
  const resumed = probe.resumeExplicit(TRACKS.primary, [1]);
  probe.check(
    "explicit-roster-reduction",
    resumed.type === "recovery-resumed" &&
      !resumed.takeover &&
      resumed.removedSlots.length === 1 &&
      resumed.removedSlots[0] === 2,
    "A deliberate non-empty roster reduction resumes without outsider takeover.",
  );
  return probe.result(
    "multiplayer-outsider-recovery",
    "Multiplayer recovery refuses outsider substitution",
  );
}

function emptyMetrics(): PlayerSessionAdversarialMetrics {
  return {
    falseCandidateObservations: 0,
    falseJoins: 0,
    falseControls: 0,
    unintendedTakeovers: 0,
    falseActions: 0,
    explicitTakeovers: 0,
  };
}

function addMetrics(
  left: PlayerSessionAdversarialMetrics,
  right: PlayerSessionAdversarialMetrics,
): PlayerSessionAdversarialMetrics {
  return {
    falseCandidateObservations:
      left.falseCandidateObservations + right.falseCandidateObservations,
    falseJoins: left.falseJoins + right.falseJoins,
    falseControls: left.falseControls + right.falseControls,
    unintendedTakeovers:
      left.unintendedTakeovers + right.unintendedTakeovers,
    falseActions: left.falseActions + right.falseActions,
    explicitTakeovers: left.explicitTakeovers + right.explicitTakeovers,
  };
}

function hasNoAuthorityFailures(
  metrics: PlayerSessionAdversarialMetrics,
): boolean {
  return (
    metrics.falseJoins === 0 &&
    metrics.falseControls === 0 &&
    metrics.unintendedTakeovers === 0 &&
    metrics.falseActions === 0
  );
}

function actorRole(trackId: string): ActorRole {
  const role = ACTOR_ROLES.get(trackId);
  if (!role) throw new Error(`unknown synthetic actor track: ${trackId}`);
  return role;
}

function isInterference(
  role: ActorRole,
): role is PlayerSessionInterferenceClass {
  return PLAYER_SESSION_INTERFERENCE_CLASSES.some(
    (candidate) => candidate === role,
  );
}

function joinedTracks(
  snapshot: PlayerSessionSnapshot,
): ReadonlyMap<PlayerSlot, string> {
  return new Map(
    snapshot.players.map(({ slot, trackId }) => [slot, trackId]),
  );
}

function sameJoinedTracks(
  left: ReadonlyMap<PlayerSlot, string>,
  right: ReadonlyMap<PlayerSlot, string>,
): boolean {
  return (
    left.size === right.size &&
    [...left].every(
      ([slot, trackId]) => right.get(slot) === trackId,
    )
  );
}
