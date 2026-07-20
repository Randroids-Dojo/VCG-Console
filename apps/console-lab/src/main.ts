import type { MotionAction, MotionFrame } from "@vcg/motion-contract";
import { ActionEngine } from "./action-engine";
import { GamepadRouter, type ConsoleInputAction } from "./gamepad-router";
import { LauncherController, launcherMarkup } from "./launcher";
import { Metrics } from "./metrics";
import { ObstacleGame } from "./obstacle-game";
import { SkeletonRenderer } from "./renderer";
import "./styles.css";
import { syntheticFrame } from "./synthetic";
import { TraceBuffer } from "./trace-buffer";
import { MediaPipeTracker, type TrackerStatus } from "./tracker";
import { TrackingLossController } from "./tracking-loss";

type AppMode = "tracker" | "obstacle" | "shell";
type OverlayKind = "manual" | "recovery";

const MODE_COPY: Record<AppMode, { eyebrow: string; title: string; note: string }> = {
  tracker: { eyebrow: "MOTION LAB / 001", title: "YOUR BODY IS THE SIGNAL.", note: "RAW VIDEO<br />NOT SHOWN<br />NOT RECORDED" },
  obstacle: { eyebrow: "ACTION LAB / 002", title: "MOVE BEFORE IT HITS.", note: "DODGE LEFT + RIGHT<br />DUCK / JUMP<br />ESC ALWAYS RETURNS" },
  shell: { eyebrow: "SHELL LAB / 003", title: "EVERY PATH LEADS BACK.", note: "MOTION + CONTROLLER<br />SHARE ONE FOCUS<br />HOME STAYS OUTSIDE" },
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");

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
const trackingLoss = new TrackingLossController();
const cameraButton = required<HTMLButtonElement>("#camera-button");
const replayButton = required<HTMLButtonElement>("#replay-button");
const joinButton = required<HTMLButtonElement>("#join-button");
const exportButton = required<HTMLButtonElement>("#export-button");
const statusDetail = required<HTMLElement>("#status-detail");
const systemState = required<HTMLElement>("#system-state");
const healthBadge = required<HTMLElement>("#health-badge");
const sourceBadge = required<HTMLElement>("#source-badge");
const overlay = required<HTMLElement>("#console-overlay");
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
const shellCards = [...document.querySelectorAll<HTMLButtonElement>("[data-shell-target]")];
const overlayButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-overlay-action]")];

let latestFrame: MotionFrame | undefined;
let replayRunning = true;
let replaySequence = 0;
let lastMetricsPaint = 0;
let currentMode: AppMode = "tracker";
let focusedModeIndex = 0;
let sessionActive = false;
let overlayKind: OverlayKind | undefined;
let overlayFocus: "resume" | "exit" = "resume";

const launcher = new LauncherController({
  openMotionLab(mode = "tracker") {
    launcher.hide();
    motionLab.hidden = false;
    setMode(mode);
    modeButtons[focusedModeIndex]?.focus();
  },
});

function showLauncher(): void {
  if (overlayKind) closeOverlay(false);
  motionLab.hidden = true;
  obstacle.setPaused(true);
  launcher.show();
}

const obstacle = new ObstacleGame(required<HTMLCanvasElement>("#obstacle-canvas"), (score, lives, status) => {
  required<HTMLElement>("#game-score").textContent = String(score).padStart(6, "0");
  required<HTMLElement>("#game-lives").textContent = String(lives);
  required<HTMLElement>("#game-status").textContent = status;
});
obstacle.start();

const tracker = new MediaPipeTracker({
  onFrame(frame) {
    replayRunning = false;
    acceptFrame(frame);
  },
  onStatus(status, detail) {
    updateStatus(status, detail);
  },
});

const gamepads = new GamepadRouter(handleConsoleInput, (gamepad, connected) => {
  const mapping = gamepad.mapping === "standard" ? "standard mapping" : "unverified mapping";
  statusDetail.textContent = connected
    ? `Controller connected: ${gamepad.id} (${mapping}). Browser input is a prototype adapter; native SDL3 qualification remains pending.`
    : `Controller disconnected: ${gamepad.id}. Motion and keyboard recovery remain available.`;
});
gamepads.start();

function acceptFrame(rawFrame: MotionFrame): void {
  const frame = actionEngine.enrich(rawFrame, currentMode === "obstacle" ? "game" : "shell");
  latestFrame = frame;
  trace.push(frame);
  metrics.push(frame);
  renderer.render(frame);
  for (const action of frame.players[0]?.actions ?? []) handleAction(action);

  const lossEvent = trackingLoss.update(frame.publishedAtMs, frame.players.length > 0, sessionActive);
  if (lossEvent === "freeze") {
    obstacle.setPaused(true);
    statusDetail.textContent = "Tracking loss confirmed. Gameplay is frozen while Player 1 is reacquired.";
  } else if (lossEvent === "recovered") {
    if (!overlayKind) obstacle.setPaused(false);
    statusDetail.textContent = "Player 1 reacquired inside the two-second recovery window.";
  } else if (lossEvent === "show-recovery") {
    showOverlay("recovery");
  }

  if (performance.now() - lastMetricsPaint > 250) {
    lastMetricsPaint = performance.now();
    paintMetrics(frame);
  }
}

function handleAction(action: MotionAction): void {
  required<HTMLElement>("#metric-action").textContent = action.name.replaceAll("_", " ").toUpperCase();
  if (action.name === "player_join") joinPlayer();
  if (["dodge_left", "dodge_right", "jump", "duck"].includes(action.name)) obstacle.handleAction(action.name);
  if (action.name === "pause" && currentMode === "obstacle") showOverlay("manual");
  if (action.name === "menu_back") {
    if (overlayKind) closeOverlay(false);
    else if (currentMode !== "tracker") setMode("tracker");
    else showLauncher();
  }
  if (action.name === "menu_swipe_left") moveFocus(-1);
  if (action.name === "menu_swipe_right") moveFocus(1);
  if (action.name === "menu_select") selectFocused();
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
    if (!sessionActive) joinPlayer();
    else if (currentMode === "obstacle" && !overlayKind) obstacle.handleAction("jump");
    else selectFocused();
  }
}

function joinPlayer(): void {
  actionEngine.join();
  sessionActive = true;
  joinButton.disabled = true;
  joinButton.textContent = "PLAYER 1 JOINED";
  statusDetail.textContent = "Player 1 joined. Automatic standing calibration is collecting its initial baseline.";
}

function paintMetrics(frame: MotionFrame): void {
  const snapshot = metrics.snapshot();
  const player = frame.players[0];
  required<HTMLElement>("#metric-tracker").textContent = frame.source === "mediapipe-web" ? tracker.delegate.toUpperCase() : "SYNTHETIC";
  required<HTMLElement>("#metric-player").textContent = player ? `${player.state.toUpperCase()} 01` : "NOT FOUND";
  required<HTMLElement>("#metric-confidence").textContent = player ? `${Math.round(player.confidence * 100)}%` : "--";
  required<HTMLElement>("#metric-fps").textContent = snapshot.fps ? snapshot.fps.toFixed(1) : "--";
  required<HTMLElement>("#metric-inference-p50").textContent = `${snapshot.inferenceP50.toFixed(1)} MS`;
  required<HTMLElement>("#metric-inference-p95").textContent = `${snapshot.inferenceP95.toFixed(1)} MS`;
  required<HTMLElement>("#metric-pipeline-p95").textContent = `${snapshot.pipelineP95.toFixed(1)} MS*`;
  required<HTMLElement>("#metric-dropped").textContent = String(tracker.droppedFrames);
  required<HTMLElement>("#metric-trace").textContent = String(trace.size);
}

function updateStatus(status: TrackerStatus, detail: string): void {
  statusDetail.textContent = detail;
  healthBadge.textContent = status === "running" ? "LIVE" : status.toUpperCase();
  healthBadge.dataset.state = status;
  systemState.textContent = status === "running" ? "CAMERA ACTIVE" : status === "fault" ? "TRACKER FAULT" : "REPLAY READY";
  cameraButton.disabled = status === "loading" || status === "requesting-camera";
  cameraButton.textContent = status === "running" ? "STOP CAMERA" : "START CAMERA";
  replayButton.disabled = replayRunning;
  sourceBadge.textContent = status === "running" ? "MEDIAPIPE / LOCAL" : "SYNTHETIC REPLAY";
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

function selectFocused(): void {
  if (overlayKind) {
    chooseOverlayAction(overlayFocus);
    return;
  }
  modeButtons[focusedModeIndex]?.click();
}

function showOverlay(kind: OverlayKind): void {
  overlayKind = kind;
  overlay.hidden = false;
  obstacle.setPaused(true);
  overlayFocus = kind === "manual" ? "exit" : "resume";
  required<HTMLElement>("#overlay-eyebrow").textContent = kind === "manual" ? "SYSTEM PAUSE / PLAYER 1" : "TRACKING RECOVERY";
  required<HTMLElement>("#overlay-title").textContent = kind === "manual" ? "GAME PAUSED" : "PLAYER LOST";
  required<HTMLElement>("#overlay-copy").textContent =
    kind === "manual" ? "Player 1 opened the console menu. Exit is focused by default." : "Tracking did not recover in two seconds. Resume is focused by default.";
  paintOverlayFocus();
}

function paintOverlayFocus(): void {
  for (const button of overlayButtons) {
    const focused = button.dataset.overlayAction === overlayFocus;
    button.classList.toggle("focused", focused);
    if (focused) button.focus();
  }
}

function chooseOverlayAction(action: "resume" | "exit"): void {
  if (action === "exit") {
    closeOverlay(false);
    setMode("tracker");
    return;
  }
  closeOverlay(true);
}

function closeOverlay(resume: boolean): void {
  overlay.hidden = true;
  overlayKind = undefined;
  obstacle.setPaused(!resume || currentMode !== "obstacle");
  statusDetail.textContent = resume ? "Game resumed deliberately." : "Console overlay closed.";
  modeButtons[focusedModeIndex]?.focus();
}

function goBack(): void {
  if (overlayKind) closeOverlay(false);
  else if (currentMode !== "tracker") setMode("tracker");
  else if (!replayRunning) startReplay();
  else showLauncher();
}

function startReplay(status: TrackerStatus = "idle", detail = "Synthetic input is running. Camera access is off."): void {
  tracker.stop();
  replayRunning = true;
  metrics.reset();
  trace.clear();
  replayButton.disabled = true;
  cameraButton.textContent = "START CAMERA";
  sourceBadge.textContent = "SYNTHETIC REPLAY";
  updateStatus(status, detail);
}

function replayLoop(now: number): void {
  if (replayRunning) acceptFrame(syntheticFrame(replaySequence++, now));
  requestAnimationFrame(replayLoop);
}

cameraButton.addEventListener("click", async () => {
  if (cameraButton.textContent === "STOP CAMERA") {
    startReplay();
    return;
  }
  replayRunning = false;
  metrics.reset();
  trace.clear();
  try {
    await tracker.start();
    replayButton.disabled = false;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    startReplay("fault", `Camera start failed; synthetic fallback is active. ${detail}`);
  }
});

joinButton.addEventListener("click", joinPlayer);
replayButton.addEventListener("click", () => startReplay());
required<HTMLButtonElement>("#home-button").addEventListener("click", showLauncher);
for (const button of modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode as AppMode));
for (const card of shellCards) card.addEventListener("click", () => setMode(card.dataset.shellTarget as AppMode));
for (const button of overlayButtons) button.addEventListener("click", () => chooseOverlayAction(button.dataset.overlayAction as "resume" | "exit"));
required<HTMLButtonElement>("#manual-pause-button").addEventListener("click", () => showOverlay("manual"));
required<HTMLButtonElement>("#tracking-loss-button").addEventListener("click", () => {
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

window.addEventListener("beforeunload", () => {
  gamepads.stop();
  void tracker.close();
});
document.addEventListener("keydown", (event) => {
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
  if (!launcher.visible && event.key === "ArrowLeft") obstacle.handleAction("dodge_left");
  if (!launcher.visible && event.key === "ArrowRight") obstacle.handleAction("dodge_right");
  if (!launcher.visible && event.key === "ArrowDown") obstacle.handleAction("duck");
  if (!launcher.visible && event.key === " " && currentMode === "obstacle") {
    event.preventDefault();
    obstacle.handleAction("jump");
  }
  if (event.key === "Enter" && overlayKind) chooseOverlayAction(overlayFocus);
});

paintClock();
setInterval(paintClock, 15_000);
requestAnimationFrame(replayLoop);
