<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { LaunchSession } from "./types";

  let {
    session,
    onexit,
    onaction,
    onretry,
  }: {
    session: LaunchSession;
    onexit: () => void;
    onaction: () => void;
    onretry: () => void;
  } = $props();
  let panel: HTMLElement;
  let exitButton: HTMLButtonElement;
  let elapsedMs = $state(0);
  let detailsVisible = $state(false);
  let timer: number | undefined;
  const STATUS_LABELS = {
    loading: "IN PROGRESS",
    slow: "TAKING LONGER",
    ready: "READY",
    offline: "OFFLINE",
    hung: "NOT RESPONDING",
    crashed: "STOPPED",
    recovering: "RECOVERING",
    recovered: "RECOVERED",
    unavailable: "NOT AVAILABLE",
  } as const;
  let statusLabel = $derived(STATUS_LABELS[session.status]);
  let elapsed = $derived(`${(elapsedMs / 1_000).toFixed(1)} S`);
  let fault = $derived(["offline", "hung", "crashed", "unavailable"].includes(session.status));

  onMount(() => {
    elapsedMs = Math.max(0, Date.now() - session.startedAt);
    timer = window.setInterval(() => {
      elapsedMs = Math.max(0, Date.now() - session.startedAt);
    }, 100);
    void tick().then(() => exitButton.focus({ preventScroll: true }));
  });

  onDestroy(() => {
    if (timer !== undefined) window.clearInterval(timer);
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onexit();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...panel.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")].filter(
      (element) => element.offsetParent !== null,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div
  bind:this={panel}
  class="launch-screen"
  class:launch-ready={["ready", "recovered"].includes(session.status)}
  class:launch-recovering={session.status === "recovering"}
  class:launch-slow={session.status === "slow"}
  class:launch-unavailable={fault}
  data-launch-adapter={session.adapter}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="launch-title"
  onkeydown={handleKeydown}
>
  <header class="launch-header">
    <span data-tv-critical-text>VCG<span>/</span>TRANSFER</span>
    <span data-tv-critical-text>{session.adapterLabel}</span>
  </header>

  <div class="launch-body">
    <div class="launch-identity">
      <p data-tv-critical-text>{session.context}</p>
      <h1 id="launch-title" data-tv-critical-text>{session.title}</h1>
      <div class="launch-readout" aria-live="polite">
        <span class="launch-state-mark" aria-hidden="true"></span>
        <div><small data-tv-critical-text>{statusLabel}</small><strong data-tv-critical-text>{session.detail}</strong></div>
      </div>
    </div>

    <ol class="launch-trace" aria-label="Launch phases">
      {#each session.phases as phase, index}
        <li class:complete={index < session.activePhase || session.status === "ready"} class:active={index === session.activePhase && session.status !== "ready"}>
          <span data-tv-critical-text>{String(index + 1).padStart(2, "0")}</span>
          <div><strong data-tv-critical-text>{phase.label}</strong><small>{phase.detail}</small></div>
        </li>
      {/each}
    </ol>
  </div>

  <footer class="launch-footer">
    <div class="launch-metrics">
      <span><small data-tv-critical-text>ELAPSED</small><strong data-tv-critical-text>{elapsed}</strong></span>
      <span><small data-tv-critical-text>PHASE</small><strong data-tv-critical-text>{Math.min(session.activePhase + 1, session.phases.length)} / {session.phases.length}</strong></span>
      {#if session.progress !== undefined}
        <span><small data-tv-critical-text>PROGRESS</small><strong data-tv-critical-text>{Math.round(session.progress * 100)}%</strong></span>
      {/if}
    </div>
    {#if session.progress !== undefined}
      <div
        class="launch-progress"
        role="progressbar"
        aria-label="Launch progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(session.progress * 100)}
      ><span style:width={`${session.progress * 100}%`}></span></div>
    {:else if ["loading", "slow", "recovering"].includes(session.status)}
      <div class="launch-progress indeterminate" aria-label="Waiting for an external launch phase"><span></span></div>
    {/if}
    {#if detailsVisible && session.diagnostics}
      <dl class="launch-diagnostics" aria-label="Launch diagnostics">
        <div><dt>CODE</dt><dd>{session.diagnostics.code}</dd></div>
        <div><dt>ATTEMPT</dt><dd>{session.diagnostics.attempt}</dd></div>
        <div><dt>LAST SIGNAL</dt><dd>{session.diagnostics.lastSignal}</dd></div>
        <div><dt>AT</dt><dd>+{Math.max(0, (session.diagnostics.lastSignalAt - session.startedAt) / 1_000).toFixed(1)} S</dd></div>
        <div><dt>TIMEOUT</dt><dd>{(session.diagnostics.timeoutMs / 1_000).toFixed(1)} S</dd></div>
      </dl>
    {/if}
    <div class="launch-actions">
      {#if session.action}
        <button class="launch-primary" type="button" data-tv-action data-tv-critical-text onclick={onaction}>{session.action.label}<span class="ui-icon ui-icon-arrow-right" aria-hidden="true"></span></button>
      {/if}
      {#if session.canRetry}
        <button class="launch-primary" type="button" data-tv-action data-tv-critical-text onclick={onretry}>Retry<span class="ui-icon ui-icon-retry" aria-hidden="true"></span></button>
      {/if}
      {#if session.diagnostics}
        <button type="button" data-tv-action data-tv-critical-text aria-expanded={detailsVisible} onclick={() => (detailsVisible = !detailsVisible)}>{detailsVisible ? "Hide details" : "Details"}<span>+</span></button>
      {/if}
      <button bind:this={exitButton} type="button" data-tv-action data-tv-critical-text onclick={onexit}>{session.status === "loading" ? "Back" : "Exit"}<kbd>ESC</kbd></button>
    </div>
  </footer>
</div>
