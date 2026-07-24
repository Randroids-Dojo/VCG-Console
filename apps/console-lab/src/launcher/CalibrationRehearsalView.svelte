<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import type { LocalProfile } from "./types";
  import {
    CALIBRATION_REHEARSAL_MIN_SAMPLES,
    CalibrationRehearsalError,
    type CalibrationAttemptRef,
    type CalibrationDimension,
    type CalibrationGuidedStep,
    type CalibrationObservation,
    type CalibrationReadyResult,
    type CalibrationRehearsalController,
    type CalibrationRehearsalSnapshot,
  } from "./calibration-rehearsal";

  type Fixture =
    | "ready"
    | "feet-missing"
    | "unsafe-zone"
    | "optional-range";

  let {
    controller,
    snapshot,
    profile,
    onchanged,
    oncomplete,
    onback,
    ontoast,
  }: {
    controller: CalibrationRehearsalController;
    snapshot: CalibrationRehearsalSnapshot;
    profile: LocalProfile | null;
    onchanged: (snapshot: CalibrationRehearsalSnapshot) => void;
    oncomplete: (result: CalibrationReadyResult) => void;
    onback: () => void;
    ontoast: (message: string) => void;
  } = $props();

  let fixture = $state<Fixture>("feet-missing");
  let observationProgress = $state(0);
  let runToken = 0;
  let expiryTimer: number | undefined;

  $effect(() => {
    if (snapshot.phase === "idle") stopExpiryTimer();
    else ensureExpiryTimer();
  });

  onDestroy(() => {
    runToken += 1;
    stopExpiryTimer();
  });

  export function cancelPending(): boolean {
    if (snapshot.phase === "idle") return false;
    runToken += 1;
    try {
      onchanged(controller.cancel(now()));
    } catch (error) {
      const expired = controller.expire(now());
      if (expired) onchanged(expired);
      else ontoast(messageFor(error));
    }
    observationProgress = 0;
    return true;
  }

  function startAutomatic(): void {
    try {
      const attempt = controller.beginAutomatic(now());
      onchanged(controller.snapshot());
      void driveFixture(attempt, fixture);
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function applyCorrection(): void {
    fixture = "ready";
    startAutomatic();
  }

  function applySafeRoomAndRecheck(): void {
    fixture = "ready";
    startAutomatic();
  }

  function skipOptional(): void {
    try {
      onchanged(controller.skipOptionalGuidance(now()));
      void focusReadyAction();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function rehearseRoomChange(): void {
    try {
      onchanged(controller.invalidate(
        "room-change",
        "room-fixture-b",
        "camera-fixture-a",
        now(),
      ));
      fixture = "ready";
      void focusPhaseAction();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function useCalibration(): void {
    const result = snapshot.readyResult;
    if (!result) return;
    try {
      oncomplete(result);
      onchanged(controller.cancel(now()));
      runToken += 1;
      onback();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function cancelAndReturn(): void {
    cancelPending();
    onback();
  }

  async function driveFixture(
    attempt: CalibrationAttemptRef,
    selectedFixture: Fixture,
  ): Promise<void> {
    const token = ++runToken;
    observationProgress = 0;
    try {
      for (
        let sampleNumber = 1;
        sampleNumber <= CALIBRATION_REHEARSAL_MIN_SAMPLES;
        sampleNumber += 1
      ) {
        await delay(85);
        if (token !== runToken) return;
        onchanged(controller.submitObservation(
          attempt,
          fixtureObservation(selectedFixture, sampleNumber),
          now(),
        ));
        observationProgress = sampleNumber;
      }
      await delay(120);
      if (token !== runToken) return;
      onchanged(controller.evaluate(now()));
      observationProgress = 0;
      await focusPhaseAction();
    } catch (error) {
      if (token === runToken) ontoast(messageFor(error));
    }
  }

  function fixtureObservation(
    selectedFixture: Fixture,
    sampleNumber: number,
  ): CalibrationObservation {
    const base: CalibrationObservation = {
      sampleNumber,
      bodyCount: 1,
      fullBodyVisible: true,
      feetVisible: true,
      cameraStable: true,
      zoneClear: true,
      floorConfidence: 0.93,
      zoneConfidence: 0.94,
      scaleConfidence: 0.92,
      neutralConfidence: 0.91,
      rangeConfidence: 0.9,
    };
    if (selectedFixture === "feet-missing") {
      return {
        ...base,
        feetVisible: false,
        floorConfidence: 0.61,
      };
    }
    if (selectedFixture === "unsafe-zone") {
      return {
        ...base,
        zoneClear: false,
        zoneConfidence: 0.58,
      };
    }
    if (selectedFixture === "optional-range") {
      return {
        ...base,
        neutralConfidence: 0.64,
        rangeConfidence: 0.57,
      };
    }
    return base;
  }

  async function focusPhaseAction(): Promise<void> {
    await tick();
    document
      .querySelector<HTMLElement>(
        '[data-launcher-view="calibration"] .calibration-phase-actions button:not([disabled])',
      )
      ?.focus({ preventScroll: true });
  }

  async function focusReadyAction(): Promise<void> {
    await tick();
    document
      .querySelector<HTMLElement>("#use-synthetic-calibration")
      ?.focus({ preventScroll: true });
  }

  function ensureExpiryTimer(): void {
    if (expiryTimer !== undefined) return;
    expiryTimer = window.setInterval(() => {
      try {
        const expired = controller.expire(now());
        if (!expired) return;
        runToken += 1;
        onchanged(expired);
        ontoast("Calibration rehearsal expired without applying a result.");
        onback();
      } catch (error) {
        ontoast(messageFor(error));
      }
    }, 500);
  }

  function stopExpiryTimer(): void {
    if (expiryTimer !== undefined) {
      window.clearInterval(expiryTimer);
      expiryTimer = undefined;
    }
  }

  function dimensionLabel(dimension: CalibrationDimension): string {
    const labels: Record<CalibrationDimension, string> = {
      floor: "Floor",
      "play-zone": "Play zone",
      "player-scale": "Player scale",
      "neutral-stance": "Neutral stance",
      "usable-range": "Usable range",
    };
    return labels[dimension];
  }

  function statusLabel(status: string): string {
    if (status === "ready") return "Understood";
    if (status === "needs-check") return "Needs guided check";
    if (status === "blocked") return "Unavailable";
    if (status === "conservative") return "Conservative fallback";
    return "Waiting";
  }

  function stepTitle(step: CalibrationGuidedStep): string {
    if (step === "camera-placement") return "Fit the full body and both feet.";
    if (step === "clear-play-zone") return "Clear and confirm the play zone.";
    if (step === "neutral-stance") return "Hold a comfortable neutral stance.";
    return "Check a comfortable usable range.";
  }

  function fixtureLabel(value: Fixture): string {
    if (value === "ready") return "Ready";
    if (value === "feet-missing") return "Feet missing";
    if (value === "unsafe-zone") return "Unsafe zone";
    return "Limited range";
  }

  function messageFor(error: unknown): string {
    return error instanceof CalibrationRehearsalError
      || error instanceof Error
      ? error.message
      : "Calibration rehearsal failed.";
  }

  function now(): number {
    return Math.floor(performance.now());
  }

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }
</script>

<header class="view-header calibration-header">
  <div>
    <button class="text-back" type="button" onclick={cancelAndReturn}>← Profile management</button>
    <p class="view-kicker">PLAYER + PLAY-ZONE CALIBRATION / DESK REHEARSAL</p>
    <h1>Show what the console understood.</h1>
  </div>
  <p>Automatic first. Guided only where confidence or safety facts fail. This build uses no camera or body measurements.</p>
</header>

<div class="calibration-synthetic-notice" role="note">
  <strong>Camera off · closed synthetic confidence fixtures</strong>
  <span>No frame, landmark, body dimension, floor transform, room map, or persistent calibration is produced here.</span>
</div>

{#if profile && snapshot.phase === "notice"}
  <section class="calibration-notice-layout" aria-labelledby="calibration-notice-title">
    <div class="calibration-zone-art" data-calibration-fixture={fixture}>
      <span class="calibration-zone"></span>
      <span class="calibration-person"></span>
      <span class="calibration-floor"></span>
      <b>SYNTHETIC</b>
    </div>
    <div class="calibration-notice-copy">
      <p class="view-kicker">NOTICE / {profile.name.toUpperCase()}</p>
      <h2 id="calibration-notice-title">Run a camera-free automatic check?</h2>
      <p>The rehearsal evaluates only five closed confidence dimensions: floor, play zone, player scale, neutral stance, and usable range.</p>
      <div class="calibration-fixtures" aria-label="Synthetic calibration evidence fixture">
        {#each ["ready", "feet-missing", "unsafe-zone", "optional-range"] as value}
          <button
            type="button"
            aria-pressed={fixture === value}
            onclick={() => {
              fixture = value as Fixture;
            }}
          >{fixtureLabel(value as Fixture)}</button>
        {/each}
      </div>
      <p class="calibration-fixture-disclosure">Desk-only fixture selector. Production derives evidence from the qualified tracker and never asks a player to choose confidence.</p>
      <div class="calibration-phase-actions">
        <button class="calibration-primary" type="button" onclick={startAutomatic}>Start automatic rehearsal</button>
        <button type="button" onclick={cancelAndReturn}>Cancel</button>
      </div>
    </div>
  </section>
{:else if profile && snapshot.phase === "observing"}
  <section class="calibration-observing" aria-live="polite">
    <p class="view-kicker">AUTOMATIC CHECK / CAMERA OFF</p>
    <div class="calibration-observation-ring">
      <strong>{observationProgress}</strong>
      <span>of {CALIBRATION_REHEARSAL_MIN_SAMPLES} synthetic observations</span>
    </div>
    <h2>Checking only the selected fixture.</h2>
    <p>No preview, frame, skeleton, measurement, or persistent profile value exists.</p>
    <div class="calibration-phase-actions">
      <button type="button" onclick={cancelAndReturn}>Cancel check</button>
    </div>
  </section>
{:else if profile && (snapshot.phase === "guided" || snapshot.phase === "blocked" || snapshot.phase === "ready")}
  <div class="calibration-result-layout">
    <section class="calibration-understanding" aria-labelledby="calibration-understanding-title">
      <p class="view-kicker">VISIBLE UNDERSTOOD STATE</p>
      <h2 id="calibration-understanding-title">
        {snapshot.phase === "ready" ? "Ready for this synthetic session." : snapshot.phase === "blocked" ? "Placement is unsafe or ambiguous." : "One short correction is needed."}
      </h2>
      <div class="calibration-dimensions">
        {#each snapshot.dimensions as dimension}
          <div data-calibration-status={dimension.status}>
            <span aria-hidden="true"></span>
            <strong>{dimensionLabel(dimension.dimension)}</strong>
            <b>{statusLabel(dimension.status)}</b>
            <small>{dimension.confidence === null ? "No score" : `${Math.round(dimension.confidence * 100)}% synthetic confidence`}</small>
          </div>
        {/each}
      </div>
    </section>

    <section class="calibration-next-step">
      {#if snapshot.phase === "guided"}
        <p class="view-kicker">GUIDED ONLY WHERE NEEDED</p>
        <h2>{stepTitle(snapshot.guidedSteps[0] ?? "usable-range")}</h2>
        <p>Other passing dimensions stay visible. The correction restarts a fresh exact observation attempt; late callbacks from this attempt are refused.</p>
        <div class="calibration-issue-list">
          {#each snapshot.issues as issue}<span>{issue.replaceAll("-", " ")}</span>{/each}
        </div>
        <div class="calibration-phase-actions">
          <button class="calibration-primary" type="button" onclick={applyCorrection}>Apply synthetic correction</button>
          {#if snapshot.issues.every((issue) => issue === "neutral-low-confidence" || issue === "range-low-confidence")}
            <button type="button" onclick={skipOptional}>Use conservative fallback</button>
          {/if}
          <button type="button" onclick={cancelAndReturn}>Cancel</button>
        </div>
      {:else if snapshot.phase === "blocked"}
        <p class="view-kicker">FAIL CLOSED / NO CALIBRATION</p>
        <h2>Do not continue active play.</h2>
        <p>Unsafe zone, camera movement, no player, or multiple people cannot be skipped. Resolve the specific condition and recheck.</p>
        <div class="calibration-issue-list">
          {#each snapshot.issues as issue}<span>{issue.replaceAll("-", " ")}</span>{/each}
        </div>
        <div class="calibration-phase-actions">
          <button class="calibration-primary" type="button" onclick={applySafeRoomAndRecheck}>Apply safe-room fixture and recheck</button>
          <button type="button" onclick={cancelAndReturn}>Cancel</button>
        </div>
      {:else}
        <p class="view-kicker">SYNTHETIC RESULT / NOT PERSISTED</p>
        <h2>{snapshot.readyResult?.limited ? "Ready with conservative limits." : "All required dimensions passed."}</h2>
        <p>D-077 would proceed automatically after a qualified real check. The desk rehearsal pauses here so the result and invalidation behavior can be reviewed.</p>
        <div class="calibration-phase-actions">
          <button id="use-synthetic-calibration" class="calibration-primary" type="button" onclick={useCalibration}>Use synthetic calibration</button>
          <button type="button" onclick={rehearseRoomChange}>Rehearse room change</button>
          <button type="button" onclick={cancelAndReturn}>Cancel</button>
        </div>
      {/if}
      <p class="calibration-input-copy">Controller Select or a triggered hands-together action activates only the focused choice. Back and Home cancel without applying a result.</p>
    </section>
  </div>
{:else if profile && snapshot.phase === "invalidated"}
  <section class="calibration-invalidated">
    <p class="view-kicker">CALIBRATION INVALIDATED</p>
    <h2>Room or camera evidence changed.</h2>
    <p>The prior result is unavailable before another check. No game receives the old floor, zone, scale, stance, or range state.</p>
    <div class="calibration-phase-actions">
      <button class="calibration-primary" type="button" onclick={startAutomatic}>Recheck changed room</button>
      <button type="button" onclick={cancelAndReturn}>Cancel</button>
    </div>
  </section>
{:else}
  <section class="calibration-invalidated">
    <h2>No calibration rehearsal is active.</h2>
    <button type="button" onclick={onback}>Return to profile management</button>
  </section>
{/if}
