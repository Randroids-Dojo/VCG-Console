<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import type { LocalProfile } from "./types";
  import {
    PortraitCaptureError,
    type PortraitCaptureAttemptRef,
    type PortraitCaptureController,
    type PortraitCaptureSnapshot,
  } from "./portrait-capture";

  let {
    controller,
    snapshot,
    profile,
    onchanged,
    oncomplete,
    onback,
    ontoast,
  }: {
    controller: PortraitCaptureController;
    snapshot: PortraitCaptureSnapshot;
    profile: LocalProfile | null;
    onchanged: (snapshot: PortraitCaptureSnapshot) => void;
    oncomplete: () => void;
    onback: () => void;
    ontoast: (message: string) => void;
  } = $props();

  let attempt = $state<PortraitCaptureAttemptRef | null>(null);
  let countdown = $state(3);
  let clockTimer: number | undefined;

  $effect(() => {
    if (snapshot.phase !== "idle") ensureClock();
    else stopClock();
  });

  onDestroy(stopClock);

  export function cancelPending(): boolean {
    if (snapshot.phase === "idle") return false;
    try {
      onchanged(controller.cancel(now()).snapshot);
    } catch (error) {
      const expired = controller.expire(now());
      if (expired) onchanged(expired.snapshot);
      else ontoast(messageFor(error));
    }
    attempt = null;
    stopClock();
    return true;
  }

  function start(): void {
    if (!profile) return;
    try {
      attempt = controller.beginCountdown(now());
      onchanged(controller.snapshot());
      countdown = 3;
      ensureClock();
      resetViewScroll();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function retake(): void {
    try {
      const result = controller.retake(now());
      attempt = result.attempt;
      countdown = 3;
      onchanged(result.snapshot);
      ensureClock();
      resetViewScroll();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function accept(): void {
    if (!profile) return;
    try {
      const plan = controller.planAccept(now());
      const result = controller.commit(plan, now());
      onchanged(result.snapshot);
      attempt = null;
      stopClock();
      ontoast(`Synthetic portrait preview accepted for ${profile.name}.`);
      oncomplete();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function cancelAndReturn(): void {
    cancelPending();
    onback();
  }

  function ensureClock(): void {
    if (clockTimer !== undefined) return;
    clockTimer = window.setInterval(updateClock, 80);
  }

  function stopClock(): void {
    if (clockTimer !== undefined) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  }

  function updateClock(): void {
    const current = now();
    try {
      const expired = controller.expire(current);
      if (expired) {
        onchanged(expired.snapshot);
        attempt = null;
        stopClock();
        ontoast("Synthetic portrait session expired without saving.");
        onback();
        return;
      }
      if (
        snapshot.phase !== "countdown"
        || snapshot.countdownEndsAtMs === null
        || attempt === null
      ) {
        return;
      }
      const remaining = snapshot.countdownEndsAtMs - current;
      countdown = Math.max(1, Math.ceil(remaining / 1_000));
      if (remaining > 0) return;
      const renderHandle = fixtureHandle(profile?.id ?? "profile", attempt.attempt);
      const next = controller.completeSyntheticCapture(
        attempt,
        renderHandle,
        current,
      );
      attempt = null;
      onchanged(next);
      void focusPreview();
    } catch (error) {
      stopClock();
      ontoast(messageFor(error));
    }
  }

  async function focusPreview(): Promise<void> {
    await tick();
    resetViewScroll();
    document
      .querySelector<HTMLElement>("#accept-synthetic-portrait")
      ?.focus({ preventScroll: true });
  }

  function resetViewScroll(): void {
    window.scrollTo(0, 0);
  }

  function fixtureHandle(profileId: string, attemptNumber: number): string {
    const variant = ["a", "b", "c"][(attemptNumber - 1) % 3] ?? "a";
    return `portrait-fixture-${profileId}-${variant}`;
  }

  function now(): number {
    return Math.floor(performance.now());
  }

  function messageFor(error: unknown): string {
    return error instanceof PortraitCaptureError || error instanceof Error
      ? error.message
      : "Synthetic portrait rehearsal failed.";
  }
</script>

<header class="view-header portrait-capture-header">
  <div>
    <button class="text-back" type="button" onclick={cancelAndReturn}>← Profiles</button>
    <p class="view-kicker">DEVICE-ONLY PORTRAIT / DESK REHEARSAL</p>
    <h1>Choose the image deliberately.</h1>
  </div>
  <p>One visible still can identify a household member. Nothing is kept until the preview is explicitly accepted.</p>
</header>

<div class="portrait-synthetic-notice" role="note">
  <strong>Camera off · synthetic fixture only</strong>
  <span>This build does not request camera permission, capture pixels, or write portrait data.</span>
</div>

{#if profile && snapshot.phase === "notice"}
  <section class="portrait-capture-layout" aria-labelledby="portrait-notice-title">
    <div class="portrait-rehearsal-art" data-portrait-handle="portrait-fixture-notice">
      <span></span><span></span><span></span>
      <b>SYNTHETIC</b>
    </div>
    <div class="portrait-capture-copy">
      <p class="view-kicker">NOTICE / {profile.name.toUpperCase()}</p>
      <h2 id="portrait-notice-title">Rehearse a deliberate portrait capture?</h2>
      <ul>
        <li>A visible three-second countdown comes before the fixture.</li>
        <li>The temporary preview is discarded on Retake, Back, Home, or expiry.</li>
        <li>Accept replaces only this profile’s previous synthetic preview.</li>
        <li>No face recognition, embedding, body matching, export, backup, cloud, diagnostics, support, or recovery-image path exists here.</li>
      </ul>
      <p class="portrait-family-gate">A real household portrait remains disabled until notice, adult consent and child assent where applicable, vault protection, deletion, exclusion, security, privacy, and legal gates pass.</p>
      <div class="portrait-actions">
        <button class="portrait-primary" type="button" onclick={start}>Start 3-second rehearsal</button>
        <button type="button" onclick={cancelAndReturn}>Cancel</button>
      </div>
    </div>
  </section>
{:else if profile && snapshot.phase === "countdown"}
  <section class="portrait-countdown" aria-live="assertive" aria-atomic="true">
    <p class="view-kicker">COUNTDOWN / SYNTHETIC</p>
    <strong>{countdown}</strong>
    <h2>Fixture appears after the countdown.</h2>
    <p>The camera remains off. Back or Home cancels without saving.</p>
    <button type="button" onclick={cancelAndReturn}>Cancel rehearsal</button>
  </section>
{:else if profile && snapshot.phase === "preview" && snapshot.temporaryRenderHandle}
  <section class="portrait-capture-layout" aria-labelledby="portrait-preview-title">
    <div
      class="portrait-rehearsal-art portrait-preview-art"
      data-portrait-handle={snapshot.temporaryRenderHandle}
      role="img"
      aria-label={`Synthetic portrait preview for ${profile.name}`}
    >
      <span></span><span></span><span></span>
      <b>SYNTHETIC</b>
    </div>
    <div class="portrait-capture-copy">
      <p class="view-kicker">TEMPORARY PREVIEW / NOT SAVED</p>
      <h2 id="portrait-preview-title">Use this synthetic preview for {profile.name}?</h2>
      <p>The fixture is temporary. Retake discards it. Back, Home, or Cancel preserves the previous profile image and saves nothing new.</p>
      <div class="portrait-preview-status">
        <span>Camera</span><strong>Off</strong>
        <span>Recognition</span><strong>None</strong>
        <span>Storage</span><strong>In-memory rehearsal</strong>
      </div>
      <div class="portrait-actions">
        <button id="accept-synthetic-portrait" class="portrait-primary" type="button" onclick={accept}>Use synthetic portrait</button>
        <button type="button" onclick={retake}>Retake</button>
        <button type="button" onclick={cancelAndReturn}>Cancel</button>
      </div>
      <p class="portrait-motion-copy">Controller Select or a triggered hands-together action accepts the focused choice. Controller Back, crossed-arm Back, and Home remain recovery paths.</p>
    </div>
  </section>
{:else}
  <section class="portrait-capture-unavailable">
    <h2>No portrait rehearsal is active.</h2>
    <button type="button" onclick={onback}>Return to profiles</button>
  </section>
{/if}
