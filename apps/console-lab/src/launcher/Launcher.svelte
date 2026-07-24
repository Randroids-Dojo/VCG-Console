<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import type { ConsoleInputAction } from "../gamepad-router";
  import {
    cancelNativeLaunch,
    checkNativeHost,
    checkNativePackage,
    getNativeLaunch,
    listNativePackages,
    startNativeLaunch,
    type NativeLaunchSnapshot,
    type NativePackageInventory,
  } from "../native-host-client";
  import BootScreen from "./BootScreen.svelte";
  import {
    applyAccessibilityPreferences,
    type AccessibilityPreferenceChange,
    type AccessibilityPreferenceSnapshot,
  } from "./accessibility-preferences";
  import CalibrationRehearsalView from "./CalibrationRehearsalView.svelte";
  import {
    AcceptedCalibrationResultCollection,
    CalibrationRehearsalController,
    type CalibrationReadyResult,
  } from "./calibration-rehearsal";
  import { launcherCatalog } from "./catalog.generated";
  import {
    HostedBrowserPreviewController,
    type HostedBrowserPreviewPlan,
  } from "./hosted-browser-preview";
  import LaunchScreen from "./LaunchScreen.svelte";
  import { LaunchSupervisor, type LaunchSupervisorOptions } from "./launch-supervisor";
  import {
    diagnosticUptimeMs,
    LocalDiagnosticBuffer,
  } from "./local-diagnostics";
  import { nativeLifecycleDetail } from "./native-lifecycle";
  import PortraitCaptureView from "./PortraitCaptureView.svelte";
  import {
    AcceptedPortraitCollection,
    PortraitCaptureController,
  } from "./portrait-capture";
  import ProfileManagementView from "./ProfileManagementView.svelte";
  import {
    PROFILE_MANAGEMENT_DEMO_PROFILES,
    PROFILE_MANAGEMENT_DEMO_PROGRESS,
    PROFILE_MANAGEMENT_DEMO_UNLINK_QUALIFICATIONS,
    ProfileManagementController,
    QualifiedProgressUnlinkCollection,
    type ProfileManagementCommitResult,
    type ProfileManagementSnapshot,
  } from "./profile-management";
  import ProfilesView from "./ProfilesView.svelte";
  import SearchOverlay from "./SearchOverlay.svelte";
  import SessionAdversarialView from "./SessionAdversarialView.svelte";
  import SettingsView from "./SettingsView.svelte";
  import type { LabMode, LaunchAdapter, LaunchFaultPreview, LaunchSession, LauncherOptions, LauncherView, LocalProfile, SearchItem, SettingsPanel } from "./types";
  import UnassignedProgressView from "./UnassignedProgressView.svelte";
  import {
    UNASSIGNED_PROGRESS_DEMO_ENTRIES,
    UnassignedProgressController,
  } from "./unassigned-progress";

  let { accessibilityPreferences, openMotionLab }: LauncherOptions = $props();
  let launcher: HTMLElement;
  let search: SearchOverlay;
  let settings: SettingsView;
  let portraitCapture: PortraitCaptureView;
  let profileManagement: ProfileManagementView;
  let calibrationRehearsal: CalibrationRehearsalView;
  let sessionAdversarial: SessionAdversarialView;
  let unassigned: UnassignedProgressView;
  let visible = $state(true);
  let view = $state<LauncherView>("home");
  const acceptedPortraits = new AcceptedPortraitCollection();
  const acceptedCalibrationResults =
    new AcceptedCalibrationResultCollection();
  const qualifiedProgressUnlinks =
    new QualifiedProgressUnlinkCollection(
      PROFILE_MANAGEMENT_DEMO_UNLINK_QUALIFICATIONS,
    );
  const profileManagementController = new ProfileManagementController(
    PROFILE_MANAGEMENT_DEMO_PROFILES,
    PROFILE_MANAGEMENT_DEMO_PROGRESS,
    acceptedPortraits,
    acceptedCalibrationResults,
    qualifiedProgressUnlinks,
  );
  let profileManagementSnapshot = $state(
    profileManagementController.snapshot(),
  );
  let profiles = $state<LocalProfile[]>(
    localProfiles(profileManagementController.snapshot()),
  );
  let activeProfile = $state("Randy");
  let activeProfileId = $state("profile-randy");
  let managementProfileId = $state<string | null>(null);
  let calibrationProfileId = $state<string | null>(null);
  let portraitProfileId = $state<string | null>(null);
  let portraitReturnView = $state<"profiles" | "profile-management">(
    "profiles",
  );
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
  let hostedBrowserPreviewPlan =
    $state.raw<HostedBrowserPreviewPlan | undefined>();
  let activeNativeRequestId: string | undefined;
  let nativePackageInventory = $state<NativePackageInventory | undefined>();
  let nativePackageInventoryState = $state<"checking" | "available" | "unavailable">("checking");
  let nativePackageInventoryRefresh: Promise<void> | undefined;
  let accessibilitySnapshot = $state<AccessibilityPreferenceSnapshot>(
    untrack(() => accessibilityPreferences.snapshot()),
  );
  const localDiagnostics = new LocalDiagnosticBuffer();
  const portraitCaptureController = new PortraitCaptureController(
    acceptedPortraits,
  );
  let portraitCaptureSnapshot = $state(portraitCaptureController.snapshot());
  const calibrationRehearsalController =
    new CalibrationRehearsalController(acceptedCalibrationResults);
  let calibrationRehearsalSnapshot = $state(
    calibrationRehearsalController.snapshot(),
  );
  const unassignedProgressController = new UnassignedProgressController(
    UNASSIGNED_PROGRESS_DEMO_ENTRIES,
    [
      {
        profileId: "profile-randy",
        gameId: "obstacle",
        slotId: "main-slot",
      },
      {
        profileId: "profile-guest",
        gameId: "godot-motion-game",
        slotId: "campaign",
      },
    ],
  );
  let unassignedProgressSnapshot = $state(unassignedProgressController.snapshot());

  type CatalogLaunchExpectation = {
    gameId: string;
    version: string;
    runtime: string;
  };

  const LOCAL_LAUNCH_BUDGET: LaunchSupervisorOptions = launcherCatalog.launchBudgets.local;
  const REMOTE_LAUNCH_BUDGET: LaunchSupervisorOptions = launcherCatalog.launchBudgets.remote;
  const museum = launcherCatalog.museum;
  const museumHost = new URL(museum.entrypoint).host;
  const hostedBrowserPreview = new HostedBrowserPreviewController([
    {
      id: museum.id,
      entrypoint: museum.entrypoint,
    },
  ]);
  const museumCatalogEntries = launcherCatalog.entries.filter((entry) => entry.surface === "museum");
  const retroCatalogEntries = launcherCatalog.entries.filter((entry) => entry.surface === "retro");

  const searchItems: SearchItem[] = [
    { title: "Obstacle", detail: "Motion game", group: "Motion", terms: "dodge duck jump body", action: () => void launchLocalWeb("obstacle", "Obstacle") },
    { title: "Motion Lab", detail: "Skeleton diagnostics", group: "Motion", terms: "camera tracker debug signal", action: () => void launchLocalWeb("tracker", "Motion Lab") },
    { title: "Shell Lab", detail: "Gesture navigation", group: "Motion", terms: "swipe select back pause", action: () => void launchLocalWeb("shell", "Shell Lab") },
    { title: "Session authority rehearsal", detail: "Synthetic spectator and takeover abuse suite", group: "Motion", terms: "candidate join spectator pet mirror television passerby takeover recovery", action: () => showView("session-adversarial") },
    { title: museum.title, detail: museumHost, group: "Online", terms: museum.searchTerms.join(" "), action: () => showView("museum") },
    ...launcherCatalog.entries.map((entry): SearchItem => ({
      title: entry.title,
      detail: entry.searchDetail,
      group: entry.surface === "museum" ? "Game" : "Retro",
      terms: [entry.id, entry.runtime, entry.network, entry.compatibilityStatus, ...entry.searchTerms].join(" "),
      action: () => showView(entry.surface),
    })),
    { title: "RetroArch", detail: "Retro library", group: "Local", terms: "retro emulator arcade rom library", action: () => showView("retro") },
    { title: "Profiles", detail: "Players on this console", group: "System", terms: "profile player portrait calibration", action: () => showView("profiles") },
    { title: "Calibration rehearsal", detail: "Synthetic player and play-zone check", group: "System", terms: "profile floor zone scale stance range calibration", action: () => openCalibrationRehearsal(activeProfileId) },
    { title: "Portrait rehearsal", detail: "Synthetic device-only capture lifecycle", group: "System", terms: "profile portrait camera preview retake consent", action: () => openPortraitCapture(activeProfileId) },
    { title: "Unassigned progress", detail: "Device-only saves without a profile", group: "System", terms: "save claim delete local progress", action: () => showView("unassigned") },
    { title: "Accessibility", detail: "Text, contrast, motion, input, and cues", group: "Settings", terms: "large text contrast reduced motion seated remap audio cues", action: () => showSettings("accessibility") },
    { title: "Wi-Fi", detail: "Network setup", group: "Settings", terms: "wifi internet network connection", action: () => showSettings("network") },
    { title: "Storage", detail: "Capacity and usage", group: "Settings", terms: "disk space capacity games", action: () => showSettings("storage") },
    { title: "Developer options", detail: "Diagnostics and pairing", group: "Settings", terms: "debug diagnostic developer version", action: () => showSettings("developer") },
  ];

  onMount(() => {
    localDiagnostics.record("launcher.ready", diagnosticUptimeMs());
    paintClock();
    clockTimer = window.setInterval(paintClock, 15_000);
    void positionSignal();
    void refreshNativePackageInventory();
    window.addEventListener("focus", refreshNativePackageInventory);
    document.addEventListener("visibilitychange", refreshVisibleNativePackageInventory);
  });

  $effect(() => {
    applyAccessibilityPreferences(document.documentElement, accessibilitySnapshot);
  });

  function changeAccessibility(change: AccessibilityPreferenceChange): void {
    accessibilitySnapshot = accessibilityPreferences.update(change);
  }

  function resetAccessibility(): void {
    accessibilitySnapshot = accessibilityPreferences.reset();
  }

  function previewAudioCue(): void {
    if (accessibilitySnapshot.preferences.audioCues === "off") {
      toast("Audio cues are off.");
      return;
    }
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.addEventListener("ended", () => void context.close(), { once: true });
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
      toast("Audio cue played locally.");
    } catch {
      toast("Audio cue unavailable on this browser.");
    }
  }

  function selectProfile(profile: LocalProfile): void {
    activeProfileId = profile.id;
    activeProfile = profile.name;
  }

  function localProfiles(
    snapshot: ProfileManagementSnapshot,
  ): LocalProfile[] {
    return snapshot.profiles.map(({ id, name, detail }) => ({
      id,
      name,
      detail,
    }));
  }

  function applyProfileManagementSnapshot(
    snapshot: ProfileManagementSnapshot,
  ): void {
    profileManagementSnapshot = snapshot;
    profiles = localProfiles(snapshot);
    portraitCaptureSnapshot = portraitCaptureController.snapshot();
    const current = profiles.find(
      (profile) => profile.id === activeProfileId,
    );
    const fallback = current ?? profiles[0] ?? null;
    activeProfileId = fallback?.id ?? "";
    activeProfile = fallback?.name ?? "No profile";
  }

  function openProfileManagement(profileId: string | null): void {
    if (
      profileId !== null
      && !profiles.some((profile) => profile.id === profileId)
    ) {
      toast("Select an existing local profile first.");
      return;
    }
    managementProfileId = profileId;
    void showView("profile-management");
  }

  function profileCreated(profileId: string): void {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      toast("Created profile is unavailable.");
      return;
    }
    managementProfileId = profile.id;
    selectProfile(profile);
  }

  function profileDeleted(
    profileId: string,
    result: ProfileManagementCommitResult,
  ): void {
    applyProfileManagementSnapshot(result.snapshot);
    managementProfileId = null;
    const unassigned = result.disposition.unassignedProgressCount;
    const permanentlyDeleted =
      result.disposition.permanentlyDeletedProgressCount;
    toast(
      `Profile deleted in the isolated profile rehearsal. ${unassigned} local progress item${unassigned === 1 ? " is" : "s are"} now unassigned inside that model; ${permanentlyDeleted} explicitly selected item${permanentlyDeleted === 1 ? " was" : "s were"} permanently deleted. The separate Unassigned Progress sample list and hosted services were not changed.`,
    );
    void showView("profiles");
    if (profileId === portraitProfileId) portraitProfileId = null;
    if (profileId === calibrationProfileId) calibrationProfileId = null;
  }

  function finishPortraitCapture(): void {
    applyProfileManagementSnapshot(profileManagementController.snapshot());
    void showView(portraitReturnView);
  }

  function leavePortraitCapture(): void {
    void showView(portraitReturnView);
  }

  function openCalibrationRehearsal(profileId: string): void {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      toast("Select an existing local profile first.");
      return;
    }
    try {
      managementProfileId = profile.id;
      calibrationProfileId = profile.id;
      calibrationRehearsalSnapshot = calibrationRehearsalController.open(
        profile.id,
        "room-fixture-a",
        "camera-fixture-a",
        Math.floor(performance.now()),
      );
      void showView("calibration");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Calibration rehearsal unavailable.",
      );
    }
  }

  function completeCalibrationRehearsal(
    result: CalibrationReadyResult,
  ): void {
    try {
      const nowMs = Math.floor(performance.now());
      const committed = profileManagementController.commit(
        profileManagementController.planApplyCalibration(result, nowMs),
        nowMs,
      );
      applyProfileManagementSnapshot(committed.snapshot);
      toast(
        result.limited
          ? "Synthetic calibration applied with conservative limits."
          : "Synthetic calibration applied to the selected profile.",
      );
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Synthetic calibration could not be applied.");
    }
  }

  function openPortraitCapture(profileId: string): void {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      toast("Select an existing local profile first.");
      return;
    }
    try {
      portraitReturnView =
        view === "profile-management" ? "profile-management" : "profiles";
      portraitProfileId = profile.id;
      portraitCaptureSnapshot = portraitCaptureController.open(
        profile.id,
        Math.floor(performance.now()),
      );
      void showView("portrait");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Portrait rehearsal unavailable.");
    }
  }

  onDestroy(() => {
    if (clockTimer !== undefined) window.clearInterval(clockTimer);
    if (toastTimer !== undefined) window.clearTimeout(toastTimer);
    window.removeEventListener("focus", refreshNativePackageInventory);
    document.removeEventListener("visibilitychange", refreshVisibleNativePackageInventory);
    discardHostedBrowserPreview();
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
    if (view === "portrait") portraitCapture.cancelPending();
    if (view === "profile-management") profileManagement.cancelPending();
    if (view === "calibration") calibrationRehearsal.cancelPending();
    visible = false;
  }

  export async function showView(next: LauncherView): Promise<void> {
    if (
      view === "portrait"
      && next !== "portrait"
      && portraitCaptureSnapshot.phase !== "idle"
    ) {
      portraitCapture.cancelPending();
    }
    if (
      view === "profile-management"
      && next !== "profile-management"
    ) {
      profileManagement.cancelPending();
    }
    if (
      view === "calibration"
      && next !== "calibration"
      && calibrationRehearsalSnapshot.phase !== "idle"
    ) {
      calibrationRehearsal.cancelPending();
    }
    view = next;
    if (next === "retro") void refreshNativePackageInventory();
    await tick();
    await positionSignal();
    if (next === "portrait") {
      launcher.querySelector<HTMLButtonElement>(".portrait-primary")?.focus({
        preventScroll: true,
      });
    } else if (next === "profile-management") {
      (
        launcher.querySelector<HTMLInputElement>("#managed-profile-name")
        ?? launcher.querySelector<HTMLButtonElement>(
          ".profile-management-actions button",
        )
      )?.focus({ preventScroll: true });
    } else if (next === "calibration") {
      launcher
        .querySelector<HTMLButtonElement>(
          '[data-launcher-view="calibration"] .calibration-phase-actions button',
        )
        ?.focus({ preventScroll: true });
    } else if (next === "session-adversarial") {
      launcher
        .querySelector<HTMLButtonElement>(
          '[data-launcher-view="session-adversarial"] .session-adversarial-actions button',
        )
        ?.focus({ preventScroll: true });
    } else if (next === "unassigned") {
      launcher.querySelector<HTMLButtonElement>(".unassigned-list button")?.focus({
        preventScroll: true,
      });
    } else {
      launcher.querySelector<HTMLButtonElement>(`.launcher-nav [data-view-target="${next}"]`)?.focus({ preventScroll: true });
    }
  }

  export async function showSettings(panel: SettingsPanel): Promise<void> {
    if (view === "portrait" && portraitCaptureSnapshot.phase !== "idle") {
      portraitCapture.cancelPending();
    }
    if (view === "profile-management") profileManagement.cancelPending();
    if (view === "calibration") calibrationRehearsal.cancelPending();
    view = "settings";
    await tick();
    settings.show(panel);
    await positionSignal();
  }

  export function back(): void {
    if (launchSession) closeLaunch();
    else if (search.isOpen()) search.close();
    else if (view === "settings" && settings.cancelPendingModeConfirmation()) return;
    else if (view === "portrait") {
      portraitCapture.cancelPending();
      showView(portraitReturnView);
    }
    else if (
      view === "profile-management"
      && profileManagement.cancelPending()
    ) return;
    else if (view === "profile-management") showView("profiles");
    else if (view === "calibration") {
      calibrationRehearsal.cancelPending();
      showView("profile-management");
    }
    else if (view === "session-adversarial") showView("motion");
    else if (view === "unassigned" && unassigned.cancelPending()) return;
    else if (view === "unassigned") showView("profiles");
    else if (view !== "home") showView("home");
  }

  export function handleInput(action: ConsoleInputAction): void {
    if (action === "home") {
      closeLaunch();
      if (view === "portrait") portraitCapture.cancelPending();
      if (view === "profile-management") profileManagement.cancelPending();
      if (view === "calibration") calibrationRehearsal.cancelPending();
      showView("home");
      return;
    }
    if (action === "back") {
      back();
      return;
    }

    const visibleModal = [
      ...launcher.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
    ].find((element) => element.offsetParent !== null);
    const controlRoot = launchSession
      ? launcher.querySelector<HTMLElement>(".launch-screen") ?? launcher
      : visibleModal ?? launcher;
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
    if (view === "portrait" && portraitCaptureSnapshot.phase !== "idle") {
      portraitCapture.cancelPending();
      view = "home";
    }
    if (view === "profile-management") {
      profileManagement.cancelPending();
      view = "home";
    }
    if (view === "calibration") {
      calibrationRehearsal.cancelPending();
      view = "home";
    }
    void search.open();
  }

  function openLab(mode: LabMode): void {
    openMotionLab(mode);
  }

  async function refreshNativePackageInventory(): Promise<void> {
    if (nativePackageInventoryRefresh) return nativePackageInventoryRefresh;
    nativePackageInventoryRefresh = loadNativePackageInventory();
    try {
      await nativePackageInventoryRefresh;
    } finally {
      nativePackageInventoryRefresh = undefined;
    }
  }

  async function loadNativePackageInventory(): Promise<void> {
    const result = await listNativePackages();
    if (result.ok) {
      nativePackageInventory = result.inventory;
      setNativePackageInventoryState("available");
      return;
    }
    nativePackageInventory = undefined;
    setNativePackageInventoryState("unavailable");
  }

  function setNativePackageInventoryState(
    next: "available" | "unavailable",
  ): void {
    if (nativePackageInventoryState !== next) {
      localDiagnostics.record(`package.inventory.${next}`, diagnosticUptimeMs());
    }
    nativePackageInventoryState = next;
  }

  function refreshVisibleNativePackageInventory(): void {
    if (document.visibilityState === "visible") void refreshNativePackageInventory();
  }

  function isCatalogEntryInstalled(entry: (typeof launcherCatalog.entries)[number]): boolean {
    return nativePackageInventory?.packages.some(
      (installed) =>
        installed.id === entry.id &&
        installed.version === entry.version &&
        installed.runtime === entry.runtime,
    ) ?? false;
  }

  function installedPackageSummary(): string {
    if (nativePackageInventoryState === "checking") return "Checking signed package catalog";
    if (nativePackageInventoryState === "unavailable") return "Local package catalog unavailable";
    const count = launcherCatalog.entries.filter(isCatalogEntryInstalled).length;
    return `${count} signed ${count === 1 ? "package" : "packages"} installed`;
  }

  function hasInstalledRetroPackage(): boolean {
    return retroCatalogEntries.some(isCatalogEntryInstalled);
  }

  function baseLaunch(adapter: LaunchAdapter, title: string, context: string): LaunchSession {
    const definitions: Record<LaunchAdapter, Pick<LaunchSession, "adapterLabel" | "phases">> = {
      "remote-web": {
        adapterLabel: "REMOTE WEB",
        phases: [
          { label: "Check connection", detail: "Read the console network state" },
          { label: "Confirm destination", detail: "Keep the remote origin visible" },
          { label: "Preview", detail: "Open a separate unsupervised browser tab" },
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
    localDiagnostics.record("launch.started", diagnosticUptimeMs());
    discardHostedBrowserPreview();
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
      ...baseLaunch("remote-web", museum.title, museum.context),
      action: { label: "Open unsupervised preview" },
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
    supervisor.advance(2, `Remote origin fixed to ${museumHost}`);
    hostedBrowserPreviewPlan = hostedBrowserPreview.prepare(museum.id);
    supervisor.ready(
      "Browser-only preview ready · reachability and containment are not verified",
    );
  }

  function launchHostedAdapter(
    adapter: "native" | "retro",
    requestedTitle?: string,
    expected?: CatalogLaunchExpectation,
  ): void {
    const title = requestedTitle ?? (adapter === "retro" ? "RetroArch" : "Native game");
    const context = adapter === "retro" ? "RETRO HUB / LOCAL" : "DEVELOPER PREVIEW / LOCAL";
    const { supervisor } = beginSupervisedLaunch(baseLaunch(adapter, title, context), LOCAL_LAUNCH_BUDGET);
    launchRetryOperation = () => void runHostedAttempt(supervisor, expected);
    void runHostedAttempt(supervisor, expected);
  }

  async function runHostedAttempt(
    supervisor: LaunchSupervisor,
    expected?: CatalogLaunchExpectation,
  ): Promise<void> {
    supervisor.advance(1, "Requesting the Rust console host");
    if (expected) {
      const inventory = nativePackageInventory;
      const inventoryMatches =
        nativePackageInventoryState === "available" &&
        inventory?.packages.some(
          (installed) =>
            installed.id === expected.gameId &&
            installed.version === expected.version &&
            installed.runtime === expected.runtime,
        );
      if (!inventory || !inventoryMatches) {
        supervisor.unavailable(
          "The selected release is not present in the current signed package inventory",
          "PACKAGE_RELEASE_MISMATCH",
        );
        return;
      }
      if (activeNativeRequestId) {
        const previousRequestId = activeNativeRequestId;
        activeNativeRequestId = undefined;
        await cancelNativeLaunch(previousRequestId);
        if (launchSupervisor !== supervisor) return;
      }
      const packageResult = await checkNativePackage(expected.gameId);
      if (launchSupervisor !== supervisor) return;
      if (!packageResult.ok) {
        supervisor.unavailable(packageResult.detail, packageResult.code);
        return;
      }
      if (
        packageResult.package.catalogGeneration !== inventory.catalogGeneration ||
        packageResult.package.version !== expected.version ||
        packageResult.package.runtime !== expected.runtime
      ) {
        supervisor.unavailable(
          `Installed generation ${packageResult.package.catalogGeneration} ${packageResult.package.version} ${packageResult.package.runtime} release does not match selected generation ${inventory.catalogGeneration} ${expected.version} ${expected.runtime}`,
          "PACKAGE_RELEASE_MISMATCH",
        );
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
      const launchResult = await startNativeLaunch(expected.gameId, activeProfileId);
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

      supervisor.heartbeat(nativeLifecycleDetail(snapshot));
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
        ...baseLaunch(adapter, museum.title, "DEVELOPER PREVIEW / ONLINE"),
        action: { label: "Open unsupervised preview" },
      }, REMOTE_LAUNCH_BUDGET);
      supervisor.advance(1, "Network interface is online");
      supervisor.advance(2, `Remote origin fixed to ${museumHost}`);
      hostedBrowserPreviewPlan = hostedBrowserPreview.prepare(museum.id);
      supervisor.ready(
        "Browser-only preview ready · reachability and containment are not verified",
      );
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
    discardHostedBrowserPreview();
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
    if (launchSession?.adapter === "remote-web") {
      if (hostedBrowserPreviewPlan === undefined) {
        toast("Preview authorization expired. Start the preview again.");
        return;
      }
      const result = hostedBrowserPreview.open(
        hostedBrowserPreviewPlan,
        (entrypoint, target, features) =>
          window.open(entrypoint, target, features),
      );
      hostedBrowserPreviewPlan = undefined;
      if (!result.opened) {
        hostedBrowserPreviewPlan = hostedBrowserPreview.prepare(museum.id);
        toast("The browser blocked the separate preview tab. Try again.");
        return;
      }
    }
    closeLaunch(false);
  }

  function discardHostedBrowserPreview(): void {
    if (hostedBrowserPreviewPlan === undefined) return;
    hostedBrowserPreview.discard(hostedBrowserPreviewPlan);
    hostedBrowserPreviewPlan = undefined;
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
    <button class="launcher-brand" type="button" data-launcher-home data-tv-action data-tv-critical-text aria-label="VCG Console home" onclick={() => showView("home")}>VCG<span>/</span>CONSOLE</button>
    <button class="search-trigger" id="search-trigger" type="button" data-tv-action data-tv-critical-text aria-haspopup="dialog" onclick={openSearch}>
      <span>Search games, hubs, and settings</span><kbd>/</kbd>
    </button>
    <div class="launcher-presence">
      <button type="button" data-tv-action data-tv-critical-text onclick={() => showView("profiles")}><span class="profile-orbit" aria-hidden="true">{activeProfile.slice(0, 1).toUpperCase()}</span><span id="active-profile-name">{activeProfile}</span></button>
      <time id="launcher-clock" aria-label="Local time">{clock}</time>
    </div>
  </header>

  <div class="launcher-frame">
    <nav class="launcher-nav" aria-label="Launcher">
      <div class="nav-signal" aria-hidden="true"><span style:transform={`translateY(${navSignalOffset}px)`}></span></div>
      {#each ["home", "motion", "museum", "retro"] as target}
        <button class:active={view === target || (target === "motion" && view === "session-adversarial")} type="button" data-view-target={target} data-tv-action data-tv-critical-text onclick={() => showView(target as LauncherView)}>{target[0]?.toUpperCase() + target.slice(1)}</button>
      {/each}
      <span class="nav-spacer"></span>
      {#each ["profiles", "settings"] as target}
        <button class:active={view === target || (target === "profiles" && (view === "profile-management" || view === "calibration" || view === "portrait" || view === "unassigned"))} type="button" data-view-target={target} data-tv-action data-tv-critical-text onclick={() => showView(target as LauncherView)}>{target[0]?.toUpperCase() + target.slice(1)}</button>
      {/each}
    </nav>

    <section class="launcher-content">
      <div class="launcher-view home-view" data-launcher-view="home" hidden={view !== "home"}>
        <div class="home-heading">
          <p class="view-kicker" data-tv-critical-text>READY / LOCAL</p>
          <h1 data-tv-critical-text>Good evening,<br /><span id="home-profile-name">{activeProfile}.</span></h1>
          <p data-tv-critical-text>Choose where to play.</p>
        </div>
        <div class="home-destinations" aria-label="Game destinations">
          <button class="destination featured" type="button" data-tv-action onclick={() => void launchLocalWeb("obstacle", "Obstacle")}>
            <span class="destination-index" data-tv-critical-text>MOTION / 01</span><strong data-tv-critical-text>Obstacle</strong><small>Body-controlled survival lab</small><span class="destination-action" data-tv-critical-text>Continue <b>→</b></span>
          </button>
          <button class="destination" type="button" data-tv-action onclick={() => showView("museum")}>
            <span class="destination-index" data-tv-critical-text>ONLINE / 02</span><strong data-tv-critical-text>{museum.title}</strong><small>Explore the complete collection</small><span class="destination-action" data-tv-critical-text>Enter <b>→</b></span>
          </button>
          <button class="destination" type="button" data-tv-action onclick={() => showView("retro")}>
            <span class="destination-index" data-tv-critical-text>LOCAL / 03</span><strong data-tv-critical-text>RetroArch</strong><small>Your installed retro library</small><span class="destination-action" data-tv-critical-text>Open <b>→</b></span>
          </button>
        </div>
        <footer class="home-status"><span data-tv-critical-text><i></i> Console ready</span><span data-tv-critical-text>{installedPackageSummary()}</span><span data-tv-critical-text>Network setup required</span></footer>
      </div>

      <div class="launcher-view list-view" data-launcher-view="motion" hidden={view !== "motion"}>
        <header class="view-header"><div><p class="view-kicker">MOTION HUB</p><h1>Move to play.</h1></div><p>Camera stays local. Every experience keeps a controller exit.</p></header>
        <div class="library-list">
          <button type="button" onclick={() => void launchLocalWeb("obstacle", "Obstacle")}><span>01</span><strong>Obstacle</strong><small>Dodge · Duck · Jump</small><b>Ready</b></button>
          <button type="button" onclick={() => void launchLocalWeb("tracker", "Motion Lab")}><span>02</span><strong>Motion Lab</strong><small>Skeleton and signal diagnostics</small><b>Ready</b></button>
          <button type="button" onclick={() => void launchLocalWeb("shell", "Shell Lab")}><span>03</span><strong>Shell Lab</strong><small>Gesture navigation and recovery</small><b>Ready</b></button>
          <button type="button" onclick={() => showView("session-adversarial")}><span>04</span><strong>Session authority</strong><small>Spectator, pet, mirror, and takeover rehearsal</small><b>Synthetic</b></button>
        </div>
      </div>

      <div class="launcher-view session-adversarial-view" data-launcher-view="session-adversarial" hidden={view !== "session-adversarial"}>
        <SessionAdversarialView
          bind:this={sessionAdversarial}
          onback={() => showView("motion")}
        />
      </div>

      <div class="launcher-view museum-view" data-launcher-view="museum" hidden={view !== "museum"}>
        <p class="view-kicker">{museumHost.toUpperCase()}</p>
        <div class="museum-title"><h1>The museum is<br />a world of its own.</h1><span>LIVE / WEB</span></div>
        <p class="museum-copy">Walk through the full VibeCoded collection. This browser prototype can open only the cataloged origin in a separate tab, but does not supervise or contain it.</p>
        <button class="primary-action" type="button" onclick={launchMuseum}>Enter the museum <span>↗</span></button>
        <p class="boundary-note">Internet required · Unsupervised preview · Opens {museumHost}</p>
        <div class="museum-catalog" aria-label="Canonical museum catalog">
          {#each museumCatalogEntries as entry}
            <span><b>{entry.displayIndex}</b><strong>{entry.title}</strong><small>{entry.statusLabel}</small></span>
          {/each}
        </div>
      </div>

      <div class="launcher-view retro-view" data-launcher-view="retro" hidden={view !== "retro"}>
        <header class="view-header"><div><p class="view-kicker">RETRO HUB</p><h1>One library.<br />No clutter.</h1></div><p>RetroArch runs beneath the VCG shell so Home, loading, and recovery stay consistent.</p></header>
        {#if nativePackageInventoryState === "checking"}
          <div class="empty-library" aria-live="polite">
            <span class="empty-glyph" aria-hidden="true">○</span>
            <div><strong>Checking installed retro catalog</strong><p>Waiting for the authenticated native console host.</p></div>
          </div>
        {:else if nativePackageInventoryState === "unavailable"}
          <div class="empty-library">
            <span class="empty-glyph" aria-hidden="true">○</span>
            <div><strong>Installed retro catalog unavailable</strong><p>Connect the native console host to verify signed local packages.</p></div>
            <button type="button" onclick={() => toast("The native importer will become available with the console host.")}>Import games</button>
          </div>
        {:else if !hasInstalledRetroPackage()}
          <div class="empty-library">
            <span class="empty-glyph" aria-hidden="true">○</span>
            <div><strong>No retro packages installed</strong><p>Import games you are legally entitled to use from USB or a paired computer.</p></div>
            <button type="button" onclick={() => toast("The native importer will become available with the console host.")}>Import games</button>
          </div>
        {/if}
        <div class="library-list">
          {#each retroCatalogEntries as entry}
            <button
              type="button"
              onclick={() =>
                launchHostedAdapter("retro", entry.title, {
                  gameId: entry.id,
                  version: entry.version,
                  runtime: entry.runtime,
                })}
            >
              <span>{entry.displayIndex}</span><strong>{entry.title}</strong><small>{entry.summary}</small><b>{isCatalogEntryInstalled(entry) ? "Installed" : entry.statusLabel}</b>
            </button>
          {/each}
        </div>
        <div class="retro-actions">
          <button type="button" onclick={() => launchHostedAdapter("retro")}>Open RetroArch</button>
          <button type="button" onclick={openSearch}>Search library</button>
        </div>
      </div>

      <div class="launcher-view profiles-view" data-launcher-view="profiles" hidden={view !== "profiles"}>
        <ProfilesView
          {profiles}
          activeId={activeProfileId}
          unassignedCount={unassignedProgressSnapshot.entries.length}
          acceptedPortraits={portraitCaptureSnapshot.acceptedPortraits}
          onselect={selectProfile}
          onmanage={openProfileManagement}
          onportrait={openPortraitCapture}
          onunassigned={() => showView("unassigned")}
        />
      </div>

      <div class="launcher-view profile-management-view" data-launcher-view="profile-management" hidden={view !== "profile-management"}>
        <ProfileManagementView
          bind:this={profileManagement}
          controller={profileManagementController}
          snapshot={profileManagementSnapshot}
          profileId={managementProfileId}
          onchanged={applyProfileManagementSnapshot}
          oncreated={profileCreated}
          ondeleted={profileDeleted}
          onportrait={openPortraitCapture}
          oncalibrate={openCalibrationRehearsal}
          onback={() => showView("profiles")}
          ontoast={toast}
        />
      </div>

      <div class="launcher-view calibration-view" data-launcher-view="calibration" hidden={view !== "calibration"}>
        <CalibrationRehearsalView
          bind:this={calibrationRehearsal}
          controller={calibrationRehearsalController}
          snapshot={calibrationRehearsalSnapshot}
          profile={profiles.find((profile) => profile.id === calibrationProfileId) ?? null}
          onchanged={(snapshot) => {
            calibrationRehearsalSnapshot = snapshot;
          }}
          oncomplete={completeCalibrationRehearsal}
          onback={() => showView("profile-management")}
          ontoast={toast}
        />
      </div>

      <div class="launcher-view portrait-view" data-launcher-view="portrait" hidden={view !== "portrait"}>
        <PortraitCaptureView
          bind:this={portraitCapture}
          controller={portraitCaptureController}
          snapshot={portraitCaptureSnapshot}
          profile={profiles.find((profile) => profile.id === portraitProfileId) ?? null}
          onchanged={(snapshot) => {
            portraitCaptureSnapshot = snapshot;
          }}
          oncomplete={finishPortraitCapture}
          onback={leavePortraitCapture}
          ontoast={toast}
        />
      </div>

      <div class="launcher-view unassigned-view" data-launcher-view="unassigned" hidden={view !== "unassigned"}>
        <UnassignedProgressView
          bind:this={unassigned}
          controller={unassignedProgressController}
          snapshot={unassignedProgressSnapshot}
          {profiles}
          onback={() => showView("profiles")}
          onchanged={(snapshot) => {
            unassignedProgressSnapshot = snapshot;
          }}
          ontoast={toast}
        />
      </div>

      <div class="launcher-view settings-view" data-launcher-view="settings" hidden={view !== "settings"}>
        <SettingsView
          bind:this={settings}
          {openMotionLab}
          {activeProfileId}
          {localDiagnostics}
          accessibility={accessibilitySnapshot}
          onaccessibilitychange={changeAccessibility}
          onaccessibilityreset={resetAccessibility}
          onpreviewaudiocue={previewAudioCue}
          onpreviewlaunch={previewLaunch}
          onpreviewfault={previewFault}
          ontoast={toast}
        />
      </div>
    </section>
  </div>

  <div class="launcher-toast" id="launcher-toast" hidden={!toastVisible} role="status">{toastMessage}</div>
  <SearchOverlay bind:this={search} items={searchItems} />
  {#if launchSession}
    <LaunchScreen session={launchSession} onexit={closeLaunch} onaction={completeLaunchAction} onretry={retryActiveLaunch} />
  {/if}
</main>
