<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { LauncherView } from "./types";
  let { view, activeProfile, onview, onsearch }: {
    view: LauncherView;
    activeProfile: string;
    onview: (view: LauncherView) => void;
    onsearch: () => void;
  } = $props();
  let topbar: HTMLElement;
  let clock = $state("");
  let navSignalOffset = $state(0);
  let navSignalWidth = $state(0);
  onMount(() => {
    paintClock();
    void positionSignal();
    const timer = window.setInterval(paintClock, 15_000);
    const reposition = () => { void positionSignal(); };
    window.addEventListener("resize", reposition);
    return () => { clearInterval(timer); window.removeEventListener("resize", reposition); };
  });
  export async function positionSignal(): Promise<void> {
    await tick();
    const navView =
      view === "retro-game" || view === "retro-library" ? "retro"
      : view === "session-adversarial" ? "motion"
      : ["profile-management", "calibration", "portrait", "unassigned"].includes(view) ? "profiles"
      : view;
    const active = topbar?.querySelector<HTMLButtonElement>(`.launcher-nav [data-view-target="${navView}"]`);
    navSignalOffset = active ? active.offsetLeft : 0;
    navSignalWidth = active ? active.offsetWidth : 0;
  }

  function paintClock(): void {
    clock = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }
</script>
  <header bind:this={topbar} class="launcher-topbar" data-focus-group="menu">
    <span class="launcher-brand" data-tv-critical-text>VCG<span>/</span>CONSOLE</span>
    <nav class="launcher-nav" aria-label="Launcher">
      <div class="nav-signal" aria-hidden="true"><span style:transform={`translateX(${navSignalOffset}px)`} style:width={`${navSignalWidth}px`}></span></div>
      {#each ["home", "motion", "museum", "retro"] as target}
        <button class:active={view === target || (target === "motion" && view === "session-adversarial") || (target === "retro" && (view === "retro-game" || view === "retro-library"))} type="button" data-view-target={target} data-tv-action data-tv-critical-text onclick={() => onview(target as LauncherView)}>{target[0]?.toUpperCase() + target.slice(1)}</button>
      {/each}
      <span class="nav-spacer"></span>
      {#each ["profiles", "settings"] as target}
        <button class:active={view === target || (target === "profiles" && (view === "profile-management" || view === "calibration" || view === "portrait" || view === "unassigned"))} type="button" data-view-target={target} data-tv-action data-tv-critical-text onclick={() => onview(target as LauncherView)}>{target[0]?.toUpperCase() + target.slice(1)}</button>
      {/each}
    </nav>
    <button class="search-trigger" id="search-trigger" type="button" data-tv-action data-tv-critical-text aria-haspopup="dialog" aria-label="Search games, hubs, and settings" onclick={onsearch}>
      <span>Search</span>
    </button>
    <div class="launcher-presence">
      <button type="button" data-tv-action data-tv-critical-text onclick={() => onview("profiles")}><span class="profile-orbit" aria-hidden="true">{activeProfile.slice(0, 1).toUpperCase()}</span><span id="active-profile-name">{activeProfile}</span></button>
      <time id="launcher-clock" aria-label="Local time">{clock}</time>
    </div>
  </header>
