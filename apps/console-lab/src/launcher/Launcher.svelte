<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { ConsoleInputAction } from "../gamepad-router";
  import BootScreen from "./BootScreen.svelte";
  import ProfilesView from "./ProfilesView.svelte";
  import SearchOverlay from "./SearchOverlay.svelte";
  import SettingsView from "./SettingsView.svelte";
  import type { LabMode, LauncherOptions, LauncherView, SearchItem, SettingsPanel } from "./types";

  let { openMotionLab }: LauncherOptions = $props();
  let launcher: HTMLElement;
  let search: SearchOverlay;
  let settings: SettingsView;
  let visible = $state(true);
  let view = $state<LauncherView>("home");
  let activeProfile = $state("Randy");
  let clock = $state("");
  let toastMessage = $state("");
  let toastVisible = $state(false);
  let navSignalOffset = $state(0);
  let clockTimer: number | undefined;
  let toastTimer: number | undefined;

  const searchItems: SearchItem[] = [
    { title: "Obstacle", detail: "Motion game", group: "Motion", terms: "dodge duck jump body", action: () => openLab("obstacle") },
    { title: "Motion Lab", detail: "Skeleton diagnostics", group: "Motion", terms: "camera tracker debug signal", action: () => openLab("tracker") },
    { title: "Shell Lab", detail: "Gesture navigation", group: "Motion", terms: "swipe select back pause", action: () => openLab("shell") },
    { title: "VibeCoded Museum", detail: "vibecoded.games", group: "Online", terms: "museum collection web games", action: () => showView("museum") },
    { title: "VibeBots", detail: "Museum catalog", group: "Game", terms: "vibecoded online robots", action: () => showView("museum") },
    { title: "Mi Casa Es Su Casa", detail: "Museum catalog", group: "Game", terms: "vibecoded online casa", action: () => showView("museum") },
    { title: "Determined", detail: "Museum catalog", group: "Game", terms: "vibecoded online word game", action: () => showView("museum") },
    { title: "RetroArch", detail: "Retro library", group: "Local", terms: "retro emulator arcade rom library", action: () => showView("retro") },
    { title: "Profiles", detail: "Players on this console", group: "System", terms: "profile player portrait calibration", action: () => showView("profiles") },
    { title: "Wi-Fi", detail: "Network setup", group: "Settings", terms: "wifi internet network connection", action: () => showSettings("network") },
    { title: "Storage", detail: "Capacity and usage", group: "Settings", terms: "disk space capacity games", action: () => showSettings("storage") },
    { title: "Developer options", detail: "Diagnostics and pairing", group: "Settings", terms: "debug diagnostic developer version", action: () => showSettings("developer") },
  ];

  onMount(() => {
    paintClock();
    clockTimer = window.setInterval(paintClock, 15_000);
    void positionSignal();
  });

  onDestroy(() => {
    if (clockTimer !== undefined) window.clearInterval(clockTimer);
    if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  });

  export function isVisible(): boolean {
    return visible;
  }

  export function show(): void {
    visible = true;
    showView("home");
  }

  export function hide(): void {
    search.close();
    visible = false;
  }

  export async function showView(next: LauncherView): Promise<void> {
    view = next;
    await positionSignal();
    launcher.querySelector<HTMLButtonElement>(`.launcher-nav [data-view-target="${next}"]`)?.focus({ preventScroll: true });
  }

  export async function showSettings(panel: SettingsPanel): Promise<void> {
    view = "settings";
    await tick();
    settings.show(panel);
    await positionSignal();
  }

  export function back(): void {
    if (search.isOpen()) search.close();
    else if (view !== "home") showView("home");
  }

  export function handleInput(action: ConsoleInputAction): void {
    if (action === "home") {
      showView("home");
      return;
    }
    if (action === "back") {
      back();
      return;
    }

    const controls = [...launcher.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input")].filter(
      (element) => element.offsetParent !== null,
    );
    const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
    if (["left", "up", "right", "down"].includes(action)) {
      const direction = action === "left" || action === "up" ? -1 : 1;
      controls[(current + direction + controls.length) % controls.length]?.focus();
    } else if (action === "select") {
      (document.activeElement as HTMLElement | null)?.click();
    }
  }

  export function openSearch(): void {
    void search.open();
  }

  function openLab(mode: LabMode): void {
    openMotionLab(mode);
  }

  async function positionSignal(): Promise<void> {
    await tick();
    const active = launcher?.querySelector<HTMLButtonElement>(`.launcher-nav [data-view-target="${view}"]`);
    navSignalOffset = active ? active.offsetTop - 52 : 0;
  }

  function toast(message: string): void {
    toastMessage = message;
    toastVisible = true;
    if (toastTimer !== undefined) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toastVisible = false), 3_000);
  }

  function paintClock(): void {
    clock = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }
</script>

<BootScreen />

<main bind:this={launcher} class="launcher" id="launcher" hidden={!visible}>
  <header class="launcher-topbar">
    <button class="launcher-brand" type="button" data-launcher-home aria-label="VCG Console home" onclick={() => showView("home")}>VCG<span>/</span>CONSOLE</button>
    <button class="search-trigger" id="search-trigger" type="button" aria-haspopup="dialog" onclick={openSearch}>
      <span>Search games, hubs, and settings</span><kbd>/</kbd>
    </button>
    <div class="launcher-presence">
      <button type="button" onclick={() => showView("profiles")}><span class="profile-orbit" aria-hidden="true">{activeProfile.slice(0, 1).toUpperCase()}</span><span id="active-profile-name">{activeProfile}</span></button>
      <time id="launcher-clock" aria-label="Local time">{clock}</time>
    </div>
  </header>

  <div class="launcher-frame">
    <nav class="launcher-nav" aria-label="Launcher">
      <div class="nav-signal" aria-hidden="true"><span style:transform={`translateY(${navSignalOffset}px)`}></span></div>
      {#each ["home", "motion", "museum", "retro"] as target}
        <button class:active={view === target} type="button" data-view-target={target} onclick={() => showView(target as LauncherView)}>{target[0]?.toUpperCase() + target.slice(1)}</button>
      {/each}
      <span class="nav-spacer"></span>
      {#each ["profiles", "settings"] as target}
        <button class:active={view === target} type="button" data-view-target={target} onclick={() => showView(target as LauncherView)}>{target[0]?.toUpperCase() + target.slice(1)}</button>
      {/each}
    </nav>

    <section class="launcher-content">
      <div class="launcher-view home-view" data-launcher-view="home" hidden={view !== "home"}>
        <div class="home-heading">
          <p class="view-kicker">READY / LOCAL</p>
          <h1>Good evening,<br /><span id="home-profile-name">{activeProfile}.</span></h1>
          <p>Choose where to play.</p>
        </div>
        <div class="home-destinations" aria-label="Game destinations">
          <button class="destination featured" type="button" onclick={() => openLab("obstacle")}>
            <span class="destination-index">MOTION / 01</span><strong>Obstacle</strong><small>Body-controlled survival lab</small><span class="destination-action">Continue <b>→</b></span>
          </button>
          <button class="destination" type="button" onclick={() => showView("museum")}>
            <span class="destination-index">ONLINE / 02</span><strong>VibeCoded Museum</strong><small>Explore the complete collection</small><span class="destination-action">Enter <b>→</b></span>
          </button>
          <button class="destination" type="button" onclick={() => showView("retro")}>
            <span class="destination-index">LOCAL / 03</span><strong>RetroArch</strong><small>Your installed retro library</small><span class="destination-action">Open <b>→</b></span>
          </button>
        </div>
        <footer class="home-status"><span><i></i> Console ready</span><span>0 games installed locally</span><span>Network setup required</span></footer>
      </div>

      <div class="launcher-view list-view" data-launcher-view="motion" hidden={view !== "motion"}>
        <header class="view-header"><div><p class="view-kicker">MOTION HUB</p><h1>Move to play.</h1></div><p>Camera stays local. Every experience keeps a controller exit.</p></header>
        <div class="library-list">
          <button type="button" onclick={() => openLab("obstacle")}><span>01</span><strong>Obstacle</strong><small>Dodge · Duck · Jump</small><b>Ready</b></button>
          <button type="button" onclick={() => openLab("tracker")}><span>02</span><strong>Motion Lab</strong><small>Skeleton and signal diagnostics</small><b>Ready</b></button>
          <button type="button" onclick={() => openLab("shell")}><span>03</span><strong>Shell Lab</strong><small>Gesture navigation and recovery</small><b>Ready</b></button>
        </div>
      </div>

      <div class="launcher-view museum-view" data-launcher-view="museum" hidden={view !== "museum"}>
        <p class="view-kicker">VIBECODED.GAMES</p>
        <div class="museum-title"><h1>The museum is<br />a world of its own.</h1><span>LIVE / WEB</span></div>
        <p class="museum-copy">Walk through the full VibeCoded collection. The museum opens as a supervised web experience and returns here when you leave.</p>
        <a class="primary-action" href="https://vibecoded.games" target="_blank" rel="noopener noreferrer">Enter the museum <span>↗</span></a>
        <p class="boundary-note">Internet required · Opens vibecoded.games</p>
      </div>

      <div class="launcher-view retro-view" data-launcher-view="retro" hidden={view !== "retro"}>
        <header class="view-header"><div><p class="view-kicker">RETRO HUB</p><h1>One library.<br />No clutter.</h1></div><p>RetroArch runs beneath the VCG shell so Home, loading, and recovery stay consistent.</p></header>
        <div class="empty-library">
          <span class="empty-glyph" aria-hidden="true">○</span>
          <div><strong>No retro games installed</strong><p>Import games you are legally entitled to use from USB or a paired computer.</p></div>
          <button type="button" onclick={() => toast("The native importer will become available with the console host.")}>Import games</button>
        </div>
        <div class="retro-actions">
          <button type="button" onclick={() => toast("RetroArch requires the native console host in this browser prototype.")}>Open RetroArch</button>
          <button type="button" onclick={openSearch}>Search library</button>
        </div>
      </div>

      <div class="launcher-view profiles-view" data-launcher-view="profiles" hidden={view !== "profiles"}>
        <ProfilesView {activeProfile} onselect={(name) => (activeProfile = name)} ontoast={toast} />
      </div>

      <div class="launcher-view settings-view" data-launcher-view="settings" hidden={view !== "settings"}>
        <SettingsView bind:this={settings} {openMotionLab} ontoast={toast} />
      </div>
    </section>
  </div>

  <div class="launcher-toast" id="launcher-toast" hidden={!toastVisible} role="status">{toastMessage}</div>
  <SearchOverlay bind:this={search} items={searchItems} />
</main>
