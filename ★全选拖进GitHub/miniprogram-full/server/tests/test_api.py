from __future__ import annotations

import json
import tempfile
import unittest
import uuid
from unittest.mock import patch

import cv2
import numpy as np
from pathlib import Path

from fastapi.testclient import TestClient

import app as app_module


class WubanApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        app_module.DATA_DIR = root / "data"
        app_module.DATA_DIR.mkdir(parents=True, exist_ok=True)
        app_module.UPLOAD_DIR = root / "uploads"
        app_module.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        app_module.RESULT_DIR = root / "results"
        app_module.RESULT_DIR.mkdir(parents=True, exist_ok=True)
        app_module.DB_PATH = app_module.DATA_DIR / "test.sqlite3"
        app_module.init_db()
        cls.client = TestClient(app_module.app)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_health_and_home(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["ok"])
        self.assertEqual(self.client.get("/").status_code, 200)

    def test_create_course_and_publish_only_after_teacher_review(self):
        response = self.client.post("/api/courses", json={"title": "测试现代舞课程", "dance_style": "现代舞"})
        self.assertEqual(response.status_code, 200)
        course_id = response.json()["course_id"]

        job_id = uuid.uuid4().hex
        source = app_module.UPLOAD_DIR / f"{job_id}.mp4"
        source.write_bytes(b"test video placeholder")
        result_dir = app_module.RESULT_DIR / job_id
        result_dir.mkdir()
        summary = {"duration_seconds": 20.0, "sampled_frames": 100, "detected_frames": 90, "detection_rate": 0.9}
        with app_module.db() as conn:
            conn.execute(
                "INSERT INTO jobs(job_id,role,course_id,filename,source_path,result_dir,bytes,status,progress,message,summary_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (job_id, "reference", course_id, "teacher.mp4", str(source), str(result_dir), 10, "succeeded", 100, "done", json.dumps(summary), app_module.utc_now(), app_module.utc_now()),
            )

        seg = self.client.post(f"/api/courses/{course_id}/segments", json={
            "reference_job_id": job_id, "title": "第一段", "start_ms": 0, "end_ms": 5000,
            "teacher_notes": "教师审核讲解内容"
        })
        self.assertEqual(seg.status_code, 200)
        segment_id = seg.json()["segment_id"]

        before = self.client.post(f"/api/courses/{course_id}/publish")
        self.assertEqual(before.status_code, 409)

        approve = self.client.patch(f"/api/courses/{course_id}/segments/{segment_id}", json={"approved": True})
        self.assertEqual(approve.status_code, 200)
        published = self.client.post(f"/api/courses/{course_id}/publish")
        self.assertEqual(published.status_code, 200)
        courses = self.client.get("/api/courses?published_only=true").json()["courses"]
        self.assertTrue(any(c["course_id"] == course_id for c in courses))


    def _make_test_video(self):
        video_path = Path(self.tmp.name) / "tiny_test.mp4"
        writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (160, 120))
        self.assertTrue(writer.isOpened(), "test video writer is unavailable")
        for i in range(30):
            frame = np.zeros((120, 160, 3), dtype=np.uint8)
            cv2.circle(frame, (40 + i, 60), 15, (255, 255, 255), -1)
            writer.write(frame)
        writer.release()
        return video_path.read_bytes()

    def test_reference_to_student_comparison_workflow_with_mock_pose_engine(self):
        course = self.client.post("/api/courses", json={"title": "视频闭环测试课程", "dance_style": "现代舞"}).json()
        course_id = course["course_id"]
        model_path = Path(self.tmp.name) / "dummy_pose.task"
        model_path.write_bytes(b"test-model-placeholder")
        video_bytes = self._make_test_video()

        def fake_analyze_video(video_path, output_dir, model_path, progress_callback=None, sample_fps=5.0):
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "pose_data.json").write_text(json.dumps({"frames": [], "summary": {"detection_rate": 0.9}}), encoding="utf-8")
            (output_dir / "skeleton_preview.mp4").write_bytes(b"mock-preview")
            (output_dir / "pose_poster.jpg").write_bytes(b"mock-jpg")
            (output_dir / "pose_contact_sheet.jpg").write_bytes(b"mock-contact-sheet")
            if progress_callback:
                progress_callback(95, "mock done")
            return {"duration_seconds": 3.0, "sampled_frames": 15, "detected_frames": 14, "detection_rate": 0.9333, "interpretation": "mock pose result"}

        with patch.object(app_module, "MODEL_PATH", model_path), patch.object(app_module, "analyze_video", side_effect=fake_analyze_video):
            ref = self.client.post(
                "/api/vision/analyze",
                data={"course_id": course_id, "consent_confirmed": "true"},
                files={"file": ("teacher.mp4", video_bytes, "video/mp4")},
            )
            self.assertEqual(ref.status_code, 200, ref.text)
            ref_job_id = ref.json()["job_id"]
            ref_job = self.client.get(f"/api/vision/jobs/{ref_job_id}").json()
            self.assertEqual(ref_job["status"], "succeeded")

            seg = self.client.post(f"/api/courses/{course_id}/segments", json={
                "reference_job_id": ref_job_id, "title": "第一段", "start_ms": 0, "end_ms": 2000,
                "teacher_notes": "测试教师讲解"
            })
            self.assertEqual(seg.status_code, 200, seg.text)
            segment_id = seg.json()["segment_id"]
            self.assertEqual(self.client.post(f"/api/courses/{course_id}/publish").status_code, 409)
            self.assertEqual(self.client.patch(f"/api/courses/{course_id}/segments/{segment_id}", json={"approved": True}).status_code, 200)
            self.assertEqual(self.client.post(f"/api/courses/{course_id}/publish").status_code, 200)

            practice = self.client.post(
                "/api/student/practices",
                data={"course_id": course_id, "segment_id": segment_id, "student_alias": "测试学员", "consent_confirmed": "true"},
                files={"file": ("practice.mp4", video_bytes, "video/mp4")},
            )
            self.assertEqual(practice.status_code, 200, practice.text)
            practice_job_id = practice.json()["job_id"]
            self.assertEqual(self.client.get(f"/api/vision/jobs/{practice_job_id}").json()["status"], "succeeded")
            comparison = self.client.post("/api/student/comparisons", json={
                "course_id": course_id, "segment_id": segment_id, "practice_job_id": practice_job_id
            })
            self.assertEqual(comparison.status_code, 200, comparison.text)
            self.assertEqual(comparison.json()["reference_job_id"], ref_job_id)
            self.assertEqual(comparison.json()["practice_job_id"], practice_job_id)
            self.assertIn("不输出动作总分", comparison.json()["note"])

    def test_static_private_files_not_exposed(self):
        for path in ["/.env", "/app.py", "/requirements.txt", "/data/sample_course.json"]:
            response = self.client.get(path)
            self.assertIn(response.status_code, (404, 405))

    def test_bad_job_id_rejected(self):
        response = self.client.get("/api/vision/jobs/../../etc/passwd")
        self.assertIn(response.status_code, (404, 405))


if __name__ == "__main__":
    unittest.main()
