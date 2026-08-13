<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    forgetBluetoothController,
    listBluetoothControllers,
    pairBluetoothController,
    scanBluetoothControllers,
    type NativeBluetoothController,
    type NativeBluetoothResult,
  } from "../native-host-client";
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
  import {
    AvSettingsRehearsalController,
    type AudioCueLevel,
    type AvSettingsRehearsalSnapshot,
  } from "./av-settings-rehearsal";
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
    onpreviewaudiocue: (level?: AudioCueLevel) => void;
  } = $props();
  let panel = $state<SettingsPanel>("system");
  const panelTitles: Record<SettingsPanel, string> = {
    system: "System.",
    accessibility: "Access.",
    display: "Display.",
    audio: "Audio.",
    controllers: "Controllers.",
    network: "Wi-Fi.",
    storage: "Storage.",
    developer: "Developer.",
  };
  let scanning = $state(false);
  let scanComplete = $state(false);
  let diagnostics = $state(false);
  let bluetoothDevices = $state<NativeBluetoothController[]>([]);
  let bluetoothBusy = $state<string | undefined>();
  let bluetoothError = $state<string | undefined>();
  let bluetoothLoaded = $state(false);
  let pendingForgetId = $state<string | undefined>();
  const avSettings = new AvSettingsRehearsalController();
  let avSettingsSnapshot = $state<AvSettingsRehearsalSnapshot>(avSettings.snapshot());
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
    selectPanel(target);
  }

  function selectPanel(target: SettingsPanel): void {
    panel = target;
    if (target !== "controllers") pendingForgetId = undefined;
    if (target === "controllers" && !bluetoothLoaded && bluetoothBusy === undefined) {
      void refreshBluetoothControllers();
    }
  }

  async function refreshBluetoothControllers(): Promise<void> {
    await runBluetoothOperation("refresh", listBluetoothControllers());
  }

  async function scanControllers(): Promise<void> {
    pendingForgetId = undefined;
    await runBluetoothOperation("scan", scanBluetoothControllers());
  }

  async function pairController(id: string): Promise<void> {
    pendingForgetId = undefined;
    const result = await runBluetoothOperation(id, pairBluetoothController(id));
    if (!result?.ok) return;
    const controller = result.snapshot.devices.find((device) => device.id === id);
    if (controller?.connected) {
      ontoast("Bluetooth connected. Press a controller button to verify input.");
    } else if (controller?.paired) {
      ontoast("Controller is paired but not connected yet.");
    } else {
      ontoast("Pairing did not complete. Put the controller in pairing mode and try again.");
    }
  }

  async function forgetController(id: string): Promise<void> {
    if (pendingForgetId !== id) {
      pendingForgetId = id;
      return;
    }
    const result = await runBluetoothOperation(id, forgetBluetoothController(id));
    if (result?.ok) {
      pendingForgetId = undefined;
      ontoast("Controller bond removed from this console.");
    }
  }

  async function runBluetoothOperation(
    operation: string,
    request: Promise<NativeBluetoothResult>,
  ): Promise<NativeBluetoothResult | undefined> {
    bluetoothBusy = operation;
    bluetoothError = undefined;
    try {
      const result = await request;
      bluetoothLoaded = true;
      if (result.ok) {
        bluetoothDevices = result.snapshot.devices;
      } else {
        bluetoothError = result.detail;
      }
      return result;
    } finally {
      bluetoothBusy = undefined;
    }
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

  function setSafeAreaGuide(visible: boolean): void {
    avSettingsSnapshot = avSettings.setSafeAreaGuide(visible);
  }

  function setAudioCueLevel(level: AudioCueLevel): void {
    avSettingsSnapshot = avSettings.setCueLevel(level);
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
  <div><h1 data-tv-critical-text>{panelTitles[panel]}</h1></div>
</header>
<div class="settings-layout">
  <nav class="settings-nav" aria-label="Settings sections">
    {#each ["system", "accessibility", "display", "audio", "controllers", "network", "storage", "developer"] as target}
      <button
        class:active={panel === target}
        type="button"
        data-tv-action
        data-tv-critical-text
        data-settings-target={target}
        onclick={() => selectPanel(target as SettingsPanel)}
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
          <button type="button" onclick={() => onpreviewaudiocue()}>Play cue</button>
        </div>
      </div>

      <button class="accessibility-reset" type="button" onclick={onaccessibilityreset}>Reset accessibility settings</button>
    </section>
    <section data-settings-panel="display" hidden={panel !== "display"}>
      <div class="av-settings-summary">
        <span>SESSION-ONLY REHEARSAL</span>
        <strong>No display service is connected</strong>
        <p>The browser cannot report the television, HDMI mode, HDR state, or overscan. These controls change only the preview below and reset on reload.</p>
      </div>
      <dl class="av-settings-facts">
        <div><dt>Output identity</dt><dd>NOT ENUMERATED</dd></div>
        <div><dt>Signal mode</dt><dd>NOT REPORTED</dd></div>
        <div><dt>HDR</dt><dd>NOT REPORTED</dd></div>
        <div><dt>Overscan</dt><dd>UNQUALIFIED</dd></div>
      </dl>
      <div class="display-safe-preview" data-safe-area-guide={avSettingsSnapshot.display.safeAreaGuide}>
        <span>BROWSER LAYOUT PREVIEW</span>
        <div><strong>5% ACTION-SAFE GUIDE</strong><small>Preview geometry only</small></div>
      </div>
      <div class="av-settings-choice">
        <div><strong>Safe-area guide</strong><small>Does not change television or compositor output</small></div>
        <div role="group" aria-label="Safe-area guide">
          <button type="button" aria-pressed={avSettingsSnapshot.display.safeAreaGuide === "hidden"} onclick={() => setSafeAreaGuide(false)}>Hide</button>
          <button type="button" aria-pressed={avSettingsSnapshot.display.safeAreaGuide === "visible"} onclick={() => setSafeAreaGuide(true)}>Show 5% guide</button>
        </div>
      </div>
      <p class="av-settings-boundary">Preview only. Resolution, refresh rate, color, HDR, overscan, compositor focus, physical television behavior, and persistence remain unchanged and unverified.</p>
    </section>
    <section data-settings-panel="audio" hidden={panel !== "audio"}>
      <div class="av-settings-summary">
        <span>LOCAL CUE REHEARSAL</span>
        <strong>No audio service is connected</strong>
        <p>The browser sends one short local cue to its system-default destination. It does not enumerate the television, receiver, speakers, volume, or channel layout.</p>
      </div>
      <dl class="av-settings-facts">
        <div><dt>Output</dt><dd>SYSTEM DEFAULT / UNVERIFIED</dd></div>
        <div><dt>Channel layout</dt><dd>NOT TESTED</dd></div>
        <div><dt>Microphone</dt><dd>NOT REQUESTED</dd></div>
        <div><dt>Persistence</dt><dd>SESSION ONLY</dd></div>
      </dl>
      <div class="av-settings-choice">
        <div><strong>Test-cue level</strong><small>Applies only to the next local preview cue</small></div>
        <div role="group" aria-label="Test-cue level">
          <button type="button" aria-pressed={avSettingsSnapshot.audio.cueLevel === "quiet"} onclick={() => setAudioCueLevel("quiet")}>Quiet</button>
          <button type="button" aria-pressed={avSettingsSnapshot.audio.cueLevel === "standard"} onclick={() => setAudioCueLevel("standard")}>Standard</button>
          <button type="button" onclick={() => onpreviewaudiocue(avSettingsSnapshot.audio.cueLevel)}>Play local test cue</button>
        </div>
      </div>
      <p class="av-settings-boundary">No microphone request, speech service, network request, output selection, hardware volume change, or speaker/channel qualification occurs.</p>
    </section>
    <section data-settings-panel="controllers" hidden={panel !== "controllers"}>
      <div class="controller-setup-summary" aria-live="polite">
        <span>LOCAL BLUETOOTH SETUP</span>
        <strong>Put your controller in pairing mode</strong>
        <p>Use a connected controller or keyboard to scan. Device names and Bluetooth addresses never appear in the console UI.</p>
        <button
          type="button"
          data-tv-action
          data-tv-critical-text
          disabled={bluetoothBusy !== undefined}
          onclick={scanControllers}
        >{bluetoothBusy === "scan" ? "Scanning for controllers..." : "Scan for controllers"}</button>
      </div>
      {#if bluetoothError !== undefined}
        <p class="controller-setup-error" role="alert">{bluetoothError}</p>
      {:else if bluetoothBusy === "refresh"}
        <p class="controller-setup-empty" aria-live="polite">Checking saved controllers...</p>
      {:else if bluetoothLoaded && bluetoothDevices.length === 0}
        <p class="controller-setup-empty">No gaming controllers found. Hold the controller's pairing button, then scan again.</p>
      {/if}
      {#if bluetoothDevices.length > 0}
        <ul class="controller-list" aria-label="Bluetooth controllers">
          {#each bluetoothDevices as controller}
            <li>
              <div>
                <strong>{controller.id.replace("controller-", "Controller ")}</strong>
                <small>
                  {controller.connected && controller.paired
                    ? "Bluetooth connected · press a button to verify game input"
                    : controller.connected
                      ? "Connected for this session · pair to save it for reboot"
                    : controller.paired
                      ? "Paired · ready to reconnect"
                      : "Nearby · ready to pair"}
                </small>
              </div>
              <div>
                {#if !controller.paired || !controller.connected}
                  <button
                    type="button"
                    data-tv-action
                    disabled={bluetoothBusy !== undefined}
                    onclick={() => pairController(controller.id)}
                  >{bluetoothBusy === controller.id ? "Working..." : controller.paired ? "Reconnect" : "Pair"}</button>
                {/if}
                {#if controller.paired}
                  <button
                    type="button"
                    data-tv-action
                    class:confirm-remove={pendingForgetId === controller.id}
                    disabled={bluetoothBusy !== undefined}
                    onclick={() => forgetController(controller.id)}
                  >{pendingForgetId === controller.id ? "Confirm forget" : "Forget"}</button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="controller-setup-boundary">Bluetooth connection is not a gameplay claim. The controller becomes usable only after Chromium reports fresh mapped input; Raspberry Pi, controller-model, range, wake, and two-player behavior still require physical qualification.</p>
    </section>
    <section data-settings-panel="network" hidden={panel !== "network"}>
      <div class="setting-callout"><span data-tv-critical-text>OFFLINE</span><strong data-tv-critical-text>Wi-Fi is not configured</strong><p data-tv-critical-text>Connect to use the museum and hosted games. Local motion and retro games remain available offline.</p><button type="button" id="scan-wifi" data-tv-action data-tv-critical-text disabled={scanning} onclick={scanWifi}>{scanning ? "Scanning..." : scanComplete ? "No networks found · Scan again" : "Scan for networks"}</button></div>
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
          <button type="button" data-tv-focus="offline-preview" onclick={() => onpreviewfault("offline")}>Offline</button>
          <button type="button" onclick={() => onpreviewfault("hung")}>Hung</button>
          <button type="button" onclick={() => onpreviewfault("crashed")}>Crashed</button>
          <button type="button" onclick={() => onpreviewfault("recovered")}>Recovered</button>
        </div>
      </div>
    </section>
  </div>
</div>
