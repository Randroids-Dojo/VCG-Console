<script lang="ts">
  import { onDestroy } from "svelte";
  import type { LabMode, LaunchAdapter, SettingsPanel } from "./types";

  let {
    openMotionLab,
    onpreviewlaunch,
    ontoast,
  }: { openMotionLab: (mode?: LabMode) => void; onpreviewlaunch: (adapter: LaunchAdapter) => void; ontoast: (message: string) => void } = $props();
  let panel = $state<SettingsPanel>("system");
  let scanning = $state(false);
  let scanComplete = $state(false);
  let diagnostics = $state(false);
  let developerMode = $state(false);
  let scanTimer: number | undefined;

  export function show(target: SettingsPanel): void {
    panel = target;
  }

  function scanWifi(): void {
    scanning = true;
    scanComplete = false;
    scanTimer = window.setTimeout(() => {
      scanning = false;
      scanComplete = true;
    }, 900);
  }

  onDestroy(() => {
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
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
      <dl><div><dt>VCG Console</dt><dd>Prototype 0.0.1</dd></div><div><dt>Motion API</dt><dd>0.1.0</dd></div><div><dt>Update channel</dt><dd>Development</dd></div></dl>
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
      <div class="toggle-row"><div><strong>Developer mode</strong><small>Allow paired workstation sessions</small></div><button type="button" role="switch" aria-checked={developerMode} onclick={() => (developerMode = !developerMode)}>{developerMode ? "On" : "Off"}</button></div>
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
    </section>
  </div>
</div>
