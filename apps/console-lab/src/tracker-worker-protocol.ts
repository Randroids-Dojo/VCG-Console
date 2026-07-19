import type { MotionFrame } from "@vcg/motion-contract";

export type TrackerWorkerRequest =
  | { type: "initialize"; wasmRoot: string; modelAssetPath: string }
  | { type: "frame"; runId: number; sequence: number; sourceTimestampMs: number; image: ImageBitmap };

export type TrackerWorkerResponse =
  | { type: "ready"; delegate: "WebGL GPU" | "WASM CPU" }
  | { type: "frame"; runId: number; frame: MotionFrame }
  | { type: "fault"; stage: "initialization"; message: string }
  | { type: "fault"; stage: "inference"; runId: number; message: string };
