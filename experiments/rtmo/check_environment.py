from __future__ import annotations

import argparse
import importlib
import importlib.metadata


def check_environment(backend: str) -> str:
    providers = sorted(
        distribution.metadata["Name"].lower().replace("_", "-")
        for distribution in importlib.metadata.distributions()
        if distribution.metadata["Name"].lower().replace("_", "-").startswith("opencv-")
    )
    if providers != ["opencv-contrib-python"]:
        raise RuntimeError(f"Expected one cv2 owner (opencv-contrib-python), found {providers}")
    cv2 = importlib.import_module("cv2")
    for function in ("resize", "cvtColor", "copyMakeBorder", "warpAffine"):
        if not callable(getattr(cv2, function, None)):
            raise RuntimeError(f"OpenCV is missing {function}")
    importlib.import_module("rtmlib" if backend == "rtmo" else "mediapipe")
    return f"{backend}: cv2 {cv2.__version__}, sole owner opencv-contrib-python"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("backend", choices=["rtmo", "mediapipe"])
    print(check_environment(parser.parse_args().backend))
