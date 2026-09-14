from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np
import psutil

from model_spec import (
    MEDIAPIPE_MODEL_BYTES,
    MEDIAPIPE_MODEL_PATH,
    MEDIAPIPE_MODEL_SHA256,
    RTMO_MODEL_BYTES,
    RTMO_MODEL_NAME,
    RTMO_MODEL_SHA256,
)

WIDTH = 640
HEIGHT = 640
DEFAULT_WARMUP_ITERATIONS = 20
DEFAULT_MEASURED_ITERATIONS = 100


def repository_root() -> Path:
    root = Path(__file__).resolve().parents[2]
    if not (root / "pnpm-workspace.yaml").is_file():
        raise RuntimeError("repository root marker is missing")
    return root


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_model(path: Path, expected_bytes: int, expected_sha256: str, name: str) -> None:
    if not path.is_file():
        raise RuntimeError(f"{name} is missing: {path}")
    size = path.stat().st_size
    digest = file_sha256(path)
    if size != expected_bytes or digest != expected_sha256:
        raise RuntimeError(
            f"{name} integrity mismatch: expected {expected_bytes}/{expected_sha256}, "
            f"received {size}/{digest}"
        )


def synthetic_suite() -> list[tuple[str, np.ndarray]]:
    horizontal = np.linspace(0, 255, WIDTH, dtype=np.uint8)
    gradient = np.broadcast_to(horizontal[np.newaxis, :, np.newaxis], (HEIGHT, WIDTH, 3)).copy()
    random_channel = np.random.default_rng(0x564347).integers(
        0,
        256,
        (HEIGHT, WIDTH, 1),
        dtype=np.uint8,
    )
    random = np.broadcast_to(random_channel, (HEIGHT, WIDTH, 3)).copy()
    return [
        ("black", np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)),
        ("gray-114", np.full((HEIGHT, WIDTH, 3), 114, dtype=np.uint8)),
        ("horizontal-gradient", gradient),
        ("seeded-noise", random),
    ]


def suite_sha256(suite: list[tuple[str, np.ndarray]]) -> str:
    digest = hashlib.sha256()
    for name, image in suite:
        label = name.encode("utf-8")
        digest.update(len(label).to_bytes(4, "big"))
        digest.update(label)
        digest.update(np.asarray(image.shape, dtype=np.uint32).tobytes())
        digest.update(image.tobytes(order="C"))
    return digest.hexdigest()


def percentile(sorted_values: list[float], percent: float) -> float:
    if not sorted_values:
        raise RuntimeError("cannot summarize an empty latency series")
    position = (len(sorted_values) - 1) * percent
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    fraction = position - lower
    return sorted_values[lower] * (1 - fraction) + sorted_values[upper] * fraction


def milliseconds(value: float) -> float:
    return round(value * 1000, 3)


def current_rss() -> int:
    return psutil.Process().memory_info().rss


def process_peak_rss() -> int:
    info = psutil.Process().memory_info()
    return int(getattr(info, "peak_wset", info.rss))


def make_rtmo_runner(model_path: Path) -> tuple[Callable[[np.ndarray], int], dict[str, Any]]:
    from rtmlib import RTMO

    model = RTMO(
        str(model_path),
        model_input_size=(WIDTH, HEIGHT),
        score_thr=0.25,
        to_openpose=False,
        backend="onnxruntime",
        device="cpu",
    )
    providers = model.session.get_providers()
    if providers != ["CPUExecutionProvider"]:
        raise RuntimeError(f"RTMO must use only CPUExecutionProvider, received {providers}")

    def infer(image: np.ndarray) -> int:
        keypoints, scores = model(image)
        if len(keypoints) != len(scores):
            raise RuntimeError("RTMO returned mismatched people and score arrays")
        return sum(1 for person_scores in scores if np.any(np.asarray(person_scores) >= 0.25))

    return infer, {
        "name": "rtmo-s",
        "library": "rtmlib",
        "libraryVersion": importlib.metadata.version("rtmlib"),
        "runtime": "onnxruntime",
        "runtimeVersion": importlib.metadata.version("onnxruntime"),
        "provider": "CPUExecutionProvider",
        "inputColorOrder": "bgr-assumed-by-rtmlib",
        "modelRepositoryPath": f"artifacts/rtmo/models/{RTMO_MODEL_NAME}",
        "modelBytes": RTMO_MODEL_BYTES,
        "modelSha256": RTMO_MODEL_SHA256,
    }


def make_mediapipe_runner(model_path: Path) -> tuple[Callable[[np.ndarray], int], dict[str, Any]]:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision

    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(
            model_asset_path=str(model_path),
            delegate=BaseOptions.Delegate.CPU,
        ),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=4,
        output_segmentation_masks=False,
    )
    landmarker = vision.PoseLandmarker.create_from_options(options)

    def infer(image: np.ndarray) -> int:
        result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=image))
        return len(result.pose_landmarks)

    return infer, {
        "name": "mediapipe-pose-landmarker-lite",
        "library": "mediapipe",
        "libraryVersion": importlib.metadata.version("mediapipe"),
        "runtime": "mediapipe-tasks-cpu",
        "runtimeVersion": importlib.metadata.version("mediapipe"),
        "provider": "CPU",
        "inputColorOrder": "srgb",
        "modelRepositoryPath": MEDIAPIPE_MODEL_PATH.as_posix(),
        "modelBytes": MEDIAPIPE_MODEL_BYTES,
        "modelSha256": MEDIAPIPE_MODEL_SHA256,
    }


def bounded_output(root: Path, raw_output: str) -> Path:
    output = (root / raw_output).resolve() if not Path(raw_output).is_absolute() else Path(raw_output).resolve()
    evidence_root = (root / "benchmarks" / "pose-backends").resolve()
    if output.parent != evidence_root:
        raise RuntimeError("output must be a direct JSON child of benchmarks/pose-backends")
    if output.suffix.lower() != ".json":
        raise RuntimeError("output must use a .json extension")
    return output


def git_metadata(root: Path) -> tuple[str, bool]:
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return commit, status == ""


def benchmark(backend: str, output: Path, warmup_iterations: int, measured_iterations: int) -> None:
    root = repository_root()
    suite = synthetic_suite()
    implementation = Path(__file__).resolve()
    lock = implementation.parent / "uv.lock"
    source_commit, working_tree_clean = git_metadata(root)
    rss_before_load = current_rss()

    if backend == "rtmo":
        model_path = root / "artifacts" / "rtmo" / "models" / RTMO_MODEL_NAME
        require_model(model_path, RTMO_MODEL_BYTES, RTMO_MODEL_SHA256, "RTMO model")
        infer, backend_details = make_rtmo_runner(model_path)
    else:
        model_path = root / MEDIAPIPE_MODEL_PATH
        require_model(model_path, MEDIAPIPE_MODEL_BYTES, MEDIAPIPE_MODEL_SHA256, "MediaPipe model")
        infer, backend_details = make_mediapipe_runner(model_path)
    rss_after_load = current_rss()

    for iteration in range(warmup_iterations):
        infer(suite[iteration % len(suite)][1])

    latencies: list[float] = []
    detections_by_input = {name: 0 for name, _ in suite}
    maximum_detections = 0
    for iteration in range(measured_iterations):
        name, image = suite[iteration % len(suite)]
        started = time.perf_counter()
        detections = infer(image)
        elapsed = time.perf_counter() - started
        latencies.append(elapsed)
        detections_by_input[name] += detections
        maximum_detections = max(maximum_detections, detections)

    ordered = sorted(latencies)
    total_seconds = sum(latencies)
    report = {
        "format": "vcg-pose-backend-benchmark",
        "formatVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceCommit": source_commit,
        "workingTreeClean": working_tree_clean,
        "implementationSha256": file_sha256(implementation),
        "dependencyLockSha256": file_sha256(lock),
        "environment": {
            "platform": sys.platform,
            "architecture": platform.machine().lower(),
            "python": platform.python_version(),
            "logicalCpuCount": os.cpu_count(),
        },
        "backend": backend_details,
        "workload": {
            "motionApiSchemaVersion": "0.4.0",
            "width": WIDTH,
            "height": HEIGHT,
            "timer": "python-time.perf_counter",
            "latencyBoundary": "backend-call-only",
            "latencySummaryMethod": "linear-interpolation-r7",
            "inputs": [name for name, _ in suite],
            "suiteSha256": suite_sha256(suite),
            "warmupIterations": warmup_iterations,
            "measuredIterations": measured_iterations,
            "containsRawFrames": False,
            "inputClass": "deterministic-synthetic-negative-and-idle-compute-only",
        },
        "results": {
            "latencyMs": {
                "mean": milliseconds(total_seconds / len(latencies)),
                "p50": milliseconds(percentile(ordered, 0.50)),
                "p95": milliseconds(percentile(ordered, 0.95)),
                "p99": milliseconds(percentile(ordered, 0.99)),
                "worst": milliseconds(ordered[-1]),
            },
            "throughputFps": round(len(latencies) / total_seconds, 3),
            "detections": {
                "total": sum(detections_by_input.values()),
                "maximumPerFrame": maximum_detections,
                "byInput": detections_by_input,
            },
            "memoryBytes": {
                "rssBeforeLoad": rss_before_load,
                "rssAfterLoad": rss_after_load,
                "rssAtEnd": current_rss(),
                "processPeakWorkingSet": process_peak_rss(),
            },
        },
        "claimBoundary": (
            "Measures one process on deterministic 640x640 synthetic inputs using an explicit CPU provider. "
            "It does not measure pose accuracy, identity stability, live-camera latency, action quality, or target hardware."
        ),
        "limitations": [
            "The inputs contain no consented people and cannot measure landmark accuracy.",
            "The suite is synthetic and does not represent household lighting, clothing, occlusion, or motion.",
            "The benchmark uses sequential single-frame calls rather than a live capture pipeline.",
            "Reported latency starts immediately before backend inference and excludes camera exposure and capture.",
            "Candidate identities and cross-frame player stability are not exercised.",
            "Only this Windows x86 development host and CPU execution path are qualified.",
            "GPU execution is not qualified because the required local CUDA and cuDNN runtime was unavailable.",
            "Memory values describe the whole Python process and loaded dependencies, not model allocations alone.",
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".json.pending")
    temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(output.relative_to(root).as_posix())


def positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0 or parsed > 10_000:
        raise argparse.ArgumentTypeError("value must be between 1 and 10000")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", required=True, choices=["rtmo", "mediapipe"])
    parser.add_argument("--output", required=True)
    parser.add_argument("--warmup-iterations", type=positive_integer, default=DEFAULT_WARMUP_ITERATIONS)
    parser.add_argument("--measured-iterations", type=positive_integer, default=DEFAULT_MEASURED_ITERATIONS)
    arguments = parser.parse_args()
    benchmark(
        arguments.backend,
        bounded_output(repository_root(), arguments.output),
        arguments.warmup_iterations,
        arguments.measured_iterations,
    )


if __name__ == "__main__":
    main()
