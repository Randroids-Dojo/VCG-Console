export const PORTRAIT_COUNTDOWN_MS = 3_000;
export const PORTRAIT_SESSION_TTL_MS = 120_000;
export const PORTRAIT_MAX_PROFILES = 64;

export type PortraitCapturePhase = "idle" | "notice" | "countdown" | "preview";

export interface PortraitCaptureAttemptRef {
  sessionId: number;
  attempt: number;
  profileId: string;
}

export interface AcceptedPortrait {
  profileId: string;
  renderHandle: string;
}

export interface PortraitCaptureSnapshot {
  revision: number;
  phase: PortraitCapturePhase;
  profileId: string | null;
  attempt: number | null;
  countdownEndsAtMs: number | null;
  sessionExpiresAtMs: number | null;
  temporaryRenderHandle: string | null;
  acceptedPortraits: readonly Readonly<AcceptedPortrait>[];
}

export interface PortraitCommitPlan {
  kind: "accept-portrait";
  expectedRevision: number;
  sessionId: number;
  attempt: number;
  profileId: string;
  temporaryRenderHandle: string;
  replacedRenderHandle: string | null;
}

export interface PortraitDiscardResult {
  discardedTemporaryRenderHandle: string | null;
  preservedAcceptedRenderHandle: string | null;
  snapshot: PortraitCaptureSnapshot;
}

interface ActiveSession {
  id: number;
  profileId: string;
  attempt: number;
  openedAtMs: number;
  expiresAtMs: number;
  countdownEndsAtMs: number | null;
  temporaryRenderHandle: string | null;
}

const commitPlanKeys = [
  "attempt",
  "expectedRevision",
  "kind",
  "profileId",
  "replacedRenderHandle",
  "sessionId",
  "temporaryRenderHandle",
] as const;
const profileIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fixtureHandlePattern = /^portrait-fixture-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PortraitCaptureError extends Error {}

export class AcceptedPortraitCollection {
  readonly #accepted = new Map<string, string>();

  constructor(acceptedPortraits: readonly AcceptedPortrait[] = []) {
    if (acceptedPortraits.length > PORTRAIT_MAX_PROFILES) {
      throw new PortraitCaptureError("too many accepted portraits");
    }
    for (const portrait of acceptedPortraits) {
      validateProfileId(portrait.profileId);
      validateFixtureHandle(portrait.renderHandle);
      if (this.#accepted.has(portrait.profileId)) {
        throw new PortraitCaptureError("duplicate accepted portrait profile");
      }
      this.#accepted.set(portrait.profileId, portrait.renderHandle);
    }
  }

  snapshot(): readonly Readonly<AcceptedPortrait>[] {
    return Object.freeze(
      [...this.#accepted.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([profileId, renderHandle]) =>
          Object.freeze({ profileId, renderHandle }),
        ),
    );
  }

  portraitFor(profileId: string): string | null {
    validateProfileId(profileId);
    return this.#accepted.get(profileId) ?? null;
  }

  replaceExact(
    profileId: string,
    expectedRenderHandle: string | null,
    nextRenderHandle: string,
  ): string | null {
    validateProfileId(profileId);
    if (expectedRenderHandle !== null) validateFixtureHandle(expectedRenderHandle);
    validateFixtureHandle(nextRenderHandle);
    const current = this.#accepted.get(profileId) ?? null;
    if (current !== expectedRenderHandle) {
      throw new PortraitCaptureError("accepted portrait changed before commit");
    }
    if (current === null && this.#accepted.size >= PORTRAIT_MAX_PROFILES) {
      throw new PortraitCaptureError("too many accepted portraits");
    }
    this.#accepted.set(profileId, nextRenderHandle);
    return current;
  }

  removeExact(
    profileId: string,
    expectedRenderHandle: string | null,
  ): string | null {
    validateProfileId(profileId);
    if (expectedRenderHandle !== null) validateFixtureHandle(expectedRenderHandle);
    const current = this.#accepted.get(profileId) ?? null;
    if (current !== expectedRenderHandle) {
      throw new PortraitCaptureError("accepted portrait changed before removal");
    }
    if (current !== null) this.#accepted.delete(profileId);
    return current;
  }
}

export class PortraitCaptureController {
  #revision = 0;
  #phase: PortraitCapturePhase = "idle";
  #session: ActiveSession | null = null;
  #nextSessionId = 1;
  #lastNowMs = 0;
  readonly #accepted: AcceptedPortraitCollection;

  constructor(
    acceptedPortraits:
      | readonly AcceptedPortrait[]
      | AcceptedPortraitCollection = [],
  ) {
    this.#accepted = acceptedPortraits instanceof AcceptedPortraitCollection
      ? acceptedPortraits
      : new AcceptedPortraitCollection(acceptedPortraits);
  }

  snapshot(): PortraitCaptureSnapshot {
    const session = this.#session;
    return Object.freeze({
      revision: this.#revision,
      phase: this.#phase,
      profileId: session?.profileId ?? null,
      attempt: session?.attempt ?? null,
      countdownEndsAtMs: session?.countdownEndsAtMs ?? null,
      sessionExpiresAtMs: session?.expiresAtMs ?? null,
      temporaryRenderHandle: session?.temporaryRenderHandle ?? null,
      acceptedPortraits: this.#accepted.snapshot(),
    });
  }

  portraitFor(profileId: string): string | null {
    return this.#accepted.portraitFor(profileId);
  }

  open(profileId: string, nowMs: number): PortraitCaptureSnapshot {
    this.#observeTime(nowMs);
    validateProfileId(profileId);
    if (this.#phase !== "idle") {
      throw new PortraitCaptureError("another portrait session is active");
    }
    if (this.#nextSessionId > Number.MAX_SAFE_INTEGER) {
      throw new PortraitCaptureError("portrait session identifier exhausted");
    }
    this.#session = {
      id: this.#nextSessionId++,
      profileId,
      attempt: 0,
      openedAtMs: nowMs,
      expiresAtMs: nowMs + PORTRAIT_SESSION_TTL_MS,
      countdownEndsAtMs: null,
      temporaryRenderHandle: null,
    };
    this.#phase = "notice";
    this.#revision += 1;
    return this.snapshot();
  }

  beginCountdown(nowMs: number): PortraitCaptureAttemptRef {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "notice") {
      throw new PortraitCaptureError("countdown requires the dedicated notice");
    }
    session.attempt += 1;
    session.countdownEndsAtMs = nowMs + PORTRAIT_COUNTDOWN_MS;
    session.temporaryRenderHandle = null;
    this.#phase = "countdown";
    this.#revision += 1;
    return freezeAttemptRef(session);
  }

  completeSyntheticCapture(
    attempt: PortraitCaptureAttemptRef,
    renderHandle: string,
    nowMs: number,
  ): PortraitCaptureSnapshot {
    this.#observeTime(nowMs);
    validateAttemptRef(attempt);
    validateFixtureHandle(renderHandle);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "countdown" || session.countdownEndsAtMs === null) {
      throw new PortraitCaptureError("capture completion requires a countdown");
    }
    if (!sameAttempt(session, attempt)) {
      throw new PortraitCaptureError("stale portrait capture callback");
    }
    if (nowMs < session.countdownEndsAtMs) {
      throw new PortraitCaptureError("portrait countdown is not complete");
    }
    session.countdownEndsAtMs = null;
    session.temporaryRenderHandle = renderHandle;
    this.#phase = "preview";
    this.#revision += 1;
    return this.snapshot();
  }

  retake(nowMs: number): Readonly<{
    discardedTemporaryRenderHandle: string;
    attempt: PortraitCaptureAttemptRef;
    snapshot: PortraitCaptureSnapshot;
  }> {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "preview" || session.temporaryRenderHandle === null) {
      throw new PortraitCaptureError("retake requires a temporary preview");
    }
    const discardedTemporaryRenderHandle = session.temporaryRenderHandle;
    session.temporaryRenderHandle = null;
    session.attempt += 1;
    session.countdownEndsAtMs = nowMs + PORTRAIT_COUNTDOWN_MS;
    this.#phase = "countdown";
    this.#revision += 1;
    return Object.freeze({
      discardedTemporaryRenderHandle,
      attempt: freezeAttemptRef(session),
      snapshot: this.snapshot(),
    });
  }

  planAccept(nowMs: number): PortraitCommitPlan {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    if (this.#phase !== "preview" || session.temporaryRenderHandle === null) {
      throw new PortraitCaptureError("acceptance requires a temporary preview");
    }
    return Object.freeze({
      kind: "accept-portrait",
      expectedRevision: this.#revision,
      sessionId: session.id,
      attempt: session.attempt,
      profileId: session.profileId,
      temporaryRenderHandle: session.temporaryRenderHandle,
      replacedRenderHandle: this.#accepted.portraitFor(session.profileId),
    });
  }

  commit(
    plan: PortraitCommitPlan,
    nowMs: number,
  ): Readonly<{
    accepted: Readonly<AcceptedPortrait>;
    discardedReplacedRenderHandle: string | null;
    snapshot: PortraitCaptureSnapshot;
  }> {
    this.#observeTime(nowMs);
    validateCommitPlan(plan);
    const session = this.#requireLiveSession(nowMs);
    if (plan.expectedRevision !== this.#revision) {
      throw new PortraitCaptureError("portrait confirmation is stale");
    }
    if (
      this.#phase !== "preview"
      || session.id !== plan.sessionId
      || session.attempt !== plan.attempt
      || session.profileId !== plan.profileId
      || session.temporaryRenderHandle !== plan.temporaryRenderHandle
    ) {
      throw new PortraitCaptureError("portrait confirmation does not match the preview");
    }
    const current = this.#accepted.portraitFor(session.profileId);
    if (current !== plan.replacedRenderHandle) {
      throw new PortraitCaptureError("accepted portrait changed before commit");
    }
    this.#accepted.replaceExact(
      session.profileId,
      current,
      session.temporaryRenderHandle,
    );
    const accepted = Object.freeze({
      profileId: session.profileId,
      renderHandle: session.temporaryRenderHandle,
    });
    this.#session = null;
    this.#phase = "idle";
    this.#revision += 1;
    return Object.freeze({
      accepted,
      discardedReplacedRenderHandle: current,
      snapshot: this.snapshot(),
    });
  }

  cancel(nowMs: number): PortraitDiscardResult {
    this.#observeTime(nowMs);
    const session = this.#requireLiveSession(nowMs);
    const discardedTemporaryRenderHandle = session.temporaryRenderHandle;
    const preservedAcceptedRenderHandle =
      this.#accepted.portraitFor(session.profileId);
    this.#session = null;
    this.#phase = "idle";
    this.#revision += 1;
    return Object.freeze({
      discardedTemporaryRenderHandle,
      preservedAcceptedRenderHandle,
      snapshot: this.snapshot(),
    });
  }

  expire(nowMs: number): PortraitDiscardResult | null {
    this.#observeTime(nowMs);
    if (!this.#session || nowMs <= this.#session.expiresAtMs) return null;
    const session = this.#session;
    const discardedTemporaryRenderHandle = session.temporaryRenderHandle;
    const preservedAcceptedRenderHandle =
      this.#accepted.portraitFor(session.profileId);
    this.#session = null;
    this.#phase = "idle";
    this.#revision += 1;
    return Object.freeze({
      discardedTemporaryRenderHandle,
      preservedAcceptedRenderHandle,
      snapshot: this.snapshot(),
    });
  }

  #requireLiveSession(nowMs: number): ActiveSession {
    const session = this.#session;
    if (!session) throw new PortraitCaptureError("no portrait session is active");
    if (nowMs > session.expiresAtMs) {
      throw new PortraitCaptureError("portrait session expired");
    }
    return session;
  }

  #observeTime(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new PortraitCaptureError("time must be a non-negative safe integer");
    }
    if (nowMs < this.#lastNowMs) {
      throw new PortraitCaptureError("portrait clock moved backwards");
    }
    this.#lastNowMs = nowMs;
  }
}

function validateProfileId(profileId: string): void {
  if (
    typeof profileId !== "string"
    || profileId.length > 64
    || !profileIdPattern.test(profileId)
  ) {
    throw new PortraitCaptureError("invalid portrait profile ID");
  }
}

function validateFixtureHandle(renderHandle: string): void {
  if (
    typeof renderHandle !== "string"
    || renderHandle.length > 96
    || !fixtureHandlePattern.test(renderHandle)
  ) {
    throw new PortraitCaptureError("invalid synthetic portrait render handle");
  }
}

function validateAttemptRef(attempt: PortraitCaptureAttemptRef): void {
  if (
    typeof attempt !== "object"
    || attempt === null
    || Array.isArray(attempt)
    || Object.keys(attempt).sort().join(",") !== "attempt,profileId,sessionId"
    || !Number.isSafeInteger(attempt.sessionId)
    || attempt.sessionId <= 0
    || !Number.isSafeInteger(attempt.attempt)
    || attempt.attempt <= 0
  ) {
    throw new PortraitCaptureError("invalid portrait capture reference");
  }
  validateProfileId(attempt.profileId);
}

function validateCommitPlan(plan: PortraitCommitPlan): void {
  if (
    typeof plan !== "object"
    || plan === null
    || Array.isArray(plan)
    || !hasExactKeys(plan, commitPlanKeys)
  ) {
    throw new PortraitCaptureError("portrait commit plan must use the closed schema");
  }
  if (
    plan.kind !== "accept-portrait"
    || !Number.isSafeInteger(plan.expectedRevision)
    || plan.expectedRevision < 0
    || !Number.isSafeInteger(plan.sessionId)
    || plan.sessionId <= 0
    || !Number.isSafeInteger(plan.attempt)
    || plan.attempt <= 0
  ) {
    throw new PortraitCaptureError("invalid portrait commit plan");
  }
  validateProfileId(plan.profileId);
  validateFixtureHandle(plan.temporaryRenderHandle);
  if (plan.replacedRenderHandle !== null) {
    validateFixtureHandle(plan.replacedRenderHandle);
  }
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length
    && sortedExpected.every((key, index) => keys[index] === key)
  );
}

function freezeAttemptRef(session: ActiveSession): PortraitCaptureAttemptRef {
  return Object.freeze({
    sessionId: session.id,
    attempt: session.attempt,
    profileId: session.profileId,
  });
}

function sameAttempt(
  session: ActiveSession,
  attempt: PortraitCaptureAttemptRef,
): boolean {
  return (
    session.id === attempt.sessionId
    && session.attempt === attempt.attempt
    && session.profileId === attempt.profileId
  );
}
