<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { LaunchSession } from "./types";

  let {
    session,
    onexit,
    onaction,
  }: {
    session: LaunchSession;
    onexit: () => void;
    onaction: () => void;
  } = $props();
  let panel: HTMLElement;
  let exitButton: HTMLButtonElement;
  let elapsedMs = $state(0);
  let timer: number | undefined;
  let statusLabel = $derived(session.status === "loading" ? "IN PROGRESS" : session.status === "ready" ? "READY" : "NOT AVAILABLE");
  let elapsed = $derived(`${(elapsedMs / 1_000).toFixed(1)} S`);

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
  class:launch-ready={session.status === "ready"}
  class:launch-unavailable={session.status === "unavailable"}
  data-launch-adapter={session.adapter}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="launch-title"
  onkeydown={handleKeydown}
>
  <header class="launch-header">
    <span>VCG<span>/</span>TRANSFER</span>
    <span>{session.adapterLabel}</span>
  </header>

  <div class="launch-body">
    <div class="launch-identity">
      <p>{session.context}</p>
      <h1 id="launch-title">{session.title}</h1>
      <div class="launch-readout" aria-live="polite">
        <span class="launch-state-mark" aria-hidden="true"></span>
        <div><small>{statusLabel}</small><strong>{session.detail}</strong></div>
      </div>
    </div>

    <ol class="launch-trace" aria-label="Launch phases">
      {#each session.phases as phase, index}
        <li class:complete={index < session.activePhase || session.status === "ready"} class:active={index === session.activePhase && session.status !== "ready"}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{phase.label}</strong><small>{phase.detail}</small></div>
        </li>
      {/each}
    </ol>
  </div>

  <footer class="launch-footer">
    <div class="launch-metrics">
      <span><small>ELAPSED</small><strong>{elapsed}</strong></span>
      <span><small>PHASE</small><strong>{Math.min(session.activePhase + 1, session.phases.length)} / {session.phases.length}</strong></span>
      {#if session.progress !== undefined}
        <span><small>PROGRESS</small><strong>{Math.round(session.progress * 100)}%</strong></span>
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
    {:else if session.status === "loading"}
      <div class="launch-progress indeterminate" aria-label="Waiting for an external launch phase"><span></span></div>
    {/if}
    <div class="launch-actions">
      {#if session.action?.href}
        <a class="launch-primary" href={session.action.href} target="_blank" rel="noopener noreferrer">{session.action.label}<span>↗</span></a>
      {:else if session.action}
        <button class="launch-primary" type="button" onclick={onaction}>{session.action.label}<span>→</span></button>
      {/if}
      <button bind:this={exitButton} type="button" onclick={onexit}>{session.status === "loading" ? "Back" : "Exit"}<kbd>ESC</kbd></button>
    </div>
  </footer>
</div>
