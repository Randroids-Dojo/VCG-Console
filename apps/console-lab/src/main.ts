import type {
  PlayerControlAvailability,
  PlayerControlGroup,
  MotionAction,
  MotionFrame,
  TrackerHealthEvent,
  TrackerHealthReason,
} from "@vcg/motion-contract";
import {
  assessPlayerControlAvailability,
  MOTION_SIMULATOR_POSES,
  MotionPoseSimulator,
  PLAYER_BODY_REGIONS,
  PLAYER_CONTROL_GROUPS,
  type MotionSimulatorPose,
} from "@vcg/motion-contract";
import { actionFeedback } from "./action-feedback";
import { ActionEngine } from "./action-engine";
import {
  applyBodyVisibilityFixture,
  type BodyVisibilityFixture,
} from "./body-visibility-fixture";
import { GamepadRouter, type ConsoleInputAction } from "./gamepad-router";
import { launcherInputForMotionAction } from "./launcher/motion-input";
import { LauncherController, launcherMarkup } from "./launcher";
import {
  AccessibilityPreferenceController,
  applyAccessibilityPreferences,
} from "./launcher/accessibility-preferences";
import {
  LocalObstacleLeaderboard,
  OBSTACLE_GAME_VERSION,
  OBSTACLE_RULES_VERSION,
  type LeaderboardInputMode,
} from "./local-leaderboard";
import { Metrics } from "./metrics";
import { ObstacleGame } from "./obstacle-game";
import { PlayerSessionController, type PlayerSessionEvent } from "./player-session";
import { SkeletonRenderer } from "./renderer";
import "./styles.css";
import { syntheticFrame } from "./synthetic";
import { TraceBuffer } from "./trace-buffer";
import { MediaPipeTracker, type TrackerStatus } from "./tracker";
import { trackerHealthFixture, trackerHealthPresentation } from "./tracker-health";

type AppMode = "tracker" | "obstacle" | "shell";
type OverlayKind = "manual" | "recovery";

interface MotionSimulatorTestApi {
  enable(enabled?: boolean): void;
  setPlayerVisible(visible: boolean): void;
  setPose(pose: MotionSimulatorPose): void;
  snapshot(): Readonly<{
    enabled: boolean;
    playerVisible: boolean;
    pose: MotionSimulatorPose;
  }>;
}

declare global {
  interface Window {
    __vcgMotionSimulator?: MotionSimulatorTestApi;
  }
}

const MODE_COPY: Record<AppMode, { eyebrow: string; title: string; note: string }> = {
  tracker: { eyebrow: "MOTION LAB / 001", title: "YOUR BODY IS THE SIGNAL.", note: "RAW VIDEO<br />NOT SHOWN<br />NOT RECORDED" },
  obstacle: { eyebrow: "ACTION LAB / 002", title: "MOVE BEFORE IT HITS.", note: "DODGE LEFT + RIGHT<br />DUCK / JUMP<br />ESC ALWAYS RETURNS" },
  shell: { eyebrow: "SHELL LAB / 003", title: "EVERY PATH LEADS BACK.", note: "MOTION + CONTROLLER<br />SHARE ONE FOCUS<br />HOME STAYS OUTSIDE" },
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
const accessibilityPreferences = new AccessibilityPreferenceController(localStorage);
applyAccessibilityPreferences(
  document.documentElement,
  accessibilityPreferences.snapshot(),
);

app.innerHTML = `
  ${launcherMarkup}
  <main class="console-shell" id="motion-lab" hidden>
    <header class="topbar">
      <button class="wordmark" id="home-button" type="button" aria-label="VCG Console home">VCG<span>/</span>CONSOLE</button>
      <div class="system-state"><span class="state-dot" aria-hidden="true"></span><span id="system-state">REPLAY READY</span></div>
      <time id="clock" aria-label="Local time"></time>
    </header>

    <section class="lab-grid" aria-labelledby="lab-title">
      <div class="stage-panel">
        <div class="stage-heading">
          <div>
            <p class="eyebrow" id="stage-eyebrow">MOTION LAB / 001</p>
            <h1 id="lab-title">YOUR BODY IS THE SIGNAL.</h1>
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
            <div class="game-score"><span>SCORE <strong id="game-score">000000</strong></span><span>LIVES <strong id="game-lives">3</strong></span></div>
            <div class="source-badge" id="game-status">READY</div>
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
              <div class="leaderboard-actions">
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
            <div class="shell-cards" aria-label="Motion navigation targets">
              <button type="button" data-shell-target="tracker"><span>01</span><strong>TRACKER</strong><small>Inspect the body signal</small></button>
              <button type="button" data-shell-target="obstacle"><span>02</span><strong>OBSTACLE</strong><small>Test action recognition</small></button>
              <button type="button" data-shell-target="shell"><span>03</span><strong>SHELL LAB</strong><small>Test console gestures</small></button>
            </div>
            <div class="shell-test-controls">
              <button id="manual-pause-button" type="button">TEST MANUAL PAUSE</button>
              <button id="tracking-loss-button" type="button">TEST TRACKING LOSS</button>
            </div>
          </div>
        </div>
      </div>

      <aside class="telemetry-panel" aria-label="Tracker telemetry">
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
          <div><dt>PIPELINE P95</dt><dd id="metric-pipeline-p95">-- MS*</dd></div>
          <div><dt>DROPPED FRAMES</dt><dd id="metric-dropped">0</dd></div>
          <div><dt>TRACE FRAMES</dt><dd id="metric-trace">0</dd></div>
        </dl>
        <section class="tracker-health-card" id="tracker-health-card" data-state="ready" aria-live="polite">
          <div class="tracker-health-heading">
            <span>MOTION CONTROL</span>
            <strong id="tracker-control">FULL</strong>
          </div>
          <h2 id="tracker-health-title">Tracker is ready</h2>
          <p id="tracker-health-detail">Landmarks and standardized actions are available from the active local source.</p>
          <div class="health-fixtures" aria-label="Tracker health message fixtures">
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
          <div class="body-fixtures" aria-label="Missing landmark replay fixtures">
            <button type="button" data-body-fixture="full">FULL</button>
            <button type="button" data-body-fixture="left-arm">LEFT ARM</button>
            <button type="button" data-body-fixture="legs">LEGS</button>
            <button type="button" data-body-fixture="half-body">HALF BODY</button>
          </div>
        </section>
        <section class="simulator-card" id="simulator-card" data-enabled="false">
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
            <button id="simulator-player-toggle" type="button" aria-pressed="false">HIDE PLAYER</button>
          </div>
          <p><strong>KEYS</strong> W/A/S/D move · J hands · K cross · Q/E swipe · H hide</p>
          <p><strong>PAD</strong> Stick/D-pad move · A hands · Start cross. Home and Back remain reserved.</p>
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
        </section>
        <p class="measurement-note">* Browser prototype uses capture-arrival time, not a camera exposure timestamp. It cannot qualify the 120 ms product gate.</p>
        <div class="controls">
          <button id="join-button" class="primary-control" type="button">JOIN PLAYER 1</button>
          <button id="camera-button" type="button">START CAMERA</button>
          <button id="replay-button" type="button" disabled>USE REPLAY</button>
          <button id="export-button" type="button">EXPORT SKELETON TRACE</button>
        </div>
        <p id="status-detail" class="status-detail" role="status">Synthetic input is running. Camera access is off.</p>
      </aside>
    </section>

    <nav class="command-rail" aria-label="Console sections">
      <button class="command active" type="button" data-mode="tracker"><span>01</span>TRACKER</button>
      <button class="command" type="button" data-mode="obstacle"><span>02</span>OBSTACLE</button>
      <button class="command" type="button" data-mode="shell"><span>03</span>SHELL LAB</button>
      <div class="escape-hint"><kbd>ESC</kbd><span>BACK</span></div>
    </nav>

    <div class="console-overlay" id="console-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="overlay-title">
      <div class="overlay-card">
        <p class="eyebrow" id="overlay-eyebrow">SYSTEM PAUSE</p>
        <h2 id="overlay-title">GAME PAUSED</h2>
        <p id="overlay-copy">Player 1 opened the console menu.</p>
        <div class="overlay-options">
          <button type="button" data-overlay-action="resume">RESUME</button>
          <button type="button" data-overlay-action="exit">EXIT TO TRACKER</button>
        </div>
        <p class="overlay-help">SWIPE TO CHOOSE / HANDS TOGETHER TO SELECT</p>
      </div>
    </div>
  </main>
`;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}

const renderer = new SkeletonRenderer(required<HTMLCanvasElement>("#skeleton"));
const motionLab = required<HTMLElement>("#motion-lab");
const trace = new TraceBuffer();
const metrics = new Metrics();
const actionEngine = new ActionEngine();
const playerSession = new PlayerSessionController({ maxPlayers: 1 });
const cameraButton = required<HTMLButtonElement>("#camera-button");
const replayButton = required<HTMLButtonElement>("#replay-button");
const joinButton = required<HTMLButtonElement>("#join-button");
const exportButton = required<HTMLButtonElement>("#export-button");
const statusDetail = required<HTMLElement>("#status-detail");
const gestureFeedback = required<HTMLElement>("#gesture-feedback");
const gestureAction = required<HTMLElement>("#gesture-action");
const gesturePhase = required<HTMLElement>("#gesture-phase");
const gestureProgress = required<HTMLElement>("#gesture-progress");
const gestureProgressFill = required<HTMLElement>("#gesture-progress-fill");
const gestureDetail = required<HTMLElement>("#gesture-detail");
const systemState = required<HTMLElement>("#system-state");
const healthBadge = required<HTMLElement>("#health-badge");
const trackerHealthCard = required<HTMLElement>("#tracker-health-card");
const trackerHealthTitle = required<HTMLElement>("#tracker-health-title");
const trackerHealthDetail = required<HTMLElement>("#tracker-health-detail");
const trackerControl = required<HTMLElement>("#tracker-control");
const healthFixtureButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-health-fixture]")];
const playerAvailabilityCard = required<HTMLElement>("#player-availability-card");
const playerControlState = required<HTMLElement>("#player-control-state");
const playerControlTitle = required<HTMLElement>("#player-control-title");
const playerControlDetail = required<HTMLElement>("#player-control-detail");
const playerUnavailableControls = required<HTMLElement>("#player-unavailable-controls");
const playerRegionIndicators = [
  ...document.querySelectorAll<HTMLElement>("[data-player-region]"),
];
const bodyFixtureButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-body-fixture]")];
const simulatorCard = required<HTMLElement>("#simulator-card");
const simulatorState = required<HTMLElement>("#simulator-state");
const simulatorToggle = required<HTMLButtonElement>("#simulator-toggle");
const simulatorPlayerToggle = required<HTMLButtonElement>("#simulator-player-toggle");
const simulatorPoseButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-simulator-pose]")];
const sourceBadge = required<HTMLElement>("#source-badge");
const overlay = required<HTMLElement>("#console-overlay");
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
const shellCards = [...document.querySelectorAll<HTMLButtonElement>("[data-shell-target]")];
const overlayButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-overlay-action]")];
const poseSimulator = new MotionPoseSimulator();
const obstacleLeaderboard = new LocalObstacleLeaderboard(localStorage);

let latestFrame: MotionFrame | undefined;
let replayRunning = true;
let replaySequence = 0;
let bodyVisibilityFixture: BodyVisibilityFixture = "full";
let simulatorEnabled = false;
let simulatorLatchedPose: MotionSimulatorPose = "neutral";
let simulatorControllerPose: MotionSimulatorPose | undefined;
const simulatorKeyboardPoses = new Map<string, MotionSimulatorPose>();
let lastMetricsPaint = 0;
let currentMode: AppMode = "tracker";
let focusedModeIndex = 0;
let overlayKind: OverlayKind | undefined;
let overlayFocus: "resume" | "exit" = "resume";
let healthSequence = 1;
let activeHealth = trackerHealthFixture("healthy", 0, 0);
let obstacleRunPauseCount = 0;
let obstacleRunTrackingDropoutCount = 0;
let obstacleRunRecorded = false;
let leaderboardResetArmed = false;

const launcher = new LauncherController({
  accessibilityPreferences,
  openMotionLab(mode = "tracker") {
    launcher.hide();
    motionLab.hidden = false;
    setMode(mode);
    modeButtons[focusedModeIndex]?.focus();
  },
});

function showLauncher(): void {
  if (overlayKind) chooseOverlayAction("exit");
  motionLab.hidden = true;
  obstacle.setPaused(true);
  launcher.show();
}

const obstacle = new ObstacleGame(required<HTMLCanvasElement>("#obstacle-canvas"), (score, lives, status) => {
  required<HTMLElement>("#game-score").textContent = String(score).padStart(6, "0");
  required<HTMLElement>("#game-lives").textContent = String(lives);
  required<HTMLElement>("#game-status").textContent = status;
  if (status === "RUN ENDED" && !obstacleRunRecorded) {
    obstacleRunRecorded = true;
    obstacleLeaderboard.record({
      score,
      inputMode: currentLeaderboardInputMode(),
      pauseCount: obstacleRunPauseCount,
      trackingDropoutCount: obstacleRunTrackingDropoutCount,
    });
    paintLeaderboard();
  }
});
obstacle.start();
obstacle.setPaused(true);
paintLeaderboard();

const tracker = new MediaPipeTracker({
  onFrame(frame) {
    replayRunning = false;
    acceptFrame(frame);
  },
  onStatus(status, detail) {
    updateStatus(status, detail);
  },
  onHealth(event) {
    applyTrackerHealth(event);
  },
});

const gamepads = new GamepadRouter(handleConsoleInput, (gamepad, connected) => {
  const mapping = gamepad.mapping === "standard" ? "standard mapping" : "unverified mapping";
  statusDetail.textContent = connected
    ? `Controller connected: ${gamepad.id} (${mapping}). Browser input is a prototype adapter; native SDL3 qualification remains pending.`
    : `Controller disconnected: ${gamepad.id}. Motion and keyboard recovery remain available.`;
}, undefined, handleSimulatorGamepadState, (fault) => {
  statusDetail.textContent =
    `Controller input paused (${fault}). Motion and keyboard recovery remain available while the next bounded observation is checked.`;
});
gamepads.start();

function acceptFrame(rawFrame: MotionFrame): void {
  const fixtureFrame = replayRunning
    ? applyBodyVisibilityFixture(rawFrame, bodyVisibilityFixture)
    : rawFrame;
  const governedHealth =
    fixtureFrame.source === activeHealth.source ? activeHealth.status : fixtureFrame.health;
  const governedFrame: MotionFrame = {
    ...fixtureFrame,
    health: governedHealth,
    players:
      governedHealth === "starting" || governedHealth === "fault"
        ? []
        : fixtureFrame.players.map((player) => ({
            ...player,
            actions: governedHealth === "ready" ? player.actions : [],
          })),
  };
  const frame = actionEngine.enrich(
    governedFrame,
    overlayKind ? "overlay" : currentMode === "obstacle" ? "game" : "shell",
  );
  latestFrame = frame;
  trace.push(frame);
  metrics.push(frame);
  renderer.render(frame);
  for (const event of playerSession.observe(
    frame.publishedAtMs,
    frame.players.map((player) => player.id),
  )) {
    handlePlayerSessionEvent(event);
  }
  const trackActions = frame.players.flatMap((player) =>
    player.actions.map((action) => ({
      action,
      trackId: player.id,
    })),
  );
  let manualPauseOpened = false;
  if (
    currentMode === "obstacle"
    && !launcher.visible
    && !overlayKind
  ) {
    const pauseEvent = playerSession.openPauseForTracks(
      trackActions.flatMap(({ action, trackId }) =>
        action.name === "pause" && action.phase === "triggered"
          ? [{ trackId, completedAtMs: action.occurredAtMs }]
          : [],
      ),
    );
    if (pauseEvent?.type === "pause-opened") {
      showOverlay("manual", pauseEvent.ownerSlot);
      manualPauseOpened = true;
    }
  }
  for (const { action, trackId } of trackActions) {
    if (manualPauseOpened && action.name !== "pause") continue;
    handleAction(action, trackId);
  }

  if (performance.now() - lastMetricsPaint > 250) {
    lastMetricsPaint = performance.now();
    paintMetrics(frame);
  }
}

function handlePlayerSessionEvent(event: PlayerSessionEvent): void {
  if (event.type === "freeze") {
    if (currentMode === "obstacle" && event.reason === "tracking-loss") {
      obstacleRunTrackingDropoutCount += 1;
    }
    obstacle.setPaused(true);
    statusDetail.textContent =
      event.reason === "tracking-loss"
        ? "Tracking loss confirmed. Gameplay is frozen while Player 1 is reacquired."
        : "Tracker continuity failed. Gameplay is frozen pending deliberate recovery.";
  } else if (event.type === "silent-recovery") {
    if (!overlayKind && currentMode === "obstacle") obstacle.setPaused(false);
    statusDetail.textContent = "Player 1 reacquired inside the two-second recovery window.";
  } else if (event.type === "show-recovery") {
    showOverlay("recovery");
  }
}

function handleAction(action: MotionAction, trackId: string): void {
  required<HTMLElement>("#metric-action").textContent =
    `${action.name.replaceAll("_", " ")} / ${action.phase}`.toUpperCase();
  paintActionFeedback(action);
  if (action.phase !== "triggered") return;
  if (action.name === "player_join") {
    joinPlayer(trackId);
    return;
  }
  if (launcher.visible) {
    if (playerSession.authorizeLauncherAction(trackId) === undefined) {
      return;
    }
    const launcherInput = launcherInputForMotionAction(action);
    if (launcherInput) launcher.handleInput(launcherInput);
    return;
  }
  if (action.name === "pause") return;
  if (
    ["dodge_left", "dodge_right", "jump", "duck"].includes(action.name)
  ) {
    if (
      currentMode === "obstacle"
      && playerSession.authorizeGameplayAction(trackId) !== undefined
    ) {
      obstacle.handleAction(action.name);
    }
    return;
  }
  const shellInput = launcherInputForMotionAction(action);
  if (!shellInput) return;
  const authorized =
    overlayKind === "manual"
      ? playerSession.authorizeOverlayAction(trackId) !== undefined
      : overlayKind === "recovery"
        ? playerSession.authorizeRecoveryAction(trackId)
        : playerSession.authorizeLauncherAction(trackId) !== undefined;
  if (!authorized) return;
  if (shellInput === "back") {
    if (overlayKind) chooseOverlayAction("exit", trackId);
    else if (currentMode !== "tracker") setMode("tracker");
    else showLauncher();
  } else if (shellInput === "left") {
    moveFocus(-1);
  } else if (shellInput === "right") {
    moveFocus(1);
  } else if (shellInput === "select") {
    selectFocused(trackId);
  }
}

function handleConsoleInput(action: ConsoleInputAction): void {
  if (launcher.visible) {
    launcher.handleInput(action);
    return;
  }
  if (action === "home") {
    showLauncher();
    return;
  }
  if (action === "back") {
    goBack();
    return;
  }
  if (simulatorEnabled) return;
  if (
    (action === "up" || action === "down")
    && currentMode === "tracker"
    && !overlayKind
  ) {
    if (action === "down") joinButton.focus();
    else modeButtons[focusedModeIndex]?.focus();
    return;
  }
  if (action === "pause" && currentMode === "obstacle") {
    showOverlay("manual");
    return;
  }
  if (action === "left" || action === "right") {
    if (currentMode === "obstacle" && !overlayKind) obstacle.handleAction(action === "left" ? "dodge_left" : "dodge_right");
    else moveFocus(action === "left" ? -1 : 1);
    return;
  }
  if (action === "down" && currentMode === "obstacle" && !overlayKind) {
    obstacle.handleAction("duck");
    return;
  }
  if (action === "select") {
    if (playerSession.snapshot().players.length === 0) joinPlayer();
    else if (
      currentMode === "tracker"
      && document.activeElement === joinButton
    ) {
      joinButton.click();
    }
    else if (currentMode === "obstacle" && !overlayKind) obstacle.handleAction("jump");
    else selectFocused();
  }
}

function joinPlayer(trackId?: string): void {
  const candidate = trackId === undefined
    ? latestFrame?.players[0]
    : latestFrame?.players.find((player) => player.id === trackId);
  if (!candidate) {
    statusDetail.textContent = "No visible candidate is available to join.";
    if (trackId !== undefined) synchronizeActionEngineAssignment();
    return;
  }
  try {
    playerSession.join(candidate.id);
  } catch (error) {
    if (trackId !== undefined) synchronizeActionEngineAssignment();
    statusDetail.textContent = error instanceof Error ? error.message : String(error);
    return;
  }
  actionEngine.join();
  joinButton.disabled = false;
  joinButton.textContent = "LEAVE PLAYER 1";
  statusDetail.textContent = "Player 1 joined. Automatic standing calibration is collecting its initial baseline.";
}

function synchronizeActionEngineAssignment(): void {
  if (playerSession.snapshot().players.length === 0) actionEngine.leave();
  else actionEngine.join();
}

function leavePlayer(): void {
  const player = playerSession.snapshot().players[0];
  if (!player) {
    statusDetail.textContent = "No joined player is available to leave.";
    return;
  }
  try {
    playerSession.leave(player.slot);
  } catch (error) {
    statusDetail.textContent =
      error instanceof Error ? error.message : String(error);
    return;
  }
  actionEngine.leave();
  obstacle.setPaused(true);
  joinButton.disabled = false;
  joinButton.textContent = "JOIN PLAYER 1";
  statusDetail.textContent =
    "Player 1 left deliberately. Visible bodies remain candidates; release the join gesture before a fresh re-entry.";
}

function togglePlayerAssignment(): void {
  if (playerSession.snapshot().players.length === 0) joinPlayer();
  else leavePlayer();
}

function paintMetrics(frame: MotionFrame): void {
  const snapshot = metrics.snapshot();
  const player = frame.players[0];
  required<HTMLElement>("#metric-tracker").textContent =
    frame.source === "mediapipe-web"
      ? tracker.delegate.toUpperCase()
      : simulatorEnabled
        ? "SIMULATOR"
        : "SYNTHETIC";
  required<HTMLElement>("#metric-player").textContent = player ? `${player.state.toUpperCase()} 01` : "NOT FOUND";
  required<HTMLElement>("#metric-confidence").textContent = player ? `${Math.round(player.confidence * 100)}%` : "--";
  required<HTMLElement>("#metric-fps").textContent = snapshot.fps ? snapshot.fps.toFixed(1) : "--";
  required<HTMLElement>("#metric-inference-p50").textContent = `${snapshot.inferenceP50.toFixed(1)} MS`;
  required<HTMLElement>("#metric-inference-p95").textContent = `${snapshot.inferenceP95.toFixed(1)} MS`;
  required<HTMLElement>("#metric-pipeline-p95").textContent = `${snapshot.pipelineP95.toFixed(1)} MS*`;
  required<HTMLElement>("#metric-dropped").textContent = String(tracker.droppedFrames);
  required<HTMLElement>("#metric-trace").textContent = String(trace.size);
  paintPlayerControlAvailability(
    assessPlayerControlAvailability(frame.players[0], frame.health),
  );
}

const CONTROL_LABELS = {
  menuSelect: "SELECT",
  menuBackPause: "BACK / PAUSE",
  menuSwipe: "SWIPE",
  gameDodge: "DODGE",
  gameDuck: "DUCK",
  gameJump: "JUMP",
} as const satisfies Readonly<Record<PlayerControlGroup, string>>;

function paintPlayerControlAvailability(availability: PlayerControlAvailability): void {
  playerAvailabilityCard.dataset.state = availability.state;
  playerControlState.textContent = availability.state.toUpperCase();
  playerControlTitle.textContent =
    availability.reason === "tracker-not-ready"
      ? "Tracker health blocks motion control"
      : availability.reason === "player-missing"
        ? "No player body is available"
        : availability.state === "full"
          ? "All tracked regions observed"
          : availability.state === "partial"
            ? "Some controls remain available"
            : "Required control landmarks are missing";
  playerControlDetail.textContent =
    availability.reason === "tracker-not-ready"
      ? "Global tracker health remains authoritative. Use controller or keyboard until it recovers."
      : availability.reason === "player-missing"
        ? "Re-enter the tracking area or use controller or keyboard recovery."
        : availability.state === "full"
          ? "All six control groups have their required observed landmarks."
          : `${availability.missingLandmarks.length} of 17 core landmarks are not observed. Unrelated controls remain active.`;
  const unavailable = PLAYER_CONTROL_GROUPS.filter(
    (control) => !availability.controls[control],
  ).map((control) => CONTROL_LABELS[control]);
  playerUnavailableControls.replaceChildren();
  const label = document.createElement("strong");
  label.textContent = "UNAVAILABLE";
  playerUnavailableControls.append(label, ` ${unavailable.join(" · ") || "NONE"}`);
  for (const indicator of playerRegionIndicators) {
    const region = indicator.dataset.playerRegion as (typeof PLAYER_BODY_REGIONS)[number];
    indicator.dataset.state = availability.regions[region];
  }
}

function setBodyVisibilityFixture(fixture: BodyVisibilityFixture): void {
  bodyVisibilityFixture = fixture;
  for (const button of bodyFixtureButtons) {
    const active = button.dataset.bodyFixture === fixture;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function updateStatus(status: TrackerStatus, detail: string): void {
  statusDetail.textContent = detail;
  cameraButton.disabled = status === "loading" || status === "requesting-camera";
  cameraButton.textContent = status === "running" ? "STOP CAMERA" : "START CAMERA";
  replayButton.disabled = replayRunning;
  sourceBadge.textContent =
    status === "running"
      ? "MEDIAPIPE / LOCAL"
      : simulatorEnabled
        ? `POSE SIMULATOR / ${poseSimulator.snapshot.pose.replaceAll("-", " ").toUpperCase()}`
        : "SYNTHETIC REPLAY";
  for (const button of healthFixtureButtons) button.disabled = !replayRunning;
  for (const button of bodyFixtureButtons) button.disabled = !replayRunning;
}

function applyTrackerHealth(event: TrackerHealthEvent): void {
  activeHealth = event;
  const presentation = trackerHealthPresentation(event);
  healthBadge.textContent = presentation.badge;
  healthBadge.dataset.state = event.status;
  trackerHealthCard.dataset.state = event.status;
  trackerHealthTitle.textContent = presentation.title;
  trackerHealthDetail.textContent = presentation.detail;
  trackerControl.textContent =
    event.controlAvailability === "full"
      ? "FULL"
      : event.controlAvailability === "landmarks-only"
        ? "LANDMARKS ONLY"
        : "CONTROLLER ONLY";
  systemState.textContent =
    event.status === "ready"
      ? event.source === "mediapipe-web" ? "CAMERA ACTIVE" : "REPLAY READY"
      : event.status === "degraded"
        ? "TRACKER DEGRADED"
        : event.status === "starting"
          ? "TRACKER STARTING"
          : "TRACKER FAULT";
  if (event.status !== "ready") actionEngine.suspend();
  if (event.controlAvailability === "blocked") {
    obstacle.setPaused(true);
    for (const sessionEvent of playerSession.observe(event.occurredAtMs, [], { hardFault: true })) {
      handlePlayerSessionEvent(sessionEvent);
    }
  }
}

function simulatorPoseFromGamepad(actions: ReadonlySet<ConsoleInputAction>): MotionSimulatorPose | undefined {
  if (actions.has("pause")) return "crossed-arms";
  if (actions.has("select")) return "hands-together";
  if (actions.has("down")) return "duck";
  if (actions.has("up")) return "jump";
  if (actions.has("left")) return "dodge-left";
  if (actions.has("right")) return "dodge-right";
  return undefined;
}

function handleSimulatorGamepadState(actions: ReadonlySet<ConsoleInputAction>): void {
  if (!simulatorEnabled) return;
  const next = simulatorPoseFromGamepad(actions);
  if (next === simulatorControllerPose) return;
  simulatorControllerPose = next;
  applyEffectiveSimulatorPose();
}

function effectiveSimulatorPose(): MotionSimulatorPose {
  const keyboard = [...simulatorKeyboardPoses.values()].at(-1);
  return keyboard ?? simulatorControllerPose ?? simulatorLatchedPose;
}

function applyEffectiveSimulatorPose(): void {
  poseSimulator.setPose(effectiveSimulatorPose());
  paintSimulator();
}

function setSimulatorLatchedPose(pose: MotionSimulatorPose): void {
  simulatorLatchedPose = pose;
  applyEffectiveSimulatorPose();
}

function setSimulatorPlayerVisible(visible: boolean): void {
  poseSimulator.setPlayerVisible(visible);
  paintSimulator();
}

function setSimulatorEnabled(enabled: boolean, restartReplay = true): void {
  if (simulatorEnabled === enabled && !restartReplay) return;
  simulatorEnabled = enabled;
  simulatorLatchedPose = "neutral";
  simulatorControllerPose = undefined;
  simulatorKeyboardPoses.clear();
  poseSimulator.reset();
  paintSimulator();
  if (restartReplay) {
    startReplay(
      "idle",
      enabled
        ? "Camera-free pose simulator is active. Landmarks are deterministic; no camera is requested."
        : "Synthetic input is running. Camera access is off.",
    );
  }
}

function paintSimulator(): void {
  const snapshot = poseSimulator.snapshot;
  simulatorCard.dataset.enabled = String(simulatorEnabled);
  simulatorState.textContent = simulatorEnabled
    ? `${snapshot.pose.replaceAll("-", " ").toUpperCase()} / ${snapshot.playerVisible ? "VISIBLE" : "HIDDEN"}`
    : "OFF";
  simulatorToggle.textContent = simulatorEnabled ? "DISABLE POSE SIMULATOR" : "ENABLE POSE SIMULATOR";
  simulatorToggle.setAttribute("aria-pressed", String(simulatorEnabled));
  simulatorPlayerToggle.textContent = snapshot.playerVisible ? "HIDE PLAYER" : "SHOW PLAYER";
  simulatorPlayerToggle.setAttribute("aria-pressed", String(!snapshot.playerVisible));
  simulatorPlayerToggle.disabled = !simulatorEnabled;
  for (const button of simulatorPoseButtons) {
    const pose = button.dataset.simulatorPose as MotionSimulatorPose;
    button.disabled = !simulatorEnabled;
    button.classList.toggle("active", simulatorEnabled && snapshot.pose === pose);
  }
  if (replayRunning) {
    sourceBadge.textContent = simulatorEnabled
      ? `POSE SIMULATOR / ${snapshot.pose.replaceAll("-", " ").toUpperCase()}`
      : "SYNTHETIC REPLAY";
  }
}

function setMode(mode: AppMode): void {
  currentMode = mode;
  focusedModeIndex = Math.max(0, modeButtons.findIndex((button) => button.dataset.mode === mode));
  for (const view of document.querySelectorAll<HTMLElement>(".stage-view")) view.hidden = view.id !== `${mode}-view`;
  for (const button of modeButtons) button.classList.toggle("active", button.dataset.mode === mode);
  for (const card of shellCards) card.classList.toggle("focused", card.dataset.shellTarget === mode);
  const copy = MODE_COPY[mode];
  required<HTMLElement>("#stage-eyebrow").textContent = copy.eyebrow;
  required<HTMLElement>("#lab-title").textContent = copy.title;
  required<HTMLElement>("#stage-note").innerHTML = copy.note;
  obstacle.setPaused(mode !== "obstacle" || Boolean(overlayKind));
  if (mode !== "obstacle") disarmLeaderboardReset();
}

function moveFocus(direction: -1 | 1): void {
  if (overlayKind) {
    overlayFocus = overlayFocus === "resume" ? "exit" : "resume";
    paintOverlayFocus();
    return;
  }
  focusedModeIndex = (focusedModeIndex + direction + modeButtons.length) % modeButtons.length;
  modeButtons[focusedModeIndex]?.focus();
  for (const card of shellCards) card.classList.toggle("focused", card.dataset.shellTarget === modeButtons[focusedModeIndex]?.dataset.mode);
}

function selectFocused(trackId?: string): void {
  if (overlayKind) {
    chooseOverlayAction(overlayFocus, trackId);
    return;
  }
  modeButtons[focusedModeIndex]?.click();
}

function showOverlay(
  kind: OverlayKind,
  ownerSlot?: 1 | 2,
): void {
  if (overlayKind) return;
  if (kind === "manual" && currentMode === "obstacle") obstacleRunPauseCount += 1;
  overlayKind = kind;
  overlay.hidden = false;
  obstacle.setPaused(true);
  overlayFocus = kind === "manual" ? "exit" : "resume";
  required<HTMLElement>("#overlay-eyebrow").textContent =
    kind === "manual"
      ? ownerSlot === undefined
        ? "SYSTEM PAUSE / CONTROLLER"
        : `SYSTEM PAUSE / PLAYER ${ownerSlot}`
      : "TRACKING RECOVERY";
  required<HTMLElement>("#overlay-title").textContent = kind === "manual" ? "GAME PAUSED" : "PLAYER LOST";
  required<HTMLElement>("#overlay-copy").textContent =
    kind === "manual"
      ? ownerSlot === undefined
        ? "The recovery controller opened the console menu. Exit is focused by default."
        : `Player ${ownerSlot} opened the console menu. Exit is focused by default.`
      : "Tracking did not recover in two seconds. Resume is focused by default.";
  paintOverlayFocus();
}

function paintOverlayFocus(): void {
  for (const button of overlayButtons) {
    const focused = button.dataset.overlayAction === overlayFocus;
    button.classList.toggle("focused", focused);
    if (focused) button.focus();
  }
}

function chooseOverlayAction(
  action: "resume" | "exit",
  recoveryTrackId?: string,
): void {
  const kind = overlayKind;
  if (action === "exit") {
    if (kind === "recovery") resetPlayerSession();
    else closeOwnedPause("launcher");
    closeOverlay(false);
    setMode("tracker");
    return;
  }
  if (kind === "recovery") {
    const candidate = recoveryTrackId === undefined
      ? latestFrame?.players[0]
      : latestFrame?.players.find(
          (player) => player.id === recoveryTrackId,
        );
    if (!candidate) {
      statusDetail.textContent = "Resume requires a visible player candidate.";
      return;
    }
    try {
      playerSession.resumeRecovery(candidate.id);
    } catch (error) {
      statusDetail.textContent = error instanceof Error ? error.message : String(error);
      return;
    }
  } else {
    closeOwnedPause("game");
  }
  closeOverlay(true);
}

function closeOwnedPause(destination: "game" | "launcher"): void {
  const snapshot = playerSession.snapshot();
  if (
    snapshot.phase === "paused"
    && snapshot.overlayOwner !== undefined
  ) {
    playerSession.closePause(snapshot.overlayOwner, destination);
  }
}

function paintActionFeedback(action: MotionAction): void {
  const feedback = actionFeedback(action);
  const percent = Math.round(feedback.progress * 100);
  gestureFeedback.dataset.state = feedback.phase;
  gestureAction.textContent = feedback.actionLabel.toUpperCase();
  gesturePhase.textContent = feedback.phaseLabel.toUpperCase();
  gestureProgress.setAttribute("aria-valuenow", String(percent));
  gestureProgress.setAttribute("aria-valuetext", `${feedback.actionLabel}: ${feedback.phaseLabel}`);
  gestureProgressFill.style.width = `${percent}%`;
  gestureDetail.textContent = feedback.detail;
}

function resetPlayerSession(): void {
  playerSession.reset();
  actionEngine.reset();
  joinButton.disabled = false;
  joinButton.textContent = "JOIN PLAYER 1";
}

function closeOverlay(resume: boolean): void {
  overlay.hidden = true;
  overlayKind = undefined;
  obstacle.setPaused(!resume || currentMode !== "obstacle");
  statusDetail.textContent = resume ? "Game resumed deliberately." : "Console overlay closed.";
  modeButtons[focusedModeIndex]?.focus();
}

function goBack(): void {
  if (overlayKind) chooseOverlayAction("exit");
  else if (currentMode !== "tracker") setMode("tracker");
  else if (!replayRunning) startReplay();
  else showLauncher();
}

function startReplay(status: TrackerStatus = "idle", detail = "Synthetic input is running. Camera access is off."): void {
  tracker.stop();
  replayRunning = true;
  metrics.reset();
  trace.clear();
  resetPlayerSession();
  replayButton.disabled = true;
  cameraButton.textContent = "START CAMERA";
  paintSimulator();
  applyTrackerHealth(trackerHealthFixture("healthy", healthSequence++, performance.now()));
  updateStatus(status, detail);
}

function currentLeaderboardInputMode(): LeaderboardInputMode {
  if (!replayRunning) return "camera";
  return simulatorEnabled ? "simulator" : "replay";
}

function resetObstacleRun(): void {
  obstacleRunPauseCount = 0;
  obstacleRunTrackingDropoutCount = 0;
  obstacleRunRecorded = false;
  obstacle.reset();
  obstacle.setPaused(currentMode !== "obstacle" || Boolean(overlayKind));
  statusDetail.textContent = "A new unverified local run is ready.";
}

function paintLeaderboard(): void {
  const list = required<HTMLOListElement>("#leaderboard-list");
  const storageStatus = required<HTMLElement>("#leaderboard-storage-status");
  const snapshot = obstacleLeaderboard.snapshot();
  list.replaceChildren();
  if (snapshot.entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "NO COMPLETED RUNS";
    list.append(empty);
  } else {
    for (const [index, entry] of snapshot.entries.slice(0, 5).entries()) {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const score = document.createElement("strong");
      const context = document.createElement("small");
      rank.textContent = String(index + 1).padStart(2, "0");
      score.textContent = `${String(entry.score).padStart(6, "0")} · ${
        entry.player.kind === "local-profile" ? entry.player.label : "UNASSIGNED"
      }`;
      context.textContent =
        `${entry.inputMode.toUpperCase()} · P${entry.pauseCount} · DROP ${entry.trackingDropoutCount}`;
      item.append(rank, score, context);
      list.append(item);
    }
  }
  storageStatus.textContent = !snapshot.persistenceAvailable
    ? "LOCAL STORAGE UNAVAILABLE — THIS SESSION'S SCORES WILL NOT SURVIVE RELOAD."
    : snapshot.recoveredMalformedData
      ? "MALFORMED LOCAL SCORE DATA WAS REMOVED. THE BOARD RECOVERED EMPTY."
      : `${snapshot.entries.length} OF 20 LOCAL RUNS RETAINED.`;
  storageStatus.dataset.state =
    !snapshot.persistenceAvailable || snapshot.recoveredMalformedData ? "warning" : "ready";
}

function disarmLeaderboardReset(): void {
  leaderboardResetArmed = false;
  required<HTMLButtonElement>("#reset-board-button").textContent = "RESET LOCAL BOARD";
}

function replayLoop(now: number): void {
  if (replayRunning) {
    acceptFrame(
      simulatorEnabled
        ? poseSimulator.frame(replaySequence++, now)
        : syntheticFrame(replaySequence++, now),
    );
  }
  requestAnimationFrame(replayLoop);
}

cameraButton.addEventListener("click", async () => {
  if (cameraButton.textContent === "STOP CAMERA") {
    startReplay();
    return;
  }
  setSimulatorEnabled(false, false);
  setBodyVisibilityFixture("full");
  replayRunning = false;
  metrics.reset();
  trace.clear();
  resetPlayerSession();
  try {
    await tracker.start();
    replayButton.disabled = false;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    startReplay("fault", `Camera start failed; synthetic fallback is active. ${detail}`);
  }
});

joinButton.addEventListener("click", togglePlayerAssignment);
replayButton.addEventListener("click", () => startReplay());
simulatorToggle.addEventListener("click", () => setSimulatorEnabled(!simulatorEnabled));
simulatorPlayerToggle.addEventListener("click", () => {
  if (simulatorEnabled) setSimulatorPlayerVisible(!poseSimulator.snapshot.playerVisible);
});
for (const button of simulatorPoseButtons) {
  button.addEventListener("click", () => {
    if (simulatorEnabled) setSimulatorLatchedPose(button.dataset.simulatorPose as MotionSimulatorPose);
  });
}
required<HTMLButtonElement>("#home-button").addEventListener("click", showLauncher);
for (const button of modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode as AppMode));
for (const card of shellCards) card.addEventListener("click", () => setMode(card.dataset.shellTarget as AppMode));
for (const button of overlayButtons) button.addEventListener("click", () => chooseOverlayAction(button.dataset.overlayAction as "resume" | "exit"));
for (const button of healthFixtureButtons) {
  button.addEventListener("click", () => {
    if (!replayRunning) return;
    const reason = button.dataset.healthFixture as TrackerHealthReason;
    applyTrackerHealth(trackerHealthFixture(reason, healthSequence++, performance.now()));
  });
}
for (const button of bodyFixtureButtons) {
  button.addEventListener("click", () => {
    if (replayRunning) {
      setBodyVisibilityFixture(button.dataset.bodyFixture as BodyVisibilityFixture);
    }
  });
}
required<HTMLButtonElement>("#manual-pause-button").addEventListener("click", () => showOverlay("manual"));
required<HTMLButtonElement>("#tracking-loss-button").addEventListener("click", () => {
  if (currentMode === "obstacle") obstacleRunTrackingDropoutCount += 1;
  obstacle.setPaused(true);
  statusDetail.textContent = "Test loss confirmed. Waiting through the two-second reacquisition window.";
  setTimeout(() => showOverlay("recovery"), 2_000);
});

exportButton.addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(trace.snapshot(), null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `vcg-motion-trace-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  statusDetail.textContent = `Exported ${trace.size} skeleton-only frames. No camera images were included.`;
});

function paintClock(): void {
  required<HTMLElement>("#clock").textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

const SIMULATOR_KEY_POSES = new Map<string, MotionSimulatorPose>([
  ["KeyW", "jump"],
  ["KeyA", "dodge-left"],
  ["KeyD", "dodge-right"],
  ["KeyS", "duck"],
  ["KeyJ", "hands-together"],
  ["KeyK", "crossed-arms"],
  ["KeyQ", "swipe-left"],
  ["KeyE", "swipe-right"],
]);

function handleSimulatorKeyDown(event: KeyboardEvent): boolean {
  if (
    !simulatorEnabled
    || motionLab.hidden
    || event.metaKey
    || event.ctrlKey
    || event.altKey
    || event.target instanceof HTMLInputElement
    || event.target instanceof HTMLTextAreaElement
  ) {
    return false;
  }
  if (event.code === "KeyH") {
    event.preventDefault();
    if (!event.repeat) setSimulatorPlayerVisible(!poseSimulator.snapshot.playerVisible);
    return true;
  }
  if (event.code === "KeyN") {
    event.preventDefault();
    if (!event.repeat) {
      simulatorKeyboardPoses.clear();
      setSimulatorLatchedPose("neutral");
    }
    return true;
  }
  const pose = SIMULATOR_KEY_POSES.get(event.code);
  if (!pose) return false;
  event.preventDefault();
  simulatorKeyboardPoses.set(event.code, pose);
  applyEffectiveSimulatorPose();
  return true;
}

function handleSimulatorKeyUp(event: KeyboardEvent): void {
  if (!simulatorKeyboardPoses.delete(event.code)) return;
  event.preventDefault();
  applyEffectiveSimulatorPose();
}

window.addEventListener("beforeunload", () => {
  gamepads.stop();
  void tracker.close();
});
required<HTMLButtonElement>("#new-run-button").addEventListener("click", resetObstacleRun);
required<HTMLButtonElement>("#reset-board-button").addEventListener("click", () => {
  if (!leaderboardResetArmed) {
    leaderboardResetArmed = true;
    required<HTMLButtonElement>("#reset-board-button").textContent = "CONFIRM RESET";
    statusDetail.textContent = "Press Confirm Reset to permanently clear this device's local obstacle board.";
    return;
  }
  obstacleLeaderboard.reset();
  paintLeaderboard();
  disarmLeaderboardReset();
  statusDetail.textContent = "The unverified local obstacle board was reset.";
});
window.addEventListener("keyup", handleSimulatorKeyUp);
document.addEventListener("keydown", (event) => {
  if (handleSimulatorKeyDown(event)) return;
  if (event.key === "/" && launcher.visible && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    launcher.openSearch();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (launcher.visible) launcher.back();
    else goBack();
  }
  if (!launcher.visible && overlayKind && ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    moveFocus(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
  } else if (!launcher.visible && currentMode === "obstacle" && !overlayKind && event.key === "ArrowLeft") {
    obstacle.handleAction("dodge_left");
  } else if (!launcher.visible && currentMode === "obstacle" && !overlayKind && event.key === "ArrowRight") {
    obstacle.handleAction("dodge_right");
  } else if (!launcher.visible && currentMode === "obstacle" && !overlayKind && event.key === "ArrowDown") {
    obstacle.handleAction("duck");
  }
  if (!launcher.visible && currentMode === "obstacle" && !overlayKind && event.key === " ") {
    event.preventDefault();
    obstacle.handleAction("jump");
  }
  if (event.key === "Enter" && overlayKind) chooseOverlayAction(overlayFocus);
});

if (new URLSearchParams(window.location.search).get("motionSimulatorTest") === "1") {
  window.__vcgMotionSimulator = Object.freeze({
    enable(enabled = true) {
      setSimulatorEnabled(enabled);
    },
    setPlayerVisible(visible: boolean) {
      if (!simulatorEnabled) setSimulatorEnabled(true);
      setSimulatorPlayerVisible(visible);
    },
    setPose(pose: MotionSimulatorPose) {
      if (!(MOTION_SIMULATOR_POSES as readonly string[]).includes(pose)) {
        throw new Error(`Unknown simulator pose: ${String(pose)}`);
      }
      if (!simulatorEnabled) setSimulatorEnabled(true);
      setSimulatorLatchedPose(pose);
    },
    snapshot() {
      return { enabled: simulatorEnabled, ...poseSimulator.snapshot };
    },
  });
}

setBodyVisibilityFixture("full");
paintSimulator();
paintClock();
setInterval(paintClock, 15_000);
requestAnimationFrame(replayLoop);
