from __future__ import annotations

import hashlib
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

from model_spec import (
    RTMO_ARCHIVE_BYTES,
    RTMO_ARCHIVE_MEMBER,
    RTMO_ARCHIVE_SHA256,
    RTMO_MODEL_BYTES,
    RTMO_MODEL_NAME,
    RTMO_MODEL_SHA256,
    RTMO_MODEL_URL,
)


def repository_root() -> Path:
    root = Path(__file__).resolve().parents[2]
    if not (root / "pnpm-workspace.yaml").is_file():
        raise RuntimeError("repository root marker is missing")
    return root


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_bytes(data: bytes, expected_bytes: int, expected_sha256: str, name: str) -> None:
    digest = sha256(data)
    if len(data) != expected_bytes or digest != expected_sha256:
        raise RuntimeError(
            f"{name} integrity mismatch: expected {expected_bytes}/{expected_sha256}, "
            f"received {len(data)}/{digest}"
        )


def download_bounded(url: str, maximum_bytes: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "VCG-Console RTMO evidence/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200:
            raise RuntimeError(f"model download returned HTTP {response.status}")
        declared_length = response.headers.get("Content-Length")
        if declared_length is not None and int(declared_length) != maximum_bytes:
            raise RuntimeError(f"model archive declared unexpected length {declared_length}")
        data = response.read(maximum_bytes + 1)
    if len(data) > maximum_bytes:
        raise RuntimeError("model archive exceeded its pinned byte bound")
    return data


def prepare() -> Path:
    root = repository_root()
    destination_directory = (root / "artifacts" / "rtmo" / "models").resolve()
    artifacts_root = (root / "artifacts").resolve()
    if destination_directory != artifacts_root and artifacts_root not in destination_directory.parents:
        raise RuntimeError("model destination escaped the ignored artifacts directory")
    destination_directory.mkdir(parents=True, exist_ok=True)
    destination = destination_directory / RTMO_MODEL_NAME

    if destination.is_file():
        model_bytes = destination.read_bytes()
        try:
            require_bytes(model_bytes, RTMO_MODEL_BYTES, RTMO_MODEL_SHA256, "existing RTMO model")
            print(destination.relative_to(root).as_posix())
            return destination
        except RuntimeError:
            destination.unlink()

    archive = download_bounded(RTMO_MODEL_URL, RTMO_ARCHIVE_BYTES)
    require_bytes(archive, RTMO_ARCHIVE_BYTES, RTMO_ARCHIVE_SHA256, "RTMO model archive")
    with zipfile.ZipFile(io.BytesIO(archive)) as model_zip:
        names = model_zip.namelist()
        if names.count(RTMO_ARCHIVE_MEMBER) != 1:
            raise RuntimeError("RTMO archive does not contain exactly one pinned model member")
        info = model_zip.getinfo(RTMO_ARCHIVE_MEMBER)
        if info.file_size != RTMO_MODEL_BYTES:
            raise RuntimeError("RTMO archive member has an unexpected expanded size")
        model_bytes = model_zip.read(info)
    require_bytes(model_bytes, RTMO_MODEL_BYTES, RTMO_MODEL_SHA256, "RTMO ONNX model")

    temporary = destination.with_suffix(".onnx.pending")
    temporary.write_bytes(model_bytes)
    temporary.replace(destination)
    print(destination.relative_to(root).as_posix())
    return destination


if __name__ == "__main__":
    try:
        prepare()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
