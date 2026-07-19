import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { MotionFrame } from "@vcg/motion-contract";
import { mediapipeResultToMotionFrame } from "./mediapipe-adapter";

export type TrackerStatus = "idle" | "loading" | "requesting-camera" | "running" | "stopped" | "fault";

interface TrackerCallbacks {
  onFrame: (frame: MotionFrame) => void;
  onStatus: (status: TrackerStatus, detail: string) => void;
}

export class MediaPipeTracker {
  readonly #video = document.createElement("video");
  #landmarker: PoseLandmarker | undefined;
  #stream: MediaStream | undefined;
  #running = false;
  #sequence = 0;
  #lastMediaTime = -1;
  #delegate = "uninitialized";

  constructor(private readonly callbacks: TrackerCallbacks) {
    this.#video.muted = true;
    this.#video.playsInline = true;
    this.#video.setAttribute("aria-hidden", "true");
  }

  get delegate(): string {
    return this.#delegate;
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.callbacks.onStatus("loading", "Loading the local pose model");
    this.#landmarker ??= await this.#createLandmarker();

    this.callbacks.onStatus("requesting-camera", "Waiting for camera permission");
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // Prefer the product target, but do not reject otherwise useful cameras.
        // Qualification uses measured frame rate rather than a hard constraint.
        frameRate: { ideal: 60 },
        facingMode: "user",
      },
    });
    this.#video.srcObject = this.#stream;
    await this.#video.play();
    this.#running = true;
    this.#lastMediaTime = -1;
    this.callbacks.onStatus("running", "Camera frames stay local and are not displayed or recorded");
    this.#scheduleFrame();
  }

  stop(): void {
    this.#running = false;
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = undefined;
    this.#video.srcObject = null;
    this.callbacks.onStatus("stopped", "Camera stopped");
  }

  async close(): Promise<void> {
    this.stop();
    this.#landmarker?.close();
    this.#landmarker = undefined;
  }

  async #createLandmarker(): Promise<PoseLandmarker> {
    const vision = await FilesetResolver.forVisionTasks("/wasm");
    const options = {
      baseOptions: {
        modelAssetPath: "/models/pose_landmarker_lite.task",
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    };

    try {
      const landmarker = await PoseLandmarker.createFromOptions(vision, options);
      this.#delegate = "WebGL GPU";
      return landmarker;
    } catch (gpuError) {
      this.callbacks.onStatus("loading", `GPU initialization failed; using WASM CPU (${String(gpuError)})`);
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: options.baseOptions.modelAssetPath, delegate: "CPU" },
      });
      this.#delegate = "WASM CPU";
      return landmarker;
    }
  }

  #scheduleFrame(): void {
    if (!this.#running) return;
    if ("requestVideoFrameCallback" in this.#video) {
      this.#video.requestVideoFrameCallback(() => this.#processFrame());
    } else {
      requestAnimationFrame(() => this.#processFrame());
    }
  }

  #processFrame(): void {
    if (!this.#running || !this.#landmarker) return;
    try {
      if (this.#video.currentTime !== this.#lastMediaTime) {
        this.#lastMediaTime = this.#video.currentTime;
        const sourceTimestampMs = performance.now();
        const inferenceStartedAtMs = performance.now();
        const result: PoseLandmarkerResult = this.#landmarker.detectForVideo(this.#video, inferenceStartedAtMs);
        const inferenceCompletedAtMs = performance.now();
        const publishedAtMs = performance.now();
        const frame = mediapipeResultToMotionFrame(result, {
          sequence: this.#sequence++,
          sourceTimestampMs,
          inferenceStartedAtMs,
          inferenceCompletedAtMs,
          publishedAtMs,
        });
        this.callbacks.onFrame(frame);
      }
      this.#scheduleFrame();
    } catch (error) {
      this.#running = false;
      this.callbacks.onStatus("fault", error instanceof Error ? error.message : String(error));
    }
  }
}
