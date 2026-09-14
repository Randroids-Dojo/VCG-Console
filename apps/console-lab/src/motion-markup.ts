import { LAB_MODE } from "./build-mode";
import { OBSTACLE_GAME_VERSION, OBSTACLE_RULES_VERSION } from "./local-leaderboard";

export const motionMarkup = `
  <main class="console-shell" id="motion-lab" hidden>
    <header class="topbar">
      <span class="wordmark">VCG<span>/</span>CONSOLE</span>
      <div class="system-state"><span class="state-dot" aria-hidden="true"></span><span id="system-state">REPLAY READY</span></div>
      <time id="clock" aria-label="Local time"></time>
    </header>

    <section class="lab-grid" aria-labelledby="lab-title">
      <div class="stage-panel">
        <div class="stage-heading">
          <div>
            <p class="eyebrow" id="stage-eyebrow">DIAGNOSTICS</p>
            <h1 id="lab-title">MOTION TRACKER</h1>
          </div>
          <p class="privacy-copy" id="stage-note">RAW VIDEO<br />NOT SHOWN<br />NOT RECORDED</p>
        </div>

        <div class="stage-view" id="tracker-view">
          <div class="skeleton-stage">
            <canvas id="skeleton" aria-label="Normalized 17-point skeleton visualization"></canvas>
            <div class="stage-corners" aria-hidden="true"></div>
            <div class="source-badge" id="source-badge">SYNTHETIC REPLAY</div>
          </div>
        </div>

        <div class="stage-view" id="obstacle-view" hidden>
          <div class="obstacle-stage">
            <canvas id="obstacle-canvas" aria-label="Dodge, duck, and jump obstacle game"></canvas>
            <div class="stage-corners" aria-hidden="true"></div>
            <div class="game-score" aria-label="Round score">
              <span class="player-one-score">P1 <strong id="game-score-p1">000000</strong> / <strong id="game-lives-p1">3</strong> LIVES</span>
              <span id="game-clock">00:45</span>
              <span class="player-two-score">P2 <strong id="game-score-p2">000000</strong> / <strong id="game-lives-p2">3</strong> LIVES</span>
            </div>
            <div class="source-badge" id="game-status">READY</div>
            <section class="round-result" id="round-result" hidden aria-labelledby="round-result-title">
              <p>ROUND COMPLETE</p>
              <h2 id="round-result-title">DRAW</h2>
              <p id="round-result-score">P1 000000 / P2 000000</p>
              <div class="round-result-actions" data-focus-group>
                <button id="play-again-button" type="button" data-result-action="again">PLAY AGAIN</button>
                <button id="return-console-button" type="button" data-result-action="console">BACK TO CONSOLE</button>
              </div>
            </section>
            <section class="leaderboard-card" aria-labelledby="leaderboard-title">
              <div class="leaderboard-heading">
                <div>
                  <p>HOUSEHOLD LOCAL</p>
                  <h2 id="leaderboard-title">UNVERIFIED RUNS</h2>
                </div>
                <span>NO UPLOAD</span>
              </div>
              <p class="leaderboard-disclosure">Casual scores on this device only. They are not anti-cheat protected or comparable across households.</p>
              <ol id="leaderboard-list" class="leaderboard-list"></ol>
              <p id="leaderboard-storage-status" class="leaderboard-storage-status"></p>
              <div class="leaderboard-actions" data-focus-group>
                <button id="new-run-button" type="button">NEW RUN</button>
                <button id="reset-board-button" type="button">RESET LOCAL BOARD</button>
              </div>
              <p class="leaderboard-build-note">DEVELOPER SAMPLE · GAME ${OBSTACLE_GAME_VERSION} / RULES ${OBSTACLE_RULES_VERSION} · SCORES CAN BE MODIFIED</p>
            </section>
          </div>
        </div>

        <div class="stage-view" id="shell-view" hidden>
          <div class="shell-lab-stage">
            <p class="shell-instruction">SWIPE TO MOVE FOCUS. BRING BOTH HANDS TOGETHER TO SELECT. HOLD CROSSED ARMS TO GO BACK OR PAUSE.</p>
            <div class="shell-cards" data-focus-group aria-label="Motion navigation targets">
              <button type="button" data-shell-target="tracker"><span>01</span><strong>TRACKER</strong><small>Inspect the body signal</small></button>
              <button type="button" data-shell-target="obstacle"><span>02</span><strong>OBSTACLE</strong><small>Test action recognition</small></button>
              <button type="button" data-shell-target="shell"><span>03</span><strong>SHELL LAB</strong><small>Test console gestures</small></button>
            </div>
            <div class="shell-test-controls" data-focus-group>
              <button id="manual-pause-button" type="button">TEST MANUAL PAUSE</button>
              <button id="tracking-loss-button" type="button">TEST TRACKING LOSS</button>
            </div>
          </div>
        </div>
      </div>

      <aside class="telemetry-panel" id="telemetry-panel" aria-label="Tracker telemetry">
        <div class="telemetry-heading">
          <p class="eyebrow">LIVE DIAGNOSTICS</p>
          <span id="health-badge" class="health-badge">READY</span>
        </div>
        <dl class="metrics">
          <div><dt>TRACKER</dt><dd id="metric-tracker">SYNTHETIC</dd></div>
          <div><dt>PLAYER</dt><dd id="metric-player">CANDIDATE 01</dd></div>
          <div><dt>CONFIDENCE</dt><dd id="metric-confidence">98%</dd></div>
          <div><dt>LAST ACTION</dt><dd id="metric-action">NONE</dd></div>
          <div><dt>POSE FPS</dt><dd id="metric-fps">--</dd></div>
          <div><dt>INFERENCE P50</dt><dd id="metric-inference-p50">-- MS</dd></div>
          <div><dt>INFERENCE P95</dt><dd id="metric-inference-p95">-- MS</dd></div>
          <div><dt id="metric-source-timing-label">SOURCE TO FRAME P95</dt><dd id="metric-source-timing-p95">-- MS</dd></div>
          <div><dt>DROPPED FRAMES</dt><dd id="metric-dropped">0</dd></div>
          <div><dt>TRACE FRAMES</dt><dd id="metric-trace">0</dd></div>
        </dl>
        <section class="camera-state-card" id="camera-state-card" data-state="disabled" aria-labelledby="camera-state-title" aria-live="polite">
          <div class="camera-state-heading">
            <span>CAMERA SOFTWARE</span>
            <strong id="camera-state-badge">DISABLED</strong>
          </div>
          <h2 id="camera-state-title">Software camera access is disabled</h2>
          <dl class="camera-state-facts">
            <div><dt>SOFTWARE ACCESS</dt><dd id="camera-access-state">RELEASED</dd></div>
            <div><dt>CAPTURE ACTIVITY</dt><dd id="camera-activity-state">NO STREAM</dd></div>
            <div><dt>PHYSICAL SHUTTER</dt><dd id="camera-shutter-state">NOT SENSED</dd></div>
          </dl>
          <p id="camera-state-detail">The camera stream is stopped. Replay, controller, and keyboard input remain available.</p>
          <p id="camera-shutter-detail" class="camera-shutter-detail">Physical shutter position is not sensed. Check the shutter directly before camera use.</p>
        </section>
        <section class="tracker-health-card" id="tracker-health-card" data-state="ready" aria-live="polite">
          <div class="tracker-health-heading">
            <span>MOTION CONTROL</span>
            <strong id="tracker-control">FULL</strong>
          </div>
          <h2 id="tracker-health-title">Tracker is ready</h2>
          <p id="tracker-health-detail">Landmarks and standardized actions are available from the active local source.</p>
          <div class="health-fixtures" ${LAB_MODE ? "" : "hidden"} data-focus-group aria-label="Tracker health message fixtures">
            <button type="button" data-health-fixture="healthy">READY</button>
            <button type="button" data-health-fixture="low-confidence">LOW CONF</button>
            <button type="button" data-health-fixture="overload">OVERLOAD</button>
            <button type="button" data-health-fixture="restarting">RESTART</button>
            <button type="button" data-health-fixture="camera-disconnected">DISCONNECT</button>
          </div>
        </section>
        <section class="player-availability-card" id="player-availability-card" data-state="full" aria-labelledby="player-control-title" aria-live="polite">
          <div class="player-availability-heading">
            <span>BODY SIGNAL</span>
            <strong id="player-control-state">FULL</strong>
          </div>
          <h2 id="player-control-title">All tracked regions observed</h2>
          <div class="body-region-grid" aria-label="Observed body regions">
            <span data-player-region="head">HEAD</span>
            <span data-player-region="torso">TORSO</span>
            <span data-player-region="leftArm">L ARM</span>
            <span data-player-region="rightArm">R ARM</span>
            <span data-player-region="leftLeg">L LEG</span>
            <span data-player-region="rightLeg">R LEG</span>
          </div>
          <p id="player-control-detail">All six control groups have their required observed landmarks.</p>
          <p id="player-unavailable-controls"><strong>UNAVAILABLE</strong> NONE</p>
          <div class="body-fixtures" ${LAB_MODE ? "" : "hidden"} data-focus-group aria-label="Missing landmark replay fixtures">
            <button type="button" data-body-fixture="full">FULL</button>
            <button type="button" data-body-fixture="left-arm">LEFT ARM</button>
            <button type="button" data-body-fixture="legs">LEGS</button>
            <button type="button" data-body-fixture="half-body">HALF BODY</button>
          </div>
        </section>
        <section class="simulator-card" ${LAB_MODE ? "" : "hidden"} id="simulator-card" data-focus-group data-enabled="false">
          <div class="simulator-heading">
            <span>CAMERA-FREE SDK INPUT</span>
            <strong id="simulator-state">OFF</strong>
          </div>
          <button id="simulator-toggle" class="simulator-toggle" type="button" aria-pressed="false">ENABLE POSE SIMULATOR</button>
          <div class="simulator-poses" aria-label="Pose simulator controls">
            <button type="button" data-simulator-pose="neutral">NEUTRAL</button>
            <button type="button" data-simulator-pose="dodge-left">LEFT</button>
            <button type="button" data-simulator-pose="dodge-right">RIGHT</button>
            <button type="button" data-simulator-pose="duck">DUCK</button>
            <button type="button" data-simulator-pose="jump">JUMP</button>
            <button type="button" data-simulator-pose="hands-together">HANDS</button>
            <button type="button" data-simulator-pose="crossed-arms">CROSS</button>
            <button type="button" data-simulator-pose="swipe-left">SWIPE L</button>
            <button type="button" data-simulator-pose="swipe-right">SWIPE R</button>
            <button type="button" data-simulator-pose="swipe-up">SWIPE U</button>
            <button type="button" data-simulator-pose="swipe-down">SWIPE D</button>
            <button id="simulator-player-toggle" type="button" aria-pressed="false">HIDE PLAYER</button>
          </div>
          <p><strong>KEYS</strong> W/A/S/D move · J hands · K cross · Q/E right arm · R/F left arm · H hide</p>
        </section>
        <section class="gesture-feedback" id="gesture-feedback" data-state="idle" aria-live="polite">
          <div class="gesture-feedback-heading">
            <span id="gesture-action">GESTURE FEEDBACK</span>
            <strong id="gesture-phase">WAITING</strong>
          </div>
          <div
            class="gesture-progress"
            id="gesture-progress"
            role="progressbar"
            aria-label="Gesture hold progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
            aria-valuetext="Waiting for a gesture"
          ><span id="gesture-progress-fill"></span></div>
          <p id="gesture-detail">Hold progress, acceptance, cancellation, and release appear here.</p>
          <div class="sweep-readout" id="sweep-readout" data-raised="false">
            <div class="sweep-readout-heading"><span>GESTURE INPUT</span><strong id="sweep-hand">HANDS DOWN</strong></div>
            <div class="sweep-meter" role="progressbar" aria-label="How far a hand has travelled out of the home position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="sweep-meter"><span id="sweep-meter-fill"></span></div>
            <p id="sweep-detail">Hold a hand out away from your body, or touch your head.</p>
          </div>
        </section>
        <p class="measurement-note" id="measurement-note">No source timing samples are available. This diagnostic never substitutes for exposure-to-action qualification.</p>
        <div class="controls" data-focus-group>
          <button id="join-button" class="primary-control" type="button">JOIN PLAYER 1</button>
          <button id="join-player-2-button" class="primary-control" type="button" disabled>JOIN PLAYER 2</button>
          <button id="camera-button" type="button">START CAMERA</button>
          <button id="replay-button" type="button" disabled>${LAB_MODE ? "USE REPLAY" : "USE CONTROLLER"}</button>
          <button id="export-button" ${LAB_MODE ? "" : "hidden"} type="button">EXPORT SKELETON TRACE</button>
        </div>
        <p id="status-detail" class="status-detail" role="status">Synthetic input is running. Camera access is off.</p>
      </aside>
    </section>

    <nav class="command-rail" data-focus-group="menu" aria-label="Console sections">
      <button class="command active" type="button" data-mode="tracker" ${LAB_MODE ? "" : "hidden"}><span>01</span>TRACKER</button>
      <button class="command" type="button" data-mode="obstacle"><span>02</span>OBSTACLE</button>
      <button class="command" type="button" data-mode="shell" ${LAB_MODE ? "" : "hidden"}><span>03</span>SHELL LAB</button>
      <button class="command command-toggle" id="diagnostics-toggle" type="button" aria-pressed="false" aria-controls="telemetry-panel">DIAGNOSTICS</button>
      <div class="escape-hint"><span>BACK</span></div>
    </nav>

  </main>

  <div class="console-overlay" id="console-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="overlay-title">
    <div class="overlay-card">
      <p class="eyebrow" id="overlay-eyebrow">SYSTEM PAUSE</p>
      <h2 id="overlay-title">GAME PAUSED</h2>
      <p id="overlay-copy">Player 1 opened the console menu.</p>
      <div class="overlay-options">
      <button type="button" data-overlay-action="resume">RESUME</button>
      <button type="button" data-overlay-action="drop" hidden>CONTINUE WITHOUT</button>
      <button type="button" data-overlay-action="exit">END RUN</button>
      </div>
      <p class="overlay-help">SWIPE TO CHOOSE / HANDS TOGETHER TO SELECT</p>
    </div>
    </div>

  <aside class="skeleton-mini" id="skeleton-mini" hidden aria-hidden="true">
    <canvas id="skeleton-mini-canvas"></canvas>
  </aside>

  <aside class="motion-legend" id="motion-legend" hidden aria-label="Motion controls">
    <dl>
      <div class="motion-legend-shell"><dt data-tv-critical-text>Hold your right hand out, away from your body</dt><dd data-tv-critical-text>Move focus right</dd></div>
      <div class="motion-legend-shell"><dt data-tv-critical-text>Touch your head with your right hand</dt><dd data-tv-critical-text>Move focus left</dd></div>
      <div class="motion-legend-shell"><dt data-tv-critical-text>Hold your left hand out, away from your body</dt><dd data-tv-critical-text>Move focus up</dd></div>
      <div class="motion-legend-shell"><dt data-tv-critical-text>Touch your head with your left hand</dt><dd data-tv-critical-text>Move focus down</dd></div>
      <div class="motion-legend-shell"><dt data-tv-critical-text>Bring both hands together and hold</dt><dd data-tv-critical-text>Select</dd></div>
      <div><dt data-tv-critical-text>Fold your arms across your chest and hold</dt><dd data-tv-critical-text id="motion-legend-back">Back</dd></div>
    </dl>
  </aside>
`;
