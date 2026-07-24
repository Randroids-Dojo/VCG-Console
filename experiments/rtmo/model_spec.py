from pathlib import Path

RTMO_MODEL_NAME = "rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.onnx"
RTMO_MODEL_URL = (
    "https://download.openmmlab.com/mmpose/v1/projects/rtmo/onnx_sdk/"
    "rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.zip"
)
RTMO_ARCHIVE_BYTES = 36_442_532
RTMO_ARCHIVE_SHA256 = "3da7ad88b209f9da8be87ba5c325610639af04de3b5c8a96649b98cd9e2848a2"
RTMO_ARCHIVE_MEMBER = "end2end.onnx"
RTMO_MODEL_BYTES = 39_617_685
RTMO_MODEL_SHA256 = "d0703d40d19f3921da51ae725402d5fdae4d2478c7442072d3101bd396f370d8"

MEDIAPIPE_MODEL_PATH = Path("apps/console-lab/public/models/pose_landmarker_lite.task")
MEDIAPIPE_MODEL_BYTES = 5_777_746
MEDIAPIPE_MODEL_SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"
