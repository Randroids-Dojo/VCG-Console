import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type {
  MotionFrame,
  TrackerHealthEvent,
  TrackerHealthReason,
  TrackerHealthStatus,
} from "@vcg/motion-contract";
import { FrameGate } from "./frame-gate";
import { mediapipeResultToMotionFrame } from "./mediapipe-adapter";
import { trackerHealthFixture } from "./tracker-health";
import type { TrackerWorkerResponse } from "./tracker-worker-protocol";

export type TrackerStatus = "idle" | "loading" | "requesting-camera" | "running" | "stopped" | "fault";

interface TrackerCallbacks {
  onFrame: (frame: MotionFrame) => void;
  onHealth: (event: TrackerHealthEvent) => void;
  onStatus: (status: TrackerStatus, detail: string) => void;
}

function monotonicTimestampMs(): number {
  return performance.timeOrigin + performance.now();
}

export class MediaPipeTracker {
  readonly #video = document.createElement("video");
  readonly #frameGate = new FrameGate();
  #landmarker: PoseLandmarker | undefined;
  #worker: Worker | undefined;
  #stream: MediaStream | undefined;
  #running = false;
  #sequence = 0;
  #lastMediaTime = -1;
  #delegate = "uninitialized";
  #backend: "worker" | "main-thread" | undefined;
  #backendFallbackReason: string | undefined;
  #runId = 0;
  #healthSequence = 0;
  #healthStatus: TrackerHealthStatus = "starting";
  #attemptedStart = false;

  constructor(private readonly callbacks: TrackerCallbacks) {
    this.#video.muted = true;
    this.#video.playsInline = true;
    this.#video.setAttribute("aria-hidden", "true");
  }

  get delegate(): string {
    return this.#delegate;
  }

  get droppedFrames(): number {
    return this.#frameGate.droppedFrames;
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#emitHealth(this.#attemptedStart ? "restarting" : "initializing");
    this.#attemptedStart = true;
    this.callbacks.onStatus("loading", "Loading the local pose model outside the console UI thread");
    try {
      await this.#ensureBackend();
    } catch (error) {
      this.#emitHealth("backend-fault");
      throw error;
    }

    this.callbacks.onStatus("requesting-camera", "Waiting for camera permission");
    try {
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
    } catch (error) {
      this.#emitHealth("camera-unavailable");
      throw error;
    }
    for (const track of this.#stream.getVideoTracks()) {
      track.addEventListener("ended", this.#handleCameraEnded, { once: true });
    }
    this.#video.srcObject = this.#stream;
    try {
      await this.#video.play();
    } catch (error) {
      for (const track of this.#stream.getTracks()) track.stop();
      this.#stream = undefined;
      this.#video.srcObject = null;
      this.#emitHealth("backend-fault");
      throw error;
    }
    this.#running = true;
    this.#runId += 1;
    this.#lastMediaTime = -1;
    this.#frameGate.reset();
    const isolation = this.#backend === "worker"
      ? "Pose inference is isolated from the console UI thread."
      : `Worker initialization failed; inference is using the main-thread fallback. ${this.#backendFallbackReason ?? "No worker error was reported."}`;
    this.#emitHealth(this.#backend === "worker" ? "healthy" : "fallback-backend");
    this.callbacks.onStatus("running", `Camera frames stay local and are not displayed or recorded. ${isolation}`);
    this.#scheduleFrame();
  }

  stop(): void {
    this.#running = false;
    this.#runId += 1;
    this.#frameGate.reset();
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = undefined;
    this.#video.srcObject = null;
    this.callbacks.onStatus("stopped", "Camera stopped");
  }

  async close(): Promise<void> {
    this.stop();
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#landmarker?.close();
    this.#landmarker = undefined;
    this.#backend = undefined;
  }

  async #ensureBackend(): Promise<void> {
    if (this.#backend) return;
    try {
      const delegate = await this.#createWorkerBackend();
      this.#backend = "worker";
      this.#delegate = `worker / ${delegate}`;
    } catch (workerError) {
      this.#backendFallbackReason = workerError instanceof Error ? workerError.message : String(workerError);
      this.#worker?.terminate();
      this.#worker = undefined;
      this.callbacks.onStatus("loading", `Worker initialization failed; preparing the main-thread fallback (${String(workerError)})`);
      this.#landmarker = await this.#createMainThreadLandmarker();
      this.#backend = "main-thread";
    }
  }

  #createWorkerBackend(): Promise<string> {
    const worker = new Worker(new URL("./tracker-worker.ts", import.meta.url), { type: "module", name: "vcg-pose-tracker" });
    this.#worker = worker;
    worker.addEventListener("message", this.#handleWorkerMessage);
    worker.addEventListener("error", this.#handleWorkerRuntimeError);

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("worker initialization timed out after 20 seconds")), 20_000);
      const handleReady = (event: MessageEvent<TrackerWorkerResponse>) => {
        if (event.data.type !== "ready" && event.data.type !== "fault") return;
        window.clearTimeout(timeout);
        worker.removeEventListener("message", handleReady);
        worker.removeEventListener("error", handleError);
        if (event.data.type === "ready") resolve(event.data.delegate);
        else reject(new Error(`${event.data.stage}: ${event.data.message}`));
      };
      const handleError = (event: ErrorEvent) => {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", handleReady);
        reject(new Error(event.message || "worker failed to load"));
      };
      worker.addEventListener("message", handleReady);
      worker.addEventListener("error", handleError, { once: true });
      worker.postMessage({
        type: "initialize",
        wasmRoot: new URL("/wasm", window.location.origin).href,
        modelAssetPath: new URL("/models/pose_landmarker_lite.task", window.location.origin).href,
      });
    });
  }

  readonly #handleWorkerMessage = (event: MessageEvent<TrackerWorkerResponse>): void => {
    if (event.data.type === "frame") {
      if (!this.#running || event.data.runId !== this.#runId) return;
      this.#frameGate.release();
      this.callbacks.onFrame({
        ...event.data.frame,
        publishedAtMs: monotonicTimestampMs(),
        health: this.#healthStatus,
      });
      return;
    }
    if (event.data.type === "fault" && event.data.stage === "inference") {
      if (!this.#running || event.data.runId !== this.#runId) return;
      this.#frameGate.release();
      this.#failRunningTracker(`Worker inference failed: ${event.data.message}`);
    }
  };

  readonly #handleWorkerRuntimeError = (event: ErrorEvent): void => {
    if (!this.#running) return;
    this.#frameGate.release();
    this.#failRunningTracker(`Worker runtime failed: ${event.message || "unknown worker error"}`);
  };

  readonly #handleCameraEnded = (): void => {
    if (!this.#running) return;
    this.#frameGate.release();
    this.#failRunningTracker("Camera stream ended unexpectedly", "camera-disconnected");
  };

  async #createMainThreadLandmarker(): Promise<PoseLandmarker> {
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
      this.#delegate = "main / WebGL GPU";
      return landmarker;
    } catch (gpuError) {
      this.callbacks.onStatus("loading", `Main-thread GPU initialization failed; using WASM CPU (${String(gpuError)})`);
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: options.baseOptions.modelAssetPath, delegate: "CPU" },
      });
      this.#delegate = "main / WASM CPU";
      return landmarker;
    }
  }

  #scheduleFrame(): void {
    if (!this.#running) return;
    if ("requestVideoFrameCallback" in this.#video) {
      this.#video.requestVideoFrameCallback(() => void this.#processFrame());
    } else {
      requestAnimationFrame(() => void this.#processFrame());
    }
  }

  async #processFrame(): Promise<void> {
    if (!this.#running) return;
    if (this.#video.currentTime === this.#lastMediaTime) {
      this.#scheduleFrame();
      return;
    }
    this.#lastMediaTime = this.#video.currentTime;

    if (this.#backend === "worker") {
      if (!this.#frameGate.tryAcquire()) {
        this.#scheduleFrame();
        return;
      }
      try {
        const sourceTimestampMs = monotonicTimestampMs();
        const image = await createImageBitmap(this.#video);
        if (!this.#running || !this.#worker) {
          image.close();
          this.#frameGate.release();
          return;
        }
        this.#worker.postMessage(
          { type: "frame", runId: this.#runId, sequence: this.#sequence++, sourceTimestampMs, image },
          [image],
        );
      } catch (error) {
        this.#frameGate.release();
        this.#failRunningTracker(`Could not transfer a camera frame to the worker: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      this.#scheduleFrame();
      return;
    }

    if (!this.#landmarker) {
      this.#failRunningTracker("Main-thread tracker backend is unavailable");
      return;
    }
    try {
      const sourceTimestampMs = monotonicTimestampMs();
      const inferenceStartedAtMs = monotonicTimestampMs();
      const result: PoseLandmarkerResult = this.#landmarker.detectForVideo(this.#video, inferenceStartedAtMs);
      const inferenceCompletedAtMs = monotonicTimestampMs();
      const publishedAtMs = monotonicTimestampMs();
      this.callbacks.onFrame({
        ...mediapipeResultToMotionFrame(result, {
          sequence: this.#sequence++,
          sourceTimestampMs,
          inferenceStartedAtMs,
          inferenceCompletedAtMs,
          publishedAtMs,
        }),
        health: this.#healthStatus,
      });
      this.#scheduleFrame();
    } catch (error) {
      this.#failRunningTracker(error instanceof Error ? error.message : String(error));
    }
  }

  #failRunningTracker(detail: string, reason: "camera-disconnected" | "backend-fault" = "backend-fault"): void {
    this.#running = false;
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = undefined;
    this.#video.srcObject = null;
    this.#emitHealth(reason);
    this.callbacks.onStatus("fault", detail);
  }

  #emitHealth(reason: TrackerHealthReason): void {
    const event = trackerHealthFixture(reason, this.#healthSequence++, monotonicTimestampMs(), "mediapipe-web");
    this.#healthStatus = event.status;
    this.callbacks.onHealth(event);
  }
}
