"""Liveness detection scoring from facial landmarks.

Uses facial landmark analysis to detect presentation attacks (spoofing)
by analysing eye blink patterns, head pose variations, and texture
consistency across video frames.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 68-point facial landmark indices (dlib / 300-W convention)
# ---------------------------------------------------------------------------
LEFT_EYE = list(range(42, 48))
RIGHT_EYE = list(range(36, 42))
LEFT_BROW = list(range(22, 27))
RIGHT_BROW = list(range(17, 22))
NOSE = list(range(27, 36))
JAW = list(range(0, 17))

MOUTH_OUTER = list(range(48, 60))
MOUTH_INNER = list(range(60, 68))

EYE_AR_THRESHOLD = 0.2
BLINK_FRAMES = 3


def eye_aspect_ratio(landmarks: np.ndarray, eye_idxs: list[int]) -> float:
    """Compute the eye aspect ratio (EAR) for a single eye.

    EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    """
    pts = landmarks[eye_idxs]
    a = np.linalg.norm(pts[1] - pts[5])
    b = np.linalg.norm(pts[2] - pts[4])
    c = np.linalg.norm(pts[0] - pts[3])
    return float((a + b) / (2.0 * c + 1e-6))


def mar(landmarks: np.ndarray) -> float:
    """Mouth aspect ratio — helps detect talking / expression changes."""
    pts = landmarks[MOUTH_OUTER]
    a = np.linalg.norm(pts[13] - pts[19])
    b = np.linalg.norm(pts[14] - pts[18])
    c = np.linalg.norm(pts[12] - pts[16])
    return float((a + b) / (2.0 * c + 1e-6))


def head_pose(landmarks: np.ndarray) -> tuple[float, float, float]:
    """Estimate rough head pose angles (yaw, pitch, roll) from landmarks.

    Returns (yaw, pitch, roll) in degrees using nasal bridge and chin.
    This is a simplified geometric approximation.
    """
    nose_tip = landmarks[30]
    chin = landmarks[8]
    left_eye_center = landmarks[36:42].mean(axis=0)
    right_eye_center = landmarks[42:48].mean(axis=0)
    eye_center = (left_eye_center + right_eye_center) / 2.0

    dx = nose_tip[0] - eye_center[0]
    dy = nose_tip[1] - eye_center[1]
    dz = nose_tip[1] - chin[1]

    yaw = math.degrees(math.atan2(dx, dz))
    pitch = math.degrees(math.atan2(dy, dz))
    roll = math.degrees(
        math.atan2(
            right_eye_center[1] - left_eye_center[1],
            right_eye_center[0] - left_eye_center[0],
        )
    )
    return yaw, pitch, roll


@dataclass
class LivenessResult:
    score: float
    is_live: bool
    blink_detected: bool
    pose_variance: float
    details: dict[str, Any] = field(default_factory=dict)


class LivenessDetector:
    """Detect liveness from a sequence of facial landmark frames."""

    def __init__(
        self,
        ear_threshold: float = EYE_AR_THRESHOLD,
        blink_frames: int = BLINK_FRAMES,
    ) -> None:
        self.ear_threshold = ear_threshold
        self.blink_frames = blink_frames

    def score_sequence(self, landmarks_seq: list[np.ndarray]) -> LivenessResult:
        """Score a time-series of facial landmarks for liveness.

        Args:
            landmarks_seq: List of (68, 2) landmark arrays, one per frame.

        Returns:
            LivenessResult with score and diagnostics.
        """
        if not landmarks_seq:
            return LivenessResult(
                score=0.0, is_live=False, blink_detected=False, pose_variance=0.0
            )

        ears: list[float] = []
        mars: list[float] = []
        yaws: list[float] = []
        pitches: list[float] = []
        rolls: list[float] = []
        blink_count = 0
        consecutive_low = 0

        for lm in landmarks_seq:
            left_ear = eye_aspect_ratio(lm, LEFT_EYE)
            right_ear = eye_aspect_ratio(lm, RIGHT_EYE)
            avg_ear = (left_ear + right_ear) / 2.0
            ears.append(avg_ear)

            if avg_ear < self.ear_threshold:
                consecutive_low += 1
            else:
                if consecutive_low >= self.blink_frames:
                    blink_count += 1
                consecutive_low = 0

            mars.append(mar(lm))
            y, p, r = head_pose(lm)
            yaws.append(y)
            pitches.append(p)
            rolls.append(r)

        n = len(landmarks_seq)
        blink_detected = blink_count > 0

        ear_mean = float(np.mean(ears))
        ear_std = float(np.std(ears))

        pose_var = float(np.std(yaws) + np.std(pitches) + np.std(rolls))

        motion_score = min(pose_var / 5.0, 1.0) if pose_var > 0.5 else 0.1
        blink_score = min(blink_count * 0.3, 0.6)
        ear_health = min(ear_mean / 0.3, 1.0)
        mar_std = float(np.std(mars))
        expression_score = min(mar_std * 3.0, 0.3)

        score = round(
            0.25 * motion_score + 0.35 * blink_score + 0.25 * ear_health + 0.15 * expression_score,
            4,
        )

        return LivenessResult(
            score=score,
            is_live=score >= 0.5,
            blink_detected=blink_detected,
            pose_variance=round(pose_var, 4),
            details={
                "frames": n,
                "ear_mean": ear_mean,
                "ear_std": ear_std,
                "blinks": blink_count,
                "pose_std": {"yaw": float(np.std(yaws)), "pitch": float(np.std(pitches)), "roll": float(np.std(rolls))},
                "motion_score": motion_score,
                "blink_score": blink_score,
                "ear_health": ear_health,
                "expression_score": expression_score,
            },
        )

    def score_single(self, landmarks: np.ndarray) -> LivenessResult:
        """Score a single frame (no temporal info — less reliable)."""
        left_ear = eye_aspect_ratio(landmarks, LEFT_EYE)
        right_ear = eye_aspect_ratio(landmarks, RIGHT_EYE)
        avg_ear = (left_ear + right_ear) / 2.0
        ear_score = min(avg_ear / 0.3, 1.0)

        yaw, pitch, roll = head_pose(landmarks)
        symmetry_score = 1.0 - min(abs(yaw) / 45.0, 1.0)

        score = round(0.5 * ear_score + 0.5 * symmetry_score, 4)
        return LivenessResult(
            score=score,
            is_live=score >= 0.5,
            blink_detected=False,
            pose_variance=0.0,
            details={
                "ear": avg_ear,
                "yaw": yaw,
                "pitch": pitch,
                "roll": roll,
                "ear_score": ear_score,
                "symmetry_score": symmetry_score,
            },
        )
