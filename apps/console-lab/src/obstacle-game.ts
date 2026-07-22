import type { MotionAction } from "@vcg/motion-contract";

type Stance = "standing" | "jumping" | "ducking";
type ObstacleKind = "lane" | "jump" | "duck";

interface Obstacle {
  id: number;
  kind: ObstacleKind;
  lane: number;
  y: number;
  resolved: boolean;
}

export class ObstacleGame {
  readonly #context: CanvasRenderingContext2D;
  readonly #obstacles: Obstacle[] = [];
  #lane = 1;
  #stance: Stance = "standing";
  #stanceUntil = 0;
  #lastAt = 0;
  #lastSpawnAt = 0;
  #spawnSequence = 0;
  #paused = false;
  #score = 0;
  #lives = 3;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (score: number, lives: number, status: string) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.#context = context;
  }

  start(): void {
    this.#lastAt = performance.now();
    requestAnimationFrame((now) => this.#loop(now));
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    this.#lastAt = performance.now();
  }

  handleAction(action: MotionAction["name"]): void {
    const now = performance.now();
    if (action === "dodge_left") this.#lane = Math.max(0, this.#lane - 1);
    if (action === "dodge_right") this.#lane = Math.min(2, this.#lane + 1);
    if (action === "jump") {
      this.#stance = "jumping";
      this.#stanceUntil = now + 650;
    }
    if (action === "duck") {
      this.#stance = "ducking";
      this.#stanceUntil = now + 800;
    }
    this.onState(this.#score, this.#lives, action.replaceAll("_", " ").toUpperCase());
  }

  reset(): void {
    this.#obstacles.length = 0;
    this.#lane = 1;
    this.#stance = "standing";
    this.#stanceUntil = 0;
    this.#paused = false;
    this.#lastAt = performance.now();
    this.#score = 0;
    this.#lives = 3;
    this.#spawnSequence = 0;
    this.#lastSpawnAt = 0;
    this.onState(this.#score, this.#lives, "READY");
  }

  #loop(now: number): void {
    const delta = Math.min(40, now - this.#lastAt);
    this.#lastAt = now;
    if (!this.#paused) this.#update(now, delta);
    this.#draw();
    requestAnimationFrame((next) => this.#loop(next));
  }

  #update(now: number, deltaMs: number): void {
    if (this.#stance !== "standing" && now >= this.#stanceUntil) this.#stance = "standing";
    if (now - this.#lastSpawnAt > 1_550) {
      this.#lastSpawnAt = now;
      const kinds: ObstacleKind[] = ["lane", "jump", "duck"];
      const kind = kinds[this.#spawnSequence % kinds.length] ?? "lane";
      this.#obstacles.push({
        id: this.#spawnSequence,
        kind,
        lane: kind === "lane" ? this.#spawnSequence % 3 : 1,
        y: -0.08,
        resolved: false,
      });
      this.#spawnSequence += 1;
    }

    for (const obstacle of this.#obstacles) {
      obstacle.y += deltaMs * 0.00034;
      if (!obstacle.resolved && obstacle.y >= 0.8) {
        obstacle.resolved = true;
        const avoided =
          (obstacle.kind === "lane" && this.#lane !== obstacle.lane) ||
          (obstacle.kind === "jump" && this.#stance === "jumping") ||
          (obstacle.kind === "duck" && this.#stance === "ducking");
        if (avoided) {
          this.#score += 100;
          this.onState(this.#score, this.#lives, "CLEAR");
        } else {
          this.#lives = Math.max(0, this.#lives - 1);
          this.onState(this.#score, this.#lives, this.#lives ? "HIT" : "RUN ENDED");
          if (this.#lives === 0) this.#paused = true;
        }
      }
    }
    while (this.#obstacles[0]?.y && this.#obstacles[0].y > 1.12) this.#obstacles.shift();
  }

  #draw(): void {
    this.#resize();
    const { width, height } = this.canvas;
    const context = this.#context;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101315";
    context.fillRect(0, 0, width, height);
    const laneWidth = width / 3;

    context.strokeStyle = "rgba(239,238,230,0.12)";
    context.lineWidth = 1;
    context.setLineDash([8, 12]);
    for (let lane = 1; lane < 3; lane += 1) {
      context.beginPath();
      context.moveTo(lane * laneWidth, 0);
      context.lineTo(lane * laneWidth, height);
      context.stroke();
    }
    context.setLineDash([]);

    for (const obstacle of this.#obstacles) {
      const x = obstacle.lane * laneWidth + laneWidth * 0.18;
      const y = obstacle.y * height;
      const obstacleWidth = laneWidth * 0.64;
      context.strokeStyle = obstacle.resolved ? "rgba(119,128,132,0.3)" : "#ff765f";
      context.lineWidth = Math.max(2, width * 0.002);
      context.strokeRect(x, y, obstacleWidth, height * 0.08);
      context.fillStyle = obstacle.resolved ? "rgba(119,128,132,0.3)" : "#ff765f";
      context.font = `${Math.max(12, width * 0.014)}px OCRA, monospace`;
      context.textAlign = "center";
      context.fillText(obstacle.kind.toUpperCase(), x + obstacleWidth / 2, y + height * 0.052);
    }

    const playerX = this.#lane * laneWidth + laneWidth / 2;
    const playerY = height * 0.84 - (this.#stance === "jumping" ? height * 0.12 : 0);
    const playerHeight = this.#stance === "ducking" ? height * 0.07 : height * 0.13;
    context.fillStyle = "#53dac3";
    context.fillRect(playerX - laneWidth * 0.08, playerY - playerHeight, laneWidth * 0.16, playerHeight);
    context.strokeStyle = "rgba(83,218,195,0.35)";
    context.strokeRect(playerX - laneWidth * 0.12, height * 0.68, laneWidth * 0.24, height * 0.18);

    if (this.#paused) {
      context.fillStyle = "rgba(9,11,12,0.74)";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#efeee6";
      context.font = `${Math.max(20, width * 0.035)}px OCRA, monospace`;
      context.textAlign = "center";
      context.fillText("PAUSED", width / 2, height / 2);
    }
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
