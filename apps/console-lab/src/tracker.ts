import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type {
  MotionFrame,
  TrackerHealthEvent,
  TrackerHealthReason,
  TrackerHealthStatus,
} from "@vcg/motion-contract";
import {
  captureConstraints,
  captureModeLabel,
  describeCaptureMode,
  type CaptureProfile,
  type ObservedCaptureMode,
} from "./capture-profile";
import { FrameGate } from "./frame-gate";
import { MAX_TRACKED_POSES, MediaPipeFrameAdapter } from "./mediapipe-adapter";
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

/**
 * Reads the mode the camera actually granted. `getSettings` is optional in
 * practice, so an absent or partial result is reported as unknown rather than
 * assumed to match the request.
 */
function readObservedCaptureMode(stream: MediaStream): ObservedCaptureMode | undefined {
  const [track] = stream.getVideoTracks();
  return typeof track?.getSettings === "function" ? track.getSettings() : undefined;
}

export class MediaPipeTracker {
  readonly #video = document.createElement("video");
  readonly #frameGate = new FrameGate();
  #frameAdapter = new MediaPipeFrameAdapter();
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
  #startup: { controller: AbortController; promise: Promise<boolean> } | undefined;

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

  /** Starts one camera session; false means Stop or Close cancelled this attempt. */
  start(captureProfile: CaptureProfile): Promise<boolean> {
    if (this.#running) return Promise.resolve(true);
    if (this.#startup) return this.#startup.promise;
    const controller = new AbortController();
    const runId = ++this.#runId;
    const promise = Promise.resolve()
      .then(() => this.#start(captureProfile, runId, controller.signal))
      .finally(() => {
        if (this.#startup?.controller === controller) this.#startup = undefined;
      });
    this.#startup = { controller, promise };
    return promise;
  }

  async #start(captureProfile: CaptureProfile, runId: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return false;
    this.#emitHealth(this.#attemptedStart ? "restarting" : "initializing");
    this.#attemptedStart = true;
    this.callbacks.onStatus("loading", "Loading the local pose model outside the console UI thread");
    let failureReason: TrackerHealthReason = "backend-fault";
    let stream: MediaStream | undefined;
    try {
      await this.#ensureBackend(signal);
      if (signal.aborted) return false;

      this.callbacks.onStatus(
        "requesting-camera",
        `Waiting for camera permission. ${captureModeLabel(captureProfile)} requested.`,
      );
      failureReason = "camera-unavailable";
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // Ideal-only: prefer the selected mode, but do not reject otherwise
        // usable cameras. Qualification uses the observed mode below.
        video: captureConstraints(captureProfile),
      });
      if (signal.aborted) {
        for (const track of stream.getTracks()) track.stop();
        return false;
      }
      this.#stream = stream;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", () => {
          if (this.#runId === runId) this.#handleCameraEnded();
        }, { once: true });
      }
      const observedCaptureMode = readObservedCaptureMode(stream);
      this.#video.srcObject = stream;
      failureReason = "backend-fault";
      await this.#video.play();
      if (signal.aborted) return false;
      this.#running = true;
      this.#frameAdapter = new MediaPipeFrameAdapter();
      this.#lastMediaTime = -1;
      this.#frameGate.reset();
      const isolation = this.#backend === "worker"
        ? "Pose inference is isolated from the console UI thread."
        : `Worker initialization failed; inference is using the main-thread fallback. ${this.#backendFallbackReason ?? "No worker error was reported."}`;
      this.#emitHealth(this.#backend === "worker" ? "healthy" : "fallback-backend");
      this.callbacks.onStatus(
        "running",
        `Camera frames stay local and are not displayed or recorded. ${isolation} ${describeCaptureMode(captureProfile, observedCaptureMode)}`,
      );
      this.#scheduleFrame();
      return true;
    } catch (error) {
      // A rejected old permission/playback promise must not reset a newer run.
      if (signal.aborted) return false;
      if (stream && this.#stream === stream) this.#releaseStream();
      this.#emitHealth(failureReason);
      throw error;
    }
  }

  stop(): void {
    this.#running = false;
    this.#runId += 1;
    const startup = this.#startup;
    this.#startup = undefined;
    startup?.controller.abort();
    if (startup && !this.#backend) this.#discardWorkerBackend();
    this.#frameGate.reset();
    this.#releaseStream();
    this.callbacks.onStatus("stopped", "Camera stopped");
  }

  #releaseStream(): void {
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = undefined;
    this.#video.srcObject = null;
  }

  async close(): Promise<void> {
    this.stop();
    this.#discardWorkerBackend();
    this.#landmarker?.close();
    this.#landmarker = undefined;
    this.#backend = undefined;
  }

  async #ensureBackend(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.#backend) return;
    try {
      const delegate = await this.#createWorkerBackend(signal);
      if (signal.aborted) return;
      this.#backend = "worker";
      this.#delegate = `worker / ${delegate}`;
    } catch (workerError) {
      if (signal.aborted) return;
      this.#backendFallbackReason = workerError instanceof Error ? workerError.message : String(workerError);
      this.#discardWorkerBackend();
      this.callbacks.onStatus("loading", `Worker initialization failed; preparing the main-thread fallback (${String(workerError)})`);
      const { landmarker, delegate } = await this.#createMainThreadLandmarker(signal);
      if (signal.aborted) {
        landmarker.close();
        return;
      }
      this.#landmarker = landmarker;
      this.#delegate = delegate;
      this.#backend = "main-thread";
    }
  }

  #createWorkerBackend(signal: AbortSignal): Promise<string> {
    const worker = new Worker(new URL("./tracker-worker.ts", import.meta.url), { type: "module", name: "vcg-pose-tracker" });
    this.#worker = worker;
    worker.addEventListener("message", this.#handleWorkerMessage);
    worker.addEventListener("error", this.#handleWorkerRuntimeError);

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", handleReady);
        worker.removeEventListener("error", handleError);
        signal.removeEventListener("abort", handleAbort);
      };
      const handleReady = (event: MessageEvent<TrackerWorkerResponse>) => {
        if (event.data.type !== "ready" && event.data.type !== "fault") return;
        cleanup();
        if (event.data.type === "ready") resolve(event.data.delegate);
        else reject(new Error(`${event.data.stage}: ${event.data.message}`));
      };
      const handleError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || "worker failed to load"));
      };
      const handleAbort = () => {
        cleanup();
        reject(signal.reason);
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("worker initialization timed out after 20 seconds"));
      }, 20_000);
      worker.addEventListener("message", handleReady);
      worker.addEventListener("error", handleError, { once: true });
      signal.addEventListener("abort", handleAbort, { once: true });
      try {
        worker.postMessage({
          type: "initialize",
          wasmRoot: new URL("/wasm", window.location.origin).href,
          modelAssetPath: new URL("/models/pose_landmarker_lite.task", window.location.origin).href,
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
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
      this.#discardWorkerBackend();
      this.#failRunningTracker(`Worker inference failed: ${event.data.message}`);
    }
  };

  readonly #handleWorkerRuntimeError = (event: ErrorEvent): void => {
    if (!this.#running || event.currentTarget !== this.#worker) return;
    event.preventDefault();
    this.#frameGate.release();
    this.#discardWorkerBackend();
    this.#failRunningTracker(`Worker runtime failed: ${event.message || "unknown worker error"}`);
  };

  readonly #handleCameraEnded = (): void => {
    if (!this.#running) return;
    this.#frameGate.release();
    this.#failRunningTracker("Camera stream ended unexpectedly", "camera-disconnected");
  };

  async #createMainThreadLandmarker(signal: AbortSignal): Promise<{ landmarker: PoseLandmarker; delegate: string }> {
    const vision = await FilesetResolver.forVisionTasks("/wasm");
    signal.throwIfAborted();
    const options = {
      baseOptions: {
        modelAssetPath: "/models/pose_landmarker_lite.task",
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numPoses: MAX_TRACKED_POSES,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    };

    try {
      const landmarker = await PoseLandmarker.createFromOptions(vision, options);
      return { landmarker, delegate: "main / WebGL GPU" };
    } catch (gpuError) {
      signal.throwIfAborted();
      this.callbacks.onStatus("loading", `Main-thread GPU initialization failed; using WASM CPU (${String(gpuError)})`);
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: options.baseOptions.modelAssetPath, delegate: "CPU" },
      });
      return { landmarker, delegate: "main / WASM CPU" };
    }
  }

  #scheduleFrame(): void {
    if (!this.#running) return;
    const runId = this.#runId;
    const processFrame = () => {
      if (this.#runId === runId) void this.#processFrame();
    };
    if ("requestVideoFrameCallback" in this.#video) {
      this.#video.requestVideoFrameCallback(processFrame);
    } else {
      requestAnimationFrame(processFrame);
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
      const worker = this.#worker;
      const runId = this.#runId;
      if (!worker) {
        this.#frameGate.release();
        this.#discardWorkerBackend();
        this.#failRunningTracker("Worker tracker backend is unavailable");
        return;
      }
      try {
        const sourceTimestampMs = monotonicTimestampMs();
        const image = await createImageBitmap(this.#video);
        if (!this.#running || this.#worker !== worker || this.#runId !== runId) {
          image.close();
          return;
        }
        worker.postMessage(
          { type: "frame", runId, sequence: this.#sequence++, sourceTimestampMs, image },
          [image],
        );
      } catch (error) {
        if (!this.#running || this.#worker !== worker || this.#runId !== runId) return;
        this.#frameGate.release();
        this.#discardWorkerBackend();
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
        ...this.#frameAdapter.convert(result, {
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
    this.#runId += 1;
    this.#frameGate.reset();
    this.#releaseStream();
    this.#emitHealth(reason);
    this.callbacks.onStatus("fault", detail);
  }

  #emitHealth(reason: TrackerHealthReason): void {
    const event = trackerHealthFixture(reason, this.#healthSequence++, monotonicTimestampMs(), "mediapipe-web");
    this.#healthStatus = event.status;
    this.callbacks.onHealth(event);
  }

  #discardWorkerBackend(): void {
    const worker = this.#worker;
    if (worker) {
      worker.removeEventListener("message", this.#handleWorkerMessage);
      worker.removeEventListener("error", this.#handleWorkerRuntimeError);
      worker.terminate();
      this.#worker = undefined;
    }
    if (this.#backend === "worker") {
      this.#backend = undefined;
      this.#delegate = "uninitialized";
    }
  }
}
