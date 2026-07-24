<script lang="ts">
  import { tick } from "svelte";
  import {
    runPlayerSessionAdversarialRehearsal,
    type PlayerSessionAdversarialReport,
    type PlayerSessionAdversarialScenario,
  } from "../player-session-adversarial";

  let {
    onback,
  }: {
    onback: () => void;
  } = $props();

  let report = $state<PlayerSessionAdversarialReport | null>(null);
  let selectedScenarioId = $state<string | null>(null);

  const selectedScenario = $derived(
    report?.scenarios.find(({ id }) => id === selectedScenarioId)
      ?? report?.scenarios[0]
      ?? null,
  );

  export async function run(): Promise<void> {
    report = runPlayerSessionAdversarialRehearsal();
    selectedScenarioId = report.scenarios[0]?.id ?? null;
    await tick();
    document
      .querySelector<HTMLElement>(
        '[data-launcher-view="session-adversarial"] .session-scenario-list button',
      )
      ?.focus({ preventScroll: true });
  }

  function selectScenario(
    scenario: PlayerSessionAdversarialScenario,
  ): void {
    selectedScenarioId = scenario.id;
  }
</script>

<section class="session-adversarial-shell" aria-labelledby="session-adversarial-title">
  <header class="session-adversarial-header">
    <div>
      <p class="view-kicker">AUTHORITY LAB / SYNTHETIC</p>
      <h1 id="session-adversarial-title">Detection is not control.</h1>
      <p>
        Rehearse candidate, join, action, recovery, and takeover boundaries
        with camera-free opaque tracks.
      </p>
    </div>
    <div class="session-adversarial-source" data-state={report?.passed ? "passed" : "idle"}>
      <span>CAMERA</span>
      <strong>OFF</strong>
      <small>{report ? "SYNTHETIC REPORT READY" : "NO RUN YET"}</small>
    </div>
  </header>

  {#if !report}
    <div class="session-adversarial-notice">
      <span aria-hidden="true">◇</span>
      <div>
        <h2>Five interference classes. Zero identity claims.</h2>
        <p>
          This deterministic fixture injects spectators, pets, mirrors,
          television people, and passersby into the real player-session state
          machine. It does not classify images or qualify a room.
        </p>
        <ul>
          <li>Passive detections may appear as candidates but receive no slot.</li>
          <li>Only an exact visible joined track may control or open Pause.</li>
          <li>Only explicit Resume may transfer a one-player session.</li>
        </ul>
      </div>
    </div>
    <div class="session-adversarial-actions">
      <button class="primary-action" type="button" onclick={run}>
        Run five synthetic scenarios
      </button>
      <button type="button" onclick={onback}>Back to Motion</button>
    </div>
  {:else}
    <div class="session-adversarial-summary" aria-live="polite">
      <div class="session-report-verdict" data-state={report.passed ? "passed" : "failed"}>
        <span>{report.schemaVersion}</span>
        <strong>{report.passed ? "SYNTHETIC PASS" : "CHECK FAILED"}</strong>
        <small>{report.coveredInterferenceClasses.length} / 5 interference classes covered</small>
      </div>
      <dl class="session-report-metrics">
        <div>
          <dt>FALSE CANDIDATE OBSERVATIONS</dt>
          <dd>{report.totals.falseCandidateObservations}</dd>
          <small>Contained, not hidden</small>
        </div>
        <div>
          <dt>FALSE JOINS</dt>
          <dd>{report.totals.falseJoins}</dd>
          <small>Target 0</small>
        </div>
        <div>
          <dt>FALSE CONTROLS</dt>
          <dd>{report.totals.falseControls}</dd>
          <small>Target 0</small>
        </div>
        <div>
          <dt>UNINTENDED TAKEOVERS</dt>
          <dd>{report.totals.unintendedTakeovers}</dd>
          <small>Target 0</small>
        </div>
        <div>
          <dt>FALSE ACTIONS</dt>
          <dd>{report.totals.falseActions}</dd>
          <small>Target 0</small>
        </div>
        <div>
          <dt>EXPLICIT TAKEOVERS</dt>
          <dd>{report.totals.explicitTakeovers}</dd>
          <small>Expected 1</small>
        </div>
      </dl>
    </div>

    <div class="session-adversarial-results">
      <nav class="session-scenario-list" aria-label="Synthetic authority scenarios">
        {#each report.scenarios as scenario, index}
          <button
            type="button"
            class:active={scenario.id === selectedScenario?.id}
            aria-pressed={scenario.id === selectedScenario?.id}
            onclick={() => selectScenario(scenario)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{scenario.title}</strong>
            <small>{scenario.checks.every(({ passed }) => passed) ? "PASS" : "FAIL"}</small>
          </button>
        {/each}
      </nav>

      {#if selectedScenario}
        <section class="session-scenario-detail" aria-labelledby="session-scenario-title">
          <p class="view-kicker">SCENARIO / {selectedScenario.id.toUpperCase()}</p>
          <h2 id="session-scenario-title">{selectedScenario.title}</h2>
          <p class="session-scenario-classes">
            {selectedScenario.interferenceClasses.length > 0
              ? selectedScenario.interferenceClasses.join(" · ").toUpperCase()
              : "REPLACEMENT PLAYER ONLY"}
          </p>
          <ul>
            {#each selectedScenario.checks as check}
              <li data-state={check.passed ? "passed" : "failed"}>
                <span aria-hidden="true">{check.passed ? "✓" : "!"}</span>
                <div><strong>{check.id.replaceAll("-", " ")}</strong><p>{check.detail}</p></div>
              </li>
            {/each}
          </ul>
          <p class="session-scenario-phase">
            FINAL STATE <strong>{selectedScenario.finalPhase.toUpperCase()}</strong>
          </p>
        </section>
      {/if}
    </div>

    <p class="session-adversarial-boundary">
      <strong>QUALIFICATION BOUNDARY</strong>
      {report.qualificationBoundary}
    </p>
    <div class="session-adversarial-actions">
      <button class="primary-action" type="button" onclick={run}>Run again</button>
      <button type="button" onclick={onback}>Back to Motion</button>
    </div>
  {/if}
</section>
