import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CAPTURE_PROFILE } from "./capture-profile";
import { MediaPipeTracker } from "./tracker";

const vision = vi.hoisted(() => ({
  resolve: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vision.resolve },
  PoseLandmarker: { createFromOptions: vision.create },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function cameraStream() {
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    getSettings: () => ({ width: 640, height: 480, frameRate: 30 }),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { stream: stream as unknown as MediaStream, track };
}

let workerMode: "ready" | "pending" | "fault";
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  terminate = vi.fn();
  constructor() { super(); FakeWorker.instances.push(this); }
  postMessage() {
    if (workerMode === "pending") return;
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
      data: workerMode === "ready"
        ? { type: "ready", delegate: "WASM CPU" }
        : { type: "fault", stage: "initialization", message: "worker unavailable" },
    })));
  }
}

const video = {
  srcObject: null as MediaStream | null,
  currentTime: 0,
  setAttribute: vi.fn(),
  play: vi.fn<() => Promise<void>>(),
  requestVideoFrameCallback: vi.fn<(callback: () => void) => number>(),
};
const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const callbacks = { onFrame: vi.fn(), onHealth: vi.fn(), onStatus: vi.fn() };
let tracker: MediaPipeTracker;

beforeEach(() => {
  vi.resetAllMocks();
  workerMode = "ready";
  FakeWorker.instances = [];
  video.srcObject = null;
  video.play.mockResolvedValue();
  video.requestVideoFrameCallback.mockReturnValue(1);
  vision.resolve.mockResolvedValue({});
  vi.stubGlobal("document", { createElement: () => video });
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:4173" }, setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("Worker", FakeWorker);
  tracker = new MediaPipeTracker(callbacks);
});

afterEach(async () => {
  await tracker.close();
  vi.unstubAllGlobals();
});

describe("camera startup ownership", () => {
  it("closes a late permission stream after Stop without publishing Running", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const pending = tracker.start(DEFAULT_CAPTURE_PROFILE);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    tracker.stop();
    const { stream, track } = cameraStream();
    permission.resolve(stream);
    expect(await pending).toBe(false);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(callbacks.onStatus).toHaveBeenLastCalledWith("stopped", "Camera stopped");
    expect(callbacks.onStatus.mock.calls.some(([state]) => state === "running")).toBe(false);
  });

  it("shares one pending start instead of opening two streams", async () => {
    getUserMedia.mockResolvedValue(cameraStream().stream);
    const first = tracker.start(DEFAULT_CAPTURE_PROFILE);
    const second = tracker.start(DEFAULT_CAPTURE_PROFILE);
    expect(first).toBe(second);
    expect(await first).toBe(true);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("cancels pending worker initialization without falling back or requesting a camera", async () => {
    workerMode = "pending";
    const pending = tracker.start(DEFAULT_CAPTURE_PROFILE);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    tracker.stop();
    expect(await pending).toBe(false);
    expect(FakeWorker.instances[0]?.terminate).toHaveBeenCalledOnce();
    expect(vision.create).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("disposes a late main-thread backend after Close", async () => {
    workerMode = "fault";
    const initialization = deferred<{ close: () => void }>();
    const landmarker = { close: vi.fn() };
    vision.create.mockReturnValue(initialization.promise);
    const pending = tracker.start(DEFAULT_CAPTURE_PROFILE);
    await vi.waitFor(() => expect(vision.create).toHaveBeenCalledOnce());
    await tracker.close();
    initialization.resolve(landmarker);
    expect(await pending).toBe(false);
    expect(landmarker.close).toHaveBeenCalledOnce();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(callbacks.onStatus).toHaveBeenLastCalledWith("stopped", "Camera stopped");
  });

  it("ignores a stale permission rejection after a newer camera starts", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const stale = tracker.start(DEFAULT_CAPTURE_PROFILE);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    tracker.stop();
    const current = cameraStream();
    getUserMedia.mockResolvedValue(current.stream);
    expect(await tracker.start(DEFAULT_CAPTURE_PROFILE)).toBe(true);
    permission.reject(new Error("old request denied"));
    expect(await stale).toBe(false);
    expect(video.srcObject).toBe(current.stream);
    expect(current.track.stop).not.toHaveBeenCalled();
    expect(callbacks.onStatus.mock.lastCall?.[0]).toBe("running");
  });

  it("does not detach a newer stream when stale video playback rejects", async () => {
    const playback = deferred<void>();
    video.play.mockReturnValueOnce(playback.promise);
    getUserMedia.mockResolvedValueOnce(cameraStream().stream);
    const stale = tracker.start(DEFAULT_CAPTURE_PROFILE);
    await vi.waitFor(() => expect(video.play).toHaveBeenCalledOnce());
    tracker.stop();
    const current = cameraStream();
    getUserMedia.mockResolvedValueOnce(current.stream);
    expect(await tracker.start(DEFAULT_CAPTURE_PROFILE)).toBe(true);
    playback.reject(new Error("old play failed"));
    expect(await stale).toBe(false);
    expect(video.srcObject).toBe(current.stream);
    expect(current.track.stop).not.toHaveBeenCalled();
    expect(callbacks.onStatus.mock.lastCall?.[0]).toBe("running");
  });

  it("reports an active permission error and allows a successful retry", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("permission denied"));
    await expect(tracker.start(DEFAULT_CAPTURE_PROFILE)).rejects.toThrow("permission denied");
    expect(callbacks.onHealth.mock.lastCall?.[0].reason).toBe("camera-unavailable");
    getUserMedia.mockResolvedValueOnce(cameraStream().stream);
    expect(await tracker.start(DEFAULT_CAPTURE_PROFILE)).toBe(true);
  });

  it("preserves main-thread CPU fallback after worker and GPU failures", async () => {
    workerMode = "fault";
    vision.create.mockRejectedValueOnce(new Error("GPU unavailable"));
    vision.create.mockResolvedValueOnce({ close: vi.fn() });
    getUserMedia.mockResolvedValueOnce(cameraStream().stream);
    expect(await tracker.start(DEFAULT_CAPTURE_PROFILE)).toBe(true);
    expect(tracker.delegate).toBe("main / WASM CPU");
    expect(callbacks.onHealth.mock.lastCall?.[0].reason).toBe("fallback-backend");
  });

  it("ignores a frame callback left over from the previous run", async () => {
    getUserMedia.mockResolvedValue(cameraStream().stream);
    await tracker.start(DEFAULT_CAPTURE_PROFILE);
    const staleFrame = video.requestVideoFrameCallback.mock.calls[0]?.[0];
    tracker.stop();
    await tracker.start(DEFAULT_CAPTURE_PROFILE);
    const calls = video.requestVideoFrameCallback.mock.calls.length;
    staleFrame?.();
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(calls);
    expect(callbacks.onStatus.mock.lastCall?.[0]).toBe("running");
  });
});
