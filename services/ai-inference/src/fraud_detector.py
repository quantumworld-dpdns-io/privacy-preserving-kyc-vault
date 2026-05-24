"""Fraud pattern detection on KYC submissions using ML.

Analyses KYC submission metadata, document properties, and user behaviour
signals to flag potentially fraudulent activity. Uses an Isolation Forest
for anomaly detection on numerical features plus rule-based heuristics.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)

_FRAUD_FEATURES = [
    "doc_resolution_mpx",
    "face_angle_variance",
    "ip_reputation_score",
    "account_age_days",
    "submissions_last_hour",
    "geo_velocity_kmh",
    "device_score",
    "pii_consistency",
]


@dataclass
class FraudFlag:
    rule: str
    severity: float  # 0.0 - 1.0
    detail: str

    def to_dict(self) -> dict[str, Any]:
        return {"rule": self.rule, "severity": self.severity, "detail": self.detail}


@dataclass
class FraudResult:
    score: float  # 0.0 (benign) - 1.0 (fraud)
    is_suspicious: bool
    flags: list[FraudFlag] = field(default_factory=list)
    anomaly_score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "is_suspicious": self.is_suspicious,
            "flags": [f.to_dict() for f in self.flags],
            "anomaly_score": self.anomaly_score,
        }


@dataclass
class KYCSubmission:
    user_id: str
    document_type: str
    submission_ts: str
    doc_resolution_mpx: float = 0.0
    face_angle_variance: float = 0.0
    ip_reputation_score: float = 1.0
    account_age_days: float = 365.0
    submissions_last_hour: int = 0
    geo_velocity_kmh: float = 0.0
    device_score: float = 1.0
    pii_consistency: float = 1.0
    extra: dict[str, Any] = field(default_factory=dict)


class FraudDetector:
    """Fraud detection using Isolation Forest anomaly detection + rule engine."""

    def __init__(self, contamination: float = 0.05, random_state: int = 42) -> None:
        self.contamination = contamination
        self._model = IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_estimators=100,
        )
        self._fitted = False
        self._feature_mean: np.ndarray | None = None
        self._feature_std: np.ndarray | None = None

    def _to_feature_vector(self, submission: KYCSubmission) -> np.ndarray:
        return np.array(
            [
                submission.doc_resolution_mpx,
                submission.face_angle_variance,
                submission.ip_reputation_score,
                submission.account_age_days,
                float(submission.submissions_last_hour),
                submission.geo_velocity_kmh,
                submission.device_score,
                submission.pii_consistency,
            ],
            dtype=np.float64,
        )

    def fit(self, submissions: list[KYCSubmission]) -> None:
        """Fit the isolation forest on a historical submission corpus."""
        if len(submissions) < 10:
            logger.warning("Too few samples (%d); using dummy fit", len(submissions))
            X = np.random.randn(100, len(_FRAUD_FEATURES))
        else:
            X = np.array([self._to_feature_vector(s) for s in submissions])

        self._feature_mean = X.mean(axis=0)
        self._feature_std = X.std(axis=0) + 1e-8

        X_norm = (X - self._feature_mean) / self._feature_std
        self._model.fit(X_norm)
        self._fitted = True
        logger.info("FraudDetector fitted on %d samples", len(submissions))

    def _rule_engine(self, submission: KYCSubmission) -> list[FraudFlag]:
        flags: list[FraudFlag] = []

        if submission.submissions_last_hour > 5:
            flags.append(
                FraudFlag(
                    rule="high_submission_rate",
                    severity=min(submission.submissions_last_hour / 20, 1.0),
                    detail=f"{submission.submissions_last_hour} submissions in the last hour",
                )
            )

        if submission.geo_velocity_kmh > 800:
            flags.append(
                FraudFlag(
                    rule="impossible_travel",
                    severity=min(submission.geo_velocity_kmh / 2000, 1.0),
                    detail=f"Geo velocity {submission.geo_velocity_kmh:.0f} km/h",
                )
            )

        if submission.ip_reputation_score < 0.3:
            flags.append(
                FraudFlag(
                    rule="low_ip_reputation",
                    severity=1.0 - submission.ip_reputation_score,
                    detail=f"IP reputation score {submission.ip_reputation_score}",
                )
            )

        if submission.account_age_days < 1:
            flags.append(
                FraudFlag(
                    rule="new_account",
                    severity=max(0.3, 1.0 - submission.account_age_days),
                    detail=f"Account age {submission.account_age_days:.2f} days",
                )
            )

        if submission.pii_consistency < 0.5:
            flags.append(
                FraudFlag(
                    rule="pii_inconsistency",
                    severity=1.0 - submission.pii_consistency,
                    detail=f"PII consistency {submission.pii_consistency}",
                )
            )

        if submission.device_score < 0.3:
            flags.append(
                FraudFlag(
                    rule="suspicious_device",
                    severity=1.0 - submission.device_score,
                    detail=f"Device score {submission.device_score}",
                )
            )

        if submission.doc_resolution_mpx < 0.3:
            flags.append(
                FraudFlag(
                    rule="low_resolution_document",
                    severity=max(0.2, 1.0 - submission.doc_resolution_mpx * 3),
                    detail=f"Document resolution {submission.doc_resolution_mpx:.2f} MPx",
                )
            )

        return flags

    @staticmethod
    def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
        return max(lo, min(hi, v))

    def predict(self, submission: KYCSubmission) -> FraudResult:
        """Score a single submission for fraud risk."""
        rule_flags = self._rule_engine(submission)
        rule_max_severity = max((f.severity for f in rule_flags), default=0.0)

        anomaly = 0.0
        if self._fitted:
            try:
                vec = self._to_feature_vector(submission)
                if self._feature_mean is not None and self._feature_std is not None:
                    vec_norm = (vec - self._feature_mean) / self._feature_std
                    score = self._model.score_samples(vec_norm.reshape(1, -1))[0]
                    anomaly = self._clamp(0.5 - score / 4.0)
            except Exception:
                logger.exception("Anomaly scoring failed")

        fraud_anomaly = 0.4 * anomaly
        fraud_rules = 0.6 * rule_max_severity
        score = self._clamp(fraud_anomaly + fraud_rules)

        return FraudResult(
            score=round(score, 4),
            is_suspicious=score >= 0.5,
            anomaly_score=round(anomaly, 4),
            flags=rule_flags,
        )

    def predict_batch(self, submissions: list[KYCSubmission]) -> list[FraudResult]:
        return [self.predict(s) for s in submissions]


class RuleBasedFraudDetector:
    """Lightweight rule-only detector that does not require model fitting."""

    def __init__(self, detector: FraudDetector | None = None) -> None:
        self._inner = detector or FraudDetector()

    def predict(self, submission: KYCSubmission) -> FraudResult:
        result = self._inner.predict(submission)
        result.anomaly_score = 0.0
        result.score = min(result.score, max((f.severity for f in result.flags), default=0.0))
        result.is_suspicious = result.score >= 0.5
        return result
