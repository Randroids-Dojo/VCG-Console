/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { mediapipeResultToMotionFrame } from "./mediapipe-adapter";
import { nextMediaPipeTimestampMs } from "./mediapipe-timestamp";
import type { TrackerWorkerRequest, TrackerWorkerResponse } from "./tracker-worker-protocol";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<TrackerWorkerRequest>) => void) | null;
  postMessage: (message: TrackerWorkerResponse) => void;
};

let landmarker: PoseLandmarker | undefined;
let lastMediaPipeTimestampMs: number | undefined;

function monotonicTimestampMs(): number {
  return performance.timeOrigin + performance.now();
}

function respond(message: TrackerWorkerResponse): void {
  workerScope.postMessage(message);
}

async function initialize(wasmRoot: string, modelAssetPath: string): Promise<void> {
  // Module workers must select MediaPipe's ES module WASM loader. The default
  // classic loader is imported into module scope and never exposes ModuleFactory.
  const vision = await FilesetResolver.forVisionTasks(wasmRoot, true);
  const options = {
    baseOptions: { modelAssetPath, delegate: "GPU" as const },
    runningMode: "VIDEO" as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  };
  try {
    landmarker = await PoseLandmarker.createFromOptions(vision, options);
    respond({ type: "ready", delegate: "WebGL GPU" });
  } catch {
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath, delegate: "CPU" },
    });
    respond({ type: "ready", delegate: "WASM CPU" });
  }
}

function infer(request: Extract<TrackerWorkerRequest, { type: "frame" }>): void {
  if (!landmarker) {
    request.image.close();
    respond({ type: "fault", stage: "inference", runId: request.runId, message: "pose model is not initialized" });
    return;
  }
  try {
    const inferenceStartedAtMs = monotonicTimestampMs();
    const mediaPipeTimestampMs = nextMediaPipeTimestampMs(performance.now(), lastMediaPipeTimestampMs);
    lastMediaPipeTimestampMs = mediaPipeTimestampMs;
    const result: PoseLandmarkerResult = landmarker.detectForVideo(request.image, mediaPipeTimestampMs);
    const inferenceCompletedAtMs = monotonicTimestampMs();
    respond({
      type: "frame",
      runId: request.runId,
      frame: mediapipeResultToMotionFrame(result, {
        sequence: request.sequence,
        sourceTimestampMs: request.sourceTimestampMs,
        inferenceStartedAtMs,
        inferenceCompletedAtMs,
        publishedAtMs: inferenceCompletedAtMs,
      }),
    });
  } catch (error) {
    respond({ type: "fault", stage: "inference", runId: request.runId, message: error instanceof Error ? error.message : String(error) });
  } finally {
    request.image.close();
  }
}

workerScope.onmessage = (event): void => {
  const request = event.data;
  if (request.type === "initialize") {
    void initialize(request.wasmRoot, request.modelAssetPath).catch((error: unknown) => {
      respond({ type: "fault", stage: "initialization", message: error instanceof Error ? error.message : String(error) });
    });
    return;
  }
  infer(request);
};
