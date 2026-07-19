import { CORE_CONNECTIONS, type CoreLandmarkName, type MotionFrame } from "@vcg/motion-contract";

const ACCENT = "#53dac3";
const OFF_WHITE = "#efeee6";
const MUTED = "#778084";

export class SkeletonRenderer {
  readonly #context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.#context = context;
  }

  render(frame: MotionFrame | undefined): void {
    this.#resize();
    const { width, height } = this.canvas;
    const context = this.#context;
    context.clearRect(0, 0, width, height);
    this.#drawZone(width, height);

    const player = frame?.players[0];
    if (!player) {
      context.fillStyle = MUTED;
      context.font = `${Math.max(18, width * 0.018)}px OCRA, ui-monospace, monospace`;
      context.textAlign = "center";
      context.fillText("STEP INTO THE FRAME", width / 2, height / 2);
      return;
    }

    const points = new Map(player.coreLandmarks.map((landmark) => [landmark.name, landmark]));
    const mapPoint = (name: CoreLandmarkName) => {
      const landmark = points.get(name);
      if (!landmark) return undefined;
      return {
        x: (1 - landmark.position.x) * width,
        y: landmark.position.y * height,
        observed: landmark.observed,
      };
    };

    context.lineCap = "round";
    context.lineJoin = "round";
    for (const [fromName, toName] of CORE_CONNECTIONS) {
      const from = mapPoint(fromName);
      const to = mapPoint(toName);
      if (!from || !to) continue;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle = from.observed && to.observed ? OFF_WHITE : MUTED;
      context.globalAlpha = from.observed && to.observed ? 0.9 : 0.3;
      context.lineWidth = Math.max(3, width * 0.004);
      context.stroke();
    }

    for (const landmark of player.coreLandmarks) {
      const point = mapPoint(landmark.name);
      if (!point) continue;
      context.beginPath();
      context.arc(point.x, point.y, Math.max(4, width * 0.006), 0, Math.PI * 2);
      context.fillStyle = point.observed ? ACCENT : MUTED;
      context.globalAlpha = point.observed ? 1 : 0.35;
      context.fill();
    }
    context.globalAlpha = 1;
    this.#drawCenterReticle(width, height);
  }

  #drawZone(width: number, height: number): void {
    const context = this.#context;
    context.save();
    context.strokeStyle = "rgba(239, 238, 230, 0.13)";
    context.lineWidth = 1;
    context.setLineDash([8, 12]);
    context.strokeRect(width * 0.12, height * 0.08, width * 0.76, height * 0.86);
    context.restore();
  }

  #drawCenterReticle(width: number, height: number): void {
    const context = this.#context;
    const x = width / 2;
    const y = height / 2;
    const radius = Math.min(width, height) * 0.08;
    context.save();
    context.strokeStyle = "rgba(83, 218, 195, 0.2)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.moveTo(x - radius * 1.4, y);
    context.lineTo(x + radius * 1.4, y);
    context.moveTo(x, y - radius * 1.4);
    context.lineTo(x, y + radius * 1.4);
    context.stroke();
    context.restore();
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
