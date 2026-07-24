<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    ConsoleOperatingModeController,
    type ConsoleOperatingModeSnapshot,
  } from "./operating-mode";
  import type { LabMode, LaunchAdapter, LaunchFaultPreview, SettingsPanel } from "./types";

  let {
    openMotionLab,
    onpreviewlaunch,
    onpreviewfault,
    ontoast,
    activeProfileId,
  }: {
    openMotionLab: (mode?: LabMode) => void;
    onpreviewlaunch: (adapter: LaunchAdapter) => void;
    onpreviewfault: (fault: LaunchFaultPreview) => void;
    ontoast: (message: string) => void;
    activeProfileId: string;
  } = $props();
  let panel = $state<SettingsPanel>("system");
  let scanning = $state(false);
  let scanComplete = $state(false);
  let diagnostics = $state(false);
  const operatingMode = new ConsoleOperatingModeController();
  let operatingModeSnapshot = $state<ConsoleOperatingModeSnapshot>(operatingMode.snapshot());
  let observedProfileId: string | undefined;
  let operatingModeElement: HTMLElement;
  let scanTimer: number | undefined;
  let operatingModeTimer: number | undefined;

  $effect(() => {
    if (observedProfileId === undefined) {
      observedProfileId = activeProfileId;
    } else if (activeProfileId !== observedProfileId) {
      observedProfileId = activeProfileId;
      setOperatingModeSnapshot(
        operatingMode.changeIdentity(
          activeProfileId === "profile-guest" ? "guest" : "local-profile",
        ),
      );
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
  }

  function requestDeveloperMode(): void {
    setOperatingModeSnapshot(operatingMode.requestDeveloperConfirmation(Date.now()));
  }

  function confirmOperatingMode(): void {
    try {
      setOperatingModeSnapshot(operatingMode.confirmLocally(Date.now()));
    } catch {
      setOperatingModeSnapshot(operatingMode.snapshot(Date.now()));
      ontoast("Confirmation expired. Start again.");
    }
  }

  function cancelOperatingModeConfirmation(): void {
    setOperatingModeSnapshot(operatingMode.cancelConfirmation());
  }

  function endDeveloperMode(): void {
    setOperatingModeSnapshot(operatingMode.endDeveloperMode());
  }

  function lockToFamily(): void {
    setOperatingModeSnapshot(operatingMode.lockToFamily());
  }

  function setOperatingModeSnapshot(snapshot: ConsoleOperatingModeSnapshot): void {
    operatingModeSnapshot = snapshot;
    if (operatingModeTimer !== undefined) window.clearTimeout(operatingModeTimer);
    operatingModeTimer = undefined;
    const pending = snapshot.pendingConfirmation;
    if (pending !== undefined) {
      operatingModeTimer = window.setTimeout(() => {
        setOperatingModeSnapshot(operatingMode.snapshot(Date.now()));
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
  });
</script>

<header class="view-header">
  <div><p class="view-kicker">CONSOLE SETTINGS</p><h1>System.</h1></div>
  <p>Only controls that belong on the television.</p>
</header>
<div class="settings-layout">
  <nav class="settings-nav" aria-label="Settings sections">
    {#each ["system", "network", "storage", "developer"] as target}
      <button
        class:active={panel === target}
        type="button"
        data-settings-target={target}
        onclick={() => (panel = target as SettingsPanel)}
      >{target === "network" ? "Wi-Fi" : target === "developer" ? "Developer" : target[0]?.toUpperCase() + target.slice(1)}</button>
    {/each}
  </nav>
  <div class="settings-panels">
    <section data-settings-panel="system" hidden={panel !== "system"}>
      <dl><div><dt>VCG Console</dt><dd>Prototype 0.0.1</dd></div><div><dt>Motion API</dt><dd>0.2.0</dd></div><div><dt>Update channel</dt><dd>Development</dd></div></dl>
      <button type="button" onclick={() => ontoast("No console update service is connected in this prototype.")}>Check for updates</button>
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
