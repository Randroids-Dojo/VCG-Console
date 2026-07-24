<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    ConsoleOperatingModeController,
    type ConsoleOperatingModeSnapshot,
  } from "./operating-mode";
  import {
    diagnosticUptimeMs,
    type LocalDiagnosticCode,
    type LocalDiagnosticBuffer,
    type PreparedLocalDiagnosticExport,
  } from "./local-diagnostics";
  import type {
    AccessibilityPreferenceChange,
    AccessibilityPreferenceSnapshot,
  } from "./accessibility-preferences";
  import type { LabMode, LaunchAdapter, LaunchFaultPreview, SettingsPanel } from "./types";

  let {
    openMotionLab,
    onpreviewlaunch,
    onpreviewfault,
    ontoast,
    activeProfileId,
    localDiagnostics,
    accessibility,
    onaccessibilitychange,
    onaccessibilityreset,
    onpreviewaudiocue,
  }: {
    openMotionLab: (mode?: LabMode) => void;
    onpreviewlaunch: (adapter: LaunchAdapter) => void;
    onpreviewfault: (fault: LaunchFaultPreview) => void;
    ontoast: (message: string) => void;
    activeProfileId: string;
    localDiagnostics: LocalDiagnosticBuffer;
    accessibility: AccessibilityPreferenceSnapshot;
    onaccessibilitychange: (change: AccessibilityPreferenceChange) => void;
    onaccessibilityreset: () => void;
    onpreviewaudiocue: () => void;
  } = $props();
  let panel = $state<SettingsPanel>("system");
  const panelPresentation: Record<SettingsPanel, { title: string; detail: string }> = {
    system: {
      title: "System.",
      detail: "Only controls that belong on the television.",
    },
    accessibility: {
      title: "Access.",
      detail: "Readable, calm, and recoverable before a game begins.",
    },
    network: {
      title: "Wi-Fi.",
      detail: "Online play is optional. Local play stays available.",
    },
    storage: {
      title: "Storage.",
      detail: "Capacity stays separate from recovery headroom.",
    },
    developer: {
      title: "Developer.",
      detail: "Privileged tools stay explicit and visibly separate.",
    },
  };
  let scanning = $state(false);
  let scanComplete = $state(false);
  let diagnostics = $state(false);
  const operatingMode = new ConsoleOperatingModeController();
  let operatingModeSnapshot = $state<ConsoleOperatingModeSnapshot>(operatingMode.snapshot());
  let diagnosticReview = $state.raw<PreparedLocalDiagnosticExport | undefined>();
  let diagnosticExportArmed = $state(false);
  let observedProfileId: string | undefined;
  let operatingModeElement: HTMLElement;
  let scanTimer: number | undefined;
  let operatingModeTimer: number | undefined;

  $effect(() => {
    if (observedProfileId === undefined) {
      observedProfileId = activeProfileId;
    } else if (activeProfileId !== observedProfileId) {
      observedProfileId = activeProfileId;
      const wasElevated =
        operatingModeSnapshot.mode !== "family" ||
        operatingModeSnapshot.pendingConfirmation !== undefined;
      setOperatingModeSnapshot(
        operatingMode.changeIdentity(
          activeProfileId === "profile-guest" ? "guest" : "local-profile",
        ),
      );
      if (wasElevated) recordDiagnostic("mode.identity-change.locked");
    }
  });

  export function show(target: SettingsPanel): void {
    panel = target;
  }

  export function cancelPendingModeConfirmation(): boolean {
    if (operatingModeSnapshot.pendingConfirmation === undefined) return false;
    cancelOperatingModeConfirmation();
    return true;
  }

  function scanWifi(): void {
    scanning = true;
    scanComplete = false;
    scanTimer = window.setTimeout(() => {
      scanning = false;
      scanComplete = true;
    }, 900);
  }

  function requestAdminAccess(): void {
    setOperatingModeSnapshot(operatingMode.requestAdminConfirmation(Date.now()));
    recordDiagnostic("mode.admin.requested");
  }

  function requestDeveloperMode(): void {
    setOperatingModeSnapshot(operatingMode.requestDeveloperConfirmation(Date.now()));
    recordDiagnostic("mode.developer.requested");
  }

  function confirmOperatingMode(): void {
    try {
      setOperatingModeSnapshot(operatingMode.confirmLocally(Date.now()));
      recordDiagnostic(
        operatingModeSnapshot.mode === "developer"
          ? "mode.developer.entered"
          : "mode.admin.entered",
      );
    } catch {
      setOperatingModeSnapshot(operatingMode.snapshot(Date.now()));
      ontoast("Confirmation expired. Start again.");
    }
  }

  function cancelOperatingModeConfirmation(): void {
    setOperatingModeSnapshot(operatingMode.cancelConfirmation());
    recordDiagnostic("mode.confirmation.cancelled");
  }

  function endDeveloperMode(): void {
    setOperatingModeSnapshot(operatingMode.endDeveloperMode());
    recordDiagnostic("mode.developer.ended");
  }

  function lockToFamily(): void {
    setOperatingModeSnapshot(operatingMode.lockToFamily());
    recordDiagnostic("mode.family.locked");
  }

  function recordDiagnostic(code: LocalDiagnosticCode): void {
    localDiagnostics.record(code, diagnosticUptimeMs());
  }

  function reviewDiagnostics(): void {
    diagnosticReview = localDiagnostics.prepareExport(diagnosticUptimeMs());
    diagnosticExportArmed = false;
  }

  function closeDiagnosticReview(): void {
    if (diagnosticReview !== undefined) {
      localDiagnostics.discardExport(diagnosticReview);
    }
    diagnosticReview = undefined;
    diagnosticExportArmed = false;
  }

  function requestDiagnosticExport(): void {
    diagnosticExportArmed = true;
  }

  function exportDiagnostics(): void {
    if (
      !operatingModeSnapshot.canManageConsole ||
      !diagnosticExportArmed ||
      diagnosticReview === undefined
    ) return;
    let serialized: string;
    try {
      serialized = localDiagnostics.confirmExport(diagnosticReview);
    } catch {
      diagnosticReview = undefined;
      diagnosticExportArmed = false;
      ontoast("Diagnostic review changed. Review the record again.");
      return;
    }
    const objectUrl = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = "vcg-console-diagnostics-v1.json";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    diagnosticExportArmed = false;
  }

  function clearDiagnostics(): void {
    if (!operatingModeSnapshot.canManageConsole) return;
    localDiagnostics.clear();
    diagnosticReview = localDiagnostics.prepareExport(diagnosticUptimeMs());
    diagnosticExportArmed = false;
  }

  function setOperatingModeSnapshot(snapshot: ConsoleOperatingModeSnapshot): void {
    operatingModeSnapshot = snapshot;
    if (!snapshot.canManageConsole && diagnosticReview !== undefined) {
      closeDiagnosticReview();
    } else if (!snapshot.canManageConsole) {
      diagnosticExportArmed = false;
    }
    if (operatingModeTimer !== undefined) window.clearTimeout(operatingModeTimer);
    operatingModeTimer = undefined;
    const pending = snapshot.pendingConfirmation;
    if (pending !== undefined) {
      operatingModeTimer = window.setTimeout(() => {
        setOperatingModeSnapshot(operatingMode.snapshot(Date.now()));
        recordDiagnostic("mode.confirmation.expired");
      }, Math.max(0, pending.expiresAtMs - Date.now() + 1));
    }
    void focusFirstOperatingModeAction();
  }

  async function focusFirstOperatingModeAction(): Promise<void> {
    await tick();
    const action = operatingModeElement?.querySelector<HTMLButtonElement>("button");
    if (action?.offsetParent !== null) action?.focus({ preventScroll: true });
  }

  onDestroy(() => {
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    if (operatingModeTimer !== undefined) window.clearTimeout(operatingModeTimer);
    if (diagnosticReview !== undefined) {
      localDiagnostics.discardExport(diagnosticReview);
    }
  });
</script>

<header class="view-header">
  <div><p class="view-kicker">CONSOLE SETTINGS</p><h1>{panelPresentation[panel].title}</h1></div>
  <p>{panelPresentation[panel].detail}</p>
</header>
<div class="settings-layout">
  <nav class="settings-nav" aria-label="Settings sections">
    {#each ["system", "accessibility", "network", "storage", "developer"] as target}
      <button
        class:active={panel === target}
        type="button"
        data-settings-target={target}
        onclick={() => (panel = target as SettingsPanel)}
      >{target === "network" ? "Wi-Fi" : target === "accessibility" ? "Access" : target === "developer" ? "Developer" : target[0]?.toUpperCase() + target.slice(1)}</button>
    {/each}
  </nav>
  <div class="settings-panels">
    <section data-settings-panel="system" hidden={panel !== "system"}>
      <dl><div><dt>VCG Console</dt><dd>Prototype 0.0.1</dd></div><div><dt>Motion API</dt><dd>0.2.0</dd></div><div><dt>Update channel</dt><dd>Development</dd></div></dl>
      <button type="button" onclick={() => ontoast("No console update service is connected in this prototype.")}>Check for updates</button>
    </section>
    <section data-settings-panel="accessibility" hidden={panel !== "accessibility"}>
      <div class="accessibility-summary" aria-live="polite">
        <span>DEVICE-WIDE PROTOTYPE</span>
        <strong>One readable shell preference set</strong>
        <p>
          Text, contrast, and reduced motion apply now. Seated play and confirm-button
          remapping are saved demonstrations until the tracker and native input host
          consume them.
        </p>
        <small data-accessibility-persistence={accessibility.persistence}>
          {accessibility.persistence === "saved"
            ? "Saved locally on this console"
            : accessibility.persistence === "volatile"
              ? "Storage unavailable · changes last only for this session"
              : accessibility.persistence === "rejected"
                ? "Stored settings rejected · safe defaults are active"
              : "Using defaults · nothing stored yet"}
        </small>
      </div>

      <div class="accessibility-setting">
        <div><strong>Text scale</strong><small>Scales the console shell, dialogs, and status copy</small></div>
        <div role="group" aria-label="Text scale">
          <button type="button" aria-pressed={accessibility.preferences.textScale === "standard"} onclick={() => onaccessibilitychange({ textScale: "standard" })}>Standard</button>
          <button type="button" aria-pressed={accessibility.preferences.textScale === "large"} onclick={() => onaccessibilitychange({ textScale: "large" })}>Large</button>
        </div>
      </div>

      <div class="accessibility-setting">
        <div><strong>Contrast</strong><small>Focus keeps outline, copy, and shape cues instead of color alone</small></div>
        <div role="group" aria-label="Contrast">
          <button type="button" aria-pressed={accessibility.preferences.contrast === "standard"} onclick={() => onaccessibilitychange({ contrast: "standard" })}>Standard</button>
          <button type="button" aria-pressed={accessibility.preferences.contrast === "high"} onclick={() => onaccessibilitychange({ contrast: "high" })}>High</button>
        </div>
      </div>

      <div class="accessibility-setting">
        <div><strong>Motion</strong><small>System follows the OS preference; Reduced suppresses nonessential motion</small></div>
        <div role="group" aria-label="Motion">
          <button type="button" aria-pressed={accessibility.preferences.motion === "system"} onclick={() => onaccessibilitychange({ motion: "system" })}>System</button>
          <button type="button" aria-pressed={accessibility.preferences.motion === "reduced"} onclick={() => onaccessibilitychange({ motion: "reduced" })}>Reduced</button>
        </div>
      </div>

      <div class="accessibility-setting">
        <div><strong>Play posture</strong><small>Preference only · seated body-play support is not yet qualified</small></div>
        <div role="group" aria-label="Play posture">
          <button type="button" aria-pressed={accessibility.preferences.seatedPlay === "standard"} onclick={() => onaccessibilitychange({ seatedPlay: "standard" })}>Standard</button>
          <button type="button" aria-pressed={accessibility.preferences.seatedPlay === "preferred"} onclick={() => onaccessibilitychange({ seatedPlay: "preferred" })}>Seated preferred</button>
        </div>
      </div>

      <div class="accessibility-setting">
        <div><strong>Confirm-button preview</strong><small>Ordinary confirm only · reserved Home and Back cannot be remapped</small></div>
        <div role="group" aria-label="Confirm-button preview">
          <button type="button" aria-pressed={accessibility.preferences.confirmButton === "south"} onclick={() => onaccessibilitychange({ confirmButton: "south" })}>South / A</button>
          <button type="button" aria-pressed={accessibility.preferences.confirmButton === "west"} onclick={() => onaccessibilitychange({ confirmButton: "west" })}>West / X</button>
        </div>
      </div>
      <p class="accessibility-boundary">Preview only: the browser input router still uses its canonical mapping. No game receives this preference yet.</p>

      <div class="accessibility-setting">
        <div><strong>Audio cues</strong><small>Local UI confirmation cue · no speech or network service</small></div>
        <div role="group" aria-label="Audio cues">
          <button type="button" aria-pressed={accessibility.preferences.audioCues === "on"} onclick={() => onaccessibilitychange({ audioCues: "on" })}>On</button>
          <button type="button" aria-pressed={accessibility.preferences.audioCues === "off"} onclick={() => onaccessibilitychange({ audioCues: "off" })}>Off</button>
          <button type="button" onclick={onpreviewaudiocue}>Play cue</button>
        </div>
      </div>

      <button class="accessibility-reset" type="button" onclick={onaccessibilityreset}>Reset accessibility settings</button>
    </section>
    <section data-settings-panel="network" hidden={panel !== "network"}>
      <div class="setting-callout"><span>OFFLINE</span><strong>Wi-Fi is not configured</strong><p>Connect to use the museum and hosted games. Local motion and retro games remain available offline.</p><button type="button" id="scan-wifi" disabled={scanning} onclick={scanWifi}>{scanning ? "Scanning…" : scanComplete ? "No networks found · Scan again" : "Scan for networks"}</button></div>
    </section>
    <section data-settings-panel="storage" hidden={panel !== "storage"}>
      <div class="storage-meter"><div><span style="width:15%"></span></div><p><strong>38 GB used</strong><span>218 GB available / 256 GB total</span></p></div>
      <dl><div><dt>System</dt><dd>12 GB</dd></div><div><dt>Games</dt><dd>0 GB</dd></div><div><dt>Reserved</dt><dd>26 GB</dd></div></dl>
      <small class="estimate-note">Development estimate · final hardware not yet qualified</small>
    </section>
    <section data-settings-panel="developer" hidden={panel !== "developer"}>
      <div class="toggle-row"><div><strong>Diagnostic overlay</strong><small>Show performance and tracker health</small></div><button type="button" role="switch" aria-checked={diagnostics} onclick={() => (diagnostics = !diagnostics)}>{diagnostics ? "On" : "Off"}</button></div>
      <div
        bind:this={operatingModeElement}
        class:mode-active={operatingModeSnapshot.mode === "developer"}
        class="operating-mode"
        data-operating-mode={operatingModeSnapshot.mode}
        aria-live="polite"
      >
        <span>{operatingModeSnapshot.mode.toUpperCase()} MODE</span>
        {#if operatingModeSnapshot.pendingConfirmation?.action === "enter-admin"}
          <strong>Confirm local administration</strong>
          <p>This desk prototype has no administrator credential. Confirmation demonstrates the controller flow but grants no native service authority.</p>
          <div>
            <button type="button" onclick={confirmOperatingMode}>Confirm admin access</button>
            <button type="button" onclick={cancelOperatingModeConfirmation}>Cancel</button>
          </div>
        {:else if operatingModeSnapshot.pendingConfirmation?.action === "enable-developer"}
          <strong>Enable temporary developer mode?</strong>
          <p>Developer builds must remain visibly separate from signed production games. A paired native service is still required before any deployment.</p>
          <div>
            <button type="button" onclick={confirmOperatingMode}>Confirm developer mode</button>
            <button type="button" onclick={cancelOperatingModeConfirmation}>Cancel</button>
          </div>
        {:else if operatingModeSnapshot.mode === "family"}
          <strong>Developer deployment is blocked</strong>
          <p>Guest and local-player selection never grants administrative or developer authority.</p>
          <button type="button" onclick={requestAdminAccess}>Request admin access</button>
        {:else if operatingModeSnapshot.mode === "admin"}
          <strong>Console administration preview</strong>
          <p>Developer transport remains blocked until a second explicit local confirmation.</p>
          <div>
            <button type="button" onclick={requestDeveloperMode}>Enable developer mode</button>
            <button type="button" onclick={lockToFamily}>Lock to family mode</button>
          </div>
        {:else}
          <strong>Developer mode is visibly active</strong>
          <p>Pairing service not connected. This browser cannot open a listener, pair a workstation, or deploy a build.</p>
          <div>
            <button type="button" onclick={endDeveloperMode}>End developer mode</button>
            <button type="button" onclick={lockToFamily}>Lock to family mode</button>
          </div>
        {/if}
      </div>
      <div class="diagnostic-review">
        <div>
          <strong>Local diagnostic record</strong>
          <small>Bounded stable codes in memory only · cleared on reload</small>
        </div>
        {#if diagnosticReview === undefined}
          <button type="button" onclick={reviewDiagnostics}>Review local diagnostics</button>
        {:else}
          <dl>
            <div><dt>Events retained</dt><dd>{diagnosticReview.bundle.events.length} / {diagnosticReview.bundle.retention.maximumEvents}</dd></div>
            <div><dt>Events dropped</dt><dd>{diagnosticReview.bundle.retention.droppedEvents}</dd></div>
            <div>
              <dt>History quality</dt>
              <dd data-diagnostic-attention={diagnosticReview.summary.attention}>
                {diagnosticReview.summary.recordQuality === "complete"
                  ? "Complete in-memory window"
                  : "Oldest events were evicted"}
              </dd>
            </div>
            <div><dt>Warnings retained</dt><dd>{diagnosticReview.summary.retainedWarningEvents}</dd></div>
            <div>
              <dt>Subsystem counts</dt>
              <dd>
                Launcher {diagnosticReview.summary.subsystemCounts.launcher}
                · Packages {diagnosticReview.summary.subsystemCounts.packages}
                · Access {diagnosticReview.summary.subsystemCounts.access}
              </dd>
            </div>
            <div><dt>Raw frames / skeletons</dt><dd>Excluded / Excluded</dd></div>
            <div><dt>Profiles / credentials</dt><dd>Excluded / Excluded</dd></div>
          </dl>
          <ol aria-label="Retained diagnostic codes">
            {#each diagnosticReview.bundle.events.slice(-8) as event}
              <li><span>{event.sequence}</span><strong>{event.code}</strong><small>+{event.uptimeMs} ms</small></li>
            {/each}
          </ol>
          {#if !operatingModeSnapshot.canManageConsole}
            <p>Admin confirmation is required before a file can be exported or the record cleared.</p>
            <button type="button" onclick={closeDiagnosticReview}>Close review</button>
          {:else if diagnosticExportArmed}
            <p>Export only these reviewed stable codes and monotonic timings? The file contains no frames, skeletons, profiles, free text, or credentials.</p>
            <div>
              <button type="button" onclick={exportDiagnostics}>Confirm diagnostics export</button>
              <button type="button" onclick={() => (diagnosticExportArmed = false)}>Cancel export</button>
            </div>
          {:else}
            <div>
              <button type="button" onclick={requestDiagnosticExport}>Prepare diagnostics export</button>
              <button type="button" onclick={clearDiagnostics}>Clear volatile diagnostics</button>
              <button type="button" onclick={closeDiagnosticReview}>Close review</button>
            </div>
          {/if}
        {/if}
      </div>
      <button type="button" onclick={() => openMotionLab("tracker")}>Open Motion Lab</button>
      <div class="launch-preview">
        <div><strong>Launch-state preview</strong><small>Inspect each adapter without starting a game</small></div>
        <div>
          <button type="button" onclick={() => onpreviewlaunch("remote-web")}>Remote web</button>
          <button type="button" onclick={() => onpreviewlaunch("local-web")}>Local web</button>
          <button type="button" onclick={() => onpreviewlaunch("native")}>Native</button>
          <button type="button" onclick={() => onpreviewlaunch("retro")}>Retro</button>
        </div>
      </div>
      <div class="launch-preview">
        <div><strong>Launch recovery preview</strong><small>Inject a state without starting a game</small></div>
        <div>
          <button type="button" onclick={() => onpreviewfault("slow")}>Slow</button>
          <button type="button" onclick={() => onpreviewfault("offline")}>Offline</button>
          <button type="button" onclick={() => onpreviewfault("hung")}>Hung</button>
          <button type="button" onclick={() => onpreviewfault("crashed")}>Crashed</button>
          <button type="button" onclick={() => onpreviewfault("recovered")}>Recovered</button>
        </div>
      </div>
    </section>
  </div>
</div>
