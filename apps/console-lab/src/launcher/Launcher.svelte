<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { ConsoleInputAction } from "../gamepad-router";
  import {
    cancelNativeLaunch,
    checkNativeHost,
    checkNativePackage,
    getNativeLaunch,
    startNativeLaunch,
    type NativeLaunchSnapshot,
  } from "../native-host-client";
  import BootScreen from "./BootScreen.svelte";
  import LaunchScreen from "./LaunchScreen.svelte";
  import { LaunchSupervisor, type LaunchSupervisorOptions } from "./launch-supervisor";
  import ProfilesView from "./ProfilesView.svelte";
  import SearchOverlay from "./SearchOverlay.svelte";
  import SettingsView from "./SettingsView.svelte";
  import type { LabMode, LaunchAdapter, LaunchFaultPreview, LaunchSession, LauncherOptions, LauncherView, SearchItem, SettingsPanel } from "./types";

  let { openMotionLab }: LauncherOptions = $props();
  let launcher: HTMLElement;
  let search: SearchOverlay;
  let settings: SettingsView;
  let visible = $state(true);
  let view = $state<LauncherView>("home");
  let activeProfile = $state("Randy");
  let activeProfileId = $state("profile-randy");
  let clock = $state("");
  let toastMessage = $state("");
  let toastVisible = $state(false);
  let launchSession = $state<LaunchSession | undefined>();
  let navSignalOffset = $state(0);
  let clockTimer: number | undefined;
  let toastTimer: number | undefined;
  let launchRun = 0;
  let launchAttempt = 0;
  let launchReturnFocus: HTMLElement | null = null;
  let launchSupervisor: LaunchSupervisor | undefined;
  let launchUnsubscribe: (() => void) | undefined;
  let launchRetryOperation: ((attempt: number) => void) | undefined;
  let activeNativeRequestId: string | undefined;

  const LOCAL_LAUNCH_BUDGET: LaunchSupervisorOptions = { slowAfterMs: 5_000, timeoutMs: 15_000, heartbeatTimeoutMs: 8_000 };
  const REMOTE_LAUNCH_BUDGET: LaunchSupervisorOptions = { slowAfterMs: 10_000, timeoutMs: 30_000, heartbeatTimeoutMs: 15_000 };

  const searchItems: SearchItem[] = [
    { title: "Obstacle", detail: "Motion game", group: "Motion", terms: "dodge duck jump body", action: () => void launchLocalWeb("obstacle", "Obstacle") },
    { title: "Motion Lab", detail: "Skeleton diagnostics", group: "Motion", terms: "camera tracker debug signal", action: () => void launchLocalWeb("tracker", "Motion Lab") },
    { title: "Shell Lab", detail: "Gesture navigation", group: "Motion", terms: "swipe select back pause", action: () => void launchLocalWeb("shell", "Shell Lab") },
    { title: "VibeCoded Museum", detail: "vibecoded.games", group: "Online", terms: "museum collection web games", action: () => showView("museum") },
    { title: "VibeBots", detail: "Museum catalog", group: "Game", terms: "vibecoded online robots", action: () => showView("museum") },
    { title: "Mi Casa Es Su Casa", detail: "Museum catalog", group: "Game", terms: "vibecoded online casa", action: () => showView("museum") },
    { title: "Determined", detail: "Museum catalog", group: "Game", terms: "vibecoded online word game", action: () => showView("museum") },
    { title: "RetroArch", detail: "Retro library", group: "Local", terms: "retro emulator arcade rom library", action: () => showView("retro") },
    { title: "2048", detail: "Retro qualification candidate", group: "Retro", terms: "libretro smoke test public domain offline", action: () => showView("retro") },
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
    disposeLaunchSupervisor();
  });

  export function isVisible(): boolean {
    return visible;
  }

  export function show(): void {
    visible = true;
    closeLaunch(false);
    showView("home");
  }

  export function hide(): void {
    search.close();
    closeLaunch(false);
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
    if (launchSession) closeLaunch();
    else if (search.isOpen()) search.close();
    else if (view !== "home") showView("home");
  }

  export function handleInput(action: ConsoleInputAction): void {
    if (action === "home") {
      closeLaunch();
      showView("home");
      return;
    }
    if (action === "back") {
      back();
      return;
    }

    const controlRoot = launchSession ? launcher.querySelector<HTMLElement>(".launch-screen") ?? launcher : launcher;
    const controls = [...controlRoot.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input")].filter(
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
    if (launchSession) return;
    void search.open();
  }

  function openLab(mode: LabMode): void {
    openMotionLab(mode);
  }

  function baseLaunch(adapter: LaunchAdapter, title: string, context: string): LaunchSession {
    const definitions: Record<LaunchAdapter, Pick<LaunchSession, "adapterLabel" | "phases">> = {
      "remote-web": {
        adapterLabel: "REMOTE WEB",
        phases: [
          { label: "Check connection", detail: "Read the console network state" },
          { label: "Confirm destination", detail: "Keep the remote origin visible" },
          { label: "Hand off", detail: "Open the supervised browser session" },
        ],
      },
      "local-web": {
        adapterLabel: "LOCAL WEB",
        phases: [
          { label: "Verify package", detail: "Use the already loaded local build" },
          { label: "Prepare controls", detail: "Reserve console Back and Home" },
          { label: "Start session", detail: "Transfer focus to the game" },
        ],
      },
      native: {
        adapterLabel: "NATIVE / GODOT",
        phases: [
          { label: "Check package", detail: "Read the native game manifest" },
          { label: "Request host", detail: "Ask the Rust appliance service to launch" },
          { label: "Wait for ready", detail: "Hold until the game reports healthy" },
        ],
      },
      retro: {
        adapterLabel: "RETRO / LIBRETRO",
        phases: [
          { label: "Check library", detail: "Resolve the game, core, and controller profile" },
          { label: "Request host", detail: "Ask the Rust appliance service to launch" },
          { label: "Wait for ready", detail: "Hold until the host confirms a healthy window" },
        ],
      },
    };
    return {
      adapter,
      title,
      context,
      ...definitions[adapter],
      activePhase: 0,
      status: "loading",
      startedAt: Date.now(),
      detail: definitions[adapter].phases[0]?.label ?? "Preparing",
    };
  }

  function beginLaunch(session: LaunchSession): number {
    disposeLaunchSupervisor();
    launchRun += 1;
    launchAttempt += 1;
    launchReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    launchSession = session;
    return launchRun;
  }

  function beginSupervisedLaunch(session: LaunchSession, options: LaunchSupervisorOptions): { run: number; attempt: number; supervisor: LaunchSupervisor } {
    const run = beginLaunch(session);
    const supervisor = new LaunchSupervisor(session, options);
    launchSupervisor = supervisor;
    launchUnsubscribe = supervisor.subscribe((next) => {
      if (launchSupervisor === supervisor) launchSession = next;
    });
    supervisor.start();
    return { run, attempt: launchAttempt, supervisor };
  }

  async function launchLocalWeb(mode: LabMode, title: string): Promise<void> {
    const { run, attempt, supervisor } = beginSupervisedLaunch({
      ...baseLaunch("local-web", title, "MOTION HUB / INSTALLED"),
      progress: 0,
    }, LOCAL_LAUNCH_BUDGET);
    launchRetryOperation = (nextAttempt) => void runLocalAttempt(supervisor, run, nextAttempt, mode);
    await runLocalAttempt(supervisor, run, attempt, mode);
  }

  async function runLocalAttempt(supervisor: LaunchSupervisor, run: number, attempt: number, mode: LabMode): Promise<void> {
    await tick();
    if (!isCurrentLaunch(supervisor, run, attempt)) return;
    supervisor.advance(1, "Local package verified", 1 / 3);
    await nextLaunchFrame();
    if (!isCurrentLaunch(supervisor, run, attempt)) return;
    supervisor.advance(2, "Console controls reserved", 2 / 3);
    await nextLaunchFrame();
    if (!isCurrentLaunch(supervisor, run, attempt)) return;
    supervisor.heartbeat("Local session accepted focus");
    supervisor.ready(attempt > 1 ? "Session recovered and is ready" : "Session ready");
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    if (!isCurrentLaunch(supervisor, run, attempt)) return;
    launchSession = undefined;
    disposeLaunchSupervisor();
    openLab(mode);
  }

  function launchMuseum(): void {
    const { supervisor } = beginSupervisedLaunch({
      ...baseLaunch("remote-web", "VibeCoded Museum", "VIBECODED.GAMES / ONLINE"),
      action: { label: "Open museum", href: "https://vibecoded.games" },
    }, REMOTE_LAUNCH_BUDGET);
    launchRetryOperation = () => runMuseumAttempt(supervisor);
    runMuseumAttempt(supervisor);
  }

  function runMuseumAttempt(supervisor: LaunchSupervisor): void {
    if (!navigator.onLine) {
      supervisor.offline();
      return;
    }
    supervisor.advance(1, "Network interface is online");
    supervisor.advance(2, "Remote origin fixed to vibecoded.games");
    supervisor.ready("Browser handoff ready · reachability is checked by the native host");
  }

  function launchHostedAdapter(adapter: "native" | "retro", requestedTitle?: string, gameId?: string): void {
    const title = requestedTitle ?? (adapter === "retro" ? "RetroArch" : "Native game");
    const context = adapter === "retro" ? "RETRO HUB / LOCAL" : "DEVELOPER PREVIEW / LOCAL";
    const { supervisor } = beginSupervisedLaunch(baseLaunch(adapter, title, context), LOCAL_LAUNCH_BUDGET);
    launchRetryOperation = () => void runHostedAttempt(supervisor, gameId);
    void runHostedAttempt(supervisor, gameId);
  }

  async function runHostedAttempt(supervisor: LaunchSupervisor, gameId?: string): Promise<void> {
    supervisor.advance(1, "Requesting the Rust console host");
    if (gameId) {
      if (activeNativeRequestId) {
        const previousRequestId = activeNativeRequestId;
        activeNativeRequestId = undefined;
        await cancelNativeLaunch(previousRequestId);
        if (launchSupervisor !== supervisor) return;
      }
      const packageResult = await checkNativePackage(gameId);
      if (launchSupervisor !== supervisor) return;
      if (!packageResult.ok) {
        supervisor.unavailable(packageResult.detail, packageResult.code);
        return;
      }
      if (!packageResult.status.capabilities.includes("trusted-package-launch")) {
        supervisor.advance(
          2,
          `Rust host ${packageResult.status.hostVersion} connected on ${packageResult.status.target}`,
        );
        supervisor.unavailable(
          `Signed catalog entry ${packageResult.package.version} found in generation ${packageResult.package.catalogGeneration} · privileged package execution is not configured`,
          "PACKAGE_LAUNCH_PENDING",
        );
        return;
      }
      const launchResult = await startNativeLaunch(gameId, activeProfileId);
      if (launchSupervisor !== supervisor) {
        if (launchResult.ok) void cancelNativeLaunch(launchResult.launch.requestId);
        return;
      }
      if (!launchResult.ok) {
        supervisor.unavailable(launchResult.detail, launchResult.code);
        return;
      }
      activeNativeRequestId = launchResult.launch.requestId;
      supervisor.advance(
        2,
        `Signed ${packageResult.package.version} resolved for ${activeProfile} · host process lifecycle ${launchResult.launch.detailCode.toLowerCase().replaceAll("_", " ")}`,
      );
      await monitorNativeLaunch(supervisor, launchResult.launch);
      return;
    }

    const hostResult = await checkNativeHost();
    if (launchSupervisor !== supervisor) return;
    if (!hostResult.ok) {
      supervisor.unavailable(hostResult.detail, hostResult.code);
      return;
    }
    supervisor.advance(2, `Rust host ${hostResult.status.hostVersion} connected on ${hostResult.status.target}`);
    supervisor.unavailable("Rust host connected · no trusted installed package is available for this launch", "PACKAGE_NOT_INSTALLED");
  }

  async function monitorNativeLaunch(
    supervisor: LaunchSupervisor,
    initial: NativeLaunchSnapshot,
  ): Promise<void> {
    let snapshot = initial;
    while (
      launchSupervisor === supervisor &&
      activeNativeRequestId === snapshot.requestId
    ) {
      if (snapshot.state === "failed") {
        activeNativeRequestId = undefined;
        supervisor.crash(
          "The host could not start the verified package",
          snapshot.detailCode,
        );
        return;
      }
      if (snapshot.state === "completed") {
        activeNativeRequestId = undefined;
        supervisor.crash(
          "The game process exited before window readiness was proven",
          snapshot.detailCode,
        );
        return;
      }
      if (snapshot.state === "cancelled") {
        activeNativeRequestId = undefined;
        supervisor.unavailable("Native launch was cancelled", snapshot.detailCode);
        return;
      }
      if (["hung", "crashed", "unavailable"].includes(supervisor.snapshot.status)) {
        const requestId = snapshot.requestId;
        activeNativeRequestId = undefined;
        await cancelNativeLaunch(requestId);
        return;
      }

      supervisor.heartbeat(
        snapshot.state === "running"
          ? "Host process started · waiting for compositor window readiness"
          : "Host is preparing the verified package",
      );
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      if (
        launchSupervisor !== supervisor ||
        activeNativeRequestId !== snapshot.requestId
      ) {
        return;
      }
      const next = await getNativeLaunch(snapshot.requestId);
      if (!next.ok) {
        activeNativeRequestId = undefined;
        supervisor.unavailable(next.detail, next.code);
        return;
      }
      if (
        next.launch.gameId !== snapshot.gameId ||
        next.launch.profileId !== snapshot.profileId ||
        next.launch.sequence < snapshot.sequence
      ) {
        activeNativeRequestId = undefined;
        supervisor.unavailable(
          "Rust console host returned a conflicting launch lifecycle",
          "HOST_PROTOCOL_INVALID",
        );
        return;
      }
      snapshot = next.launch;
    }
  }

  function previewLaunch(adapter: LaunchAdapter): void {
    if (adapter === "native" || adapter === "retro") {
      launchHostedAdapter(adapter);
      return;
    }
    if (adapter === "remote-web") {
      const { supervisor } = beginSupervisedLaunch({
        ...baseLaunch(adapter, "VibeCoded Museum", "DEVELOPER PREVIEW / ONLINE"),
        action: { label: "Open museum", href: "https://vibecoded.games" },
      }, REMOTE_LAUNCH_BUDGET);
      supervisor.advance(1, "Network interface is online");
      supervisor.advance(2, "Remote origin fixed to vibecoded.games");
      supervisor.ready("Remote browser handoff is ready");
      return;
    }
    const session = baseLaunch(adapter, "Obstacle", "DEVELOPER PREVIEW / INSTALLED");
    const { supervisor } = beginSupervisedLaunch({ ...session, progress: 0 }, LOCAL_LAUNCH_BUDGET);
    supervisor.advance(1, "Local package verified", 1 / 3);
    supervisor.advance(2, "Console controls reserved", 2 / 3);
  }

  function previewFault(fault: LaunchFaultPreview): void {
    const heartbeatTimeoutMs = fault === "hung" ? 120 : 5_000;
    const slowAfterMs = fault === "slow" || fault === "hung" ? 60 : 2_000;
    const { run, supervisor } = beginSupervisedLaunch(
      { ...baseLaunch("local-web", "Obstacle", "FAULT INJECTION / LOCAL"), progress: 0 },
      { slowAfterMs, timeoutMs: 5_000, heartbeatTimeoutMs },
    );
    launchRetryOperation = (attempt) => {
      window.setTimeout(() => {
        if (!isCurrentLaunch(supervisor, run, attempt)) return;
        supervisor.advance(1, "Package rechecked", 1 / 3);
        supervisor.heartbeat("Replacement session responded");
        supervisor.advance(2, "Console controls restored", 2 / 3);
        supervisor.ready("Launch recovered and is ready");
      }, 120);
    };

    if (fault === "offline") supervisor.offline("Network disconnected before handoff");
    else if (fault === "crashed") supervisor.crash("Game process exited with code 137", "PROCESS_EXIT_137");
    else if (fault === "recovered") {
      supervisor.crash("Injected process exit", "INJECTED_CRASH");
      retryActiveLaunch();
    }
  }

  function closeLaunch(restoreFocus = true): void {
    if (!launchSession) return;
    if (activeNativeRequestId) {
      const requestId = activeNativeRequestId;
      activeNativeRequestId = undefined;
      void cancelNativeLaunch(requestId);
    }
    launchRun += 1;
    launchAttempt += 1;
    launchSession = undefined;
    disposeLaunchSupervisor();
    const target = launchReturnFocus;
    launchReturnFocus = null;
    if (restoreFocus) void tick().then(() => target?.isConnected && target.focus({ preventScroll: true }));
  }

  function completeLaunchAction(): void {
    closeLaunch(false);
  }

  function retryActiveLaunch(): void {
    if (!launchSupervisor || !launchSession?.canRetry) return;
    launchAttempt += 1;
    launchSupervisor.retry();
    launchRetryOperation?.(launchAttempt);
  }

  function isCurrentLaunch(supervisor: LaunchSupervisor, run: number, attempt: number): boolean {
    return launchSupervisor === supervisor && launchRun === run && launchAttempt === attempt;
  }

  function disposeLaunchSupervisor(): void {
    launchUnsubscribe?.();
    launchUnsubscribe = undefined;
    launchSupervisor?.dispose();
    launchSupervisor = undefined;
    launchRetryOperation = undefined;
  }

  function nextLaunchFrame(): Promise<void> {
    return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
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
          <button class="destination featured" type="button" onclick={() => void launchLocalWeb("obstacle", "Obstacle")}>
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
          <button type="button" onclick={() => void launchLocalWeb("obstacle", "Obstacle")}><span>01</span><strong>Obstacle</strong><small>Dodge · Duck · Jump</small><b>Ready</b></button>
          <button type="button" onclick={() => void launchLocalWeb("tracker", "Motion Lab")}><span>02</span><strong>Motion Lab</strong><small>Skeleton and signal diagnostics</small><b>Ready</b></button>
          <button type="button" onclick={() => void launchLocalWeb("shell", "Shell Lab")}><span>03</span><strong>Shell Lab</strong><small>Gesture navigation and recovery</small><b>Ready</b></button>
        </div>
      </div>

      <div class="launcher-view museum-view" data-launcher-view="museum" hidden={view !== "museum"}>
        <p class="view-kicker">VIBECODED.GAMES</p>
        <div class="museum-title"><h1>The museum is<br />a world of its own.</h1><span>LIVE / WEB</span></div>
        <p class="museum-copy">Walk through the full VibeCoded collection. The console host will supervise this web experience; this browser prototype opens a new tab.</p>
        <button class="primary-action" type="button" onclick={launchMuseum}>Enter the museum <span>↗</span></button>
        <p class="boundary-note">Internet required · Opens vibecoded.games</p>
      </div>

      <div class="launcher-view retro-view" data-launcher-view="retro" hidden={view !== "retro"}>
        <header class="view-header"><div><p class="view-kicker">RETRO HUB</p><h1>One library.<br />No clutter.</h1></div><p>RetroArch runs beneath the VCG shell so Home, loading, and recovery stay consistent.</p></header>
        <div class="empty-library">
          <span class="empty-glyph" aria-hidden="true">○</span>
          <div><strong>No retro packages installed</strong><p>Import games you are legally entitled to use from USB or a paired computer.</p></div>
          <button type="button" onclick={() => toast("The native importer will become available with the console host.")}>Import games</button>
        </div>
        <div class="library-list">
          <button type="button" onclick={() => launchHostedAdapter("retro", "2048", "retro-2048")}>
            <span>Q1</span><strong>2048</strong><small>Contentless public-domain core · artifact qualification pending</small><b>Candidate</b>
          </button>
        </div>
        <div class="retro-actions">
          <button type="button" onclick={() => launchHostedAdapter("retro")}>Open RetroArch</button>
          <button type="button" onclick={openSearch}>Search library</button>
        </div>
      </div>

      <div class="launcher-view profiles-view" data-launcher-view="profiles" hidden={view !== "profiles"}>
        <ProfilesView
          onselect={(profile) => {
            activeProfileId = profile.id;
            activeProfile = profile.name;
          }}
          ontoast={toast}
        />
      </div>

      <div class="launcher-view settings-view" data-launcher-view="settings" hidden={view !== "settings"}>
        <SettingsView bind:this={settings} {openMotionLab} onpreviewlaunch={previewLaunch} onpreviewfault={previewFault} ontoast={toast} />
      </div>
    </section>
  </div>

  <div class="launcher-toast" id="launcher-toast" hidden={!toastVisible} role="status">{toastMessage}</div>
  <SearchOverlay bind:this={search} items={searchItems} />
  {#if launchSession}
    <LaunchScreen session={launchSession} onexit={closeLaunch} onaction={completeLaunchAction} onretry={retryActiveLaunch} />
  {/if}
</main>
