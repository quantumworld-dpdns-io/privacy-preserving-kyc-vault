"""PII detection and redaction using regex patterns and a NER model.

Detects and redacts personally identifiable information (PII) from text
extracted from KYC documents, including:
- Names (via NER)
- Email addresses
- Phone numbers
- Social security numbers / national IDs
- Dates of birth
- Addresses
- Credit card numbers
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from transformers import pipeline

logger = logging.getLogger(__name__)

NER_MODEL = "dslim/bert-base-NER"


@dataclass
class PIISpan:
    text: str
    label: str
    start: int
    end: int
    score: float = 1.0


@dataclass
class PIIResult:
    text: str
    redacted: str
    spans: list[PIISpan] = field(default_factory=list)
    pii_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "redacted": self.redacted,
            "spans": [
                {"text": s.text, "label": s.label, "start": s.start, "end": s.end, "score": s.score}
                for s in self.spans
            ],
            "pii_count": self.pii_count,
        }


# ---------------------------------------------------------------------------
# Regex patterns for structured PII
# ---------------------------------------------------------------------------

REGEX_PATTERNS: list[tuple[str, str]] = [
    ("EMAIL", r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    ("PHONE", r"\+?1?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
    ("SSN", r"\b\d{3}-\d{2}-\d{4}\b"),
    ("CREDIT_CARD", r"\b(?:\d[ -]*?){13,16}\b"),
    ("ZIP_CODE", r"\b\d{5}(?:-\d{4})?\b"),
    ("DOB", r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),
]


def _build_regex_patterns() -> list[tuple[str, re.Pattern[str]]]:
    """Compile all regex patterns once."""
    return [(label, re.compile(pat)) for label, pat in REGEX_PATTERNS]


_COMPILED_PATTERNS = _build_regex_patterns()

# ---------------------------------------------------------------------------
# Redaction mask
# ---------------------------------------------------------------------------


def _mask(text: str, label: str) -> str:
    if label in ("EMAIL", "PHONE", "SSN", "CREDIT_CARD"):
        return f"[{label}]"
    return "[REDACTED]"


# ---------------------------------------------------------------------------


class PIIDetector:
    """Detect PII spans using regex and a HuggingFace NER pipeline."""

    def __init__(self, ner_model_name: str = NER_MODEL) -> None:
        self.ner_model_name = ner_model_name
        self._ner: Any = None

    def _load_ner(self) -> None:
        if self._ner is not None:
            return
        try:
            logger.info("Loading NER pipeline: %s", self.ner_model_name)
            self._ner = pipeline(
                "token-classification",
                model=self.ner_model_name,
                aggregation_strategy="simple",
                device=-1,
            )
            logger.info("NER pipeline loaded")
        except Exception:
            logger.warning("NER model failed to load; falling back to regex only")
            self._ner = None

    @staticmethod
    def _detect_regex(text: str) -> list[PIISpan]:
        spans: list[PIISpan] = []
        seen: set[tuple[int, int]] = set()
        for label, pattern in _COMPILED_PATTERNS:
            for match in pattern.finditer(text):
                key = (match.start(), match.end())
                if key not in seen:
                    seen.add(key)
                    spans.append(
                        PIISpan(
                            text=match.group(),
                            label=label,
                            start=match.start(),
                            end=match.end(),
                        )
                    )
        spans.sort(key=lambda s: s.start)
        return spans

    def _detect_ner(self, text: str) -> list[PIISpan]:
        if self._ner is None:
            return []
        try:
            entities = self._ner(text)
            spans: list[PIISpan] = []
            for ent in entities:
                if ent["entity_group"] in ("PER", "LOC", "ORG"):
                    spans.append(
                        PIISpan(
                            text=ent["word"],
                            label=ent["entity_group"],
                            start=ent["start"],
                            end=ent["end"],
                            score=round(ent["score"], 4),
                        )
                    )
            return spans
        except Exception:
            logger.exception("NER detection failed")
            return []

    @staticmethod
    def _merge_spans(spans: list[PIISpan]) -> list[PIISpan]:
        if not spans:
            return []
        spans = sorted(spans, key=lambda s: s.start)
        merged: list[PIISpan] = [spans[0]]
        for span in spans[1:]:
            prev = merged[-1]
            if span.start <= prev.end:
                if span.end > prev.end:
                    merged[-1] = PIISpan(
                        text=prev.text + text[prev.end : span.end],
                        label=prev.label,
                        start=prev.start,
                        end=span.end,
                        score=max(prev.score, span.score),
                    )
                continue
            merged.append(span)
        return merged

    def detect(self, text: str) -> PIIResult:
        """Detect all PII spans in the given text."""
        regex_spans = self._detect_regex(text)
        ner_spans = self._detect_ner(text)
        all_spans = sorted(regex_spans + ner_spans, key=lambda s: s.start)
        merged = self._merge_spans(all_spans)
        return PIIResult(text=text, redacted=text, spans=merged, pii_count=len(merged))

    def redact(self, text: str) -> PIIResult:
        """Redact all detected PII spans, replacing them with masks."""
        result = self.detect(text)
        parts: list[str] = []
        cursor = 0
        for span in result.spans:
            if span.start > cursor:
                parts.append(text[cursor : span.start])
            parts.append(_mask(span.text, span.label))
            cursor = span.end
        if cursor < len(text):
            parts.append(text[cursor:])
        result.redacted = "".join(parts)
        return result


# Module-level convenience instance
_detector: PIIDetector | None = None


def get_detector() -> PIIDetector:
    global _detector
    if _detector is None:
        _detector = PIIDetector()
    return _detector


def redact_pii(text: str) -> str:
    return get_detector().redact(text).redacted
