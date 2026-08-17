import type { MotionAction } from "@vcg/motion-contract";
import type { PlayerSlot } from "./player-session";
import {
  TwoPlayerObstacleRound,
  type ObstacleRoundSnapshot,
  type PlayerObstacle,
} from "./two-player-obstacle-round";

export class ObstacleGame {
  readonly #context: CanvasRenderingContext2D;
  readonly #round: TwoPlayerObstacleRound;
  #lastAt = 0;
  #lastPausedDrawKey: string | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (snapshot: ObstacleRoundSnapshot) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.#context = context;
    this.#round = new TwoPlayerObstacleRound(roundOptionsFromSearch(window.location.search));
  }

  start(): void {
    this.#lastAt = performance.now();
    this.onState(this.#round.snapshot());
    requestAnimationFrame((now) => this.#loop(now));
  }

  snapshot(): ObstacleRoundSnapshot {
    return this.#round.snapshot();
  }

  setRoster(slots: readonly PlayerSlot[]): void {
    this.#round.setRoster(slots);
    this.onState(this.#round.snapshot());
  }

  setPaused(paused: boolean): void {
    this.#round.setPaused(paused);
    this.#lastAt = performance.now();
    this.onState(this.#round.snapshot());
  }

  handleAction(action: MotionAction["name"], slot: PlayerSlot): void {
    this.#round.handleAction(action, slot);
    this.onState(this.#round.snapshot());
  }

  reset(): void {
    this.#round.reset();
    this.#lastAt = performance.now();
    this.onState(this.#round.snapshot());
  }

  #loop(now: number): void {
    const delta = Math.min(100, Math.max(0, now - this.#lastAt));
    this.#lastAt = now;
    this.#round.update(delta);
    const snapshot = this.#round.snapshot();
    this.onState(snapshot);
    const pausedDrawKey = snapshot.phase === "paused"
      ? `${this.canvas.clientWidth}x${this.canvas.clientHeight}@${devicePixelRatio}:${JSON.stringify(snapshot)}`
      : undefined;
    if (pausedDrawKey === undefined || pausedDrawKey !== this.#lastPausedDrawKey) {
      this.#draw(snapshot);
    }
    this.#lastPausedDrawKey = pausedDrawKey;
    requestAnimationFrame((next) => this.#loop(next));
  }

  #draw(snapshot: ObstacleRoundSnapshot): void {
    this.#resize();
    const { width, height } = this.canvas;
    const context = this.#context;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101315";
    context.fillRect(0, 0, width, height);

    const arenaGap = width * 0.025;
    const arenaWidth = (width - arenaGap) / 2;
    for (const slot of [1, 2] as const) {
      const arenaX = slot === 1 ? 0 : arenaWidth + arenaGap;
      this.#drawArena(snapshot, slot, arenaX, arenaWidth, height);
    }

    if (snapshot.phase === "waiting-for-players" || snapshot.phase === "countdown") {
      context.fillStyle = "rgba(9,11,12,0.72)";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#efeee6";
      context.font = `${Math.max(22, width * 0.035)}px OCRA, monospace`;
      context.textAlign = "center";
      context.fillText(
        snapshot.phase === "waiting-for-players"
          ? "JOIN PLAYER 1"
          : String(Math.max(1, Math.ceil(snapshot.countdownRemainingMs / 1_000))),
        width / 2,
        height / 2,
      );
    } else if (snapshot.phase === "paused") {
      context.fillStyle = "rgba(9,11,12,0.74)";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#efeee6";
      context.font = `${Math.max(20, width * 0.035)}px OCRA, monospace`;
      context.textAlign = "center";
      context.fillText("PAUSED", width / 2, height / 2);
    }
  }

  #drawArena(
    snapshot: ObstacleRoundSnapshot,
    slot: PlayerSlot,
    x: number,
    width: number,
    height: number,
  ): void {
    const context = this.#context;
    const laneWidth = width / 3;
    context.fillStyle = slot === 1 ? "rgba(83,218,195,0.025)" : "rgba(255,191,71,0.025)";
    context.fillRect(x, 0, width, height);
    context.strokeStyle = slot === 1 ? "rgba(83,218,195,0.3)" : "rgba(255,191,71,0.3)";
    context.lineWidth = Math.max(1, width * 0.002);
    context.strokeRect(x + 1, 1, width - 2, height - 2);
    context.setLineDash([8, 12]);
    context.strokeStyle = "rgba(239,238,230,0.12)";
    for (let lane = 1; lane < 3; lane += 1) {
      context.beginPath();
      context.moveTo(x + lane * laneWidth, 0);
      context.lineTo(x + lane * laneWidth, height);
      context.stroke();
    }
    context.setLineDash([]);

    context.fillStyle = slot === 1 ? "#53dac3" : "#ffbf47";
    context.font = `${Math.max(12, width * 0.028)}px OCRA, monospace`;
    context.textAlign = "left";
    context.fillText(`P${slot}`, x + width * 0.035, height * 0.09);

    for (const obstacle of snapshot.obstacles.filter((candidate) => candidate.slot === slot)) {
      this.#drawObstacle(obstacle, x, laneWidth, width, height);
    }

    const player = snapshot.players.find((candidate) => candidate.slot === slot);
    if (!player) return;
    const playerX = x + player.lane * laneWidth + laneWidth / 2;
    const playerY = height * 0.86 - (player.stance === "jumping" ? height * 0.12 : 0);
    const playerHeight = player.stance === "ducking" ? height * 0.07 : height * 0.13;
    context.fillStyle = player.lives === 0
      ? "rgba(119,128,132,0.45)"
      : slot === 1 ? "#53dac3" : "#ffbf47";
    context.fillRect(playerX - laneWidth * 0.08, playerY - playerHeight, laneWidth * 0.16, playerHeight);
    context.strokeStyle = slot === 1 ? "rgba(83,218,195,0.35)" : "rgba(255,191,71,0.35)";
    context.lineWidth = Math.max(1, width * 0.002);
    context.strokeRect(playerX - laneWidth * 0.12, height * 0.7, laneWidth * 0.24, height * 0.18);
  }

  #drawObstacle(
    obstacle: PlayerObstacle,
    arenaX: number,
    laneWidth: number,
    arenaWidth: number,
    height: number,
  ): void {
    const context = this.#context;
    const x = arenaX + obstacle.lane * laneWidth + laneWidth * 0.18;
    const y = (-0.08 + obstacle.progress * 0.88) * height;
    const obstacleWidth = laneWidth * 0.64;
    context.strokeStyle = obstacle.resolved ? "rgba(119,128,132,0.3)" : "#ff765f";
    context.lineWidth = Math.max(2, arenaWidth * 0.004);
    context.strokeRect(x, y, obstacleWidth, height * 0.08);
    context.fillStyle = obstacle.resolved ? "rgba(119,128,132,0.3)" : "#ff765f";
    context.font = `${Math.max(10, arenaWidth * 0.024)}px OCRA, monospace`;
    context.textAlign = "center";
    context.fillText(obstacle.kind.toUpperCase(), x + obstacleWidth / 2, y + height * 0.052);
  }

  #resize(): void {
    const ratio = Math.min(devicePixelRatio, 2);
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}

export function fastObstacleTestEnabled(search: string): boolean {
  return new URLSearchParams(search).get("obstacleTest") === "fast";
}

function roundOptionsFromSearch(search: string): ConstructorParameters<typeof TwoPlayerObstacleRound>[0] {
  if (!fastObstacleTestEnabled(search)) return {};
  return {
    countdownMs: 300,
    roundMs: 3_000,
    spawnIntervalMs: 500,
    obstacleTravelMs: 700,
    startingLives: 10,
  };
}
