"""Risk scoring model for KYC decisions.

Combines document trust, identity verification confidence, fraud signals,
and liveness results into a composite risk score. Outputs a decision
(approve / review / reject) based on configurable thresholds.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Decision(str, Enum):
    APPROVE = "approve"
    REVIEW = "review"
    REJECT = "reject"


@dataclass
class RiskInput:
    document_confidence: float = 0.0
    face_match_score: float = 0.0
    liveness_score: float = 0.0
    fraud_score: float = 0.0
    ocr_confidence: float = 0.0
    pii_consistency: float = 1.0
    document_type_trust: float = 0.8  # trustworthiness of doc type (passport=0.9, id=0.8, license=0.7)
    extra: dict[str, float] = field(default_factory=dict)


@dataclass
class RiskResult:
    score: float
    level: RiskLevel
    decision: Decision
    breakdown: dict[str, float] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "level": self.level.value,
            "decision": self.decision.value,
            "breakdown": self.breakdown,
            "reasons": self.reasons,
        }


class RiskScorer:
    """Composite risk scorer for KYC decisions.

    The final score is a weighted combination of sub-scores mapped to
    a 0-1 range where higher = more risky.
    """

    _DEFAULT_WEIGHTS = {
        "document_confidence": 0.15,
        "face_match": 0.25,
        "liveness": 0.20,
        "fraud": 0.20,
        "ocr_quality": 0.10,
        "pii_consistency": 0.10,
    }

    def __init__(
        self,
        weights: dict[str, float] | None = None,
        approve_threshold: float = 0.25,
        review_threshold: float = 0.55,
    ) -> None:
        self.weights = weights or dict(self._DEFAULT_WEIGHTS)
        self.approve_threshold = approve_threshold
        self.review_threshold = review_threshold

        total = sum(self.weights.values())
        if abs(total - 1.0) > 1e-4:
            self.weights = {k: v / total for k, v in self.weights.items()}

    def score(self, inp: RiskInput) -> RiskResult:
        """Compute the composite risk score and decision.

        Args:
            inp: Aggregated risk inputs from various detectors.

        Returns:
            RiskResult with score, level, decision, and breakdown.
        """
        breakdown = self._compute_breakdown(inp)
        raw = self._weighted_sum(breakdown)
        score = self._sigmoid_transform(raw)
        level = self._to_level(score)
        decision = self._to_decision(score)
        reasons = self._generate_reasons(inp, breakdown, level)

        return RiskResult(
            score=round(score, 4),
            level=level,
            decision=decision,
            breakdown={k: round(v, 4) for k, v in breakdown.items()},
            reasons=reasons,
        )

    def _compute_breakdown(self, inp: RiskInput) -> dict[str, float]:
        return {
            "document_confidence": 1.0 - inp.document_confidence,
            "face_match": 1.0 - inp.face_match_score,
            "liveness": 1.0 - inp.liveness_score,
            "fraud": inp.fraud_score,
            "ocr_quality": 1.0 - inp.ocr_confidence,
            "pii_consistency": 1.0 - max(0.0, min(inp.pii_consistency, 1.0)),
        }

    def _weighted_sum(self, breakdown: dict[str, float]) -> float:
        total = 0.0
        for key, weight in self.weights.items():
            total += weight * breakdown.get(key, 0.0)
        return total

    @staticmethod
    def _sigmoid_transform(raw: float, k: float = 6.0, x0: float = 0.5) -> float:
        """Map raw weighted sum through a sigmoid for sharper decision boundary."""
        return 1.0 / (1.0 + np.exp(-k * (raw - x0)))

    @staticmethod
    def _to_level(score: float) -> RiskLevel:
        if score < 0.25:
            return RiskLevel.LOW
        elif score < 0.50:
            return RiskLevel.MEDIUM
        elif score < 0.75:
            return RiskLevel.HIGH
        return RiskLevel.CRITICAL

    def _to_decision(self, score: float) -> Decision:
        if score <= self.approve_threshold:
            return Decision.APPROVE
        elif score <= self.review_threshold:
            return Decision.REVIEW
        return Decision.REJECT

    @staticmethod
    def _generate_reasons(
        inp: RiskInput, breakdown: dict[str, float], level: RiskLevel
    ) -> list[str]:
        reasons: list[str] = []
        if inp.document_confidence < 0.5:
            reasons.append("Low document classification confidence")
        if inp.face_match_score < 0.5:
            reasons.append("Face match score below threshold")
        if inp.liveness_score < 0.5:
            reasons.append("Liveness check inconclusive")
        if inp.fraud_score >= 0.5:
            reasons.append(f"Fraud score elevated ({inp.fraud_score:.2f})")
        if inp.ocr_confidence < 0.5:
            reasons.append("OCR quality insufficient")
        if inp.pii_consistency < 0.6:
            reasons.append("PII data inconsistency detected")
        if level == RiskLevel.CRITICAL:
            reasons.append("Overall risk is critical — manual review required")
        return reasons or ["No significant risk factors"]

    def score_batch(self, inputs: list[RiskInput]) -> list[RiskResult]:
        return [self.score(inp) for inp in inputs]


class CalibratedRiskScorer(RiskScorer):
    """Extends RiskScorer with Platt-calibrated probabilities.

    Applies temperature scaling to produce better-calibrated risk scores.
    """

    def __init__(
        self,
        temperature: float = 1.0,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.temperature = temperature

    def _sigmoid_transform(self, raw: float) -> float:
        scaled = raw / self.temperature
        return 1.0 / (1.0 + np.exp(-6.0 * (scaled - 0.5)))

    def calibrate(self, scores: list[float], labels: list[int]) -> float:
        """Simple binary-search temperature calibration.

        Args:
            scores: Risk scores before sigmoid (raw weighted sums).
            labels: Binary labels (0 = low risk, 1 = high risk).
        """
        from scipy.optimize import minimize_scalar

        def _bce(t: float) -> float:
            preds = np.array([1.0 / (1.0 + np.exp(-6.0 * (s / t - 0.5))) for s in scores])
            preds = np.clip(preds, 1e-7, 1 - 1e-7)
            y = np.array(labels)
            return float(-np.mean(y * np.log(preds) + (1 - y) * np.log(1 - preds)))

        result = minimize_scalar(_bce, bounds=(0.1, 10.0), method="bounded")
        if result.success:
            self.temperature = result.x
            logger.info("Calibrated temperature to %.4f", self.temperature)
        return self.temperature
