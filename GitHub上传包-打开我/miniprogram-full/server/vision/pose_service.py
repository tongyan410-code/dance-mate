from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

# MediaPipe Pose Landmarker has 33 landmarks. This curated list draws the
# major body structure for a readable teaching preview.
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10), (11, 12),
    (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (29, 31), (27, 31),
    (24, 26), (26, 28), (28, 30), (30, 32), (28, 32),
]


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _landmark_to_dict(lm: Any) -> dict[str, float | None]:
    return {
        "x": _safe_float(getattr(lm, "x", None)),
        "y": _safe_float(getattr(lm, "y", None)),
        "z": _safe_float(getattr(lm, "z", None)),
        "visibility": _safe_float(getattr(lm, "visibility", None)),
        "presence": _safe_float(getattr(lm, "presence", None)),
    }


def _draw_pose(frame: np.ndarray, landmarks: list[Any]) -> np.ndarray:
    height, width = frame.shape[:2]
    points: list[tuple[int, int] | None] = []
    for lm in landmarks:
        x, y = getattr(lm, "x", None), getattr(lm, "y", None)
        visibility = getattr(lm, "visibility", 1.0)
        if x is None or y is None or (visibility is not None and visibility < 0.35):
            points.append(None)
            continue
        px = max(0, min(width - 1, int(float(x) * width)))
        py = max(0, min(height - 1, int(float(y) * height)))
        points.append((px, py))

    for start, end in POSE_CONNECTIONS:
        if start < len(points) and end < len(points):
            a, b = points[start], points[end]
            if a is not None and b is not None:
                cv2.line(frame, a, b, (70, 205, 155), 3, cv2.LINE_AA)
    for point in points:
        if point is not None:
            cv2.circle(frame, point, 4, (40, 115, 235), -1, cv2.LINE_AA)
    return frame


def _contact_sheet(frames: list[tuple[int, np.ndarray]], output_path: Path) -> None:
    if not frames:
        return
    tile_w, tile_h, cols = 320, 200, 3
    rows = (len(frames) + cols - 1) // cols
    sheet = np.full((rows * tile_h, cols * tile_w, 3), 248, dtype=np.uint8)
    for i, (timestamp_ms, frame) in enumerate(frames):
        thumb = cv2.resize(frame, (tile_w, tile_h - 26), interpolation=cv2.INTER_AREA)
        x, y = (i % cols) * tile_w, (i // cols) * tile_h
        sheet[y:y + tile_h - 26, x:x + tile_w] = thumb
        cv2.putText(
            sheet, f"{timestamp_ms / 1000:.1f}s", (x + 9, y + tile_h - 7),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (55, 65, 70), 1, cv2.LINE_AA,
        )
    cv2.imwrite(str(output_path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])


def analyze_video(
    video_path: Path,
    output_dir: Path,
    model_path: Path,
    progress_callback: Callable[[int, str], None] | None = None,
    sample_fps: float = 5.0,
) -> dict[str, Any]:
    """Extract 33-point pose landmarks from a short video.

    MediaPipe is imported lazily so the rest of the V1.3 application can still
    start and serve its learning modules if the vision dependency is absent.
    """
    try:
        import mediapipe as mp
    except Exception as exc:  # pragma: no cover - depends on local installation
        raise RuntimeError(
            "未安装或无法加载MediaPipe。请使用Python 3.12运行，并执行start_windows.bat自动安装依赖。"
        ) from exc

    if not model_path.exists():
        raise FileNotFoundError(f"找不到姿态模型文件：{model_path}。请重新运行start_windows.bat。")
    if not video_path.exists():
        raise FileNotFoundError("上传的视频文件不存在。")

    output_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("无法解码该视频。建议转换为MP4（H.264）后重试。")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 0 or fps > 240:
        fps = 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration_seconds = (frame_count / fps) if frame_count > 0 else 0.0

    if width <= 0 or height <= 0:
        cap.release()
        raise RuntimeError("无法读取视频画面尺寸。")
    if duration_seconds and duration_seconds > 60:
        cap.release()
        raise RuntimeError("视频超过60秒，请剪辑为10—30秒后重试。")

    sample_step = max(1, int(round(fps / max(1.0, sample_fps))))
    output_fps = max(1.0, fps / sample_step)
    estimated_samples = max(1, int(np.ceil(frame_count / sample_step))) if frame_count > 0 else 12
    sheet_count = min(12, estimated_samples)
    sheet_indices = set(
        int(round(i * (estimated_samples - 1) / max(1, sheet_count - 1)))
        for i in range(sheet_count)
    )
    preview_path = output_dir / "skeleton_preview.mp4"
    writer = cv2.VideoWriter(
        str(preview_path), cv2.VideoWriter_fourcc(*"mp4v"), output_fps, (width, height)
    )
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("无法生成骨架预览视频。请检查磁盘空间或视频编码支持。")

    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    frames_data: list[dict[str, Any]] = []
    sheet_frames: list[tuple[int, np.ndarray]] = []
    sampled_count = detected_count = frame_index = 0
    last_timestamp_ms = -1
    poster_saved = False

    try:
        with PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_index % sample_step == 0:
                    timestamp_ms = max(last_timestamp_ms + 1, int(round(frame_index * 1000.0 / fps)))
                    last_timestamp_ms = timestamp_ms
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)
                    pose_landmarks = result.pose_landmarks[0] if result.pose_landmarks else None
                    world_landmarks = (
                        result.pose_world_landmarks[0]
                        if getattr(result, "pose_world_landmarks", None) else None
                    )
                    sampled_index = sampled_count
                    frames_data.append({
                        "timestamp_ms": timestamp_ms,
                        "pose_detected": pose_landmarks is not None,
                        "landmarks": [_landmark_to_dict(lm) for lm in pose_landmarks] if pose_landmarks else [],
                        "world_landmarks": [_landmark_to_dict(lm) for lm in world_landmarks] if world_landmarks else [],
                    })
                    sampled_count += 1
                    if pose_landmarks:
                        detected_count += 1
                        annotated = _draw_pose(frame.copy(), pose_landmarks)
                    else:
                        annotated = frame.copy()
                        cv2.putText(
                            annotated, "No clear full-body pose detected", (20, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (30, 30, 230), 2, cv2.LINE_AA,
                        )
                    writer.write(annotated)
                    if sampled_index in sheet_indices:
                        sheet_frames.append((timestamp_ms, annotated.copy()))
                    if not poster_saved:
                        cv2.imwrite(str(output_dir / "pose_poster.jpg"), annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
                        poster_saved = True

                frame_index += 1
                if progress_callback and frame_count > 0 and frame_index % max(1, int(fps)) == 0:
                    progress_callback(min(90, 10 + int(80 * frame_index / frame_count)), f"正在分析视频：{frame_index}/{frame_count}帧")
    finally:
        cap.release()
        writer.release()

    if sampled_count == 0:
        raise RuntimeError("没有从视频中读取到可分析的帧。")

    _contact_sheet(sheet_frames, output_dir / "pose_contact_sheet.jpg")
    detection_rate = detected_count / sampled_count
    interpretation = (
        "姿态关键点提取成功率较高，可进入教师人工审核。"
        if detection_rate >= 0.8
        else "部分画面未能稳定识别。请检查全身是否完整入镜、光线和遮挡，再尝试重拍。"
    )
    data = {
        "schema_version": "1.1",
        "engine": "MediaPipe Pose Landmarker",
        "landmark_count_per_person": 33,
        "source_video": video_path.name,
        "video": {
            "fps": fps, "frame_count": frame_count, "width": width,
            "height": height, "duration_seconds": round(duration_seconds, 3),
        },
        "sampling": {"sample_fps_target": sample_fps, "sample_step": sample_step, "sampled_frames": sampled_count},
        "summary": {
            "detected_frames": detected_count,
            "detection_rate": round(detection_rate, 4),
            "interpretation": interpretation,
        },
        "frames": frames_data,
        "limitations": [
            "关键点是算法估计，不是动作捕捉设备的精密测量。",
            "本版本只提取人体姿态，不自动理解舞蹈动作名称、风格或艺术表达。",
            "识别结果不构成专业动作评分、医疗建议或身体安全判断。",
            "教师必须审核动作片段和教学说明后，才能将其用于课程教学。",
            "拍摄角度、遮挡、镜像状态和个体差异会影响视频对照。",
        ],
    }
    with (output_dir / "pose_data.json").open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if progress_callback:
        progress_callback(95, "正在整理识别结果")

    return {
        "duration_seconds": round(duration_seconds, 2),
        "sampled_frames": sampled_count,
        "detected_frames": detected_count,
        "detection_rate": round(detection_rate, 4),
        "preview_file": "skeleton_preview.mp4",
        "poster_file": "pose_poster.jpg",
        "contact_sheet_file": "pose_contact_sheet.jpg",
        "data_file": "pose_data.json",
        "interpretation": interpretation,
        "note": "结果仅供教师审核和学习观察，不是舞姿评分。",
    }
